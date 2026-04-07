import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Shield, CheckCircle, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface Agreement {
  id: string;
  agreement_type: string;
  version: string;
  title: string;
  content: string;
  effective_date: string;
  requires_explicit_signature: boolean;
}

interface ConsentPreferences {
  trinity_voice_calls: boolean;
  trinity_sms: boolean;
  trinity_email: boolean;
  trinity_interview_calls: boolean;
  trinity_document_delivery: boolean;
  trinity_onboarding_comms: boolean;
  marketing_emails: boolean;
}

const DEFAULT_PREFS: ConsentPreferences = {
  trinity_voice_calls: true,
  trinity_sms: true,
  trinity_email: true,
  trinity_interview_calls: true,
  trinity_document_delivery: true,
  trinity_onboarding_comms: true,
  marketing_emails: false,
};

interface ConsentModalProps {
  open: boolean;
  onAccepted: () => void;
}

export function ConsentModal({ open, onAccepted }: ConsentModalProps) {
  const [typedName, setTypedName] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [readMap, setReadMap] = useState<Record<string, boolean>>({});
  const [prefs, setPrefs] = useState<ConsentPreferences>(DEFAULT_PREFS);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: pendingAgreements = [], isLoading } = useQuery<Agreement[]>({
    queryKey: ["/api/legal/pending-agreements"],
    enabled: open,
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      if (!typedName.trim() || typedName.trim().length < 2) {
        throw new Error("Please type your full name to confirm acceptance.");
      }
      const unread = pendingAgreements.filter(
        (a) => a.requires_explicit_signature && !readMap[a.id]
      );
      if (unread.length > 0) {
        throw new Error(`Please expand and read all agreements before signing: ${unread.map((a) => a.title).join(", ")}`);
      }

      const agreements = pendingAgreements.map((a) => ({
        id: a.id,
        type: a.agreement_type,
        version: a.version,
      }));

      return apiRequest("POST", "/api/legal/accept-agreements", {
        agreements,
        typedName: typedName.trim(),
        consentPreferences: prefs,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/legal/pending-agreements"] });
      onAccepted();
    },
    onError: (err: any) => {
      setError(err?.message || "Failed to record acceptance. Please try again.");
    },
  });

  useEffect(() => {
    if (pendingAgreements.length > 0 && !expandedId) {
      setExpandedId(pendingAgreements[0].id);
    }
  }, [pendingAgreements]);

  // When loaded with no pending agreements, signal acceptance via effect (not during render)
  useEffect(() => {
    if (open && !isLoading && pendingAgreements.length === 0) {
      onAccepted();
    }
  }, [open, isLoading, pendingAgreements.length]);

  // Release scroll lock when this modal unmounts (guards against Radix UI leak on iOS Safari)
  useEffect(() => {
    return () => {
      document.body.style.overflow = "";
      document.body.style.overflowY = "";
      document.documentElement.style.overflow = "";
      document
        .querySelectorAll("style[data-body-scroll-lock]")
        .forEach((el) => el.remove());
    };
  }, []);

  if (!open) return null;
  if (isLoading) return null;
  if (pendingAgreements.length === 0) return null;

  function toggleExpand(id: string) {
    setExpandedId((prev) => {
      const next = prev === id ? null : id;
      if (next) setReadMap((r) => ({ ...r, [id]: true }));
      return next;
    });
  }

  function togglePref(key: keyof ConsentPreferences) {
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
  }

  return (
    <Dialog open modal>
      <DialogContent
        size="xl"
        className="max-h-[88dvh] flex flex-col p-0 gap-0"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        hideBuiltInClose={true}
        data-testid="consent-modal"
      >
        {/* Header — fixed, never scrolls */}
        <div className="px-4 pt-5 pb-3 sm:px-6 border-b shrink-0">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-5 h-5 text-primary shrink-0" />
            <h2 className="text-base font-semibold leading-tight">Review &amp; Accept Agreements</h2>
          </div>
          <p className="text-sm text-muted-foreground leading-snug">
            Before continuing, please review and accept the following agreements required for your role.
          </p>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4 space-y-4">

          {/* Agreements */}
          {pendingAgreements.map((agreement) => (
            <div key={agreement.id} className="border rounded-md overflow-hidden">
              <button
                className="w-full flex items-start justify-between gap-2 px-3 py-3 text-left hover-elevate"
                onClick={() => toggleExpand(agreement.id)}
                data-testid={`agreement-toggle-${agreement.agreement_type}`}
              >
                {/* Left: icon + title */}
                <div className="flex items-start gap-2 min-w-0 flex-1">
                  {readMap[agreement.id] ? (
                    <CheckCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                  ) : (
                    <div className="w-4 h-4 rounded-full border-2 border-muted-foreground shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0">
                    <p className="font-medium text-sm leading-snug break-words">{agreement.title}</p>
                    <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                      <span className="text-xs text-muted-foreground">v{agreement.version}</span>
                      {agreement.requires_explicit_signature && (
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5 py-0 leading-none">
                          Sig. Required
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                {/* Right: chevron */}
                <div className="shrink-0 mt-0.5">
                  {expandedId === agreement.id
                    ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    : <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  }
                </div>
              </button>

              {expandedId === agreement.id && (
                <div className="border-t bg-muted/20 px-3 py-3">
                  <ScrollArea className="h-44">
                    <p
                      className="text-xs text-foreground leading-relaxed whitespace-pre-wrap break-words pr-2"
                      data-testid={`agreement-content-${agreement.agreement_type}`}
                    >
                      {agreement.content}
                    </p>
                  </ScrollArea>
                </div>
              )}
            </div>
          ))}

          {/* Communication Consent */}
          {pendingAgreements.some((a) => a.agreement_type === "trinity_consent") && (
            <div className="border rounded-md px-3 py-4 space-y-3">
              <p className="text-sm font-medium">Communication Preferences</p>
              <p className="text-xs text-muted-foreground">
                Choose which types of automated communications you consent to receive from Trinity AI:
              </p>
              <div className="space-y-2.5">
                {([
                  ["trinity_voice_calls", "Voice calls for scheduling and updates"],
                  ["trinity_sms", "Text messages (SMS) for alerts and reminders"],
                  ["trinity_email", "Email notifications and correspondence"],
                  ["trinity_interview_calls", "AI-conducted interview calls"],
                  ["trinity_document_delivery", "Electronic document delivery"],
                  ["trinity_onboarding_comms", "Onboarding guidance and follow-ups"],
                  ["marketing_emails", "Platform updates and feature announcements (optional)"],
                ] as [keyof ConsentPreferences, string][]).map(([key, label]) => (
                  <div key={key} className="flex items-start gap-2.5">
                    <Checkbox
                      id={`pref-${key}`}
                      data-testid={`checkbox-pref-${key}`}
                      checked={prefs[key]}
                      onCheckedChange={() => togglePref(key)}
                      className="mt-0.5 shrink-0"
                    />
                    <label htmlFor={`pref-${key}`} className="text-sm cursor-pointer leading-snug">
                      {label}
                    </label>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                You may update these preferences at any time in your account settings.
                Reply STOP to any text to opt out immediately.
              </p>
            </div>
          )}

          {/* Typed name signature */}
          <div className="space-y-2">
            <Label htmlFor="typed-name" className="text-sm leading-snug block">
              Type your full name to confirm you have read and agree to all agreements above
            </Label>
            <Input
              id="typed-name"
              data-testid="input-typed-name"
              value={typedName}
              onChange={(e) => { setTypedName(e.target.value); setError(null); }}
              placeholder="Your full legal name"
              autoComplete="name"
              className="w-full"
            />
            <p className="text-xs text-muted-foreground leading-snug">
              By typing your name and clicking Accept, you are electronically signing these agreements.
              This is legally equivalent to a handwritten signature under the ESIGN Act.
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="break-words">{error}</span>
            </div>
          )}
        </div>

        {/* Footer — fixed at bottom, never scrolls */}
        <div className="px-4 sm:px-6 py-3 border-t shrink-0 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Effective {pendingAgreements[0]
              ? new Date(pendingAgreements[0].effective_date).toLocaleDateString()
              : ""}
          </p>
          <Button
            data-testid="button-accept-agreements"
            className="w-full sm:w-auto"
            onClick={() => {
              setError(null);
              acceptMutation.mutate();
            }}
            disabled={acceptMutation.isPending || !typedName.trim()}
          >
            {acceptMutation.isPending ? "Recording..." : "I Accept All Agreements"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
