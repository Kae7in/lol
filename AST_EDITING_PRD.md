# AST-Based Code Editing System - Product Requirements Document

## Executive Summary

Replace the current line-based file editing system with an AST-based approach using `magicast` for JavaScript/TypeScript files. This will eliminate line counting errors, improve reliability, and allow Claude to express edits more naturally using semantic operations.

## Problem Statement

### Current Issues with Line-Based Editing

1. **Fragile Line Numbers**: Any formatting change breaks subsequent edits
2. **Unnatural for AI**: Claude must count lines precisely instead of describing semantic changes
3. **Error-Prone**: "Line 45 out of bounds" errors when content shifts
4. **Complex Prompts**: Claude needs extensive instructions about line counting
5. **Poor Error Recovery**: When line numbers are wrong, entire edit fails

### Example of Current Problem

User request: "Change the blob color to blue and add a second blob"

Current Claude output (line-based):
```json
{
  "diffs": [{
    "file": "script.js",
    "operations": [
      {
        "type": "replace",
        "startLine": 45,
        "endLine": 45,
        "newContent": "  color: 'blue',"
      },
      {
        "type": "insert",
        "afterLine": 67,
        "newContent": "const blob2 = new Blob(x + 100, y);"
      }
    ]
  }]
}
```

**Problems**: 
- If line 45 has shifted, edit fails
- Claude must count exact lines
- No semantic understanding of what's being edited

## Proposed Solution: AST-Based Editing

### New Claude Output Format

Instead of line numbers, Claude outputs semantic transformations:

```json
{
  "edits": [{
    "file": "script.js",
    "type": "ast",
    "transformations": [
      {
        "action": "modify",
        "target": "Blob.constructor.color",
        "value": "'blue'"
      },
      {
        "action": "add-after",
        "target": "const blob1",
        "code": "const blob2 = new Blob(mouseX + 100, mouseY);"
      },
      {
        "action": "insert-in",
        "target": "function draw()",
        "position": "end",
        "code": "blob2.update();\nblob2.draw();"
      }
    ]
  }]
}
```

### Even Better: Magicast Native Format

Claude could output actual magicast code:

```json
{
  "edits": [{
    "file": "script.js",
    "type": "magicast",
    "transform": `
      // Find and modify blob color
      mod.find('Blob').props.color = 'blue';
      
      // Add second blob after first
      mod.insertAfter('const blob1', 'const blob2 = new Blob(mouseX + 100, mouseY);');
      
      // Add to draw function
      mod.function('draw').body.append(\`
        blob2.update();
        blob2.draw();
      \`);
    `
  }]
}
```

## Implementation Architecture

### File Type Strategy

```typescript
interface EditStrategy {
  canHandle(fileType: string): boolean;
  apply(content: string, edits: any): string;
}

class ASTEditStrategy implements EditStrategy {
  canHandle(fileType: string): boolean {
    return ['js', 'jsx', 'ts', 'tsx'].includes(fileType);
  }
  
  apply(content: string, edits: MagicastEdit[]): string {
    const mod = parseModule(content);
    // Apply transformations
    return mod.generate();
  }
}

class DiffPatchStrategy implements EditStrategy {
  canHandle(fileType: string): boolean {
    return ['html', 'css'].includes(fileType);
  }
  
  apply(content: string, patches: Patch[]): string {
    // Use diff-match-patch for text files
  }
}

class LineBasedStrategy implements EditStrategy {
  // Fallback for other files
}
```

### Magicast Integration

```typescript
import { parseModule, type MagicastModule } from 'magicast';

class MagicastEditor {
  applyTransformations(
    content: string, 
    transformations: Transformation[]
  ): string {
    const mod = parseModule(content);
    
    for (const transform of transformations) {
      switch (transform.action) {
        case 'modify':
          this.modifyProperty(mod, transform);
          break;
        case 'add-after':
          this.addAfter(mod, transform);
          break;
        case 'rename':
          this.renameIdentifier(mod, transform);
          break;
        case 'extract-function':
          this.extractFunction(mod, transform);
          break;
        case 'wrap-in-condition':
          this.wrapInCondition(mod, transform);
          break;
      }
    }
    
    return mod.generate();
  }
  
  private modifyProperty(mod: MagicastModule, transform: any) {
    // Example: Change configuration object
    if (transform.target.includes('.')) {
      const path = transform.target.split('.');
      let current = mod;
      for (const segment of path) {
        current = current[segment];
      }
      current = transform.value;
    }
  }
}
```

## Claude Prompt Engineering

### New System Prompt for Claude

```
You are a code editor that outputs AST-based transformations for JavaScript/TypeScript files.

Instead of line numbers, describe SEMANTIC changes:
- Identify code by its semantic meaning (function names, variable names, class names)
- Use descriptive targets like "function draw()", "class Blob", "const blob1"
- Output transformations that find and modify code regardless of location

Output format:
{
  "edits": [{
    "file": "filename.js",
    "type": "ast",
    "transformations": [
      {
        "action": "modify|add-after|rename|extract|delete",
        "target": "semantic identifier",
        "value": "new value or code to add"
      }
    ]
  }]
}

Examples:

1. Change a property:
{
  "action": "modify",
  "target": "gameConfig.speed",
  "value": "10"
}

2. Add code after a declaration:
{
  "action": "add-after",
  "target": "const player = new Player()",
  "code": "const enemy = new Enemy()"
}

3. Rename a variable:
{
  "action": "rename",
  "target": "oldName",
  "value": "newName"
}

4. Modify function body:
{
  "action": "insert-in",
  "target": "function update()",
  "position": "start|end",
  "code": "console.log('updating');"
}
```

## Real-World Example

### User Request
"Make the blob follow the mouse more smoothly and add a trail effect"

### Old Line-Based Approach (Error-Prone)
```json
{
  "diffs": [{
    "file": "script.js",
    "operations": [
      {
        "type": "replace",
        "startLine": 78,
        "endLine": 80,
        "newContent": "  this.x += (mouseX - this.x) * 0.1;\n  this.y += (mouseY - this.y) * 0.1;"
      },
      {
        "type": "insert",
        "afterLine": 32,
        "newContent": "const trail = [];\nconst maxTrailLength = 20;"
      }
    ]
  }]
}
```

### New AST-Based Approach (Robust)
```json
{
  "edits": [{
    "file": "script.js",
    "type": "ast",
    "transformations": [
      {
        "action": "modify",
        "target": "Blob.update method",
        "code": "this.x += (mouseX - this.x) * 0.1;\nthis.y += (mouseY - this.y) * 0.1;"
      },
      {
        "action": "add-after",
        "target": "class Blob",
        "code": "const trail = [];\nconst maxTrailLength = 20;"
      },
      {
        "action": "insert-in",
        "target": "Blob.draw method",
        "position": "start",
        "code": "// Draw trail\ntrail.forEach((point, i) => {\n  const alpha = i / trail.length;\n  fill(255, 255, 255, alpha * 100);\n  ellipse(point.x, point.y, this.size * 0.8);\n});"
      }
    ]
  }]
}
```

## Benefits

### For Development
1. **Reliability**: Edits work regardless of formatting or line shifts
2. **Semantic Understanding**: Edits target actual code structure
3. **Better Error Messages**: "Cannot find function draw()" vs "Line 145 out of bounds"
4. **Simpler Prompts**: Claude doesn't need line counting instructions
5. **Refactoring Support**: Can rename variables, extract functions, etc.

### For Claude
1. **Natural Expression**: Describe what to change, not where it is
2. **Less Context Needed**: Don't need to see line numbers
3. **Fewer Errors**: No line counting mistakes
4. **More Powerful**: Can do complex refactoring

### For Users
1. **Faster Iterations**: Edits succeed more often
2. **Better Results**: Claude can make more sophisticated changes
3. **Clearer Intent**: Transformations describe what's happening

## Migration Plan

### Phase 1: Setup (Day 1)
- [x] Install dependencies: `magicast`, `diff-match-patch`
- [x] Create `ASTEditor` service class
- [x] Set up file type detection

### Phase 2: Implementation (Days 2-3)
- [x] Implement magicast transformation handlers
- [x] Create fallback strategies for non-JS files
- [x] Update `/api/iterate/fast` endpoint (created new `/api/iterate/ast` endpoint)

### Phase 3: Claude Integration (Days 4-5)
- [x] Update Claude system prompts
- [ ] Test with various edit scenarios
- [x] Add transformation validation

### Phase 4: Testing (Day 6)
- [ ] Unit tests for AST transformations
- [ ] Integration tests with real projects
- [ ] Performance benchmarking

### Phase 5: Rollout (Day 7)
- [ ] Deploy with feature flag
- [ ] Monitor success rates
- [ ] Gradual rollout

## Success Metrics

- **Edit Success Rate**: Target 95%+ (up from ~70% with line-based)
- **Performance**: <500ms for AST parsing and transformation
- **Claude Token Usage**: 30% reduction (simpler prompts)
- **User Satisfaction**: Fewer "edit failed" errors

## Technical Dependencies

```json
{
  "dependencies": {
    "magicast": "^0.3.3",
    "diff-match-patch": "^1.0.5",
    "@babel/parser": "^7.24.0",
    "@babel/traverse": "^7.24.0",
    "@babel/generator": "^7.24.0"
  }
}
```

## Risk Mitigation

### Risk: AST parsing fails on invalid JavaScript
**Mitigation**: Fall back to diff-match-patch for malformed code

### Risk: Complex transformations timeout
**Mitigation**: Set 1-second timeout, fall back to simpler edits

### Risk: Claude generates invalid transformations
**Mitigation**: Validate transformations before applying, request clarification

## Appendix: Transformation Examples

### Common Transformations

```javascript
// 1. Change property value
mod.exports.default.config.speed = 10;

// 2. Add import
mod.imports.$add({
  from: 'library',
  imported: 'function',
});

// 3. Rename variable
mod.renameIdentifier('oldName', 'newName');

// 4. Add method to class
mod.class('Blob').method('reset', `
  this.x = 0;
  this.y = 0;
`);

// 5. Modify function body
mod.function('update').body = `
  // New implementation
  ${newCode}
`;

// 6. Extract to variable
const expression = mod.find('complex + expression * 2');
mod.insertBefore(expression, 'const result = complex + expression * 2;');
expression.replace('result');

// 7. Wrap in try-catch
const risky = mod.find('riskyOperation()');
risky.wrap(`
  try {
    $CODE
  } catch (error) {
    console.error(error);
  }
`);

// 8. Add conditional
mod.function('draw').body.prepend(`
  if (!this.visible) return;
`);
```

## Conclusion

AST-based editing solves the fundamental brittleness of line-based editing while enabling more sophisticated code transformations. By allowing Claude to express edits semantically rather than positionally, we achieve higher reliability, better user experience, and more powerful editing capabilities.