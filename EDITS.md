# Fast Iterative Editing Implementation

## Overview
Implementing a fast iterative editing system using Groq's Llama 4 Maverick model for quick edits and Claude Sonnet as fallback for complex changes.

## Architecture
- **Fast Model**: Groq's meta-llama/llama-4-maverick-17b-128e-instruct (50-100x faster)
- **Fallback Model**: Claude Sonnet (for complex restructuring)
- **Edit Engine**: Line-based edit application system

## Implementation Checklist

### Phase 1: Core Infrastructure
- [ ] **Create edit-engine.ts for applying line-based edits**
  - Simple class to apply targeted edits to files
  - Support insert, replace, delete operations
  - Clean error handling

- [ ] **Set up Groq API integration for fast edits**
  - Add Groq SDK dependency
  - Configure API key in .env
  - Create service wrapper

### Phase 2: API Implementation  
- [ ] **Add new /api/ai/edit endpoint using Groq**
  - Use Groq for analyzing edit requests
  - Return structured edit instructions
  - Apply edits server-side
  - Fallback to Claude for complex changes

### Phase 3: Frontend Integration
- [ ] **Update frontend to use new edit endpoint**
  - Modify AIChat component
  - Keep existing UI unchanged
  - Add optional change indicators

### Phase 4: Testing
- [ ] **Test the iterative editing system**
  - Test simple edits (colors, text)
  - Test complex edits (new features)
  - Verify Claude fallback
  - Performance benchmarking

## Benefits
- **50-100x faster** response times for simple edits
- **Lower costs** with Groq pricing
- **Better UX** with near-instant feedback
- **Backwards compatible** with existing system

## Technical Details

### Edit Operations
```typescript
interface EditOperation {
  type: 'insert' | 'replace' | 'delete';
  file: string;
  startLine?: number;
  endLine?: number;
  content?: string;
}
```

### API Flow
1. User sends edit request via chat
2. Groq analyzes and returns edit operations
3. Edit engine applies changes
4. Frontend updates with modified files
5. Fallback to Claude if Groq can't handle

## Notes
- Keep the implementation simple and focused on speed
- No complex diff visualization needed initially
- Maintain backwards compatibility with existing `/api/ai/iterate`