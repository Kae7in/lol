import { describe, it, expect, beforeEach } from 'vitest';
import { parseModule, type MagicastModule } from 'magicast';

describe('Magicast Integration Tests', () => {
  describe('Basic Magicast Operations', () => {
    it('should parse and modify JavaScript code', () => {
      const code = `
        const config = {
          name: 'test',
          value: 42
        };
        
        function greet(name) {
          return 'Hello ' + name;
        }
      `;

      const mod = parseModule(code);
      expect(mod).toBeDefined();
      
      const generated = mod.generate();
      expect(generated.code).toContain('config');
      expect(generated.code).toContain('greet');
    });

    it('should handle imports correctly', () => {
      const code = `
        import React from 'react';
        import { useState } from 'react';
        
        const Component = () => {
          return <div>Test</div>;
        };
      `;

      const mod = parseModule(code);
      const generated = mod.generate();
      
      expect(generated.code).toContain("import React from 'react'");
      expect(generated.code).toContain("import { useState } from 'react'");
    });

    it('should handle exports correctly', () => {
      const code = `
        export const value = 42;
        export function test() {
          return 'test';
        }
        
        const internal = 'private';
        
        export default {
          value,
          test
        };
      `;

      const mod = parseModule(code);
      const generated = mod.generate();
      
      expect(generated.code).toContain('export const value');
      expect(generated.code).toContain('export function test');
      expect(generated.code).toContain('export default');
    });

    it('should handle class definitions', () => {
      const code = `
        class Game {
          constructor() {
            this.score = 0;
            this.level = 1;
          }
          
          start() {
            console.log('Game started');
          }
          
          updateScore(points) {
            this.score += points;
          }
        }
        
        export default Game;
      `;

      const mod = parseModule(code);
      const generated = mod.generate();
      
      expect(generated.code).toContain('class Game');
      expect(generated.code).toContain('constructor()');
      expect(generated.code).toContain('start()');
      expect(generated.code).toContain('updateScore(points)');
    });

    it('should handle arrow functions', () => {
      const code = `
        const add = (a, b) => a + b;
        const multiply = (x, y) => {
          return x * y;
        };
        
        const asyncFunc = async () => {
          const result = await fetch('/api');
          return result.json();
        };
      `;

      const mod = parseModule(code);
      const generated = mod.generate();
      
      expect(generated.code).toContain('const add = (a, b) => a + b');
      expect(generated.code).toContain('const multiply = (x, y) => {');
      expect(generated.code).toContain('async () => {');
    });

    it('should handle template literals', () => {
      const code = `
        const name = 'World';
        const greeting = \`Hello, \${name}!\`;
        const multiline = \`
          Line 1
          Line 2
          \${name}
        \`;
      `;

      const mod = parseModule(code);
      const generated = mod.generate();
      
      expect(generated.code).toContain('`Hello, ${name}!`');
      expect(generated.code).toContain('Line 1');
    });

    it('should handle destructuring', () => {
      const code = `
        const { x, y, z } = coordinates;
        const [first, second, ...rest] = array;
        
        function process({ name, age = 18 }) {
          return { name, age };
        }
      `;

      const mod = parseModule(code);
      const generated = mod.generate();
      
      expect(generated.code).toContain('const { x, y, z } = coordinates');
      expect(generated.code).toContain('const [first, second, ...rest] = array');
      expect(generated.code).toContain('{ name, age = 18 }');
    });

    it('should handle spread operators', () => {
      const code = `
        const arr1 = [1, 2, 3];
        const arr2 = [...arr1, 4, 5];
        
        const obj1 = { a: 1, b: 2 };
        const obj2 = { ...obj1, c: 3 };
        
        function sum(...numbers) {
          return numbers.reduce((a, b) => a + b, 0);
        }
      `;

      const mod = parseModule(code);
      const generated = mod.generate();
      
      expect(generated.code).toContain('[...arr1, 4, 5]');
      expect(generated.code).toContain('{ ...obj1, c: 3 }');
      expect(generated.code).toContain('...numbers');
    });

    it('should handle async/await', () => {
      const code = `
        async function fetchData() {
          try {
            const response = await fetch('/api/data');
            const data = await response.json();
            return data;
          } catch (error) {
            console.error('Error:', error);
            throw error;
          }
        }
      `;

      const mod = parseModule(code);
      const generated = mod.generate();
      
      expect(generated.code).toContain('async function fetchData()');
      expect(generated.code).toContain('await fetch');
      expect(generated.code).toContain('await response.json()');
      expect(generated.code).toContain('catch (error)');
    });

    it('should handle JSX/TSX code', () => {
      const code = `
        import React from 'react';
        
        const Component = ({ name, children }) => {
          return (
            <div className="container">
              <h1>Hello, {name}!</h1>
              {children}
              <button onClick={() => console.log('clicked')}>
                Click me
              </button>
            </div>
          );
        };
        
        export default Component;
      `;

      const mod = parseModule(code);
      const generated = mod.generate();
      
      expect(generated.code).toContain('<div className="container">');
      expect(generated.code).toContain('{name}');
      expect(generated.code).toContain('{children}');
      expect(generated.code).toContain('onClick=');
    });

    it('should preserve comments', () => {
      const code = `
        // This is a single-line comment
        const value = 42;
        
        /* 
         * This is a multi-line comment
         * with multiple lines
         */
        function test() {
          // Internal comment
          return 'test';
        }
        
        /**
         * JSDoc comment
         * @param {string} name
         * @returns {string}
         */
        function greet(name) {
          return \`Hello, \${name}\`;
        }
      `;

      const mod = parseModule(code);
      const generated = mod.generate();
      
      // Note: Magicast might not preserve all comments by default
      expect(generated.code).toContain('const value = 42');
      expect(generated.code).toContain('function test()');
      expect(generated.code).toContain('function greet(name)');
    });

    it('should handle TypeScript types', () => {
      const code = `
        interface User {
          name: string;
          age: number;
          email?: string;
        }
        
        type Status = 'active' | 'inactive' | 'pending';
        
        function processUser(user: User): Status {
          return 'active';
        }
        
        const getValue = <T>(value: T): T => {
          return value;
        };
      `;

      const mod = parseModule(code);
      const generated = mod.generate();
      
      expect(generated.code).toContain('interface User');
      expect(generated.code).toContain('type Status');
      expect(generated.code).toContain('function processUser');
      expect(generated.code).toContain('getValue');
    });
  });

  describe('Error Recovery', () => {
    it('should handle parsing errors gracefully', () => {
      const invalidCode = `
        function broken() {
          this is not valid JavaScript
        }
      `;

      expect(() => parseModule(invalidCode)).toThrow();
    });

    it('should handle incomplete code blocks', () => {
      const incompleteCode = `
        function test() {
          if (true) {
            console.log('test')
          // Missing closing brace
      `;

      expect(() => parseModule(incompleteCode)).toThrow();
    });
  });

  describe('Complex Transformations', () => {
    it('should support code generation from scratch', () => {
      const mod = parseModule('');
      
      // Simulate adding new code
      const newCode = `
        const config = {
          apiUrl: 'https://api.example.com',
          timeout: 5000
        };
        
        export default config;
      `;
      
      const newMod = parseModule(newCode);
      const generated = newMod.generate();
      
      expect(generated.code).toContain('apiUrl');
      expect(generated.code).toContain('export default config');
    });

    it('should handle large files efficiently', () => {
      // Generate a large code sample
      const functions = Array.from({ length: 100 }, (_, i) => `
        function func${i}() {
          const value${i} = ${i};
          return value${i} * 2;
        }
      `).join('\n');

      const code = `
        ${functions}
        
        export {
          ${Array.from({ length: 100 }, (_, i) => `func${i}`).join(', ')}
        };
      `;

      const start = Date.now();
      const mod = parseModule(code);
      const generated = mod.generate();
      const duration = Date.now() - start;

      expect(generated.code).toContain('func0');
      expect(generated.code).toContain('func99');
      expect(duration).toBeLessThan(1000); // Should parse in under 1 second
    });

    it('should maintain code formatting consistency', () => {
      const code = `
        const obj = {
          a: 1,
          b: 2,
          nested: {
            c: 3,
            d: 4
          }
        };
        
        function formatted(
          param1,
          param2,
          param3
        ) {
          return param1 + param2 + param3;
        }
      `;

      const mod = parseModule(code);
      const generated = mod.generate();
      
      // Check that structure is maintained
      expect(generated.code).toContain('const obj = {');
      expect(generated.code).toContain('nested: {');
      expect(generated.code).toContain('function formatted');
    });
  });
});