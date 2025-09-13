import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { fetchClient } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Sparkles } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export const Route = createFileRoute('/create')({
  component: CreatePage,
});

function CreatePage() {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState('');
  const { toast } = useToast();

  const generateMutation = useMutation({
    mutationFn: async (prompt: string) => {
      const response = await fetchClient.POST('/api/ai/generate-claude' as any, {
        body: { prompt },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to generate project');
      }

      return response.data;
    },
    onSuccess: (data) => {
      if (data?.id) {
        toast({
          title: 'Project generated!',
          description: 'Redirecting to editor...',
        });
        
        // Navigate to the edit page for this project
        navigate({ to: '/create/$id', params: { id: data.id } });
      }
    },
    onError: (error) => {
      toast({
        title: 'Generation failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim() && !generateMutation.isPending) {
      generateMutation.mutate(prompt.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-8">
      <div className="max-w-2xl w-full space-y-8">
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="p-4 rounded-full bg-primary/10">
              <Sparkles className="h-12 w-12 text-primary" />
            </div>
          </div>
          <h1 className="text-4xl font-bold">Create a Web Experience</h1>
          <p className="text-lg text-muted-foreground">
            Describe what you want to build and AI will generate it instantly
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Create a retro arcade game with neon colors and synthwave aesthetics..."
            className="min-h-[120px] text-lg resize-none"
            disabled={generateMutation.isPending}
            autoFocus
          />
          
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={!prompt.trim() || generateMutation.isPending}
          >
            {generateMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Generating your experience...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-5 w-5" />
                Generate Experience
              </>
            )}
          </Button>

          <p className="text-sm text-muted-foreground text-center">
            Press Enter to generate • Shift+Enter for new line
          </p>
        </form>

        {generateMutation.isPending && (
          <div className="text-center text-sm text-muted-foreground animate-pulse">
            This may take a few moments while AI crafts your experience...
          </div>
        )}
      </div>
    </div>
  );
}