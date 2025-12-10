import { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, File, X, CheckCircle2, AlertCircle, Loader2, FolderUp } from 'lucide-react';

interface UploadFile {
  id: string;
  name: string;
  size: number;
  status: 'pending' | 'uploading' | 'processing' | 'complete' | 'error';
  progress: number;
  error?: string;
}

interface MockUploadUIProps {
  onComplete?: (fileCount: number) => void;
}

export function MockUploadUI({ onComplete }: MockUploadUIProps) {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const mockFileUpload = useCallback((file: UploadFile) => {
    // Simulate upload progress
    const interval = setInterval(() => {
      setFiles(prev => {
        const updated = prev.map(f => {
          if (f.id === file.id) {
            if (f.status === 'pending') {
              return { ...f, status: 'uploading', progress: 10 };
            } else if (f.status === 'uploading') {
              if (f.progress < 60) {
                return { ...f, progress: f.progress + 10 };
              } else {
                return { ...f, status: 'processing', progress: 70 };
              }
            } else if (f.status === 'processing') {
              if (f.progress < 100) {
                return { ...f, progress: f.progress + 10 };
              } else {
                clearInterval(interval);
                return { ...f, status: 'complete', progress: 100 };
              }
            }
          }
          return f;
        });
        return updated;
      });
    }, 300);
  }, []);

  const handleFileSelect = useCallback((fileList: FileList | null) => {
    if (!fileList) return;

    const newFiles: UploadFile[] = Array.from(fileList).map((file, index) => ({
      id: `file-${Date.now()}-${index}`,
      name: file.name,
      size: file.size,
      status: 'pending',
      progress: 0,
    }));

    setFiles(prev => [...prev, ...newFiles]);

    // Start mock uploads
    newFiles.forEach(file => {
      setTimeout(() => mockFileUpload(file), Math.random() * 1000);
    });
  }, [mockFileUpload]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const removeFile = useCallback((fileId: string) => {
    setFiles(prev => prev.filter(f => f.id !== fileId));
  }, []);

  const completedCount = files.filter(f => f.status === 'complete').length;
  const uploadingCount = files.filter(f => f.status === 'uploading' || f.status === 'processing').length;
  const errorCount = files.filter(f => f.status === 'error').length;

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="h-full overflow-y-auto bg-background p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Upload Documents</h1>
        <p className="text-muted-foreground mt-1">
          Bulk upload PDFs, images, and documents for extraction
        </p>
      </div>

      {/* Upload Zone */}
      <Card
        className={`border-2 border-dashed transition-colors ${
          isDragging ? 'border-primary bg-primary/5' : 'border-border'
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <CardContent className="p-12">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
              <Upload className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">
              {isDragging ? 'Drop files here' : 'Upload your documents'}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Drag and drop files or click to browse
            </p>
            <div className="flex justify-center gap-3">
              <Button
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.multiple = true;
                  input.accept = '.pdf,.jpg,.jpeg,.png';
                  input.onchange = (e) => handleFileSelect((e.target as HTMLInputElement).files);
                  input.click();
                }}
              >
                <File className="h-4 w-4 mr-2" />
                Select Files
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.multiple = true;
                  // @ts-expect-error - webkitdirectory is non-standard but supported in browsers
                  input.webkitdirectory = true;
                  input.onchange = (e) => handleFileSelect((e.target as HTMLInputElement).files);
                  input.click();
                }}
              >
                <FolderUp className="h-4 w-4 mr-2" />
                Select Folder
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              Supports: PDF, JPG, PNG (max 50MB per file)
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Upload Queue */}
      {files.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Upload Queue</span>
              <div className="flex gap-2">
                {completedCount > 0 && (
                  <Badge variant="default" className="bg-green-600">
                    {completedCount} Complete
                  </Badge>
                )}
                {uploadingCount > 0 && (
                  <Badge variant="default">
                    {uploadingCount} In Progress
                  </Badge>
                )}
                {errorCount > 0 && (
                  <Badge variant="destructive">
                    {errorCount} Failed
                  </Badge>
                )}
              </div>
            </CardTitle>
            <CardDescription>
              {files.length} file{files.length !== 1 ? 's' : ''} • Processing with deterministic extraction
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border"
                >
                  <div className="flex-shrink-0">
                    {file.status === 'pending' && <File className="h-5 w-5 text-muted-foreground" />}
                    {(file.status === 'uploading' || file.status === 'processing') && (
                      <Loader2 className="h-5 w-5 text-primary animate-spin" />
                    )}
                    {file.status === 'complete' && <CheckCircle2 className="h-5 w-5 text-green-600" />}
                    {file.status === 'error' && <AlertCircle className="h-5 w-5 text-destructive" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium truncate">{file.name}</p>
                      <span className="text-xs text-muted-foreground ml-2">
                        {formatFileSize(file.size)}
                      </span>
                    </div>

                    {file.status === 'pending' && (
                      <p className="text-xs text-muted-foreground">Waiting...</p>
                    )}

                    {file.status === 'uploading' && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Uploading...</span>
                          <span className="text-foreground">{file.progress}%</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-1.5">
                          <div
                            className="bg-primary h-1.5 rounded-full transition-all"
                            style={{ width: `${file.progress}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {file.status === 'processing' && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Extracting fields...</span>
                          <span className="text-foreground">{file.progress}%</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-1.5">
                          <div
                            className="bg-primary h-1.5 rounded-full transition-all"
                            style={{ width: `${file.progress}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {file.status === 'complete' && (
                      <p className="text-xs text-green-600">Extraction complete</p>
                    )}

                    {file.status === 'error' && (
                      <p className="text-xs text-destructive">{file.error || 'Upload failed'}</p>
                    )}
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFile(file.id)}
                    className="flex-shrink-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            {completedCount === files.length && files.length > 0 && (
              <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="text-sm font-medium text-green-900 dark:text-green-100">
                      All files processed successfully
                    </p>
                    <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                      {completedCount} records created with deterministic field extraction
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => onComplete?.(completedCount)}
                >
                  View Records
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Features */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Bulk Upload</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Upload multiple files or entire folders at once with parallel processing
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Progress Tracking</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Real-time progress for each file with upload and extraction stages
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Resume on Failure</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Automatic retry for failed uploads without losing progress
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}








