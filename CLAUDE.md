# LOL - Live Online Laboratory

## Overview
LOL (Live Online Laboratory) is a web-based code playground that enables users to create, edit, and iterate on interactive web projects (HTML, CSS, JavaScript) with AI assistance. Think of it as a simplified CodePen with built-in AI code generation and iteration capabilities.

## Architecture

### Frontend (Remix + React)
- **Framework**: Remix with Vite for development
- **UI Components**: Custom components with Tailwind CSS
- **Code Editor**: Monaco Editor for in-browser code editing
- **Live Preview**: Real-time iframe preview of HTML/CSS/JS projects

### Backend (Fastify + PostgreSQL)
- **Server**: Fastify with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **AI Integration**: Multiple AI providers (OpenAI, Anthropic Claude)

## Key Features

### 1. Project Management
- Create new projects from prompts
- Store projects with versioning
- Track project metadata (views, creation date, etc.)

### 2. AI-Powered Code Generation
Multiple strategies for AI code generation:
- **Direct Generation**: Creates new projects from natural language prompts
- **Iteration**: Modifies existing projects based on user feedback
- **AST-based Editing**: Smart code modifications using Abstract Syntax Trees

### 3. Claude Code Integration
Special integration with Anthropic's Claude Code SDK (`@anthropic-ai/claude-code`):
- **ClaudeWorkspace Service**: Manages temporary workspaces for code generation
- **File Management**: Reads existing files, applies changes, and returns updated code
- **Smart Context**: Provides Claude with existing code context for better iterations
- **Real-time Streaming**: Server-Sent Events (SSE) stream Claude's actions to the frontend, showing:
  - File reading/writing operations as they happen
  - Claude's thinking process and decisions
  - Tool usage with minimal, inline display
  - Loading animation while waiting for first response

## Project Structure

```
/
├── src/                    # Frontend Remix application
│   ├── routes/            # Remix routes (pages)
│   ├── components/        # React components
│   ├── lib/              # Utilities and API client
│   └── db/               # Database schema
├── server/                # Backend Fastify server
│   ├── routes/           # API endpoints
│   │   ├── projects.ts   # CRUD operations
│   │   ├── ai.ts        # OpenAI integration
│   │   ├── iterate.ts   # Project iteration
│   │   ├── iterate-ast.ts # AST-based iteration
│   │   └── iterate-claude.ts # Claude Code iteration
│   ├── services/         # Business logic
│   │   └── claude-workspace.ts # Claude Code SDK wrapper
│   └── lib/              # Server utilities
└── public/               # Static assets
```

## API Endpoints

### Projects
- `GET /api/projects` - List all projects
- `GET /api/projects/:id` - Get specific project
- `POST /api/projects` - Create new project
- `PUT /api/projects/:id` - Update project

### AI Generation
- `POST /api/ai/generate` - Generate new project from prompt (OpenAI)
- `POST /api/iterate/:id` - Iterate on existing project (OpenAI)
- `POST /api/iterate/ast/:id` - AST-based iteration (OpenAI)
- `POST /api/iterate/claude` - Claude Code iteration (Anthropic)
- `POST /api/iterate/claude/stream` - Claude Code iteration with SSE streaming (Anthropic)

## Database Schema

```sql
projects {
  id: uuid (primary key)
  title: varchar(255)
  files: jsonb {
    [filename]: {
      content: string
      type: 'html' | 'css' | 'javascript'
    }
  }
  compiled: text (concatenated HTML with embedded CSS/JS)
  compiledAt: timestamp
  compileError: text
  metadata: jsonb
  version: integer
  createdAt: timestamp
  updatedAt: timestamp
}
```

## Code Compilation

Projects are "compiled" into a single HTML file with embedded CSS and JavaScript for easy preview:
1. Takes separate HTML, CSS, and JS files
2. Injects CSS into `<style>` tags
3. Injects JS into `<script>` tags
4. Returns complete HTML document

## AI Integration Approach

### Claude Code Integration
The Claude Code integration (`iterate-claude.ts`) uses a unique approach:
1. Creates a temporary workspace directory
2. Writes existing project files to disk
3. Invokes Claude Code SDK with file context
4. Claude reads, modifies, and writes files directly
5. Reads back the modified files
6. Updates the database with new versions

### Streaming Implementation
The streaming feature (`/api/iterate/claude/stream`) provides real-time visibility:
1. **Server-Sent Events (SSE)**: Uses SSE to stream messages from backend to frontend
2. **Message Types**: Streams different message types (assistant, tool_use, tool_result, complete, error)
3. **UI Feedback**: 
   - Loading animation appears immediately after user sends message
   - Tool operations (file reads/writes) shown as minimal inline text
   - Assistant thinking messages displayed prominently
   - Messages append to chat history for full audit trail
4. **User Preferences**: Streaming can be toggled on/off, preference saved in localStorage
5. **Visual Hierarchy**: User messages have colored backgrounds, assistant messages are transparent, tool calls are minimal text-only

### Known Issues & Workarounds

#### Drizzle ORM Timestamp Issue
- **Problem**: Drizzle ORM has a bug with timestamp fields when using `$onUpdate(() => sql\`now()\`)` 
- **Error**: `value.toISOString is not a function`
- **Solution**: Manually set `updatedAt: new Date()` instead of relying on the `$onUpdate` trigger
- **References**: [GitHub Issue #1113](https://github.com/drizzle-team/drizzle-orm/issues/1113)

## Development

### Prerequisites
- Node.js 20+
- PostgreSQL
- pnpm package manager

### Environment Variables
```env
DATABASE_URL=postgresql://...
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

### Commands
```bash
pnpm install          # Install dependencies
pnpm dev             # Start development server (frontend + backend)
pnpm build           # Build for production
pnpm db:push         # Push schema to database
pnpm db:studio       # Open Drizzle Studio
```

## Testing Approach

The application includes various test projects and iteration scenarios:
- Paper.js blob animation games
- Interactive visualizations
- CSS animations
- Canvas-based applications

## Future Improvements

1. **Multi-file Support**: Better handling of complex projects with multiple files
2. **Framework Support**: Add support for React, Vue, etc.
3. **Collaboration**: Real-time collaborative editing
4. **Deployment**: One-click deployment to hosting services
5. **Version Control**: Full git-like version history
6. **AI Model Selection**: Let users choose between different AI models
7. **Custom Prompts**: Template library for common project types