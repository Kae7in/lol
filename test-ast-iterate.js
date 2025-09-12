import fetch from 'node-fetch';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env.local') });

const API_URL = process.env.API_URL || 'http://localhost:3001';

async function testASTIterate() {
  console.log('\n🚀 Testing AST-based iteration endpoint...\n');

  // First, create a test project
  const createResponse = await fetch(`${API_URL}/api/ai/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: 'Create a simple p5.js sketch with a bouncing ball that follows the mouse',
    }),
  });

  if (!createResponse.ok) {
    console.error('Failed to create project:', await createResponse.text());
    return;
  }

  const project = await createResponse.json();
  console.log(`✅ Created project: ${project.id}`);
  console.log(`   Title: ${project.title}`);
  console.log(`   Files: ${Object.keys(project.files).join(', ')}`);

  // Test various AST-based edits
  const testCases = [
    {
      name: 'Change ball color to blue',
      prompt: 'Change the ball color to blue',
      expectation: 'Should modify color property using AST'
    },
    {
      name: 'Add second ball',
      prompt: 'Add a second ball that starts at position (200, 200)',
      expectation: 'Should add new ball variable and update draw function'
    },
    {
      name: 'Change speed',
      prompt: 'Make the ball move twice as fast',
      expectation: 'Should modify speed values semantically'
    },
    {
      name: 'Add trail effect',
      prompt: 'Add a trail effect to the ball',
      expectation: 'Should add trail array and modify draw function'
    },
    {
      name: 'Fix any errors',
      prompt: 'Fix any syntax or type errors in the code',
      expectation: 'Should use validation feedback to fix errors'
    }
  ];

  for (const testCase of testCases) {
    console.log(`\n📝 Test: ${testCase.name}`);
    console.log(`   Prompt: "${testCase.prompt}"`);
    console.log(`   Expectation: ${testCase.expectation}`);

    const startTime = Date.now();

    try {
      // Test AST endpoint
      const astResponse = await fetch(`${API_URL}/api/iterate/ast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          prompt: testCase.prompt,
        }),
      });

      if (!astResponse.ok) {
        console.error(`   ❌ AST iteration failed:`, await astResponse.text());
        continue;
      }

      const astResult = await astResponse.json();
      const astTime = Date.now() - startTime;

      console.log(`   ✅ AST iteration succeeded in ${astTime}ms`);
      console.log(`      Edited files: ${astResult.editedFiles.join(', ')}`);
      console.log(`      Validation: ${astResult.validation.valid ? '✅ Valid' : `❌ ${astResult.validation.errorCount} errors`}`);

      if (!astResult.validation.valid && astResult.validation.errors.length > 0) {
        console.log(`      Errors:`);
        astResult.validation.errors.slice(0, 3).forEach(err => {
          console.log(`        - ${err.file}:${err.line} - ${err.message}`);
        });
      }

      // Compare with traditional line-based approach
      const lineStartTime = Date.now();
      const lineResponse = await fetch(`${API_URL}/api/iterate/fast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          prompt: testCase.prompt,
        }),
      });

      if (lineResponse.ok) {
        const lineResult = await lineResponse.json();
        const lineTime = Date.now() - lineStartTime;

        console.log(`   📊 Comparison with line-based:`);
        console.log(`      AST time: ${astTime}ms`);
        console.log(`      Line time: ${lineTime}ms`);
        console.log(`      Speed difference: ${((lineTime - astTime) / lineTime * 100).toFixed(1)}% ${astTime < lineTime ? 'faster' : 'slower'}`);
      }
    } catch (error) {
      console.error(`   ❌ Error:`, error.message);
    }
  }

  console.log('\n✨ AST iteration tests complete!\n');
}

// Run the test
testASTIterate().catch(console.error);