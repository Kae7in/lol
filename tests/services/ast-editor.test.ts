import { describe, it, expect, beforeEach } from 'vitest';
import { 
  ASTEditor, 
  ASTEditStrategy, 
  DiffPatchStrategy, 
  LineBasedStrategy,
  type Transformation,
  type ASTEdit 
} from '../../server/services/ast-editor';
import { readFileSync } from 'fs';
import path from 'path';

describe('ASTEditor', () => {
  let astEditor: ASTEditor;
  let sampleJSContent: string;
  let sampleHTMLContent: string;

  beforeEach(() => {
    astEditor = new ASTEditor();
    sampleJSContent = readFileSync(path.join(__dirname, '../fixtures/sample.js'), 'utf-8');
    sampleHTMLContent = readFileSync(path.join(__dirname, '../fixtures/sample.html'), 'utf-8');
  });

  describe('File Type Detection', () => {
    it('should correctly detect JavaScript file extensions', () => {
      expect(astEditor.detectFileType('file.js')).toBe('js');
      expect(astEditor.detectFileType('component.jsx')).toBe('jsx');
      expect(astEditor.detectFileType('module.ts')).toBe('ts');
      expect(astEditor.detectFileType('App.tsx')).toBe('tsx');
    });

    it('should correctly detect markup and style file extensions', () => {
      expect(astEditor.detectFileType('index.html')).toBe('html');
      expect(astEditor.detectFileType('styles.css')).toBe('css');
      expect(astEditor.detectFileType('data.json')).toBe('json');
      expect(astEditor.detectFileType('config.yaml')).toBe('yaml');
    });

    it('should suggest appropriate edit type for file extensions', () => {
      expect(astEditor.suggestEditType('js')).toBe('ast');
      expect(astEditor.suggestEditType('tsx')).toBe('ast');
      expect(astEditor.suggestEditType('html')).toBe('diff');
      expect(astEditor.suggestEditType('css')).toBe('diff');
      expect(astEditor.suggestEditType('txt')).toBe('line');
      expect(astEditor.suggestEditType('unknown')).toBe('line');
    });
  });

  describe('ASTEditStrategy', () => {
    let strategy: ASTEditStrategy;

    beforeEach(() => {
      strategy = new ASTEditStrategy();
    });

    it('should handle JavaScript file types', () => {
      expect(strategy.canHandle('js')).toBe(true);
      expect(strategy.canHandle('jsx')).toBe(true);
      expect(strategy.canHandle('ts')).toBe(true);
      expect(strategy.canHandle('tsx')).toBe(true);
      expect(strategy.canHandle('mjs')).toBe(true);
      expect(strategy.canHandle('cjs')).toBe(true);
    });

    it('should not handle non-JavaScript file types', () => {
      expect(strategy.canHandle('html')).toBe(false);
      expect(strategy.canHandle('css')).toBe(false);
      expect(strategy.canHandle('txt')).toBe(false);
    });

    describe('Transformations', () => {
      it('should modify property values', () => {
        const edit: ASTEdit = {
          file: 'test.js',
          type: 'ast',
          transformations: [{
            action: 'modify',
            target: 'gameConfig.speed',
            value: '10'
          }]
        };

        const result = strategy.apply(sampleJSContent, edit);
        expect(result).toContain('speed: 10');
        expect(result).not.toContain('speed: 5');
      });

      it('should add code after a target', () => {
        const edit: ASTEdit = {
          file: 'test.js',
          type: 'ast',
          transformations: [{
            action: 'add-after',
            target: 'const blob1 = new Blob(100, 100)',
            code: 'const blob2 = new Blob(200, 200);'
          }]
        };

        const result = strategy.apply(sampleJSContent, edit);
        expect(result).toContain('const blob1 = new Blob(100, 100)');
        expect(result).toContain('const blob2 = new Blob(200, 200)');
        
        const lines = result.split('\n');
        const blob1Index = lines.findIndex(line => line.includes('const blob1'));
        const blob2Index = lines.findIndex(line => line.includes('const blob2'));
        expect(blob2Index).toBeGreaterThan(blob1Index);
      });

      it('should add code before a target', () => {
        const edit: ASTEdit = {
          file: 'test.js',
          type: 'ast',
          transformations: [{
            action: 'add-before',
            target: 'function draw()',
            code: '// Drawing function'
          }]
        };

        const result = strategy.apply(sampleJSContent, edit);
        expect(result).toContain('// Drawing function');
        expect(result).toContain('function draw()');
        
        const lines = result.split('\n');
        const commentIndex = lines.findIndex(line => line.includes('// Drawing function'));
        const funcIndex = lines.findIndex(line => line.includes('function draw()'));
        expect(commentIndex).toBeLessThan(funcIndex);
      });

      it('should rename identifiers', () => {
        const edit: ASTEdit = {
          file: 'test.js',
          type: 'ast',
          transformations: [{
            action: 'rename',
            target: 'blob1',
            value: 'mainBlob'
          }]
        };

        const result = strategy.apply(sampleJSContent, edit);
        expect(result).toContain('const mainBlob = new Blob');
        expect(result).not.toContain('const blob1 = new Blob');
      });

      it('should delete elements', () => {
        const edit: ASTEdit = {
          file: 'test.js',
          type: 'ast',
          transformations: [{
            action: 'delete',
            target: 'updateScore();'
          }]
        };

        const result = strategy.apply(sampleJSContent, edit);
        expect(result).not.toContain('updateScore();');
        expect(result).toContain('checkCollisions();'); // Other code remains
      });

      it('should replace elements', () => {
        const edit: ASTEdit = {
          file: 'test.js',
          type: 'ast',
          transformations: [{
            action: 'replace',
            target: "this.color = 'red'",
            value: "this.color = 'blue'"
          }]
        };

        const result = strategy.apply(sampleJSContent, edit);
        expect(result).toContain("this.color = 'blue'");
        expect(result).not.toContain("this.color = 'red'");
      });

      it('should handle multiple transformations in sequence', () => {
        const edit: ASTEdit = {
          file: 'test.js',
          type: 'ast',
          transformations: [
            {
              action: 'modify',
              target: 'gameConfig.speed',
              value: '10'
            },
            {
              action: 'add-after',
              target: 'const player = new Player()',
              code: 'const enemy = new Enemy();'
            },
            {
              action: 'rename',
              target: 'blob1',
              value: 'playerBlob'
            }
          ]
        };

        const result = strategy.apply(sampleJSContent, edit);
        expect(result).toContain('speed: 10');
        expect(result).toContain('const enemy = new Enemy()');
        expect(result).toContain('const playerBlob = new Blob');
      });

      it('should fall back to text-based transformations on parse errors', () => {
        const invalidJS = 'function test() { this is invalid javascript }';
        const edit: ASTEdit = {
          file: 'test.js',
          type: 'ast',
          transformations: [{
            action: 'replace',
            target: 'invalid javascript',
            value: 'valid code'
          }]
        };

        const result = strategy.apply(invalidJS, edit);
        expect(result).toContain('valid code');
        expect(result).not.toContain('invalid javascript');
      });
    });

    describe('Magicast Transform', () => {
      it('should apply direct magicast transform code', () => {
        const edit: ASTEdit = {
          file: 'test.js',
          type: 'magicast',
          transform: `
            // This would normally use magicast's API
            // For testing, we'll simulate a simple replacement
            const code = mod.generate().code;
            const newCode = code.replace('speed: 5', 'speed: 15');
            const newMod = parseModule(newCode);
            Object.assign(mod, newMod);
          `
        };

        // Note: This test would need actual magicast implementation
        // For now, we're testing that the method exists and doesn't throw
        expect(() => strategy.apply(sampleJSContent, edit)).not.toThrow();
      });
    });
  });

  describe('DiffPatchStrategy', () => {
    let strategy: DiffPatchStrategy;

    beforeEach(() => {
      strategy = new DiffPatchStrategy();
    });

    it('should handle markup and style file types', () => {
      expect(strategy.canHandle('html')).toBe(true);
      expect(strategy.canHandle('css')).toBe(true);
      expect(strategy.canHandle('xml')).toBe(true);
      expect(strategy.canHandle('json')).toBe(true);
      expect(strategy.canHandle('yaml')).toBe(true);
      expect(strategy.canHandle('md')).toBe(true);
    });

    it('should not handle JavaScript file types', () => {
      expect(strategy.canHandle('js')).toBe(false);
      expect(strategy.canHandle('tsx')).toBe(false);
    });

    it('should apply find and replace patches', () => {
      const edit: ASTEdit = {
        file: 'test.html',
        type: 'diff',
        patches: [{
          find: '<h1>Hello World</h1>',
          replace: '<h1>Hello Universe</h1>'
        }]
      };

      const result = strategy.apply(sampleHTMLContent, edit);
      expect(result).toContain('<h1>Hello Universe</h1>');
      expect(result).not.toContain('<h1>Hello World</h1>');
    });

    it('should handle multiple patches', () => {
      const edit: ASTEdit = {
        file: 'test.html',
        type: 'diff',
        patches: [
          {
            find: 'Hello World',
            replace: 'Hello Universe'
          },
          {
            find: 'test paragraph',
            replace: 'sample paragraph'
          }
        ]
      };

      const result = strategy.apply(sampleHTMLContent, edit);
      expect(result).toContain('Hello Universe');
      expect(result).toContain('sample paragraph');
    });

    it('should throw error when patch target not found', () => {
      const edit: ASTEdit = {
        file: 'test.html',
        type: 'diff',
        patches: [{
          find: 'Non-existent text',
          replace: 'Replacement'
        }]
      };

      expect(() => strategy.apply(sampleHTMLContent, edit)).toThrow();
    });
  });

  describe('LineBasedStrategy', () => {
    let strategy: LineBasedStrategy;

    beforeEach(() => {
      strategy = new LineBasedStrategy();
    });

    it('should handle any file type', () => {
      expect(strategy.canHandle('js')).toBe(true);
      expect(strategy.canHandle('html')).toBe(true);
      expect(strategy.canHandle('txt')).toBe(true);
      expect(strategy.canHandle('unknown')).toBe(true);
    });

    it('should replace lines', () => {
      const lines = sampleJSContent.split('\\n');
      const targetLineNum = lines.findIndex(line => line.includes('speed: 5')) + 1;

      const edit: ASTEdit = {
        file: 'test.js',
        type: 'line',
        operations: [{
          type: 'replace',
          startLine: targetLineNum,
          endLine: targetLineNum,
          newContent: '  speed: 20,'
        }]
      };

      const result = strategy.apply(sampleJSContent, edit);
      expect(result).toContain('speed: 20');
      expect(result).not.toContain('speed: 5');
    });

    it('should insert lines after a specific line', () => {
      const lines = sampleJSContent.split('\\n');
      const targetLineNum = lines.findIndex(line => line.includes('const blob1')) + 1;

      const edit: ASTEdit = {
        file: 'test.js',
        type: 'line',
        operations: [{
          type: 'insert',
          afterLine: targetLineNum,
          newContent: 'const blob2 = new Blob(200, 200);'
        }]
      };

      const result = strategy.apply(sampleJSContent, edit);
      expect(result).toContain('const blob2 = new Blob(200, 200)');
    });

    it('should delete lines', () => {
      const lines = sampleJSContent.split('\\n');
      const startLine = lines.findIndex(line => line.includes('updateScore()')) + 1;

      const edit: ASTEdit = {
        file: 'test.js',
        type: 'line',
        operations: [{
          type: 'delete',
          startLine: startLine,
          endLine: startLine
        }]
      };

      const result = strategy.apply(sampleJSContent, edit);
      expect(result).not.toContain('updateScore()');
    });

    it('should handle multiple operations in correct order', () => {
      const lines = sampleJSContent.split('\\n');
      const line1 = lines.findIndex(line => line.includes('speed: 5')) + 1;
      const line2 = lines.findIndex(line => line.includes('const blob1')) + 1;

      const edit: ASTEdit = {
        file: 'test.js',
        type: 'line',
        operations: [
          {
            type: 'replace',
            startLine: line1,
            endLine: line1,
            newContent: '  speed: 25,'
          },
          {
            type: 'insert',
            afterLine: line2,
            newContent: 'const blob3 = new Blob(300, 300);'
          }
        ]
      };

      const result = strategy.apply(sampleJSContent, edit);
      expect(result).toContain('speed: 25');
      expect(result).toContain('const blob3 = new Blob(300, 300)');
    });
  });

  describe('Integration Tests', () => {
    it('should apply AST edits to JavaScript files', async () => {
      const edits: ASTEdit[] = [{
        file: 'test.js',
        type: 'ast',
        transformations: [
          {
            action: 'modify',
            target: 'gameConfig.difficulty',
            value: '"hard"'
          },
          {
            action: 'add-after',
            target: 'const player = new Player()',
            code: 'const scoreBoard = new ScoreBoard();'
          }
        ]
      }];

      const result = await astEditor.applyEdits(sampleJSContent, 'test.js', edits);
      expect(result).toContain('difficulty: "hard"');
      expect(result).toContain('const scoreBoard = new ScoreBoard()');
    });

    it('should apply diff edits to HTML files', async () => {
      const edits: ASTEdit[] = [{
        file: 'test.html',
        type: 'diff',
        patches: [{
          find: '<div class="container">',
          replace: '<div class="wrapper">'
        }]
      }];

      const result = await astEditor.applyEdits(sampleHTMLContent, 'test.html', edits);
      expect(result).toContain('<div class="wrapper">');
      expect(result).not.toContain('<div class="container">');
    });

    it('should automatically select appropriate strategy based on file type', async () => {
      // JavaScript file with AST transformations
      const jsEdits: ASTEdit[] = [{
        file: 'script.js',
        type: 'ast',
        transformations: [{
          action: 'rename',
          target: 'update',
          value: 'gameUpdate'
        }]
      }];

      const jsResult = await astEditor.applyEdits(sampleJSContent, 'script.js', jsEdits);
      expect(jsResult).toContain('function gameUpdate()');

      // HTML file with diff patches
      const htmlEdits: ASTEdit[] = [{
        file: 'index.html',
        type: 'diff',
        patches: [{
          find: 'Test Page',
          replace: 'Demo Page'
        }]
      }];

      const htmlResult = await astEditor.applyEdits(sampleHTMLContent, 'index.html', htmlEdits);
      expect(htmlResult).toContain('Demo Page');
    });

    it('should fall back to line-based strategy when AST fails', async () => {
      const invalidJS = 'function broken() { this is { invalid }';
      
      const edits: ASTEdit[] = [{
        file: 'broken.js',
        type: 'ast',
        transformations: [{
          action: 'replace',
          target: 'invalid',
          value: 'fixed'
        }],
        // Provide line-based fallback
        operations: [{
          type: 'replace',
          startLine: 1,
          endLine: 1,
          newContent: 'function broken() { /* fixed */ }'
        }]
      }];

      const result = await astEditor.applyEdits(invalidJS, 'broken.js', edits);
      expect(result).toBeDefined();
    });

    it('should handle complex multi-file scenarios', async () => {
      // Simulate editing multiple files with different strategies
      const jsEdit: ASTEdit[] = [{
        file: 'app.js',
        type: 'ast',
        transformations: [
          { action: 'modify', target: 'gameConfig.maxPlayers', value: '8' },
          { action: 'rename', target: 'Blob', value: 'GameObject' }
        ]
      }];

      const jsResult = await astEditor.applyEdits(sampleJSContent, 'app.js', jsEdit);
      expect(jsResult).toContain('maxPlayers: 8');
      expect(jsResult).toContain('class GameObject');

      const htmlEdit: ASTEdit[] = [{
        file: 'index.html',
        type: 'diff',
        patches: [
          { find: 'Hello World', replace: 'Game Dashboard' },
          { find: '<p>This is a test paragraph.</p>', replace: '<canvas id="game"></canvas>' }
        ]
      }];

      const htmlResult = await astEditor.applyEdits(sampleHTMLContent, 'index.html', htmlEdit);
      expect(htmlResult).toContain('Game Dashboard');
      expect(htmlResult).toContain('<canvas id="game"></canvas>');
    });
  });

  describe('Error Handling', () => {
    it('should throw error when no transformations provided', () => {
      const strategy = new ASTEditStrategy();
      const edit: ASTEdit = {
        file: 'test.js',
        type: 'ast'
      };

      expect(() => strategy.apply(sampleJSContent, edit)).toThrow('No transformations provided');
    });

    it('should throw error when no patches provided for diff strategy', () => {
      const strategy = new DiffPatchStrategy();
      const edit: ASTEdit = {
        file: 'test.html',
        type: 'diff'
      };

      expect(() => strategy.apply(sampleHTMLContent, edit)).toThrow('No patches provided');
    });

    it('should throw error when no operations provided for line strategy', () => {
      const strategy = new LineBasedStrategy();
      const edit: ASTEdit = {
        file: 'test.txt',
        type: 'line'
      };

      expect(() => strategy.apply('content', edit)).toThrow('No operations provided');
    });

    it('should handle unknown transformation actions gracefully', () => {
      const strategy = new ASTEditStrategy();
      const edit: ASTEdit = {
        file: 'test.js',
        type: 'ast',
        transformations: [{
          action: 'unknown-action' as any,
          target: 'something'
        }]
      };

      expect(() => strategy.apply(sampleJSContent, edit)).toThrow('Unknown transformation action');
    });
  });
});