import { pgTable, uuid, varchar, text, timestamp, jsonb, integer, pgEnum } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const messageRoleEnum = pgEnum('message_role', ['user', 'assistant', 'system', 'tool']);
export const streamingStatusEnum = pgEnum('streaming_status', ['pending', 'streaming', 'complete', 'error']);

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').references(() => projects.id),
  title: varchar('title', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull().$onUpdate(() => sql`now()`),
});

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').references(() => conversations.id).notNull(),
  projectId: uuid('project_id').references(() => projects.id),
  role: messageRoleEnum('role').notNull(),
  content: text('content').notNull(),
  toolName: varchar('tool_name', { length: 255 }),
  toolCall: jsonb('tool_call'),
  toolResult: jsonb('tool_result'),
  streamingStatus: streamingStatusEnum('streaming_status').default('complete'),
  metadata: jsonb('metadata').$type<{
    tokens?: number;
    model?: string;
    [key: string]: any;
  }>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull().$onUpdate(() => sql`now()`),
});

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 255 }).notNull(),
  files: jsonb('files').notNull().$type<{
    [filename: string]: {
      content: string;
      type: 'html' | 'css' | 'javascript';
    };
  }>(),
  compiled: text('compiled').notNull(),
  compiledAt: timestamp('compiled_at'),
  compileError: text('compile_error'),
  metadata: jsonb('metadata').$type<{
    views?: number;
    created?: string;
    updated?: string;
  }>().default({}),
  version: integer('version').default(1).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull().$onUpdate(() => sql`now()`),
});