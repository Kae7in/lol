import { describe, it, expect } from 'vitest';
import { ASTEditor, type ASTEdit } from '../../server/services/ast-editor';

describe('Duplicate Code Fix Test', () => {
  it('should remove duplicate updateColorSystem function blocks', async () => {
    const astEditor = new ASTEditor();
    
    // Simplified version of the problematic code with duplicate function blocks
    const brokenCode = `
    // Update color transition and auto color change
    function updateColorSystem() {
        // Handle auto color change timer
        autoColorChangeTimer++;
        if (autoColorChangeTimer >= autoColorChangeInterval && !isTransitioning) {
            startColorTransition();
            autoColorChangeTimer = 0;
        }
        
        // Handle color transition
        if (isTransitioning) {
            colorTransitionProgress++;
            
            if (colorTransitionProgress >= transitionDuration) {
                completeColorTransition();
            }
            
            // Update blob colors during transition
            const colors = getCurrentColors();
            if (blob1.path) {
              blob1.path.fillColor = new Color(colors[0]);
            }
            if (blob2.path) {
              blob2.path.fillColor = new Color(colors[1]);
            }
        }
    }
        // Handle auto color change timer
        autoColorChangeTimer++;
        if (autoColorChangeTimer >= autoColorChangeInterval && !isTransitioning) {
            startColorTransition();
            autoColorChangeTimer = 0;
        }
        
        // Handle color transition
        if (isTransitioning) {
            colorTransitionProgress++;
            
            if (colorTransitionProgress >= transitionDuration) {
                completeColorTransition();
            }
            
            // Update blob colors during transition
            const colors = getCurrentColors();
            if (blob1.path) {
              blob1.path.fillColor = new Color(colors[0]);
            }
            if (blob2.path) {
              blob2.path.fillColor = new Color(colors[1]);
            }
        }
    }
        // Handle auto color change timer
        autoColorChangeTimer++;
        if (autoColorChangeTimer >= autoColorChangeInterval && !isTransitioning) {
            startColorTransition();
            autoColorChangeTimer = 0;
        }
        
        // Handle color transition
        if (isTransitioning) {
            colorTransitionProgress++;
            
            if (colorTransitionProgress >= transitionDuration) {
                completeColorTransition();
            }
            
            // Update blob colors during transition
            const colors = getCurrentColors();
            if (blob1.path) {
              blob1.path.fillColor = new Color(colors[0]);
            }
            if (blob2.path) {
              blob2.path.fillColor = new Color(colors[1]);
            }
        }
    }`;

    // Define edits to remove the duplicate code blocks by replacing the entire broken section
    const edits: ASTEdit[] = [{
      file: 'script.js',
      type: 'ast',
      transformations: [
        {
          action: 'replace',
          target: brokenCode.trim(),
          value: `
    // Update color transition and auto color change
    function updateColorSystem() {
        // Handle auto color change timer
        autoColorChangeTimer++;
        if (autoColorChangeTimer >= autoColorChangeInterval && !isTransitioning) {
            startColorTransition();
            autoColorChangeTimer = 0;
        }
        
        // Handle color transition
        if (isTransitioning) {
            colorTransitionProgress++;
            
            if (colorTransitionProgress >= transitionDuration) {
                completeColorTransition();
            }
            
            // Update blob colors during transition
            const colors = getCurrentColors();
            if (blob1.path) {
              blob1.path.fillColor = new Color(colors[0]);
            }
            if (blob2.path) {
              blob2.path.fillColor = new Color(colors[1]);
            }
        }
    }`
        }
      ]
    }];

    const result = await astEditor.applyEdits(brokenCode, 'script.js', edits);
    
    // Count occurrences of the auto color change timer code
    const autoColorChangeMatches = (result.match(/autoColorChangeTimer\+\+/g) || []).length;
    
    // Should only have one occurrence of the function body content
    expect(autoColorChangeMatches).toBe(1);
    
    // Should still contain the function definition
    expect(result).toContain('function updateColorSystem()');
    
    // Should contain exactly one complete function block
    const functionBlocks = result.match(/function updateColorSystem\(\)\s*\{[\s\S]*?\n\}/g);
    expect(functionBlocks).toBeTruthy();
    expect(functionBlocks!.length).toBe(1);
    
    // The result should be much shorter than the original
    expect(result.length).toBeLessThan(brokenCode.length / 2);
  });

  it('should fix the real Paper.js blob animation file', async () => {
    const astEditor = new ASTEditor();
    
    // This is a portion of the actual broken code with the duplicate updateColorSystem blocks
    const realBrokenCode = `
    // Update color transition and auto color change
    function updateColorSystem() {
        // Handle auto color change timer
        autoColorChangeTimer++;
        if (autoColorChangeTimer >= autoColorChangeInterval && !isTransitioning) {
            startColorTransition();
            autoColorChangeTimer = 0;
        }
        
        // Handle color transition
        if (isTransitioning) {
            colorTransitionProgress++;
            
            if (colorTransitionProgress >= transitionDuration) {
                completeColorTransition();
            }
            
            // Update blob colors during transition
            const colors = getCurrentColors();
            if (blob1.path) {
              blob1.path.fillColor = new Color(colors[0]);
            }
            if (blob2.path) {
              blob2.path.fillColor = new Color(colors[1]);
            }
        }
    }
        // Handle auto color change timer
        autoColorChangeTimer++;
        if (autoColorChangeTimer >= autoColorChangeInterval && !isTransitioning) {
            startColorTransition();
            autoColorChangeTimer = 0;
        }
        
        // Handle color transition
        if (isTransitioning) {
            colorTransitionProgress++;
            
            if (colorTransitionProgress >= transitionDuration) {
                completeColorTransition();
            }
            
            // Update blob colors during transition
            const colors = getCurrentColors();
            if (blob1.path) {
              blob1.path.fillColor = new Color(colors[0]);
            }
            if (blob2.path) {
              blob2.path.fillColor = new Color(colors[1]);
            }
        }
    }
        // Handle auto color change timer
        autoColorChangeTimer++;
        if (autoColorChangeTimer >= autoColorChangeInterval && !isTransitioning) {
            startColorTransition();
            autoColorChangeTimer = 0;
        }
        
        // Handle color transition
        if (isTransitioning) {
            colorTransitionProgress++;
            
            if (colorTransitionProgress >= transitionDuration) {
                completeColorTransition();
            }
            
            // Update blob colors during transition
            const colors = getCurrentColors();
            if (blob1.path) {
              blob1.path.fillColor = new Color(colors[0]);
            }
            if (blob2.path) {
              blob2.path.fillColor = new Color(colors[1]);
            }
        }
    }
        // Handle auto color change timer
        autoColorChangeTimer++;
        if (autoColorChangeTimer >= autoColorChangeInterval && !isTransitioning) {
            startColorTransition();
            autoColorChangeTimer = 0;
        }
        
        // Handle color transition
        if (isTransitioning) {
            colorTransitionProgress++;
            
            if (colorTransitionProgress >= transitionDuration) {
                completeColorTransition();
            }
            
            // Update blob colors during transition
            const colors = getCurrentColors();
            if (blob1.path) {
              blob1.path.fillColor = new Color(colors[0]);
            }
            if (blob2.path) {
              blob2.path.fillColor = new Color(colors[1]);
            }
        }
    }
        // Handle auto color change timer
        autoColorChangeTimer++;
        if (autoColorChangeTimer >= autoColorChangeInterval && !isTransitioning) {
            startColorTransition();
            autoColorChangeTimer = 0;
        }
        
        // Handle color transition
        if (isTransitioning) {
            colorTransitionProgress++;
            
            if (colorTransitionProgress >= transitionDuration) {
                completeColorTransition();
            }
            
            // Update blob colors during transition
            const colors = getCurrentColors();
            if (blob1.path) {
              blob1.path.fillColor = new Color(colors[0]);
            }
            if (blob2.path) {
              blob2.path.fillColor = new Color(colors[1]);
        }
    }
    
    // Enhanced morphing function with smoother, less jittery movement
    function morphBlob(blob) {
        if (!blob.path || !blob.path.segments) { 
            console.error("Blob path not properly initialized"); 
            return; 
        }
        // Rest of the function...
    }`;

    // Strategy: Replace the entire mess with the correct single function
    const edits: ASTEdit[] = [{
      file: 'script.js',
      type: 'ast',
      transformations: [
        {
          action: 'replace',
          target: `    // Update color transition and auto color change
    function updateColorSystem() {
        // Handle auto color change timer
        autoColorChangeTimer++;
        if (autoColorChangeTimer >= autoColorChangeInterval && !isTransitioning) {
            startColorTransition();
            autoColorChangeTimer = 0;
        }
        
        // Handle color transition
        if (isTransitioning) {
            colorTransitionProgress++;
            
            if (colorTransitionProgress >= transitionDuration) {
                completeColorTransition();
            }
            
            // Update blob colors during transition
            const colors = getCurrentColors();
            if (blob1.path) {
              blob1.path.fillColor = new Color(colors[0]);
            }
            if (blob2.path) {
              blob2.path.fillColor = new Color(colors[1]);
            }
        }
    }
        // Handle auto color change timer
        autoColorChangeTimer++;
        if (autoColorChangeTimer >= autoColorChangeInterval && !isTransitioning) {
            startColorTransition();
            autoColorChangeTimer = 0;
        }
        
        // Handle color transition
        if (isTransitioning) {
            colorTransitionProgress++;
            
            if (colorTransitionProgress >= transitionDuration) {
                completeColorTransition();
            }
            
            // Update blob colors during transition
            const colors = getCurrentColors();
            if (blob1.path) {
              blob1.path.fillColor = new Color(colors[0]);
            }
            if (blob2.path) {
              blob2.path.fillColor = new Color(colors[1]);
            }
        }
    }
        // Handle auto color change timer
        autoColorChangeTimer++;
        if (autoColorChangeTimer >= autoColorChangeInterval && !isTransitioning) {
            startColorTransition();
            autoColorChangeTimer = 0;
        }
        
        // Handle color transition
        if (isTransitioning) {
            colorTransitionProgress++;
            
            if (colorTransitionProgress >= transitionDuration) {
                completeColorTransition();
            }
            
            // Update blob colors during transition
            const colors = getCurrentColors();
            if (blob1.path) {
              blob1.path.fillColor = new Color(colors[0]);
            }
            if (blob2.path) {
              blob2.path.fillColor = new Color(colors[1]);
            }
        }
    }
        // Handle auto color change timer
        autoColorChangeTimer++;
        if (autoColorChangeTimer >= autoColorChangeInterval && !isTransitioning) {
            startColorTransition();
            autoColorChangeTimer = 0;
        }
        
        // Handle color transition
        if (isTransitioning) {
            colorTransitionProgress++;
            
            if (colorTransitionProgress >= transitionDuration) {
                completeColorTransition();
            }
            
            // Update blob colors during transition
            const colors = getCurrentColors();
            if (blob1.path) {
              blob1.path.fillColor = new Color(colors[0]);
            }
            if (blob2.path) {
              blob2.path.fillColor = new Color(colors[1]);
            }
        }
    }
        // Handle auto color change timer
        autoColorChangeTimer++;
        if (autoColorChangeTimer >= autoColorChangeInterval && !isTransitioning) {
            startColorTransition();
            autoColorChangeTimer = 0;
        }
        
        // Handle color transition
        if (isTransitioning) {
            colorTransitionProgress++;
            
            if (colorTransitionProgress >= transitionDuration) {
                completeColorTransition();
            }
            
            // Update blob colors during transition
            const colors = getCurrentColors();
            if (blob1.path) {
              blob1.path.fillColor = new Color(colors[0]);
            }
            if (blob2.path) {
              blob2.path.fillColor = new Color(colors[1]);
        }
    }`,
          value: `    // Update color transition and auto color change - FIXED VERSION (removed duplicates)
    function updateColorSystem() {
        // Handle auto color change timer
        autoColorChangeTimer++;
        if (autoColorChangeTimer >= autoColorChangeInterval && !isTransitioning) {
            startColorTransition();
            autoColorChangeTimer = 0;
        }
        
        // Handle color transition
        if (isTransitioning) {
            colorTransitionProgress++;
            
            if (colorTransitionProgress >= transitionDuration) {
                completeColorTransition();
            }
            
            // Update blob colors during transition
            const colors = getCurrentColors();
            if (blob1.path) {
                blob1.path.fillColor = new Color(colors[0]);
            }
            if (blob2.path) {
                blob2.path.fillColor = new Color(colors[1]);
            }
        }
    }`
        }
      ]
    }];

    const result = await astEditor.applyEdits(realBrokenCode, 'script.js', edits);
    
    // Verify the fix worked
    expect(result).toContain('// Update color transition and auto color change - FIXED VERSION');
    expect(result).toContain('function updateColorSystem()');
    expect(result).toContain('function morphBlob(blob)');
    
    // Count critical code patterns to ensure no duplicates
    const timerIncrements = (result.match(/autoColorChangeTimer\+\+/g) || []).length;
    expect(timerIncrements).toBe(1);
    
    // Check that we have exactly one updateColorSystem function
    const functionMatches = result.match(/function updateColorSystem\(\)/g);
    expect(functionMatches).toBeTruthy();
    expect(functionMatches!.length).toBe(1);
    
    // Verify the morphBlob function is still there and intact
    expect(result).toContain('function morphBlob(blob)');
    expect(result).toContain('Blob path not properly initialized');
  });

  it('should handle edge case with malformed duplicate blocks', async () => {
    const astEditor = new ASTEditor();
    
    // Test with malformed/incomplete duplicate blocks
    const malformedCode = `
    function updateColorSystem() {
        autoColorChangeTimer++;
        if (isTransitioning) {
            colorTransitionProgress++;
        }
    }
        autoColorChangeTimer++;
        if (isTransitioning) {
            colorTransitionProgress++;
        }
    }
        autoColorChangeTimer++;
        if (isTransitioning) {
            colorTransitionProgress++;`;

    const edits: ASTEdit[] = [{
      file: 'malformed.js',
      type: 'ast',
      transformations: [
        {
          action: 'replace',
          target: malformedCode.trim(),
          value: `function updateColorSystem() {
        autoColorChangeTimer++;
        if (isTransitioning) {
            colorTransitionProgress++;
        }
    }`
        }
      ]
    }];

    const result = await astEditor.applyEdits(malformedCode, 'malformed.js', edits);
    
    // Should have cleaned up the malformed code
    expect(result).toContain('function updateColorSystem()');
    const braceMatches = result.match(/\{/g) || [];
    const closeBraceMatches = result.match(/\}/g) || [];
    expect(braceMatches.length).toBe(closeBraceMatches.length);
  });
});