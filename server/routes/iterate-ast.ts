import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { astEditor, type ASTEdit } from "../services/ast-editor";
import { CodeValidator } from "../services/code-validator";
import { db } from "../../src/db";
import { projects } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import { compileProject } from "../lib/compile";
import fs from "fs/promises";
import path from "path";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "",
});

const codeValidator = new CodeValidator();

const IterateRequestSchema = z.object({
  projectId: z.string().uuid(),
  prompt: z.string().min(1).max(5000),
});

export const iterateASTRoutes: FastifyPluginAsync = async (server) => {
  server.post(
    "/ast",
    {
      schema: {
        tags: ["ai"],
        summary: "AST-based iteration on existing project using AI",
        description: "Uses Claude with AST transformations for more reliable code edits",
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

        const claudeStart = Date.now();
        const systemPrompt = `You are a code editor that outputs AST-based transformations for JavaScript/TypeScript files, and appropriate edit strategies for other file types.

IMPORTANT: When fixing syntax errors in JavaScript/TypeScript:
1. If the code has syntax errors, use simple text-based replacements
2. For missing braces/brackets, provide the complete corrected function/block
3. Use the "replace" action to replace entire malformed sections
4. For duplicated code blocks, use "delete" action with the duplicate pattern
5. Look for and remove any duplicated function definitions or code blocks

Instead of line numbers, describe SEMANTIC changes for JS/TS files:
- Identify code by its semantic meaning (function names, variable names, class names)
- Use descriptive targets like "function draw()", "class Blob", "const blob1"
- Output transformations that find and modify code regardless of location

Output format:
{
  "edits": [{
    "file": "filename.js",
    "type": "ast",  // or "diff" for text files, "line" for fallback
    "transformations": [
      {
        "action": "modify|add-after|add-before|rename|insert-in|delete|replace",
        "target": "semantic identifier or pattern",
        "value": "new value (for simple changes)",
        "code": "new code (for complex changes)",
        "position": "start|end (for insert-in)"
      }
    ]
  }]
}

For non-JS files (HTML, CSS, etc.), use diff-based edits:
{
  "edits": [{
    "file": "style.css",
    "type": "diff",
    "patches": [
      {
        "find": "exact text to find",
        "replace": "replacement text"
      }
    ]
  }]
}

Examples:

1. Fix syntax error (missing closing brace):
{
  "edits": [{
    "file": "script.js",
    "type": "ast",
    "transformations": [{
      "action": "replace",
      "target": "function updateColorSystem() {",
      "code": "function updateColorSystem() {\n    // Complete corrected function here\n    // ...\n}"
    }]
  }]
}

1b. Remove duplicated code blocks:
{
  "edits": [{
    "file": "script.js",
    "type": "ast",
    "transformations": [{
      "action": "delete",
      "target": "// Handle auto color change timer"
    }]
  }]
}

2. Change a property value (JS):
{
  "edits": [{
    "file": "config.js",
    "type": "ast",
    "transformations": [{
      "action": "modify",
      "target": "gameConfig.speed",
      "value": "10"
    }]
  }]
}

3. Add code after a declaration (JS):
{
  "edits": [{
    "file": "game.js",
    "type": "ast",
    "transformations": [{
      "action": "add-after",
      "target": "const player = new Player()",
      "code": "const enemy = new Enemy(100, 200)"
    }]
  }]
}

4. Modify CSS (non-JS):
{
  "edits": [{
    "file": "style.css",
    "type": "diff",
    "patches": [{
      "find": "background: red;",
      "replace": "background: blue;"
    }]
  }]
}

5. Insert into function body (JS):
{
  "edits": [{
    "file": "script.js",
    "type": "ast",
    "transformations": [{
      "action": "insert-in",
      "target": "function update()",
      "position": "end",
      "code": "console.log('Updated');"
    }]
  }]
}

6. Rename variable (JS):
{
  "edits": [{
    "file": "app.js",
    "type": "ast",
    "transformations": [{
      "action": "rename",
      "target": "oldVariableName",
      "value": "newVariableName"
    }]
  }]
}

IMPORTANT:
- Return ONLY the JSON object, no explanatory text
- Use AST transformations for JS/TS files when possible
- Use diff patches for text-based files (HTML, CSS)
- Fallback to line-based edits only if necessary`;

        const fileContents = Object.entries(projectFiles)
          .map(([name, file]: [string, any]) => {
            return `=== ${name} ===\n${file.content}`;
          })
          .join('\n\n');
        
        const previousErrors = (existingProject.metadata as any)?.lastValidationErrors;
        const errorContext = previousErrors && previousErrors.length > 0
          ? `\n\nPREVIOUS SYNTAX/TYPE ERRORS TO FIX:\n${previousErrors.map((e: any) => 
              `${e.file}:${e.line}:${e.column} - ${e.type} error: ${e.message}`
            ).join('\n')}\n`
          : '';
        
        const userPrompt = `Current project files:
${fileContents}${errorContext}

User request: ${body.prompt}

Analyze the code and provide AST-based transformations (or appropriate edit strategy for each file type):`;

        const claudeResponse = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 8192,
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
        console.log(`[CLAUDE] Response (${content.text.length} chars):`, content.text.substring(0, 500));

        let edits: ASTEdit[];
        try {
          const jsonMatch = content.text.match(/```(?:json)?\s*([\s\S]*?)```/);
          let jsonText = jsonMatch ? jsonMatch[1].trim() : content.text.trim();
          
          if (!jsonText.startsWith('{') && !jsonText.startsWith('[')) {
            const objectMatch = jsonText.match(/\{[\s\S]*"edits"[\s\S]*\}/);
            if (objectMatch) {
              jsonText = objectMatch[0];
            }
          }
          
          const response = JSON.parse(jsonText);
          
          if (!response.edits || !Array.isArray(response.edits)) {
            throw new Error("Expected an 'edits' array in the response");
          }
          
          edits = response.edits;
          
          console.log(`[CLAUDE] Parsed ${edits.length} file edits:`);
          for (const edit of edits) {
            console.log(`  - ${edit.file} (${edit.type}): ${
              edit.transformations ? `${edit.transformations.length} transformations` :
              edit.patches ? `${edit.patches.length} patches` :
              edit.operations ? `${edit.operations.length} operations` :
              'unknown format'
            }`);
          }
        } catch (e) {
          console.error("Failed to parse Claude response:", content.text);
          throw new Error(`Failed to parse Claude edits: ${e}`);
        }

        const diffStart = Date.now();
        const updatedFiles = JSON.parse(JSON.stringify(projectFiles));
        const editedFileNames: string[] = [];

        console.log(`[AST] Processing ${edits.length} file edits`);

        for (const edit of edits) {
          if (!projectFiles[edit.file]) {
            console.log(`Creating new file: ${edit.file}`);
            updatedFiles[edit.file] = {
              name: edit.file,
              content: ""
            };
          }

          const fileStart = Date.now();
          const originalContent = updatedFiles[edit.file].content;
          
          console.log(`[AST] ${edit.file}: Applying ${edit.type} edits`);
          
          try {
            const modifiedContent = await astEditor.applyEdits(
              originalContent, 
              edit.file, 
              [edit]
            );
            
            updatedFiles[edit.file] = {
              ...updatedFiles[edit.file],
              content: modifiedContent
            };
            editedFileNames.push(edit.file);
            console.log(`[PERF] Edit ${edit.file}: ${Date.now() - fileStart}ms`);
          } catch (error) {
            console.error(`Failed to apply edits to ${edit.file}:`, error);
            
            if (edit.operations) {
              console.log(`Attempting fallback to line-based editing for ${edit.file}`);
              const fallbackEdit = { ...edit, type: 'line' as const };
              try {
                const modifiedContent = await astEditor.applyEdits(
                  originalContent,
                  edit.file,
                  [fallbackEdit]
                );
                updatedFiles[edit.file] = {
                  ...updatedFiles[edit.file],
                  content: modifiedContent
                };
                editedFileNames.push(edit.file);
                console.log(`Fallback successful for ${edit.file}`);
              } catch (fallbackError) {
                throw new Error(`Failed to apply edits to ${edit.file}: ${error}`);
              }
            } else {
              throw error;
            }
          }
        }

        console.log(`[PERF] Total Edits: ${Date.now() - diffStart}ms`);

        const validation = codeValidator.validateProject(updatedFiles);
        const compiled = compileProject(updatedFiles);
        
        const updatedMetadata = {
          ...((existingProject.metadata as any) || {}),
          updated: new Date().toISOString(),
          lastValidationErrors: validation.errors,
          lastValidationTime: new Date().toISOString(),
          editStrategy: 'ast'
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