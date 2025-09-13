# Chat Message Saving Implementation Plan

## Overview
Add persistent chat message storage to LOL (Live Online Laboratory) to save all user and AI chat messages, including tool usage, with real-time async saving during streaming.

## Core Requirements
- ✅ New database table for saving user & AI chat messages
- ✅ Store tool messages including tool calls for internal reference
- ✅ Async message storage on server during streaming for accurate state on refresh
- ✅ Future-ready for version history feature

## Database Schema

### TODO: Create New Tables

- [ ] **Create `conversations` table**
  ```sql
  conversations {
    id: uuid (primary key)
    projectId: uuid (foreign key -> projects.id)
    title: varchar(255) (optional, auto-generated from first message)
    createdAt: timestamp
    updatedAt: timestamp
  }
  ```

- [ ] **Create `messages` table**
  ```sql
  messages {
    id: uuid (primary key)
    conversationId: uuid (foreign key -> conversations.id)
    projectId: uuid (foreign key -> projects.id)
    role: enum ('user', 'assistant', 'system', 'tool')
    content: text (message content)
    toolName: varchar(255) (optional, for tool messages)
    toolCall: jsonb (optional, tool call parameters)
    toolResult: jsonb (optional, tool execution result)
    streamingStatus: enum ('pending', 'streaming', 'complete', 'error')
    metadata: jsonb (additional data like tokens, model, etc.)
    createdAt: timestamp
    updatedAt: timestamp
  }
  ```

- [ ] **Add indexes**
  - Index on `conversationId` for fast message retrieval
  - Index on `projectId` for project-specific queries
  - Index on `createdAt` for chronological ordering

## Backend Implementation

### TODO: Database Layer

- [ ] **Create Drizzle schema files**
  - Add `conversations` table schema in `src/db/schema.ts`
  - Add `messages` table schema in `src/db/schema.ts`
  - Create migration file

- [ ] **Database operations**
  - Create `server/services/conversations.ts` service
    - `createConversation(projectId: string)`
    - `getConversation(id: string)`
    - `listConversations(projectId?: string)`
    - `deleteConversation(id: string)`
  
  - Create `server/services/messages.ts` service
    - `createMessage(message: MessageInput)`
    - `updateMessage(id: string, updates: Partial<Message>)`
    - `getMessages(conversationId: string, limit?: number, offset?: number)`
    - `streamingMessageUpdate(id: string, chunk: string)`

### TODO: API Routes

- [ ] **Conversation endpoints** (`server/routes/conversations.ts`)
  - `GET /api/conversations` - List all conversations
  - `GET /api/conversations/:id` - Get specific conversation with messages
  - `POST /api/conversations` - Create new conversation
  - `DELETE /api/conversations/:id` - Delete conversation

- [ ] **Message endpoints** (`server/routes/messages.ts`)
  - `GET /api/conversations/:conversationId/messages` - Get messages for conversation
  - `POST /api/conversations/:conversationId/messages` - Create new message
  - `PATCH /api/messages/:id` - Update message (for streaming updates)

### TODO: Streaming Integration

- [ ] **Modify `server/routes/iterate-claude.ts`**
  - Add conversation creation/retrieval at start of request
  - Save user message immediately when received
  - Create assistant message with `streamingStatus: 'pending'`
  - Update assistant message during streaming with chunks
  - Save tool calls and results as separate messages
  - Mark message as complete when streaming ends
  - Handle errors and update message status accordingly

- [ ] **Streaming message format**
  ```typescript
  interface StreamMessage {
    id: string
    type: 'user' | 'assistant' | 'tool_use' | 'tool_result'
    content: string
    toolName?: string
    toolCall?: any
    toolResult?: any
    timestamp: Date
    streamingStatus?: 'pending' | 'streaming' | 'complete' | 'error'
  }
  ```

## Frontend Implementation

### TODO: State Management

- [ ] **Create conversation store/hooks**
  - `useConversation(projectId: string)` - Load/manage active conversation
  - `useMessages(conversationId: string)` - Load/paginate messages
  - `useConversationList(projectId?: string)` - List conversations

### TODO: UI Components

- [ ] **Modify existing chat components**
  - Update `src/routes/create_.$id.tsx` to load conversation on mount
  - Modify chat message display to show persisted messages
  - Add conversation switcher/history sidebar
  - Implement message pagination for long conversations

- [ ] **Chat persistence features**
  - Auto-save user messages before sending to API
  - Display loading state for pending messages
  - Show streaming status indicator
  - Handle reconnection and state recovery

### TODO: Hook Modifications

- [ ] **Update `useClaudeStream` hook**
  - Accept optional `conversationId` parameter
  - Load existing messages on initialization
  - Append new messages to existing conversation
  - Handle message updates during streaming
  - Persist messages to localStorage as backup

## Implementation Steps

### Phase 1: Database & Backend (Priority)
1. [ ] Create database schema with Drizzle
2. [ ] Run database migration
3. [ ] Implement conversation service
4. [ ] Implement message service
5. [ ] Create API routes for conversations and messages
6. [ ] Add tests for database operations

### Phase 2: Streaming Integration
1. [ ] Modify Claude streaming endpoint to save messages
2. [ ] Add message ID to SSE events
3. [ ] Implement real-time message updates
4. [ ] Test streaming with message persistence
5. [ ] Add error recovery for failed saves

### Phase 3: Frontend Integration
1. [ ] Create conversation hooks
2. [ ] Load conversation history on page load
3. [ ] Update chat UI to show persisted messages
4. [ ] Add conversation management UI
5. [ ] Implement message pagination
6. [ ] Add loading states and error handling

### Phase 4: Testing & Polish
1. [ ] End-to-end testing of chat persistence
2. [ ] Performance optimization for large conversations
3. [ ] Add conversation search/filter
4. [ ] Implement conversation export feature
5. [ ] Add keyboard shortcuts for conversation navigation

## Future Enhancements (Version 2)

### File Versioning System
- [ ] Create `project_versions` table
- [ ] Create `files` table with version tracking
- [ ] Link messages to specific file versions
- [ ] Implement version history slider UI
- [ ] Add branching/forking from previous versions

### Advanced Features
- [ ] Conversation templates/presets
- [ ] Message search across all conversations
- [ ] Conversation sharing/collaboration
- [ ] Message reactions/annotations
- [ ] AI-generated conversation summaries
- [ ] Export conversations as markdown/JSON

## Technical Considerations

### Performance
- Implement cursor-based pagination for messages
- Use database indexes for fast queries
- Consider caching recent conversations
- Lazy load older messages

### Data Integrity
- Use database transactions for multi-table operations
- Implement soft deletes for conversations
- Add data validation at API level
- Regular database backups

### Security
- Validate user permissions for conversations
- Sanitize message content before storage
- Rate limit message creation
- Audit log for conversation access

## Success Metrics
- All messages persisted within 100ms of generation
- Zero message loss during streaming
- Page refresh maintains exact chat state
- Conversation history loads in <500ms
- Support for conversations with 10,000+ messages

## Dependencies
- Drizzle ORM for database operations
- PostgreSQL for data storage
- Server-Sent Events for streaming
- React hooks for state management
- Existing Claude integration

## Timeline Estimate
- Phase 1: 2-3 hours
- Phase 2: 2-3 hours  
- Phase 3: 3-4 hours
- Phase 4: 2-3 hours
- **Total: 9-13 hours**

## Notes
- Maintain backward compatibility with existing streaming
- Design schema to support future file versioning
- Consider message compression for large conversations
- Plan for data migration if schema changes