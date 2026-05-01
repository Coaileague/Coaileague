/**
 * Guard Tour QR Scanner — Readiness Section 20
 * ===============================================
 * Closes the MISS called out in Section 4 of the readiness audit.
 * Uses the browser-native BarcodeDetector API when available (Chrome,
 * Edge, Samsung Internet, recent Safari). Falls back to a manual-entry
 * input when the API is missing so the officer is never trapped.
 *
 * Intentionally dependency-free (no html5-qrcode, no zxing) to avoid
 * adding a 200KB JS dep for a single screen. When BarcodeDetector is
 * not supported, we show the manual-code input as the primary path.
 *
 * Contract:
 *   onScan(code) — called on each successful detection. The parent
 *   page decides what to do (POST to /api/guard-tours/scans, etc).
 */

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera, CheckCircle2, Keyboard, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface GuardTourScannerProps {
  onScan: (code: string) => Promise<void> | void;
  instructionsLabel?: string;
  className?: string;
}

// Feature-detect the native BarcodeDetector.
function hasBarcodeDetector(): boolean {
  try {
    return typeof (window as any).BarcodeDetector === "function";
  } catch {
    return false;
  }
}

export function GuardTourScanner({
  onScan,
  instructionsLabel = "Point the camera at the checkpoint QR.",
  className,
}: GuardTourScannerProps): JSX.Element {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<any>(null);
  const loopRef = useRef<number | null>(null);
  const lastCodeRef = useRef<string | null>(null);

  const [supported] = useState(hasBarcodeDetector());
  const [scanning, setScanning] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<null | { ok: boolean; text: string }>(null);

  const stop = () => {
    if (loopRef.current) cancelAnimationFrame(loopRef.current);
    loopRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  };

  useEffect(() => () => stop(), []);

  async function handleScannedCode(code: string): Promise<void> {
    if (!code || code === lastCodeRef.current) return;
    lastCodeRef.current = code;
    setSubmitting(true);
    try {
      await onScan(code);
      setStatus({ ok: true, text: `Checkpoint ${code.slice(0, 12)} logged.` });
    } catch (err: unknown) {
      setStatus({ ok: false, text: err?.message || "Scan rejected. Try again or enter code manually." });
    } finally {
      setSubmitting(false);
      // Debounce — ignore the same code if it re-detects within 2s.
      setTimeout(() => { lastCodeRef.current = null; }, 2000);
    }
  }

  async function startScan(): Promise<void> {
    setStatus(null);
    if (!supported) {
      setStatus({ ok: false, text: "Camera scan not supported here. Enter the code manually." });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      detectorRef.current = new (window as any).BarcodeDetector({
        formats: ["qr_code", "code_128", "code_39"],
      });
      setScanning(true);

      const tick = async () => {
        if (!videoRef.current || !detectorRef.current) return;
        try {
          const codes = await detectorRef.current.detect(videoRef.current);
          if (codes && codes.length > 0) {
            const raw = String(codes[0].rawValue || "").trim();
            if (raw) await handleScannedCode(raw);
          }
        } catch {
          /* detection noise — ignore individual-frame errors */
        }
        loopRef.current = requestAnimationFrame(tick);
      };
      loopRef.current = requestAnimationFrame(tick);
    } catch (err: unknown) {
      setStatus({
        ok: false,
        text:
          err?.name === "NotAllowedError"
            ? "Camera permission denied. Enable camera access in settings or enter the code manually."
            : err?.message || "Could not start camera.",
      });
      stop();
    }
  }

  async function submitManual(): Promise<void> {
    const code = manualCode.trim();
    if (code.length < 4) {
      setStatus({ ok: false, text: "Enter a valid checkpoint code (min 4 chars)." });
      return;
    }
    await handleScannedCode(code);
    setManualCode("");
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <p className="text-sm text-muted-foreground">{instructionsLabel}</p>

      {supported ? (
        <div className="relative rounded-md overflow-hidden bg-black">
          <video
            ref={videoRef}
            className={cn("w-full aspect-square object-cover", !scanning && "opacity-30")}
            playsInline
            muted
            data-testid="guard-tour-video"
          />
          {!scanning && (
            <div className="absolute inset-0 grid place-items-center">
              <Button
                type="button"
                onClick={startScan}
                className="gap-2"
                data-testid="button-start-scan"
              >
                <Camera className="h-4 w-4" />
                Start camera
              </Button>
            </div>
          )}
          {submitting && (
            <div className="absolute inset-0 grid place-items-center bg-black/40">
              <Loader2 className="h-8 w-8 animate-spin text-white" />
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-md border p-4 bg-amber-500/10 text-xs">
          This device does not support camera QR scanning. Enter the
          checkpoint code below.
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2 items-stretch">
        <Input
          value={manualCode}
          onChange={(e) => setManualCode(e.target.value)}
          placeholder="Or enter checkpoint code"
          className="flex-1"
          data-testid="input-manual-code"
        />
        <Button
          type="button"
          variant="secondary"
          onClick={submitManual}
          disabled={submitting || manualCode.trim().length < 4}
          className="gap-2"
          data-testid="button-manual-submit"
        >
          <Keyboard className="h-4 w-4" />
          Submit
        </Button>
      </div>

      {status && (
        <div
          className={cn(
            "flex items-center gap-2 rounded-md px-3 py-2 text-sm",
            status.ok ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-red-500/10 text-red-700 dark:text-red-400",
          )}
          data-testid="scan-status"
        >
          {status.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          <span>{status.text}</span>
        </div>
      )}

      {scanning && (
        <Button type="button" variant="ghost" size="sm" onClick={stop}>
          Stop camera
        </Button>
      )}
    </div>
  );
}

export default GuardTourScanner;
