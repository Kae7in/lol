#!/usr/bin/env node

// Test the fast iteration system with verbose output
// First, check the server logs in your terminal to see Claude's analysis

const API_URL = 'http://localhost:3001/api';
const PROJECT_ID = '1a3fb4fd-e0ab-43ee-9f77-c99a2d6dfa9f'; // Liquid Blob Follower

async function testFastIteration(prompt) {
  console.log('🚀 Testing Fast Iteration System');
  console.log('📦 Project: Liquid Blob Follower');
  console.log(`✏️  Edit: "${prompt}"\n`);
  console.log('📝 Check your server terminal to see Claude\'s analysis output!\n');

  try {
    console.log('⏱️  Starting timer...');
    const startTime = Date.now();
    
    const response = await fetch(`${API_URL}/iterate/fast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        projectId: PROJECT_ID,
        prompt: prompt,
      }),
    });

    const elapsed = Date.now() - startTime;
    const data = await response.json();

    if (!response.ok || data.error) {
      console.error('❌ Error:', data.error || 'Unknown error');
      if (data.details) {
        console.error('Details:', JSON.stringify(data.details, null, 2));
      }
      return;
    }

    console.log('\n✅ Edit completed!');
    console.log('📝 Edited files:', data.editedFiles ? data.editedFiles.join(', ') : 'none');
    console.log('🔢 New version:', data.version || 'unknown');
    
    console.log('\n⏱️  Performance:');
    console.log(`   Total time: ${elapsed}ms (${(elapsed/1000).toFixed(2)}s)`);
    console.log(`   Server reported: ${data.performanceMs}ms`);
    
    console.log('\n👀 View at: http://localhost:5173/create/' + PROJECT_ID);
    
  } catch (error) {
    console.error('❌ Failed:', error.message);
  }
}

// Test with a simple prompt
const prompt = process.argv[2] || 'add a red border around the canvas';
testFastIteration(prompt);