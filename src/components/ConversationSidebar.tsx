import React from 'react';
import { useConversationList, type Conversation } from '@/hooks/useConversation';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageSquare, Plus, Trash2, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface ConversationSidebarProps {
  projectId?: string;
  currentConversationId?: string;
  onConversationSelect: (conversation: Conversation) => void;
  onNewConversation: () => void;
  onDeleteConversation?: (conversationId: string) => void;
}

export function ConversationSidebar({
  projectId,
  currentConversationId,
  onConversationSelect,
  onNewConversation,
  onDeleteConversation
}: ConversationSidebarProps) {
  const { conversations, loading, error, refresh } = useConversationList(projectId);

  return (
    <div className="flex flex-col h-full bg-background border-r">
      <div className="p-4 border-b">
        <Button
          onClick={onNewConversation}
          className="w-full"
          variant="outline"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Conversation
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {loading && (
            <div className="p-4 text-center text-muted-foreground">
              Loading conversations...
            </div>
          )}
          
          {error && (
            <div className="p-4 text-center text-destructive">
              {error}
            </div>
          )}
          
          {!loading && !error && conversations.length === 0 && (
            <div className="p-4 text-center text-muted-foreground">
              No conversations yet
            </div>
          )}
          
          {conversations.map((conversation) => (
            <div
              key={conversation.id}
              className={cn(
                "group flex items-center gap-2 p-3 rounded-lg cursor-pointer hover:bg-accent transition-colors",
                currentConversationId === conversation.id && "bg-accent"
              )}
              onClick={() => onConversationSelect(conversation)}
            >
              <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
              
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {conversation.title || 'Untitled Conversation'}
                </p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDistanceToNow(new Date(conversation.createdAt), { addSuffix: true })}
                </p>
              </div>
              
              {onDeleteConversation && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteConversation(conversation.id);
                  }}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>

      {conversations.length > 0 && (
        <div className="p-4 border-t">
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={refresh}
          >
            Refresh
          </Button>
        </div>
      )}
    </div>
  );
}