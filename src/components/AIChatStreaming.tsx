import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Send, Sparkles, User, FileText, Edit, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useClaudeStream, type StreamMessage } from '@/hooks/useClaudeStream';
import { useConversation, useMessages, type Message as PersistedMessage } from '@/hooks/useConversation';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

interface AIChatStreamingProps {
  onGenerate: (prompt: string, messages: Message[]) => Promise<void>;
  onStreamComplete?: (files: Record<string, { content: string; type: string }>) => void;
  onProjectUpdate?: (project: any) => void;
  isGenerating: boolean;
  projectId?: string;
  conversationId?: string;
}

interface StreamingIndicator {
  icon: React.ReactElement;
  message: string;
  color: string;
}

function getStreamingIndicator(message: StreamMessage): StreamingIndicator | null {
  if (message.type === 'tool_use') {
    if (message.data.tool === 'Read') {
      const filePath = message.data.toolInput?.file_path;
      const fileName = filePath ? filePath.split('/').pop() : 'file';
      return {
        icon: <FileText className="h-4 w-4" />,
        message: `Reading ${fileName}`,
        color: 'text-blue-500'
      };
    } else if (message.data.tool === 'Write' || message.data.tool === 'Edit') {
      const filePath = message.data.toolInput?.file_path;
      const fileName = filePath ? filePath.split('/').pop() : 'file';
      return {
        icon: <Edit className="h-4 w-4" />,
        message: `Writing ${fileName}`,
        color: 'text-green-500'
      };
    } else {
      return {
        icon: <Sparkles className="h-4 w-4" />,
        message: `Using ${message.data.tool}`,
        color: 'text-purple-500'
      };
    }
  } else if (message.type === 'assistant' && message.data.content) {
    // Only show assistant messages if they have content
    const content = message.data.content.trim();
    if (content.length > 100) {
      return {
        icon: <Sparkles className="h-4 w-4" />,
        message: content.substring(0, 100) + '...',
        color: 'text-purple-500'
      };
    } else if (content.length > 0) {
      return {
        icon: <Sparkles className="h-4 w-4" />,
        message: content,
        color: 'text-purple-500'
      };
    }
  } else if (message.type === 'tool_result') {
    // Show tool results briefly
    const result = typeof message.data.toolOutput === 'string' 
      ? message.data.toolOutput 
      : JSON.stringify(message.data.toolOutput);
    if (result.includes('successfully') || result.includes('complete')) {
      return {
        icon: <Check className="h-3 w-3" />,
        message: 'Success',
        color: 'text-green-500 opacity-70'
      };
    }
  } else if (message.type === 'complete') {
    return {
      icon: <Check className="h-4 w-4" />,
      message: 'Generation complete!',
      color: 'text-green-600'
    };
  } else if (message.type === 'error') {
    return {
      icon: <X className="h-4 w-4" />,
      message: `Error: ${message.data.error}`,
      color: 'text-red-500'
    };
  }
  return null;
}

export function AIChatStreaming({
  onGenerate,
  onStreamComplete,
  onProjectUpdate,
  isGenerating,
  projectId,
  conversationId: initialConversationId
}: AIChatStreamingProps) {
  const [localConversationId, setLocalConversationId] = useState<string | undefined>(initialConversationId);
  
  // Update local conversation ID when prop changes
  useEffect(() => {
    if (initialConversationId && initialConversationId !== localConversationId) {
      setLocalConversationId(initialConversationId);
    }
  }, [initialConversationId]);
  const [messages, setMessages] = useState<Message[]>(() => [
    {
      id: '1',
      role: 'system',
      content: 'Welcome! Describe the web experience you want to create, and I\'ll generate it for you.',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isClient, setIsClient] = useState(false);
  const [streamingMessages, setStreamingMessages] = useState<StreamMessage[]>([]);
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Use persisted conversation and messages hooks
  const { createConversation } = useConversation(projectId, localConversationId);
  const { 
    messages: persistedMessages, 
    refresh: refreshMessages,
    loading: messagesLoading,
    hasMore,
    loadMore
  } = useMessages(localConversationId);

  // Load persisted messages on mount or when conversation changes
  useEffect(() => {
    if (persistedMessages && persistedMessages.length > 0) {
      const convertedMessages: Message[] = [];
      let currentAssistantGroup: { assistant?: Message; tools: Array<{ message: PersistedMessage; indicator: StreamingIndicator }> } | null = null;
      
      for (const msg of persistedMessages) {
        if (msg.role === 'user') {
          // Finalize any pending assistant group
          if (currentAssistantGroup) {
            if (currentAssistantGroup.assistant) {
              convertedMessages.push(currentAssistantGroup.assistant);
            }
            // Add tool messages as metadata for display
            if (currentAssistantGroup.tools.length > 0 && currentAssistantGroup.assistant) {
              (currentAssistantGroup.assistant as any).toolMessages = currentAssistantGroup.tools;
            }
            currentAssistantGroup = null;
          }
          
          // Add user message
          convertedMessages.push({
            id: msg.id,
            role: 'user',
            content: msg.content || '',
            timestamp: new Date(msg.createdAt)
          });
        } else if (msg.role === 'assistant') {
          // Start or update assistant group
          if (!currentAssistantGroup) {
            currentAssistantGroup = { tools: [] };
          }
          
          // Create assistant message with proper content
          const assistantContent = msg.content && msg.content.trim() ? 
            msg.content : 
            'I\'ve updated your project. Check the preview on the right.';
          
          currentAssistantGroup.assistant = {
            id: msg.id,
            role: 'assistant',
            content: assistantContent,
            timestamp: new Date(msg.createdAt)
          };
        } else if (msg.role === 'tool' && msg.toolName) {
          // Create tool indicator for display
          let indicator: StreamingIndicator | null = null;
          
          if (msg.toolName === 'Read') {
            const filePath = msg.toolCall?.file_path || '';
            const fileName = filePath ? filePath.split('/').pop() : 'file';
            indicator = {
              icon: <FileText className="h-3 w-3" />,
              message: `Reading ${fileName}`,
              color: 'text-blue-500'
            };
          } else if (msg.toolName === 'Write' || msg.toolName === 'Edit') {
            const filePath = msg.toolCall?.file_path || '';
            const fileName = filePath ? filePath.split('/').pop() : 'file';
            indicator = {
              icon: <Edit className="h-3 w-3" />,
              message: `Writing ${fileName}`,
              color: 'text-green-500'
            };
          } else {
            indicator = {
              icon: <Sparkles className="h-3 w-3" />,
              message: `Using ${msg.toolName}`,
              color: 'text-purple-500'
            };
          }
          
          if (indicator) {
            if (!currentAssistantGroup) {
              currentAssistantGroup = { tools: [] };
            }
            currentAssistantGroup.tools.push({ message: msg, indicator });
          }
        }
      }
      
      // Finalize any remaining assistant group
      if (currentAssistantGroup) {
        if (currentAssistantGroup.assistant) {
          // Add tool messages as metadata
          if (currentAssistantGroup.tools.length > 0) {
            (currentAssistantGroup.assistant as any).toolMessages = currentAssistantGroup.tools;
          }
          convertedMessages.push(currentAssistantGroup.assistant);
        }
      }
      
      // Set messages or show welcome if empty
      if (convertedMessages.length === 0) {
        setMessages([{
          id: '1',
          role: 'system',
          content: 'Welcome! Describe the web experience you want to create, and I\'ll generate it for you.',
          timestamp: new Date(),
        }]);
      } else {
        setMessages(convertedMessages);
      }
    } else {
      // No persisted messages, show welcome
      setMessages([{
        id: '1',
        role: 'system',
        content: 'Welcome! Describe the web experience you want to create, and I\'ll generate it for you.',
        timestamp: new Date(),
      }]);
    }
  }, [persistedMessages]);

  const { status, streamGeneration } = useClaudeStream({
    onMessage: (message) => {
      console.log('Stream message:', message);
      setStreamingMessages(prev => [...prev, message]);
      // First message received, stop waiting
      setIsWaitingForResponse(false);
      
      // Handle conversation and message IDs from stream
      if (message.conversationId && !localConversationId) {
        setLocalConversationId(message.conversationId);
      }
      
      // Don't refresh during streaming to avoid flicker
      // We'll refresh once at the end when complete
    },
    onComplete: (files) => {
      console.log('Stream complete with files:', files);
      if (onStreamComplete) {
        onStreamComplete(files);
      }
      
      // Refresh messages to get the final state from DB
      refreshMessages();
      
      // Clear streaming messages after completion
      setStreamingMessages([]);
      setIsWaitingForResponse(false);
    },
    onError: (error) => {
      console.error('Stream error:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Error: ${error}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
      // Clear streaming messages on error
      setStreamingMessages([]);
      setIsWaitingForResponse(false);
    },
    onProject: (project) => {
      console.log('Project update:', project);
      if (onProjectUpdate) {
        onProjectUpdate(project);
      }
    }
  });

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages, streamingMessages]);

  const handleSubmit = async () => {
    if (!input.trim() || isGenerating || status.isStreaming) return;

    // Create conversation if it doesn't exist
    let conversationId = localConversationId;
    if (!conversationId && projectId) {
      const newConversation = await createConversation(input.trim().slice(0, 100));
      if (newConversation && 'id' in newConversation) {
        conversationId = newConversation.id;
        setLocalConversationId(conversationId);
      }
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const prompt = input.trim();
    setInput('');

    // Clear previous streaming messages when starting new generation
    setStreamingMessages([]);
    // Show waiting animation
    setIsWaitingForResponse(true);
    // Use streaming with conversation ID
    await streamGeneration(prompt, projectId, conversationId);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Format streaming messages for display
  const formattedStreamingMessages = streamingMessages.map((msg, idx) => {
    const indicator = getStreamingIndicator(msg);
    return {
      id: `stream-${idx}`,
      indicator,
      message: msg,
      timestamp: new Date(msg.timestamp)
    };
  }).filter(item => item.indicator !== null);

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border bg-background">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          AI Editor
          {localConversationId && (
            <span className="text-xs text-muted-foreground">
              #{localConversationId.slice(0, 8)}
            </span>
          )}
        </h2>
      </div>

      <div className="flex-1 p-4 overflow-y-auto" ref={scrollAreaRef}>
        {messagesLoading && messages.length === 0 && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading conversation...</span>
          </div>
        )}
        
        {hasMore && !messagesLoading && (
          <div className="text-center pb-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={loadMore}
              disabled={messagesLoading}
            >
              Load earlier messages
            </Button>
          </div>
        )}
        
        <div className="space-y-4">
          {messages.map((message) => (
            <React.Fragment key={message.id}>
              <div
                className={cn(
                  'flex gap-3',
                  message.role === 'user' && 'flex-row-reverse'
                )}
              >
                <div
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : ''
                  )}
                >
                  {message.role === 'user' ? (
                    <User className="h-4 w-4" />
                  ) : (
                    <Sparkles className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div
                  className={cn(
                    'flex-1',
                    message.role === 'user' && 'rounded-lg px-3 py-2 bg-primary text-primary-foreground'
                  )}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  {isClient && (
                    <p
                      className={cn(
                        'text-xs mt-1',
                        message.role === 'user'
                          ? 'text-primary-foreground/70'
                          : 'text-muted-foreground'
                      )}
                    >
                      {message.timestamp.toLocaleTimeString()}
                    </p>
                  )}
                </div>
              </div>
              
              {/* Display tool messages inline if they exist (for persisted messages) */}
              {message.role === 'assistant' && (message as any).toolMessages && (
                <>
                  {(message as any).toolMessages.map((tool: any, idx: number) => (
                    <div
                      key={`${message.id}-tool-${idx}`}
                      className="ml-11 flex items-center gap-1.5 py-0.5"
                    >
                      <span className={cn(tool.indicator.color, "opacity-60")}>
                        {tool.indicator.icon}
                      </span>
                      <p className="text-xs text-muted-foreground">
                        {tool.indicator.message}
                      </p>
                    </div>
                  ))}
                </>
              )}
            </React.Fragment>
          ))}

          {/* Initial loading animation when waiting for first response */}
          {isWaitingForResponse && (
            <div className="flex gap-3 animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
                <Sparkles className="h-4 w-4 text-muted-foreground animate-pulse" />
              </div>
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <span className="h-2 w-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                  <span className="h-2 w-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                  <span className="h-2 w-2 bg-muted-foreground rounded-full animate-bounce"></span>
                </div>
                <p className="text-sm text-muted-foreground">Thinking...</p>
              </div>
            </div>
          )}

          {/* Streaming messages display */}
          {formattedStreamingMessages.map((item) => {
            // Check if this is a tool-call message (Read, Write, Edit, etc)
            const isToolCall = item.message.type === 'tool_use' || item.message.type === 'tool_result';
            
            if (isToolCall) {
              // Tool calls - minimal display with just icon and text
              return (
                <div
                  key={item.id}
                  className="ml-11 flex items-center gap-1.5 animate-in fade-in-0 slide-in-from-bottom-1 duration-300 py-0.5"
                >
                  {item.indicator && (
                    <>
                      <span className={cn(item.indicator.color, "opacity-60")}>
                        {item.indicator.icon}
                      </span>
                      <p className="text-xs text-muted-foreground">
                        {item.indicator.message}
                      </p>
                    </>
                  )}
                </div>
              );
            }
            
            // Regular assistant messages
            return (
              <div
                key={item.id}
                className="flex gap-3 animate-in fade-in-0 slide-in-from-bottom-1 duration-300"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
                  <Sparkles className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    {item.indicator && (
                      <>
                        <span className={item.indicator.color}>
                          {item.indicator.icon}
                        </span>
                        <p className="text-sm">
                          {item.indicator.message}
                        </p>
                      </>
                    )}
                  </div>
                  {isClient && (
                    <p className="text-xs mt-1 text-muted-foreground">
                      {item.timestamp.toLocaleTimeString()}
                    </p>
                  )}
                </div>
              </div>
            );
          })}

        </div>
      </div>

      <div className="p-4 border-t border-border bg-background">
        <div className="flex gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe what you want to create..."
            className="min-h-[60px] resize-none"
            disabled={isGenerating || status.isStreaming}
          />
          <Button
            onClick={handleSubmit}
            disabled={isGenerating || status.isStreaming || !input.trim()}
            size="icon"
            className="h-[60px] w-[60px]"
          >
            {(isGenerating || status.isStreaming) ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}