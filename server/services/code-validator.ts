import * as ts from 'typescript';
import * as acorn from 'acorn';

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  file: string;
  line: number;
  column: number;
  message: string;
  type: 'syntax' | 'type' | 'runtime';
}

export class CodeValidator {
  /**
   * Validate JavaScript code for syntax errors
   */
  validateJavaScript(code: string, filename: string): ValidationResult {
    const errors: ValidationError[] = [];
    
    try {
      // Use acorn for JavaScript parsing - it gives better error messages
      acorn.parse(code, {
        ecmaVersion: 'latest',
        sourceType: 'module',
        allowReturnOutsideFunction: true,
        allowImportExportEverywhere: true,
        allowAwaitOutsideFunction: true
      });
      
      return { valid: true, errors: [] };
    } catch (error: any) {
      // Parse the error to extract line and column
      const match = error.message.match(/\((\d+):(\d+)\)/);
      const line = match ? parseInt(match[1]) : 1;
      const column = match ? parseInt(match[2]) : 0;
      
      errors.push({
        file: filename,
        line,
        column,
        message: error.message.replace(/\(\d+:\d+\)/, '').trim(),
        type: 'syntax'
      });
      
      return { valid: false, errors };
    }
  }
  
  /**
   * Validate TypeScript code for syntax and type errors
   */
  validateTypeScript(code: string, filename: string): ValidationResult {
    const errors: ValidationError[] = [];
    
    try {
      const result = ts.transpileModule(code, {
        compilerOptions: {
          target: ts.ScriptTarget.ES2020,
          module: ts.ModuleKind.ESNext,
          jsx: ts.JsxEmit.React,
          strict: false,
          noEmit: true
        },
        reportDiagnostics: true
      });
      
      if (result.diagnostics && result.diagnostics.length > 0) {
        for (const diagnostic of result.diagnostics) {
          const { line, character } = diagnostic.file 
            ? ts.getLineAndCharacterOfPosition(diagnostic.file, diagnostic.start || 0)
            : { line: 0, character: 0 };
          
          errors.push({
            file: filename,
            line: line + 1, // Convert to 1-based
            column: character + 1,
            message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
            type: diagnostic.category === ts.DiagnosticCategory.Error ? 'type' : 'syntax'
          });
        }
      }
      
      return {
        valid: errors.length === 0,
        errors
      };
    } catch (error: any) {
      errors.push({
        file: filename,
        line: 1,
        column: 1,
        message: error.message,
        type: 'syntax'
      });
      
      return { valid: false, errors };
    }
  }
  
  /**
   * Validate HTML for basic syntax errors
   */
  validateHTML(code: string, filename: string): ValidationResult {
    const errors: ValidationError[] = [];
    
    // Basic HTML validation - check for unclosed tags
    const tagStack: { tag: string; line: number }[] = [];
    const lines = code.split('\n');
    
    const selfClosingTags = new Set([
      'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
      'link', 'meta', 'param', 'source', 'track', 'wbr'
    ]);
    
    lines.forEach((line, lineIndex) => {
      // Find opening tags
      const openingTags = line.matchAll(/<([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g);
      for (const match of openingTags) {
        const tagName = match[1].toLowerCase();
        if (!selfClosingTags.has(tagName) && !match[0].endsWith('/>')) {
          tagStack.push({ tag: tagName, line: lineIndex + 1 });
        }
      }
      
      // Find closing tags
      const closingTags = line.matchAll(/<\/([a-zA-Z][a-zA-Z0-9]*)>/g);
      for (const match of closingTags) {
        const tagName = match[1].toLowerCase();
        const lastTag = tagStack[tagStack.length - 1];
        
        if (!lastTag || lastTag.tag !== tagName) {
          errors.push({
            file: filename,
            line: lineIndex + 1,
            column: match.index || 0,
            message: `Unexpected closing tag </${tagName}>`,
            type: 'syntax'
          });
        } else {
          tagStack.pop();
        }
      }
    });
    
    // Check for unclosed tags
    for (const unclosed of tagStack) {
      errors.push({
        file: filename,
        line: unclosed.line,
        column: 0,
        message: `Unclosed tag <${unclosed.tag}>`,
        type: 'syntax'
      });
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  /**
   * Validate CSS for basic syntax errors
   */
  validateCSS(code: string, filename: string): ValidationResult {
    const errors: ValidationError[] = [];
    
    // Basic CSS validation - check for unclosed braces
    let braceCount = 0;
    const lines = code.split('\n');
    
    lines.forEach((line, lineIndex) => {
      for (let i = 0; i < line.length; i++) {
        if (line[i] === '{') {
          braceCount++;
        } else if (line[i] === '}') {
          braceCount--;
          if (braceCount < 0) {
            errors.push({
              file: filename,
              line: lineIndex + 1,
              column: i + 1,
              message: 'Unexpected closing brace }',
              type: 'syntax'
            });
            braceCount = 0; // Reset to continue checking
          }
        }
      }
    });
    
    if (braceCount > 0) {
      errors.push({
        file: filename,
        line: lines.length,
        column: 0,
        message: `${braceCount} unclosed brace(s)`,
        type: 'syntax'
      });
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  /**
   * Validate all files in a project
   */
  validateProject(files: Record<string, { content: string; type: string }>): {
    valid: boolean;
    errors: ValidationError[];
    errorSummary: string;
  } {
    const allErrors: ValidationError[] = [];
    
    for (const [filename, file] of Object.entries(files)) {
      let result: ValidationResult = { valid: true, errors: [] };
      
      switch (file.type) {
        case 'javascript':
          result = this.validateJavaScript(file.content, filename);
          break;
        case 'typescript':
          result = this.validateTypeScript(file.content, filename);
          break;
        case 'html':
          result = this.validateHTML(file.content, filename);
          break;
        case 'css':
          result = this.validateCSS(file.content, filename);
          break;
      }
      
      allErrors.push(...result.errors);
    }
    
    // Create error summary for context
    const errorSummary = allErrors.length > 0
      ? `Found ${allErrors.length} error(s):\n` +
        allErrors.map(e => `${e.file}:${e.line}:${e.column} - ${e.type} error: ${e.message}`).join('\n')
      : '';
    
    return {
      valid: allErrors.length === 0,
      errors: allErrors,
      errorSummary
    };
  }
}