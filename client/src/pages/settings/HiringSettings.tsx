import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, ShieldCheck, Brain, Network } from "lucide-react";

interface HiringSettings {
  workspaceId: string;
  crossTenantScreeningEnabled: boolean;
  autoScoreOnApply: boolean;
  autoDeclineBelowScore: number | null;
  autoAdvanceAboveScore: number | null;
  licenseSponsorshipAvailable: boolean;
  defaultStateJurisdiction: string;
  updatedAt: string | null;
}

const STATE_CODES = ["TX", "FL", "CA", "NY", "GA", "NC", "AZ", "NV", "IL", "OH", "PA", "VA", "CO", "WA"];

export default function HiringSettingsPage() {
  // V1.1 Feature Flag
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <div className="text-center space-y-3 max-w-sm">
        <div className="text-4xl">🚧</div>
        <h2 className="text-lg font-semibold">Hiring Settings</h2>
        <p className="text-muted-foreground text-sm">
          Custom hiring configuration launches in V1.1. Your default settings are active.
        </p>
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/10 text-amber-600 rounded-full text-xs font-medium border border-amber-500/20">
          Coming in V1.1
        </div>
      </div>
    </div>
  );

  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<{ settings: HiringSettings }>({
    queryKey: ["/api/workspace/hiring-settings"],
  });

  const [form, setForm] = useState<HiringSettings | null>(null);

  useEffect(() => {
    if (data?.settings && !form) setForm(data.settings);
  }, [data, form]);

  const saveMutation = useMutation({
    mutationFn: async (payload: HiringSettings) => {
      const res = await apiRequest("PUT", "/api/workspace/hiring-settings", payload);
      if (!res.ok) throw new Error(`Save failed: ${res.status}`);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/workspace/hiring-settings"] });
      toast({ title: "Hiring settings saved", description: "Trinity will use these rules on the next application." });
    },
    onError: (err: any) => {
      toast({
        title: "Failed to save",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  if (isLoading || !form) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const handleThresholdChange = (field: 'autoDeclineBelowScore' | 'autoAdvanceAboveScore', raw: string) => {
    if (raw === '') {
      setForm({ ...form, [field]: null });
      return;
    }
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n)) return;
    setForm({ ...form, [field]: Math.max(0, Math.min(100, n)) });
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Brain className="w-6 h-6" />
          Trinity Scoring Engine
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure how Trinity evaluates applicants. All scores are recommendations —
          final hiring decisions rest with your management.
        </p>
      </div>

      {/* Auto-scoring */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5" />
            Auto-Scoring
          </CardTitle>
          <CardDescription>
            Runs immediately after an applicant submits. Score typically lands within 5 seconds.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Auto-score on apply</Label>
              <p className="text-xs text-muted-foreground">
                Trinity scores every new applicant automatically.
              </p>
            </div>
            <Switch
              checked={form.autoScoreOnApply}
              onCheckedChange={(v) => setForm({ ...form, autoScoreOnApply: v })}
              data-testid="switch-auto-score"
            />
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="auto-advance" className="text-sm font-medium">
                Auto-advance above score
              </Label>
              <p className="text-xs text-muted-foreground mb-2">
                Skip to Round 1 email when score ≥ this. Leave blank for manual review.
              </p>
              <Input
                id="auto-advance"
                type="number"
                min={0}
                max={100}
                placeholder="e.g. 80"
                value={form.autoAdvanceAboveScore ?? ''}
                onChange={(e) => handleThresholdChange('autoAdvanceAboveScore', e.target.value)}
                data-testid="input-auto-advance"
              />
            </div>
            <div>
              <Label htmlFor="auto-decline" className="text-sm font-medium">
                Auto-decline below score
              </Label>
              <p className="text-xs text-muted-foreground mb-2">
                Reject applicants under this score. Leave blank to never auto-decline.
              </p>
              <Input
                id="auto-decline"
                type="number"
                min={0}
                max={100}
                placeholder="e.g. 40"
                value={form.autoDeclineBelowScore ?? ''}
                onChange={(e) => handleThresholdChange('autoDeclineBelowScore', e.target.value)}
                data-testid="input-auto-decline"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Licensing context */}
      <Card>
        <CardHeader>
          <CardTitle>Licensing Context</CardTitle>
          <CardDescription>
            Tells Trinity how to weight unlicensed applicants and which state rules apply.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">License sponsorship available</Label>
              <p className="text-xs text-muted-foreground">
                If enabled, unlicensed applicants aren't disqualified — Trinity scores them for sponsorship tracks.
              </p>
            </div>
            <Switch
              checked={form.licenseSponsorshipAvailable}
              onCheckedChange={(v) => setForm({ ...form, licenseSponsorshipAvailable: v })}
              data-testid="switch-sponsorship"
            />
          </div>

          <div>
            <Label htmlFor="state" className="text-sm font-medium">Default state jurisdiction</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Used when a job posting doesn't override — drives state-specific licensing rules (e.g. Texas OC §1702).
            </p>
            <select
              id="state"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.defaultStateJurisdiction}
              onChange={(e) => setForm({ ...form, defaultStateJurisdiction: e.target.value })}
              data-testid="select-state"
            >
              {STATE_CODES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Cross-tenant network */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Network className="w-5 h-5" />
            Cross-Tenant Network Intelligence
          </CardTitle>
          <CardDescription>
            Reciprocal opt-in: share and receive anonymized terminated-employee signals across the CoAIleague network.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Label className="text-sm font-medium">Cross-tenant screening enabled</Label>
              <p className="text-xs text-muted-foreground mt-1">
                When an applicant's phone or email matches a terminated employee at another opted-in company, Trinity raises a flag for human review. Other companies are NEVER named and no termination reasons are shared. This flag is a referral for reference-check, not an adverse action.
              </p>
            </div>
            <Switch
              checked={form.crossTenantScreeningEnabled}
              onCheckedChange={(v) => setForm({ ...form, crossTenantScreeningEnabled: v })}
              data-testid="switch-cross-tenant"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button
          onClick={() => saveMutation.mutate(form)}
          disabled={saveMutation.isPending}
          data-testid="button-save-hiring-settings"
        >
          {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Save Settings
        </Button>
      </div>
    </div>
  );
}
