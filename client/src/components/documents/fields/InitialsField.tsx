/**
 * InitialsField — Compact canvas-based initials capture
 */
import { useRef, useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Eraser } from "lucide-react";

interface InitialsFieldProps {
  id: string;
  label?: string;
  required?: boolean;
  value?: string | null;
  onChange: (data: string | null) => void;
  error?: string;
  disabled?: boolean;
}

export function InitialsField({
  id,
  label = "Initials",
  required = false,
  value,
  onChange,
  error,
  disabled = false,
}: InitialsFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const [hasContent, setHasContent] = useState(!!value);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = 120 * devicePixelRatio;
    canvas.height = 60 * devicePixelRatio;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(devicePixelRatio, devicePixelRatio);
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, 120, 60);
      img.src = value;
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

  const start = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
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
    setHasContent(true);
  }, []);

  const stop = useCallback(() => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    const data = canvasRef.current!.toDataURL("image/png");
    onChange(data.length > 100 ? data : null);
  }, [onChange]);

  const clear = () => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, 120, 60);
    setHasContent(false);
    onChange(null);
  };

  return (
    <div className="space-y-1" data-testid={`field-initials-${id}`}>
      <Label className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>
      <div className="flex items-center gap-3">
        <div className="relative" style={{ width: 120, height: 60 }}>
          <canvas
            ref={canvasRef}
            className="rounded border border-border bg-background touch-none"
            style={{ width: 120, height: 60, cursor: disabled ? "default" : "crosshair" }}
            onMouseDown={disabled ? undefined : start}
            onMouseMove={disabled ? undefined : draw}
            onMouseUp={disabled ? undefined : stop}
            onMouseLeave={disabled ? undefined : stop}
            onTouchStart={disabled ? undefined : start}
            onTouchMove={disabled ? undefined : draw}
            onTouchEnd={disabled ? undefined : stop}
          />
          {!hasContent && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-xs text-muted-foreground italic">Initials</span>
            </div>
          )}
        </div>
        {!disabled && (
          <Button type="button" variant="ghost" size="sm" onClick={clear} data-testid={`button-clear-initials-${id}`}>
            <Eraser className="w-3 h-3" />
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
