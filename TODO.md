# Lollipop - AI-Powered Web Experience Generator

## Project Overview
Lollipop is a web application inspired by StumbleUpon where users discover and create AI-generated web experiences. Users navigate through fullscreen HTML/CSS/JS projects by pressing spacebar, and can create their own using an integrated AI editor.

## Core Features

### 1. Splash Page
- Simple landing page with "Press Spacebar to Start" CTA
- Minimal design, fullscreen experience
- Route: `/`

### 2. Browse Mode
- Fullscreen iframe displaying user-generated projects
- Spacebar navigation to cycle through random projects
- No algorithms initially - pure random selection
- Route: `/browse`

### 3. AI Editor
- Split-screen interface:
  - Left panel: AI chat interface
  - Right panel: Output (toggle between rendered preview and code view)
- Initial prompt generates complete project from template
- Subsequent prompts iterate on existing code
- Route: `/create`

## Technical Stack

- **Frontend Framework**: TanStack Start/Router
- **API Server**: Fastify with OpenAPI/Swagger
- **API Client**: openapi-fetch + openapi-react-query (type-safe)
- **Styling**: Tailwind CSS + shadcn/ui
- **Database**: PostgreSQL
- **ORM**: Drizzle
- **AI**: Anthropic Claude (Sonnet model)
- **Language**: TypeScript
- **Content Type**: Vanilla HTML/CSS/JavaScript only

## Database Schema

```sql
-- projects table
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  files JSONB NOT NULL, -- Multi-file structure
  compiled TEXT NOT NULL, -- Pre-bundled HTML for rendering
  compiled_at TIMESTAMP,
  compile_error TEXT,
  metadata JSONB, -- views, created_at, updated_at, etc.
  version INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- For future: project_versions table for history
```

## File Storage Format

```json
{
  "id": "project-uuid",
  "title": "Project Name",
  "version": 1,
  "files": {
    "index.html": {
      "content": "<!DOCTYPE html>...",
      "type": "html"
    },
    "style.css": {
      "content": "body { margin: 0; }...",
      "type": "css"
    },
    "script.js": {
      "content": "console.log('hello');",
      "type": "javascript"
    }
  },
  "entrypoint": "index.html",
  "metadata": {
    "created": "2024-01-01T00:00:00Z",
    "updated": "2024-01-02T00:00:00Z",
    "views": 0
  }
}
```

## Compilation Strategy

**When**: On save (not on load)
**How**: Bundle all CSS and JS files into a single HTML file
**Storage**: Store both raw files (for editing) and compiled HTML (for viewing)

```javascript
function compileProject(files) {
  const entryHTML = files['index.html'].content;
  const allCSS = Object.entries(files)
    .filter(([name]) => name.endsWith('.css'))
    .map(([_, file]) => file.content).join('\n');
  const allJS = Object.entries(files)
    .filter(([name]) => name.endsWith('.js'))
    .map(([_, file]) => file.content).join(';\n');
    
  return entryHTML
    .replace('</head>', `<style>${allCSS}</style></head>`)
    .replace('</body>', `<script>${allJS}</script></body>`);
}
```

## Security Implementation

### iframe Sandboxing
```html
<iframe 
  sandbox="allow-scripts" 
  src="blob:..." 
  style="width:100vw; height:100vh"
/>
```

### Blob URL Generation
```javascript
const blob = new Blob([compiledHTML], { type: 'text/html' });
const url = URL.createObjectURL(blob);
iframe.src = url;
// Clean up: URL.revokeObjectURL(url) when done
```

### Content Security Policy
- Strict CSP headers for main app
- Isolated context for user content
- No access to parent window resources

## API Endpoints

```typescript
// Project CRUD
POST   /api/projects          // Create new project
GET    /api/projects/:id      // Get specific project
PUT    /api/projects/:id      // Update project (saves new version)
GET    /api/projects/random   // Get random project for browsing

// AI Generation
POST   /api/ai/generate       // Initial generation from prompt
POST   /api/ai/iterate        // Iterate on existing code
```

## AI Integration

### System Prompt Template
```
You are an AI that generates creative web experiences using only HTML, CSS, and JavaScript.
Generate complete, self-contained projects that work in a single HTML file.
Make them visually interesting and interactive.
Focus on: [animations, games, generative art, interactive experiences]
```

### Request Flow
1. User enters prompt
2. Send to Claude API with system prompt + user prompt
3. Parse response to extract HTML/CSS/JS
4. Store files in database
5. Compile to single HTML
6. Display in iframe

## Implementation Steps

### Phase 1: Foundation
- [X] Initialize TanStack Start project with TypeScript
- [X] Set up Tailwind CSS and shadcn/ui
- [X] Configure PostgreSQL connection
- [X] Create Drizzle schema and migrations
- [X] Set up basic routing structure

### Phase 2: Browse Experience
- [X] Create splash page with spacebar listener (merged into home)
- [X] Implement `/browse` route with fullscreen layout (now at `/`)
- [X] Create iframe component with sandbox security
- [X] Add API endpoint for fetching random projects
- [X] Implement spacebar navigation between projects

### Phase 3: Editor & AI
- [ ] Build split-screen editor layout
- [ ] Create chat interface component
- [ ] Add code view/preview toggle
- [X] Integrate Claude API (backend ready in server/routes/ai.ts)
- [X] Implement project compilation on save (server/lib/compile.ts)
- [ ] Add file management (create/edit multiple files)

### Phase 4: Data Flow
- [X] Implement project creation endpoint (POST /api/projects)
- [X] Add project update with versioning (PUT /api/projects/:id)
- [X] Create blob URL generation for iframe (ProjectViewer component)
- [X] Add view count tracking (increments on /api/projects/random)
- [X] Implement error handling for compilation

### Phase 5: Polish
- [X] Add loading states and transitions (browse page has loading spinner)
- [X] Improve error messages (error state in browse page)
- [ ] Add keyboard shortcuts beyond spacebar
- [ ] Optimize compilation performance
- [X] Add basic analytics (view counts tracked in DB)

## Environment Variables

```env
# Database
DATABASE_URL=postgresql://localhost:5432/lollipop

# API Server
PORT=3001
HOST=0.0.0.0
API_URL=http://localhost:3001
CLIENT_URL=http://localhost:5173
VITE_API_URL=http://localhost:3001

# Anthropic AI
ANTHROPIC_API_KEY=sk-ant-...

# Environment
NODE_ENV=development
```

## Project Structure

```
src/
├── routes/
│   ├── index.tsx          // Browse page with spacebar navigation
│   ├── create.tsx         // AI editor (to be implemented)
│   └── __root.tsx         // Root layout with React Query
├── components/
│   ├── ProjectViewer.tsx  // iframe wrapper with sandboxing ✓
│   ├── CodeEditor.tsx     // Multi-file code editor (to be implemented)
│   ├── AIChat.tsx         // Chat interface (to be implemented)
│   └── PreviewToggle.tsx  // Code/Preview switch (to be implemented)
├── lib/
│   ├── api-client.ts      // OpenAPI type-safe client ✓
│   ├── api-types.d.ts     // Auto-generated API types ✓
│   └── utils.ts           // Utility functions
└── server/
    └── db/
        ├── schema.ts      // Drizzle schema ✓
        └── index.ts       // DB connection ✓

server/
├── index.ts               // Fastify server with OpenAPI ✓
├── routes/
│   ├── health.ts          // Health check endpoint ✓
│   ├── projects.ts        // CRUD operations ✓
│   └── ai.ts              // Claude AI integration ✓
└── lib/
    └── compile.ts         // Project compilation logic ✓
```

## Future Enhancements (Not for MVP)
- User accounts and authentication
- Project likes/favorites
- Remix/fork functionality
- Categories and tags
- Trending algorithm
- Collaborative editing
- Export to CodePen/GitHub
- Custom domains for projects

## Development Commands

```bash
# Install dependencies
pnpm install

# Run database migrations
pnpm db:migrate

# Start frontend only
pnpm dev

# Start API server only
pnpm dev:server

# Start both frontend and API server
pnpm dev:all

# Generate TypeScript types from OpenAPI schema
pnpm client:generate

# Type checking
pnpm typecheck

# Linting
pnpm lint

# Database studio
pnpm db:studio
```

## Key Decisions

1. **Anonymous first**: No user accounts initially to reduce friction
2. **Pre-compilation**: Bundle on save for instant viewing performance
3. **iframe isolation**: Security through sandboxing, not sanitization
4. **Single HTML output**: Simplifies rendering and distribution
5. **Random discovery**: No algorithm complexity initially
6. **Vanilla web tech**: HTML/CSS/JS only for universal compatibility
7. **Separate API Server**: Fastify backend for better scalability and OpenAPI documentation
8. **Type-safe API**: Using openapi-fetch and openapi-react-query for end-to-end type safety

## Success Metrics
- Projects created per day
- Average session duration in browse mode
- Spacebar presses per session
- Successful AI generations vs. errors
- Compilation success rate

## Notes for Implementation
- Always validate and sanitize user input before storing
- Implement rate limiting on AI generation endpoints
- Use database transactions for version management
- Clean up blob URLs after iframe navigation
- Consider CDN for serving compiled HTML in production
- Monitor AI token usage and costs
- Add graceful fallbacks for compilation errors