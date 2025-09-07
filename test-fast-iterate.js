#!/usr/bin/env node

// Test the fast iteration system
const API_URL = 'http://localhost:3001/api';
const PROJECT_ID = '1a3fb4fd-e0ab-43ee-9f77-c99a2d6dfa9f'; // Liquid Blob Follower
const EDIT_PROMPT = 'display two blobs instead of one';

async function testFastIteration() {
  console.log('🚀 Testing Fast Iteration System');
  console.log('📦 Project: Liquid Blob Follower');
  console.log('✏️  Edit: "display two blobs instead of one"\n');

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
        prompt: EDIT_PROMPT,
      }),
    });

    const elapsed = Date.now() - startTime;
    const data = await response.json();
    
    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(data, null, 2));

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

testFastIteration();