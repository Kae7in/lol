import { FastifyPluginAsync } from "fastify";
import { ClaudeWorkspace } from "../services/claude-workspace";
import { compileProject } from "../lib/compile";
import { db } from "../../src/db";
import { projects } from "../../src/db/schema";

const workspace = new ClaudeWorkspace();

export const claudeRoutes: FastifyPluginAsync = async (server) => {
  server.post("/generate-claude", async (request, reply) => {
    const { prompt } = request.body as { prompt: string };
    
    const files = await workspace.generate(
      `Create a ${prompt}. Use HTML, CSS, and JavaScript.`
    );
    
    const compiled = compileProject(files);
    
    const [project] = await db
      .insert(projects)
      .values({
        title: `Generated: ${prompt.slice(0, 50)}`,
        files,
        compiled,
        compiledAt: new Date(),
        metadata: { generatedBy: 'claude-code' }
      })
      .returning();
    
    return {
      id: project.id,
      title: project.title,
      files: project.files,
      compiled: project.compiled
    };
  });
};