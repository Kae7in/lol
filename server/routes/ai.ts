import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { compileProject } from "../lib/compile";
import { db } from "../../src/db";
import { projects } from "../../src/db/schema";
import { eq, sql } from "drizzle-orm";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "",
});

const GenerateRequestSchema = z.object({
  prompt: z.string().min(1).max(5000),
  style: z
    .enum(["game", "art", "animation", "interactive", "utility"])
    .optional(),
});

const IterateRequestSchema = z.object({
  projectId: z.string().uuid(),
  prompt: z.string().min(1).max(5000),
});

export const aiRoutes: FastifyPluginAsync = async (server) => {
  // Generate new project from prompt
  server.post(
    "/generate",
    {
      schema: {
        tags: ["ai"],
        summary: "Generate a new project from a prompt",
        body: {
          type: "object",
          properties: {
            prompt: { type: "string", minLength: 1, maxLength: 5000 },
            style: {
              type: "string",
              enum: ["game", "art", "animation", "interactive", "utility"],
              nullable: true,
            },
          },
          required: ["prompt"],
        },
        response: {
          200: {
            type: "object",
            properties: {
              id: { type: "string", format: "uuid" },
              title: { type: "string" },
              files: { type: "object" },
              compiled: { type: "string" },
            },
          },
          400: {
            type: "object",
            properties: {
              error: { type: "string" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const body = GenerateRequestSchema.parse(request.body);

        const systemPrompt = `You are an AI that generates creative web experiences using only HTML, CSS, and JavaScript.
Generate complete, self-contained projects that work in a single HTML file.
Make them visually interesting and interactive.
Focus on: ${body.style || "animations, games, generative art, interactive experiences"}

Return your response as a JSON object with this structure:
{
  "title": "Project Title",
  "files": {
    "index.html": {
      "content": "<!DOCTYPE html>...",
      "type": "html"
    },
    "style.css": {
      "content": "body { ... }",
      "type": "css"
    },
    "script.js": {
      "content": "console.log('...');",
      "type": "javascript"
    }
  }
}

The HTML should be minimal, with most styling in CSS and behavior in JavaScript.
Ensure the experience is fullscreen-friendly and works well with spacebar navigation.`;

        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 8192,
          temperature: 0.7,
          system: systemPrompt,
          messages: [
            {
              role: "user",
              content: body.prompt,
            },
          ],
        });

        // Parse the response
        const content = response.content[0];
        if (content.type !== "text") {
          throw new Error("Unexpected response format");
        }

        // Extract JSON from the response
        const jsonMatch = content.text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error("Could not parse AI response");
        }

        const projectData = JSON.parse(jsonMatch[0]);

        // Ensure files exist and have the correct structure
        if (!projectData.files || typeof projectData.files !== "object") {
          throw new Error("AI response missing files");
        }

        // Compile the project
        const compiled = compileProject(projectData.files);

        // Save to database
        const newProject = await db
          .insert(projects)
          .values({
            title: projectData.title,
            files: projectData.files,
            compiled,
            compiledAt: new Date(),
            metadata: {
              views: 0,
              created: new Date().toISOString(),
              updated: new Date().toISOString(),
              generatedBy: "ai",
              prompt: body.prompt,
            },
          })
          .returning();

        return {
          id: newProject[0].id,
          title: newProject[0].title,
          files: newProject[0].files as any,
          compiled: newProject[0].compiled,
        };
      } catch (error) {
        if (error instanceof z.ZodError) {
          reply.code(400);
          return { error: "Invalid request body", details: error.errors };
        }
        server.log.error(error);
        reply.code(500);
        return { error: "Failed to generate project" };
      }
    },
  );

  // Iterate on existing project
  server.post(
    "/iterate",
    {
      schema: {
        tags: ["ai"],
        summary: "Iterate on an existing project",
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
          404: {
            type: "object",
            properties: {
              error: { type: "string" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const body = IterateRequestSchema.parse(request.body);

        // Fetch existing project
        const existingProjects = await db
          .select()
          .from(projects)
          .where(eq(projects.id, body.projectId))
          .limit(1);

        if (existingProjects.length === 0) {
          reply.code(404);
          return { error: "Project not found" };
        }

        const existingProject = existingProjects[0];

        const systemPrompt = `You are an AI that iterates on existing web experiences.
You will receive the current files of a project and a request for changes.
Modify the existing code to fulfill the request while maintaining the project's core functionality.

Current project files will be provided, and you should return the updated files in the same format.
Return your response as a JSON object with this structure:
{
  "title": "Updated Project Title (or keep the same)",
  "files": {
    "index.html": {
      "content": "<!DOCTYPE html>...",
      "type": "html"
    },
    "style.css": {
      "content": "body { ... }",
      "type": "css"
    },
    "script.js": {
      "content": "console.log('...');",
      "type": "javascript"
    }
  }
}`;

        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 8192,
          temperature: 0.7,
          system: systemPrompt,
          messages: [
            {
              role: "user",
              content: `Current project files:\n${JSON.stringify(existingProject.files, null, 2)}\n\nRequested changes: ${body.prompt}`,
            },
          ],
        });

        // Parse the response
        const content = response.content[0];
        if (content.type !== "text") {
          throw new Error("Unexpected response format");
        }

        // Extract JSON from the response
        const jsonMatch = content.text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error("Could not parse AI response");
        }

        const projectData = JSON.parse(jsonMatch[0]);

        // Compile the updated project
        const compiled = compileProject(projectData.files);

        // Update in database
        const updatedProject = await db
          .update(projects)
          .set({
            title: projectData.title,
            files: projectData.files,
            compiled,
            compiledAt: new Date(),
            version: (existingProject.version || 0) + 1,
            metadata: {
              ...(existingProject.metadata || {}),
              updated: new Date().toISOString(),
              lastIterationPrompt: body.prompt,
            },
            updatedAt: new Date(), // Explicitly set updatedAt
          })
          .where(eq(projects.id, body.projectId))
          .returning();

        return {
          id: updatedProject[0].id,
          title: updatedProject[0].title,
          files: updatedProject[0].files,
          compiled: updatedProject[0].compiled,
          version: updatedProject[0].version,
        };
      } catch (error) {
        if (error instanceof z.ZodError) {
          reply.code(400);
          return { error: "Invalid request body", details: error.errors };
        }
        server.log.error(error);
        reply.code(500);
        return { error: "Failed to iterate on project" };
      }
    },
  );
};
