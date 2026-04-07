/**
 * PHASE 36 — Terms Acceptance Gate
 * Shows a re-acceptance prompt when terms version has changed.
 * Rendered in the authenticated layout to intercept users before they proceed.
 */

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Shield, FileText, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from "@/components/ui/dialog";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";

const PLATFORM_NAME = (import.meta.env.VITE_PLATFORM_NAME as string) || "CoAIleague";
const CURRENT_TERMS_VERSION = "1.0";
const CURRENT_PRIVACY_VERSION = "1.0";

// Public routes that should never show the terms gate
const PUBLIC_ROUTES = new Set([
  "/", "/login", "/privacy", "/terms", "/sms-terms",
  "/privacy-es", "/terms-es", "/cookie-policy", "/dpa",
]);

interface TermsStatusData {
  accepted: boolean;
  accepted_at: string | null;
  current_terms_version: string;
  current_privacy_version: string;
}

export function TermsAcceptanceGate() {
  const { user } = useAuth();
  const [location] = useLocation();
  const [accepted, setAccepted] = useState(false);

  const isPublicRoute = PUBLIC_ROUTES.has(location);

  const { data, isLoading } = useQuery<{ data: TermsStatusData }>({
    queryKey: ["/api/privacy/terms-status"],
    enabled: !!user && !isPublicRoute,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const acceptMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/privacy/terms-acceptance", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/privacy/terms-status"] });
      setAccepted(true);
    },
  });

  const needsAcceptance = !!user && !isPublicRoute && !isLoading && data?.data?.accepted === false && !accepted;

  // Release scroll lock when this gate unmounts (guards against Radix UI leak on iOS Safari)
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

  return (
    <Dialog open={needsAcceptance} onOpenChange={() => {}}>
      <DialogContent
        className="max-w-md"
        onPointerDownOutside={e => e.preventDefault()}
        onEscapeKeyDown={e => e.preventDefault()}
      >
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-5 h-5 text-primary" />
            <DialogTitle>Updated Terms of Service</DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-4 text-sm text-muted-foreground">
          <p>
            {PLATFORM_NAME} has updated its Terms of Service (v{CURRENT_TERMS_VERSION}) and Privacy Policy
            (v{CURRENT_PRIVACY_VERSION}). Please review and accept the updated terms to continue.
          </p>

          <div className="space-y-2 bg-muted/30 p-3 rounded-md">
            <a
              href="/terms"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 text-sm text-foreground hover:underline"
              data-testid="link-view-terms"
            >
              <FileText className="w-4 h-4 text-muted-foreground" />
              Terms of Service
              <ExternalLink className="w-3 h-3 text-muted-foreground" />
            </a>
            <a
              href="/privacy"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 text-sm text-foreground hover:underline"
              data-testid="link-view-privacy"
            >
              <Shield className="w-4 h-4 text-muted-foreground" />
              Privacy Policy
              <ExternalLink className="w-3 h-3 text-muted-foreground" />
            </a>
          </div>

          <p className="text-xs">
            By clicking "I Accept", you confirm that you have read, understood, and agree to the updated
            Terms of Service and Privacy Policy. Your acceptance will be recorded with the current timestamp
            and IP address.
          </p>
        </div>

        <Button
          className="w-full mt-4"
          onClick={() => acceptMutation.mutate()}
          disabled={acceptMutation.isPending}
          data-testid="button-accept-terms"
        >
          {acceptMutation.isPending ? "Recording acceptance..." : "I Accept"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
