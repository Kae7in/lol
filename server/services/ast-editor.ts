import { parseModule, type MagicastModule } from 'magicast';
import DiffMatchPatch from 'diff-match-patch';
import path from 'path';

export interface Transformation {
  action: 'modify' | 'add-after' | 'add-before' | 'rename' | 'extract-function' | 
          'wrap-in-condition' | 'insert-in' | 'delete' | 'replace';
  target: string;
  value?: string;
  code?: string;
  position?: 'start' | 'end' | 'before' | 'after';
}

export interface ASTEdit {
  file: string;
  type: 'ast' | 'magicast' | 'diff' | 'line';
  transformations?: Transformation[];
  transform?: string;
  patches?: any[];
  operations?: any[];
}

export interface EditStrategy {
  canHandle(fileType: string): boolean;
  apply(content: string, edit: ASTEdit): string;
}

export class ASTEditStrategy implements EditStrategy {
  canHandle(fileType: string): boolean {
    return ['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs'].includes(fileType);
  }

  apply(content: string, edit: ASTEdit): string {
    try {
      if (edit.transform) {
        return this.applyMagicastTransform(content, edit.transform);
      }
      
      if (edit.transformations) {
        return this.applyTransformations(content, edit.transformations);
      }
      
      throw new Error('No transformations provided for AST edit');
    } catch (error: any) {
      // If AST parsing fails due to syntax errors, fall back to text-based replacement
      if (error.code === 'BABEL_PARSER_SYNTAX_ERROR' || error.message?.includes('Unexpected token')) {
        console.log('AST parsing failed due to syntax error, falling back to text-based replacement');
        return this.applyTextBasedTransformations(content, edit.transformations || []);
      }
      throw error;
    }
  }

  private applyMagicastTransform(content: string, transform: string): string {
    const mod = parseModule(content);
    
    const transformFunction = new Function('mod', transform);
    transformFunction(mod);
    
    return mod.generate().code;
  }

  private applyTextBasedTransformations(content: string, transformations: Transformation[]): string {
    let result = content;
    
    for (const transform of transformations) {
      switch (transform.action) {
        case 'replace':
        case 'modify':
          if (transform.target && (transform.code || transform.value)) {
            const replacement = transform.code || transform.value || '';
            // Try to find and replace the target pattern
            if (result.includes(transform.target)) {
              result = result.replace(transform.target, replacement);
            } else {
              // If exact match not found, try to be smart about it
              console.log(`Warning: Could not find exact match for "${transform.target}", attempting fuzzy match`);
              // For function replacements, try to match the function signature
              if (transform.target.includes('function ')) {
                const funcName = transform.target.match(/function\s+(\w+)/)?.[1];
                if (funcName) {
                  const funcRegex = new RegExp(`function\\s+${funcName}\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}`, 'g');
                  result = result.replace(funcRegex, replacement);
                }
              }
            }
          }
          break;
          
        case 'delete':
          if (transform.target) {
            // For duplicated blocks, remove all occurrences
            const pattern = transform.target;
            
            // If it looks like a function or block, try to remove the entire block
            if (pattern.includes('function ') || pattern.includes('{')) {
              // Try to match and remove complete blocks
              const funcMatch = pattern.match(/function\s+(\w+)/);
              if (funcMatch) {
                const funcName = funcMatch[1];
                // Remove all duplicated function definitions
                const funcRegex = new RegExp(`function\\s+${funcName}\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}`, 'g');
                const matches = result.match(funcRegex);
                if (matches && matches.length > 1) {
                  // Keep only the first occurrence
                  let firstFound = false;
                  result = result.replace(funcRegex, (match) => {
                    if (!firstFound) {
                      firstFound = true;
                      return match;
                    }
                    return ''; // Remove duplicates
                  });
                }
              } else {
                // For duplicated code blocks, remove exact duplicates
                const lines = result.split('\n');
                const seen = new Set();
                const filteredLines = [];
                let inDuplicateBlock = false;
                
                for (const line of lines) {
                  const trimmed = line.trim();
                  // Check for duplicate block starts
                  if (trimmed === transform.target.trim() || line.includes(transform.target)) {
                    if (seen.has(trimmed)) {
                      inDuplicateBlock = true;
                      continue; // Skip duplicate
                    }
                    seen.add(trimmed);
                  }
                  
                  if (!inDuplicateBlock) {
                    filteredLines.push(line);
                  }
                  
                  // End of block detection
                  if (inDuplicateBlock && trimmed === '}') {
                    inDuplicateBlock = false;
                  }
                }
                result = filteredLines.join('\n');
              }
            } else {
              // Simple line removal for non-block targets
              const lines = result.split('\n');
              const filteredLines = lines.filter(line => !line.includes(transform.target));
              result = filteredLines.join('\n');
            }
          }
          break;
          
        case 'add-after':
          if (transform.target && (transform.code || transform.value)) {
            const lines = result.split('\n');
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].includes(transform.target)) {
                lines.splice(i + 1, 0, transform.code || transform.value || '');
                break;
              }
            }
            result = lines.join('\n');
          }
          break;
          
        case 'add-before':
          if (transform.target && (transform.code || transform.value)) {
            const lines = result.split('\n');
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].includes(transform.target)) {
                lines.splice(i, 0, transform.code || transform.value || '');
                break;
              }
            }
            result = lines.join('\n');
          }
          break;
          
        default:
          console.log(`Skipping unsupported transformation in text mode: ${transform.action}`);
      }
    }
    
    return result;
  }

  private applyTransformations(content: string, transformations: Transformation[]): string {
    const mod = parseModule(content);
    
    for (const transform of transformations) {
      switch (transform.action) {
        case 'modify':
          this.modifyProperty(mod, transform);
          break;
        case 'add-after':
          this.addAfter(mod, transform);
          break;
        case 'add-before':
          this.addBefore(mod, transform);
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
        case 'insert-in':
          this.insertIn(mod, transform);
          break;
        case 'delete':
          this.deleteElement(mod, transform);
          break;
        case 'replace':
          this.replaceElement(mod, transform);
          break;
        default:
          throw new Error(`Unknown transformation action: ${transform.action}`);
      }
    }
    
    return mod.generate().code;
  }

  private modifyProperty(mod: MagicastModule, transform: Transformation) {
    const pathSegments = transform.target.split('.');
    let current: any = mod;
    
    for (let i = 0; i < pathSegments.length - 1; i++) {
      const segment = pathSegments[i];
      
      if (segment.includes('(')) {
        const [funcName] = segment.split('(');
        current = this.findFunction(current, funcName);
      } else if (segment === 'class' && pathSegments[i + 1]) {
        current = this.findClass(current, pathSegments[i + 1]);
        i++;
      } else {
        current = current[segment];
      }
      
      if (!current) {
        throw new Error(`Cannot find target: ${transform.target}`);
      }
    }
    
    const lastSegment = pathSegments[pathSegments.length - 1];
    
    if (transform.value !== undefined) {
      try {
        current[lastSegment] = JSON.parse(transform.value);
      } catch {
        current[lastSegment] = transform.value;
      }
    } else if (transform.code) {
      current[lastSegment] = transform.code;
    }
  }

  private addAfter(mod: MagicastModule, transform: Transformation) {
    const targetPattern = transform.target;
    const newCode = transform.code || transform.value || '';
    
    const modString = mod.generate().code;
    const lines = modString.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(targetPattern)) {
        lines.splice(i + 1, 0, newCode);
        break;
      }
    }
    
    const newContent = lines.join('\n');
    const newMod = parseModule(newContent);
    Object.assign(mod, newMod);
  }

  private addBefore(mod: MagicastModule, transform: Transformation) {
    const targetPattern = transform.target;
    const newCode = transform.code || transform.value || '';
    
    const modString = mod.generate().code;
    const lines = modString.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(targetPattern)) {
        lines.splice(i, 0, newCode);
        break;
      }
    }
    
    const newContent = lines.join('\n');
    const newMod = parseModule(newContent);
    Object.assign(mod, newMod);
  }

  private renameIdentifier(mod: MagicastModule, transform: Transformation) {
    const oldName = transform.target;
    const newName = transform.value || '';
    
    const code = mod.generate().code;
    const regex = new RegExp(`\\b${oldName}\\b`, 'g');
    const newCode = code.replace(regex, newName);
    
    const newMod = parseModule(newCode);
    Object.assign(mod, newMod);
  }

  private extractFunction(mod: MagicastModule, transform: Transformation) {
    throw new Error('Extract function not yet implemented');
  }

  private wrapInCondition(mod: MagicastModule, transform: Transformation) {
    const targetCode = transform.target;
    const condition = transform.value || 'true';
    
    const code = mod.generate().code;
    const wrappedCode = code.replace(targetCode, `
      if (${condition}) {
        ${targetCode}
      }
    `);
    
    const newMod = parseModule(wrappedCode);
    Object.assign(mod, newMod);
  }

  private insertIn(mod: MagicastModule, transform: Transformation) {
    const targetFunc = transform.target;
    const position = transform.position || 'end';
    const codeToInsert = transform.code || '';
    
    const funcMatch = targetFunc.match(/function\s+(\w+)|(\w+)\s*\(/);
    if (!funcMatch) {
      throw new Error(`Cannot parse function target: ${targetFunc}`);
    }
    
    const funcName = funcMatch[1] || funcMatch[2];
    const func = this.findFunction(mod, funcName);
    
    if (!func) {
      throw new Error(`Cannot find function: ${funcName}`);
    }
    
    const currentBody = func.body || '';
    
    if (position === 'start') {
      func.body = codeToInsert + '\n' + currentBody;
    } else {
      func.body = currentBody + '\n' + codeToInsert;
    }
  }

  private deleteElement(mod: MagicastModule, transform: Transformation) {
    const code = mod.generate().code;
    const lines = code.split('\n');
    const filteredLines = lines.filter(line => !line.includes(transform.target));
    
    const newMod = parseModule(filteredLines.join('\n'));
    Object.assign(mod, newMod);
  }

  private replaceElement(mod: MagicastModule, transform: Transformation) {
    const code = mod.generate().code;
    const newCode = code.replace(transform.target, transform.code || transform.value || '');
    
    const newMod = parseModule(newCode);
    Object.assign(mod, newMod);
  }

  private findFunction(obj: any, name: string): any {
    if (obj && typeof obj === 'object') {
      for (const key in obj) {
        if (key === name && typeof obj[key] === 'function') {
          return obj[key];
        }
        
        const found = this.findFunction(obj[key], name);
        if (found) return found;
      }
    }
    return null;
  }

  private findClass(obj: any, name: string): any {
    if (obj && typeof obj === 'object') {
      for (const key in obj) {
        if (key === name && obj[key].constructor) {
          return obj[key];
        }
        
        const found = this.findClass(obj[key], name);
        if (found) return found;
      }
    }
    return null;
  }
}

export class DiffPatchStrategy implements EditStrategy {
  private dmp: DiffMatchPatch;

  constructor() {
    this.dmp = new DiffMatchPatch.diff_match_patch();
  }

  canHandle(fileType: string): boolean {
    return ['html', 'css', 'scss', 'less', 'xml', 'json', 'yaml', 'yml', 'md', 'txt'].includes(fileType);
  }

  apply(content: string, edit: ASTEdit): string {
    if (!edit.patches || !Array.isArray(edit.patches)) {
      throw new Error('No patches provided for diff-based edit');
    }

    let result = content;
    
    for (const patch of edit.patches) {
      if (typeof patch === 'string') {
        const patches = this.dmp.patch_fromText(patch);
        const [newContent, results] = this.dmp.patch_apply(patches, result);
        
        const allSucceeded = results.every(r => r);
        if (!allSucceeded) {
          throw new Error('Failed to apply patch');
        }
        
        result = newContent;
      } else if (patch.find && patch.replace) {
        const diffs = this.dmp.diff_main(patch.find, patch.replace);
        this.dmp.diff_cleanupSemantic(diffs);
        const patches = this.dmp.patch_make(patch.find, diffs);
        
        const searchStart = result.indexOf(patch.find);
        if (searchStart === -1) {
          throw new Error(`Could not find text to patch: ${patch.find.substring(0, 50)}...`);
        }
        
        const before = result.substring(0, searchStart);
        const after = result.substring(searchStart + patch.find.length);
        result = before + patch.replace + after;
      }
    }

    return result;
  }
}

export class LineBasedStrategy implements EditStrategy {
  canHandle(fileType: string): boolean {
    return true;
  }

  apply(content: string, edit: ASTEdit): string {
    if (!edit.operations || !Array.isArray(edit.operations)) {
      throw new Error('No operations provided for line-based edit');
    }

    const lines = content.split('\n');
    
    const sortedOps = [...edit.operations].sort((a, b) => {
      const lineA = a.startLine || a.afterLine || a.beforeLine || 0;
      const lineB = b.startLine || b.afterLine || b.beforeLine || 0;
      return lineB - lineA;
    });

    for (const op of sortedOps) {
      switch (op.type) {
        case 'replace':
          if (op.startLine !== undefined && op.endLine !== undefined) {
            const start = op.startLine - 1;
            const deleteCount = op.endLine - op.startLine + 1;
            lines.splice(start, deleteCount, ...op.newContent.split('\n'));
          }
          break;
          
        case 'insert':
          if (op.afterLine !== undefined) {
            lines.splice(op.afterLine, 0, ...op.newContent.split('\n'));
          } else if (op.beforeLine !== undefined) {
            lines.splice(op.beforeLine - 1, 0, ...op.newContent.split('\n'));
          }
          break;
          
        case 'delete':
          if (op.startLine !== undefined && op.endLine !== undefined) {
            const start = op.startLine - 1;
            const deleteCount = op.endLine - op.startLine + 1;
            lines.splice(start, deleteCount);
          }
          break;
          
        default:
          throw new Error(`Unknown operation type: ${op.type}`);
      }
    }

    return lines.join('\n');
  }
}

export class ASTEditor {
  private strategies: EditStrategy[];

  constructor() {
    this.strategies = [
      new ASTEditStrategy(),
      new DiffPatchStrategy(),
      new LineBasedStrategy()
    ];
  }

  async applyEdits(fileContent: string, filePath: string, edits: ASTEdit[]): Promise<string> {
    let result = fileContent;
    const fileExt = path.extname(filePath).slice(1).toLowerCase();

    for (const edit of edits) {
      const strategy = this.selectStrategy(edit.type, fileExt);
      
      try {
        result = strategy.apply(result, edit);
      } catch (error) {
        console.error(`Failed to apply edit to ${filePath}:`, error);
        
        const fallbackStrategy = this.strategies[this.strategies.length - 1];
        if (fallbackStrategy !== strategy && edit.operations) {
          console.log('Falling back to line-based strategy...');
          result = fallbackStrategy.apply(result, edit);
        } else {
          throw error;
        }
      }
    }

    return result;
  }

  private selectStrategy(editType: string | undefined, fileExt: string): EditStrategy {
    if (editType === 'line') {
      return this.strategies.find(s => s instanceof LineBasedStrategy)!;
    }

    if (editType === 'diff') {
      return this.strategies.find(s => s instanceof DiffPatchStrategy)!;
    }

    if (editType === 'ast' || editType === 'magicast') {
      const astStrategy = this.strategies.find(s => s instanceof ASTEditStrategy)!;
      if (astStrategy.canHandle(fileExt)) {
        return astStrategy;
      }
    }

    for (const strategy of this.strategies) {
      if (strategy.canHandle(fileExt)) {
        return strategy;
      }
    }

    return this.strategies[this.strategies.length - 1];
  }

  detectFileType(filePath: string): string {
    return path.extname(filePath).slice(1).toLowerCase();
  }

  suggestEditType(fileExt: string): 'ast' | 'diff' | 'line' {
    if (['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs'].includes(fileExt)) {
      return 'ast';
    }
    
    if (['html', 'css', 'scss', 'less', 'xml', 'json', 'yaml', 'yml', 'md'].includes(fileExt)) {
      return 'diff';
    }
    
    return 'line';
  }
}

export const astEditor = new ASTEditor();