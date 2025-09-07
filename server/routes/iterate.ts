import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { GroqService } from "../groq-service";
import { db } from "../../src/db";
import { projects } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import { compileProject } from "../lib/compile";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "",
});

const groqService = new GroqService();

const IterateRequestSchema = z.object({
  projectId: z.string().uuid(),
  prompt: z.string().min(1).max(5000),
});

interface EditInstruction {
  file: string;
  instruction: string;
}

export const iterateRoutes: FastifyPluginAsync = async (server) => {
  server.post(
    "/fast",
    {
      schema: {
        tags: ["ai"],
        summary: "Fast iteration on existing project using AI",
        description: "Uses Claude for analysis and Groq for execution. ~10x faster than full regeneration.",
        body: {
          type: "object",
          properties: {
            projectId: { type: "string", format: "uuid" },
            prompt: { type: "string", minLength: 1, maxLength: 5000 },
          },
          required: ["projectId", "prompt"],
        },
        response: {
          200: {
            type: "object",
            properties: {
              id: { type: "string", format: "uuid" },
              title: { type: "string" },
              files: { type: "object" },
              compiled: { type: "string" },
              version: { type: "number" },
              editedFiles: {
                type: "array",
                items: { type: "string" },
              },
              performanceMs: { type: "number" },
            },
          },
        },
      },
    },
    async (request) => {
      try {
        const startTime = Date.now();
        const body = IterateRequestSchema.parse(request.body);

        // Fetch existing project
        const existingProjects = await db
          .select()
          .from(projects)
          .where(eq(projects.id, body.projectId))
          .limit(1);

        if (existingProjects.length === 0) {
          return { error: "Project not found" };
        }

        const existingProject = existingProjects[0];
        const projectFiles = existingProject.files as Record<string, any>;

        // Step 1: Claude analyzes all files and provides specific edit instructions
        const claudeStart = Date.now();
        const systemPrompt = `You are a code analyzer that provides SPECIFIC edit instructions. You will receive the full project code and output precise changes.

Output JSON format:
[
  {
    "file": "filename.js",
    "instruction": "SPECIFIC code changes to make, including exact code snippets"
  }
]

Examples:

User: "Change button color to blue"
Current style.css has: .button { background: red; }
Output: [{"file": "style.css", "instruction": "Find '.button { background: red; }' and replace with '.button { background: blue; }'"}]

User: "Display two blobs instead of one"
Current script.js has: const blob = new Blob(mouseX, mouseY);
Output: [{"file": "script.js", "instruction": "Find 'const blob = new Blob(mouseX, mouseY);' and replace with 'const blob1 = new Blob(mouseX, mouseY);\\nconst blob2 = new Blob(mouseX + 100, mouseY);'. Also update any references from 'blob' to handle both 'blob1' and 'blob2'."}]

IMPORTANT: 
- Be SPECIFIC about what code to find and what to replace it with
- Include enough context for unique matching
- Return ONLY the JSON array, no other text
- Do NOT include markdown formatting or code blocks
- Start your response with [ and end with ]
- ONLY suggest changes to code that actually exists in the files
- If you cannot identify the specific issue, suggest adding debug logging instead of guessing`;

        // Send all file contents to Claude for analysis
        const fileContents = Object.entries(projectFiles)
          .map(([name, file]: [string, any]) => `=== ${name} ===\n${file.content}`)
          .join('\n\n');
        
        const userPrompt = `Current project files:
${fileContents}

User request: ${body.prompt}

Analyze the code and provide specific edit instructions:`;

        const claudeResponse = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 8192,  // Maximum allowed
          temperature: 0.3,
          system: systemPrompt,
          messages: [
            {
              role: "user",
              content: userPrompt,
            },
          ],
        });

        const content = claudeResponse.content[0];
        if (content.type !== "text") {
          throw new Error("Unexpected response format from Claude");
        }

        console.log(`[PERF] Claude analysis: ${Date.now() - claudeStart}ms`);
        console.log(`[CLAUDE] Response (${content.text.length} chars):`, content.text);

        // Parse edit instructions (handle markdown code blocks if Claude adds them)
        let editInstructions: EditInstruction[];
        try {
          // Try to extract JSON from markdown code blocks if present
          const jsonMatch = content.text.match(/```(?:json)?\s*([\s\S]*?)```/);
          const jsonText = jsonMatch ? jsonMatch[1].trim() : content.text.trim();
          
          // Try to find JSON array in the text
          const arrayMatch = jsonText.match(/\[\s*\{[\s\S]*?\}\s*\]/);
          const finalJson = arrayMatch ? arrayMatch[0] : jsonText;
          
          editInstructions = JSON.parse(finalJson);
          
          if (!Array.isArray(editInstructions)) {
            throw new Error("Expected an array of instructions");
          }
          
          console.log(`[CLAUDE] Parsed ${editInstructions.length} file edits:`);
          for (const edit of editInstructions) {
            console.log(`  - ${edit.file}: ${edit.instruction.substring(0, 100)}...`);
          }
        } catch (e) {
          console.error("Failed to parse Claude response:", content.text);
          throw new Error(`Failed to parse Claude instructions: ${e}`);
        }

        // Step 2: Consolidate edits by file and have Groq rewrite each file once
        const groqStart = Date.now();
        const updatedFiles = { ...projectFiles };
        const editedFileNames: string[] = [];

        // Group instructions by file
        const editsByFile = new Map<string, string[]>();
        for (const edit of editInstructions) {
          if (!editsByFile.has(edit.file)) {
            editsByFile.set(edit.file, []);
          }
          editsByFile.get(edit.file)!.push(edit.instruction);
        }

        console.log(`[GROQ] Processing ${editsByFile.size} files with edits`);

        // Process each file once with all its instructions
        for (const [filename, instructions] of editsByFile) {
          if (!projectFiles[filename]) {
            console.log(`Skipping ${filename} - not found`);
            continue;
          }

          const fileStart = Date.now();
          const originalContent = projectFiles[filename].content;
          
          // Combine all instructions for this file
          const combinedInstructions = instructions.join('\n\nAND ALSO:\n\n');
          console.log(`[GROQ] ${filename}: Applying ${instructions.length} edits`);
          
          // Groq rewrites with all instructions at once
          const rewrittenContent = await groqService.rewriteFile(
            combinedInstructions,
            originalContent,
            filename
          );

          updatedFiles[filename].content = rewrittenContent;
          editedFileNames.push(filename);
          console.log(`[PERF] Groq ${filename}: ${Date.now() - fileStart}ms`);
        }

        console.log(`[PERF] Total Groq: ${Date.now() - groqStart}ms`);

        // Compile and save
        const compiled = compileProject(updatedFiles);
        
        const updatedProject = await db
          .update(projects)
          .set({
            files: updatedFiles,
            compiled,
            compiledAt: new Date(),
            version: (existingProject.version || 0) + 1,
            metadata: {
              ...((existingProject.metadata as any) || {}),
              updated: new Date().toISOString(),
            } as any,
            updatedAt: new Date(),
          })
          .where(eq(projects.id, body.projectId))
          .returning();

        const totalTime = Date.now() - startTime;
        console.log(`[PERF] TOTAL: ${totalTime}ms`);

        return {
          id: updatedProject[0].id,
          title: updatedProject[0].title,
          files: updatedProject[0].files,
          compiled: updatedProject[0].compiled,
          version: updatedProject[0].version,
          editedFiles: editedFileNames,
          performanceMs: totalTime,
        };
      } catch (error) {
        if (error instanceof z.ZodError) {
          return { error: "Invalid request body", details: error.issues };
        }
        server.log.error(error);
        return { error: `Failed to process iteration: ${error}` };
      }
    }
  );
};