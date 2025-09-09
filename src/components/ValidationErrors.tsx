import { AlertCircle, XCircle } from 'lucide-react';

interface ValidationError {
  file: string;
  line: number;
  column: number;
  message: string;
  type: 'syntax' | 'type' | 'runtime';
}

interface ValidationErrorsProps {
  errors: ValidationError[];
  onClose?: () => void;
}

export function ValidationErrors({ errors, onClose }: ValidationErrorsProps) {
  if (!errors || errors.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 max-w-md bg-red-50 border border-red-200 rounded-lg shadow-lg p-4 z-50">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <h3 className="font-semibold text-red-900">
            {errors.length} {errors.length === 1 ? 'Error' : 'Errors'} Found
          </h3>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-red-600 hover:text-red-800"
          >
            <XCircle className="w-5 h-5" />
          </button>
        )}
      </div>
      
      <div className="space-y-2 max-h-60 overflow-y-auto">
        {errors.map((error, index) => (
          <div
            key={index}
            className="text-sm bg-white rounded p-2 border border-red-100"
          >
            <div className="font-mono text-xs text-red-700 mb-1">
              {error.file}:{error.line}:{error.column}
            </div>
            <div className="text-red-800">
              <span className="inline-block px-1 py-0.5 bg-red-100 rounded text-xs mr-2">
                {error.type}
              </span>
              {error.message}
            </div>
          </div>
        ))}
      </div>
      
      <div className="mt-3 text-xs text-red-700">
        These errors will be included as context in your next prompt
      </div>
    </div>
  );
}