import { describe, it, expect } from 'vitest';
import { ASTEditor, type ASTEdit } from '../../server/services/ast-editor';

describe('Duplicate Code Fix Debug Test', () => {
  it('should demonstrate the fix for duplicate code', async () => {
    const astEditor = new ASTEditor();
    
    // Minimal test case with duplicate code
    const brokenCode = `
function updateColorSystem() {
    autoColorChangeTimer++;
}
    autoColorChangeTimer++;
}
    autoColorChangeTimer++;`;

    console.log('Original code:', brokenCode);

    // Simple replacement approach
    const edits: ASTEdit[] = [{
      file: 'script.js',
      type: 'ast',
      transformations: [
        {
          action: 'replace',
          target: `function updateColorSystem() {
    autoColorChangeTimer++;
}
    autoColorChangeTimer++;
}
    autoColorChangeTimer++;`,
          value: `function updateColorSystem() {
    autoColorChangeTimer++;
}`
        }
      ]
    }];

    const result = await astEditor.applyEdits(brokenCode, 'script.js', edits);
    console.log('Result:', result);
    
    // Check the result
    const timerIncrements = (result.match(/autoColorChangeTimer\+\+/g) || []).length;
    console.log('Timer increments found:', timerIncrements);
    
    expect(timerIncrements).toBe(1);
    expect(result).toContain('function updateColorSystem()');
  });

  it('should fix duplicate blocks using multiple transformations', async () => {
    const astEditor = new ASTEditor();
    
    const codeWithDuplicates = `
// Some initial code
const value = 0;

function updateColorSystem() {
    // Block 1
    autoColorChangeTimer++;
    if (isTransitioning) {
        colorTransitionProgress++;
    }
}
    // Duplicate block 1
    autoColorChangeTimer++;
    if (isTransitioning) {
        colorTransitionProgress++;
    }
}
    // Duplicate block 2
    autoColorChangeTimer++;
    if (isTransitioning) {
        colorTransitionProgress++;
    }
}

// Some code after
function otherFunction() {
    console.log('test');
}`;

    // Strategy: Delete lines containing orphaned closing braces and duplicate code
    const edits: ASTEdit[] = [{
      file: 'script.js',
      type: 'ast',
      transformations: [
        // First, delete the duplicate blocks
        {
          action: 'delete',
          target: '    // Duplicate block 1'
        },
        {
          action: 'delete',
          target: '    // Duplicate block 2'
        },
        {
          action: 'delete',
          target: '    autoColorChangeTimer++;'
        },
        {
          action: 'delete',
          target: '    if (isTransitioning) {'
        },
        {
          action: 'delete',
          target: '        colorTransitionProgress++;'
        },
        {
          action: 'delete',
          target: '    }'
        },
        {
          action: 'delete',
          target: '}'
        }
      ]
    }];

    const result = await astEditor.applyEdits(codeWithDuplicates, 'script.js', edits);
    console.log('Fixed result:', result);
    
    // Verify the fix
    const timerIncrements = (result.match(/autoColorChangeTimer\+\+/g) || []).length;
    expect(timerIncrements).toBe(1); // Should only have one increment
    
    // Should still have the proper function
    expect(result).toContain('function updateColorSystem()');
    expect(result).toContain('function otherFunction()');
    
    // Should have removed duplicates
    expect(result).not.toContain('Duplicate block');
  });

  it('should provide a working solution for the actual Paper.js file', async () => {
    const astEditor = new ASTEditor();
    
    // This represents the pattern found in the actual broken file
    const brokenPattern = `
    function updateColorSystem() {
        autoColorChangeTimer++;
        // ... rest of function
    }
        autoColorChangeTimer++;
        // ... duplicate content
    }
        autoColorChangeTimer++;
        // ... duplicate content
    }`;

    // The fix: wrap everything in a proper function
    const fixedPattern = `
    function updateColorSystem() {
        autoColorChangeTimer++;
        // ... rest of function
    }`;

    console.log('Pattern to fix:', brokenPattern);
    console.log('Fixed pattern:', fixedPattern);

    // Since the actual file has complex syntax that breaks AST parsing,
    // we need to use text-based replacement
    const edits: ASTEdit[] = [{
      file: 'script.js',
      type: 'ast',
      transformations: [
        {
          action: 'replace',
          target: brokenPattern.trim(),
          value: fixedPattern.trim()
        }
      ]
    }];

    const result = await astEditor.applyEdits(brokenPattern, 'script.js', edits);
    
    // Verify the pattern was fixed
    expect(result).toContain('function updateColorSystem()');
    const increments = (result.match(/autoColorChangeTimer\+\+/g) || []).length;
    expect(increments).toBe(1);
  });
});