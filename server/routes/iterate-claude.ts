import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { ClaudeWorkspace } from "../services/claude-workspace";
import { db } from "../../src/db";
import { projects } from "../../src/db/schema";
import { eq, sql } from "drizzle-orm";
import { compileProject } from "../lib/compile";
import crypto from "crypto";

const workspace = new ClaudeWorkspace();

const IterateRequestSchema = z.object({
  projectId: z.string().uuid(),
  prompt: z.string().min(1).max(5000),
});

export const iterateClaudeRoutes: FastifyPluginAsync = async (server) => {
  // Streaming endpoint
  server.post(
    "/claude/stream",
    {
      schema: {
        tags: ["ai", "streaming"],
        summary: "Stream Claude Code generation steps",
        description: "Uses Server-Sent Events to stream real-time updates from Claude Code SDK",
        body: {
          type: "object",
          properties: {
            projectId: { type: "string", format: "uuid" },
            prompt: { type: "string", minLength: 1, maxLength: 5000 },
          },
          required: ["prompt"],
        },
      },
    },
    async (request, reply) => {
      const body = request.body as { projectId?: string; prompt: string };
      
      if (!body.prompt) {
        return reply.code(400).send({ error: 'Prompt is required' });
      }

      // Set headers for SSE
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'X-Accel-Buffering': 'no' // Disable nginx buffering
      });

      try {
        let existingFiles = {};
        let version = 1;
        let existingProject: any = null;

        // If projectId is provided, fetch existing project files
        if (body.projectId) {
          const [project] = await db
            .select()
            .from(projects)
            .where(eq(projects.id, body.projectId))
            .limit(1);
          
          if (project && project.files && typeof project.files === 'object') {
            existingFiles = project.files as Record<string, { content: string; type: string }>;
            version = (project.version || 1) + 1;
            existingProject = project;
          }
        }

        // Start streaming generation
        const streamGenerator = workspace.generateStream(body.prompt, existingFiles);
        
        // Set up heartbeat to keep connection alive
        const heartbeatInterval = setInterval(() => {
          reply.raw.write('event: heartbeat\ndata: {}\n\n');
        }, 30000);

        let finalFiles: Record<string, { content: string; type: string }> | null = null;

        try {
          // Stream messages to client
          for await (const message of streamGenerator) {
            // Store files if this is the complete message
            if (message.type === 'complete' && message.data.files) {
              finalFiles = message.data.files;
            }

            // Send message to client
            const sseMessage = `event: message\ndata: ${JSON.stringify(message)}\n\n`;
            reply.raw.write(sseMessage);
          }

          // After streaming is complete, save to database if we have files
          if (finalFiles) {
            const compiled = compileProject(finalFiles);
            const compiledAt = new Date();
            
            if (body.projectId) {
              // Update existing project
              const updateData = {
                files: finalFiles,
                compiled,
                compiledAt,
                compileError: null,
                version,
                metadata: { 
                  ...((existingProject?.metadata as any) || {}),
                  lastIteratedBy: 'claude-code-stream',
                  lastIterationPrompt: body.prompt
                },
                updatedAt: new Date()
              };
              
              const [updatedProject] = await db
                .update(projects)
                .set(updateData)
                .where(eq(projects.id, body.projectId))
                .returning();
              
              // Send final project update
              reply.raw.write(`event: project\ndata: ${JSON.stringify({ project: updatedProject })}\n\n`);
            } else {
              // Create new project
              const id = crypto.randomUUID();
              const title = body.prompt.slice(0, 100);
              
              const [newProject] = await db
                .insert(projects)
                .values({
                  id,
                  title,
                  files: finalFiles,
                  compiled,
                  compiledAt,
                  compileError: null,
                  version: 1,
                  metadata: {
                    createdBy: 'claude-code-stream',
                    creationPrompt: body.prompt
                  },
                  createdAt: new Date(),
                  updatedAt: new Date()
                })
                .returning();
              
              // Send final project creation
              reply.raw.write(`event: project\ndata: ${JSON.stringify({ project: newProject })}\n\n`);
            }
          }

          // Send done event
          reply.raw.write('event: done\ndata: {}\n\n');
        } finally {
          clearInterval(heartbeatInterval);
        }

        // End the response
        reply.raw.end();
      } catch (error: any) {
        console.error('Error in Claude stream:', error);
        
        // Send error event
        const errorMessage = `event: error\ndata: ${JSON.stringify({ 
          error: error.message || 'Failed to generate with Claude' 
        })}\n\n`;
        reply.raw.write(errorMessage);
        reply.raw.end();
      }
    }
  );

  // Existing non-streaming endpoint
  server.post(
    "/claude",
    {
      schema: {
        tags: ["ai"],
        summary: "Iterate on existing project using Claude Code",
        description: "Uses Claude Code SDK to regenerate the entire project with modifications",
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
            },
          },
        },
      },
    },
    async (request) => {
      try {
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
        
        // Pass just the user's prompt and existing files - the workspace will handle the context
        const files = await workspace.generate(body.prompt, projectFiles);
        
        // Compile the project
        const compiled = compileProject(files);
        
        // Build update data with proper types
        const updateData: any = {
          files,
          compiled,
          version: (existingProject.version || 1) + 1,
          metadata: { 
            ...((existingProject.metadata as any) || {}),
            lastIteratedBy: 'claude-code',
            lastIterationPrompt: body.prompt
          }
        };
        
        // Add compiledAt if we have compiled data
        if (compiled && compiled.length > 0) {
          updateData.compiledAt = new Date();
        }
        
        // Known Drizzle issue: https://github.com/drizzle-team/drizzle-orm/issues/1113
        // The $onUpdate with sql`now()` causes "value.toISOString is not a function"
        // Solution: Manually set updatedAt to avoid the $onUpdate trigger
        const updateWithTimestamp = {
          ...updateData,
          updatedAt: new Date()
        };
        
        let updatedProject: any;
        try {
          const [project] = await db
            .update(projects)
            .set(updateWithTimestamp)
            .where(eq(projects.id, body.projectId))
            .returning();
          updatedProject = project;
        } catch (updateError: any) {
          // Fallback to raw SQL if Drizzle update fails
          console.error('[iterate-claude] Update failed, using raw SQL fallback:', updateError.message);
          
          const result = await db.execute(
            sql`UPDATE projects 
             SET files = ${JSON.stringify(updateWithTimestamp.files)}::jsonb, 
                 compiled = ${updateWithTimestamp.compiled}, 
                 version = ${updateWithTimestamp.version}, 
                 metadata = ${JSON.stringify(updateWithTimestamp.metadata)}::jsonb,
                 compiled_at = ${updateWithTimestamp.compiledAt},
                 updated_at = NOW()
             WHERE id = ${body.projectId}::uuid
             RETURNING *`
          );
          
          if (!result.rows || result.rows.length === 0) {
            throw new Error('Failed to update project');
          }
          
          updatedProject = result.rows[0];
        }
        
        return {
          id: updatedProject.id,
          title: updatedProject.title,
          files: updatedProject.files,
          compiled: updatedProject.compiled,
          version: updatedProject.version || 1,
        };
      } catch (error: any) {
        request.log.error(error);
        return { error: error.message || "Failed to iterate on project" };
      }
    }
  );
};