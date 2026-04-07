import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Camera, X, RotateCw, ImagePlus, Upload, Loader2, AlertCircle } from "lucide-react";
import { UniversalModal, UniversalModalHeader, UniversalModalTitle, UniversalModalContent } from '@/components/ui/universal-modal';

interface CameraCaptureProps {
  onCapture: (file: File) => void;
  onCancel?: () => void;
  preferredFacing?: "user" | "environment";
}

export function CameraCapture({ onCapture, onCancel, preferredFacing = "environment" }: CameraCaptureProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">(preferredFacing);
  const [error, setError] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [cameraSupported, setCameraSupported] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const checkCameraSupport = useCallback(() => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraSupported(false);
      return false;
    }
    return true;
  }, []);

  const startCamera = useCallback(async () => {
    if (!checkCameraSupport()) {
      setError("Camera not supported on this browser. Please use the upload option.");
      return;
    }

    try {
      setError("");
      setIsLoading(true);
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
        },
        audio: false,
      });
      
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.onloadedmetadata = () => {
          setIsLoading(false);
        };
      }
    } catch (err: any) {
      setIsLoading(false);
      let errorMessage = "Failed to access camera.";
      
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        errorMessage = "Camera permission denied. Please enable camera access in your browser settings, then try again.";
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        errorMessage = "No camera found on this device. Please use the upload option instead.";
      } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
        errorMessage = "Camera is in use by another application. Please close other apps using the camera.";
      } else if (err.name === "OverconstrainedError") {
        errorMessage = "Camera does not support the requested settings. Trying again...";
        try {
          const fallbackStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
          setStream(fallbackStream);
          if (videoRef.current) {
            videoRef.current.srcObject = fallbackStream;
            videoRef.current.onloadedmetadata = () => {
              setIsLoading(false);
            };
          }
          setError("");
          return;
        } catch {
          errorMessage = "Camera is not available. Please use the upload option.";
        }
      }
      
      setError(errorMessage);
    }
  }, [facingMode, checkCameraSupport]);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, [stream]);

  const switchCamera = useCallback(() => {
    stopCamera();
    setFacingMode(prev => prev === "user" ? "environment" : "user");
  }, [stopCamera]);

  const capturePhoto = useCallback(() => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        const imageData = canvas.toDataURL("image/jpeg", 0.85);
        setCapturedImage(imageData);
        stopCamera();
      }
    }
  }, [stopCamera]);

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        setError("Please select an image file.");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setError("Image is too large. Please select an image under 10MB.");
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        setCapturedImage(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const retake = useCallback(() => {
    setCapturedImage(null);
    setError("");
    if (cameraSupported) {
      startCamera();
    }
  }, [cameraSupported, startCamera]);

  const confirmPhoto = useCallback(() => {
    if (capturedImage) {
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
  }, [capturedImage, onCapture]);

  const handleClose = useCallback(() => {
    setCapturedImage(null);
    setError("");
    setIsLoading(false);
    stopCamera();
    setIsOpen(false);
    onCancel?.();
  }, [stopCamera, onCancel]);

  useEffect(() => {
    if (isOpen && !capturedImage) {
      startCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, facingMode]);

  useEffect(() => {
    checkCameraSupport();
  }, [checkCameraSupport]);

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

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileUpload}
        className="hidden"
        data-testid="input-file-upload"
      />

      <UniversalModal open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); else setIsOpen(true); }}>
        <UniversalModalContent size="xl" className="p-0 max-h-[95vh]">
          <UniversalModalHeader className="p-4 pb-0">
            <UniversalModalTitle>Take Photo</UniversalModalTitle>
          </UniversalModalHeader>
          
          <div className="p-4 space-y-4 overflow-y-auto">
            {error && (
              <Card className="bg-destructive/10 border-destructive/50 p-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                  <p className="text-sm text-destructive" data-testid="text-camera-error">{error}</p>
                </div>
              </Card>
            )}

            <div className="relative bg-black rounded-lg overflow-hidden" style={{ aspectRatio: "4/3" }}>
              {isLoading && !capturedImage && (
                <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/50">
                  <div className="text-center text-white">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                    <p className="text-sm">Starting camera...</p>
                  </div>
                </div>
              )}
              {!capturedImage ? (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
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

            <div className="flex items-center justify-center gap-2 flex-wrap">
              {!capturedImage ? (
                <>
                  {cameraSupported && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={switchCamera}
                      data-testid="button-switch-camera"
                      title="Switch camera"
                    >
                      <RotateCw className="h-5 w-5" />
                    </Button>
                  )}
                  
                  {cameraSupported && stream && (
                    <Button
                      size="lg"
                      onClick={capturePhoto}
                      data-testid="button-capture-photo"
                    >
                      <Camera className="h-5 w-5 mr-2" />
                      Capture
                    </Button>
                  )}

                  <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    data-testid="button-upload-photo"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Upload
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
                    data-testid="button-use-photo"
                  >
                    <ImagePlus className="h-4 w-4 mr-2" />
                    Use Photo
                  </Button>
                </>
              )}
            </div>
          </div>
        </UniversalModalContent>
      </UniversalModal>
    </>
  );
}
