import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { ClaudeWorkspace } from "../services/claude-workspace";
import { db } from "../../src/db";
import { projects } from "../../src/db/schema";
import { eq, sql } from "drizzle-orm";
import { compileProject } from "../lib/compile";

const workspace = new ClaudeWorkspace();

const IterateRequestSchema = z.object({
  projectId: z.string().uuid(),
  prompt: z.string().min(1).max(5000),
});

export const iterateClaudeRoutes: FastifyPluginAsync = async (server) => {
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