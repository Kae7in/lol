import { useState, useEffect, useCallback } from 'react';
import { fetchClient } from '@/lib/api-client';

export interface Conversation {
  id: string;
  projectId?: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  projectId?: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolName?: string;
  toolCall?: any;
  toolResult?: any;
  streamingStatus?: 'pending' | 'streaming' | 'complete' | 'error';
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export function useConversation(projectId?: string, conversationId?: string) {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadConversation = useCallback(async () => {
    if (!conversationId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetchClient.GET('/api/conversations/{id}', {
        params: { path: { id: conversationId } }
      });
      if (response.data) {
        setConversation(response.data);
      } else {
        throw new Error('Failed to load conversation');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load conversation');
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  const createConversation = useCallback(async (title?: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetchClient.POST('/api/conversations', {
        body: {
          projectId: projectId || undefined,
          title: title || undefined
        } as any
      });
      
      if (response.data) {
        setConversation(response.data);
        return response.data;
      } else {
        throw new Error('Failed to create conversation');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create conversation');
      return null;
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const deleteConversation = useCallback(async () => {
    if (!conversation?.id) return false;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetchClient.DELETE('/api/conversations/{id}', {
        params: { path: { id: conversation.id } }
      });
      if (response.data !== undefined) {
        setConversation(null);
        return true;
      } else {
        throw new Error('Failed to delete conversation');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete conversation');
      return false;
    } finally {
      setLoading(false);
    }
  }, [conversation?.id]);

  useEffect(() => {
    if (conversationId) {
      loadConversation();
    }
  }, [conversationId, loadConversation]);

  return {
    conversation,
    loading,
    error,
    createConversation,
    deleteConversation,
    refreshConversation: loadConversation
  };
}

export function useMessages(conversationId?: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const loadMessages = useCallback(async (reset = false) => {
    if (!conversationId) return;
    if (loading) return;
    if (!reset && !hasMore) return;
    
    setLoading(true);
    setError(null);
    
    const currentOffset = reset ? 0 : offset;
    
    try {
      const response = await fetchClient.GET('/api/conversations/{conversationId}/messages', {
        params: {
          path: { conversationId },
          query: { limit, offset: currentOffset }
        } as any
      });
      
      if (response.data) {
        const data = response.data as any[];
        
        if (reset) {
          setMessages(data);
          setOffset(data.length);
        } else {
          setMessages(prev => [...prev, ...data]);
          setOffset(prev => prev + data.length);
        }
        
        setHasMore(data.length === limit);
      } else {
        throw new Error('Failed to load messages');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load messages');
    } finally {
      setLoading(false);
    }
  }, [conversationId, loading, hasMore, offset]);

  const addMessage = useCallback((message: Message) => {
    setMessages(prev => [...prev, message]);
  }, []);

  const updateMessage = useCallback((messageId: string, updates: Partial<Message>) => {
    setMessages(prev => prev.map(msg => 
      msg.id === messageId ? { ...msg, ...updates } : msg
    ));
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setOffset(0);
    setHasMore(true);
  }, []);

  useEffect(() => {
    if (conversationId) {
      loadMessages(true);
    } else {
      clearMessages();
    }
  }, [conversationId]);

  return {
    messages,
    loading,
    error,
    hasMore,
    loadMore: () => loadMessages(false),
    refresh: () => loadMessages(true),
    addMessage,
    updateMessage,
    clearMessages
  };
}

export function useConversationList(projectId?: string) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadConversations = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetchClient.GET('/api/conversations', {
        params: {
          query: projectId ? { projectId } : {}
        } as any
      });
      
      if (response.data) {
        setConversations(response.data);
      } else {
        throw new Error('Failed to load conversations');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load conversations');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  return {
    conversations,
    loading,
    error,
    refresh: loadConversations
  };
}