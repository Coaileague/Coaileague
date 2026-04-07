import { useEffect, useState } from "react";

const PLATFORM_NAME = (import.meta.env.VITE_PLATFORM_NAME as string) || "CoAIleague";
import { useLocation } from "wouter";
import { CheckCircle, XCircle, Clock, Users, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type AcceptStatus = "success" | "invalid" | "expired" | "taken" | "error" | "loading";

interface StatusConfig {
  icon: React.ReactNode;
  title: string;
  description: string;
  cta?: { label: string; href: string };
  color: string;
}

const STATUS_CONFIG: Record<Exclude<AcceptStatus, "loading">, StatusConfig> = {
  success: {
    icon: <CheckCircle className="w-16 h-16 text-green-500" />,
    title: "Shift Confirmed",
    description:
      "You have been assigned to this shift. Your manager has been notified and will confirm the details. Check your schedule in the app for full shift information.",
    cta: { label: "View My Schedule", href: "/schedule" },
    color: "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30",
  },
  invalid: {
    icon: <XCircle className="w-16 h-16 text-destructive" />,
    title: "Invalid Link",
    description:
      "This accept link is not valid. It may have been corrupted or used from an old email. Please contact your supervisor if you believe this is an error.",
    color: "border-destructive/30 bg-destructive/5",
  },
  expired: {
    icon: <Clock className="w-16 h-16 text-orange-400" />,
    title: "Link Expired",
    description:
      "This shift offer has expired. Open-shift offers are time-limited to ensure rapid coverage. Contact your dispatcher for current availability.",
    cta: { label: "View Shift Marketplace", href: "/shift-marketplace" },
    color: "border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/30",
  },
  taken: {
    icon: <Users className="w-16 h-16 text-blue-400" />,
    title: "Shift Already Filled",
    description:
      "Another officer accepted this shift before you. The position is no longer available. Check the shift marketplace for other open opportunities.",
    cta: { label: "View Shift Marketplace", href: "/shift-marketplace" },
    color: "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30",
  },
  error: {
    icon: <AlertTriangle className="w-16 h-16 text-orange-400" />,
    title: "Something Went Wrong",
    description:
      "An unexpected error occurred while processing your acceptance. Please try again or contact your supervisor directly.",
    cta: { label: "Go to App", href: "/" },
    color: "border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/30",
  },
};

export default function ShiftAcceptPage() {
  const [status, setStatus] = useState<AcceptStatus>("loading");
  const [officerName, setOfficerName] = useState<string | null>(null);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get("status") as AcceptStatus | null;
    const officer = params.get("officer");
    if (officer) setOfficerName(decodeURIComponent(officer));
    if (s && s in STATUS_CONFIG) {
      setStatus(s);
    } else {
      setStatus("invalid");
    }
  }, []);

  if (status === "loading") {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm">Processing your response...</p>
        </div>
      </div>
    );
  }

  const config = STATUS_CONFIG[status];

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center p-6">
      {/* Header branding strip */}
      <div className="mb-10 flex flex-col items-center gap-1">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-md flex items-center justify-center text-sm font-black"
            style={{ background: "#0f172a", color: "#ffc83c" }}
          >
            C
          </div>
          <span className="font-semibold text-sm text-foreground tracking-wide">{PLATFORM_NAME}</span>
        </div>
        <p className="text-xs text-muted-foreground">Workforce Management Platform</p>
      </div>

      <Card className={`w-full max-w-md border ${config.color}`}>
        <CardContent className="pt-8 pb-8 flex flex-col items-center gap-5 text-center">
          {config.icon}

          <div className="space-y-2">
            <h1 className="text-xl font-bold text-foreground">
              {status === "success" && officerName
                ? `${config.title}, ${officerName}`
                : config.title}
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-sm">
              {config.description}
            </p>
          </div>

          {config.cta && (
            <Button
              variant="default"
              className="mt-2 w-full"
              data-testid="button-shift-accept-cta"
              onClick={() => setLocation(config.cta!.href)}
            >
              {config.cta.label}
            </Button>
          )}

          <p className="text-xs text-muted-foreground mt-1">
            Questions? Contact your supervisor or log in to view your schedule.
          </p>
        </CardContent>
      </Card>

      <p className="mt-8 text-xs text-muted-foreground">
        &copy; {new Date().getFullYear()} CoAIleague. This link is single-use and unique to you.
      </p>
    </div>
  );
}
