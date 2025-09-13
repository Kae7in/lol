import fs from 'fs/promises';
import path from 'path';

export interface StreamMessage {
  type: 'assistant' | 'tool_use' | 'tool_result' | 'complete' | 'error';
  data: {
    content?: string;
    tool?: string;
    toolInput?: any;
    toolOutput?: any;
    files?: Record<string, { content: string; type: string }>;
    error?: string;
  };
  timestamp: number;
}

export class ClaudeWorkspace {
  async generate(prompt: string, existingFiles: Record<string, { content: string; type: string }> = {}): Promise<Record<string, { content: string; type: string }>> {
    console.log('[ClaudeWorkspace] Starting generation...');
    console.log('[ClaudeWorkspace] Prompt length:', prompt.length);
    console.log('[ClaudeWorkspace] Existing files:', Object.keys(existingFiles));
    const workDir = `/tmp/claude-${Date.now()}`;
    
    try {
      await fs.mkdir(workDir, { recursive: true });
      console.log('[ClaudeWorkspace] Created working directory:', workDir);
      
      // Check if API key is set
      console.log('[ClaudeWorkspace] ANTHROPIC_API_KEY set?', !!process.env.ANTHROPIC_API_KEY);
      
      // Dynamically import the ESM module
      console.log('[ClaudeWorkspace] Loading Claude Code SDK...');
      const sdk = await import('@anthropic-ai/claude-code');
      console.log('[ClaudeWorkspace] SDK loaded, available exports:', Object.keys(sdk));
      
      const query = sdk.query || sdk.default?.query;
      if (!query) {
        throw new Error('Could not find query function in SDK');
      }
      
      console.log('[ClaudeWorkspace] Calling Claude Code SDK...');
      
      // Create an AbortController for timeout
      const abortController = new AbortController();
      const queryTimeout = setTimeout(() => {
        console.error('[ClaudeWorkspace] Query timeout - aborting after 60 seconds');
        abortController.abort();
      }, 60000); // 60 second timeout for the entire query
      
      let fullResponse = '';
      
      try {
        // Write existing files to the working directory first
        for (const [filename, fileData] of Object.entries(existingFiles)) {
          const filePath = path.join(workDir, filename);
          await fs.writeFile(filePath, fileData.content || '');
          console.log(`[ClaudeWorkspace] Wrote existing file: ${filename}`);
        }
        
        // Modify the prompt to ask for file updates
        const filePrompt = `${prompt}

IMPORTANT: The files are already in your working directory. You need to:
1. Read the existing files (index.html, style.css, script.js) 
2. Make the necessary changes to fix the issue
3. Write the updated files back using the Edit or Write tool

Update ALL files with the complete, working code. Don't just describe changes - actually update the files.`;

        // Use the SDK to generate code with proper permissions
        const response = await query({
          prompt: filePrompt,
          options: {
            cwd: workDir,
            maxTurns: 10,  // Increased to allow reading AND editing files
            permissionMode: 'bypassPermissions',  // Allow all operations without permission prompts
            abortSignal: abortController.signal
          }
        });
        
        console.log('[ClaudeWorkspace] Got response from SDK');
        clearTimeout(queryTimeout);
        
        // Collect the response with timeout protection
        const iterationTimeout = setTimeout(() => {
          console.error('[ClaudeWorkspace] WARNING: Response iteration timeout after 90 seconds');
          abortController.abort();
        }, 90000);  // Increased to 90 seconds for file creation operations
        
        let filesCreated = 0;
        const expectedFiles = ['index.html', 'style.css', 'script.js'];
        
        for await (const message of response) {
          console.log('[ClaudeWorkspace] Message type:', message.type);
          
          // Skip system messages as they don't contain content we need
          if (message.type === 'system') {
            console.log('[ClaudeWorkspace] System message received, continuing...');
            continue;
          }
          
          // Handle different message types
          if (message.type === 'assistant') {
            // Assistant messages may have content as string or array
            if (typeof message.message?.content === 'string') {
              fullResponse += message.message.content;
              console.log('[ClaudeWorkspace] Assistant message string:', message.message.content.substring(0, 200));
            } else if (Array.isArray(message.message?.content)) {
              // Content can be an array of text blocks
              for (const block of message.message.content) {
                if (block.type === 'text' && block.text) {
                  fullResponse += block.text;
                  console.log('[ClaudeWorkspace] Assistant message text block:', block.text.substring(0, 200));
                }
              }
            } else if (message.message) {
              console.log('[ClaudeWorkspace] Assistant message structure:', JSON.stringify(message.message).substring(0, 200));
            }
          } else if (message.type === 'user') {
            // User messages are tool results - track file operations
            if (message.message?.content?.[0]?.type === 'tool_result') {
              const content = message.message.content[0].content;
              if (typeof content === 'string') {
                if (content.includes('File created successfully') || 
                    content.includes('has been updated') || 
                    content.includes('edited successfully')) {
                  filesCreated++;
                  console.log(`[ClaudeWorkspace] File operation (${filesCreated}/${expectedFiles.length}): ${content}`);
                  
                  // Check if all expected files have been processed
                  if (filesCreated >= expectedFiles.length) {
                    console.log('[ClaudeWorkspace] All expected files processed, waiting for completion...');
                    // Give it a bit more time to finish up
                    setTimeout(() => {
                      console.log('[ClaudeWorkspace] Force completion after all files processed');
                      abortController.abort();
                    }, 5000);
                  }
                }
              }
            }
            console.log('[ClaudeWorkspace] User message (tool result):', JSON.stringify(message).substring(0, 200));
          } else if (message.type === 'result') {
            // The final result indicates completion
            console.log('[ClaudeWorkspace] Result message received - iteration complete');
            if (message.result && typeof message.result === 'string') {
              fullResponse = message.result;
            }
            console.log('[ClaudeWorkspace] Result details:', JSON.stringify(message).substring(0, 500));
            break; // Exit the loop when we get the result
          } else if (message.type === 'error') {
            console.error('[ClaudeWorkspace] Error message:', message);
            throw new Error(`SDK returned error: ${JSON.stringify(message)}`);
          } else {
            // Log any unexpected message types
            console.log('[ClaudeWorkspace] Unexpected message type:', message.type, 'Full message:', JSON.stringify(message).substring(0, 500));
          }
        }
        
        clearTimeout(iterationTimeout);
      } catch (error: any) {
        clearTimeout(queryTimeout);
        if (error.name === 'AbortError') {
          // Check if this was an intentional abort after file creation
          if (filesCreated >= expectedFiles.length) {
            console.log('[ClaudeWorkspace] Aborted after successful file creation');
          } else {
            console.log('[ClaudeWorkspace] Query timed out or was aborted');
          }
          // Don't throw error, continue with what we have
        } else {
          throw error;
        }
      }
      
      console.log('[ClaudeWorkspace] Full response length:', fullResponse.length);
      console.log('[ClaudeWorkspace] Response preview:', fullResponse.substring(0, 200));
      
      // First check if Claude created any files in the working directory
      console.log('[ClaudeWorkspace] Reading generated files from directory...');
      const files: Record<string, { content: string; type: string }> = {};
      const fileList = await fs.readdir(workDir);
      console.log('[ClaudeWorkspace] Files found in directory:', fileList);
      
      for (const filename of fileList) {
        // Skip hidden files
        if (!filename.startsWith('.')) {
          const filePath = path.join(workDir, filename);
          const content = await fs.readFile(filePath, 'utf8');
          const type = filename.endsWith('.css') ? 'css' : 
                       filename.endsWith('.js') ? 'javascript' : 'html';
          files[filename] = { content, type };
          console.log(`[ClaudeWorkspace] Processed file: ${filename} (${content.length} chars)`);
        }
      }
      
      // If no files were created, extract code from the response
      if (Object.keys(files).length === 0 && fullResponse) {
        console.log('[ClaudeWorkspace] No files generated, extracting code from response...');
        
        // Extract code blocks from the response - try multiple patterns
        const htmlMatch = fullResponse.match(/```html\n?([\s\S]*?)```/) || 
                         fullResponse.match(/```HTML\n?([\s\S]*?)```/);
        const cssMatch = fullResponse.match(/```css\n?([\s\S]*?)```/) || 
                        fullResponse.match(/```CSS\n?([\s\S]*?)```/);
        const jsMatch = fullResponse.match(/```javascript\n?([\s\S]*?)```/) || 
                       fullResponse.match(/```js\n?([\s\S]*?)```/) ||
                       fullResponse.match(/```JavaScript\n?([\s\S]*?)```/) ||
                       fullResponse.match(/```JS\n?([\s\S]*?)```/);
        
        if (htmlMatch) {
          files['index.html'] = {
            content: htmlMatch[1].trim(),
            type: 'html'
          };
          console.log('[ClaudeWorkspace] Extracted HTML:', htmlMatch[1].length, 'chars');
        }
        
        if (cssMatch) {
          files['style.css'] = {
            content: cssMatch[1].trim(),
            type: 'css'
          };
          console.log('[ClaudeWorkspace] Extracted CSS:', cssMatch[1].length, 'chars');
        }
        
        if (jsMatch) {
          files['script.js'] = {
            content: jsMatch[1].trim(),
            type: 'javascript'
          };
          console.log('[ClaudeWorkspace] Extracted JS:', jsMatch[1].length, 'chars');
        }
        
        // If still no files, create a single HTML file with the entire response
        if (Object.keys(files).length === 0) {
          console.log('[ClaudeWorkspace] No code blocks found, using full response as HTML');
          files['index.html'] = {
            content: fullResponse,
            type: 'html'
          };
        }
      }
      
      console.log('[ClaudeWorkspace] Generation complete. Files:', Object.keys(files));
      return files;
      
    } catch (error: any) {
      console.error('[ClaudeWorkspace] Error:', error.message);
      if (error.stderr) {
        console.error('[ClaudeWorkspace] stderr:', error.stderr);
      }
      if (error.stdout) {
        console.error('[ClaudeWorkspace] stdout:', error.stdout);
      }
      throw error;
    } finally {
      // Cleanup
      try {
        console.log('[ClaudeWorkspace] Cleaning up working directory...');
        await fs.rm(workDir, { recursive: true, force: true });
      } catch (e) {
        console.error('[ClaudeWorkspace] Error cleaning up:', e);
      }
    }
  }

  async *generateStream(prompt: string, existingFiles: Record<string, { content: string; type: string }> = {}): AsyncGenerator<StreamMessage> {
    console.log('[ClaudeWorkspace] Starting streaming generation...');
    const workDir = `/tmp/claude-${Date.now()}`;
    
    try {
      await fs.mkdir(workDir, { recursive: true });
      console.log('[ClaudeWorkspace] Created working directory:', workDir);
      
      // Dynamically import the ESM module
      const sdk = await import('@anthropic-ai/claude-code');
      const query = sdk.query || sdk.default?.query;
      if (!query) {
        throw new Error('Could not find query function in SDK');
      }
      
      // Write existing files to the working directory first
      for (const [filename, fileData] of Object.entries(existingFiles)) {
        const filePath = path.join(workDir, filename);
        await fs.writeFile(filePath, fileData.content || '');
        console.log(`[ClaudeWorkspace] Wrote existing file: ${filename}`);
      }
      
      // Modify the prompt to ask for file updates
      const filePrompt = `${prompt}

IMPORTANT: The files are already in your working directory. You need to:
1. Read the existing files (index.html, style.css, script.js) 
2. Make the necessary changes to fix the issue
3. Write the updated files back using the Edit or Write tool

Update ALL files with the complete, working code. Don't just describe changes - actually update the files.`;

      // Create an AbortController for timeout
      const abortController = new AbortController();
      const queryTimeout = setTimeout(() => {
        console.error('[ClaudeWorkspace] Query timeout - aborting after 60 seconds');
        abortController.abort();
      }, 60000);
      
      // Use the SDK to generate code with proper permissions
      const response = await query({
        prompt: filePrompt,
        options: {
          cwd: workDir,
          maxTurns: 10,
          permissionMode: 'bypassPermissions',
          abortSignal: abortController.signal
        }
      });
      
      console.log('[ClaudeWorkspace] Got response from SDK, starting stream...');
      clearTimeout(queryTimeout);
      
      const collectedFiles: Record<string, { content: string; type: string }> = {};
      let filesCreated = 0;
      const expectedFiles = ['index.html', 'style.css', 'script.js'];
      
      for await (const message of response) {
        console.log('[ClaudeWorkspace] Stream message type:', message.type);
        
        // Skip system messages
        if (message.type === 'system') {
          continue;
        }
        
        // Handle assistant messages
        if (message.type === 'assistant') {
          let content = '';
          
          if (typeof message.message?.content === 'string') {
            content = message.message.content;
          } else if (Array.isArray(message.message?.content)) {
            // Check for tool use blocks
            for (const block of message.message.content) {
              if (block.type === 'text' && block.text) {
                content += block.text;
              } else if (block.type === 'tool_use') {
                // Emit tool use event
                yield {
                  type: 'tool_use',
                  data: {
                    tool: block.name,
                    toolInput: block.input
                  },
                  timestamp: Date.now()
                };
              }
            }
          }
          
          if (content) {
            yield {
              type: 'assistant',
              data: { content },
              timestamp: Date.now()
            };
          }
        }
        
        // Handle user messages (tool results)
        if (message.type === 'user' && message.message?.content?.[0]?.type === 'tool_result') {
          const toolResult = message.message.content[0];
          const resultContent = toolResult.content;
          
          yield {
            type: 'tool_result',
            data: {
              tool: toolResult.tool_use_id,
              toolOutput: resultContent
            },
            timestamp: Date.now()
          };
          
          // Track file operations
          if (typeof resultContent === 'string') {
            if (resultContent.includes('File created successfully') || 
                resultContent.includes('has been updated') || 
                resultContent.includes('edited successfully')) {
              filesCreated++;
              console.log(`[ClaudeWorkspace] File operation (${filesCreated}/${expectedFiles.length})`);
              
              if (filesCreated >= expectedFiles.length) {
                console.log('[ClaudeWorkspace] All expected files processed');
              }
            }
          }
        }
        
        // Handle result message (completion)
        if (message.type === 'result') {
          console.log('[ClaudeWorkspace] Result message received - reading final files...');
          break;
        }
        
        // Handle error messages
        if (message.type === 'error') {
          yield {
            type: 'error',
            data: { error: JSON.stringify(message) },
            timestamp: Date.now()
          };
          throw new Error(`SDK returned error: ${JSON.stringify(message)}`);
        }
      }
      
      // Read the generated files
      console.log('[ClaudeWorkspace] Reading generated files from directory...');
      const fileList = await fs.readdir(workDir);
      
      for (const filename of fileList) {
        if (!filename.startsWith('.')) {
          const filePath = path.join(workDir, filename);
          const content = await fs.readFile(filePath, 'utf8');
          const type = filename.endsWith('.css') ? 'css' : 
                       filename.endsWith('.js') ? 'javascript' : 'html';
          collectedFiles[filename] = { content, type };
          console.log(`[ClaudeWorkspace] Processed file: ${filename} (${content.length} chars)`);
        }
      }
      
      // Emit completion event with files
      yield {
        type: 'complete',
        data: { files: collectedFiles },
        timestamp: Date.now()
      };
      
    } catch (error: any) {
      console.error('[ClaudeWorkspace] Stream error:', error.message);
      yield {
        type: 'error',
        data: { error: error.message },
        timestamp: Date.now()
      };
      throw error;
    } finally {
      // Cleanup
      try {
        console.log('[ClaudeWorkspace] Cleaning up working directory...');
        await fs.rm(workDir, { recursive: true, force: true });
      } catch (e) {
        console.error('[ClaudeWorkspace] Error cleaning up:', e);
      }
    }
  }
}