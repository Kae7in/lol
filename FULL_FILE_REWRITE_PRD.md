# Full-File Rewrite System - Product Requirements Document

## Executive Summary

Replace the complex AST-based editing system with a simpler, more robust approach where Claude describes changes in natural language and a fast inference model (Groq/Cerebras) rewrites entire files. This eliminates ~90% of the code complexity while enabling more sophisticated transformations.

## Problem Statement

### Current AST System Pain Points

1. **Complexity Overhead**: 580+ lines of transformation logic across multiple strategies
2. **Fragility**: Breaks on syntax errors, requires multiple fallback strategies
3. **Limited Capability**: Complex refactoring is difficult or impossible
4. **Maintenance Burden**: Each new transformation type requires significant code
5. **Language Coupling**: Different strategies needed for each file type

### Why Full-File Rewrite is Better for Lollipop

- **Small Files**: Generated web experiences are typically <500 lines
- **AI-Generated**: No user attachment to specific formatting
- **Creative Freedom**: Users want significant, creative changes
- **Iteration Speed**: Simpler system = faster development and fewer bugs

## Proposed Solution

### Architecture Overview

```
┌─────────────────┐
│  User Prompt    │
└────────┬────────┘
         │
    ┌────▼────┐
    │ Claude  │ → Outputs natural language change descriptions
    └────┬────┘
         │
┌────────▼────────┐
│  Change Parser  │ → Extracts per-file instructions
└────────┬────────┘
         │
┌────────▼────────┐
│  Fast Model     │ → Rewrites entire files in parallel
│  (Groq/Cerebras)│
└────────┬────────┘
         │
    ┌────▼────┐
    │ Result  │ → Complete, validated files
    └─────────┘
```

### Claude's New Role: Prescriptive Code Provider

Claude now acts as the **architect** providing detailed code implementations, while the fast model acts as a **code integrator** that merges these changes into existing files.

#### Level 1: Simple Directive
```json
{
  "changes": {
    "script.js": {
      "instructions": [
        "Change the ball speed from 5 to 10",
        "Change the ball color from red to blue"
      ]
    }
  }
}
```

#### Level 2: Prescriptive with Examples
```json
{
  "changes": {
    "script.js": {
      "instructions": [
        "Replace the update function with this optimized version"
      ],
      "code_examples": {
        "update_function": "function update() {\n  // Use delta time for smooth animation\n  const deltaTime = (Date.now() - lastTime) / 1000;\n  this.x += this.velocityX * deltaTime;\n  this.y += this.velocityY * deltaTime;\n  \n  // Add boundary collision\n  if (this.x < 0 || this.x > width) this.velocityX *= -1;\n  if (this.y < 0 || this.y > height) this.velocityY *= -1;\n  \n  lastTime = Date.now();\n}"
      }
    }
  }
}
```

#### Level 3: Full Implementation Provided
```json
{
  "changes": {
    "script.js": {
      "instructions": [
        "Add this complete particle system class after the Blob class",
        "Call particles.update() and particles.draw() in the main draw loop"
      ],
      "code_blocks": {
        "particle_system": "class ParticleSystem {\n  constructor(x, y) {\n    this.particles = [];\n    this.origin = createVector(x, y);\n  }\n  \n  addParticle() {\n    this.particles.push(new Particle(this.origin.x, this.origin.y));\n  }\n  \n  update() {\n    for (let i = this.particles.length - 1; i >= 0; i--) {\n      const p = this.particles[i];\n      p.update();\n      if (p.isDead()) {\n        this.particles.splice(i, 1);\n      }\n    }\n  }\n  \n  draw() {\n    for (const p of this.particles) {\n      p.draw();\n    }\n  }\n}\n\nclass Particle {\n  constructor(x, y) {\n    this.position = createVector(x, y);\n    this.velocity = createVector(random(-1, 1), random(-2, 0));\n    this.acceleration = createVector(0, 0.05);\n    this.lifespan = 255;\n  }\n  \n  update() {\n    this.velocity.add(this.acceleration);\n    this.position.add(this.velocity);\n    this.lifespan -= 2;\n  }\n  \n  draw() {\n    noStroke();\n    fill(255, this.lifespan);\n    ellipse(this.position.x, this.position.y, 8);\n  }\n  \n  isDead() {\n    return this.lifespan < 0;\n  }\n}",
        "integration": "// In draw function, add:\nparticles.addParticle();\nparticles.update();\nparticles.draw();"
      }
    }
  }
}
```

### Fast Model's Simplified Role

The fast model now acts as a **code integrator** rather than a creative coder:

```typescript
const FAST_MODEL_INTEGRATION_PROMPT = `
You are a code integration assistant. Your job is to MERGE provided code into an existing file.

RULES:
1. When given specific code blocks, insert them EXACTLY as provided
2. When given instructions like "replace X with Y", find X and replace with Y
3. When given "add after X", find X and add the code after it
4. Preserve all existing code unless explicitly told to replace/remove it
5. Do NOT create new logic - only integrate what's provided
6. If a code example is given, use it VERBATIM

Current file:
\`\`\`javascript
${currentContent}
\`\`\`

Instructions:
${instructions.map(i => `- ${i}`).join('\n')}

Code blocks to integrate:
${Object.entries(codeBlocks).map(([name, code]) => 
  `// ${name}:\n${code}`
).join('\n\n')}

Output the complete file with all integrations applied:
`;
```

This approach means:
- **Claude does the thinking**: Designs the solution, writes the actual code
- **Fast model does the merging**: Takes Claude's code and integrates it
- **Minimal creativity needed**: Fast model just follows instructions
- **Higher reliability**: Less chance of the fast model "hallucinating" solutions

### Fast Model Integration

```typescript
interface RewriteRequest {
  originalFile: string;
  fileName: string;
  changes: string[];
  projectContext?: string;
}

interface RewriteResponse {
  rewrittenContent: string;
  confidence: number;
  tokensUsed: number;
}
```

## Implementation Plan

### Phase 1: Infrastructure Setup (Day 1)

#### 1.1 Add Dependencies
```bash
pnpm add groq-sdk
# OR
pnpm add @cerebras/sdk
```

#### 1.2 Environment Variables
```env
# Fast Inference Provider
GROQ_API_KEY=gsk_...
# OR
CEREBRAS_API_KEY=csk_...

# Model Selection
FAST_MODEL_PROVIDER=groq  # or 'cerebras'
FAST_MODEL_NAME=llama-3.3-70b-versatile  # or 'llama3.1-70b'
```

### Phase 2: Core Services (Day 2)

#### 2.1 File Rewriter Service (`server/services/file-rewriter.ts`)

```typescript
interface FileChanges {
  instructions: string[];
  code_examples?: Record<string, string>;
  code_blocks?: Record<string, string>;
}

export class FileRewriter {
  private client: Groq | Cerebras;
  
  constructor() {
    this.client = this.initializeClient();
  }
  
  async rewriteFile(
    content: string,
    fileName: string,
    changes: FileChanges
  ): Promise<RewriteResponse> {
    // Build a prescriptive prompt based on the level of detail provided
    const prompt = this.buildIntegrationPrompt(content, fileName, changes);
    
    const response = await this.client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      temperature: 0.1, // Low temperature for deterministic integration
      messages: [{
        role: 'system',
        content: 'You are a code integration assistant. Follow instructions exactly. When given code blocks, use them VERBATIM.'
      }, {
        role: 'user',
        content: prompt
      }]
    });
    
    return {
      rewrittenContent: response.choices[0].message.content,
      confidence: this.assessIntegrationConfidence(changes),
      tokensUsed: response.usage?.total_tokens || 0
    };
  }
  
  private buildIntegrationPrompt(
    content: string,
    fileName: string,
    changes: FileChanges
  ): string {
    const { instructions, code_examples, code_blocks } = changes;
    
    let prompt = `File: ${fileName}\n\nCurrent content:\n\`\`\`\n${content}\n\`\`\`\n\n`;
    
    // Add instructions
    prompt += `Instructions to apply:\n`;
    instructions.forEach((inst, i) => {
      prompt += `${i + 1}. ${inst}\n`;
    });
    
    // Add code examples if provided (Level 2)
    if (code_examples && Object.keys(code_examples).length > 0) {
      prompt += `\nCode to use EXACTLY as provided:\n`;
      for (const [name, code] of Object.entries(code_examples)) {
        prompt += `\n// ${name}:\n${code}\n`;
      }
    }
    
    // Add complete code blocks if provided (Level 3)
    if (code_blocks && Object.keys(code_blocks).length > 0) {
      prompt += `\nComplete implementations to integrate:\n`;
      for (const [name, code] of Object.entries(code_blocks)) {
        prompt += `\n// ${name}:\n${code}\n`;
      }
    }
    
    prompt += `\nIMPORTANT:
- Use provided code EXACTLY as given
- Only integrate/merge, do not create new logic
- Follow placement instructions precisely
- Preserve existing code unless told to replace it

Output the complete, integrated file:`;
    
    return prompt;
  }
  
  private assessIntegrationConfidence(changes: FileChanges): number {
    // Higher confidence when more prescriptive
    if (changes.code_blocks && Object.keys(changes.code_blocks).length > 0) {
      return 0.95; // Very high confidence with complete code
    }
    if (changes.code_examples && Object.keys(changes.code_examples).length > 0) {
      return 0.85; // High confidence with examples
    }
    return 0.75; // Moderate confidence with just instructions
  }
  
  async rewriteMultipleFiles(
    files: Record<string, FileContent>,
    changeMap: Record<string, FileChanges>
  ): Promise<Record<string, FileContent>> {
    // Process files with more prescriptive changes first (they're more likely to succeed)
    const sortedEntries = Object.entries(changeMap).sort(([, a], [, b]) => {
      const aScore = (a.code_blocks ? 3 : 0) + (a.code_examples ? 2 : 0) + 1;
      const bScore = (b.code_blocks ? 3 : 0) + (b.code_examples ? 2 : 0) + 1;
      return bScore - aScore;
    });
    
    const promises = sortedEntries.map(([fileName, changes]) => 
      this.rewriteFile(files[fileName].content, fileName, changes)
    );
    
    const results = await Promise.allSettled(promises);
    return this.assembleResults(files, results);
  }
}
```

#### 2.2 Change Description Parser (`server/services/change-parser.ts`)

```typescript
export class ChangeParser {
  parseClaudeResponse(response: string): ChangeMap {
    // Extract structured changes from Claude's response
    // Handle both JSON and natural language formats
  }
  
  validateChanges(changes: ChangeMap, files: FileMap): ValidationResult {
    // Ensure all referenced files exist
    // Check for conflicting instructions
    // Validate change coherence
  }
}
```

### Phase 3: API Integration (Day 3)

#### 3.1 New Endpoint (`server/routes/iterate-rewrite.ts`)

```typescript
POST /api/iterate/rewrite

Request:
{
  "projectId": "uuid",
  "prompt": "Make the animation smoother and add particle effects"
}

Response:
{
  "id": "uuid",
  "files": { /* updated files */ },
  "compiled": "/* compiled HTML */",
  "changes": {
    "script.js": ["Added particle system", "Smoothed animations"],
    "style.css": ["Updated transitions"]
  },
  "performance": {
    "claudeMs": 1200,
    "rewriteMs": 800,
    "totalMs": 2000,
    "tokensUsed": 3500
  }
}
```

#### 3.2 Update Claude's System Prompt

```typescript
const CLAUDE_REWRITE_SYSTEM_PROMPT = `
You are a prescriptive code architect. You provide SPECIFIC code implementations for the fast model to integrate.

Output format allows three levels of prescriptiveness:

Level 1 - Simple directives:
{
  "changes": {
    "filename.ext": {
      "instructions": ["specific change 1", "specific change 2"]
    }
  }
}

Level 2 - With code examples:
{
  "changes": {
    "filename.ext": {
      "instructions": ["what to do with the code"],
      "code_examples": {
        "example_name": "exact code to use"
      }
    }
  }
}

Level 3 - Full implementations:
{
  "changes": {
    "filename.ext": {
      "instructions": ["where to place the code"],
      "code_blocks": {
        "block_name": "complete implementation",
        "integration": "how to integrate it"
      }
    }
  }
}

Guidelines:
- For complex features, provide COMPLETE code implementations
- Be explicit about WHERE code should be placed
- Include actual function/class implementations when needed
- The fast model should NOT have to create logic, only integrate your code
- If replacing existing code, provide the complete replacement

Example for "Add particle system":
{
  "changes": {
    "game.js": {
      "instructions": [
        "Add the ParticleSystem class after the Player class",
        "Initialize particles in setup(): particles = new ParticleSystem(width/2, height/2)",
        "Call particles.update() and particles.draw() at the end of draw()"
      ],
      "code_blocks": {
        "particle_system": "class ParticleSystem {\n  constructor(x, y) {\n    this.particles = [];\n    this.origin = createVector(x, y);\n  }\n  \n  addParticle() {\n    this.particles.push(new Particle(this.origin.x, this.origin.y));\n  }\n  \n  update() {\n    // Update each particle\n    for (let i = this.particles.length - 1; i >= 0; i--) {\n      const p = this.particles[i];\n      p.update();\n      if (p.isDead()) {\n        this.particles.splice(i, 1);\n      }\n    }\n  }\n  \n  draw() {\n    for (const p of this.particles) {\n      p.draw();\n    }\n  }\n}",
        "particle_class": "class Particle {\n  constructor(x, y) {\n    this.position = createVector(x, y);\n    this.velocity = createVector(random(-1, 1), random(-2, 0));\n    this.acceleration = createVector(0, 0.05);\n    this.lifespan = 255;\n  }\n  \n  update() {\n    this.velocity.add(this.acceleration);\n    this.position.add(this.velocity);\n    this.lifespan -= 2;\n  }\n  \n  draw() {\n    noStroke();\n    fill(255, this.lifespan);\n    ellipse(this.position.x, this.position.y, 8);\n  }\n  \n  isDead() {\n    return this.lifespan < 0;\n  }\n}"
      }
    }
  }
}
`;
```

### Phase 4: Fast Model Optimization (Day 4)

#### 4.1 Model-Specific Prompts

```typescript
const GROQ_REWRITE_PROMPT = `
You are rewriting a ${fileType} file. Apply these changes:

${changes.map((c, i) => `${i + 1}. ${c}`).join('\n')}

Current file:
\`\`\`${fileType}
${currentContent}
\`\`\`

Rewrite the ENTIRE file with all changes applied. Maintain the same overall structure but implement all requested changes:
\`\`\`${fileType}
`;

const CEREBRAS_REWRITE_PROMPT = `
Task: Rewrite the following ${fileType} file with improvements.

Changes to implement:
${changes.join('\n- ')}

Original:
${currentContent}

Improved version:
`;
```

#### 4.2 Rate Limiting and Caching

```typescript
class RateLimiter {
  private queue: RewriteTask[] = [];
  private processing = 0;
  private maxConcurrent = 5;
  private cache = new Map<string, CachedResult>();
  
  async process(task: RewriteTask): Promise<RewriteResult> {
    const cacheKey = this.getCacheKey(task);
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }
    
    await this.waitForSlot();
    this.processing++;
    
    try {
      const result = await this.executeTask(task);
      this.cache.set(cacheKey, result);
      return result;
    } finally {
      this.processing--;
    }
  }
}
```

### Phase 5: Quality Assurance (Day 5)

#### 5.1 Validation Pipeline

```typescript
class RewriteValidator {
  async validate(original: string, rewritten: string, changes: string[]): Promise<ValidationResult> {
    const checks = [
      this.checkSyntax(rewritten),
      this.checkChangeImplementation(original, rewritten, changes),
      this.checkNoRegressions(original, rewritten),
      this.checkCodeQuality(rewritten)
    ];
    
    const results = await Promise.all(checks);
    return this.aggregateResults(results);
  }
}
```

#### 5.2 Fallback Strategy

```typescript
class RewriteStrategy {
  async execute(request: RewriteRequest): Promise<FileContent> {
    try {
      // Try fast model rewrite
      return await this.fileRewriter.rewrite(request);
    } catch (error) {
      if (this.shouldFallback(error)) {
        // Fall back to AST for simple changes
        return await this.astEditor.apply(request);
      }
      throw error;
    }
  }
  
  private shouldFallback(error: Error): boolean {
    return error.message.includes('timeout') ||
           error.message.includes('rate_limit') ||
           error.message.includes('syntax_error');
  }
}
```

### Phase 6: Migration & Testing (Day 6-7)

#### 6.1 A/B Testing Setup

```typescript
class IterationRouter {
  async route(request: IterateRequest): Promise<IterateResponse> {
    const useRewrite = this.shouldUseRewrite(request);
    
    if (useRewrite) {
      return this.rewriteStrategy.execute(request);
    } else {
      return this.astStrategy.execute(request);
    }
  }
  
  private shouldUseRewrite(request: IterateRequest): boolean {
    // Start with 10% of traffic
    if (Math.random() < 0.1) return true;
    
    // Always use rewrite for complex requests
    if (request.prompt.includes('refactor') || 
        request.prompt.includes('redesign')) {
      return true;
    }
    
    // Use AST for simple property changes
    if (request.prompt.match(/change|update|modify.*to/i)) {
      return false;
    }
    
    return false;
  }
}
```

#### 6.2 Performance Monitoring

```typescript
interface PerformanceMetrics {
  strategy: 'rewrite' | 'ast';
  totalTime: number;
  claudeTime: number;
  editTime: number;
  tokensUsed: number;
  filesChanged: number;
  success: boolean;
  errorType?: string;
}

class MetricsCollector {
  async track(metrics: PerformanceMetrics): Promise<void> {
    // Log to database
    await db.insert(iterationMetrics).values(metrics);
    
    // Real-time monitoring
    if (metrics.totalTime > 5000) {
      console.warn(`Slow iteration: ${metrics.totalTime}ms`);
    }
    
    // Alert on failures
    if (!metrics.success) {
      await this.alertOnFailure(metrics);
    }
  }
}
```

## Success Metrics

### Primary Metrics
- **Success Rate**: Target 95%+ (up from 92% with AST)
- **Performance**: <2 seconds average (faster than AST's 2-3s)
- **Code Reduction**: 90% fewer lines of code to maintain
- **Token Efficiency**: <5000 tokens per iteration average

### Secondary Metrics
- **User Satisfaction**: Measure via feedback on quality of changes
- **Development Velocity**: Track time to implement new features
- **Error Recovery**: Time to fix when things go wrong
- **Cost per Iteration**: Monitor API costs

## Prescriptive Approach Benefits

### Why This Works Better

1. **Reduced Hallucination Risk**
   - Fast model doesn't "imagine" solutions
   - It only integrates what Claude provides
   - Less chance of introducing bugs

2. **Consistent Quality**
   - Claude (high-quality model) writes all the logic
   - Fast model just does mechanical integration
   - Results match Claude's capabilities

3. **Faster Execution**
   - Fast model has simpler task (merge vs create)
   - Lower temperature = more deterministic
   - Can use smaller, faster models (even 7B models)

4. **Better Control**
   - Claude can provide exact implementations
   - Precise placement instructions
   - Predictable outcomes

## Real-World Example: Prescriptive Integration

### User Request
"Make the blob follow the mouse more smoothly and add a trail effect"

### Claude's Prescriptive Response
```json
{
  "changes": {
    "script.js": {
      "instructions": [
        "Replace the existing update() method in the Blob class with the smooth follow version",
        "Add the Trail class after the Blob class",
        "Initialize trail in setup() after creating the blob",
        "Call trail methods in draw() after blob.draw()"
      ],
      "code_blocks": {
        "smooth_update": "update() {\n  // Smooth following with easing\n  const easing = 0.05;\n  const targetX = mouseX;\n  const targetY = mouseY;\n  \n  // Calculate distance to target\n  const dx = targetX - this.x;\n  const dy = targetY - this.y;\n  \n  // Apply easing for smooth movement\n  this.x += dx * easing;\n  this.y += dy * easing;\n  \n  // Add slight wobble for organic feel\n  this.x += sin(frameCount * 0.1) * 2;\n  this.y += cos(frameCount * 0.1) * 2;\n}",
        
        "trail_class": "class Trail {\n  constructor(maxLength = 20) {\n    this.points = [];\n    this.maxLength = maxLength;\n  }\n  \n  addPoint(x, y) {\n    this.points.push({ x, y, life: 1.0 });\n    \n    // Limit trail length\n    if (this.points.length > this.maxLength) {\n      this.points.shift();\n    }\n  }\n  \n  update() {\n    // Fade out trail points\n    for (let i = 0; i < this.points.length; i++) {\n      this.points[i].life = i / this.points.length;\n    }\n  }\n  \n  draw() {\n    noFill();\n    for (let i = 1; i < this.points.length; i++) {\n      const p1 = this.points[i - 1];\n      const p2 = this.points[i];\n      \n      strokeWeight(p2.life * 4);\n      stroke(255, 150, 100, p2.life * 255);\n      line(p1.x, p1.y, p2.x, p2.y);\n    }\n  }\n}",
        
        "setup_integration": "// In setup(), after creating blob:\ntrail = new Trail(30);",
        
        "draw_integration": "// In draw(), after blob.update():\ntrail.addPoint(blob.x, blob.y);\ntrail.update();\n\n// Before blob.draw():\ntrail.draw();"
      }
    }
  }
}
```

### Fast Model's Task
The fast model simply:
1. Finds the Blob class's update() method
2. Replaces it with the provided `smooth_update` code
3. Adds the `Trail` class after Blob
4. Inserts the integration code in setup() and draw()

**No creativity needed** - just mechanical integration of Claude's prescriptive code.

### Result
- **Reliability**: 95%+ success rate because the fast model isn't creating logic
- **Speed**: <1 second for integration (vs 2-3 seconds for creative generation)
- **Quality**: Identical to Claude-written code (because it IS Claude's code)
- **Cost**: Minimal tokens for the fast model (just file content + instructions)

## Risk Mitigation

### Risk 1: Fast Model Hallucinations
**Mitigation**: 
- Validate output syntax before saving
- Compare against original to ensure reasonable changes
- Keep AST as fallback for critical operations

### Risk 2: API Rate Limits
**Mitigation**:
- Implement intelligent queuing
- Cache recent rewrites
- Use multiple API keys if needed

### Risk 3: Cost Overruns
**Mitigation**:
- Monitor token usage closely
- Set per-project limits
- Use smaller models for simple changes

### Risk 4: Quality Degradation
**Mitigation**:
- A/B test thoroughly before full rollout
- Keep quality metrics dashboard
- Easy rollback mechanism

## Test Migration Strategy

### Existing Test Infrastructure

The current test suite (`tests/services/ast-editor.test.ts`) provides comprehensive coverage for AST-based editing:
- **583 lines** of test code
- Tests for file type detection, strategy selection, and transformations
- Integration tests for multi-file scenarios
- Error handling and fallback behavior

### Test Migration Plan

#### Phase 1: Adapt Existing Tests

##### 1.1 Create New Test File (`tests/services/file-rewriter.test.ts`)

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FileRewriter } from '../../server/services/file-rewriter';
import { ChangeParser } from '../../server/services/change-parser';
import Groq from 'groq-sdk';

describe('FileRewriter', () => {
  let rewriter: FileRewriter;
  let mockGroq: any;
  
  beforeEach(() => {
    mockGroq = {
      chat: {
        completions: {
          create: vi.fn()
        }
      }
    };
    vi.spyOn(Groq, 'constructor').mockReturnValue(mockGroq);
    rewriter = new FileRewriter();
  });

  describe('Single File Rewriting', () => {
    it('should rewrite JavaScript file with changes', async () => {
      const originalContent = `
        const gameConfig = {
          speed: 5,
          difficulty: 'easy'
        };
      `;
      
      const changes = [
        'Increase the speed to 10',
        'Change difficulty to hard'
      ];
      
      mockGroq.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            content: `
              const gameConfig = {
                speed: 10,
                difficulty: 'hard'
              };
            `
          }
        }]
      });
      
      const result = await rewriter.rewriteFile(
        originalContent, 
        'config.js', 
        changes
      );
      
      expect(result.rewrittenContent).toContain('speed: 10');
      expect(result.rewrittenContent).toContain("difficulty: 'hard'");
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should handle syntax error fixes', async () => {
      const brokenCode = `
        function update() {
          this.x += 5
          this.y += 5
          // Missing closing brace
      `;
      
      const changes = ['Fix the syntax error'];
      
      mockGroq.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            content: `
              function update() {
                this.x += 5;
                this.y += 5;
              }
            `
          }
        }]
      });
      
      const result = await rewriter.rewriteFile(
        brokenCode,
        'game.js',
        changes
      );
      
      expect(result.rewrittenContent).toContain('}');
      expect(result.rewrittenContent).toMatch(/function update\(\) \{[\s\S]*\}/);
    });
  });

  describe('Parallel File Processing', () => {
    it('should rewrite multiple files in parallel', async () => {
      const files = {
        'script.js': { content: 'const speed = 5;' },
        'style.css': { content: 'body { background: white; }' },
        'index.html': { content: '<h1>Hello</h1>' }
      };
      
      const changeMap = {
        'script.js': ['Double the speed'],
        'style.css': ['Make background dark'],
        'index.html': ['Change heading to Welcome']
      };
      
      mockGroq.chat.completions.create
        .mockResolvedValueOnce({
          choices: [{ message: { content: 'const speed = 10;' } }]
        })
        .mockResolvedValueOnce({
          choices: [{ message: { content: 'body { background: #1a1a1a; }' } }]
        })
        .mockResolvedValueOnce({
          choices: [{ message: { content: '<h1>Welcome</h1>' } }]
        });
      
      const results = await rewriter.rewriteMultipleFiles(files, changeMap);
      
      expect(results['script.js'].content).toContain('speed = 10');
      expect(results['style.css'].content).toContain('#1a1a1a');
      expect(results['index.html'].content).toContain('Welcome');
    });

    it('should handle partial failures gracefully', async () => {
      const files = {
        'good.js': { content: 'const x = 1;' },
        'bad.js': { content: 'const y = 2;' }
      };
      
      const changeMap = {
        'good.js': ['Change x to 5'],
        'bad.js': ['This will fail']
      };
      
      mockGroq.chat.completions.create
        .mockResolvedValueOnce({
          choices: [{ message: { content: 'const x = 5;' } }]
        })
        .mockRejectedValueOnce(new Error('API Error'));
      
      const results = await rewriter.rewriteMultipleFiles(files, changeMap);
      
      expect(results['good.js'].content).toContain('x = 5');
      expect(results['bad.js'].content).toContain('y = 2'); // Original content
      expect(results['bad.js'].error).toBeDefined();
    });
  });

  describe('Performance and Rate Limiting', () => {
    it('should respect rate limits', async () => {
      const files = {};
      const changeMap = {};
      
      // Create 10 files to test rate limiting
      for (let i = 0; i < 10; i++) {
        files[`file${i}.js`] = { content: `const val${i} = ${i};` };
        changeMap[`file${i}.js`] = [`Change val${i} to ${i * 10}`];
      }
      
      let concurrentCalls = 0;
      let maxConcurrent = 0;
      
      mockGroq.chat.completions.create.mockImplementation(async () => {
        concurrentCalls++;
        maxConcurrent = Math.max(maxConcurrent, concurrentCalls);
        await new Promise(resolve => setTimeout(resolve, 100));
        concurrentCalls--;
        return {
          choices: [{ message: { content: 'rewritten content' } }]
        };
      });
      
      await rewriter.rewriteMultipleFiles(files, changeMap);
      
      expect(maxConcurrent).toBeLessThanOrEqual(5); // Max 5 concurrent
    });

    it('should cache repeated requests', async () => {
      const content = 'const x = 1;';
      const changes = ['Change x to 2'];
      
      mockGroq.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: 'const x = 2;' } }]
      });
      
      // First call
      await rewriter.rewriteFile(content, 'test.js', changes);
      
      // Second call (should use cache)
      await rewriter.rewriteFile(content, 'test.js', changes);
      
      expect(mockGroq.chat.completions.create).toHaveBeenCalledTimes(1);
    });
  });
});
```

##### 1.2 Create Change Parser Tests (`tests/services/change-parser.test.ts`)

```typescript
describe('ChangeParser', () => {
  let parser: ChangeParser;
  
  beforeEach(() => {
    parser = new ChangeParser();
  });

  describe('Claude Response Parsing', () => {
    it('should parse JSON format changes', () => {
      const response = JSON.stringify({
        changes: {
          'script.js': [
            'Increase animation speed',
            'Add particle effects'
          ],
          'style.css': [
            'Make background darker'
          ]
        }
      });
      
      const result = parser.parseClaudeResponse(response);
      
      expect(result['script.js']).toHaveLength(2);
      expect(result['style.css']).toHaveLength(1);
    });

    it('should extract changes from natural language', () => {
      const response = `
        I'll make the following changes:
        
        For script.js:
        - Increase the animation speed
        - Add particle effects
        
        For style.css:
        - Make the background darker
      `;
      
      const result = parser.parseClaudeResponse(response);
      
      expect(result['script.js']).toContain('Increase the animation speed');
      expect(result['style.css']).toContain('Make the background darker');
    });

    it('should handle malformed responses gracefully', () => {
      const response = 'This is not valid JSON or structured text';
      
      const result = parser.parseClaudeResponse(response);
      
      expect(result).toEqual({});
    });
  });

  describe('Change Validation', () => {
    it('should validate files exist', () => {
      const changes = {
        'exists.js': ['Change something'],
        'missing.js': ['This file does not exist']
      };
      
      const files = {
        'exists.js': { content: 'code' }
      };
      
      const result = parser.validateChanges(changes, files);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('File not found: missing.js');
    });

    it('should detect conflicting changes', () => {
      const changes = {
        'config.js': [
          'Set speed to 10',
          'Set speed to 5'
        ]
      };
      
      const files = {
        'config.js': { content: 'const speed = 1;' }
      };
      
      const result = parser.validateChanges(changes, files);
      
      expect(result.warnings).toContain('Conflicting changes for speed');
    });
  });
});
```

#### Phase 2: Integration Tests (`tests/integration/rewrite-flow.test.ts`)

```typescript
describe('Full Rewrite Flow Integration', () => {
  let server: FastifyInstance;
  
  beforeAll(async () => {
    server = await createTestServer();
  });

  it('should complete full iteration with rewrite strategy', async () => {
    // Create project
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/ai/generate',
      payload: {
        prompt: 'Create a bouncing ball animation'
      }
    });
    
    const project = createRes.json();
    
    // Iterate with rewrite
    const iterateRes = await server.inject({
      method: 'POST',
      url: '/api/iterate/rewrite',
      payload: {
        projectId: project.id,
        prompt: 'Make the ball blue and add trail effect'
      }
    });
    
    expect(iterateRes.statusCode).toBe(200);
    const result = iterateRes.json();
    
    expect(result.changes).toBeDefined();
    expect(result.files['script.js'].content).toContain('blue');
    expect(result.validation.valid).toBe(true);
  });

  it('should fall back to AST when rewrite fails', async () => {
    // Mock Groq failure
    vi.spyOn(Groq.prototype, 'chat.completions.create')
      .mockRejectedValueOnce(new Error('Rate limit'));
    
    const iterateRes = await server.inject({
      method: 'POST',
      url: '/api/iterate/rewrite',
      payload: {
        projectId: 'test-id',
        prompt: 'Simple color change'
      }
    });
    
    expect(iterateRes.json().strategy).toBe('ast-fallback');
  });
});
```

#### Phase 3: Performance Comparison Tests (`tests/performance/rewrite-vs-ast.test.ts`)

```typescript
describe('Performance: Rewrite vs AST', () => {
  const testCases = [
    {
      name: 'Simple property change',
      prompt: 'Change speed to 10',
      expectedWinner: 'ast' // AST should be faster for simple changes
    },
    {
      name: 'Complex refactoring',
      prompt: 'Refactor the entire game loop to use requestAnimationFrame',
      expectedWinner: 'rewrite' // Rewrite should handle complex changes better
    },
    {
      name: 'Syntax error fix',
      prompt: 'Fix all syntax errors',
      expectedWinner: 'rewrite' // Rewrite naturally fixes broken code
    },
    {
      name: 'Multi-file changes',
      prompt: 'Update the entire color scheme across all files',
      expectedWinner: 'rewrite' // Rewrite can handle holistic changes
    }
  ];

  for (const testCase of testCases) {
    it(`should compare: ${testCase.name}`, async () => {
      const project = await createTestProject();
      
      // Test AST approach
      const astStart = Date.now();
      const astResult = await fetch('/api/iterate/ast', {
        method: 'POST',
        body: JSON.stringify({
          projectId: project.id,
          prompt: testCase.prompt
        })
      });
      const astTime = Date.now() - astStart;
      
      // Test Rewrite approach
      const rewriteStart = Date.now();
      const rewriteResult = await fetch('/api/iterate/rewrite', {
        method: 'POST',
        body: JSON.stringify({
          projectId: project.id,
          prompt: testCase.prompt
        })
      });
      const rewriteTime = Date.now() - rewriteStart;
      
      console.log(`${testCase.name}:`);
      console.log(`  AST: ${astTime}ms, Success: ${astResult.ok}`);
      console.log(`  Rewrite: ${rewriteTime}ms, Success: ${rewriteResult.ok}`);
      
      if (testCase.expectedWinner === 'ast') {
        expect(astTime).toBeLessThan(rewriteTime * 1.5);
      } else {
        expect(rewriteTime).toBeLessThan(astTime * 1.5);
      }
    });
  }
});
```

#### Phase 4: A/B Testing Framework (`tests/ab-testing/iteration-router.test.ts`)

```typescript
describe('A/B Testing Router', () => {
  let router: IterationRouter;
  
  beforeEach(() => {
    router = new IterationRouter();
  });

  it('should route based on traffic percentage', () => {
    const results = { ast: 0, rewrite: 0 };
    
    // Run 1000 iterations
    for (let i = 0; i < 1000; i++) {
      const strategy = router.selectStrategy({
        prompt: 'Change color to blue'
      });
      results[strategy]++;
    }
    
    // Should be approximately 90/10 split
    expect(results.rewrite).toBeGreaterThan(50);
    expect(results.rewrite).toBeLessThan(150);
  });

  it('should always use rewrite for refactoring', () => {
    const strategy = router.selectStrategy({
      prompt: 'Refactor the entire codebase'
    });
    
    expect(strategy).toBe('rewrite');
  });

  it('should prefer AST for simple changes', () => {
    const strategy = router.selectStrategy({
      prompt: 'Change speed to 10'
    });
    
    expect(strategy).toBe('ast');
  });
});
```

### Test Conversion Checklist

- [ ] Convert AST strategy tests to rewriter tests
- [ ] Add parallel processing tests
- [ ] Add rate limiting tests
- [ ] Add caching tests
- [ ] Create integration tests for full flow
- [ ] Add performance comparison suite
- [ ] Implement A/B testing framework
- [ ] Add monitoring and metrics tests
- [ ] Create fallback scenario tests
- [ ] Add validation pipeline tests

### Test Metrics Dashboard

```typescript
interface TestMetrics {
  strategy: 'ast' | 'rewrite';
  testName: string;
  duration: number;
  success: boolean;
  tokensUsed?: number;
  errorType?: string;
}

class TestMetricsCollector {
  async collectAndReport(metrics: TestMetrics): Promise<void> {
    // Store in database
    await db.insert(testMetrics).values(metrics);
    
    // Generate report
    const report = await this.generateReport();
    console.log(`
      Test Performance Report:
      - AST Success Rate: ${report.astSuccessRate}%
      - Rewrite Success Rate: ${report.rewriteSuccessRate}%
      - Average AST Time: ${report.avgAstTime}ms
      - Average Rewrite Time: ${report.avgRewriteTime}ms
      - Token Efficiency: ${report.tokenEfficiency}
    `);
  }
}
```

## Timeline

| Day | Task | Deliverable |
|-----|------|------------|
| 1 | Infrastructure Setup | Dependencies installed, env configured |
| 2 | Core Services | FileRewriter and ChangeParser complete |
| 3 | API Integration | New endpoint working end-to-end |
| 4 | Optimization | Rate limiting, caching, prompt tuning |
| 5 | Quality Assurance | Validation pipeline, fallback strategy |
| 6 | **Testing Migration** | Convert existing tests, add new test suites |
| 7 | Migration | A/B testing live, monitoring dashboard |

## Cost Analysis

### Current AST System
- **Claude API**: ~2000 tokens per request
- **Processing**: ~400ms server CPU time
- **Maintenance**: ~20 hours/month developer time

### New Rewrite System
- **Claude API**: ~1500 tokens (simpler prompts)
- **Fast Model API**: ~3000 tokens
- **Processing**: ~100ms server CPU time
- **Maintenance**: ~2 hours/month developer time

### Monthly Cost Comparison (1000 iterations/day)
- **Current**: $15 (Claude) + $0 (CPU) + $3200 (dev time) = $3215
- **New**: $11 (Claude) + $30 (Groq) + $320 (dev time) = $361
- **Savings**: $2854/month (88% reduction)

## Conclusion

The full-file rewrite approach offers substantial benefits for the Lollipop project:

1. **Simplicity**: 50 lines of code vs 580+
2. **Capability**: Handle any transformation naturally
3. **Reliability**: No fragile parsing or line counting
4. **Speed**: Parallel processing with fast inference
5. **Cost**: 88% reduction in total operational cost

The approach aligns perfectly with Lollipop's needs: small files, AI-generated content, and users expecting creative transformations. The implementation is straightforward and can be completed in one week with proper testing.