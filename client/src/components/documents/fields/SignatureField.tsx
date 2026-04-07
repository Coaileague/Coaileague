/**
 * SignatureField — Canvas-based drawn signature
 * Works with mouse on desktop, touch on mobile.
 * Stores as base64 PNG.
 */
import { useRef, useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Pen, Eraser, CheckCircle } from "lucide-react";

interface SignatureFieldProps {
  id: string;
  label: string;
  required?: boolean;
  value?: string | null;
  onChange: (data: string | null) => void;
  error?: string;
  disabled?: boolean;
  mobileModal?: boolean;
}

function SignatureCanvas({
  onChange,
  initialData,
  height = 120,
  strokeColor = "#1e293b",
}: {
  onChange: (data: string) => void;
  initialData?: string | null;
  height?: number;
  strokeColor?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const [hasContent, setHasContent] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * devicePixelRatio;
    canvas.height = height * devicePixelRatio;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(devicePixelRatio, devicePixelRatio);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (initialData) {
      const img = new Image();
      img.onload = () => { ctx.drawImage(img, 0, 0, rect.width, height); };
      img.src = initialData;
      setHasContent(true);
    }
  }, []);

  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      const t = e.touches[0];
      return { x: t.clientX - rect.left, y: t.clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  };

  const startDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    lastPos.current = pos;
    isDrawing.current = true;
  }, []);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing.current) return;
    e.preventDefault();
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const pos = getPos(e, canvas);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    lastPos.current = pos;
    setHasContent(true);
  }, []);

  const stopDraw = useCallback(() => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    const canvas = canvasRef.current!;
    onChange(canvas.toDataURL("image/png"));
  }, [onChange]);

  const clear = () => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, height);
    setHasContent(false);
    onChange("");
  };

  return (
    <div className="space-y-1.5">
      <div className="relative" style={{ height }}>
        <canvas
          ref={canvasRef}
          className="w-full rounded-md border border-border bg-background touch-none"
          style={{ height, cursor: "crosshair", display: "block" }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={stopDraw}
          onMouseLeave={stopDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={stopDraw}
        />
        {!hasContent && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-muted-foreground text-sm italic select-none">Sign here</span>
          </div>
        )}
      </div>
      <div className="flex justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={clear} data-testid="button-clear-signature">
          <Eraser className="w-3.5 h-3.5 mr-1.5" />
          Clear
        </Button>
      </div>
    </div>
  );
}

export function SignatureField({
  id,
  label,
  required = false,
  value,
  onChange,
  error,
  disabled = false,
  mobileModal = true,
}: SignatureFieldProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const isMobile = window.innerWidth < 768;

  const handleChange = (data: string | null) => {
    onChange(data && data.length > 100 ? data : null);
  };

  return (
    <div className="space-y-1.5" data-testid={`field-signature-${id}`}>
      <Label className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>

      {value ? (
        <div className="space-y-2">
          <div className="rounded-md border border-border bg-muted/30 p-2">
            <img
              src={value}
              alt="Signature"
              className="h-16 object-contain object-left"
              data-testid={`img-signature-${id}`}
            />
          </div>
          {!disabled && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => { onChange(null); }}
              data-testid={`button-re-sign-${id}`}
            >
              <Pen className="w-3.5 h-3.5 mr-1.5" />
              Re-sign
            </Button>
          )}
        </div>
      ) : disabled ? (
        <div className="rounded-md border border-dashed border-border p-6 text-center text-muted-foreground text-sm">
          Awaiting signature
        </div>
      ) : isMobile && mobileModal ? (
        <>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => setModalOpen(true)}
            data-testid={`button-open-signature-modal-${id}`}
          >
            <Pen className="w-4 h-4 mr-2" />
            Tap to Sign
          </Button>
          <Dialog open={modalOpen} onOpenChange={setModalOpen}>
            <DialogContent className="max-w-full h-screen flex flex-col p-4 gap-3">
              <div className="pr-24 sm:pr-28">
                <h2 className="text-base font-semibold">{label}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Sign with your finger in the box below</p>
              </div>
              <div className="flex-1 flex flex-col">
                <SignatureCanvas
                  onChange={handleChange}
                  height={300}
                />
              </div>
              <Button
                className="w-full"
                onClick={() => setModalOpen(false)}
                data-testid={`button-done-signature-${id}`}
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Done — Save Signature
              </Button>
            </DialogContent>
          </Dialog>
        </>
      ) : (
        <SignatureCanvas onChange={handleChange} initialData={value} />
      )}

      {error && (
        <p className="text-xs text-destructive" data-testid={`error-signature-${id}`}>{error}</p>
      )}
    </div>
  );
}
