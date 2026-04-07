/**
 * VerificationStamp — Auto-populated on submission.
 * Shows submission timestamp, IP (fetched), GPS coords, device info, session ID.
 */
import { format } from "date-fns";
import { Shield, Clock, MapPin, Monitor } from "lucide-react";

const PLATFORM_NAME = (import.meta.env.VITE_PLATFORM_NAME as string) || "CoAIleague";

export interface VerificationData {
  submittedAt: string;
  ipAddress?: string;
  gpsLatitude?: number;
  gpsLongitude?: number;
  gpsAccuracy?: number;
  gpsDenied?: boolean;
  deviceType?: string;
  browser?: string;
  sessionId?: string;
  documentId?: string;
}

interface VerificationStampProps {
  data: VerificationData;
}

function getBrowserInfo(): { deviceType: string; browser: string } {
  const ua = navigator.userAgent;
  const isMobile = /Mobi|Android/i.test(ua);
  const deviceType = isMobile ? "Mobile" : "Desktop";
  let browser = "Unknown";
  if (ua.includes("Chrome") && !ua.includes("Edge")) browser = "Chrome";
  else if (ua.includes("Firefox")) browser = "Firefox";
  else if (ua.includes("Safari") && !ua.includes("Chrome")) browser = "Safari";
  else if (ua.includes("Edge")) browser = "Edge";
  return { deviceType, browser };
}

export function buildVerificationData(opts: {
  gpsData?: { latitude: number; longitude: number; accuracy: number; denied?: boolean } | null;
  ipAddress?: string;
  sessionId?: string;
  documentId?: string;
}): VerificationData {
  const { deviceType, browser } = getBrowserInfo();
  return {
    submittedAt: new Date().toISOString(),
    ipAddress: opts.ipAddress,
    gpsLatitude: opts.gpsData?.latitude,
    gpsLongitude: opts.gpsData?.longitude,
    gpsAccuracy: opts.gpsData?.accuracy,
    gpsDenied: opts.gpsData?.denied,
    deviceType,
    browser,
    sessionId: opts.sessionId,
    documentId: opts.documentId,
  };
}

export function VerificationStamp({ data }: VerificationStampProps) {
  const local = new Date(data.submittedAt);
  const utc = data.submittedAt;

  return (
    <div
      className="rounded-md border border-border bg-muted/30 p-4 space-y-2 text-xs font-mono"
      data-testid="verification-stamp"
    >
      <div className="flex items-center gap-2 mb-2">
        <Shield className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Electronic Submission Verification</span>
      </div>

      <div className="flex items-start gap-2">
        <Clock className="w-3 h-3 text-muted-foreground mt-0.5 flex-shrink-0" />
        <div>
          <div data-testid="stamp-local-time">{format(local, "MMMM d, yyyy 'at' h:mm:ss a zzz")}</div>
          <div className="text-muted-foreground">UTC: {utc}</div>
        </div>
      </div>

      {data.ipAddress && (
        <div className="flex items-center gap-2">
          <Monitor className="w-3 h-3 text-muted-foreground flex-shrink-0" />
          <span>IP: <span data-testid="stamp-ip">{data.ipAddress}</span></span>
        </div>
      )}

      {data.gpsLatitude && !data.gpsDenied && (
        <div className="flex items-center gap-2">
          <MapPin className="w-3 h-3 text-muted-foreground flex-shrink-0" />
          <span data-testid="stamp-gps">
            GPS: {data.gpsLatitude.toFixed(6)}, {data.gpsLongitude?.toFixed(6)} (±{data.gpsAccuracy?.toFixed(0)}m)
          </span>
        </div>
      )}

      {data.gpsDenied && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <MapPin className="w-3 h-3 flex-shrink-0" />
          <span>GPS: Location access denied by user</span>
        </div>
      )}

      {data.deviceType && (
        <div className="flex items-center gap-2">
          <Monitor className="w-3 h-3 text-muted-foreground flex-shrink-0" />
          <span>{data.deviceType} · {data.browser}</span>
        </div>
      )}

      {data.documentId && (
        <div className="text-muted-foreground">
          Document ID: <span data-testid="stamp-doc-id">{data.documentId}</span>
        </div>
      )}

      {data.sessionId && (
        <div className="text-muted-foreground">
          Session: {data.sessionId}
        </div>
      )}

      <div className="pt-2 border-t border-border text-muted-foreground text-[10px]">
        This document was completed electronically via {PLATFORM_NAME}. Electronic signatures are legally binding under applicable federal and state law (ESIGN Act, UETA).
      </div>
    </div>
  );
}
