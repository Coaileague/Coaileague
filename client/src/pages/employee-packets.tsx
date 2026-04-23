import { useState } from "react";
import { CanvasHubPage, type CanvasPageConfig } from '@/components/canvas-hub';
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  FileText, Plus, Clock, CheckCircle, XCircle, Copy, ExternalLink,
  Shield, User, AlertTriangle, Send, Trash2, Eye
} from "lucide-react";
import { format } from "date-fns";

type PacketType = "unarmed" | "armed" | "ppo" | "contractor";

interface Packet {
  id: string;
  applicationId: string;
  documentType: string;
  documentTitle: string;
  documentContent: string;
  status: string;
  signedByName?: string;
  signedAt?: string;
  createdAt: string;
  viewCount: number;
}

const PACKET_TYPES: { value: PacketType; label: string; description: string }[] = [
  {
    value: "unarmed",
    label: "Unarmed Security Officer",
    description: "Level II — Non-commissioned officer (Texas DPS)",
  },
  {
    value: "armed",
    label: "Armed Security Officer",
    description: "Level III — Commissioned officer, firearm required (Texas DPS)",
  },
  {
    value: "ppo",
    label: "Personal Protection Officer",
    description: "PPO — Executive protection, Level IV (Texas DPS)",
  },
  {
    value: "contractor",
    label: "Independent Contractor",
    description: "1099 contractor agreement template — have your attorney review before use",
  },
];

function statusBadge(status: string) {
  if (status === "signed") return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">Completed</Badge>;
  if (status === "declined") return <Badge variant="destructive">Voided</Badge>;
  return <Badge variant="secondary">Pending</Badge>;
}

export default function EmployeePackets() {
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    packetType: "unarmed" as PacketType,
    recipientName: "",
    recipientEmail: "",
    notes: "",
  });
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ packets: Packet[] }>({
    queryKey: ["/api/employee-packets"],
  });

  const createMutation = useMutation({
    mutationFn: (body: typeof form) => apiRequest("POST", "/api/employee-packets", body),
    onSuccess: async (res) => {
      const json = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/employee-packets"] });
      toast({
        title: "Packet created",
        description: `Share this link with the recipient: ${window.location.origin}/packet-portal/${json.packet.applicationId}`,
      });
      setCreateOpen(false);
      setForm({ packetType: "unarmed", recipientName: "", recipientEmail: "", notes: "" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const voidMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/employee-packets/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employee-packets"] });
      toast({ title: "Packet voided" });
    },
  });

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/packet-portal/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedId(token);
    setTimeout(() => setCopiedId(null), 2000);
    toast({ title: "Link copied to clipboard" });
  };

  const packets = data?.packets ?? [];
  const pending = packets.filter((p) => p.status === "pending").length;
  const completed = packets.filter((p) => p.status === "signed").length;

  const pageConfig: CanvasPageConfig = {
    id: 'employee-packets',
    title: 'Onboarding Packets',
    category: 'operations',
    showHeader: false,
    maxWidth: '5xl',
  };

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Onboarding Packets</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Digital onboarding paperwork for employees, contractors, and clients with e-signature and audit trail. Templates are for reference — consult your attorney before use.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-packet">
              <Plus className="w-4 h-4 mr-2" />
              New Packet
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create Onboarding Packet</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-1">
              <div>
                <Label>Packet Type</Label>
                <Select
                  value={form.packetType}
                  onValueChange={(v) => setForm((f) => ({ ...f, packetType: v as PacketType }))}
                >
                  <SelectTrigger data-testid="select-packet-type" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PACKET_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        <div>
                          <div className="font-medium">{t.label}</div>
                          <div className="text-xs text-muted-foreground">{t.description}</div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Recipient Full Name</Label>
                <Input
                  data-testid="input-recipient-name"
                  className="mt-1"
                  placeholder="Jane Smith"
                  value={form.recipientName}
                  onChange={(e) => setForm((f) => ({ ...f, recipientName: e.target.value }))}
                />
              </div>
              <div>
                <Label>Recipient Email</Label>
                <Input
                  data-testid="input-recipient-email"
                  className="mt-1"
                  type="email"
                  placeholder="jane@example.com"
                  value={form.recipientEmail}
                  onChange={(e) => setForm((f) => ({ ...f, recipientEmail: e.target.value }))}
                />
              </div>
              <div>
                <Label>Notes (optional)</Label>
                <Input
                  data-testid="input-notes"
                  className="mt-1"
                  placeholder="Any notes for this packet"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button
                  data-testid="button-submit-packet"
                  onClick={() => createMutation.mutate(form)}
                  disabled={!form.recipientName || !form.recipientEmail || createMutation.isPending}
                >
                  {createMutation.isPending ? "Creating..." : "Create & Get Link"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="flex flex-col items-center justify-center text-center gap-1">
              <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="text-xl sm:text-2xl font-semibold" data-testid="stat-pending">{pending}</div>
              <div className="text-xs text-muted-foreground">Pending</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="flex flex-col items-center justify-center text-center gap-1">
              <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
              <div className="text-xl sm:text-2xl font-semibold" data-testid="stat-completed">{completed}</div>
              <div className="text-xs text-muted-foreground">Done</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="flex flex-col items-center justify-center text-center gap-1">
              <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="text-xl sm:text-2xl font-semibold" data-testid="stat-total">{packets.length}</div>
              <div className="text-xs text-muted-foreground">Total</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Packet list */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">All Packets</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              Loading packet templates, completion status, and assigned recipients...
            </div>
          ) : packets.length === 0 ? (
            <div className="p-10 text-center">
              <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-medium text-sm">No packets yet</p>
              <p className="text-xs text-muted-foreground mt-1">Create a packet to get started</p>
            </div>
          ) : (
            <div className="divide-y">
              {packets.map((packet) => {
                const data = (() => { try { return JSON.parse(packet.documentContent || "{}"); } catch { return {}; } })();
                return (
                  <div
                    key={packet.id}
                    data-testid={`row-packet-${packet.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 p-4"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <Shield className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">{data.recipientName || "—"}</div>
                        <div className="text-xs text-muted-foreground truncate">{packet.documentTitle}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Created {format(new Date(packet.createdAt), "MMM d, yyyy")}
                          {packet.viewCount > 0 && ` · Viewed ${packet.viewCount}x`}
                          {packet.signedAt && ` · Signed ${format(new Date(packet.signedAt), "MMM d, yyyy")}`}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {statusBadge(packet.status)}
                      {packet.status === "pending" && (
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Copy portal link"
                          data-testid={`button-copy-link-${packet.id}`}
                          onClick={() => copyLink(packet.applicationId)}
                          aria-label="Copy portal link"
                        >
                          {copiedId === packet.applicationId ? <CheckCircle className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Open portal"
                        data-testid={`button-open-portal-${packet.id}`}
                        onClick={() => window.open(`/packet-portal/${packet.applicationId}`, "_blank")}
                        aria-label="Open portal"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                      {packet.status === "pending" && (
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Void packet"
                          data-testid={`button-void-${packet.id}`}
                          onClick={() => {
                            if (confirm("Void this packet? The recipient's link will stop working.")) {
                              voidMutation.mutate(packet.id);
                            }
                          }}
                          aria-label="Void packet"
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="bg-muted/40 border rounded-md p-4 text-sm space-y-1">
        <div className="flex items-center gap-2 font-medium">
          <Shield className="w-4 h-4" />
          Texas Compliance Coverage
        </div>
        <ul className="text-xs text-muted-foreground space-y-0.5 pl-6 list-disc">
          <li>Texas Private Security Act — Occupations Code Chapter 1702</li>
          <li>37 TAC Part 1, Chapter 35 — DPS Private Security Bureau</li>
          <li>I-9 Employment Eligibility (federal USCIS Form I-9 equivalent)</li>
          <li>W-4 Federal Tax Withholding acknowledgment</li>
          <li>At-will employment disclosure (Texas)</li>
          <li>Drug-free workplace policy (DOT/Federal standards)</li>
          <li>Electronic Communications and Social Media Policy</li>
          <li>Background check and fingerprint authorization (DPS/IdentoGO)</li>
        </ul>
      </div>
    </CanvasHubPage>
  );
}
