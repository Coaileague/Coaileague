/**
 * PHASE 36 — Cookie Consent Banner
 * 3 categories: essential (always on), functional, analytics
 * Consent stored to DB per authenticated user; non-auth users get localStorage fallback
 * Withdrawal supported from Privacy Settings (this component also handles update mode)
 */

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Shield, X, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";

const PLATFORM_NAME = (import.meta.env.VITE_PLATFORM_NAME as string) || "CoAIleague";
const LS_KEY = "coai_cookie_consent";
const LS_DISMISSED_KEY = "coai_cookie_banner_dismissed";

interface CookieConsent {
  essential: boolean;
  functional: boolean;
  analytics: boolean;
  consented_at: string | null;
}

interface CookieBannerProps {
  mode?: "banner" | "settings"; // "banner" = bottom banner; "settings" = embedded preferences panel
  onSaved?: () => void;
}

export function CookieBanner({ mode = "banner", onSaved }: CookieBannerProps) {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [functional, setFunctional] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [visible, setVisible] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Load existing consent (authenticated users only)
  const { data: existingConsent } = useQuery<{ data: CookieConsent }>({
    queryKey: ["/api/privacy/cookie-consent"],
    enabled: !!user,
    retry: 1,
  });

  // Determine visibility on mount
  useEffect(() => {
    if (mode === "settings") {
      setVisible(true);
      return;
    }
    // Only show banner if never consented
    const dismissed = localStorage.getItem(LS_DISMISSED_KEY);
    if (dismissed) return;
    if (!user) {
      // Non-auth: check localStorage
      const lsConsent = localStorage.getItem(LS_KEY);
      if (!lsConsent) setVisible(true);
      return;
    }
    // Auth user: wait for query
    setVisible(false);
  }, [mode, user]);

  // Sync from DB consent
  useEffect(() => {
    if (!existingConsent?.data) return;
    const c = existingConsent.data;
    if (c.consented_at !== null) {
      // Already consented — don't show banner unless in settings mode
      if (mode === "banner") {
        setVisible(false);
        localStorage.setItem(LS_DISMISSED_KEY, "1");
      }
      setFunctional(c.functional);
      setAnalytics(c.analytics);
    } else {
      if (mode === "banner") setVisible(true);
    }
    setInitialized(true);
  }, [existingConsent, mode]);

  const saveMutation = useMutation({
    mutationFn: (prefs: { functional: boolean; analytics: boolean }) =>
      apiRequest("POST", "/api/privacy/cookie-consent", prefs),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/privacy/cookie-consent"] });
      if (mode === "banner") {
        setVisible(false);
        localStorage.setItem(LS_DISMISSED_KEY, "1");
      }
      onSaved?.();
    },
  });

  const handleAcceptAll = () => {
    setFunctional(true);
    setAnalytics(true);
    // Save to localStorage for non-auth
    localStorage.setItem(LS_KEY, JSON.stringify({ essential: true, functional: true, analytics: true }));
    if (user) {
      saveMutation.mutate({ functional: true, analytics: true });
    } else {
      if (mode === "banner") {
        setVisible(false);
        localStorage.setItem(LS_DISMISSED_KEY, "1");
      }
      onSaved?.();
    }
  };

  const handleEssentialOnly = () => {
    setFunctional(false);
    setAnalytics(false);
    localStorage.setItem(LS_KEY, JSON.stringify({ essential: true, functional: false, analytics: false }));
    if (user) {
      saveMutation.mutate({ functional: false, analytics: false });
    } else {
      if (mode === "banner") {
        setVisible(false);
        localStorage.setItem(LS_DISMISSED_KEY, "1");
      }
      onSaved?.();
    }
  };

  const handleSavePreferences = () => {
    localStorage.setItem(LS_KEY, JSON.stringify({ essential: true, functional, analytics }));
    if (user) {
      saveMutation.mutate({ functional, analytics });
    } else {
      if (mode === "banner") {
        setVisible(false);
        localStorage.setItem(LS_DISMISSED_KEY, "1");
      }
      onSaved?.();
    }
  };

  if (!visible && mode === "banner") return null;

  // ── Settings mode ──────────────────────────────────────────────────────────
  if (mode === "settings") {
    return (
      <div className="space-y-6" data-testid="cookie-settings-panel">
        <p className="text-sm text-muted-foreground">
          Manage your cookie preferences below. Essential cookies are always active and cannot be disabled.
        </p>

        <div className="space-y-4">
          <CookieCategory
            title="Essential"
            description="Required for authentication, session management, and core platform functionality. Cannot be disabled."
            enabled={true}
            locked
            testId="cookie-essential"
          />
          <CookieCategory
            title="Functional"
            description="Remembers your preferences such as sidebar state, theme, table column widths, and language settings."
            enabled={functional}
            onChange={setFunctional}
            testId="cookie-functional"
          />
          <CookieCategory
            title="Analytics"
            description={`Helps us understand how features are used so we can improve ${PLATFORM_NAME}. All data is anonymized and never sold.`}
            enabled={analytics}
            onChange={setAnalytics}
            testId="cookie-analytics"
          />
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button
            onClick={handleSavePreferences}
            disabled={saveMutation.isPending}
            data-testid="button-save-cookie-preferences"
          >
            Save Preferences
          </Button>
          <Button variant="outline" onClick={handleAcceptAll} data-testid="button-accept-all-cookies">
            Accept All
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          See our{" "}
          <Link href="/privacy" className="underline hover:text-foreground">Privacy Policy</Link>{" "}
          for more details. You can change these preferences at any time from{" "}
          <Link href="/end-user-controls" className="underline hover:text-foreground">Privacy Settings</Link>.
        </p>
      </div>
    );
  }

  // ── Banner mode ────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[9999] bg-card border-t border-border shadow-lg"
      role="dialog"
      aria-label="Cookie consent banner"
      data-testid="cookie-consent-banner"
    >
      <div className="max-w-7xl mx-auto p-4">
        <div className="flex items-start gap-3 flex-wrap">
          <Shield className="w-5 h-5 text-primary mt-0.5 shrink-0" />

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">We use cookies to improve your experience</p>
            <p className="text-sm text-muted-foreground mt-1">
              Essential cookies keep {PLATFORM_NAME} running. Functional and analytics cookies help us improve the platform.
              Read our{" "}
              <Link href="/privacy" className="underline hover:text-foreground">Privacy Policy</Link>.
            </p>

            {expanded && (
              <div className="mt-4 space-y-3">
                <CookieCategory
                  title="Essential"
                  description="Authentication, sessions, security. Always active."
                  enabled={true}
                  locked
                  testId="cookie-banner-essential"
                />
                <CookieCategory
                  title="Functional"
                  description="Saves your sidebar state, theme, and other preferences."
                  enabled={functional}
                  onChange={setFunctional}
                  testId="cookie-banner-functional"
                />
                <CookieCategory
                  title="Analytics"
                  description="Anonymized usage data to improve features. Never sold."
                  enabled={analytics}
                  onChange={setAnalytics}
                  testId="cookie-banner-analytics"
                />
              </div>
            )}

            <button
              className="flex items-center gap-1 mt-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setExpanded(e => !e)}
              data-testid="button-cookie-customize"
            >
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {expanded ? "Hide preferences" : "Customize preferences"}
            </button>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {expanded ? (
              <Button
                size="sm"
                onClick={handleSavePreferences}
                disabled={saveMutation.isPending}
                data-testid="button-save-cookie-custom"
              >
                Save
              </Button>
            ) : null}
            <Button variant="outline" size="sm" onClick={handleEssentialOnly} data-testid="button-cookie-essential-only">
              Essential only
            </Button>
            <Button size="sm" onClick={handleAcceptAll} data-testid="button-cookie-accept-all">
              Accept all
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Category row ───────────────────────────────────────────────────────────────

interface CookieCategoryProps {
  title: string;
  description: string;
  enabled: boolean;
  locked?: boolean;
  onChange?: (v: boolean) => void;
  testId: string;
}

function CookieCategory({ title, description, enabled, locked, onChange, testId }: CookieCategoryProps) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-md bg-muted/30" data-testid={`${testId}-row`}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium flex items-center gap-2">
          {title}
          {locked && (
            <span className="text-xs font-normal text-muted-foreground">(always active)</span>
          )}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <Switch
        checked={enabled}
        disabled={locked}
        onCheckedChange={onChange}
        data-testid={`switch-${testId}`}
        aria-label={`${title} cookies`}
      />
    </div>
  );
}
