# Fast Iteration System

## Overview
A high-performance iteration system that allows quick edits to existing projects using AI. ~10x faster than full regeneration.

## Architecture
- **Analysis**: Claude Sonnet 4 - Identifies which files need changes (minimal output)
- **Execution**: Groq Llama 4 Maverick - Rewrites files based on instructions
- **Performance**: ~8-10 seconds vs ~2 minutes for traditional approaches

## API Endpoint

### Fast Iterate
```
POST /api/iterate/fast
```

**Request:**
```json
{
  "projectId": "uuid",
  "prompt": "change button color to blue"
}
```

**Response:**
```json
{
  "id": "project-uuid",
  "title": "Project Title",
  "files": { /* updated files */ },
  "compiled": "compiled HTML",
  "version": 2,
  "editedFiles": ["style.css"],
  "performanceMs": 8458
}
```

## How It Works

1. **User Request** → API receives edit prompt
2. **Claude Analysis** → Outputs JSON with minimal instructions (500 tokens max)
   ```json
   [{"file": "script.js", "instruction": "add second blob instance"}]
   ```
3. **Groq Execution** → Rewrites each file based on instructions
4. **Compilation** → Updates database and returns result

## Performance Optimization

The key insight: Claude shouldn't generate entire files, just instructions.

### Before (slow):
- Claude generates complete file contents (1000s of tokens)
- Takes 2+ minutes for simple edits

### After (fast):
- Claude generates JSON instructions (~100 tokens)
- Groq does the actual rewriting
- Takes ~8-10 seconds

## Testing

Use the included test script:
```bash
node test-fast-iterate.js
```

## Configuration

Required environment variables:
- `ANTHROPIC_API_KEY` - For Claude Sonnet 4
- `GROQ_API_KEY` - For Groq Llama 4 Maverick

## Files

- `/server/routes/iterate.ts` - Main API endpoint
- `/server/groq-service.ts` - Groq integration service
- `/test-fast-iterate.js` - Test script