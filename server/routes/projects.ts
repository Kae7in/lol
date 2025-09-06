import { FastifyPluginAsync } from 'fastify';
import { db } from '../../src/db';
import { projects } from '../../src/db/schema';
import { sql, eq } from 'drizzle-orm';
import { compileProject } from '../lib/compile';
import { z } from 'zod';

// Define schemas
const ProjectSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  files: z.record(z.object({
    content: z.string(),
    type: z.enum(['html', 'css', 'javascript']),
  })),
  compiled: z.string(),
  compiledAt: z.string().datetime().nullable(),
  compileError: z.string().nullable(),
  metadata: z.object({
    views: z.number().optional(),
    created: z.string().optional(),
    updated: z.string().optional(),
  }).optional(),
  version: z.number(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const CreateProjectSchema = z.object({
  title: z.string().min(1).max(255),
  files: z.record(z.object({
    content: z.string(),
    type: z.enum(['html', 'css', 'javascript']),
  })),
});

export const projectRoutes: FastifyPluginAsync = async (server) => {
  // Get random project
  server.get('/random', {
    schema: {
      tags: ['projects'],
      summary: 'Get a random project',
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            title: { type: 'string' },
            compiled: { type: 'string' },
            metadata: {
              type: 'object',
              properties: {
                views: { type: 'number' },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const randomProjects = await db
        .select()
        .from(projects)
        .orderBy(sql`RANDOM()`)
        .limit(1);

      if (randomProjects.length === 0) {
        return {
          id: 'default',
          title: 'Welcome to Lollipop',
          compiled: `
            <!DOCTYPE html>
            <html>
              <head>
                <style>
                  * { margin: 0; padding: 0; box-sizing: border-box; }
                  body {
                    height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                    overflow: hidden;
                  }
                  .container {
                    text-align: center;
                    animation: fadeIn 1s ease-in;
                  }
                  h1 {
                    font-size: 4rem;
                    margin-bottom: 1rem;
                    animation: pulse 2s infinite;
                  }
                  p {
                    font-size: 1.5rem;
                    opacity: 0.9;
                    margin-bottom: 2rem;
                  }
                  .hint {
                    font-size: 1.2rem;
                    opacity: 0.7;
                    animation: blink 1.5s infinite;
                  }
                  @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                  }
                  @keyframes pulse {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.05); }
                  }
                  @keyframes blink {
                    0%, 100% { opacity: 0.7; }
                    50% { opacity: 1; }
                  }
                </style>
              </head>
              <body>
                <div class="container">
                  <h1>🍭 Lollipop</h1>
                  <p>No projects yet!</p>
                  <div class="hint">Press spacebar to browse projects once they're created.</div>
                </div>
              </body>
            </html>
          `,
          metadata: { views: 0 }
        };
      }

      const project = randomProjects[0];

      // Increment view count - ensure we're only updating metadata
      const currentMetadata = project.metadata as any || {};
      await db
        .update(projects)
        .set({
          metadata: {
            ...currentMetadata,
            views: (currentMetadata.views || 0) + 1
          },
          updatedAt: new Date() // Explicitly set as Date object
        })
        .where(eq(projects.id, project.id));

      // Apply same serialization fix as GET /:id endpoint
      const filesData = project.files ? JSON.parse(JSON.stringify(project.files)) : {};
      const metadataData = project.metadata ? JSON.parse(JSON.stringify(project.metadata)) : {};
      
      return {
        id: project.id,
        title: project.title,
        files: filesData,
        compiled: project.compiled,
        compiledAt: project.compiledAt,
        compileError: project.compileError,
        metadata: {
          ...metadataData,
          views: (metadataData.views || 0) + 1
        },
        version: project.version,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt
      };
    } catch (error) {
      server.log.error(error);
      reply.code(500);
      return { error: 'Failed to fetch project' };
    }
  });

  // Get project by ID
  server.get<{ Params: { id: string } }>('/:id', {
    schema: {
      tags: ['projects'],
      summary: 'Get a project by ID',
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
        required: ['id'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            title: { type: 'string' },
            files: { type: 'object' },
            compiled: { type: 'string' },
            compiledAt: { type: 'string', format: 'date-time', nullable: true },
            compileError: { type: 'string', nullable: true },
            metadata: { type: 'object' },
            version: { type: 'number' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const projectList = await db
        .select()
        .from(projects)
        .where(eq(projects.id, request.params.id))
        .limit(1);

      if (projectList.length === 0) {
        reply.code(404);
        return { error: 'Project not found' };
      }

      const project = projectList[0];

      // Ensure files is properly serialized - JSONB needs explicit conversion
      // Force deep clone to ensure proper serialization
      const filesData = project.files ? JSON.parse(JSON.stringify(project.files)) : {};
      const metadataData = project.metadata ? JSON.parse(JSON.stringify(project.metadata)) : {};
      
      const response = {
        id: project.id,
        title: project.title,
        files: filesData,
        compiled: project.compiled,
        compiledAt: project.compiledAt,
        compileError: project.compileError,
        metadata: metadataData,
        version: project.version,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      };

      // Explicitly send as JSON
      reply.header('Content-Type', 'application/json');
      reply.send(JSON.stringify(response));
      return;
    } catch (error) {
      server.log.error(error);
      reply.code(500);
      return { error: 'Failed to fetch project' };
    }
  });

  // Create new project
  server.post('/', {
    schema: {
      tags: ['projects'],
      summary: 'Create a new project',
      body: {
        type: 'object',
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 255 },
          files: {
            type: 'object',
            additionalProperties: {
              type: 'object',
              properties: {
                content: { type: 'string' },
                type: { type: 'string', enum: ['html', 'css', 'javascript'] },
              },
              required: ['content', 'type'],
            },
          },
        },
        required: ['title', 'files'],
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            title: { type: 'string' },
            files: { type: 'object' },
            compiled: { type: 'string' },
            compiledAt: { type: 'string', format: 'date-time' },
            version: { type: 'number' },
          },
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const body = CreateProjectSchema.parse(request.body);
      
      // Compile the project
      const compiled = compileProject(body.files);
      
      const newProject = await db
        .insert(projects)
        .values({
          title: body.title,
          files: body.files,
          compiled,
          compiledAt: new Date(),
          metadata: {
            views: 0,
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
          },
        })
        .returning();

      reply.code(201);
      return newProject[0];
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.code(400);
        return { error: 'Invalid request body', details: error.errors };
      }
      server.log.error(error);
      reply.code(500);
      return { error: 'Failed to create project' };
    }
  });

  // Update project
  server.put<{ Params: { id: string } }>('/:id', {
    schema: {
      tags: ['projects'],
      summary: 'Update a project',
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
        required: ['id'],
      },
      body: {
        type: 'object',
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 255 },
          files: {
            type: 'object',
            additionalProperties: {
              type: 'object',
              properties: {
                content: { type: 'string' },
                type: { type: 'string', enum: ['html', 'css', 'javascript'] },
              },
              required: ['content', 'type'],
            },
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            title: { type: 'string' },
            files: { type: 'object' },
            compiled: { type: 'string' },
            compiledAt: { type: 'string', format: 'date-time' },
            version: { type: 'number' },
          },
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const body = request.body as any;
      
      // Check if project exists
      const existing = await db
        .select()
        .from(projects)
        .where(eq(projects.id, request.params.id))
        .limit(1);

      if (existing.length === 0) {
        reply.code(404);
        return { error: 'Project not found' };
      }

      // Compile if files are provided
      let updateData: any = {};
      if (body.files) {
        updateData.files = body.files;
        updateData.compiled = compileProject(body.files);
        updateData.compiledAt = new Date();
      }
      if (body.title) {
        updateData.title = body.title;
      }
      updateData.version = existing[0].version + 1;
      updateData.metadata = {
        ...existing[0].metadata,
        updated: new Date().toISOString(),
      };

      const updated = await db
        .update(projects)
        .set(updateData)
        .where(eq(projects.id, request.params.id))
        .returning();

      return updated[0];
    } catch (error) {
      server.log.error(error);
      reply.code(500);
      return { error: 'Failed to update project' };
    }
  });
};