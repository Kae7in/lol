import { createFileRoute } from '@tanstack/react-router';
import { useState, useMemo, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { fetchClient, $api } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { AIChat } from '@/components/AIChat';
import { CodeEditor, type ProjectFiles } from '@/components/CodeEditor';
import { PreviewToggle } from '@/components/PreviewToggle';
import { useNavigate } from '@tanstack/react-router';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

export const Route = createFileRoute('/create_/$id')({
  component: EditProjectPage,
});

function compileProject(files: ProjectFiles): string {
  const entryHTML = files['index.html']?.content || '';
  
  const allCSS = Object.entries(files)
    .filter(([name]) => name.endsWith('.css'))
    .map(([_, file]) => file.content)
    .join('\n');
  
  const allJS = Object.entries(files)
    .filter(([name]) => name.endsWith('.js'))
    .map(([_, file]) => file.content)
    .join(';\n');
  
  let compiledHTML = entryHTML;
  
  if (allCSS) {
    compiledHTML = compiledHTML.replace('</head>', `<style>${allCSS}</style></head>`);
  }
  
  if (allJS) {
    compiledHTML = compiledHTML.replace('</body>', `<script>${allJS}</script></body>`);
  }
  
  return compiledHTML;
}

function EditProjectPage() {
  const { id: projectId } = Route.useParams();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<'preview' | 'code'>('preview');
  const [files, setFiles] = useState<ProjectFiles>({});
  const [projectTitle, setProjectTitle] = useState<string>('Untitled Project');
  const [useClaudeCode, setUseClaudeCode] = useState(true);
  
  const { toast } = useToast();

  // Fetch the existing project
  const { data: project, isLoading: isLoadingProject, error: projectError, refetch: refetchProject } = $api.useQuery(
    'get',
    '/api/projects/{id}',
    {
      params: {
        path: { id: projectId },
      },
    },
    {
      refetchOnWindowFocus: false,
      enabled: !!projectId,
    }
  );

  // Helper function to infer file type from filename
  const inferFileType = (filename: string): 'html' | 'css' | 'javascript' => {
    if (filename.endsWith('.html')) return 'html';
    if (filename.endsWith('.css')) return 'css';
    if (filename.endsWith('.js') || filename.endsWith('.javascript')) return 'javascript';
    // Default based on common patterns
    if (filename.includes('index')) return 'html';
    if (filename.includes('style')) return 'css';
    return 'javascript';
  };

  // Helper function to ensure files have the correct structure
  const normalizeFiles = (rawFiles: any): ProjectFiles => {
    const normalized: ProjectFiles = {};
    for (const [filename, fileData] of Object.entries(rawFiles)) {
      if (typeof fileData === 'object' && fileData !== null) {
        normalized[filename] = {
          content: (fileData as any).content || '',
          type: (fileData as any).type || inferFileType(filename)
        };
      }
    }
    return normalized;
  };

  // Set files when project loads
  useEffect(() => {
    if (project) {
      setFiles(normalizeFiles(project.files));
      setProjectTitle(project.title || 'Untitled Project');
    }
  }, [project]);

  const iterateMutation = useMutation({
    mutationFn: async (prompt: string) => {
      const endpoint = useClaudeCode ? '/api/iterate/claude' : '/api/iterate/ast';
      const response = await fetchClient.POST(endpoint as any, {
        body: {
          prompt,
          projectId,
        },
      });
      
      if (!response.data) {
        throw new Error('Failed to iterate on project');
      }
      
      return response.data;
    },
    onSuccess: (data) => {
      if (data?.files) {
        setFiles(normalizeFiles(data.files));
        toast({
          title: 'Project updated!',
          description: 'Your changes have been applied.',
        });
        // Refetch the project to get the latest data
        refetchProject();
      }
    },
    onError: (error) => {
      toast({
        title: 'Iteration failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const response = await fetchClient.PUT('/api/projects/{id}', {
        params: { path: { id: projectId } },
        body: {
          title: projectTitle,
          files,
        },
      });
      
      if (response.error) {
        throw new Error(response.error.message || 'Failed to update project');
      }
      
      return response.data;
    },
    onSuccess: () => {
      toast({
        title: 'Project saved!',
        description: 'Your project has been saved successfully.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Save failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleGenerate = async (prompt: string, messages: any[]) => {
    await iterateMutation.mutateAsync(prompt);
  };

  const isGenerating = iterateMutation.isPending;

  // Simply derive the compiled HTML - pure computation, no side effects
  const compiledHtml = useMemo(() => {
    // If we have files, compile them; otherwise use the pre-compiled HTML from the project
    if (files && Object.keys(files).length > 0) {
      return compileProject(files);
    } else if (project?.compiled) {
      return project.compiled;
    }
    return '';
  }, [files, project]);

  if (isLoadingProject) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex items-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading project...</span>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Project not found</h2>
          <button
            onClick={() => navigate({ to: '/create' })}
            className="text-primary hover:underline"
          >
            Create a new project
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Left Panel - AI Chat */}
      <div className="w-1/3 border-r border-border flex flex-col">
        <AIChat 
          onGenerate={handleGenerate}
          isGenerating={isGenerating}
        />
      </div>

      {/* Right Panel - Preview/Code */}
      <div className="w-2/3 flex flex-col">
        <div className="p-4 border-b border-border flex justify-between items-center bg-background">
          <h2 className="text-xl font-semibold">{projectTitle}</h2>
          <div className="flex items-center gap-4">
            <div className="flex items-center space-x-2">
              <Switch
                id="claude-code-toggle-edit"
                checked={useClaudeCode}
                onCheckedChange={setUseClaudeCode}
                disabled={isGenerating}
              />
              <Label htmlFor="claude-code-toggle-edit" className="text-sm">
                Claude Code
              </Label>
            </div>
            <PreviewToggle 
              mode={viewMode}
              onModeChange={setViewMode}
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-hidden">
          {viewMode === 'preview' ? (
            compiledHtml ? (
              <iframe
                srcDoc={compiledHtml}
                sandbox="allow-scripts"
                className="w-full h-full border-0 bg-white"
                title="Preview"
              />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <span>No preview available</span>
              </div>
            )
          ) : (
            <CodeEditor
              files={files}
              onFilesChange={setFiles}
              onSave={() => saveMutation.mutate()}
              isSaving={saveMutation.isPending}
            />
          )}
        </div>
      </div>
    </div>
  );
}