import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { ClaudeWorkspace } from "../services/claude-workspace";
import { db } from "../../src/db";
import { projects } from "../../src/db/schema";
import { eq, sql } from "drizzle-orm";
import { compileProject } from "../lib/compile";
import crypto from "crypto";
import { conversationService } from "../services/conversations";
import { messageService } from "../services/messages";

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
            conversationId: { type: "string", format: "uuid", description: "Optional existing conversation ID" },
          },
          required: ["prompt"],
        },
      },
    },
    async (request, reply) => {
      const body = request.body as { projectId?: string; prompt: string; conversationId?: string };
      
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

      let conversation: any = null;
      let assistantMessage: any = null;
      let currentAssistantMessage: any = null;

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

        // Create or get conversation
        conversation = await conversationService.getOrCreateConversation(
          body.projectId,
          body.conversationId
        );

        // Save user message immediately
        const userMessage = await messageService.createMessage({
          conversationId: conversation.id,
          projectId: body.projectId,
          role: 'user',
          content: body.prompt,
          streamingStatus: 'complete',
          metadata: { timestamp: new Date().toISOString(), sequence: 0 }
        });

        // Send user message ID to client
        reply.raw.write(`event: userMessage\ndata: ${JSON.stringify({ messageId: userMessage.id })}\n\n`);

        // Create assistant message placeholder with pending status
        // We'll update this with actual content during streaming
        assistantMessage = await messageService.createMessage({
          conversationId: conversation.id,
          projectId: body.projectId,
          role: 'assistant',
          content: '',
          streamingStatus: 'pending',
          metadata: { model: 'claude-code', sequence: 1 }
        });
        
        // Set currentAssistantMessage to track the active assistant message
        currentAssistantMessage = assistantMessage;

        // Send assistant message ID to client
        reply.raw.write(`event: assistantMessage\ndata: ${JSON.stringify({ messageId: assistantMessage.id })}\n\n`);

        // Start streaming generation
        const streamGenerator = workspace.generateStream(body.prompt, existingFiles);
        
        // Set up heartbeat to keep connection alive
        const heartbeatInterval = setInterval(() => {
          reply.raw.write('event: heartbeat\ndata: {}\n\n');
        }, 30000);

        let finalFiles: Record<string, { content: string; type: string }> | null = null;
        let currentAssistantContent = '';
        let toolMessages: any[] = [];
        let allAssistantMessages: any[] = [assistantMessage];
        let messageSequence = 2; // Start at 2 since user=0, first assistant=1

        try {
          // Update assistant message to streaming status
          await messageService.updateMessage(currentAssistantMessage.id, {
            streamingStatus: 'streaming'
          });

          // Stream messages to client
          for await (const message of streamGenerator) {
            // Handle different message types for persistence with error recovery
            if (message.type === 'assistant') {
              // Check if we need to create a new assistant message (after tool calls)
              if (!currentAssistantMessage) {
                // Small delay to ensure different timestamps
                await new Promise(resolve => setTimeout(resolve, 10));
                
                currentAssistantMessage = await messageService.createMessage({
                  conversationId: conversation.id,
                  projectId: body.projectId,
                  role: 'assistant',
                  content: '',
                  streamingStatus: 'pending',
                  metadata: { model: 'claude-code', sequence: messageSequence++ }
                });
                allAssistantMessages.push(currentAssistantMessage);
                currentAssistantContent = '';
              }
              
              // Accumulate assistant content for current message
              currentAssistantContent += message.data.content || '';
              
              // Update current assistant message with accumulated content
              try {
                await messageService.updateMessage(currentAssistantMessage.id, {
                  content: currentAssistantContent,
                  streamingStatus: 'streaming'
                });
              } catch (dbError) {
                console.error('Failed to update assistant message:', dbError);
                // Continue streaming even if DB update fails
              }
            } else if (message.type === 'tool_use') {
              // If we have accumulated assistant content, finalize the current assistant message
              if (currentAssistantContent) {
                try {
                  await messageService.updateMessage(currentAssistantMessage.id, {
                    content: currentAssistantContent,
                    streamingStatus: 'complete'
                  });
                } catch (dbError) {
                  console.error('Failed to finalize assistant message:', dbError);
                }
                
                // Reset for potential new assistant message later
                currentAssistantContent = '';
                currentAssistantMessage = null; // We'll create a new one when assistant content resumes
              }
              
              // Small delay to ensure different timestamps
              await new Promise(resolve => setTimeout(resolve, 10));
              
              // Save tool call as a separate message with next sequence number
              try {
                const toolMessage = await messageService.createMessage({
                  conversationId: conversation.id,
                  projectId: body.projectId,
                  role: 'tool',
                  content: message.data.toolInput?.prompt || JSON.stringify(message.data.toolInput || {}),
                  toolName: message.data.tool,
                  toolCall: message.data.toolInput,
                  streamingStatus: 'complete',
                  metadata: { sequence: messageSequence++ }
                });
                toolMessages.push(toolMessage);
                
                // Add tool message ID to the SSE event
                message.data.messageId = toolMessage.id;
              } catch (dbError) {
                console.error('Failed to save tool message:', dbError);
                // Continue without message ID
              }
            } else if (message.type === 'tool_result') {
              // Tool results are not persisted separately since we don't have reliable IDs to match them
              // The tool_use messages contain the important information about what was done
            } else if (message.type === 'complete' && message.data.files) {
              // Store files for later
              finalFiles = message.data.files;
            } else if (message.type === 'error') {
              // Mark assistant message as error
              try {
                await messageService.markStreamingError(assistantMessage.id, message.data.error);
              } catch (dbError) {
                console.error('Failed to mark message error:', dbError);
              }
            }

            // Send message to client with message IDs
            const enrichedMessage = {
              ...message,
              messageId: message.type === 'assistant' ? currentAssistantMessage?.id : undefined,
              conversationId: conversation.id
            };
            const sseMessage = `event: message\ndata: ${JSON.stringify(enrichedMessage)}\n\n`;
            reply.raw.write(sseMessage);
          }

          // Mark current assistant message as complete if it exists
          // Keep empty assistant messages to maintain consistency with streaming display
          if (currentAssistantMessage) {
            await messageService.completeStreaming(currentAssistantMessage.id, currentAssistantContent || '');
          }

          // Update conversation title if this is the first message
          if (!body.conversationId && conversation.id && !conversation.title) {
            try {
              const title = body.prompt.slice(0, 100);
              await conversationService.updateConversation(conversation.id, { title });
            } catch (dbError) {
              console.error('Failed to update conversation title:', dbError);
            }
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
        
        // Try to mark current assistant message as error if it exists
        if (currentAssistantMessage?.id) {
          try {
            await messageService.markStreamingError(currentAssistantMessage.id, error.message);
          } catch (dbError) {
            console.error('Failed to update message error status:', dbError);
          }
        }
        
        // Send error event
        const errorMessage = `event: error\ndata: ${JSON.stringify({ 
          error: error.message || 'Failed to generate with Claude',
          conversationId: conversation?.id,
          messageId: currentAssistantMessage?.id
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