# Fast Iteration System - Programmatic Diffing Implementation Plan

## Completed Work: Frontend Integration (12-15x Speedup)

### ✅ Fixed the Slow Edit Experience!

The create page was using the old `/api/ai/iterate` endpoint which takes ~2 minutes.
Now it uses the new `/api/iterate/fast` endpoint which takes ~8-10 seconds.

### Changes Made:
- **Frontend** (`src/routes/create_.$id.tsx`): Changed endpoint from `/api/ai/iterate` to `/api/iterate/fast`
- **API Types** (`src/lib/api-types.d.ts`): Auto-generated types for the new endpoint
- Simplified request body (removed `currentFiles` - not needed)
- Fixed error handling

### Performance Improvement:
- **Before**: ~2 minutes per edit
- **After**: ~8-10 seconds per edit
- **Speedup**: ~12-15x faster

## Current System Analysis

The current system uses a two-AI approach:
1. **Claude Sonnet 4** - Analyzes files and generates edit instructions in JSON format
2. **Groq Llama 4 Maverick** - Takes instructions and rewrites entire files

### Current Flow
```
User Request → Claude Analysis → JSON Instructions → Groq Rewrites Files → Save
```

### Issues with Current Approach
- **Inefficient**: Groq rewrites entire files even for small changes
- **Unreliable**: Risk of Groq misunderstanding or hallucinating changes
- **Slow**: ~8-10 seconds per iteration due to secondary AI inference
- **Costly**: Requires Groq API calls for mechanical text manipulation

## Proposed Improvement: Programmatic Diffing

Replace Groq's AI-based file rewriting with deterministic programmatic diff application.

### New Architecture
```
User Request → Claude Analysis → Structured Diffs → Programmatic Application → Save
```

### Key Benefits
- **Faster**: No AI inference for applying changes (~2-3s improvement)
- **More reliable**: Deterministic diff application, no hallucinations
- **Better debugging**: Clear audit trail of exact changes
- **Cost savings**: No Groq API calls needed
- **Precise control**: Exact line-by-line modifications

## Implementation Checklist

### Phase 1: Core Implementation

- [ ] **Create FileEdit class** (`server/services/file-edit.ts`)
  - [ ] Define TypeScript interfaces (EditOperation, FileEditDiff)
  - [ ] Implement `applyEdits()` method for single file
  - [ ] Implement `applyFileEdits()` method for multiple files
  - [ ] Add `applyReplace()` private method
  - [ ] Add `applyInsert()` private method
  - [ ] Add `applyDelete()` private method
  - [ ] Implement `findLineRange()` helper for fuzzy matching
  - [ ] Add proper error handling and validation
  - [ ] Sort operations by line number (reverse order)
  - [ ] Add `validateOperations()` method
  - [ ] Add `getEditSummary()` for debugging/logging

- [ ] **Update Claude prompt in iterate.ts**
  - [ ] Modify system prompt to request structured diffs
  - [ ] Add JSON schema example in prompt
  - [ ] Include line numbering rules (1-based)
  - [ ] Add examples of each operation type
  - [ ] Test prompt with sample requests

- [ ] **Replace Groq with FileEdit in iterate route**
  - [ ] Import FileEdit class
  - [ ] Remove GroqService import and initialization
  - [ ] Parse Claude's response as structured diffs
  - [ ] Replace Groq service calls with FileEdit
  - [ ] Implement proper error handling
  - [ ] Add performance logging

### Phase 2: Testing & Validation

- [ ] **Create unit tests** (`server/services/file-edit.test.ts`)
  - [ ] Test replace operations
  - [ ] Test insert operations
  - [ ] Test delete operations
  - [ ] Test multiple operations on same file
  - [ ] Test operations applied in correct order
  - [ ] Test line number validation
  - [ ] Test empty file handling
  - [ ] Test single-line file handling
  - [ ] Test large file handling
  - [ ] Test invalid line numbers
  - [ ] Test overlapping operations

- [ ] **Integration testing**
  - [ ] Test with existing test-fast-iterate.js
  - [ ] Create test cases for common edits
  - [ ] Compare output with Groq version
  - [ ] Measure performance improvements
  - [ ] Test error recovery

- [ ] **End-to-end validation**
  - [ ] Test with real project: "change button color"
  - [ ] Test with real project: "add second blob"
  - [ ] Test with real project: "modify game physics"
  - [ ] Verify compiled output works correctly
  - [ ] Check for any regression issues

### Phase 3: Optimization & Polish

- [ ] **Performance optimizations**
  - [ ] Profile diff application performance
  - [ ] Optimize line splitting/joining
  - [ ] Add caching where appropriate
  - [ ] Batch file operations
  - [ ] Parallel processing for multiple files

- [ ] **Error handling improvements**
  - [ ] Add detailed error messages
  - [ ] Implement operation rollback
  - [ ] Add conflict detection
  - [ ] Create error recovery strategies
  - [ ] Add debug logging

- [ ] **Documentation updates**
  - [ ] Update FAST_ITERATE.md with results
  - [ ] Document API changes
  - [ ] Add code examples
  - [ ] Create troubleshooting guide
  - [ ] Update README if needed

### Phase 4: Deployment

- [ ] **Direct deployment**
  - [ ] Remove all Groq-related code from iterate.ts
  - [ ] Deploy new FileEdit-based system
  - [ ] Monitor error rates
  - [ ] Track performance metrics

- [ ] **Cleanup**
  - [ ] Remove unused Groq code from iterate route
  - [ ] Clean up old imports
  - [ ] Update dependencies if needed
  - [ ] Final testing

## Implementation Details

### 1. Structured Diff Format

Claude will output diffs in this JSON structure:

```json
{
  "diffs": [
    {
      "file": "script.js",
      "operations": [
        {
          "type": "replace",
          "startLine": 45,
          "endLine": 47,
          "newContent": "const blob1 = new Blob(mouseX, mouseY);\nconst blob2 = new Blob(mouseX + 100, mouseY);"
        },
        {
          "type": "insert",
          "afterLine": 52,
          "newContent": "blob2.update();\nblob2.draw();"
        },
        {
          "type": "delete",
          "startLine": 60,
          "endLine": 62
        }
      ]
    }
  ]
}
```

### 2. FileEdit Class Implementation

Create `server/services/file-edit.ts`:

```typescript
interface EditOperation {
  type: 'replace' | 'insert' | 'delete';
  startLine?: number;
  endLine?: number;
  afterLine?: number;
  newContent?: string;
}

interface FileEditDiff {
  file: string;
  operations: EditOperation[];
}

class FileEdit {
  // Core methods
  applyEdits(content: string, operations: EditOperation[]): string
  applyFileEdits(files: Record<string, {content: string}>, diffs: FileEditDiff[]): Result
  
  // Helper methods
  findLineRange(content: string, searchText: string): LineRange | null
  validateOperations(operations: EditOperation[]): ValidationResult
  getEditSummary(diffs: FileEditDiff[]): string
  
  // Private methods
  private applyReplace(lines: string[], op: EditOperation): void
  private applyInsert(lines: string[], op: EditOperation): void
  private applyDelete(lines: string[], op: EditOperation): void
}
```

### 3. Line-Based Operations

#### Replace Operation
- Find lines from `startLine` to `endLine`
- Replace with `newContent`
- Preserve indentation

#### Insert Operation
- Insert `newContent` after `afterLine`
- Line 0 means insert at beginning

#### Delete Operation
- Remove lines from `startLine` to `endLine`

### 4. Claude Prompt Updates

Update the system prompt to request structured diffs:

```
Output a JSON object with precise line-based edits:
{
  "diffs": [
    {
      "file": "filename",
      "operations": [
        {
          "type": "replace|insert|delete",
          "startLine": <1-based line number>,
          "endLine": <1-based line number>,
          "newContent": "exact code to insert"
        }
      ]
    }
  ]
}

Rules:
1. Use 1-based line numbers
2. Apply operations in order from top to bottom
3. For multi-line content, use \n for line breaks
4. Preserve exact indentation
```

## Migration Strategy

Direct replacement approach:
1. Implement FileEdit class with all edit logic
2. Update iterate.ts to use FileEdit instead of Groq
3. Test thoroughly with existing projects
4. Deploy as single update (no feature flags needed)

## Testing Plan

### Unit Tests
```typescript
describe('FileEdit', () => {
  test('applies replace operations')
  test('applies insert operations')
  test('applies delete operations')
  test('handles multiple operations')
  test('validates line numbers')
  test('preserves indentation')
})
```

### Integration Tests
- Test with real project files
- Multiple file edits in single request
- Edge cases (empty files, large files)
- Performance comparison vs Groq approach

### End-to-End Tests
- Use existing test-fast-iterate.js
- Compare output with Groq version
- Measure performance improvement
- Verify identical results

## Files to Modify

### New Files
- `server/services/file-edit.ts` - Core file editing logic (all diff operations in one place)
- `server/services/file-edit.test.ts` - Unit tests for FileEdit class

### Modified Files
- `server/routes/iterate.ts` - Replace Groq with FileEdit class
- `test-fast-iterate.js` - Verify new system works

### Documentation
- Update this file with final implementation details
- Add examples of successful diffs
- Document any limitations

## Expected Performance

### Current System (with Groq)
- Claude analysis: ~3-4 seconds
- Groq rewriting: ~4-5 seconds per file
- Total: ~8-10 seconds

### New System (Programmatic)
- Claude analysis: ~3-4 seconds (structured output)
- Diff application: <100ms per file
- Total: ~3-5 seconds

### Improvement
- **50-70% faster** for typical edits
- More consistent performance
- No variance from AI model load

## Rollback Plan

Since we're doing a direct replacement:
1. Keep a backup of the original iterate.ts
2. If issues arise, revert to Groq-based version
3. Debug and fix FileEdit class
4. Redeploy when ready

## Future Enhancements

1. **Smart Diff Generation**
   - Claude generates minimal diffs
   - Automatic line number detection
   - Context-aware replacements

2. **Conflict Resolution**
   - Detect overlapping edits
   - Merge compatible changes
   - User prompts for conflicts

3. **Diff Optimization**
   - Combine adjacent operations
   - Minimize diff size
   - Intelligent operation ordering

4. **Advanced Operations**
   - Regex-based replacements
   - Code-aware transformations
   - AST-based modifications for JavaScript

## Success Metrics

- **Performance**: 50%+ reduction in iteration time
- **Reliability**: 99%+ success rate for diff application
- **Accuracy**: Identical output to manual edits
- **Cost**: 80%+ reduction in API costs (no Groq usage)