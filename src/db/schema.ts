import { pgTable, uuid, varchar, text, timestamp, jsonb, integer } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

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