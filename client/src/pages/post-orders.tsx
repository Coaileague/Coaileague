import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UniversalModal, UniversalModalHeader, UniversalModalTitle, UniversalModalFooter, UniversalModalContent } from '@/components/ui/universal-modal';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ESignature } from "@/components/ESignature";
import {
  Eye,
  ClipboardList,
  Plus,
  AlertTriangle,
  ArrowUp,
  Minus,
  CheckSquare,
  PenLine,
  Camera,
  Star,
  Pencil,
  CheckCircle2,
  Clock,
  FileSignature,
  Users,
} from 'lucide-react';;

const pageConfig: CanvasPageConfig = {
  id: "post-orders",
  title: "Post Orders",
  subtitle: "Create, manage, and track officer acknowledgment of site instructions",
  category: "operations",
};

const PRIORITY_CONFIG: Record<string, { label: string; className: string; icon: any }> = {
  normal: { label: "Normal", className: "bg-muted text-muted-foreground border-border", icon: Minus },
  high: { label: "High", className: "bg-orange-500/10 text-orange-700 border-orange-200", icon: ArrowUp },
  urgent: { label: "Urgent", className: "bg-red-500/10 text-red-700 border-red-200", icon: AlertTriangle },
};

function PostOrderForm({ order, onClose }: { order?: any; onClose: () => void }) {
  const { user } = useAuth();
  const workspaceId = (user as any)?.workspaceId;
  const { toast } = useToast();
  const [form, setForm] = useState({
    title: order?.title ?? "",
    description: order?.description ?? "",
    priority: order?.priority ?? "normal",
    requiresAcknowledgment: order?.requiresAcknowledgment ?? true,
    requiresSignature: order?.requiresSignature ?? false,
    requiresPhotos: order?.requiresPhotos ?? false,
    photoFrequency: order?.photoFrequency ?? "per_shift",
    photoInstructions: order?.photoInstructions ?? "",
    isActive: order?.isActive ?? true,
  });

  const mutation = useMutation({
    mutationFn: (data) =>
      order
        ? apiRequest("PATCH", `/api/post-orders/templates/${order.id}`, data)
        : apiRequest("POST", "/api/post-orders/templates", { ...data, workspaceId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/post-orders", workspaceId] });
      toast({ title: order ? "Post order updated" : "Post order created" });
      onClose();
    },
    onError: () => toast({ title: "Failed to save post order", variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div>
          <Label htmlFor="po-title">Title *</Label>
          <Input
            id="po-title"
            value={form.title}
            onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
            placeholder="e.g. Main Entrance Security Protocol"
            data-testid="input-postorder-title"
          />
        </div>
        <div>
          <Label htmlFor="po-desc">Instructions *</Label>
          <Textarea
            id="po-desc"
            value={form.description}
            onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            placeholder="Detailed instructions for the officer at this post..."
            rows={4}
            data-testid="input-postorder-description"
          />
        </div>

        <div>
          <Label>Priority Level</Label>
          <Select value={form.priority} onValueChange={v => setForm(p => ({ ...p, priority: v }))}>
            <SelectTrigger data-testid="select-postorder-priority">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-3 pt-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Requirements</p>

          {[
            { key: "requiresAcknowledgment", label: "Requires Acknowledgment", desc: "Officer must confirm they read this order", icon: CheckSquare },
            { key: "requiresSignature", label: "Requires Signature", desc: "Officer must digitally sign", icon: PenLine },
            { key: "requiresPhotos", label: "Requires Photos", desc: "Officer must submit photos", icon: Camera },
          ].map(req => (
            <div key={req.key} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
              <req.icon className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{req.label}</p>
                <p className="text-xs text-muted-foreground">{req.desc}</p>
              </div>
              <Switch
                checked={form[req.key as keyof typeof form] as boolean}
                onCheckedChange={v => setForm(p => ({ ...p, [req.key]: v }))}
                data-testid={`switch-${req.key}`}
              />
            </div>
          ))}
        </div>

        {form.requiresPhotos && (
          <div>
            <Label htmlFor="po-photo-instructions">Photo Instructions</Label>
            <Textarea
              id="po-photo-instructions"
              value={form.photoInstructions}
              onChange={e => setForm(p => ({ ...p, photoInstructions: e.target.value }))}
              placeholder="What photos are required? e.g. Front entrance, parking lot, side gates..."
              rows={2}
            />
          </div>
        )}

        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
          <div>
            <p className="text-sm font-medium">Active</p>
            <p className="text-xs text-muted-foreground">Make this post order visible to officers</p>
          </div>
          <Switch
            checked={form.isActive}
            onCheckedChange={v => setForm(p => ({ ...p, isActive: v }))}
            data-testid="switch-postorder-active"
          />
        </div>
      </div>

      <UniversalModalFooter className="gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button
          onClick={() => mutation.mutate(form)}
          disabled={!form.title || !form.description || mutation.isPending}
          data-testid="button-save-postorder"
        >
          {mutation.isPending ? "Saving..." : order ? "Update Order" : "Create Order"}
        </Button>
      </UniversalModalFooter>
    </div>
  );
}

function PostOrderCard({ order, onEdit, onViewAcks, onAcknowledge }: { order: any; onEdit: (o) => void; onViewAcks: (o) => void; onAcknowledge?: (o) => void }) {
  const cfg = PRIORITY_CONFIG[order.priority] || PRIORITY_CONFIG.normal;
  const PriIcon = cfg.icon;
  const requirements: string[] = [];
  if (order.requiresAcknowledgment) requirements.push("Ack");
  if (order.requiresSignature) requirements.push("Sig");
  if (order.requiresPhotos) requirements.push("Photos");

  return (
    <Card
      className="hover-elevate"
      data-testid={`card-postorder-${order.id}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <ClipboardList className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <p className="font-medium text-sm leading-tight">{order.title}</p>
              <div className="flex items-center gap-1.5 shrink-0">
                {!order.isActive && (
                  <Badge variant="secondary" className="text-xs">Inactive</Badge>
                )}
                <Badge className={`text-xs border ${cfg.className}`}>
                  <PriIcon className="w-3 h-3 mr-1 inline" />
                  {cfg.label}
                </Badge>
              </div>
            </div>
            {order.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{order.description}</p>
            )}
            {requirements.length > 0 && (
              <div className="flex gap-1 mt-2 flex-wrap">
                {requirements.map(r => (
                  <span key={r} className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">
                    {r}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1 shrink-0">
            <Button
              size="icon"
              variant="ghost"
              onClick={e => { e.stopPropagation(); onEdit(order); }}
              data-testid={`button-edit-postorder-${order.id}`}
            >
              <Pencil className="w-4 h-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={e => { e.stopPropagation(); onViewAcks(order); }}
              data-testid={`button-view-acks-${order.id}`}
            >
              <Eye className="w-4 h-4" />
            </Button>
            {onAcknowledge && order.requiresAcknowledgment && (
              <Button
                size="icon"
                variant="ghost"
                onClick={e => { e.stopPropagation(); onAcknowledge(order); }}
                data-testid={`button-acknowledge-${order.id}`}
              >
                <CheckCircle2 className="w-4 h-4 text-green-600" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AcknowledgmentDialog({ order, onClose }: { order: any; onClose: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [signature, setSignature] = useState({ agreed: false, signatureName: "", signedAt: "" });
  const [notes, setNotes] = useState("");

  const employeeId = (user as any)?.employeeId || (user as any)?.id;

  const workspaceId = (user as any)?.workspaceId;

  const mutation = useMutation({
    mutationFn: (data) => apiRequest("POST", "/api/post-orders/acknowledge", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/post-orders", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["/api/post-orders/tracking", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["/api/post-orders/acknowledgments", order.id] });
      toast({ title: "Post order acknowledged successfully" });
      onClose();
    },
    onError: (err) => {
      const msg = err?.message?.includes("409") ? "Already acknowledged" : "Failed to acknowledge";
      toast({ title: msg, variant: "destructive" });
    },
  });

  const canSubmit = order.requiresSignature
    ? signature.agreed && signature.signatureName.length > 0
    : true;

  return (
    <UniversalModalContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
      <UniversalModalHeader>
        <UniversalModalTitle className="flex items-center gap-2">
          <CheckSquare className="w-5 h-5 text-primary" />
          Acknowledge Post Order
        </UniversalModalTitle>
      </UniversalModalHeader>

      <div className="space-y-4">
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="font-medium">{order.title}</p>
              {order.priority && (
                <Badge className={`text-xs border ${(PRIORITY_CONFIG[order.priority] || PRIORITY_CONFIG.normal).className}`}>
                  {(PRIORITY_CONFIG[order.priority] || PRIORITY_CONFIG.normal).label}
                </Badge>
              )}
            </div>
            {order.description && (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{order.description}</p>
            )}
          </CardContent>
        </Card>

        <div>
          <Label htmlFor="ack-notes">Notes (optional)</Label>
          <Textarea
            id="ack-notes"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Any notes or concerns about this order..."
            rows={2}
            data-testid="input-ack-notes"
          />
        </div>

        {order.requiresSignature && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Digital Signature Required</p>
            <ESignature
              value={signature}
              onChange={setSignature}
              agreementText="I acknowledge that I have read, understood, and agree to follow these post order instructions. My typed name constitutes a legal electronic signature."
              required
            />
          </div>
        )}

        <UniversalModalFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() =>
              mutation.mutate({
                shiftOrderId: order.id,
                employeeId,
                notes: notes || undefined,
                signatureUrl: signature.signatureName ? `sig:${signature.signatureName}` : undefined,
              })
            }
            disabled={!canSubmit || mutation.isPending}
            data-testid="button-submit-acknowledgment"
          >
            {mutation.isPending ? "Submitting..." : "Acknowledge Order"}
          </Button>
        </UniversalModalFooter>
      </div>
    </UniversalModalContent>
  );
}

function AcknowledgmentTrackingPanel({ order, onClose }: { order: any; onClose: () => void }) {
  const { data: acks = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/post-orders/acknowledgments", order.id],
    enabled: !!order.id,
  });

  return (
    <UniversalModalContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
      <UniversalModalHeader>
        <UniversalModalTitle className="flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          Acknowledgment Tracking
        </UniversalModalTitle>
      </UniversalModalHeader>

      <div className="space-y-4">
        <Card>
          <CardContent className="p-4">
            <p className="font-medium text-sm">{order.title}</p>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                <span data-testid="text-ack-count">{acks.length} acknowledged</span>
              </div>
              {order.requiresSignature && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <FileSignature className="w-3.5 h-3.5" />
                  <span>Signature required</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}
          </div>
        ) : acks.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Clock className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm font-medium">No acknowledgments yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                No officers have acknowledged this order.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {acks.map((ack) => (
              <Card key={ack.id} data-testid={`card-ack-${ack.id}`}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                      <div>
                        <p className="text-sm font-medium" data-testid={`text-ack-name-${ack.id}`}>
                          {ack.employeeName || "Unknown Officer"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {ack.acknowledgedAt
                            ? new Date(ack.acknowledgedAt).toLocaleString()
                            : "Date unknown"}
                        </p>
                      </div>
                    </div>
                    {ack.signatureUrl && (
                      <Badge variant="secondary" className="text-xs">
                        <FileSignature className="w-3 h-3 mr-1" />
                        Signed
                      </Badge>
                    )}
                  </div>
                  {ack.notes && (
                    <p className="text-xs text-muted-foreground mt-2 pl-6">{ack.notes}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <UniversalModalFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </UniversalModalFooter>
      </div>
    </UniversalModalContent>
  );
}

function TrackingTab() {
  const { user } = useAuth();
  const workspaceId = (user as any)?.workspaceId;
  const [selectedOrder, setSelectedOrder] = useState<any>(null);

  const { data: trackingData = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/post-orders/tracking", workspaceId],
    enabled: !!workspaceId,
  });

  const totalOrders = trackingData.length;
  const totalAcks = trackingData.reduce((sum: number, o: any) => sum + (Number(o.ackCount) || 0), 0);
  const pendingOrders = trackingData.filter((o) => Number(o.ackCount) === 0).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Shift Orders", value: totalOrders, icon: ClipboardList, color: "text-foreground" },
          { label: "Total Acks", value: totalAcks, icon: CheckCircle2, color: "text-green-600" },
          { label: "Pending", value: pendingOrders, icon: Clock, color: "text-orange-600" },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <s.icon className={`w-4 h-4 ${s.color}`} />
                <span className="text-xs text-muted-foreground">{s.label}</span>
              </div>
              <p className={`text-2xl font-bold ${s.color}`} data-testid={`text-tracking-${s.label.toLowerCase().replace(/\s/g, '-')}`}>
                {s.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : trackingData.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Users className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium">No assigned orders yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Assign post order templates to shifts to begin tracking acknowledgments.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {trackingData.map((order) => {
            const ackCount = Number(order.ackCount) || 0;
            const cfg = PRIORITY_CONFIG[order.priority] || PRIORITY_CONFIG.normal;
            const PriIcon = cfg.icon;

            return (
              <Card
                key={order.id}
                className="hover-elevate cursor-pointer"
                onClick={() => setSelectedOrder(order)}
                data-testid={`card-tracking-${order.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${ackCount > 0 ? 'bg-green-500' : 'bg-orange-500'}`} />
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{order.title}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-xs text-muted-foreground">
                            Shift: {order.shiftId?.slice(0, 8)}...
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {order.createdAt ? new Date(order.createdAt).toLocaleDateString() : ""}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge className={`text-xs border ${cfg.className}`}>
                        <PriIcon className="w-3 h-3 mr-1 inline" />
                        {cfg.label}
                      </Badge>
                      <Badge variant={ackCount > 0 ? "default" : "secondary"} className="text-xs">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        {ackCount}
                      </Badge>
                      <Button size="icon" variant="ghost" onClick={e => { e.stopPropagation(); setSelectedOrder(order); }} data-testid={`button-tracking-detail-${order.id}`}>
                        <Eye className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <UniversalModal open={!!selectedOrder} onOpenChange={open => { if (!open) setSelectedOrder(null); }}>
        {selectedOrder && (
          <AcknowledgmentTrackingPanel
            order={selectedOrder}
            onClose={() => setSelectedOrder(null)}
          />
        )}
      </UniversalModal>
    </div>
  );
}

export default function PostOrdersPage() {
  const { user } = useAuth();
  const workspaceId = (user as any)?.workspaceId;
  const [showForm, setShowForm] = useState(false);
  const [editOrder, setEditOrder] = useState<any>(null);
  const [filterPriority, setFilterPriority] = useState("all");
  const [ackOrder, setAckOrder] = useState<any>(null);
  const [viewAcksOrder, setViewAcksOrder] = useState<any>(null);

  const { data: templates = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/post-orders", workspaceId],
    queryFn: () =>
      fetch(`/api/post-orders/templates`, { credentials: "include" })
        .then(r => r.json())
        .then(d => Array.isArray(d) ? d : []),
    enabled: !!workspaceId,
  });

  const filtered = filterPriority === "all" ? templates : templates.filter(t => t.priority === filterPriority);
  const active = templates.filter(t => t.isActive).length;
  const urgent = templates.filter(t => t.priority === "urgent").length;

  return (
    <CanvasHubPage config={pageConfig}>
      <Tabs defaultValue="templates" className="space-y-6">
        <TabsList data-testid="tabs-post-orders">
          <TabsTrigger value="templates" data-testid="tab-templates">
            <ClipboardList className="w-4 h-4 mr-1.5" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="tracking" data-testid="tab-tracking">
            <Users className="w-4 h-4 mr-1.5" />
            Tracking
          </TabsTrigger>
        </TabsList>

        <TabsContent value="templates">
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Total", value: templates.length, icon: ClipboardList, color: "text-foreground" },
                { label: "Active", value: active, icon: Star, color: "text-green-600" },
                { label: "Urgent", value: urgent, icon: AlertTriangle, color: "text-red-600" },
              ].map(s => (
                <Card key={s.label}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <s.icon className={`w-4 h-4 ${s.color}`} />
                      <span className="text-xs text-muted-foreground">{s.label}</span>
                    </div>
                    <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex gap-2 flex-wrap">
                {["all", "urgent", "high", "normal"].map(p => (
                  <button
                    key={p}
                    onClick={() => setFilterPriority(p)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      filterPriority === p
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-border text-muted-foreground hover-elevate"
                    }`}
                    data-testid={`filter-priority-${p}`}
                  >
                    {p === "all" ? "All" : p.charAt(0).toUpperCase() + p.slice(1)}
                  </button>
                ))}
              </div>
              <Button onClick={() => { setEditOrder(null); setShowForm(true); }} data-testid="button-create-postorder">
                <Plus className="w-4 h-4 mr-2" />
                New Order
              </Button>
            </div>

            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
              </div>
            ) : filtered.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <ClipboardList className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                  <p className="font-medium">No post orders found</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {filterPriority === "all"
                      ? "Create your first post order to define site-specific instructions for officers."
                      : `No "${filterPriority}" priority orders.`}
                  </p>
                  {filterPriority === "all" && (
                    <Button className="mt-4" onClick={() => setShowForm(true)} data-testid="button-create-first-order">
                      <Plus className="w-4 h-4 mr-2" />
                      Create Post Order
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filtered.map(order => (
                  <PostOrderCard
                    key={order.id}
                    order={order}
                    onEdit={o => { setEditOrder(o); setShowForm(true); }}
                    onViewAcks={o => setViewAcksOrder(o)}
                    onAcknowledge={o => setAckOrder(o)}
                  />
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="tracking">
          <TrackingTab />
        </TabsContent>
      </Tabs>

      <UniversalModal open={showForm} onOpenChange={open => { if (!open) { setShowForm(false); setEditOrder(null); } }}>
        <UniversalModalContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <UniversalModalHeader>
            <UniversalModalTitle>{editOrder ? "Edit Post Order" : "New Post Order"}</UniversalModalTitle>
          </UniversalModalHeader>
          <PostOrderForm order={editOrder} onClose={() => { setShowForm(false); setEditOrder(null); }} />
        </UniversalModalContent>
      </UniversalModal>

      <UniversalModal open={!!ackOrder} onOpenChange={open => { if (!open) setAckOrder(null); }}>
        {ackOrder && <AcknowledgmentDialog order={ackOrder} onClose={() => setAckOrder(null)} />}
      </UniversalModal>

      <UniversalModal open={!!viewAcksOrder} onOpenChange={open => { if (!open) setViewAcksOrder(null); }}>
        {viewAcksOrder && (
          <AcknowledgmentTrackingPanel order={viewAcksOrder} onClose={() => setViewAcksOrder(null)} />
        )}
      </UniversalModal>
    </CanvasHubPage>
  );
}
