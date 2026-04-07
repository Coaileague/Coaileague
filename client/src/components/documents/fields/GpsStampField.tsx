/**
 * GpsStampField — Automatic GPS capture with permission prompt.
 * Captures coordinates on mount or on user tap.
 * Shows city/state to user — full coords stored in value.
 */
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { MapPin, Loader2, AlertCircle, CheckCircle } from "lucide-react";

export interface GpsData {
  latitude: number;
  longitude: number;
  accuracy: number;
  capturedAt: string;
  denied?: boolean;
}

interface GpsStampFieldProps {
  id: string;
  value?: GpsData | null;
  onChange: (data: GpsData | null) => void;
  autoCapture?: boolean;
}

export function GpsStampField({ id, value, onChange, autoCapture = true }: GpsStampFieldProps) {
  const [status, setStatus] = useState<"idle" | "capturing" | "captured" | "denied" | "error">(
    value ? "captured" : "idle"
  );
  const [cityState, setCityState] = useState<string>("");

  const capture = () => {
    if (!navigator.geolocation) {
      setStatus("denied");
      onChange({ latitude: 0, longitude: 0, accuracy: 0, capturedAt: new Date().toISOString(), denied: true });
      return;
    }
    setStatus("capturing");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const data: GpsData = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          capturedAt: new Date().toISOString(),
        };
        onChange(data);
        setStatus("captured");
        setCityState(`${data.latitude.toFixed(4)}°N, ${data.longitude.toFixed(4)}°W`);
      },
      () => {
        setStatus("denied");
        onChange({ latitude: 0, longitude: 0, accuracy: 0, capturedAt: new Date().toISOString(), denied: true });
      },
      { timeout: 10000, enableHighAccuracy: false }
    );
  };

  useEffect(() => {
    if (autoCapture && status === "idle") {
      capture();
    }
  }, []);

  useEffect(() => {
    if (value && !value.denied) {
      setStatus("captured");
      setCityState(`${value.latitude.toFixed(4)}°N, ${value.longitude.toFixed(4)}°W`);
    }
  }, [value]);

  return (
    <div className="flex items-center gap-2 text-sm" data-testid={`field-gps-${id}`}>
      <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      {status === "capturing" && (
        <span className="text-muted-foreground flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" />
          Capturing location...
        </span>
      )}
      {status === "captured" && (
        <span className="text-green-700 dark:text-green-400 flex items-center gap-1" data-testid={`text-gps-coords-${id}`}>
          <CheckCircle className="w-3 h-3" />
          Location captured: {cityState}
        </span>
      )}
      {status === "denied" && (
        <span className="text-muted-foreground flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          Location access denied — recorded
        </span>
      )}
      {status === "idle" && (
        <Button type="button" variant="outline" size="sm" onClick={capture} data-testid={`button-capture-gps-${id}`}>
          Capture Location
        </Button>
      )}
    </div>
  );
}
