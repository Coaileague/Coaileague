/**
 * Image Lightbox Component
 * Full-screen image viewer with zoom and download
 */

import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X, Download, ZoomIn, ZoomOut } from "lucide-react";

interface ImageLightboxProps {
  src: string;
  alt?: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ImageLightbox({ src, alt = "Image", isOpen, onClose }: ImageLightboxProps) {
  const [zoom, setZoom] = useState(1);

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = src;
    link.download = alt || 'image';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.25, 0.5));

  const resetAndClose = () => {
    setZoom(1);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={resetAndClose}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 border-0">
        <div className="relative w-full h-full bg-black/95 rounded-lg overflow-hidden">
          {/* Controls */}
          <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleZoomOut}
              className="bg-black/50 hover:bg-black/70 text-white"
              data-testid="button-zoom-out"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleZoomIn}
              className="bg-black/50 hover:bg-black/70 text-white"
              data-testid="button-zoom-in"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDownload}
              className="bg-black/50 hover:bg-black/70 text-white"
              data-testid="button-download-image"
            >
              <Download className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={resetAndClose}
              className="bg-black/50 hover:bg-black/70 text-white"
              data-testid="button-close-lightbox"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Image */}
          <div className="w-full h-full flex items-center justify-center p-8 overflow-auto">
            <img
              src={src}
              alt={alt}
              className="max-w-full max-h-full object-contain transition-transform duration-200"
              style={{ transform: `scale(${zoom})` }}
              data-testid="img-lightbox-view"
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
