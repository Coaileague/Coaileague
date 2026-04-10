/**
 * SignatureCapture — Reusable signature input component.
 *
 * Supports two modes:
 *   "draw"  — canvas pad (mouse + touch)
 *   "type"  — typed full name as legal signature
 *
 * Props:
 *   onCapture(data)  — called when user finishes. data = { type, value }
 *                      type: 'canvas' | 'typed'
 *                      value: base64 PNG data-URL (canvas) or full name string (typed)
 *   onClear()        — called when user clears the signature
 *   label?           — optional label above the capture area
 *   readOnly?        — display-only mode (shows existing signature)
 *   existingData?    — initial { type, value } to display in read-only mode
 */

import { useRef, useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PenLine, Type, Trash2, CheckCircle } from "lucide-react";

export interface SignatureData {
  type: "canvas" | "typed";
  value: string;
}

interface SignatureCaptureProps {
  onCapture?: (data: SignatureData) => void;
  onClear?: () => void;
  label?: string;
  readOnly?: boolean;
  existingData?: SignatureData | null;
}

export function SignatureCapture({
  onCapture,
  onClear,
  label = "Signature",
  readOnly = false,
  existingData = null,
}: SignatureCaptureProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [captured, setCaptured] = useState<SignatureData | null>(existingData);
  const [mode, setMode] = useState<"draw" | "type">("draw");

  // Reset canvas when tab switches
  useEffect(() => {
    if (mode === "draw" && canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        ctx.strokeStyle = "#111827";
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
      }
    }
  }, [mode]);

  const getCanvasPos = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      const touch = e.touches[0];
      return { x: (touch.clientX - rect.left) * scaleX, y: (touch.clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }, []);

  const startDrawing = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (readOnly || captured) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pos = getCanvasPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    setIsDrawing(true);
  }, [readOnly, captured, getCanvasPos]);

  const draw = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pos = getCanvasPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  }, [isDrawing, getCanvasPos]);

  const stopDrawing = useCallback(() => {
    setIsDrawing(false);
  }, []);

  const confirmCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    const data: SignatureData = { type: "canvas", value: dataUrl };
    setCaptured(data);
    onCapture?.(data);
  }, [onCapture]);

  const confirmTyped = useCallback(() => {
    if (!typedName.trim()) return;
    const data: SignatureData = { type: "typed", value: typedName.trim() };
    setCaptured(data);
    onCapture?.(data);
  }, [typedName, onCapture]);

  const clearSignature = useCallback(() => {
    setCaptured(null);
    setTypedName("");
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
    onClear?.();
  }, [onClear]);

  // ── Read-only display ──────────────────────────────────────────────────────
  if (readOnly && existingData) {
    return (
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">{label}</Label>
        <div className="rounded-md border border-green-200 bg-green-50 p-3 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
          {existingData.type === "canvas" ? (
            <img src={existingData.value} alt="Signature" className="max-h-12 object-contain" />
          ) : (
            <span className="font-serif italic text-lg text-gray-800">{existingData.value}</span>
          )}
          <span className="text-xs text-muted-foreground ml-auto">Signed</span>
        </div>
      </div>
    );
  }

  // ── Captured confirmation state ────────────────────────────────────────────
  if (captured) {
    return (
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">{label}</Label>
        <div className="rounded-md border border-green-200 bg-green-50 p-3 flex items-center gap-3">
          <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
          {captured.type === "canvas" ? (
            <img src={captured.value} alt="Signature" className="max-h-10 object-contain" />
          ) : (
            <span className="font-serif italic text-lg text-gray-800">{captured.value}</span>
          )}
          {!readOnly && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearSignature}
              className="ml-auto text-muted-foreground"
              data-testid="btn-clear-signature"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              Clear
            </Button>
          )}
        </div>
      </div>
    );
  }

  // ── Input mode ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      <Tabs value={mode} onValueChange={(v) => setMode(v as "draw" | "type")}>
        <TabsList className="h-8">
          <TabsTrigger value="draw" className="text-xs gap-1.5" data-testid="tab-draw-signature">
            <PenLine className="w-3 h-3" />Draw
          </TabsTrigger>
          <TabsTrigger value="type" className="text-xs gap-1.5" data-testid="tab-type-signature">
            <Type className="w-3 h-3" />Type
          </TabsTrigger>
        </TabsList>

        <TabsContent value="draw" className="mt-2 space-y-2">
          <div className="rounded-md border border-input bg-white overflow-hidden">
            <canvas
              ref={canvasRef}
              width={480}
              height={120}
              className="w-full touch-none cursor-crosshair"
              style={{ display: "block" }}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
              data-testid="canvas-signature"
            />
          </div>
          <p className="text-xs text-muted-foreground">Draw your signature above</p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                const canvas = canvasRef.current;
                if (canvas) {
                  const ctx = canvas.getContext("2d");
                  ctx?.clearRect(0, 0, canvas.width, canvas.height);
                }
              }}
              data-testid="btn-clear-canvas"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" />Clear
            </Button>
            <Button type="button" size="sm" onClick={confirmCanvas} data-testid="btn-confirm-canvas">
              <CheckCircle className="w-3.5 h-3.5 mr-1" />Use Signature
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="type" className="mt-2 space-y-2">
          <Input
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
            placeholder="Type your full legal name"
            className="font-serif italic text-lg"
            data-testid="input-typed-signature"
          />
          <p className="text-xs text-muted-foreground">
            Typing your full name constitutes a legal electronic signature.
          </p>
          <Button
            type="button"
            size="sm"
            onClick={confirmTyped}
            disabled={!typedName.trim()}
            data-testid="btn-confirm-typed-signature"
          >
            <CheckCircle className="w-3.5 h-3.5 mr-1" />Use Name as Signature
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  );
}
