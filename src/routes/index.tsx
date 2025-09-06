import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useCallback, useState } from 'react';
import { ProjectViewer } from '../components/ProjectViewer';
import { $api } from '../lib/api-client';
import { ArrowRight, Loader2 } from 'lucide-react';

export const Route = createFileRoute('/')({
  component: BrowsePage,
});

function BrowsePage() {
  const [isTransitioning, setIsTransitioning] = useState(false);
  
  const { data: currentProject, error, isLoading, refetch } = $api.useQuery(
    'get',
    '/api/projects/random',
    {},
    {
      refetchOnWindowFocus: false,
      refetchOnMount: true,
    }
  );

  const fetchRandomProject = useCallback(async () => {
    setIsTransitioning(true);
    
    // Start fetching immediately, with minimal fade out
    setTimeout(async () => {
      await refetch();
      // Fade in immediately when data loads
      setIsTransitioning(false);
    }, 150);
  }, [refetch]);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isLoading && !isTransitioning) {
        e.preventDefault();
        fetchRandomProject();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [fetchRandomProject, isLoading, isTransitioning]);

  if (error) {
    const errorHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body {
              margin: 0;
              height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              background: linear-gradient(135deg, #ee5a6f 0%, #f29263 100%);
              color: white;
              font-family: -apple-system, system-ui, sans-serif;
            }
            .error {
              text-align: center;
            }
            h1 { font-size: 3rem; margin-bottom: 1rem; }
            p { font-size: 1.2rem; opacity: 0.9; }
          </style>
        </head>
        <body>
          <div class="error">
            <h1>Oops!</h1>
            <p>Failed to load project. Press spacebar to try again.</p>
          </div>
        </body>
      </html>
    `;
    
    return (
      <div className="fixed inset-0 bg-black">
        <div className="w-full h-full">
          <ProjectViewer compiledHtml={errorHtml} />
        </div>
        
        <button
          onClick={fetchRandomProject}
          disabled={isLoading}
          className="absolute bottom-8 right-8 
                     bg-white/10 backdrop-blur-md hover:bg-white/20 
                     text-white w-16 h-16 rounded-full
                     flex items-center justify-center transition-all duration-300
                     border border-white/20 shadow-lg
                     disabled:opacity-50 disabled:cursor-not-allowed
                     hover:scale-110 active:scale-95"
        >
          <ArrowRight className="h-6 w-6" />
        </button>
      </div>
    );
  }

  if (!currentProject) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-white text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-lg">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black">
      {/* Project container with blur/fade transition - fullscreen */}
      <div 
        className={`w-full h-full transition-all duration-150 ${
          isTransitioning 
            ? 'blur-lg opacity-30 scale-98' 
            : 'blur-0 opacity-100 scale-100'
        }`}
        style={{
          transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)'
        }}
      >
        <ProjectViewer 
          compiledHtml={currentProject.compiled}
          onLoad={() => console.log(`Loaded project: ${currentProject.title}`)}
        />
      </div>
      
      {/* Project title and next button in bottom right */}
      <div className="absolute bottom-8 right-8 flex items-center gap-4">
        {/* Project title */}
        {currentProject.title && (
          <div 
            className={`bg-white/10 backdrop-blur-md rounded-full px-6 py-3 transition-all duration-150 ${
              isTransitioning 
                ? 'opacity-0 translate-x-2' 
                : 'opacity-100 translate-x-0'
            }`}
          >
            <p className="text-white/90 font-medium">{currentProject.title}</p>
          </div>
        )}
        
        {/* Circular next button */}
        <button
          onClick={fetchRandomProject}
          disabled={isLoading || isTransitioning}
          className="bg-white/10 backdrop-blur-md hover:bg-white/20 
                     text-white w-16 h-16 rounded-full
                     flex items-center justify-center transition-all duration-300
                     border border-white/20 shadow-lg
                     disabled:opacity-50 disabled:cursor-not-allowed
                     hover:scale-110 active:scale-95"
        >
          {(isLoading || isTransitioning) ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <ArrowRight className="h-6 w-6" />
          )}
        </button>
      </div>
    </div>
  );
}