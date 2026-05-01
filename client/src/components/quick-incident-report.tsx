import { useState, useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { UniversalModal, UniversalModalHeader, UniversalModalTitle, UniversalModalContent } from '@/components/ui/universal-modal';
import {
  ShieldAlert,
  MapPin,
  Camera,
  X as XIcon,
  Loader2,
  AlertTriangle,
  Flame,
  Siren,
  HeartPulse,
  Users,
  HelpCircle,
  Send,
} from "lucide-react";

const SEVERITY_OPTIONS = [
  { value: "low", label: "Low", color: "bg-blue-500", textColor: "text-blue-600 dark:text-blue-400" },
  { value: "medium", label: "Medium", color: "bg-yellow-500", textColor: "text-yellow-600 dark:text-yellow-400" },
  { value: "high", label: "High", color: "bg-orange-500", textColor: "text-orange-600 dark:text-orange-400" },
  { value: "critical", label: "Critical", color: "bg-red-600", textColor: "text-red-600 dark:text-red-400" },
] as const;

const CATEGORY_OPTIONS = [
  { value: "theft", label: "Theft", icon: AlertTriangle },
  { value: "fire", label: "Fire", icon: Flame },
  { value: "medical", label: "Medical", icon: HeartPulse },
  { value: "disturbance", label: "Disturbance", icon: Users },
  { value: "assault", label: "Assault", icon: Siren },
  { value: "other", label: "Other", icon: HelpCircle },
] as const;

function useQuickGPS() {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [status, setStatus] = useState<"idle" | "capturing" | "captured" | "unavailable">("idle");

  useEffect(() => {
    if (!navigator.geolocation) {
      setStatus("unavailable");
      return;
    }
    setStatus("capturing");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setStatus("captured");
      },
      () => setStatus("unavailable"),
      { timeout: 8000, maximumAge: 30000 }
    );
  }, []);

  return { coords, status };
}

interface QuickIncidentReportProps {
  workspaceId?: string;
}

export function QuickIncidentReportFAB({ workspaceId }: QuickIncidentReportProps) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        data-testid="fab-quick-incident"
        className={`fixed z-50 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-sm transition-transform active:scale-95 ${
          isMobile
            ? "bottom-20 right-4 h-14 w-14"
            : "bottom-6 right-6 h-12 w-12"
        }`}
        aria-label="Quick Incident Report"
      >
        <ShieldAlert className="h-6 w-6" />
      </button>

      <UniversalModal open={open} onOpenChange={setOpen}>
        <UniversalModalContent className="max-w-md p-0 gap-0">
          <UniversalModalHeader className="p-4 pb-2">
            <UniversalModalTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="h-4 w-4 text-destructive" />
              Quick Incident Report
            </UniversalModalTitle>
          </UniversalModalHeader>
          <QuickIncidentForm
            workspaceId={workspaceId}
            onComplete={() => setOpen(false)}
            onCancel={() => setOpen(false)}
          />
        </UniversalModalContent>
      </UniversalModal>
    </>
  );
}

interface QuickIncidentFormProps {
  workspaceId?: string;
  onComplete: () => void;
  onCancel: () => void;
}

function QuickIncidentForm({ workspaceId, onComplete, onCancel }: QuickIncidentFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const gps = useQuickGPS();
  const fileRef = useRef<HTMLInputElement>(null);

  const [severity, setSeverity] = useState<string>("medium");
  const [category, setCategory] = useState<string>("other");
  const [narrative, setNarrative] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);

  const mutation = useMutation({
    mutationFn: (data) => apiRequest("POST", "/api/rms/incidents", { ...data, workspaceId }),
    onSuccess: (d) => {
      queryClient.invalidateQueries({ queryKey: ["/api/rms/incidents", { workspaceId }] });
      queryClient.invalidateQueries({ queryKey: ["/api/rms/stats", { workspaceId }] });
      toast({ title: "Incident submitted", description: d.report_number || "Report created successfully" });
      onComplete();
    },
    onError: (e) => toast({ title: "Failed to submit", description: e.message, variant: "destructive" }),
  });

  function handleFiles(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      const url = URL.createObjectURL(file);
      setPhotos((prev) => [...prev, url]);
    }
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSubmit() {
    if (!narrative.trim()) return;
    const categoryLabel = CATEGORY_OPTIONS.find((c) => c.value === category)?.label || category;
    mutation.mutate({
      title: `QUICK: ${categoryLabel} — ${severity.toUpperCase()}`,
      category,
      priority: severity,
      narrative: narrative.trim(),
      occurredAt: new Date().toISOString(),
      reportedByName: user?.firstName || "Field Officer",
      photos,
      latitude: gps.coords?.lat,
      longitude: gps.coords?.lng,
      siteName: "",
      siteId: "",
      locationDescription: gps.coords
        ? `GPS: ${gps.coords.lat.toFixed(5)}, ${gps.coords.lng.toFixed(5)}`
        : "",
    });
  }

  return (
    <div className="px-4 pb-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Severity</span>
        {gps.status === "captured" && (
          <Badge variant="secondary" data-testid="badge-gps-status">
            <MapPin className="h-3 w-3 mr-1" />GPS Locked
          </Badge>
        )}
        {gps.status === "capturing" && (
          <Badge variant="outline" data-testid="badge-gps-status">
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />GPS...
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-4 gap-2" data-testid="severity-selector">
        {SEVERITY_OPTIONS.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => setSeverity(s.value)}
            data-testid={`button-severity-${s.value}`}
            className={`flex flex-col items-center gap-1 rounded-md border p-2 transition-colors ${
              severity === s.value
                ? `border border-current ${s.textColor} bg-muted`
                : "border-border"
            }`}
          >
            <div className={`h-3 w-3 rounded-full ${s.color}`} />
            <span className="text-[11px] font-medium">{s.label}</span>
          </button>
        ))}
      </div>

      <div>
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Category</span>
        <div className="grid grid-cols-3 gap-1.5 mt-1.5" data-testid="category-selector">
          {CATEGORY_OPTIONS.map((c) => {
            const Icon = c.icon;
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => setCategory(c.value)}
                data-testid={`button-category-${c.value}`}
                className={`flex items-center gap-1.5 rounded-md border p-2 text-left transition-colors ${
                  category === c.value
                    ? "border border-primary bg-muted"
                    : "border-border"
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="text-xs font-medium">{c.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <Textarea
        data-testid="input-quick-narrative"
        placeholder="What happened? (brief description)"
        value={narrative}
        onChange={(e) => setNarrative(e.target.value)}
        className="min-h-[70px] text-sm"
        autoFocus
      />

      <div className="flex items-center gap-2 flex-wrap">
        <Button
          type="button"
          variant="outline"
          size="default"
          onClick={() => fileRef.current?.click()}
          data-testid="button-quick-photo"
        >
          <Camera className="mr-2 h-4 w-4" />
          Add Photo
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        {photos.length > 0 && (
          <span className="text-xs text-muted-foreground" data-testid="text-photo-count">
            {photos.length} file{photos.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {photos.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {photos.map((src, i) => (
            <div key={i} className="relative">
              <img
                src={src}
                alt={`incident-photo-${i}`}
                className="w-14 h-14 object-cover rounded-md border"
                data-testid={`img-quick-photo-${i}`}
              />
              <button
                type="button"
                className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full w-4 h-4 flex items-center justify-center"
                onClick={() => removePhoto(i)}
                data-testid={`button-remove-photo-${i}`}
              >
                <XIcon className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Button
          variant="outline"
          className="flex-1"
          onClick={onCancel}
          data-testid="button-quick-cancel"
        >
          Cancel
        </Button>
        <Button
          variant="destructive"
          className="flex-1"
          onClick={handleSubmit}
          disabled={!narrative.trim() || mutation.isPending}
          data-testid="button-quick-submit"
        >
          {mutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting...
            </>
          ) : (
            <>
              <Send className="mr-2 h-4 w-4" />Submit Now
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
