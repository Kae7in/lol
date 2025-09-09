import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { FileEdit, FileEditDiff } from "../services/file-edit";
import { CodeValidator } from "../services/code-validator";
import { db } from "../../src/db";
import { projects } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import { compileProject } from "../lib/compile";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "",
});

const fileEdit = new FileEdit();
const codeValidator = new CodeValidator();

const IterateRequestSchema = z.object({
  projectId: z.string().uuid(),
  prompt: z.string().min(1).max(5000),
});


export const iterateRoutes: FastifyPluginAsync = async (server) => {
  server.post(
    "/fast",
    {
      schema: {
        tags: ["ai"],
        summary: "Fast iteration on existing project using AI",
        description: "Uses Claude for analysis and programmatic diff application. ~10x faster than full regeneration.",
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
              validation: {
                type: "object",
                properties: {
                  valid: { type: "boolean" },
                  errorCount: { type: "number" },
                  errors: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        file: { type: "string" },
                        line: { type: "number" },
                        column: { type: "number" },
                        message: { type: "string" },
                        type: { type: "string" }
                      }
                    }
                  }
                }
              }
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

        // Step 1: Claude analyzes all files and provides structured diffs
        const claudeStart = Date.now();
        const systemPrompt = `You are a code analyzer that provides PRECISE line-based edit operations. You will receive the full project code with line numbers and output structured diffs.

Output a JSON object with precise line-based edits:
{
  "diffs": [
    {
      "file": "filename",
      "operations": [
        {
          "type": "replace",
          "startLine": <1-based line number>,
          "endLine": <1-based line number>,
          "newContent": "exact code to replace with"
        },
        {
          "type": "insert",
          "afterLine": <1-based line number, 0 for beginning>,
          "newContent": "exact code to insert"
        },
        {
          "type": "delete",
          "startLine": <1-based line number>,
          "endLine": <1-based line number>
        }
      ]
    }
  ]
}

Rules:
1. Use 1-based line numbers (first line is line 1)
2. Apply operations in order from top to bottom
3. For multi-line content, use \n for line breaks
4. Preserve exact indentation
5. CRITICAL: Return ONLY the JSON object starting with { and ending with }, no explanatory text before or after
6. Sort operations by line number in descending order within each file
7. Do NOT include any text like "Looking at the code" or explanations - ONLY the JSON

Examples:

User: "Change button color to blue"
File has line 15: .button { background: red; }
Output: {"diffs":[{"file":"style.css","operations":[{"type":"replace","startLine":15,"endLine":15,"newContent":".button { background: blue; }"}]}]}

User: "Add a second blob"
File has lines 45-47 with blob creation
Output: {"diffs":[{"file":"script.js","operations":[{"type":"replace","startLine":45,"endLine":47,"newContent":"const blob1 = new Blob(mouseX, mouseY);\nconst blob2 = new Blob(mouseX + 100, mouseY);"},{"type":"insert","afterLine":52,"newContent":"blob2.update();\nblob2.draw();"}]}]}`;

        // Send all file contents to Claude for analysis with line numbers
        const fileContents = Object.entries(projectFiles)
          .map(([name, file]: [string, any]) => {
            const lines = file.content.split('\n');
            const numberedLines = lines.map((line: string, i: number) => `${i + 1}: ${line}`).join('\n');
            return `=== ${name} ===\n${numberedLines}`;
          })
          .join('\n\n');
        
        // Include previous validation errors if they exist
        const previousErrors = (existingProject.metadata as any)?.lastValidationErrors;
        const errorContext = previousErrors && previousErrors.length > 0
          ? `\n\nPREVIOUS SYNTAX/TYPE ERRORS TO FIX:\n${previousErrors.map((e: any) => 
              `${e.file}:${e.line}:${e.column} - ${e.type} error: ${e.message}`
            ).join('\n')}\n`
          : '';
        
        const userPrompt = `Current project files:
${fileContents}${errorContext}

User request: ${body.prompt}

Analyze the code and provide structured diffs with precise line numbers:`;

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

        // Parse structured diffs from Claude
        let diffs: FileEditDiff[];
        try {
          // Try to extract JSON from markdown code blocks if present
          const jsonMatch = content.text.match(/```(?:json)?\s*([\s\S]*?)```/);
          let jsonText = jsonMatch ? jsonMatch[1].trim() : content.text.trim();
          
          // If Claude included explanatory text, try to extract just the JSON
          if (!jsonText.startsWith('{') && !jsonText.startsWith('[')) {
            // Look for JSON object in the response
            const objectMatch = jsonText.match(/\{[\s\S]*"diffs"[\s\S]*\}/);
            if (objectMatch) {
              jsonText = objectMatch[0];
            }
          }
          
          // Parse the JSON response
          const response = JSON.parse(jsonText);
          
          if (!response.diffs || !Array.isArray(response.diffs)) {
            throw new Error("Expected a 'diffs' array in the response");
          }
          
          diffs = response.diffs;
          
          console.log(`[CLAUDE] Parsed ${diffs.length} file diffs:`);
          for (const diff of diffs) {
            console.log(`  - ${diff.file}: ${diff.operations.length} operations`);
            console.log(`    ${fileEdit.getEditSummary([diff])}`);
          }
        } catch (e) {
          console.error("Failed to parse Claude response:", content.text);
          throw new Error(`Failed to parse Claude diffs: ${e}`);
        }

        // Step 2: Apply programmatic diffs
        const diffStart = Date.now();
        // Deep copy the files object to avoid mutation issues
        const updatedFiles = JSON.parse(JSON.stringify(projectFiles));
        const editedFileNames: string[] = [];

        console.log(`[DIFFS] Processing ${diffs.length} file diffs`);

        // Apply diffs to each file
        for (const diff of diffs) {
          if (!projectFiles[diff.file]) {
            console.log(`Skipping ${diff.file} - not found`);
            continue;
          }

          const fileStart = Date.now();
          const originalContent = projectFiles[diff.file].content;
          
          console.log(`[DIFFS] ${diff.file}: Applying ${diff.operations.length} operations`);
          
          try {
            // Apply programmatic edits
            const modifiedContent = fileEdit.applyEdits(originalContent, diff.operations);
            // Ensure we maintain the file structure
            updatedFiles[diff.file] = {
              ...updatedFiles[diff.file],
              content: modifiedContent
            };
            editedFileNames.push(diff.file);
            console.log(`[PERF] Diff ${diff.file}: ${Date.now() - fileStart}ms`);
          } catch (error) {
            console.error(`Failed to apply diffs to ${diff.file}:`, error);
            throw new Error(`Failed to apply diffs to ${diff.file}: ${error}`);
          }
        }

        console.log(`[PERF] Total Diffs: ${Date.now() - diffStart}ms`);

        // Validate the updated files for syntax errors
        const validation = codeValidator.validateProject(updatedFiles);
        
        // Compile and save (even if there are errors, so user can see the result)
        const compiled = compileProject(updatedFiles);
        
        // Store validation errors in metadata for future context
        const updatedMetadata = {
          ...((existingProject.metadata as any) || {}),
          updated: new Date().toISOString(),
          lastValidationErrors: validation.errors,
          lastValidationTime: new Date().toISOString()
        };
        
        const updatedProject = await db
          .update(projects)
          .set({
            files: updatedFiles,
            compiled,
            compiledAt: new Date(),
            version: (existingProject.version || 0) + 1,
            metadata: updatedMetadata as any,
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
          validation: {
            valid: validation.valid,
            errors: validation.errors,
            errorCount: validation.errors.length
          }
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