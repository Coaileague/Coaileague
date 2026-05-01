/**
 * FeatureUnavailable — shown when a feature returns 503 (not yet built).
 * Used by pages that call featureStubRoutes endpoints.
 */
import { Construction, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface FeatureUnavailableProps {
  feature: string;
  description?: string;
  eta?: string;
  contactSupport?: boolean;
}

export function FeatureUnavailable({
  feature,
  description,
  eta,
  contactSupport = false,
}: FeatureUnavailableProps) {
  return (
    <div className="flex items-center justify-center min-h-[40vh] p-6">
      <Card className="max-w-md w-full border-dashed">
        <CardContent className="pt-8 pb-8 text-center space-y-4">
          <div className="flex justify-center">
            <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Construction className="h-7 w-7 text-primary" />
            </div>
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-foreground">{feature}</h3>
            {eta && (
              <Badge variant="secondary" className="text-xs">
                Coming {eta}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">
            {description ||
              "This feature is in development and will be available soon. Your interest has been noted and helps us prioritize."}
          </p>
          {contactSupport && (
            <a
              href="/support"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Contact support for early access
              <ArrowRight className="h-3 w-3" />
            </a>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Hook to detect if a query error is a feature stub 503 */
export function isFeatureUnavailable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { status?: number; message?: string };
  return err.status === 503 || err.message?.includes("not yet available") === true;
}
