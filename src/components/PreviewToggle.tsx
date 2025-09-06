import { Button } from '@/components/ui/button';
import { Eye, Code2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PreviewToggleProps {
  mode: 'preview' | 'code';
  onModeChange: (mode: 'preview' | 'code') => void;
  className?: string;
}

export function PreviewToggle({ mode, onModeChange, className }: PreviewToggleProps) {
  return (
    <div className={cn('inline-flex rounded-md shadow-sm', className)}>
      <Button
        variant={mode === 'preview' ? 'default' : 'outline'}
        size="sm"
        onClick={() => onModeChange('preview')}
        className="rounded-r-none"
      >
        <Eye className="h-4 w-4 mr-2" />
        Preview
      </Button>
      <Button
        variant={mode === 'code' ? 'default' : 'outline'}
        size="sm"
        onClick={() => onModeChange('code')}
        className="rounded-l-none border-l-0"
      >
        <Code2 className="h-4 w-4 mr-2" />
        Code
      </Button>
    </div>
  );
}