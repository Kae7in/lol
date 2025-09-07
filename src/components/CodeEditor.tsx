import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { 
  FileCode, 
  FileText, 
  FilePlus, 
  X, 
  Save,
  FileJson
} from 'lucide-react';
import { cn } from '@/lib/utils';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { oneDark } from '@codemirror/theme-one-dark';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface FileData {
  content: string;
  type: 'html' | 'css' | 'javascript';
}

export interface ProjectFiles {
  [filename: string]: FileData;
}

interface CodeEditorProps {
  files: ProjectFiles;
  onFilesChange: (files: ProjectFiles) => void;
  onSave?: () => void;
  isSaving?: boolean;
}

const FILE_ICONS = {
  html: FileText,
  css: FileCode,
  javascript: FileJson,
};

const FILE_EXTENSIONS = {
  html: '.html',
  css: '.css',
  javascript: '.js',
};

export function CodeEditor({ 
  files, 
  onFilesChange, 
  onSave,
  isSaving = false 
}: CodeEditorProps) {
  const [activeFile, setActiveFile] = useState<string>(
    Object.keys(files)[0] || 'index.html'
  );
  const [newFileName, setNewFileName] = useState('');
  const [newFileType, setNewFileType] = useState<'html' | 'css' | 'javascript'>('html');
  const [isNewFileDialogOpen, setIsNewFileDialogOpen] = useState(false);

  const handleFileContentChange = (filename: string, content: string) => {
    onFilesChange({
      ...files,
      [filename]: {
        ...files[filename],
        content,
      },
    });
  };

  const handleAddFile = () => {
    if (!newFileName.trim()) return;
    
    const extension = FILE_EXTENSIONS[newFileType];
    const filename = newFileName.includes('.') 
      ? newFileName 
      : `${newFileName}${extension}`;

    if (files[filename]) {
      alert('File already exists');
      return;
    }

    const defaultContent = {
      html: '<!DOCTYPE html>\n<html lang="en">\n<head>\n    <meta charset="UTF-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n    <title>Document</title>\n</head>\n<body>\n    \n</body>\n</html>',
      css: '/* Add your styles here */\n',
      javascript: '// Add your JavaScript here\n',
    };

    onFilesChange({
      ...files,
      [filename]: {
        content: defaultContent[newFileType],
        type: newFileType,
      },
    });

    setActiveFile(filename);
    setNewFileName('');
    setIsNewFileDialogOpen(false);
  };

  const handleDeleteFile = (filename: string) => {
    if (Object.keys(files).length === 1) {
      alert('Cannot delete the last file');
      return;
    }

    const newFiles = { ...files };
    delete newFiles[filename];
    onFilesChange(newFiles);

    if (activeFile === filename) {
      setActiveFile(Object.keys(newFiles)[0]);
    }
  };

  // Check if files is empty
  if (!files || Object.keys(files).length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <FileCode className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-lg font-medium mb-2">No source files available</p>
        <p className="text-sm text-center max-w-md mb-4">
          This project was generated as a single HTML file. Try asking the AI to "split this into separate HTML, CSS, and JavaScript files" to make it editable.
        </p>
        <div className="text-xs text-muted-foreground/70">
          Tip: Use the chat to iterate on the project
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Tabs value={activeFile} onValueChange={setActiveFile} className="flex flex-col h-full">
        <div className="border-b border-border bg-background">
          <div className="flex items-center justify-between p-2">
            <div className="flex items-center gap-2">
              <TabsList className="h-auto p-0 bg-transparent">
                {Object.keys(files).map((filename) => {
                  const fileType = files[filename]?.type || 'javascript';
                  const Icon = FILE_ICONS[fileType] || FileCode;
                  return (
                    <TabsTrigger
                      key={filename}
                      value={filename}
                      className="data-[state=active]:bg-muted px-3 py-1.5 rounded-md"
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="h-3 w-3" />
                        <span className="text-sm">{filename}</span>
                        {Object.keys(files).length > 1 && (
                          <span
                            className="inline-flex items-center justify-center h-4 w-4 rounded hover:bg-destructive/20 transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteFile(filename);
                            }}
                          >
                            <X className="h-3 w-3" />
                          </span>
                        )}
                      </div>
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              <Dialog open={isNewFileDialogOpen} onOpenChange={setIsNewFileDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7">
                    <FilePlus className="h-3 w-3 mr-1" />
                    New File
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create New File</DialogTitle>
                    <DialogDescription>
                      Add a new file to your project
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="filename">File Name</Label>
                      <Input
                        id="filename"
                        value={newFileName}
                        onChange={(e) => setNewFileName(e.target.value)}
                        placeholder="e.g., script or script.js"
                      />
                    </div>
                    <div>
                      <Label htmlFor="filetype">File Type</Label>
                      <Select
                        value={newFileType}
                        onValueChange={(value) => setNewFileType(value as typeof newFileType)}
                      >
                        <SelectTrigger id="filetype">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="html">HTML</SelectItem>
                          <SelectItem value="css">CSS</SelectItem>
                          <SelectItem value="javascript">JavaScript</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsNewFileDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleAddFile}>Create File</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {onSave && (
            <Button 
              size="sm" 
              onClick={onSave}
              disabled={isSaving}
              className="h-7"
            >
              <Save className="h-3 w-3 mr-1" />
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          )}
          </div>
        </div>

        <div className="flex-1 min-h-0">
          {Object.entries(files).map(([filename, file]) => {
          const getLanguageExtension = () => {
            const fileType = file?.type || 'javascript';
            switch (fileType) {
              case 'javascript':
                return javascript({ jsx: true, typescript: false });
              case 'html':
                return html();
              case 'css':
                return css();
              default:
                return javascript();
            }
          };

          return (
            <TabsContent
              key={filename}
              value={filename}
              className="h-full m-0 border-0 p-0 data-[state=inactive]:hidden"
            >
              <CodeMirror
                value={file.content}
                onChange={(value) => handleFileContentChange(filename, value)}
                extensions={[getLanguageExtension()]}
                theme={oneDark}
                height="100%"
                className="h-full"
                basicSetup={{
                  lineNumbers: true,
                  foldGutter: true,
                  dropCursor: true,
                  allowMultipleSelections: true,
                  indentOnInput: true,
                  syntaxHighlighting: true,
                  bracketMatching: true,
                  closeBrackets: true,
                  autocompletion: true,
                  rectangularSelection: true,
                  highlightSelectionMatches: true,
                  searchKeymap: true,
                }}
                placeholder={`Add your ${file.type ? file.type.toUpperCase() : 'CODE'} here...`}
              />
            </TabsContent>
          );
        })}
        </div>
      </Tabs>
    </div>
  );
}