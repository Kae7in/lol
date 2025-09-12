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

describe('ASTEditor Working Tests', () => {
  let astEditor: ASTEditor;
  let sampleJSContent: string;
  let sampleHTMLContent: string;

  beforeEach(() => {
    astEditor = new ASTEditor();
    sampleJSContent = readFileSync(path.join(__dirname, '../fixtures/sample.js'), 'utf-8');
    sampleHTMLContent = readFileSync(path.join(__dirname, '../fixtures/sample.html'), 'utf-8');
  });

  describe('File Type Detection', () => {
    it('should correctly detect file extensions', () => {
      expect(astEditor.detectFileType('file.js')).toBe('js');
      expect(astEditor.detectFileType('component.jsx')).toBe('jsx');
      expect(astEditor.detectFileType('module.ts')).toBe('ts');
      expect(astEditor.detectFileType('App.tsx')).toBe('tsx');
      expect(astEditor.detectFileType('index.html')).toBe('html');
      expect(astEditor.detectFileType('styles.css')).toBe('css');
    });

    it('should suggest appropriate edit type', () => {
      expect(astEditor.suggestEditType('js')).toBe('ast');
      expect(astEditor.suggestEditType('html')).toBe('diff');
      expect(astEditor.suggestEditType('txt')).toBe('line');
    });
  });

  describe('Text-based Transformations (Fallback)', () => {
    let strategy: ASTEditStrategy;

    beforeEach(() => {
      strategy = new ASTEditStrategy();
    });

    it('should add code after a target using text fallback', () => {
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
      expect(result).toContain('checkCollisions();');
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

    it('should handle invalid JavaScript gracefully', () => {
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

  describe('DiffPatchStrategy', () => {
    let strategy: DiffPatchStrategy;

    beforeEach(() => {
      strategy = new DiffPatchStrategy();
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
  });

  describe('LineBasedStrategy', () => {
    let strategy: LineBasedStrategy;

    beforeEach(() => {
      strategy = new LineBasedStrategy();
    });

    it('should handle line-based operations', () => {
      const lines = sampleJSContent.split('\n');
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
  });

  describe('Integration Tests', () => {
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

    it('should apply text-based transformations to JavaScript', async () => {
      const edits: ASTEdit[] = [{
        file: 'test.js',
        type: 'ast',
        transformations: [
          {
            action: 'rename',
            target: 'update',
            value: 'gameUpdate'
          },
          {
            action: 'add-after',
            target: 'const player = new Player()',
            code: 'const scoreBoard = new ScoreBoard();'
          }
        ]
      }];

      const result = await astEditor.applyEdits(sampleJSContent, 'test.js', edits);
      expect(result).toContain('function gameUpdate()');
      expect(result).toContain('const scoreBoard = new ScoreBoard()');
    });

    it('should handle invalid JavaScript with text fallback', async () => {
      const invalidJS = 'function broken() { this is { invalid }';
      
      const edits: ASTEdit[] = [{
        file: 'broken.js',
        type: 'ast',
        transformations: [{
          action: 'replace',
          target: 'invalid',
          value: 'fixed'
        }]
      }];

      const result = await astEditor.applyEdits(invalidJS, 'broken.js', edits);
      expect(result).toContain('fixed');
      expect(result).not.toContain('invalid');
    });
  });

  describe('Error Handling', () => {
    it('should provide clear error messages', () => {
      const strategy = new ASTEditStrategy();
      const edit: ASTEdit = {
        file: 'test.js',
        type: 'ast'
      };

      expect(() => strategy.apply(sampleJSContent, edit))
        .toThrow('No transformations provided');
    });

    it('should handle missing patches gracefully', () => {
      const strategy = new DiffPatchStrategy();
      const edit: ASTEdit = {
        file: 'test.html',
        type: 'diff'
      };

      expect(() => strategy.apply(sampleHTMLContent, edit))
        .toThrow('No patches provided');
    });
  });

  describe('Real-world Scenarios', () => {
    it('should handle complex refactoring operations', async () => {
      const codeWithDuplicates = `
function processData() {
  validateInput();
  transformData();
  saveResults();
}

function handleRequest() {
  validateInput();
  transformData();
  saveResults();
}
`;

      const edits: ASTEdit[] = [{
        file: 'refactor.js',
        type: 'ast',
        transformations: [
          {
            action: 'replace',
            target: `  validateInput();
  transformData();
  saveResults();`,
            value: '  processStandardFlow();'
          }
        ]
      }];

      const result = await astEditor.applyEdits(codeWithDuplicates, 'refactor.js', edits);
      expect(result).toContain('processStandardFlow()');
      expect(result.match(/processStandardFlow/g)?.length).toBe(1);
    });

    it('should handle React component updates', async () => {
      const reactComponent = `
import React from 'react';

const Button = ({ onClick, children }) => {
  return (
    <button onClick={onClick}>
      {children}
    </button>
  );
};

export default Button;
`;

      const edits: ASTEdit[] = [{
        file: 'Button.jsx',
        type: 'ast',
        transformations: [
          {
            action: 'add-after',
            target: "const Button = ({ onClick, children }) => {",
            code: "  const [isClicked, setIsClicked] = useState(false);"
          },
          {
            action: 'replace',
            target: '<button onClick={onClick}>',
            value: '<button onClick={() => { setIsClicked(true); onClick(); }}>'
          }
        ]
      }];

      const result = await astEditor.applyEdits(reactComponent, 'Button.jsx', edits);
      expect(result).toContain('useState(false)');
      expect(result).toContain('setIsClicked(true)');
    });

    it('should handle configuration file updates', async () => {
      const configFile = `
export const config = {
  apiUrl: 'http://localhost:3000',
  timeout: 5000,
  retries: 3,
  debug: false
};
`;

      const edits: ASTEdit[] = [{
        file: 'config.js',
        type: 'ast',
        transformations: [
          {
            action: 'replace',
            target: "apiUrl: 'http://localhost:3000'",
            value: "apiUrl: 'https://api.production.com'"
          },
          {
            action: 'replace',
            target: 'debug: false',
            value: 'debug: true'
          }
        ]
      }];

      const result = await astEditor.applyEdits(configFile, 'config.js', edits);
      expect(result).toContain('https://api.production.com');
      expect(result).toContain('debug: true');
    });
  });
});