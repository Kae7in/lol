# Fast Iterative Editing Implementation

## Overview
Implementing a fast iterative editing system using Claude Sonnet 4 for intelligent edit analysis and Groq's Llama 4 Maverick model for rapid file rewriting.

## Architecture
- **Analysis Model**: Claude Sonnet 4 (generates structured edit instructions in XML, one function call per file)
- **Execution Model**: Groq's meta-llama/llama-4-maverick-17b-128e-instruct (rewrites one file at a time)
- **Edit Engine**: Processes multiple function calls, each targeting a single file

## Implementation Checklist

### Phase 1: Core Infrastructure
- [ ] **Create edit-engine.ts for applying file edits**
  - Simple class to apply targeted edits to files
  - Support insert, replace, delete operations
  - Clean error handling

- [ ] **Set up Groq API integration for fast edits**
  - Add Groq SDK dependency
  - Configure API key in .env
  - Create service wrapper

## API Flow
1. User sends edit request via chat
2. Claude Sonnet 4 analyzes request and generates file edits as simple markdown code blocks
3. Each file gets its own function call with filename and full rewritten code
4. Groq processes each function call to rewrite one file at a time
5. Modified files are committed to database and returned to client
6. Frontend refreshes the project iframe with latest updates

## Example Claude Output

### Example 1: Changing button color
User: "Change the submit button to blue"

Claude generates:

src/components/Button.tsx
```typescript
export function Button({ onClick, children }) {
  return (
    <button 
      onClick={onClick}
      className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
    >
      {children}
    </button>
  );
}
```

### Example 2: Adding a new function to existing file
User: "Add a helper function to format dates"

Claude generates:

src/utils/helpers.ts
```typescript
// Helper functions

export function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

// ADD NEW FUNCTION HERE - Format dates for display
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(date);
}

export function slugify(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}
```

### Example 3: Multiple file changes
User: "Update the header text and its styling"

Claude generates multiple function calls:

src/components/Header.tsx
```typescript
export function Header() {
  return (
    <header className="header">
      <h1>Welcome to the New Experience</h1>
    </header>
  );
}
```

src/styles/header.css
```css
.header h1 {
  font-size: 32px;
  color: #000;
  font-weight: bold;
}

.header {
  padding: 20px;
  background: #f0f0f0;
}
```

## Notes
- Each file gets its own function call
- Claude provides filename and complete rewritten code
- Groq takes the complete code and saves it to the file
- Simple format: filename + code block with full file contents