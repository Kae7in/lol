import { useCallback, useRef, useState, useEffect } from 'react';

export interface StreamMessage {
  type: 'assistant' | 'tool_use' | 'tool_result' | 'complete' | 'error' | 'userMessage' | 'assistantMessage';
  data: {
    content?: string;
    tool?: string;
    toolInput?: any;
    toolOutput?: any;
    files?: Record<string, { content: string; type: string }>;
    error?: string;
    messageId?: string;
  };
  conversationId?: string;
  messageId?: string;
  timestamp: number;
}

export interface StreamingStatus {
  isStreaming: boolean;
  currentAction?: {
    type: 'reading' | 'writing' | 'thinking' | 'complete';
    target?: string;
    progress?: number;
  };
  messages: StreamMessage[];
}

interface UseClaudeStreamOptions {
  onMessage?: (message: StreamMessage) => void;
  onComplete?: (files: Record<string, { content: string; type: string }>) => void;
  onError?: (error: string) => void;
  onProject?: (project: any) => void;
}

export function useClaudeStream(options: UseClaudeStreamOptions = {}) {
  const [status, setStatus] = useState<StreamingStatus>({
    isStreaming: false,
    messages: []
  });
  
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);

  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const connect = useCallback((url: string) => {
    cleanup();
    
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;
    
    setStatus(prev => ({
      ...prev,
      isStreaming: true,
      messages: []
    }));

    eventSource.addEventListener('message', (event) => {
      try {
        const message: StreamMessage = JSON.parse(event.data);
        
        // Update status based on message type
        setStatus(prev => {
          const newMessages = [...prev.messages, message];
          let currentAction = prev.currentAction;
          
          // Determine current action based on message type
          if (message.type === 'tool_use') {
            if (message.data.tool === 'Read') {
              currentAction = {
                type: 'reading',
                target: message.data.toolInput?.file_path || 'file'
              };
            } else if (message.data.tool === 'Write' || message.data.tool === 'Edit') {
              currentAction = {
                type: 'writing',
                target: message.data.toolInput?.file_path || 'file'
              };
            }
          } else if (message.type === 'assistant') {
            currentAction = {
              type: 'thinking'
            };
          } else if (message.type === 'complete') {
            currentAction = {
              type: 'complete'
            };
          }
          
          return {
            isStreaming: message.type !== 'complete',
            currentAction,
            messages: newMessages
          };
        });
        
        // Call callbacks
        if (options.onMessage) {
          options.onMessage(message);
        }
        
        if (message.type === 'complete' && message.data.files && options.onComplete) {
          options.onComplete(message.data.files);
        }
        
        if (message.type === 'error' && message.data.error && options.onError) {
          options.onError(message.data.error);
        }
      } catch (error) {
        console.error('Failed to parse SSE message:', error);
      }
    });

    eventSource.addEventListener('project', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.project && options.onProject) {
          options.onProject(data.project);
        }
      } catch (error) {
        console.error('Failed to parse project event:', error);
      }
    });

    eventSource.addEventListener('done', () => {
      setStatus(prev => ({
        ...prev,
        isStreaming: false
      }));
      cleanup();
    });

    eventSource.addEventListener('error', (event) => {
      console.error('SSE error:', event);
      
      if (eventSource.readyState === EventSource.CLOSED) {
        setStatus(prev => ({
          ...prev,
          isStreaming: false
        }));
        
        // Implement exponential backoff for reconnection
        if (reconnectAttemptsRef.current < 5) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          reconnectAttemptsRef.current++;
          
          console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})...`);
          reconnectTimeoutRef.current = setTimeout(() => {
            connect(url);
          }, delay);
        } else {
          console.error('Max reconnection attempts reached');
          if (options.onError) {
            options.onError('Connection lost. Max reconnection attempts reached.');
          }
        }
      }
    });

    eventSource.addEventListener('open', () => {
      console.log('SSE connection opened');
      reconnectAttemptsRef.current = 0;
    });

    eventSource.addEventListener('heartbeat', () => {
      console.debug('SSE heartbeat received');
    });
  }, [cleanup, options]);

  const streamGeneration = useCallback(async (
    prompt: string,
    projectId?: string,
    conversationId?: string
  ) => {
    try {
      const body = JSON.stringify({ prompt, projectId, conversationId });
      
      // Use the same base URL as the API client
      const baseUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001';
      const url = `${baseUrl}/api/iterate/claude/stream`;
      
      // Use fetch with POST method to send the request
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      // Create EventSource from response stream
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      
      if (!reader) {
        throw new Error('Response body is not readable');
      }
      
      setStatus(prev => ({
        ...prev,
        isStreaming: true,
        messages: []
      }));
      
      // Process the stream
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.startsWith('event:')) {
            // Skip event type line, we'll handle it in data
            continue;
          }
          
          if (line.startsWith('data:')) {
            const data = line.substring(5).trim();
            if (data && data !== '{}') {
              try {
                const message = JSON.parse(data);
                
                // Handle different event types
                if (message.type) {
                  // This is a stream message
                  setStatus(prev => {
                    const newMessages = [...prev.messages, message];
                    let currentAction = prev.currentAction;
                    
                    // Determine current action based on message type
                    if (message.type === 'tool_use') {
                      if (message.data.tool === 'Read') {
                        currentAction = {
                          type: 'reading',
                          target: message.data.toolInput?.file_path || 'file'
                        };
                      } else if (message.data.tool === 'Write' || message.data.tool === 'Edit') {
                        currentAction = {
                          type: 'writing',
                          target: message.data.toolInput?.file_path || 'file'
                        };
                      }
                    } else if (message.type === 'assistant') {
                      currentAction = {
                        type: 'thinking'
                      };
                    } else if (message.type === 'complete') {
                      currentAction = {
                        type: 'complete'
                      };
                    }
                    
                    return {
                      isStreaming: message.type !== 'complete',
                      currentAction,
                      messages: newMessages
                    };
                  });
                  
                  // Call callbacks
                  if (options.onMessage) {
                    options.onMessage(message);
                  }
                  
                  if (message.type === 'complete' && message.data.files && options.onComplete) {
                    options.onComplete(message.data.files);
                  }
                  
                  if (message.type === 'error' && message.data.error && options.onError) {
                    options.onError(message.data.error);
                  }
                } else if (message.project && options.onProject) {
                  // This is a project update
                  options.onProject(message.project);
                }
              } catch (error) {
                console.error('Failed to parse SSE data:', error, data);
              }
            }
          }
        }
      }
      
      setStatus(prev => ({
        ...prev,
        isStreaming: false
      }));
      
    } catch (error) {
      console.error('Stream generation error:', error);
      setStatus(prev => ({
        ...prev,
        isStreaming: false
      }));
      if (options.onError) {
        options.onError(error instanceof Error ? error.message : 'Stream generation failed');
      }
    }
  }, [options]);

  const cancel = useCallback(() => {
    cleanup();
    setStatus(prev => ({
      ...prev,
      isStreaming: false
    }));
  }, [cleanup]);

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return {
    status,
    streamGeneration,
    cancel
  };
}