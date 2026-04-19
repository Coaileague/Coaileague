/**
 * Worker Panic Page — Readiness Section 10
 * =========================================
 * Dedicated standalone page so an officer can bookmark /worker/panic on
 * their home screen for instant access. Intentionally minimal chrome —
 * no distractions, no tabs, no stats. Just the button.
 */

import { useAuth } from "@/hooks/useAuth";
import { PanicButton } from "@/components/mobile/PanicButton";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";

export default function WorkerPanicPage(): JSX.Element {
  const { user } = useAuth();
  const name = (user as any)?.fullName || (user as any)?.email || null;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-red-50 to-white dark:from-red-950/40 dark:to-background">
      <Card className="w-full max-w-md border-red-200 dark:border-red-900">
        <CardContent className="pt-8 pb-8 flex flex-col items-center gap-6">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
            <AlertTriangle className="h-5 w-5" />
            <h1 className="text-lg font-semibold">Emergency SOS</h1>
          </div>
          <p className="text-sm text-center text-muted-foreground max-w-xs">
            This will notify your supervisor, Trinity, and dispatch
            immediately. GPS will be sent if available. For life-threatening
            emergencies, call <strong>911</strong> first.
          </p>
          <PanicButton employeeName={name} />
          <p className="text-xs text-muted-foreground text-center">
            Alerts are logged and cannot be retracted.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
