/**
 * Camera Capture Component
 * Direct camera access for instant photo capture and sharing
 */

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Camera, X, RotateCw, ImagePlus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface CameraCaptureProps {
  onCapture: (file: File) => void;
  onCancel?: () => void;
}

export function CameraCapture({ onCapture, onCancel }: CameraCaptureProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
  const [error, setError] = useState<string>("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const startCamera = async () => {
    try {
      setError("");
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode },
        audio: false,
      });
      
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      setError("Camera access denied. Please enable camera permissions.");
      console.error("Camera error:", err);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const switchCamera = () => {
    stopCamera();
    setFacingMode(prev => prev === "user" ? "environment" : "user");
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        const imageData = canvas.toDataURL("image/jpeg", 0.9);
        setCapturedImage(imageData);
        stopCamera();
      }
    }
  };

  const retake = () => {
    setCapturedImage(null);
    startCamera();
  };

  const confirmPhoto = () => {
    if (capturedImage) {
      // Convert data URL to File
      fetch(capturedImage)
        .then(res => res.blob())
        .then(blob => {
          const file = new File(
            [blob],
            `photo-${Date.now()}.jpg`,
            { type: "image/jpeg" }
          );
          onCapture(file);
          handleClose();
        });
    }
  };

  const handleClose = () => {
    setCapturedImage(null);
    stopCamera();
    setIsOpen(false);
    onCancel?.();
  };

  useEffect(() => {
    if (isOpen && !capturedImage) {
      startCamera();
    }
    return () => stopCamera();
  }, [isOpen, facingMode]);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setIsOpen(true)}
        data-testid="button-camera-capture"
        title="Take photo"
      >
        <Camera className="h-4 w-4" />
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl p-0">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle>Take Photo</DialogTitle>
          </DialogHeader>
          
          <div className="p-4 space-y-4">
            {error && (
              <Card className="bg-destructive/10 border-destructive/50 p-3">
                <p className="text-sm text-destructive">{error}</p>
              </Card>
            )}

            <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
              {!capturedImage ? (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
                    data-testid="video-camera-preview"
                  />
                  <canvas ref={canvasRef} className="hidden" />
                </>
              ) : (
                <img
                  src={capturedImage}
                  alt="Captured"
                  className="w-full h-full object-contain"
                  data-testid="img-captured-preview"
                />
              )}
            </div>

            <div className="flex items-center justify-center gap-2">
              {!capturedImage ? (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={switchCamera}
                    data-testid="button-switch-camera"
                    title="Switch camera"
                  >
                    <RotateCw className="h-5 w-5" />
                  </Button>
                  
                  <Button
                    size="lg"
                    onClick={capturePhoto}
                    className="bg-primary hover:bg-primary"
                    data-testid="button-capture-photo"
                  >
                    <Camera className="h-5 w-5 mr-2" />
                    Capture
                  </Button>
                  
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleClose}
                    data-testid="button-cancel-camera"
                  >
                    <X className="h-5 w-5" />
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    onClick={retake}
                    data-testid="button-retake-photo"
                  >
                    <RotateCw className="h-4 w-4 mr-2" />
                    Retake
                  </Button>
                  
                  <Button
                    onClick={confirmPhoto}
                    className="bg-primary hover:bg-primary"
                    data-testid="button-use-photo"
                  >
                    <ImagePlus className="h-4 w-4 mr-2" />
                    Use Photo
                  </Button>
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
