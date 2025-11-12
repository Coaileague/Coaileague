import { useState, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Upload, FileText, X, CheckCircle, AlertCircle } from "lucide-react";

interface DocumentUploadProps {
  label: string;
  accept?: string;
  maxSizeMB?: number;
  required?: boolean;
  value?: File | string;
  onChange?: (file: File | null) => void;
  description?: string;
}

export function DocumentUpload({
  label,
  accept = ".pdf,.jpg,.jpeg,.png,.doc,.docx",
  maxSizeMB = 10,
  required = false,
  value,
  onChange,
  description = "Upload PDF, JPG, PNG, or DOC files",
}: DocumentUploadProps) {
  const [file, setFile] = useState<File | null>(
    value instanceof File ? value : null
  );
  const [error, setError] = useState<string>("");
  const [preview, setPreview] = useState<string>(
    typeof value === "string" ? value : ""
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (selectedFile: File) => {
    setError("");

    // Validate file size
    const maxBytes = maxSizeMB * 1024 * 1024;
    if (selectedFile.size > maxBytes) {
      setError(`File size must be less than ${maxSizeMB}MB`);
      return;
    }

    // Validate file type
    const fileExtension = "." + selectedFile.name.split(".").pop()?.toLowerCase();
    const acceptedTypes = accept.split(",").map((t) => t.trim());
    if (!acceptedTypes.includes(fileExtension)) {
      setError(`Invalid file type. Accepted: ${accept}`);
      return;
    }

    setFile(selectedFile);
    onChange?.(selectedFile);

    // Generate preview for images
    if (selectedFile.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(selectedFile);
    } else {
      setPreview("");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  };

  const handleRemove = () => {
    setFile(null);
    setPreview("");
    setError("");
    onChange?.(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>
      
      {!file && !preview && (
        <Card
          className="border-2 border-dashed p-6 hover-elevate cursor-pointer"
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
          data-testid={`card-upload-${label.toLowerCase().replace(/\s+/g, '-')}`}
        >
          <div className="flex flex-col items-center justify-center gap-3 text-center">
            <Upload className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-foreground">
                Click to upload or drag and drop
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {description} (max {maxSizeMB}MB)
              </p>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={accept}
            onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
            className="hidden"
            data-testid={`input-file-${label.toLowerCase().replace(/\s+/g, '-')}`}
          />
        </Card>
      )}

      {(file || preview) && (
        <Card className="p-4">
          <div className="flex items-start gap-3">
            {preview ? (
              <img
                src={preview}
                alt="Preview"
                className="w-16 h-16 object-cover rounded"
                data-testid="img-document-preview"
              />
            ) : (
              <div className="w-16 h-16 bg-muted rounded flex items-center justify-center">
                <FileText className="h-8 w-8 text-muted-foreground" />
              </div>
            )}
            
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate" data-testid="text-filename">
                {file?.name || "Uploaded file"}
              </p>
              <p className="text-xs text-muted-foreground">
                {file?.size ? `${(file.size / 1024).toFixed(1)} KB` : ""}
              </p>
              <div className="flex items-center gap-1 mt-1">
                <CheckCircle className="h-3 w-3 text-blue-600" />
                <span className="text-xs text-blue-600">Uploaded successfully</span>
              </div>
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={handleRemove}
              data-testid="button-remove-document"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      )}

      {error && (
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="h-4 w-4" />
          <p className="text-sm" data-testid="text-upload-error">{error}</p>
        </div>
      )}
    </div>
  );
}
