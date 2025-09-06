import { useEffect, useRef } from 'react';

interface ProjectViewerProps {
  compiledHtml: string;
  onLoad?: () => void;
}

export function ProjectViewer({ compiledHtml, onLoad }: ProjectViewerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const blobUrlRef = useRef<string>('');

  useEffect(() => {
    // Clean up previous blob URL
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
    }

    // Create new blob URL for the compiled HTML
    const blob = new Blob([compiledHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    blobUrlRef.current = url;

    // Update iframe src
    if (iframeRef.current) {
      iframeRef.current.src = url;
    }

    // Cleanup on unmount
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = '';
      }
    };
  }, [compiledHtml]);

  return (
    <iframe
      ref={iframeRef}
      sandbox="allow-scripts"
      className="w-full h-full border-0"
      title="Project Viewer"
      onLoad={onLoad}
      style={{
        width: '100vw',
        height: '100vh',
        border: 'none',
        margin: 0,
        padding: 0,
      }}
    />
  );
}