import { db } from "../../src/db/index.js";
import { conversations, messages } from "../../src/db/schema.js";
import { eq, desc, and } from "drizzle-orm";

export class ConversationService {
  async createConversation(projectId?: string, title?: string) {
    const [conversation] = await db
      .insert(conversations)
      .values({
        projectId,
        title,
      })
      .returning();
    return conversation;
  }

  async getConversation(id: string) {
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id));
    return conversation;
  }

  async listConversations(projectId?: string) {
    const conditions = projectId ? eq(conversations.projectId, projectId) : undefined;
    
    const results = await db
      .select()
      .from(conversations)
      .where(conditions)
      .orderBy(desc(conversations.createdAt));
      
    return results;
  }

  async updateConversation(id: string, updates: { title?: string }) {
    const [conversation] = await db
      .update(conversations)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, id))
      .returning();
    return conversation;
  }

  async deleteConversation(id: string) {
    // First delete all messages in the conversation
    await db.delete(messages).where(eq(messages.conversationId, id));
    
    // Then delete the conversation
    const [deleted] = await db
      .delete(conversations)
      .where(eq(conversations.id, id))
      .returning();
    return deleted;
  }

  async getOrCreateConversation(projectId?: string, conversationId?: string) {
    if (conversationId) {
      const existing = await this.getConversation(conversationId);
      if (existing) return existing;
    }
    
    return await this.createConversation(projectId);
  }
}

export const conversationService = new ConversationService();