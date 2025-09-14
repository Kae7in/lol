import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Send, Sparkles, User, FileText, Edit, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useClaudeStream, type StreamMessage } from '@/hooks/useClaudeStream';
import { useConversation, useMessages, type Message as PersistedMessage } from '@/hooks/useConversation';
import ReactMarkdown from 'react-markdown';

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
    if (content.length > 0) {
      return {
        icon: <Sparkles className="h-4 w-4" />,
        message: content,
        color: 'text-purple-500'
      };
    }
  } else if (message.type === 'tool_result') {
    // Don't show success messages - they're not needed
    return null;
  } else if (message.type === 'complete') {
    // Don't show completion message, let the assistant's final message speak for itself
    return null;
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
      
      // Process messages in order, maintaining the same structure as streaming
      for (const msg of persistedMessages) {
        if (msg.role === 'user') {
          // Add user message
          convertedMessages.push({
            id: msg.id,
            role: 'user',
            content: msg.content || '',
            timestamp: new Date(msg.createdAt)
          });
        } else if (msg.role === 'assistant') {
          // Add assistant message (may be empty if only tool calls were made)
          convertedMessages.push({
            id: msg.id,
            role: 'assistant',
            content: msg.content || '',
            timestamp: new Date(msg.createdAt)
          });
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
          
          // Add tool message as standalone item
          if (indicator) {
            convertedMessages.push({
              id: msg.id,
              role: 'tool' as any,
              content: '',
              timestamp: new Date(msg.createdAt),
              toolIndicator: indicator,
              toolName: msg.toolName,
              toolCall: msg.toolCall  // Include the toolCall data for the preview
            } as any);
          }
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
      
      // Don't refresh messages - they're already in the correct state from streaming
      // Refreshing causes a flicker as messages are cleared and reloaded
      
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
        
        {hasMore && !messagesLoading && messages.some(m => m.role === 'user' || m.role === 'assistant') && (
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
              {/* Handle tool messages as standalone items */}
              {(message as any).role === 'tool' && (message as any).toolIndicator ? (
                <div className="ml-11 py-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className={cn((message as any).toolIndicator.color, "opacity-60")}>
                      {(message as any).toolIndicator.icon}
                    </span>
                    <p className="text-xs text-muted-foreground">
                      {(message as any).toolIndicator.message}
                    </p>
                  </div>
                  {/* Show code diff preview for Edit/Write tool calls */}
                  {((message as any).toolName === 'Edit' || (message as any).toolName === 'Write') && (message as any).toolCall && (
                    <div className="mt-2 ml-5 mr-4 rounded-md bg-zinc-900/50 border border-zinc-800/50 overflow-hidden relative text-xs font-mono">
                      {((message as any).toolCall.old_string || (message as any).toolCall.oldString) && (
                        <div className="flex items-start bg-red-500/20 px-3 py-2">
                          <span className="text-red-400/80 mr-2">-</span>
                          <div className="text-zinc-100 whitespace-pre-wrap line-clamp-3 flex-1">
                            {(message as any).toolCall.old_string || (message as any).toolCall.oldString}
                          </div>
                        </div>
                      )}
                      {((message as any).toolCall.new_string || (message as any).toolCall.newString) && (
                        <div className="flex items-start bg-green-500/20 px-3 py-2">
                          <span className="text-green-400/80 mr-2">+</span>
                          <div className="text-zinc-100 whitespace-pre-wrap line-clamp-3 flex-1">
                            {(message as any).toolCall.new_string || (message as any).toolCall.newString}
                          </div>
                        </div>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-zinc-900/50 to-transparent pointer-events-none"></div>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {/* Only show the message row if there's content or it's a user/system message */}
                  {(message.content || message.role === 'user' || message.role === 'system') && (
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
                        {message.content && (
                          <div className="text-sm [&>*]:mb-2 [&>*:last-child]:mb-0">
                            <ReactMarkdown
                              components={{
                                p: ({children}) => <p className="mb-2 last:mb-0">{children}</p>,
                                strong: ({children}) => <strong className="font-semibold">{children}</strong>,
                                em: ({children}) => <em className="italic">{children}</em>,
                                ul: ({children}) => <ul className="list-disc pl-5 mb-2 space-y-1">{children}</ul>,
                                ol: ({children}) => <ol className="list-decimal pl-5 mb-2 space-y-1">{children}</ol>,
                                li: ({children}) => (
                                  <li className="ml-1 [&>p]:inline [&>p]:mb-0">
                                    {children}
                                  </li>
                                ),
                                code: ({children}) => <code className="px-1 py-0.5 bg-muted rounded text-xs">{children}</code>,
                                pre: ({children}) => <pre className="p-2 bg-muted rounded overflow-x-auto mb-2">{children}</pre>,
                              }}
                            >
                              {message.content}
                            </ReactMarkdown>
                          </div>
                        )}
                        {isClient && message.content && (
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
                  )}
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
                  className="ml-11 py-0.5 animate-in fade-in-0 slide-in-from-bottom-1 duration-300"
                >
                  <div className="flex items-center gap-1.5">
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
                  {/* Show code diff preview for Edit/Write tool calls during streaming */}
                  {item.message.type === 'tool_use' && 
                   (item.message.data.tool === 'Edit' || item.message.data.tool === 'Write') && 
                   item.message.data.toolInput && (
                    <div className="mt-2 ml-5 mr-4 rounded-md bg-zinc-900/50 border border-zinc-800/50 overflow-hidden relative text-xs font-mono">
                      {item.message.data.toolInput.old_string && (
                        <div className="flex items-start bg-red-500/20 px-3 py-2">
                          <span className="text-red-400/80 mr-2">-</span>
                          <div className="text-zinc-100 whitespace-pre-wrap line-clamp-3 flex-1">
                            {item.message.data.toolInput.old_string}
                          </div>
                        </div>
                      )}
                      {item.message.data.toolInput.new_string && (
                        <div className="flex items-start bg-green-500/20 px-3 py-2">
                          <span className="text-green-400/80 mr-2">+</span>
                          <div className="text-zinc-100 whitespace-pre-wrap line-clamp-3 flex-1">
                            {item.message.data.toolInput.new_string}
                          </div>
                        </div>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-zinc-900/50 to-transparent pointer-events-none"></div>
                    </div>
                  )}
                </div>
              );
            }
            
            // Assistant thinking messages - show with sparkle and message
            return (
              <div
                key={item.id}
                className="flex gap-3 animate-in fade-in-0 slide-in-from-bottom-1 duration-300"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
                  <Sparkles className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  {item.indicator && (
                    <p className="text-sm">
                      {item.indicator.message}
                    </p>
                  )}
                  {isClient && (
                    <p className="text-xs mt-1 text-muted-foreground">
                      {item.timestamp.toLocaleTimeString()}
                    </p>
                  )}
                </div>
              </div>
            );
          })}

          {/* Show working indicator after the last streaming message */}
          {formattedStreamingMessages.length > 0 && status.isStreaming && (
            <div className="ml-11 py-2 animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
              <div className="flex items-center gap-2">
                <div className="relative">
                  <div className="h-4 w-4 rounded-full bg-purple-500/20 animate-ping absolute"></div>
                  <div className="h-4 w-4 rounded-full bg-purple-500/40 animate-pulse"></div>
                </div>
                <p className="text-xs text-muted-foreground animate-pulse">
                  Working...
                </p>
              </div>
            </div>
          )}

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