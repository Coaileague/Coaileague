import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { sanitizeRichHtml } from "@/lib/sanitize";
import { CONTACTS, DOMAINS } from "@shared/platformConfig";
import { Mail, Users, Building2, BarChart3, CircleDollarSign, AlertTriangle, CheckCircle, Settings2, Forward, Pen, Bold, Italic, Underline, Link } from "lucide-react";

interface EmailAddress {
  id: string;
  address: string;
  local_part: string;
  display_name: string;
  address_type: string;
  is_active: boolean;
  billing_seat_id: string | null;
  fair_use_monthly_limit: number;
  emails_sent_this_period: number;
  emails_received_this_period: number;
  user_email?: string;
  first_name?: string;
  last_name?: string;
  client_name?: string;
}

interface AddressSettings {
  id: string;
  address: string;
  display_name: string | null;
  address_type: string;
  forwarding_address: string | null;
  forwarding_enabled: boolean;
  signature_text: string | null;
  signature_html: string | null;
}

interface ManagementData {
  addresses: EmailAddress[];
  summary: {
    totalAddresses: number;
    activeSeats: number;
    monthlyCostCents: number;
    perSeatMonthlyCents: number;
    fairUseEmailsPerSeat: number;
  };
}

// ─── Rich Text Signature Editor ──────────────────────────────────────────────
function RichSignatureEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (html: string, text: string) => void;
}) {
  const editorRef = useRef<HTMLDivElement>(null);

  // Initialise editor content once on mount — sanitize server-supplied value
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = sanitizeRichHtml(value || '');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const syncChange = useCallback(() => {
    if (editorRef.current) {
      const clean = sanitizeRichHtml(editorRef.current.innerHTML);
      onChange(clean, editorRef.current.textContent || '');
    }
  }, [onChange]);

  const execFormat = useCallback((command: string, val?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, val);
    syncChange();
  }, [syncChange]);

  const handleInput = useCallback(() => {
    syncChange();
  }, [syncChange]);

  const handleLink = useCallback(() => {
    const url = window.prompt('Enter URL:', 'https://');
    if (url) execFormat('createLink', url);
  }, [execFormat]);

  return (
    <div className="border rounded-md overflow-hidden focus-within:ring-2 focus-within:ring-ring">
      <div className="flex items-center gap-0.5 p-1.5 border-b bg-muted/30">
        <Button variant="ghost" size="icon" className="h-7 w-7" type="button"
          onClick={() => execFormat('bold')} title="Bold" data-testid="button-sig-bold">
          <Bold className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" type="button"
          onClick={() => execFormat('italic')} title="Italic" data-testid="button-sig-italic">
          <Italic className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" type="button"
          onClick={() => execFormat('underline')} title="Underline" data-testid="button-sig-underline">
          <Underline className="w-3.5 h-3.5" />
        </Button>
        <Separator orientation="vertical" className="h-5 mx-1" />
        <Button variant="ghost" size="icon" className="h-7 w-7" type="button"
          onClick={handleLink} title="Insert Link" data-testid="button-sig-link">
          <Link className="w-3.5 h-3.5" />
        </Button>
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        className="min-h-[100px] p-3 text-sm focus:outline-none"
        style={{ wordBreak: 'break-word' }}
        data-testid="editor-signature-html"
      />
    </div>
  );
}

// ─── Per-Address Settings Dialog ─────────────────────────────────────────────
function AddressSettingsDialog({
  addressId,
  onClose,
}: {
  addressId: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery<AddressSettings>({
    queryKey: [`/api/email/addresses/${addressId}/settings`],
    enabled: !!addressId,
  });

  const [forwardingEnabled, setForwardingEnabled] = useState(false);
  const [forwardingAddress, setForwardingAddress] = useState("");
  const [signatureText, setSignatureText] = useState("");
  const [signatureHtml, setSignatureHtml] = useState("");
  const [displayName, setDisplayName] = useState("");

  // Sync local state when settings load — runs once when data arrives
  const [initialized, setInitialized] = useState(false);
  // Hook law: all hooks unconditionally above this line — conditional logic below
  if (settings && !initialized) {
    setForwardingEnabled(settings.forwarding_enabled ?? false);
    setForwardingAddress(settings.forwarding_address ?? "");
    setSignatureText(settings.signature_text ?? "");
    setSignatureHtml(settings.signature_html ?? "");
    setDisplayName(settings.display_name ?? "");
    setInitialized(true);
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest("PUT", `/api/email/addresses/${addressId}/settings`, {
        forwarding_address: forwardingAddress || null,
        forwarding_enabled: forwardingEnabled,
        signature_text: signatureText || null,
        signature_html: signatureHtml || null,
        display_name: displayName || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/management"] });
      queryClient.invalidateQueries({ queryKey: [`/api/email/addresses/${addressId}/settings`] });
      toast({ title: "Settings saved", description: "Email address settings updated." });
      onClose();
    },
    onError: () => {
      toast({ title: "Failed to save settings", variant: "destructive" });
    },
  });

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="w-4 h-4" />
            Email Address Settings
          </DialogTitle>
          {settings?.address && (
            <DialogDescription className="font-mono text-xs">
              {settings.address}
            </DialogDescription>
          )}
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3 py-4">
            {[1, 2, 3].map(i => <div key={i} className="h-8 bg-muted animate-pulse rounded" />)}
          </div>
        ) : (
          <Tabs defaultValue="forwarding" className="w-full">
            <TabsList className="w-full">
              <TabsTrigger value="forwarding" className="flex-1 gap-1.5">
                <Forward className="w-3.5 h-3.5" />
                Forwarding
              </TabsTrigger>
              <TabsTrigger value="signature" className="flex-1 gap-1.5">
                <Pen className="w-3.5 h-3.5" />
                Signature
              </TabsTrigger>
            </TabsList>

            {/* ─── Forwarding Tab ─── */}
            <TabsContent value="forwarding" className="space-y-4 mt-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Enable Forwarding</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Forward a copy of all inbound emails to an external address
                  </p>
                </div>
                <Switch
                  checked={forwardingEnabled}
                  onCheckedChange={setForwardingEnabled}
                  data-testid="switch-forwarding-enabled"
                />
              </div>

              {forwardingEnabled && (
                <div className="space-y-1.5">
                  <Label htmlFor="fwd-address" className="text-sm">Forward to address</Label>
                  <Input
                    id="fwd-address"
                    type="email"
                    placeholder="personal@gmail.com"
                    value={forwardingAddress}
                    onChange={(e) => setForwardingAddress(e.target.value)}
                    data-testid="input-forwarding-address"
                  />
                  <p className="text-xs text-muted-foreground">
                    Emails will be forwarded as inline HTML so you can read and interact with them.
                    A copy is always kept in your CoAIleague inbox.
                  </p>
                </div>
              )}

              <Separator />

              <div className="space-y-1.5">
                <Label htmlFor="display-name" className="text-sm">Display Name</Label>
                <Input
                  id="display-name"
                  placeholder="John Smith — VP Sales"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  data-testid="input-display-name"
                />
                <p className="text-xs text-muted-foreground">
                  Shown as the sender name when you send emails from this address
                </p>
              </div>
            </TabsContent>

            {/* ─── Signature Tab ─── */}
            <TabsContent value="signature" className="space-y-4 mt-4">
              <div className="space-y-1.5">
                <Label htmlFor="sig-text" className="text-sm">Plain Text Signature</Label>
                <Textarea
                  id="sig-text"
                  placeholder={"John Smith\nVP Sales\nAcme Corp\njohn@slug.coaileague.com\n(555) 123-4567"}
                  className="font-mono text-xs resize-none"
                  rows={5}
                  value={signatureText}
                  onChange={(e) => setSignatureText(e.target.value)}
                  data-testid="textarea-signature-text"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm">HTML Signature</Label>
                <RichSignatureEditor
                  value={signatureHtml}
                  onChange={(html, text) => {
                    setSignatureHtml(html);
                    if (!signatureText) setSignatureText(text);
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  When provided, the HTML signature is appended to outbound emails. Plain text is
                  used for text-only email clients.
                </p>
              </div>

              {(signatureText || signatureHtml) && (
                <div className="rounded-md border p-3 bg-muted/30">
                  <p className="text-xs text-muted-foreground mb-1 font-medium">Preview:</p>
                  {signatureHtml ? (
                    <div
                      className="text-sm"
                      dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(signatureHtml) }}
                    />
                  ) : (
                    <pre className="text-xs whitespace-pre-wrap text-foreground">
                      {signatureText}
                    </pre>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || isLoading}
            data-testid="button-save-address-settings"
          >
            {saveMutation.isPending ? "Saving…" : "Save Settings"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function EmailManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activating, setActivating] = useState<string | null>(null);
  const [settingsAddressId, setSettingsAddressId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<ManagementData>({
    queryKey: ["/api/email/management"],
  });

  const { data: stats } = useQuery<{
    billedSeats: number;
    monthlyCostCents: number;
    emailsSent: number;
    emailsReceived: number;
    approachingLimit: number;
  }>({
    queryKey: ["/api/email/management/stats"],
  });

  const activateMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/email/addresses/${id}/activate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/management"] });
      queryClient.invalidateQueries({ queryKey: ["/api/email/management/stats"] });
      toast({ title: "Email seat activated", description: "$3/month billing starts now." });
      setActivating(null);
    },
    onError: () => {
      toast({ title: "Failed to activate", variant: "destructive" });
      setActivating(null);
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/email/addresses/${id}/deactivate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/management"] });
      queryClient.invalidateQueries({ queryKey: ["/api/email/management/stats"] });
      toast({ title: "Email seat deactivated" });
      setActivating(null);
    },
    onError: () => {
      toast({ title: "Failed to deactivate", variant: "destructive" });
      setActivating(null);
    },
  });

  const activateAllMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/email/activate-all"),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/management"] });
      queryClient.invalidateQueries({ queryKey: ["/api/email/management/stats"] });
      toast({ title: `Activated ${res.activated} email seats` });
    },
  });

  const handleToggle = (addr: EmailAddress, checked: boolean) => {
    setActivating(addr.id);
    if (checked) {
      activateMutation.mutate(addr.id);
    } else {
      deactivateMutation.mutate(addr.id);
    }
  };

  const systemAddresses = data?.addresses.filter(a => a.address_type === 'workspace_system') ?? [];
  const userAddresses   = data?.addresses.filter(a => a.address_type === 'user_personal') ?? [];
  const clientAddresses = data?.addresses.filter(a => a.address_type === 'user_client') ?? [];

  const formatCents = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  const usageColor = (sent: number, limit: number) => {
    const pct = sent / limit;
    if (pct >= 1) return "text-destructive";
    if (pct >= 0.8) return "text-yellow-500 dark:text-yellow-400";
    return "text-muted-foreground";
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        {[1,2,3].map(i => <div key={i} className="h-24 bg-muted animate-pulse rounded-md" />)}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold" data-testid="text-email-management-title">Email Management</h1>
        <p className="text-muted-foreground mt-1">
          Managed business email at {formatCents(data?.summary.perSeatMonthlyCents ?? 300)}/seat/month.
          50% cheaper than Google Workspace — includes Trinity AI inbox assistant.
        </p>
      </div>

      {/* Overview stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <CircleDollarSign className="w-4 h-4" />
              Monthly cost
            </div>
            <div className="text-2xl font-semibold" data-testid="text-monthly-cost">
              {formatCents(stats?.monthlyCostCents ?? 0)}
            </div>
            <div className="text-xs text-muted-foreground">{stats?.billedSeats ?? 0} active seats</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Mail className="w-4 h-4" />
              Emails sent
            </div>
            <div className="text-2xl font-semibold" data-testid="text-emails-sent">{stats?.emailsSent ?? 0}</div>
            <div className="text-xs text-muted-foreground">this month</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Mail className="w-4 h-4" />
              Emails received
            </div>
            <div className="text-2xl font-semibold" data-testid="text-emails-received">{stats?.emailsReceived ?? 0}</div>
            <div className="text-xs text-muted-foreground">this month</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <AlertTriangle className="w-4 h-4" />
              Near limit
            </div>
            <div className="text-2xl font-semibold" data-testid="text-near-limit">{stats?.approachingLimit ?? 0}</div>
            <div className="text-xs text-muted-foreground">addresses ≥80% used</div>
          </CardContent>
        </Card>
      </div>

      {/* System Addresses */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              System Addresses
            </CardTitle>
            <CardDescription>Always active — auto-handled by Trinity. No cost.</CardDescription>
          </div>
          <Badge variant="secondary">{systemAddresses.length} addresses</Badge>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {systemAddresses.map(addr => (
              <div
                key={addr.id}
                data-testid={`row-system-email-${addr.id}`}
                className="flex flex-wrap items-center justify-between gap-2 py-2 border-b last:border-0"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{addr.address}</p>
                  <p className="text-xs text-muted-foreground">{addr.display_name} — Auto-handled by Trinity</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs ${usageColor(addr.emails_received_this_period, addr.fair_use_monthly_limit)}`}>
                    {addr.emails_received_this_period}/{addr.fair_use_monthly_limit} received
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Always on
                  </Badge>
                </div>
              </div>
            ))}
            {systemAddresses.length === 0 && (
              <p className="text-sm text-muted-foreground">No system addresses provisioned yet.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Officer Addresses */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4" />
              Officer Email Addresses
            </CardTitle>
            <CardDescription>
              {userAddresses.filter(a => a.is_active).length} active ×{" "}
              {formatCents(data?.summary.perSeatMonthlyCents ?? 300)} ={" "}
              {formatCents((userAddresses.filter(a => a.is_active).length) * (data?.summary.perSeatMonthlyCents ?? 300))}/month
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            data-testid="button-activate-all-officers"
            onClick={() => activateAllMutation.mutate()}
            disabled={activateAllMutation.isPending}
          >
            Activate All
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {userAddresses.map(addr => (
              <div
                key={addr.id}
                data-testid={`row-officer-email-${addr.id}`}
                className="flex flex-wrap items-center justify-between gap-2 py-2 border-b last:border-0"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{addr.address}</p>
                  <p className="text-xs text-muted-foreground">
                    {addr.first_name} {addr.last_name}
                    {addr.user_email && ` · ${addr.user_email}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {addr.is_active && (
                    <span className={`text-xs ${usageColor(addr.emails_sent_this_period, addr.fair_use_monthly_limit)}`}>
                      {addr.emails_sent_this_period}/{addr.fair_use_monthly_limit}
                    </span>
                  )}
                  {addr.is_active && (
                    <span className="text-xs text-muted-foreground">
                      {formatCents(data?.summary.perSeatMonthlyCents ?? 300)}/mo
                    </span>
                  )}
                  <Badge variant={addr.is_active ? "default" : "outline"} className="text-xs">
                    {addr.is_active ? "Active" : "Inactive"}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    data-testid={`button-officer-settings-${addr.id}`}
                    onClick={() => setSettingsAddressId(addr.id)}
                  >
                    <Settings2 className="w-3.5 h-3.5" />
                  </Button>
                  <Switch
                    data-testid={`switch-officer-email-${addr.id}`}
                    checked={addr.is_active}
                    disabled={activating === addr.id}
                    onCheckedChange={(checked) => handleToggle(addr, checked)}
                  />
                </div>
              </div>
            ))}
            {userAddresses.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No officer addresses yet. Add officers to reserve their @{DOMAINS.root} address.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Client Addresses */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Client Email Addresses
            </CardTitle>
            <CardDescription>
              {clientAddresses.filter(a => a.is_active).length} active ×{" "}
              {formatCents(data?.summary.perSeatMonthlyCents ?? 300)} ={" "}
              {formatCents((clientAddresses.filter(a => a.is_active).length) * (data?.summary.perSeatMonthlyCents ?? 300))}/month
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {clientAddresses.map(addr => (
              <div
                key={addr.id}
                data-testid={`row-client-email-${addr.id}`}
                className="flex flex-wrap items-center justify-between gap-2 py-2 border-b last:border-0"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{addr.address}</p>
                  <p className="text-xs text-muted-foreground">{addr.client_name || "Client"}</p>
                </div>
                <div className="flex items-center gap-3">
                  {addr.is_active && (
                    <span className="text-xs text-muted-foreground">
                      {formatCents(data?.summary.perSeatMonthlyCents ?? 300)}/mo
                    </span>
                  )}
                  <Badge variant={addr.is_active ? "default" : "outline"} className="text-xs">
                    {addr.is_active ? "Active" : "Inactive"}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    data-testid={`button-client-settings-${addr.id}`}
                    onClick={() => setSettingsAddressId(addr.id)}
                  >
                    <Settings2 className="w-3.5 h-3.5" />
                  </Button>
                  <Switch
                    data-testid={`switch-client-email-${addr.id}`}
                    checked={addr.is_active}
                    disabled={activating === addr.id}
                    onCheckedChange={(checked) => handleToggle(addr, checked)}
                  />
                </div>
              </div>
            ))}
            {clientAddresses.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No client addresses yet. Add clients to reserve their dedicated email address.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Usage and Billing Summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Usage and Billing
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Active seats</span>
            <span className="font-medium" data-testid="text-active-seats">{stats?.billedSeats ?? 0}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Per seat</span>
            <span className="font-medium">{formatCents(data?.summary.perSeatMonthlyCents ?? 300)}/month</span>
          </div>
          <Separator />
          <div className="flex justify-between text-sm font-medium">
            <span>Monthly email cost</span>
            <span data-testid="text-total-monthly-cost">{formatCents(stats?.monthlyCostCents ?? 0)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Fair use included</span>
            <span>{data?.summary.fairUseEmailsPerSeat ?? 500} emails/seat/month</span>
          </div>
          {(stats?.approachingLimit ?? 0) > 0 && (
            <div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-950/20 rounded-md">
              <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-yellow-700 dark:text-yellow-400">
                {stats?.approachingLimit} address(es) are approaching their monthly email limit.
                Overage is billed at $0.001/email.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Per-address settings dialog */}
      {settingsAddressId && (
        <AddressSettingsDialog
          addressId={settingsAddressId}
          onClose={() => setSettingsAddressId(null)}
        />
      )}
    </div>
  );
}
