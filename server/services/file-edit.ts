import * as fs from 'fs';
import * as path from 'path';

// TypeScript interfaces
export interface EditOperation {
  type: 'replace' | 'insert' | 'delete';
  startLine?: number;
  endLine?: number;
  afterLine?: number;
  newContent?: string;
}

export interface FileEditDiff {
  file: string;
  operations: EditOperation[];
}

export interface ApplyResult {
  success: boolean;
  modifiedFiles: string[];
  errors?: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface LineRange {
  start: number;
  end: number;
}

export class FileEdit {
  /**
   * Apply multiple edit operations to a single file's content
   */
  applyEdits(content: string, operations: EditOperation[]): string {
    const lines = content.split('\n');
    
    // Sort operations by line number in reverse order to avoid index shifting
    const sortedOps = [...operations].sort((a, b) => {
      const lineA = a.startLine || a.afterLine || 0;
      const lineB = b.startLine || b.afterLine || 0;
      return lineB - lineA;
    });
    
    for (const op of sortedOps) {
      switch (op.type) {
        case 'replace':
          this.applyReplace(lines, op);
          break;
        case 'insert':
          this.applyInsert(lines, op);
          break;
        case 'delete':
          this.applyDelete(lines, op);
          break;
      }
    }
    
    return lines.join('\n');
  }
  
  /**
   * Apply edit operations to multiple files
   */
  async applyFileEdits(
    projectPath: string,
    diffs: FileEditDiff[]
  ): Promise<ApplyResult> {
    const modifiedFiles: string[] = [];
    const errors: string[] = [];
    
    for (const diff of diffs) {
      try {
        const filePath = path.join(projectPath, diff.file);
        
        // Validate operations before applying
        const validation = this.validateOperations(diff.operations);
        if (!validation.valid) {
          errors.push(`${diff.file}: ${validation.errors.join(', ')}`);
          continue;
        }
        
        // Read current file content
        let content = '';
        if (fs.existsSync(filePath)) {
          content = fs.readFileSync(filePath, 'utf-8');
        }
        
        // Apply edits
        const modifiedContent = this.applyEdits(content, diff.operations);
        
        // Write back to file
        fs.writeFileSync(filePath, modifiedContent, 'utf-8');
        modifiedFiles.push(diff.file);
      } catch (error) {
        errors.push(`${diff.file}: ${error.message}`);
      }
    }
    
    return {
      success: errors.length === 0,
      modifiedFiles,
      errors: errors.length > 0 ? errors : undefined
    };
  }
  
  /**
   * Apply a replace operation
   */
  private applyReplace(lines: string[], op: EditOperation): void {
    if (op.startLine === undefined || op.endLine === undefined || op.newContent === undefined) {
      throw new Error('Replace operation missing required fields');
    }
    
    // Convert to 0-based index
    const start = op.startLine - 1;
    const end = op.endLine - 1;
    
    if (start < 0 || end >= lines.length || start > end) {
      throw new Error(`Invalid line range: ${op.startLine}-${op.endLine}`);
    }
    
    const newLines = op.newContent.split('\n');
    lines.splice(start, end - start + 1, ...newLines);
  }
  
  /**
   * Apply an insert operation
   */
  private applyInsert(lines: string[], op: EditOperation): void {
    if (op.afterLine === undefined || op.newContent === undefined) {
      throw new Error('Insert operation missing required fields');
    }
    
    // afterLine 0 means insert at beginning
    const insertIndex = op.afterLine === 0 ? 0 : op.afterLine;
    
    if (insertIndex < 0 || insertIndex > lines.length) {
      throw new Error(`Invalid insert position: after line ${op.afterLine}`);
    }
    
    const newLines = op.newContent.split('\n');
    lines.splice(insertIndex, 0, ...newLines);
  }
  
  /**
   * Apply a delete operation
   */
  private applyDelete(lines: string[], op: EditOperation): void {
    if (op.startLine === undefined || op.endLine === undefined) {
      throw new Error('Delete operation missing required fields');
    }
    
    // Convert to 0-based index
    const start = op.startLine - 1;
    const end = op.endLine - 1;
    
    if (start < 0 || end >= lines.length || start > end) {
      throw new Error(`Invalid line range: ${op.startLine}-${op.endLine}`);
    }
    
    lines.splice(start, end - start + 1);
  }
  
  /**
   * Find line range containing specific text (for fuzzy matching)
   */
  findLineRange(content: string, searchText: string): LineRange | null {
    const lines = content.split('\n');
    const searchLines = searchText.split('\n');
    
    for (let i = 0; i <= lines.length - searchLines.length; i++) {
      let match = true;
      for (let j = 0; j < searchLines.length; j++) {
        if (lines[i + j].trim() !== searchLines[j].trim()) {
          match = false;
          break;
        }
      }
      
      if (match) {
        return {
          start: i + 1, // Convert to 1-based
          end: i + searchLines.length
        };
      }
    }
    
    return null;
  }
  
  /**
   * Validate operations before applying
   */
  validateOperations(operations: EditOperation[]): ValidationResult {
    const errors: string[] = [];
    
    for (const op of operations) {
      switch (op.type) {
        case 'replace':
          if (op.startLine === undefined || op.endLine === undefined || op.newContent === undefined) {
            errors.push(`Replace operation missing required fields`);
          }
          if (op.startLine !== undefined && op.startLine < 1) {
            errors.push(`Invalid startLine: ${op.startLine} (must be >= 1)`);
          }
          break;
          
        case 'insert':
          if (op.afterLine === undefined || op.newContent === undefined) {
            errors.push(`Insert operation missing required fields`);
          }
          if (op.afterLine !== undefined && op.afterLine < 0) {
            errors.push(`Invalid afterLine: ${op.afterLine} (must be >= 0)`);
          }
          break;
          
        case 'delete':
          if (op.startLine === undefined || op.endLine === undefined) {
            errors.push(`Delete operation missing required fields`);
          }
          if (op.startLine !== undefined && op.startLine < 1) {
            errors.push(`Invalid startLine: ${op.startLine} (must be >= 1)`);
          }
          break;
          
        default:
          errors.push(`Unknown operation type: ${op.type}`);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  /**
   * Get a summary of edit operations for debugging/logging
   */
  getEditSummary(diffs: FileEditDiff[]): string {
    const summary: string[] = [];
    
    for (const diff of diffs) {
      const fileOps: string[] = [];
      for (const op of diff.operations) {
        switch (op.type) {
          case 'replace':
            fileOps.push(`Replace lines ${op.startLine}-${op.endLine}`);
            break;
          case 'insert':
            fileOps.push(`Insert after line ${op.afterLine}`);
            break;
          case 'delete':
            fileOps.push(`Delete lines ${op.startLine}-${op.endLine}`);
            break;
        }
      }
      summary.push(`${diff.file}: ${fileOps.join(', ')}`);
    }
    
    return summary.join('\n');
  }
}