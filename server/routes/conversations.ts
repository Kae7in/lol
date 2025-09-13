import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { conversationService } from '../services/conversations.js';
import { messageService } from '../services/messages.js';

interface CreateConversationBody {
  projectId?: string;
  title?: string;
}

interface UpdateConversationBody {
  title?: string;
}

interface ListConversationsQuery {
  projectId?: string;
}

interface GetConversationParams {
  id: string;
}

interface GetMessagesParams {
  conversationId: string;
}

interface GetMessagesQuery {
  limit?: number;
  offset?: number;
}

interface CreateMessageBody {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  projectId?: string;
  toolName?: string;
  toolCall?: any;
  toolResult?: any;
  streamingStatus?: 'pending' | 'streaming' | 'complete' | 'error';
  metadata?: Record<string, any>;
}

interface UpdateMessageParams {
  id: string;
}

interface UpdateMessageBody {
  content?: string;
  streamingStatus?: 'pending' | 'streaming' | 'complete' | 'error';
  toolResult?: any;
  metadata?: Record<string, any>;
}

export default async function conversationsRoutes(fastify: FastifyInstance) {
  // List all conversations
  fastify.get<{ Querystring: ListConversationsQuery }>(
    '/api/conversations',
    async (request, reply) => {
      try {
        const { projectId } = request.query;
        const conversations = await conversationService.listConversations(projectId);
        return conversations;
      } catch (error) {
        console.error('Error listing conversations:', error);
        reply.status(500).send({ error: 'Failed to list conversations' });
      }
    }
  );

  // Get specific conversation with messages
  fastify.get<{ Params: GetConversationParams }>(
    '/api/conversations/:id',
    async (request, reply) => {
      try {
        const { id } = request.params;
        const conversation = await conversationService.getConversation(id);
        
        if (!conversation) {
          return reply.status(404).send({ error: 'Conversation not found' });
        }

        // Include first 100 messages with the conversation
        const messages = await messageService.getMessages(id);
        
        return {
          ...conversation,
          messages,
        };
      } catch (error) {
        console.error('Error getting conversation:', error);
        reply.status(500).send({ error: 'Failed to get conversation' });
      }
    }
  );

  // Create new conversation
  fastify.post<{ Body: CreateConversationBody }>(
    '/api/conversations',
    async (request, reply) => {
      try {
        const { projectId, title } = request.body;
        const conversation = await conversationService.createConversation(projectId, title);
        reply.status(201).send(conversation);
      } catch (error) {
        console.error('Error creating conversation:', error);
        reply.status(500).send({ error: 'Failed to create conversation' });
      }
    }
  );

  // Update conversation
  fastify.patch<{ Params: GetConversationParams; Body: UpdateConversationBody }>(
    '/api/conversations/:id',
    async (request, reply) => {
      try {
        const { id } = request.params;
        const { title } = request.body;
        
        const conversation = await conversationService.updateConversation(id, { title });
        
        if (!conversation) {
          return reply.status(404).send({ error: 'Conversation not found' });
        }

        return conversation;
      } catch (error) {
        console.error('Error updating conversation:', error);
        reply.status(500).send({ error: 'Failed to update conversation' });
      }
    }
  );

  // Delete conversation
  fastify.delete<{ Params: GetConversationParams }>(
    '/api/conversations/:id',
    async (request, reply) => {
      try {
        const { id } = request.params;
        const deleted = await conversationService.deleteConversation(id);
        
        if (!deleted) {
          return reply.status(404).send({ error: 'Conversation not found' });
        }

        reply.status(204).send();
      } catch (error) {
        console.error('Error deleting conversation:', error);
        reply.status(500).send({ error: 'Failed to delete conversation' });
      }
    }
  );

  // Get messages for conversation
  fastify.get<{ Params: GetMessagesParams; Querystring: GetMessagesQuery }>(
    '/api/conversations/:conversationId/messages',
    async (request, reply) => {
      try {
        const { conversationId } = request.params;
        const { limit = 100, offset = 0 } = request.query;
        
        const messages = await messageService.getMessages(
          conversationId,
          Number(limit),
          Number(offset)
        );
        
        return messages;
      } catch (error) {
        console.error('Error getting messages:', error);
        reply.status(500).send({ error: 'Failed to get messages' });
      }
    }
  );

  // Create new message
  fastify.post<{ Params: GetMessagesParams; Body: CreateMessageBody }>(
    '/api/conversations/:conversationId/messages',
    async (request, reply) => {
      try {
        const { conversationId } = request.params;
        const messageData = request.body;
        
        const message = await messageService.createMessage({
          ...messageData,
          conversationId,
        });
        
        reply.status(201).send(message);
      } catch (error) {
        console.error('Error creating message:', error);
        reply.status(500).send({ error: 'Failed to create message' });
      }
    }
  );

  // Update message (for streaming updates)
  fastify.patch<{ Params: UpdateMessageParams; Body: UpdateMessageBody }>(
    '/api/messages/:id',
    async (request, reply) => {
      try {
        const { id } = request.params;
        const updates = request.body;
        
        const message = await messageService.updateMessage(id, updates);
        
        if (!message) {
          return reply.status(404).send({ error: 'Message not found' });
        }

        return message;
      } catch (error) {
        console.error('Error updating message:', error);
        reply.status(500).send({ error: 'Failed to update message' });
      }
    }
  );

  // Append to streaming message
  fastify.post<{ Params: UpdateMessageParams; Body: { chunk: string } }>(
    '/api/messages/:id/stream',
    async (request, reply) => {
      try {
        const { id } = request.params;
        const { chunk } = request.body;
        
        const message = await messageService.streamingMessageUpdate(id, chunk);
        
        if (!message) {
          return reply.status(404).send({ error: 'Message not found' });
        }

        return message;
      } catch (error) {
        console.error('Error streaming message update:', error);
        reply.status(500).send({ error: 'Failed to update streaming message' });
      }
    }
  );

  // Complete streaming for a message
  fastify.post<{ Params: UpdateMessageParams; Body: { content?: string } }>(
    '/api/messages/:id/complete',
    async (request, reply) => {
      try {
        const { id } = request.params;
        const { content } = request.body;
        
        const message = await messageService.completeStreaming(id, content);
        
        if (!message) {
          return reply.status(404).send({ error: 'Message not found' });
        }

        return message;
      } catch (error) {
        console.error('Error completing message stream:', error);
        reply.status(500).send({ error: 'Failed to complete message stream' });
      }
    }
  );
}