import { db } from "../../src/db/index.js";
import { messages } from "../../src/db/schema.js";
import { eq, desc, and, sql } from "drizzle-orm";

export interface MessageInput {
  conversationId: string;
  projectId?: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolName?: string;
  toolCall?: any;
  toolResult?: any;
  streamingStatus?: 'pending' | 'streaming' | 'complete' | 'error';
  metadata?: Record<string, any>;
}

export interface MessageUpdate {
  content?: string;
  streamingStatus?: 'pending' | 'streaming' | 'complete' | 'error';
  toolResult?: any;
  metadata?: Record<string, any>;
}

export class MessageService {
  async createMessage(input: MessageInput) {
    const [message] = await db
      .insert(messages)
      .values({
        conversationId: input.conversationId,
        projectId: input.projectId,
        role: input.role,
        content: input.content,
        toolName: input.toolName,
        toolCall: input.toolCall,
        toolResult: input.toolResult,
        streamingStatus: input.streamingStatus,
        metadata: input.metadata,
      })
      .returning();
    return message;
  }

  async updateMessage(id: string, updates: MessageUpdate) {
    const [message] = await db
      .update(messages)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(messages.id, id))
      .returning();
    return message;
  }

  async getMessages(conversationId: string, limit = 100, offset = 0) {
    const results = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.createdAt)
      .limit(limit)
      .offset(offset);
    return results;
  }

  async getMessage(id: string) {
    const [message] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, id));
    return message;
  }

  async streamingMessageUpdate(id: string, chunk: string) {
    // Append chunk to existing content
    const [current] = await db
      .select({ content: messages.content })
      .from(messages)
      .where(eq(messages.id, id));
    
    if (!current) {
      throw new Error(`Message ${id} not found`);
    }

    const [updated] = await db
      .update(messages)
      .set({
        content: current.content + chunk,
        streamingStatus: 'streaming',
        updatedAt: new Date(),
      })
      .where(eq(messages.id, id))
      .returning();
    
    return updated;
  }

  async completeStreaming(id: string, finalContent?: string) {
    const updates: MessageUpdate = {
      streamingStatus: 'complete',
    };
    
    if (finalContent !== undefined) {
      updates.content = finalContent;
    }

    return await this.updateMessage(id, updates);
  }

  async markStreamingError(id: string, error?: string) {
    const updates: MessageUpdate = {
      streamingStatus: 'error',
    };
    
    if (error) {
      updates.metadata = { error };
    }

    return await this.updateMessage(id, updates);
  }

  async deleteMessage(id: string) {
    const [deleted] = await db
      .delete(messages)
      .where(eq(messages.id, id))
      .returning();
    return deleted;
  }

  async getMessagesWithStats(conversationId: string) {
    const results = await db
      .select({
        message: messages,
        tokenCount: sql<number>`COALESCE((${messages.metadata}->>'tokens')::int, 0)`,
      })
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.createdAt);
    
    return results;
  }
}

export const messageService = new MessageService();