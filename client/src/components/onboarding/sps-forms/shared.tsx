/**
 * Shared UI primitives for the SPS 10-step onboarding wizard.
 * FormSection, SignatureField, FileUploader, DocumentViewer, ProgressBar, FieldError
 */
import { useRef, useState, useEffect, useCallback } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Upload, X, PenLine, Eraser, CheckCircle2 } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

// ── FieldError ─────────────────────────────────────────────────────────────────
export function FieldError({ error }: { error?: string }) {
  if (!error) return null;
  return <p className="text-xs text-red-500 mt-1">{error}</p>;
}

// ── FormSection ────────────────────────────────────────────────────────────────
export function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="border-b pb-2">
        <h3 className="font-semibold text-base text-foreground">{title}</h3>
        {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

// ── ProgressBar ────────────────────────────────────────────────────────────────
export function OnboardingProgressBar({
  currentStep,
  totalSteps,
  completedSteps,
}: {
  currentStep: number;
  totalSteps: number;
  completedSteps: number[];
}) {
  const pct = Math.round(((completedSteps.length) / totalSteps) * 100);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Step {currentStep} of {totalSteps}</span>
        <span>{pct}% complete</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex gap-1 mt-1">
        {Array.from({ length: totalSteps }, (_, i) => {
          const step = i + 1;
          const done = completedSteps.includes(step);
          const active = step === currentStep;
          return (
            <div
              key={step}
              className={`flex-1 h-1.5 rounded-full transition-colors ${
                done ? 'bg-primary' : active ? 'bg-primary/40' : 'bg-muted'
              }`}
            />
          );
        })}
      </div>
    </div>
  );
}

// ── SignatureField ─────────────────────────────────────────────────────────────
export function SignatureField({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [useTyped, setUseTyped] = useState(false);
  const [typed, setTyped] = useState('');
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    lastPos.current = pos;
    setDrawing(true);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing) return;
    e.preventDefault();
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const pos = getPos(e, canvas);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1e40af';
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    lastPos.current = pos;
  };

  const stopDraw = () => {
    if (!drawing) return;
    setDrawing(false);
    onChange(canvasRef.current!.toDataURL());
  };

  const clear = () => {
    const canvas = canvasRef.current!;
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
    onChange('');
  };

  const applyTyped = () => {
    if (!typed.trim()) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = 'italic 28px Georgia, serif';
    ctx.fillStyle = '#1e40af';
    ctx.fillText(typed, 16, 50);
    onChange(canvas.toDataURL());
  };

  // Sync typed signature on input
  useEffect(() => {
    if (useTyped && typed) applyTyped();
  }, [typed, useTyped]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">{label}</Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-xs h-7"
          onClick={() => setUseTyped(v => !v)}
        >
          {useTyped ? 'Draw instead' : 'Type instead'}
        </Button>
      </div>

      {useTyped ? (
        <Input
          placeholder="Type your full name to sign"
          value={typed}
          onChange={e => setTyped(e.target.value)}
          className="text-base italic font-serif"
        />
      ) : (
        <div className="relative border rounded-lg overflow-hidden bg-white touch-none">
          <canvas
            ref={canvasRef}
            width={480}
            height={100}
            className="w-full h-[100px] cursor-crosshair"
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={stopDraw}
            onMouseLeave={stopDraw}
            onTouchStart={startDraw}
            onTouchMove={draw}
            onTouchEnd={stopDraw}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute top-1 right-1 h-7 w-7 opacity-60 hover:opacity-100"
            onClick={clear}
          >
            <Eraser className="h-4 w-4" />
          </Button>
          {!value && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-muted-foreground text-sm flex items-center gap-1">
                <PenLine className="h-4 w-4" /> Sign here
              </span>
            </div>
          )}
        </div>
      )}
      {value && (
        <p className="text-xs text-green-600 flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" /> Signed
        </p>
      )}
      <FieldError error={error} />
    </div>
  );
}

// ── FileUploader ───────────────────────────────────────────────────────────────
export function FileUploader({
  label,
  value,
  onChange,
  error,
  accept = 'image/*',
  maxMb = 5,
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
  error?: string;
  accept?: string;
  maxMb?: number;
}) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({ variant: 'destructive', title: 'Invalid file', description: 'Only image files are accepted.' });
      return;
    }
    if (file.size > maxMb * 1024 * 1024) {
      toast({ variant: 'destructive', title: 'File too large', description: `Maximum size is ${maxMb} MB.` });
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/sps/forms/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(errJson.error || 'Upload failed');
      }
      const { url } = await res.json();
      onChange(url);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Upload failed', description: String(err) });
    } finally {
      setUploading(false);
    }
  }, [onChange, maxMb, toast]);

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      <div
        className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
          value ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 hover:border-primary/50'
        }`}
        onClick={() => inputRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => {
          e.preventDefault();
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={accept}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        {uploading ? (
          <div className="flex flex-col items-center gap-2 py-2">
            <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-muted-foreground">Uploading…</span>
          </div>
        ) : value ? (
          <div className="flex flex-col items-center gap-2 py-2">
            <CheckCircle2 className="h-6 w-6 text-primary" />
            <span className="text-xs text-muted-foreground">Uploaded — click to replace</span>
            <img src={value} alt="preview" className="max-h-24 max-w-full rounded border object-contain" />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-4">
            <Upload className="h-6 w-6 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              Tap to upload or drag & drop
            </span>
            <span className="text-xs text-muted-foreground">Images only, max {maxMb} MB</span>
          </div>
        )}
      </div>
      <FieldError error={error} />
    </div>
  );
}

// ── DocumentViewer ─────────────────────────────────────────────────────────────
export function DocumentViewer({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="bg-muted px-4 py-2 border-b">
        <span className="font-medium text-sm">{title}</span>
      </div>
      <div className="p-4 text-sm text-muted-foreground space-y-2 max-h-56 overflow-y-auto leading-relaxed">
        {children}
      </div>
    </div>
  );
}

// ── AckCheckbox ────────────────────────────────────────────────────────────────
export function AckCheckbox({
  id,
  label,
  checked,
  onChange,
  error,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  error?: string;
}) {
  return (
    <div className="space-y-1">
      <label
        htmlFor={id}
        className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
          checked ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
        }`}
      >
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={e => onChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary accent-primary flex-shrink-0"
        />
        <span className="text-sm leading-snug">{label}</span>
      </label>
      <FieldError error={error} />
    </div>
  );
}
