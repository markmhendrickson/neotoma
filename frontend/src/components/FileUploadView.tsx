/**
 * File Upload View Component (FU-304)
 * 
 * Production file upload interface with bulk upload and progress tracking
 */

import { useState, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Loader2, Upload, CheckCircle, XCircle, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useSettings } from "@/hooks/useSettings";
import { useKeys } from "@/hooks/useKeys";
import { useAuth } from "@/contexts/AuthContext";
import { getApiClient } from "@/lib/api_client";

interface UploadProgress {
  file: File;
  status: "pending" | "uploading" | "success" | "error";
  progress: number;
  sourceId?: string;
  error?: string;
}

interface FileUploadViewProps {
  onUploadComplete?: (sourceIds: string[]) => void;
  hideTitle?: boolean;
}

export function FileUploadView({ onUploadComplete, hideTitle = false }: FileUploadViewProps) {
  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { settings } = useSettings();
  const { bearerToken: keysBearerToken } = useKeys();
  const { sessionToken, user } = useAuth();
  
  // Prefer bearer token from keys, fallback to session token, then settings
  const bearerToken = sessionToken || keysBearerToken || settings.bearerToken;

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    
    // Initialize upload progress for each file
    const initialUploads: UploadProgress[] = fileArray.map(file => ({
      file,
      status: "pending",
      progress: 0,
    }));
    
    setUploads(initialUploads);

    // Upload files one by one
    const completedSourceIds: string[] = [];
    
    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      
      // Update status to uploading
      setUploads(prev => prev.map((upload, idx) =>
        idx === i ? { ...upload, status: "uploading", progress: 0 } : upload
      ));

      try {
        // Create form data
        const formData = new FormData();
        formData.append("file", file);
        formData.append("user_id", user?.id || "00000000-0000-0000-0000-000000000000");

        const api = getApiClient(bearerToken);
        const { data, error } = await api.POST("/upload_file", {
          body: formData,
        });

        if (error || !data) {
          throw new Error("Upload failed");
        }
        const sourceId = data.source_id || data.id;
        
        completedSourceIds.push(sourceId);

        // Update status to success
        setUploads(prev => prev.map((upload, idx) =>
          idx === i ? { ...upload, status: "success", progress: 100, sourceId } : upload
        ));
      } catch (error) {
        // Update status to error
        setUploads(prev => prev.map((upload, idx) =>
          idx === i ? { 
            ...upload, 
            status: "error", 
            progress: 0, 
            error: error instanceof Error ? error.message : "Upload failed"
          } : upload
        ));
      }
    }

    // Notify parent of completed uploads
    if (onUploadComplete && completedSourceIds.length > 0) {
      onUploadComplete(completedSourceIds);
    }
  }, [onUploadComplete]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
  }, [handleFiles]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }, [handleFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const totalFiles = uploads.length;
  const successCount = uploads.filter(u => u.status === "success").length;
  const errorCount = uploads.filter(u => u.status === "error").length;
  const isUploading = uploads.some(u => u.status === "uploading");

  return (
    <div className={hideTitle ? "space-y-6" : "h-full overflow-auto p-6"}>
      <div className={hideTitle ? "space-y-6" : "max-w-4xl mx-auto space-y-6"}>
        {!hideTitle && (
          <div>
            <h1 className="text-3xl font-bold">Upload Files</h1>
            <p className="text-muted-foreground mt-1">
              Upload documents, images, or CSV files to add to your knowledge graph
            </p>
          </div>
        )}

        {/* Upload Area */}
        <Card
          className={`border-2 border-dashed cursor-pointer transition-colors ${
            isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={!isUploading ? triggerFileInput : undefined}
        >
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Upload className={`h-12 w-12 mb-4 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
            <h3 className="text-lg font-medium mb-1">
              {isDragging ? "Drop files here" : "Upload files"}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Click to browse or drag and drop files here
            </p>
            <Badge variant="secondary">
              Supported: PDF, PNG, JPG, CSV (max 50MB)
            </Badge>
          </CardContent>
        </Card>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileSelect}
          accept=".pdf,.png,.jpg,.jpeg,.csv"
        />

        {/* Upload Progress */}
        {uploads.length > 0 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold">Upload Progress</h2>
              <p className="text-sm text-muted-foreground">
                {successCount}/{totalFiles} completed
                {errorCount > 0 && `, ${errorCount} failed`}
              </p>
            </div>
            <div className="space-y-4">
              {uploads.map((upload, index) => (
                <div key={index} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium truncate max-w-md">
                        {upload.file.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        ({(upload.file.size / 1024).toFixed(1)} KB)
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {upload.status === "uploading" && (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      )}
                      {upload.status === "success" && (
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      )}
                      {upload.status === "error" && (
                        <XCircle className="h-4 w-4 text-destructive" />
                      )}
                      <Badge variant={
                        upload.status === "success" ? "default" :
                        upload.status === "error" ? "destructive" :
                        "secondary"
                      }>
                        {upload.status}
                      </Badge>
                    </div>
                  </div>
                  {upload.status === "uploading" && (
                    <Progress value={upload.progress} className="h-2" />
                  )}
                  {upload.status === "error" && upload.error && (
                    <p className="text-xs text-destructive">{upload.error}</p>
                  )}
                  {upload.status === "success" && upload.sourceId && (
                    <p className="text-xs text-muted-foreground">
                      Source ID: <code>{upload.sourceId.substring(0, 16)}...</code>
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
