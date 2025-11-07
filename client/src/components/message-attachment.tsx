/**
 * Message Attachment Component
 * Displays file attachments with inline previews, lightbox, and download
 */

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, File, FileText, FileVideo, Music } from "lucide-react";
import { ImageLightbox } from "./image-lightbox";

interface MessageAttachmentProps {
  url: string;
  name?: string;
  type?: "image" | "video" | "audio" | "document" | "unknown";
  className?: string;
}

export function MessageAttachment({ url, name, type, className = "" }: MessageAttachmentProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // Auto-detect type from URL if not provided
  const detectedType = type || detectFileType(url, name);

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = url;
    link.download = name || 'download';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Image attachments
  if (detectedType === "image") {
    return (
      <>
        <div className={`relative group ${className}`}>
          <img
            src={url}
            alt={name || "Image attachment"}
            className="max-w-xs rounded-lg cursor-pointer hover-elevate transition-all"
            onClick={() => setLightboxOpen(true)}
            loading="lazy"
            data-testid="img-message-attachment"
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors rounded-lg pointer-events-none" />
        </div>
        <ImageLightbox
          src={url}
          alt={name}
          isOpen={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
        />
      </>
    );
  }

  // Video attachments
  if (detectedType === "video") {
    return (
      <video
        controls
        preload="metadata"
        className={`max-w-md rounded-lg ${className}`}
        data-testid="video-message-attachment"
      >
        <source src={url} />
        Your browser doesn't support video playback.
      </video>
    );
  }

  // Audio attachments
  if (detectedType === "audio") {
    return (
      <Card className={`p-3 max-w-xs ${className}`}>
        <div className="flex items-center gap-3">
          <Music className="h-8 w-8 text-emerald-500" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{name || "Audio file"}</p>
            <audio controls className="w-full mt-2" data-testid="audio-message-attachment">
              <source src={url} />
            </audio>
          </div>
        </div>
      </Card>
    );
  }

  // Document/file attachments
  const fileIcon = getFileIcon(name);
  
  return (
    <Card className={`p-3 max-w-xs hover-elevate ${className}`}>
      <div className="flex items-center gap-3">
        {fileIcon}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" data-testid="text-attachment-name">
            {name || "File attachment"}
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDownload}
            className="h-auto p-0 text-emerald-500 hover:text-emerald-400"
            data-testid="button-download-attachment"
          >
            <Download className="h-3 w-3 mr-1" />
            Download
          </Button>
        </div>
      </div>
    </Card>
  );
}

function detectFileType(url: string, name?: string): MessageAttachmentProps["type"] {
  const fileName = name || url;
  const lowerName = fileName.toLowerCase();

  if (lowerName.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/)) {
    return "image";
  }
  if (lowerName.match(/\.(mp4|webm|ogg|mov|avi)$/)) {
    return "video";
  }
  if (lowerName.match(/\.(mp3|wav|ogg|m4a|flac)$/)) {
    return "audio";
  }
  if (lowerName.match(/\.(pdf|doc|docx|txt|csv|xls|xlsx)$/)) {
    return "document";
  }
  return "unknown";
}

function getFileIcon(name?: string) {
  const fileName = name?.toLowerCase() || "";
  
  if (fileName.match(/\.(pdf)$/)) {
    return <FileText className="h-8 w-8 text-red-500" />;
  }
  if (fileName.match(/\.(mp4|webm|mov)$/)) {
    return <FileVideo className="h-8 w-8 text-purple-500" />;
  }
  if (fileName.match(/\.(doc|docx|txt)$/)) {
    return <FileText className="h-8 w-8 text-blue-500" />;
  }
  return <File className="h-8 w-8 text-muted-foreground" />;
}
