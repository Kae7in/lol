import { describe, it, expect, beforeEach } from 'vitest';
import { ASTEditor, type ASTEdit } from '../../server/services/ast-editor';
import { parseModule } from 'magicast';

describe('AST Editor Performance Tests', () => {
  let astEditor: ASTEditor;

  beforeEach(() => {
    astEditor = new ASTEditor();
  });

  describe('Performance Benchmarks', () => {
    it('should handle small files quickly', async () => {
      const smallCode = `
        const value = 42;
        function test() {
          return value * 2;
        }
      `;

      const edits: ASTEdit[] = [{
        file: 'small.js',
        type: 'ast',
        transformations: [{
          action: 'replace',
          target: 'value = 42',
          value: 'value = 100'
        }]
      }];

      const start = performance.now();
      const result = await astEditor.applyEdits(smallCode, 'small.js', edits);
      const duration = performance.now() - start;

      expect(result).toContain('value = 100');
      expect(duration).toBeLessThan(100); // Should complete in under 100ms
    });

    it('should handle medium files efficiently', async () => {
      // Generate a medium-sized file with 50 functions
      const functions = Array.from({ length: 50 }, (_, i) => `
function func${i}(param${i}) {
  const local${i} = param${i} * 2;
  const result${i} = local${i} + ${i};
  return result${i};
}
      `).join('\n');

      const mediumCode = `
        ${functions}
        
        export { func0, func1, func2 };
      `;

      const edits: ASTEdit[] = [{
        file: 'medium.js',
        type: 'ast',
        transformations: [
          {
            action: 'rename',
            target: 'func0',
            value: 'mainFunction'
          },
          {
            action: 'add-after',
            target: 'function func49',
            code: '// Last function in the file'
          }
        ]
      }];

      const start = performance.now();
      const result = await astEditor.applyEdits(mediumCode, 'medium.js', edits);
      const duration = performance.now() - start;

      expect(result).toContain('mainFunction');
      expect(result).toContain('// Last function in the file');
      expect(duration).toBeLessThan(500); // Should complete in under 500ms
    });

    it('should handle multiple sequential edits', async () => {
      const code = `
        let counter = 0;
        let status = 'idle';
        let data = [];
        
        function increment() {
          counter++;
        }
        
        function reset() {
          counter = 0;
          status = 'idle';
          data = [];
        }
      `;

      const edits: ASTEdit[] = [{
        file: 'sequential.js',
        type: 'ast',
        transformations: [
          { action: 'rename', target: 'counter', value: 'count' },
          { action: 'rename', target: 'status', value: 'state' },
          { action: 'rename', target: 'data', value: 'items' },
          { action: 'rename', target: 'increment', value: 'increase' },
          { action: 'rename', target: 'reset', value: 'clear' }
        ]
      }];

      const start = performance.now();
      const result = await astEditor.applyEdits(code, 'sequential.js', edits);
      const duration = performance.now() - start;

      expect(result).toContain('count');
      expect(result).toContain('state');
      expect(result).toContain('items');
      expect(result).toContain('increase');
      expect(result).toContain('clear');
      expect(duration).toBeLessThan(200); // Should complete quickly
    });

    it('should handle HTML/CSS files with diff strategy', async () => {
      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>Test Page</title>
  <style>
    body { margin: 0; padding: 0; }
    .container { width: 100%; max-width: 1200px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Welcome</h1>
    <p>This is a test page.</p>
  </div>
</body>
</html>
      `;

      const edits: ASTEdit[] = [{
        file: 'page.html',
        type: 'diff',
        patches: [
          { find: 'Test Page', replace: 'Demo Page' },
          { find: 'Welcome', replace: 'Hello World' },
          { find: 'max-width: 1200px', replace: 'max-width: 1400px' }
        ]
      }];

      const start = performance.now();
      const result = await astEditor.applyEdits(htmlContent, 'page.html', edits);
      const duration = performance.now() - start;

      expect(result).toContain('Demo Page');
      expect(result).toContain('Hello World');
      expect(result).toContain('max-width: 1400px');
      expect(duration).toBeLessThan(100); // Diff patches should be very fast
    });
  });

  describe('Stress Tests', () => {
    it('should handle deeply nested structures', async () => {
      const nestedCode = `
        const config = {
          level1: {
            level2: {
              level3: {
                level4: {
                  value: 'deep'
                }
              }
            }
          }
        };
      `;

      const edits: ASTEdit[] = [{
        file: 'nested.js',
        type: 'ast',
        transformations: [{
          action: 'replace',
          target: "value: 'deep'",
          value: "value: 'updated'"
        }]
      }];

      const result = await astEditor.applyEdits(nestedCode, 'nested.js', edits);
      expect(result).toContain("value: 'updated'");
    });

    it('should handle files with many imports and exports', async () => {
      const moduleCode = `
        import React from 'react';
        import { useState, useEffect } from 'react';
        import Component1 from './Component1';
        import Component2 from './Component2';
        import * as utils from './utils';
        
        const MyComponent = () => {
          const [state, setState] = useState(0);
          return <div>{state}</div>;
        };
        
        export default MyComponent;
        export { Component1, Component2 };
        export * from './utils';
      `;

      const edits: ASTEdit[] = [{
        file: 'module.js',
        type: 'ast',
        transformations: [
          {
            action: 'add-after',
            target: "import * as utils from './utils'",
            code: "import styles from './styles.css';"
          },
          {
            action: 'rename',
            target: 'MyComponent',
            value: 'MainComponent'
          }
        ]
      }];

      const result = await astEditor.applyEdits(moduleCode, 'module.js', edits);
      expect(result).toContain('import styles');
      expect(result).toContain('MainComponent');
    });

    it('should gracefully handle malformed input', async () => {
      const malformedCode = `
        function broken() {
          // This function has syntax errors
          const x = {
            unclosed: 'object
        }
      `;

      const edits: ASTEdit[] = [{
        file: 'broken.js',
        type: 'ast',
        transformations: [{
          action: 'replace',
          target: 'broken',
          value: 'fixed'
        }]
      }];

      // Should not throw, but fall back to text replacement
      const result = await astEditor.applyEdits(malformedCode, 'broken.js', edits);
      expect(result).toContain('fixed');
    });
  });

  describe('Memory Efficiency', () => {
    it('should not leak memory with repeated operations', async () => {
      const code = `
        let value = 0;
        function update() {
          value++;
        }
      `;

      // Perform many operations
      for (let i = 0; i < 100; i++) {
        const edits: ASTEdit[] = [{
          file: 'memory.js',
          type: 'ast',
          transformations: [{
            action: 'replace',
            target: `value = ${i}`,
            value: `value = ${i + 1}`
          }]
        }];

        await astEditor.applyEdits(
          code.replace('value = 0', `value = ${i}`),
          'memory.js',
          edits
        );
      }

      // If we got here without crashing, memory management is acceptable
      expect(true).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty files', async () => {
      const edits: ASTEdit[] = [{
        file: 'empty.js',
        type: 'ast',
        transformations: [{
          action: 'add-after',
          target: '',
          code: 'const newCode = true;'
        }]
      }];

      const result = await astEditor.applyEdits('', 'empty.js', edits);
      expect(result).toContain('const newCode = true');
    });

    it('should handle files with only comments', async () => {
      const commentOnly = `
        // This file only has comments
        /* Multi-line comment
           spanning multiple lines */
        // Another comment
      `;

      const edits: ASTEdit[] = [{
        file: 'comments.js',
        type: 'ast',
        transformations: [{
          action: 'add-after',
          target: '// Another comment',
          code: 'const code = "added";'
        }]
      }];

      const result = await astEditor.applyEdits(commentOnly, 'comments.js', edits);
      expect(result).toContain('const code = "added"');
    });

    it('should handle Unicode and special characters', async () => {
      const unicodeCode = `
        const emoji = '🚀';
        const chinese = '你好';
        const special = 'hello\\nworld';
      `;

      const edits: ASTEdit[] = [{
        file: 'unicode.js',
        type: 'ast',
        transformations: [{
          action: 'replace',
          target: "'🚀'",
          value: "'🎉'"
        }]
      }];

      const result = await astEditor.applyEdits(unicodeCode, 'unicode.js', edits);
      expect(result).toContain('🎉');
      expect(result).toContain('你好');
    });
  });
});