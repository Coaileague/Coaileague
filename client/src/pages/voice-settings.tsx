import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Phone, Settings2, BarChart3, PhoneCall,
  PhoneOff, CheckCircle, RefreshCw, Save, Clock, Activity
} from "lucide-react";

interface PhoneNumber {
  id: string;
  phoneNumber: string;
  friendlyName?: string;
  isActive: boolean;
  isPrimary: boolean;
  extensionConfig?: Record<string, boolean>;
  greetingScript?: string;
  greetingScriptEs?: string;
  monthlyRentCents: number;
  createdAt: string;
}

interface Analytics {
  totalCalls: number;
  completedCalls: number;
  avgDurationSec: number;
  totalSpentCents: number;
  byExtension: Record<string, number>;
}

function formatDollars(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

const EXTENSION_LABELS: Record<string, string> = {
  sales: "Sales",
  client_support: "Client Support",
  employment_verification: "Employment Verification",
  staff: "Staff",
  emergency: "Emergency",
  careers: "Careers",
};

const EXTENSION_NUMBERS: Record<string, number> = {
  sales: 1,
  client_support: 2,
  employment_verification: 3,
  staff: 4,
  emergency: 5,
  careers: 6,
};

export default function VoiceSettingsPage() {
  const { toast } = useToast();

  const { data: numbersData, isLoading: numbersLoading } = useQuery<{ numbers: PhoneNumber[] }>({
    queryKey: ["/api/voice/numbers"],
  });

  const { data: analyticsData, isLoading: analyticsLoading } = useQuery<Analytics>({
    queryKey: ["/api/voice/analytics"],
  });

  const { data: callsData, isLoading: callsLoading } = useQuery<{ calls: any[] }>({
    queryKey: ["/api/voice/calls"],
  });

  const numbers = numbersData?.numbers || [];
  const analytics = analyticsData;
  const recentCalls = callsData?.calls?.slice(0, 20) || [];

  const [extConfig, setExtConfig] = useState<Record<string, Record<string, boolean>>>({});
  const [greetingScript, setGreetingScript] = useState<Record<string, string>>({});
  const [greetingScriptEs, setGreetingScriptEs] = useState<Record<string, string>>({});

  useEffect(() => {
    if (numbers.length > 0) {
      const cfg: Record<string, Record<string, boolean>> = {};
      const gs: Record<string, string> = {};
      const gses: Record<string, string> = {};
      for (const num of numbers) {
        cfg[num.id] = {};
        for (const key of Object.keys(EXTENSION_LABELS)) {
          cfg[num.id][key] = num.extensionConfig?.[key] !== false;
        }
        gs[num.id] = num.greetingScript || "";
        gses[num.id] = num.greetingScriptEs || "";
      }
      setExtConfig(cfg);
      setGreetingScript(gs);
      setGreetingScriptEs(gses);
    }
  }, [numbersData]);

  const updateNumberMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: object }) =>
      apiRequest("PATCH", `/api/voice/numbers/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/voice/numbers"] });
      toast({ title: "Settings saved" });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const handleExtToggle = (numberId: string, extKey: string, value: boolean) => {
    const updated = { ...extConfig[numberId], [extKey]: value };
    setExtConfig(prev => ({ ...prev, [numberId]: updated }));
    updateNumberMutation.mutate({ id: numberId, payload: { extensionConfig: updated } });
  };

  const handleSaveScript = (numberId: string) => {
    updateNumberMutation.mutate({
      id: numberId,
      payload: {
        greetingScript: greetingScript[numberId],
        greetingScriptEs: greetingScriptEs[numberId],
      },
    });
  };

  const primaryNumber = numbers.find(n => n.isPrimary) || numbers[0];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Phone className="h-6 w-6" />
          Trinity Voice Phone System
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your AI-powered phone system and extension settings. Voice usage is included in your plan.
        </p>
      </div>

      {/* Phone Numbers */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4" />
              <CardTitle className="text-base">Phone Numbers</CardTitle>
            </div>
            <Badge variant="outline">
              {numbersLoading ? "..." : `${numbers.length} number${numbers.length !== 1 ? "s" : ""}`}
            </Badge>
          </div>
          <CardDescription>Twilio phone numbers answered by Trinity</CardDescription>
        </CardHeader>
        <CardContent>
          {numbersLoading ? (
            <div className="space-y-2">
              {[1, 2].map(i => <div key={i} className="h-16 bg-muted rounded-md animate-pulse" />)}
            </div>
          ) : numbers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <PhoneOff className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No phone numbers configured yet.</p>
              <p className="text-xs mt-1">Contact support to provision a Twilio number.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {numbers.map(num => (
                <div
                  key={num.id}
                  data-testid={`card-phone-${num.id}`}
                  className="flex items-center justify-between p-3 rounded-md border gap-4 flex-wrap"
                >
                  <div className="flex items-center gap-3">
                    <div className={`h-2 w-2 rounded-full ${num.isActive ? "bg-green-500" : "bg-muted"}`} />
                    <div>
                      <p className="font-mono text-sm font-medium" data-testid={`text-phone-${num.id}`}>
                        {num.phoneNumber}
                      </p>
                      <p className="text-xs text-muted-foreground">{num.friendlyName || "Voice Line"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {num.isPrimary && <Badge variant="secondary">Primary</Badge>}
                    {num.isActive ? (
                      <Badge variant="outline" className="text-green-600 border-green-200">
                        <CheckCircle className="h-3 w-3 mr-1" /> Active
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>
                    )}
                    <span className="text-xs text-muted-foreground">{formatDollars(num.monthlyRentCents)}/mo</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Extension Configuration */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            <CardTitle className="text-base">Extension Configuration</CardTitle>
          </div>
          <CardDescription>Control which IVR extensions are available to callers</CardDescription>
        </CardHeader>
        <CardContent>
          {numbersLoading ? (
            <div className="h-32 bg-muted rounded-md animate-pulse" />
          ) : numbers.length === 0 || !primaryNumber ? (
            <p className="text-sm text-muted-foreground">No phone numbers configured.</p>
          ) : (
            <div className="space-y-1">
              {Object.entries(EXTENSION_LABELS).map(([key, label]) => {
                const enabled = extConfig[primaryNumber.id]?.[key] !== false;
                return (
                  <div key={key} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <p className="text-sm font-medium">{label}</p>
                      <p className="text-xs text-muted-foreground">Press {EXTENSION_NUMBERS[key]}</p>
                    </div>
                    <Switch
                      data-testid={`switch-ext-${key}`}
                      checked={enabled}
                      onCheckedChange={val => handleExtToggle(primaryNumber.id, key, val)}
                      disabled={updateNumberMutation.isPending}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Persona Script */}
      {primaryNumber && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <PhoneCall className="h-4 w-4" />
              <CardTitle className="text-base">Greeting Script</CardTitle>
            </div>
            <CardDescription>Customize the opening message Trinity reads to callers</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="greeting-en" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  English
                </Label>
                <Textarea
                  id="greeting-en"
                  data-testid="textarea-greeting-en"
                  rows={3}
                  placeholder="Thank you for calling. Please press 1 for Sales, 2 for Client Support..."
                  value={greetingScript[primaryNumber.id] || ""}
                  onChange={e => setGreetingScript(prev => ({ ...prev, [primaryNumber.id]: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="greeting-es" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Spanish (Español)
                </Label>
                <Textarea
                  id="greeting-es"
                  data-testid="textarea-greeting-es"
                  rows={3}
                  placeholder="Gracias por llamar. Por favor presione 1 para Ventas, 2 para Soporte al Cliente..."
                  value={greetingScriptEs[primaryNumber.id] || ""}
                  onChange={e => setGreetingScriptEs(prev => ({ ...prev, [primaryNumber.id]: e.target.value }))}
                />
              </div>
              <Button
                data-testid="button-save-script"
                onClick={() => handleSaveScript(primaryNumber.id)}
                disabled={updateNumberMutation.isPending}
              >
                {updateNumberMutation.isPending ? (
                  <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Saving...</>
                ) : (
                  <><Save className="h-4 w-4 mr-2" />Save Script</>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Voice Analytics */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            <CardTitle className="text-base">Voice Analytics</CardTitle>
          </div>
          <CardDescription>Call volume, routing, and usage — included in your plan</CardDescription>
        </CardHeader>
        <CardContent>
          {analyticsLoading ? (
            <div className="h-24 bg-muted rounded-md animate-pulse" />
          ) : !analytics ? (
            <p className="text-sm text-muted-foreground">No analytics data available yet.</p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-muted/40 rounded-md">
                  <p className="text-xs text-muted-foreground">Total Calls</p>
                  <p className="text-2xl font-bold" data-testid="text-total-calls">{analytics.totalCalls}</p>
                </div>
                <div className="p-3 bg-muted/40 rounded-md">
                  <p className="text-xs text-muted-foreground">Completed</p>
                  <p className="text-2xl font-bold">{analytics.completedCalls}</p>
                </div>
                <div className="p-3 bg-muted/40 rounded-md">
                  <p className="text-xs text-muted-foreground">Avg Duration</p>
                  <p className="text-2xl font-bold">{formatDuration(analytics.avgDurationSec)}</p>
                </div>
                <div className="p-3 bg-muted/40 rounded-md">
                  <p className="text-xs text-muted-foreground">Usage Value</p>
                  <p className="text-2xl font-bold">{formatDollars(analytics.totalSpentCents)}</p>
                </div>
              </div>

              {Object.keys(analytics.byExtension).length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Calls by Extension</p>
                  <div className="space-y-1.5">
                    {Object.entries(analytics.byExtension)
                      .sort(([, a], [, b]) => b - a)
                      .map(([ext, count]) => (
                        <div key={ext} className="flex items-center gap-2" data-testid={`ext-stat-${ext}`}>
                          <div className="w-36 text-xs">{EXTENSION_LABELS[ext] || ext}</div>
                          <div className="flex-1 bg-muted rounded-full h-2">
                            <div
                              className="bg-primary h-2 rounded-full"
                              style={{ width: `${analytics.totalCalls > 0 ? Math.round((count / analytics.totalCalls) * 100) : 0}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground w-6 text-right">{count}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Call History */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" />
            Recent Call History
          </CardTitle>
          <CardDescription>Last 20 inbound calls handled by Trinity</CardDescription>
        </CardHeader>
        <CardContent>
          {callsLoading ? (
            <div className="h-24 flex flex-col items-center justify-center text-sm text-muted-foreground space-y-2">
              <Clock className="h-6 w-6 opacity-50 animate-pulse" />
              <div className="text-center">
                <p className="font-medium text-foreground">Loading recent call history</p>
                <p className="text-xs text-muted-foreground">Pulling the latest Trinity-handled inbound calls.</p>
              </div>
            </div>
          ) : recentCalls.length === 0 ? (
            <div className="text-center py-6 text-sm text-muted-foreground space-y-2">
              <PhoneCall className="h-8 w-8 mx-auto opacity-50" />
              <p className="font-medium text-foreground">No calls recorded yet</p>
              <p>Call history will appear here after Trinity answers your first inbound calls.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Caller</th>
                    <th className="pb-2 pr-4 font-medium">Extension</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 pr-4 font-medium">Duration</th>
                    <th className="pb-2 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recentCalls.map((call: any) => (
                    <tr key={call.id} data-testid={`row-call-${call.id}`} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-mono text-xs">{call.callerNumber || '—'}</td>
                      <td className="py-2 pr-4">{call.extensionLabel || '—'}</td>
                      <td className="py-2 pr-4">
                        <Badge variant={call.status === 'completed' ? 'default' : 'secondary'} className="text-xs">
                          {call.status || 'unknown'}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {call.durationSeconds ? `${Math.floor(call.durationSeconds / 60)}m ${call.durationSeconds % 60}s` : '—'}
                      </td>
                      <td className="py-2 text-muted-foreground text-xs">
                        {call.startedAt ? new Date(call.startedAt).toLocaleString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Plan Notice */}
      <Card>
        <CardContent className="flex items-center gap-3 py-4">
          <Activity className="h-5 w-5 text-muted-foreground flex-shrink-0" />
          <p className="text-sm text-muted-foreground">
            Voice calls are included in your CoAIleague plan. Usage is tracked for your records and any applicable tier overages are billed automatically at the end of your billing cycle. See your <a href="/billing" className="text-foreground underline underline-offset-2">Billing</a> page for plan details.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
