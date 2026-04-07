import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useClientLookup } from "@/hooks/useClients";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { UniversalModal, UniversalModalDescription, UniversalModalHeader, UniversalModalTitle, UniversalModalFooter, UniversalModalContent } from '@/components/ui/universal-modal';
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DollarSign, Calendar, Clock, CheckCircle2, AlertCircle, FileText, TrendingUp,
  CreditCard, Download, ClipboardCheck, AlertTriangle, Shield, Eye, Loader2,
  FileSignature, ScrollText, MessageSquare, Building2, RefreshCw, ExternalLink,
  ShieldCheck, FilePlus, SendHorizonal, ChevronRight, CheckCheck, XCircle, Users2,
  Paperclip, CalendarPlus, UserCheck, Lock,
} from "lucide-react";
import type { Invoice, Client } from "@shared/schema";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import DockChatWidget from "@/components/client-portal/DockChatWidget";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";

// Stripe promise — created once at module level (never inside render)
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY || "");

// ─── helpers ────────────────────────────────────────────────────────────────

function formatDate(d: string | Date | null | undefined) {
  if (!d) return "N/A";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getDaysUntilDue(due: string | Date | null | undefined): number | null {
  if (!due) return null;
  return Math.ceil((new Date(due).getTime() - Date.now()) / 86_400_000);
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    paid: { label: "Paid", cls: "bg-green-500/10 text-green-600 border-0" },
    sent: { label: "Outstanding", cls: "bg-blue-500/10 text-blue-600 border-0" },
    overdue: { label: "Overdue", cls: "bg-rose-500/10 text-rose-600 border-0" },
    draft: { label: "Draft", cls: "" },
    executed: { label: "Executed", cls: "bg-green-500/10 text-green-600 border-0" },
    signed: { label: "Signed", cls: "bg-green-500/10 text-green-600 border-0" },
    pending_signatures: { label: "Pending Signature", cls: "bg-amber-500/10 text-amber-600 border-0" },
    partially_signed: { label: "Partially Signed", cls: "bg-amber-500/10 text-amber-600 border-0" },
    expired: { label: "Expired", cls: "bg-rose-500/10 text-rose-600 border-0" },
    terminated: { label: "Terminated", cls: "bg-rose-500/10 text-rose-600 border-0" },
    changes_requested: { label: "Changes Requested", cls: "bg-amber-500/10 text-amber-600 border-0" },
    accepted: { label: "Accepted", cls: "bg-green-500/10 text-green-600 border-0" },
    open: { label: "Open", cls: "bg-blue-500/10 text-blue-600 border-0" },
    resolved: { label: "Resolved", cls: "bg-green-500/10 text-green-600 border-0" },
    acknowledged: { label: "Acknowledged", cls: "bg-amber-500/10 text-amber-600 border-0" },
  };
  const c = map[status] || { label: status, cls: "" };
  return <Badge variant="secondary" className={c.cls}>{c.label}</Badge>;
}

// ─── COI Request Dialog ──────────────────────────────────────────────────────

function COIRequestDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ reason: "", additionalInfo: "", clientName: "", certificateHolder: "" });

  const mutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/clients/coi-request", form),
    onSuccess: () => {
      toast({ title: "COI Request Submitted", description: "Your security provider will prepare and deliver the certificate." });
      onOpenChange(false);
      setForm({ reason: "", additionalInfo: "", clientName: "", certificateHolder: "" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <UniversalModal open={open} onOpenChange={onOpenChange}>
      <UniversalModalContent className="max-w-sm">
        <UniversalModalHeader>
          <UniversalModalTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-blue-600" />
            Request Proof of Insurance
          </UniversalModalTitle>
          <UniversalModalDescription>
            Request a Certificate of Insurance (COI) from your security provider. This will be delivered to you and saved to your document portal.
          </UniversalModalDescription>
        </UniversalModalHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Your Name / Company</Label>
            <Input
              data-testid="input-coi-client-name"
              placeholder="e.g. TXPS Investigations LLC"
              value={form.clientName}
              onChange={e => setForm(p => ({ ...p, clientName: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Certificate Holder (who should be listed)</Label>
            <Input
              data-testid="input-coi-certificate-holder"
              placeholder="e.g. Property Management Co."
              value={form.certificateHolder}
              onChange={e => setForm(p => ({ ...p, certificateHolder: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Reason for Request</Label>
            <Select value={form.reason} onValueChange={v => setForm(p => ({ ...p, reason: v }))}>
              <SelectTrigger data-testid="select-coi-reason">
                <SelectValue placeholder="Select reason" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vendor_requirement">Vendor / Supplier Requirement</SelectItem>
                <SelectItem value="contract_renewal">Contract Renewal</SelectItem>
                <SelectItem value="new_location">New Location / Site</SelectItem>
                <SelectItem value="audit">Audit or Compliance Review</SelectItem>
                <SelectItem value="legal">Legal / Litigation</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Additional Information (optional)</Label>
            <Textarea
              data-testid="textarea-coi-additional"
              placeholder="Any specific requirements or instructions..."
              value={form.additionalInfo}
              onChange={e => setForm(p => ({ ...p, additionalInfo: e.target.value }))}
              rows={3}
            />
          </div>
        </div>
        <UniversalModalFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            data-testid="button-submit-coi-request"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !form.reason}
          >
            <SendHorizonal className="h-4 w-4 mr-2" />
            {mutation.isPending ? "Submitting..." : "Submit Request"}
          </Button>
        </UniversalModalFooter>
      </UniversalModalContent>
    </UniversalModal>
  );
}

// ─── Renewal Request Dialog ──────────────────────────────────────────────────

function RenewalRequestDialog({
  open, onOpenChange, contractTitle,
}: { open: boolean; onOpenChange: (v: boolean) => void; contractTitle: string }) {
  const { toast } = useToast();
  const [notes, setNotes] = useState("");

  const mutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/clients/contract-renewal-request", { contractTitle, notes }),
    onSuccess: () => {
      toast({ title: "Renewal Request Sent", description: "Your security provider will review and respond." });
      onOpenChange(false);
      setNotes("");
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <UniversalModal open={open} onOpenChange={onOpenChange}>
      <UniversalModalContent className="max-w-sm">
        <UniversalModalHeader>
          <UniversalModalTitle>Request Contract Renewal</UniversalModalTitle>
          <UniversalModalDescription>
            Requesting renewal for: <strong>{contractTitle}</strong>
          </UniversalModalDescription>
        </UniversalModalHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Notes or Requested Changes (optional)</Label>
            <Textarea
              data-testid="textarea-renewal-notes"
              placeholder="Any changes to terms, rates, or scope you'd like to discuss..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={4}
            />
          </div>
        </div>
        <UniversalModalFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button data-testid="button-submit-renewal" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {mutation.isPending ? "Sending..." : "Request Renewal"}
          </Button>
        </UniversalModalFooter>
      </UniversalModalContent>
    </UniversalModal>
  );
}

// ─── Phase 35G: Client Portal Messages Tab ───────────────────────────────────

interface PortalThread {
  id: string;
  subject: string;
  status: string;
  channel: string;
  slaStatus: string;
  lastMessageAt: string;
  lastMessagePreview?: string;
}

interface PortalMessage {
  id: string;
  senderType: string;
  senderName?: string;
  body: string;
  direction: string;
  createdAt: string;
}

function ClientMessagesTab({ clientId }: { clientId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [compose, setCompose] = useState("");

  const { data: threads = [], isLoading: threadsLoading } = useQuery<PortalThread[]>({
    queryKey: ["/api/client-comms/portal/threads", clientId],
    queryFn: async () => {
      const res = await fetch(`/api/client-comms/portal/threads`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load messages");
      return res.json();
    },
    enabled: !!clientId,
    refetchInterval: 30_000,
  });

  const { data: msgData, isLoading: msgsLoading } = useQuery<{ thread: PortalThread; messages: PortalMessage[] }>({
    queryKey: ["/api/client-comms/portal/threads", selectedId, "messages"],
    queryFn: async () => {
      const res = await fetch(`/api/client-comms/threads/${selectedId}/messages`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load messages");
      return res.json();
    },
    enabled: !!selectedId,
    refetchInterval: 15_000,
  });

  const sendMutation = useMutation({
    mutationFn: async (body: string) => {
      const res = await apiRequest("POST", `/api/client-comms/threads/${selectedId}/messages`, {
        body,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/client-comms/portal/threads", selectedId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/client-comms/portal/threads", clientId] });
      setCompose("");
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const selectedThread = threads.find(t => t.id === selectedId) || null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-indigo-500" />
          Messages
        </CardTitle>
        <CardDescription>Direct messages with your security provider</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="flex min-h-[400px] border-t">
          {/* Thread List */}
          <div className="w-64 shrink-0 border-r">
            <ScrollArea className="h-[400px]">
              {threadsLoading ? (
                <div className="p-3 space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-14 rounded-md bg-muted animate-pulse" />
                  ))}
                </div>
              ) : threads.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm gap-2 p-4 text-center">
                  <MessageSquare className="h-6 w-6 opacity-30" />
                  <p>No messages yet</p>
                </div>
              ) : (
                threads.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedId(t.id)}
                    data-testid={`button-portal-thread-${t.id}`}
                    className={`w-full text-left px-3 py-2.5 border-b border-border hover-elevate transition-colors ${selectedId === t.id ? "bg-accent/60" : ""}`}
                  >
                    <p className="text-sm font-medium truncate">{t.subject}</p>
                    {t.lastMessagePreview && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{t.lastMessagePreview}</p>
                    )}
                    <div className="flex items-center gap-1 mt-1">
                      <Badge variant={t.status === "open" ? "secondary" : "outline"} className="text-[10px]">
                        {t.status}
                      </Badge>
                    </div>
                  </button>
                ))
              )}
            </ScrollArea>
          </div>
          {/* Message View */}
          <div className="flex-1 flex flex-col min-w-0">
            {!selectedThread ? (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                Select a message thread
              </div>
            ) : (
              <>
                <div className="px-4 py-2.5 border-b">
                  <p className="font-medium text-sm">{selectedThread.subject}</p>
                  <p className="text-xs text-muted-foreground capitalize">{selectedThread.channel} · {selectedThread.status}</p>
                </div>
                <ScrollArea className="flex-1 p-3">
                  {msgsLoading ? (
                    <div className="space-y-3">
                      {Array.from({ length: 2 }).map((_, i) => (
                        <div key={i} className="h-12 rounded-md bg-muted animate-pulse" />
                      ))}
                    </div>
                  ) : !msgData?.messages?.length ? (
                    <p className="text-sm text-muted-foreground text-center py-6">No messages yet.</p>
                  ) : (
                    msgData.messages.map(m => {
                      const isClient = m.senderType === "client";
                      return (
                        <div key={m.id} className={`flex gap-2 mb-3 ${isClient ? "flex-row-reverse" : "flex-row"}`} data-testid={`portal-msg-${m.id}`}>
                          <div className={`max-w-[75%] px-3 py-2 rounded-md text-sm ${isClient ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                            {m.body}
                          </div>
                        </div>
                      );
                    })
                  )}
                </ScrollArea>
                {selectedThread.status === "open" && (
                  <div className="border-t p-3 flex gap-2">
                    <Textarea
                      value={compose}
                      onChange={e => setCompose(e.target.value)}
                      placeholder="Type your message..."
                      rows={2}
                      className="flex-1"
                      data-testid="input-portal-compose"
                    />
                    <Button
                      size="icon"
                      onClick={() => compose.trim() && sendMutation.mutate(compose.trim())}
                      disabled={!compose.trim() || sendMutation.isPending}
                      data-testid="button-portal-send"
                    >
                      <SendHorizonal className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Stripe Payment Modal ─────────────────────────────────────────────────────

interface InvoicePaymentModalProps {
  invoice: Invoice;
  accessToken: string;
  onClose: () => void;
  onPaid: () => void;
}

/**
 * Inner Stripe form — must be rendered inside <Elements>
 * Handles card input via PaymentElement + confirmPayment
 */
function StripePaymentForm({
  amount,
  invoiceNumber,
  onSuccess,
  onError,
}: {
  amount: number;
  invoiceNumber: string;
  onSuccess: () => void;
  onError: (msg: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [confirming, setConfirming] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setConfirming(true);
    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}${window.location.pathname}?payment_confirmed=1`,
        },
        redirect: "if_required",
      });
      if (error) {
        onError(error.message || "Payment failed. Please try again.");
      } else if (paymentIntent?.status === "succeeded") {
        onSuccess();
      } else {
        onError("Payment status unclear. Please check your email for confirmation.");
      }
    } catch (err: any) {
      onError(err.message || "Unexpected error during payment.");
    } finally {
      setConfirming(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-md border p-4 bg-muted/30">
        <PaymentElement
          options={{ layout: "tabs" }}
        />
      </div>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Lock className="h-3 w-3" />
        <span>Secured by Stripe — your card details are never stored by us</span>
      </div>
      <Button
        type="submit"
        className="w-full"
        disabled={!stripe || !elements || confirming}
        data-testid="button-confirm-payment"
      >
        {confirming ? (
          <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing...</>
        ) : (
          <><CreditCard className="h-4 w-4 mr-2" /> Pay ${amount.toFixed(2)}</>
        )}
      </Button>
    </form>
  );
}

/**
 * Full payment modal: fetches clientSecret via portal token, renders Stripe Elements,
 * handles success/error. Opened when a client clicks "Pay Now" on an invoice.
 */
function InvoicePaymentModal({ invoice, accessToken, onClose, onPaid }: InvoicePaymentModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<"loading" | "ready" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [retryCount, setRetryCount] = useState(0);
  const [paymentData, setPaymentData] = useState<{
    clientSecret: string;
    amount: number;
    invoiceNumber: string;
  } | null>(null);

  // Create a fresh payment intent on mount and on each retry
  useEffect(() => {
    let cancelled = false;
    setStep("loading");
    setPaymentData(null);
    setErrorMsg("");
    (async () => {
      try {
        const data: any = await apiRequest(
          "POST",
          `/api/portal/${accessToken}/invoice/${invoice.id}/create-payment-intent`
        );
        if (cancelled) return;
        setPaymentData({
          clientSecret: data.clientSecret,
          amount: data.amount,
          invoiceNumber: data.invoiceNumber,
        });
        setStep("ready");
      } catch (err: any) {
        if (cancelled) return;
        setErrorMsg(err.message || "Could not start payment session.");
        setStep("error");
      }
    })();
    return () => { cancelled = true; };
  }, [invoice.id, accessToken, retryCount]);

  const handleSuccess = () => {
    setStep("success");
    queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
    toast({ title: "Payment Submitted", description: `Invoice ${invoice.invoiceNumber} payment is being processed.` });
    setTimeout(() => {
      onPaid();
      onClose();
    }, 2500);
  };

  const handleError = (msg: string) => {
    setErrorMsg(msg);
    setStep("error");
  };

  return (
    <UniversalModal open onOpenChange={(open) => { if (!open) onClose(); }}>
      <UniversalModalContent className="max-w-md">
        <UniversalModalHeader>
          <UniversalModalTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Pay Invoice
          </UniversalModalTitle>
          <UniversalModalDescription>
            Invoice {invoice.invoiceNumber} — ${Number(invoice.total || 0).toFixed(2)}
          </UniversalModalDescription>
        </UniversalModalHeader>

        {step === "loading" && (
          <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm">Initializing secure payment...</p>
          </div>
        )}

        {step === "ready" && paymentData && (
          <Elements
            stripe={stripePromise}
            options={{ clientSecret: paymentData.clientSecret, appearance: { theme: "stripe" } }}
          >
            <StripePaymentForm
              amount={paymentData.amount}
              invoiceNumber={paymentData.invoiceNumber}
              onSuccess={handleSuccess}
              onError={handleError}
            />
          </Elements>
        )}

        {step === "success" && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <p className="font-semibold text-lg">Payment Submitted!</p>
            <p className="text-sm text-muted-foreground">
              Your payment for invoice {invoice.invoiceNumber} is being processed.
              You will receive a confirmation shortly.
            </p>
          </div>
        )}

        {step === "error" && (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <XCircle className="h-10 w-10 text-rose-500" />
              <p className="font-medium">Payment Error</p>
              <p className="text-sm text-muted-foreground">{errorMsg}</p>
            </div>
            <UniversalModalFooter>
              <Button variant="ghost" onClick={onClose}>Dismiss</Button>
              <Button onClick={() => setRetryCount(c => c + 1)}>
                Try Again
              </Button>
            </UniversalModalFooter>
          </div>
        )}
      </UniversalModalContent>
    </UniversalModal>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function ClientPortal() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("overview");
  const [statusFilter, setStatusFilter] = useState("all");
  const [coiDialogOpen, setCoiDialogOpen] = useState(false);
  const [renewalDialog, setRenewalDialog] = useState<{ open: boolean; title: string }>({ open: false, title: "" });
  const [payingInvoice, setPayingInvoice] = useState<Invoice | null>(null);

  const { data: invoices = [] } = useQuery<Invoice[]>({ queryKey: ["/api/invoices"] });
  const { data: clients = [] } = useClientLookup();
  const currentClient = clients.find(c => c.email === user?.email);

  interface ClientReport { id: number; title: string; reportType: string; status: string; employeeName?: string; createdAt: string; data: Record<string, any>; }
  const { data: clientReports = [], isLoading: reportsLoading } = useQuery<ClientReport[]>({
    queryKey: ["/api/client-reports"],
    enabled: !!currentClient,
  });

  interface Contract { id: string; title: string; status: string; clientEmail: string; createdAt: string; expiresAt?: string; docType?: string; }
  const { data: contractsData } = useQuery<{ contracts: Contract[] }>({
    queryKey: ["/api/contracts"],
    enabled: !!user?.email,
  });
  const myContracts = (contractsData?.contracts || []).filter(c =>
    c.clientEmail?.toLowerCase() === user?.email?.toLowerCase()
  );

  interface PostOrder { id: string; title: string; description?: string; priority: string; requiresAcknowledgment: boolean; isActive: boolean; }
  const { data: postOrdersData } = useQuery<{ templates: PostOrder[] }>({
    queryKey: ["/api/post-orders/templates"],
    enabled: !!currentClient,
  });
  const postOrders = postOrdersData?.templates || [];

  interface CommReport { id: string; title: string; reportType: string; status: string; severity?: string; createdAt: string; summary?: string; resolvedAt?: string; }
  const { data: commsData, isLoading: commsLoading } = useQuery<{ reports: CommReport[]; total: number }>({
    queryKey: ["/api/clients/my-communications"],
    enabled: !!user?.email,
  });
  const communications = commsData?.reports || [];

  interface VisitorLog {
    id: string; visitorName: string; visitorCompany?: string; purpose?: string;
    checkedInAt: string; checkedOutAt?: string; siteName?: string;
    hostName?: string; checkedInBy?: string;
  }
  const [visitorDateFilter, setVisitorDateFilter] = useState("all");
  const { data: visitorsData, isLoading: visitorsLoading } = useQuery<{ visitors: VisitorLog[] }>({
    queryKey: ["/api/rms/visitors"],
    enabled: activeTab === "visitor-log",
  });

  // Phase 35I: Pre-registration state & query
  const [showPreRegForm, setShowPreRegForm] = useState(false);
  const [preRegForm, setPreRegForm] = useState({
    expectedVisitorName: '', expectedVisitorCompany: '', visitorType: 'guest',
    siteName: '', expectedArrival: '', expectedDeparture: '',
    hostName: '', hostContact: '', reason: '',
  });
  const setPreReg = (k: string, v: string) => setPreRegForm(p => ({ ...p, [k]: v }));
  const { data: preRegData, isLoading: preRegLoading } = useQuery<any>({
    queryKey: ['/api/visitor-management/pre-registrations'],
    enabled: activeTab === 'visitor-log',
  });
  const preRegistrations: any[] = preRegData?.preRegistrations || [];
  const createPreRegMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/visitor-management/pre-registrations', {
      ...preRegForm,
      expectedArrival: preRegForm.expectedArrival || undefined,
      expectedDeparture: preRegForm.expectedDeparture || undefined,
    }),
    onSuccess: () => {
      toast({ title: 'Pre-Registration Submitted', description: `${preRegForm.expectedVisitorName} has been pre-registered.` });
      queryClient.invalidateQueries({ queryKey: ['/api/visitor-management/pre-registrations'] });
      setPreRegForm({ expectedVisitorName: '', expectedVisitorCompany: '', visitorType: 'guest', siteName: '', expectedArrival: '', expectedDeparture: '', hostName: '', hostContact: '', reason: '' });
      setShowPreRegForm(false);
    },
    onError: (err: any) => { toast({ title: 'Error', description: err.message, variant: 'destructive' }); },
  });
  const allVisitors = visitorsData?.visitors || [];
  const filteredVisitors = allVisitors.filter(v => {
    if (visitorDateFilter === "all") return true;
    const days = visitorDateFilter === "7d" ? 7 : visitorDateFilter === "30d" ? 30 : 90;
    const cutoff = new Date(Date.now() - days * 86400000);
    return new Date(v.checkedInAt) >= cutoff;
  });

  // Financial calcs
  const clientInvoices = currentClient ? invoices.filter(i => i.clientId === currentClient.id) : [];
  const totalBilled = clientInvoices.reduce((s, i) => s + Number(i.total || 0), 0);
  const totalPaid = clientInvoices.filter(i => i.status === "paid").reduce((s, i) => s + Number(i.total || 0), 0);
  const outstandingBalance = clientInvoices.filter(i => i.status === "sent").reduce((s, i) => s + Number(i.total || 0), 0);
  const weekFromNow = new Date(Date.now() + 7 * 86_400_000);
  const dueThisWeek = clientInvoices.filter(i => !i.dueDate || i.status === "paid" ? false : new Date(i.dueDate) <= weekFromNow && new Date(i.dueDate) >= new Date());
  const dueThisWeekAmount = dueThisWeek.reduce((s, i) => s + Number(i.total || 0), 0);
  const filteredInvoices = (statusFilter === "all" ? clientInvoices : clientInvoices.filter(i => i.status === statusFilter))
    .sort((a, b) => new Date(b.issueDate || 0).getTime() - new Date(a.issueDate || 0).getTime());

  // Fetch the portal access token for this client (used by Stripe payment modal).
  // Token is scoped per client+workspace and verified server-side on every payment request.
  const { data: portalTokenData } = useQuery<{ accessToken: string }>({
    queryKey: ["/api/clients/my-portal-token"],
    enabled: !!currentClient,
    staleTime: 5 * 60 * 1000,
  });
  const portalAccessToken = portalTokenData?.accessToken;

  const downloadPdf = (invoiceId: number) => {
    window.open(`/api/invoices/${invoiceId}/pdf`, "_blank");
  };

  if (!currentClient) {
    const notFoundConfig: CanvasPageConfig = { id: "client-portal-not-found", title: "Client Dashboard", subtitle: "Client Account Not Found", category: "dashboard" };
    return (
      <CanvasHubPage config={notFoundConfig}>
        <div className="p-8 text-center">
          <AlertCircle className="h-12 w-12 text-blue-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Client Account Not Found</h2>
          <p className="text-muted-foreground">You need to be registered as a client to access this portal.</p>
        </div>
      </CanvasHubPage>
    );
  }

  const pageConfig: CanvasPageConfig = {
    id: "client-portal",
    title: "Client Dashboard",
    subtitle: currentClient.companyName || `${currentClient.firstName} ${currentClient.lastName}`,
    category: "dashboard",
  };

  const reportTypeConfig: Record<string, { icon: any; color: string; label: string }> = {
    billing_discrepancy: { icon: DollarSign, color: "text-amber-500", label: "Billing Discrepancy" },
    complaint: { icon: AlertTriangle, color: "text-red-500", label: "Complaint" },
    staff_issue: { icon: AlertCircle, color: "text-orange-500", label: "Staff Issue" },
    schedule_change: { icon: Calendar, color: "text-blue-500", label: "Schedule Change" },
    violation: { icon: XCircle, color: "text-rose-600", label: "Violation" },
    incident: { icon: AlertTriangle, color: "text-red-500", label: "Incident" },
    safety: { icon: Shield, color: "text-green-500", label: "Safety" },
    daily: { icon: FileText, color: "text-blue-500", label: "Daily Report" },
    other: { icon: MessageSquare, color: "text-muted-foreground", label: "Other" },
  };

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="w-full overflow-x-hidden">
        {/* Financial KPI Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { icon: FileText, color: "indigo", label: "Total Billed", value: `$${totalBilled.toFixed(2)}`, badge: `${clientInvoices.length} invoices` },
            { icon: CheckCircle2, color: "green", label: "Total Paid", value: `$${totalPaid.toFixed(2)}`, badge: `${clientInvoices.filter(i => i.status === "paid").length}` },
            { icon: AlertCircle, color: "blue", label: "Outstanding", value: `$${outstandingBalance.toFixed(2)}`, badge: `${clientInvoices.filter(i => i.status === "sent").length}` },
            { icon: Clock, color: "rose", label: "Due This Week", value: `$${dueThisWeekAmount.toFixed(2)}`, badge: `${dueThisWeek.length}` },
          ].map(({ icon: Icon, color, label, value, badge }) => (
            <Card key={label}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <Icon className={`h-5 w-5 text-${color}-500`} />
                  <Badge variant="secondary">{badge}</Badge>
                </div>
                <div className="text-2xl font-bold" data-testid={`text-${label.toLowerCase().replace(/\s+/g, "-")}`}>{value}</div>
                <p className="text-sm text-muted-foreground">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <ScrollArea className="w-full">
            <TabsList className="flex w-max gap-1 mb-2">
              <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
              <TabsTrigger value="invoices" data-testid="tab-invoices">Invoices</TabsTrigger>
              <TabsTrigger value="payments" data-testid="tab-payments">Payments</TabsTrigger>
              <TabsTrigger value="reports" data-testid="tab-reports">
                Reports
                {clientReports.length > 0 && <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-xs">{clientReports.length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="contracts" data-testid="tab-contracts">
                Contracts
                {myContracts.length > 0 && <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-xs">{myContracts.length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="post-orders" data-testid="tab-post-orders">Post Orders</TabsTrigger>
              <TabsTrigger value="documents" data-testid="tab-documents">Documents & COI</TabsTrigger>
              <TabsTrigger value="communications" data-testid="tab-communications">
                Communications
                {communications.length > 0 && <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-xs">{communications.length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="messages" data-testid="tab-messages">
                Messages
              </TabsTrigger>
              <TabsTrigger value="visitor-log" data-testid="tab-visitor-log">
                <Users2 className="h-3.5 w-3.5 mr-1.5" />
                Visitor Log
              </TabsTrigger>
            </TabsList>
          </ScrollArea>

          {/* ── OVERVIEW ─────────────────────────────────────────────────── */}
          <TabsContent value="overview" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5 text-indigo-500" /> Upcoming Payments</CardTitle>
                  <CardDescription>Invoices due in the next 7 days</CardDescription>
                </CardHeader>
                <CardContent>
                  {dueThisWeek.length === 0 ? (
                    <div className="text-center py-8"><CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" /><p className="text-muted-foreground">No payments due this week</p></div>
                  ) : dueThisWeek.map(inv => {
                    const d = getDaysUntilDue(inv.dueDate);
                    return (
                      <div key={inv.id} className="flex items-center justify-between gap-2 p-3 rounded-md border mb-2">
                        <div>
                          <p className="font-semibold">{inv.invoiceNumber}</p>
                          <p className="text-sm text-muted-foreground">Due {formatDate(inv.dueDate)}{d !== null && <span className="ml-2 text-blue-600">({d}d)</span>}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold">${Number(inv.total || 0).toFixed(2)}</p>
                          <Button
                            size="sm"
                            onClick={() => setPayingInvoice(inv)}
                            disabled={!portalAccessToken}
                            data-testid={`button-pay-${inv.id}`}
                          >
                            <CreditCard className="h-3.5 w-3.5 mr-1.5" /> Pay
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary" /> Account Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[
                    ["Total Invoices", clientInvoices.length, "secondary"],
                    ["Paid", clientInvoices.filter(i => i.status === "paid").length, "bg-green-500/10 text-green-600 border-0"],
                    ["Outstanding", clientInvoices.filter(i => i.status === "sent").length, "bg-blue-500/10 text-blue-600 border-0"],
                    ["Contracts Active", myContracts.filter(c => c.status === "executed" || c.status === "signed" || c.status === "accepted").length, "bg-indigo-500/10 text-indigo-600 border-0"],
                    ["Open Issues", communications.filter(c => c.status !== "resolved").length, "bg-amber-500/10 text-amber-600 border-0"],
                  ].map(([label, val, cls]) => (
                    <div key={String(label)} className="flex items-center justify-between">
                      <span className="text-sm">{label}</span>
                      <Badge variant="secondary" className={String(cls)}>{val}</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><MessageSquare className="h-5 w-5 text-primary" /> Quick Actions</CardTitle>
                  <CardDescription>Use HelpAI to communicate with your security provider instantly</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {[
                    {
                      icon: AlertTriangle,
                      color: "text-rose-500",
                      label: "Report an Issue",
                      desc: "Incident, officer behavior, or safety concern",
                      msg: `I need to report an issue at my site. Client: ${currentClient.companyName || currentClient.firstName}. Issue type: `,
                    },
                    {
                      icon: Calendar,
                      color: "text-blue-500",
                      label: "Request Schedule Change",
                      desc: "Adjust guard hours, days, or coverage",
                      msg: `I'd like to request a schedule change for my account. Client: ${currentClient.companyName || currentClient.firstName}. Change requested: `,
                    },
                    {
                      icon: MessageSquare,
                      color: "text-green-500",
                      label: "Submit Feedback",
                      desc: "Share compliments or suggestions",
                      msg: `I'd like to submit feedback about my security service. Client: ${currentClient.companyName || currentClient.firstName}. Feedback: `,
                    },
                    {
                      icon: Shield,
                      color: "text-orange-500",
                      label: "Emergency Contact",
                      desc: "Urgent security escalation required",
                      msg: `URGENT: I need immediate assistance at my site. Client: ${currentClient.companyName || currentClient.firstName}. Emergency details: `,
                    },
                  ].map(({ icon: Icon, color, label, desc, msg }) => (
                    <button
                      key={label}
                      type="button"
                      className="w-full flex items-center gap-3 p-3 rounded-md border text-left hover-elevate active-elevate-2 transition-colors"
                      data-testid={`button-cta-${label.toLowerCase().replace(/\s+/g, "-")}`}
                      onClick={() => {
                        const widget = document.querySelector('[data-testid="dock-chat-input"]') as HTMLTextAreaElement | null;
                        if (widget) {
                          widget.focus();
                          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
                          nativeInputValueSetter?.call(widget, msg);
                          widget.dispatchEvent(new Event("input", { bubbles: true }));
                        } else {
                          const openBtn = document.querySelector('[data-testid="dock-chat-open"]') as HTMLElement | null;
                          openBtn?.click();
                          setTimeout(() => {
                            const w2 = document.querySelector('[data-testid="dock-chat-input"]') as HTMLTextAreaElement | null;
                            if (w2) {
                              const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
                              setter?.call(w2, msg);
                              w2.dispatchEvent(new Event("input", { bubbles: true }));
                            }
                          }, 400);
                        }
                      }}
                    >
                      <Icon className={`h-5 w-5 ${color} shrink-0`} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{label}</p>
                        <p className="text-xs text-muted-foreground">{desc}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto shrink-0" />
                    </button>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── INVOICES ─────────────────────────────────────────────────── */}
          <TabsContent value="invoices" className="mt-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <CardTitle>All Invoices</CardTitle>
                    <CardDescription>View, download, and pay your invoices</CardDescription>
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[160px]" data-testid="select-status-filter">
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Invoices</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="sent">Outstanding</SelectItem>
                      <SelectItem value="draft">Draft</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice #</TableHead>
                        <TableHead>Issue Date</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredInvoices.length === 0 ? (
                        <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No invoices found</TableCell></TableRow>
                      ) : filteredInvoices.map(inv => {
                        const d = getDaysUntilDue(inv.dueDate);
                        const overdue = d !== null && d < 0 && inv.status === "sent";
                        return (
                          <TableRow key={inv.id} data-testid={`row-invoice-${inv.id}`}>
                            <TableCell className="font-medium">{inv.invoiceNumber}</TableCell>
                            <TableCell>{formatDate(inv.issueDate)}</TableCell>
                            <TableCell>
                              {formatDate(inv.dueDate)}
                              {overdue && <Badge className="ml-2 bg-rose-500/10 text-rose-600 border-0">Overdue</Badge>}
                            </TableCell>
                            <TableCell className="text-right font-semibold">${Number(inv.total || 0).toFixed(2)}</TableCell>
                            <TableCell>{statusBadge(inv.status || "")}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <Button size="sm" variant="outline" onClick={() => downloadPdf(inv.id)} data-testid={`button-pdf-${inv.id}`}>
                                  <Download className="h-3.5 w-3.5 mr-1" /> PDF
                                </Button>
                                {inv.status === "sent" && (
                                  <Button
                                    size="sm"
                                    onClick={() => setPayingInvoice(inv)}
                                    disabled={!portalAccessToken}
                                    data-testid={`button-pay-${inv.id}`}
                                  >
                                    <CreditCard className="h-3.5 w-3.5 mr-1" /> Pay Now
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── PAYMENTS ─────────────────────────────────────────────────── */}
          <TabsContent value="payments" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5 text-primary" /> Payment History</CardTitle>
                <CardDescription>All paid invoices</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  {clientInvoices.filter(i => i.status === "paid").length === 0 ? (
                    <div className="text-center py-8"><FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" /><p className="text-muted-foreground">No payment history yet</p></div>
                  ) : clientInvoices.filter(i => i.status === "paid").sort((a, b) => new Date(b.issueDate || 0).getTime() - new Date(a.issueDate || 0).getTime()).map(inv => (
                    <div key={inv.id} className="flex items-center justify-between gap-2 p-4 rounded-md border mb-2" data-testid={`card-payment-${inv.id}`}>
                      <div>
                        <p className="font-semibold">{inv.invoiceNumber}</p>
                        <p className="text-sm text-muted-foreground">Paid {formatDate(inv.dueDate)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-green-600">${Number(inv.total || 0).toFixed(2)}</p>
                        <Badge className="bg-green-500/10 text-green-600 border-0"><CheckCircle2 className="h-3 w-3 mr-1" />Paid</Badge>
                        <Button size="sm" variant="outline" onClick={() => downloadPdf(inv.id)} data-testid={`button-pdf-paid-${inv.id}`}>
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── FIELD REPORTS ────────────────────────────────────────────── */}
          <TabsContent value="reports" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-indigo-500" /> Field Reports</CardTitle>
                <CardDescription>View approved field reports from your service team</CardDescription>
              </CardHeader>
              <CardContent>
                {reportsLoading ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
                ) : clientReports.length === 0 ? (
                  <div className="text-center py-12"><ClipboardCheck className="h-12 w-12 text-muted-foreground mx-auto mb-3" /><p className="text-muted-foreground">No reports submitted yet</p></div>
                ) : clientReports.map(r => {
                  const cfg = reportTypeConfig[r.reportType] || reportTypeConfig.other;
                  const Icon = cfg.icon;
                  return (
                    <div key={r.id} className="flex items-start gap-4 p-4 rounded-md border mb-2" data-testid={`card-report-${r.id}`}>
                      <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center shrink-0"><Icon className={`h-4 w-4 ${cfg.color}`} /></div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-semibold truncate">{r.title}</p>
                          <Badge variant="secondary">{cfg.label}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{r.employeeName && `By ${r.employeeName} • `}{formatDate(r.createdAt)}</p>
                        {r.data?.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{r.data.description}</p>}
                      </div>
                      <Button size="sm" variant="outline" data-testid={`button-view-report-${r.id}`}><Eye className="h-3.5 w-3.5 mr-1" />View</Button>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── CONTRACTS ────────────────────────────────────────────────── */}
          <TabsContent value="contracts" className="mt-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <CardTitle className="flex items-center gap-2"><FileSignature className="h-5 w-5 text-indigo-500" /> Service Agreements</CardTitle>
                    <CardDescription>Your active contracts and service agreements</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {myContracts.length === 0 ? (
                  <div className="text-center py-12">
                    <FileSignature className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                    <p className="text-muted-foreground">No service agreements on file</p>
                    <p className="text-sm text-muted-foreground mt-1">Contact your security provider to set up a service agreement</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {myContracts.map(contract => (
                      <div key={contract.id} className="flex items-start justify-between gap-4 p-4 rounded-md border" data-testid={`card-contract-${contract.id}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <p className="font-semibold">{contract.title}</p>
                            {statusBadge(contract.status)}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Created {formatDate(contract.createdAt)}
                            {contract.expiresAt && ` · Expires ${formatDate(contract.expiresAt)}`}
                          </p>
                          {(contract.status === "expired" || contract.status === "terminated" || (contract.expiresAt && new Date(contract.expiresAt) < new Date(Date.now() + 30 * 86_400_000))) && (
                            <Badge className="mt-2 bg-amber-500/10 text-amber-600 border-0">
                              {contract.status === "expired" ? "Expired — renewal recommended" : "Expiring soon"}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button
                            size="sm" variant="outline"
                            data-testid={`button-renew-contract-${contract.id}`}
                            onClick={() => setRenewalDialog({ open: true, title: contract.title })}
                          >
                            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Renew
                          </Button>
                          <Button size="sm" variant="ghost" data-testid={`button-view-contract-${contract.id}`}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── POST ORDERS ──────────────────────────────────────────────── */}
          <TabsContent value="post-orders" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><ScrollText className="h-5 w-5 text-indigo-500" /> Post Orders</CardTitle>
                <CardDescription>Instructions and standing orders your security team follows at your site</CardDescription>
              </CardHeader>
              <CardContent>
                {postOrders.length === 0 ? (
                  <div className="text-center py-12">
                    <ScrollText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                    <p className="text-muted-foreground">No post orders on file</p>
                    <p className="text-sm text-muted-foreground mt-1">Contact your security provider to establish site post orders</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {postOrders.filter(p => p.isActive).map(po => (
                      <div key={po.id} className="p-4 rounded-md border" data-testid={`card-post-order-${po.id}`}>
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-semibold">{po.title}</p>
                              <Badge variant="outline" className={
                                po.priority === "critical" ? "border-rose-400 text-rose-600" :
                                po.priority === "high" ? "border-amber-400 text-amber-600" :
                                po.priority === "low" ? "border-muted text-muted-foreground" : ""
                              }>{po.priority}</Badge>
                            </div>
                            {po.description && <p className="text-sm text-muted-foreground">{po.description}</p>}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {po.requiresAcknowledgment && <Badge variant="secondary" className="text-xs">Ack Required</Badge>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── DOCUMENTS & COI ──────────────────────────────────────────── */}
          <TabsContent value="documents" className="mt-6">
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-indigo-500" /> Certificate of Insurance</CardTitle>
                      <CardDescription>Request proof of insurance or view previously issued certificates</CardDescription>
                    </div>
                    <Button onClick={() => setCoiDialogOpen(true)} data-testid="button-request-coi">
                      <FilePlus className="h-4 w-4 mr-2" /> Request COI
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md bg-muted/40 p-4 text-sm text-muted-foreground">
                    <p className="font-medium text-foreground mb-1">How it works</p>
                    <ol className="space-y-1 list-decimal list-inside">
                      <li>Click <strong>Request COI</strong> and fill in the certificate holder details</li>
                      <li>Your security provider is notified and prepares the certificate</li>
                      <li>The COI is uploaded to your document portal and emailed to you</li>
                      <li>All requests are logged for audit purposes</li>
                    </ol>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5 text-indigo-500" /> Your Document Vault</CardTitle>
                  <CardDescription>Contracts, COIs, and compliance documents stored securely</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8">
                    <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                    <p className="text-muted-foreground">Documents will appear here once uploaded by your security provider</p>
                    <p className="text-sm text-muted-foreground mt-1">All documents are WORM-protected and available for legal/audit purposes</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── COMMUNICATIONS ───────────────────────────────────────────── */}
          <TabsContent value="communications" className="mt-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <CardTitle className="flex items-center gap-2"><MessageSquare className="h-5 w-5 text-indigo-500" /> Communication History</CardTitle>
                    <CardDescription>All your submitted reports, requests, and interactions — logged for audit and legal purposes</CardDescription>
                  </div>
                  <Badge variant="secondary">{communications.length} records</Badge>
                </div>
              </CardHeader>
              <CardContent>
                {commsLoading ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
                ) : communications.length === 0 ? (
                  <div className="text-center py-12">
                    <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                    <p className="text-muted-foreground">No communication history yet</p>
                    <p className="text-sm text-muted-foreground mt-1">Use the chat button to report issues or contact your provider</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[500px]">
                    <div className="space-y-3">
                      {communications.map(c => {
                        const cfg = reportTypeConfig[c.reportType] || reportTypeConfig.other;
                        const Icon = cfg.icon;
                        return (
                          <div key={c.id} className="flex items-start gap-4 p-4 rounded-md border" data-testid={`card-comm-${c.id}`}>
                            <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center shrink-0">
                              <Icon className={`h-4 w-4 ${cfg.color}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <p className="font-semibold truncate">{c.title}</p>
                                {statusBadge(c.status)}
                                {c.severity && (
                                  <Badge variant="outline" className={
                                    c.severity === "critical" ? "border-rose-400 text-rose-600" :
                                    c.severity === "high" ? "border-amber-400 text-amber-600" : ""
                                  }>{c.severity}</Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground">{cfg.label} · Submitted {formatDate(c.createdAt)}</p>
                              {c.summary && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{c.summary}</p>}
                              {c.resolvedAt && (
                                <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                                  <CheckCheck className="h-3 w-3" /> Resolved {formatDate(c.resolvedAt)}
                                </p>
                              )}
                            </div>
                            <Badge variant="secondary" className="text-xs shrink-0">Logged</Badge>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── MESSAGES (Phase 35G) ───────────────────────────────────────── */}
          <TabsContent value="messages" className="mt-6">
            <ClientMessagesTab clientId={currentClient?.id ? String(currentClient.id) : ""} />
          </TabsContent>

          {/* ── VISITOR LOG ────────────────────────────────────────────────── */}
          <TabsContent value="visitor-log" className="mt-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Users2 className="h-5 w-5" />
                      Visitor Log
                    </CardTitle>
                    <CardDescription>All visitor entries recorded at your sites</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={visitorDateFilter} onValueChange={setVisitorDateFilter}>
                      <SelectTrigger className="w-[140px]" data-testid="select-visitor-date-filter">
                        <SelectValue placeholder="Filter by date" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Time</SelectItem>
                        <SelectItem value="7d">Last 7 Days</SelectItem>
                        <SelectItem value="30d">Last 30 Days</SelectItem>
                        <SelectItem value="90d">Last 90 Days</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="sm"
                      data-testid="button-export-visitors"
                      onClick={() => {
                        const headers = ["Visitor Name","Company","Purpose","Site","Host","Officer","Check In","Check Out"];
                        const rows = filteredVisitors.map(v => [
                          v.visitorName,
                          v.visitorCompany || "",
                          v.purpose || "",
                          v.siteName || "",
                          v.hostName || "",
                          v.checkedInBy || "",
                          new Date(v.checkedInAt).toLocaleString(),
                          v.checkedOutAt ? new Date(v.checkedOutAt).toLocaleString() : "Still On-Site",
                        ]);
                        const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
                        const blob = new Blob([csv], { type: "text/csv" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `visitor-log-${new Date().toISOString().slice(0,10)}.csv`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Export CSV
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {visitorsLoading ? (
                  <div className="space-y-3">
                    {[1,2,3].map(i => <div key={i} className="h-12 rounded-md bg-muted animate-pulse" />)}
                  </div>
                ) : filteredVisitors.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Users2 className="h-12 w-12 mx-auto mb-4 opacity-40" />
                    <p>No visitor records found</p>
                    <p className="text-sm mt-1">Visitor entries logged by security officers will appear here</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[520px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Visitor</TableHead>
                          <TableHead>Purpose</TableHead>
                          <TableHead>Site</TableHead>
                          <TableHead>Host</TableHead>
                          <TableHead>Check In</TableHead>
                          <TableHead>Check Out</TableHead>
                          <TableHead>Officer</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredVisitors.map(v => (
                          <TableRow key={v.id} data-testid={`row-visitor-${v.id}`}>
                            <TableCell>
                              <div>
                                <p className="font-medium">{v.visitorName}</p>
                                {v.visitorCompany && <p className="text-xs text-muted-foreground">{v.visitorCompany}</p>}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{v.purpose || "—"}</TableCell>
                            <TableCell className="text-sm">{v.siteName || "—"}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{v.hostName || "—"}</TableCell>
                            <TableCell className="text-sm whitespace-nowrap">{formatDate(v.checkedInAt)}</TableCell>
                            <TableCell className="text-sm whitespace-nowrap">
                              {v.checkedOutAt ? formatDate(v.checkedOutAt) : (
                                <Badge variant="secondary" className="bg-green-500/10 text-green-600 border-0 text-xs">On-Site</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{v.checkedInBy || "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>

            {/* Phase 35I: Pre-Registration Card */}
            <Card className="mt-4">
              <CardHeader>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <CalendarPlus className="h-5 w-5" />
                      Pre-Register a Visitor
                    </CardTitle>
                    <CardDescription>Schedule expected visitors for fast-track check-in at your site</CardDescription>
                  </div>
                  <Button size="sm" onClick={() => setShowPreRegForm(true)} data-testid="button-open-prereg-form">
                    <CalendarPlus className="h-4 w-4 mr-1.5" /> Pre-Register
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {preRegLoading ? (
                  <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-12 rounded-md bg-muted animate-pulse" />)}</div>
                ) : preRegistrations.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground" data-testid="empty-client-pre-registrations">
                    <CalendarPlus className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-medium">No upcoming pre-registrations</p>
                    <p className="text-xs mt-1">Pre-register expected visitors to speed up on-site check-in</p>
                  </div>
                ) : (
                  <div className="space-y-2" data-testid="client-pre-registrations-list">
                    {preRegistrations.map((p: any) => (
                      <div key={p.id} className="flex items-center justify-between gap-3 p-3 rounded-md border flex-wrap" data-testid={`card-client-prereg-${p.id}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-sm">{p.expected_visitor_name}</p>
                            {p.expected_visitor_company && <p className="text-xs text-muted-foreground">{p.expected_visitor_company}</p>}
                            <Badge variant="secondary" className={`text-xs border-0 ${p.status === 'pending' ? 'bg-blue-500/10 text-blue-600' : p.status === 'checked_in' ? 'bg-green-500/10 text-green-600' : ''}`}>
                              {p.status.replace('_', ' ')}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {p.site_name} · Expected: {new Date(p.expected_arrival).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                          </p>
                        </div>
                        {p.status === 'pending' && (
                          <Badge variant="outline" className="text-xs border-green-400 text-green-600">
                            <UserCheck className="h-3 w-3 mr-1" /> Fast-Track Ready
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Pre-Registration Modal */}
            <UniversalModal open={showPreRegForm} onOpenChange={setShowPreRegForm}>
              <UniversalModalContent className="max-w-lg">
                <UniversalModalHeader>
                  <UniversalModalTitle>Pre-Register Expected Visitor</UniversalModalTitle>
                  <UniversalModalDescription>Schedule a visitor arrival for fast-track check-in at the gate</UniversalModalDescription>
                </UniversalModalHeader>
                <div className="space-y-4 py-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Visitor Name <span className="text-destructive">*</span></Label>
                      <Input value={preRegForm.expectedVisitorName} onChange={e => setPreReg('expectedVisitorName', e.target.value)} placeholder="Jane Smith" data-testid="input-cp-prereg-name" />
                    </div>
                    <div className="space-y-2">
                      <Label>Company</Label>
                      <Input value={preRegForm.expectedVisitorCompany} onChange={e => setPreReg('expectedVisitorCompany', e.target.value)} placeholder="Acme Corp" data-testid="input-cp-prereg-company" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Visitor Type</Label>
                      <Select value={preRegForm.visitorType} onValueChange={v => setPreReg('visitorType', v)}>
                        <SelectTrigger data-testid="select-cp-prereg-type"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="guest">Guest</SelectItem>
                          <SelectItem value="vendor">Vendor</SelectItem>
                          <SelectItem value="contractor">Contractor</SelectItem>
                          <SelectItem value="employee">Employee (External)</SelectItem>
                          <SelectItem value="delivery">Delivery</SelectItem>
                          <SelectItem value="law_enforcement">Law Enforcement</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Post / Site <span className="text-destructive">*</span></Label>
                      <Input value={preRegForm.siteName} onChange={e => setPreReg('siteName', e.target.value)} placeholder="Main Lobby" data-testid="input-cp-prereg-site" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Expected Arrival <span className="text-destructive">*</span></Label>
                      <Input type="datetime-local" value={preRegForm.expectedArrival} onChange={e => setPreReg('expectedArrival', e.target.value)} data-testid="input-cp-prereg-arrival" />
                    </div>
                    <div className="space-y-2">
                      <Label>Expected Departure</Label>
                      <Input type="datetime-local" value={preRegForm.expectedDeparture} onChange={e => setPreReg('expectedDeparture', e.target.value)} data-testid="input-cp-prereg-departure" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Host Name</Label>
                      <Input value={preRegForm.hostName} onChange={e => setPreReg('hostName', e.target.value)} placeholder="John Doe" data-testid="input-cp-prereg-host" />
                    </div>
                    <div className="space-y-2">
                      <Label>Host Contact</Label>
                      <Input value={preRegForm.hostContact} onChange={e => setPreReg('hostContact', e.target.value)} placeholder="555-0100" data-testid="input-cp-prereg-contact" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Reason for Visit</Label>
                    <Textarea value={preRegForm.reason} onChange={e => setPreReg('reason', e.target.value)} placeholder="Purpose of visit..." data-testid="input-cp-prereg-reason" />
                  </div>
                </div>
                <UniversalModalFooter>
                  <Button variant="outline" onClick={() => setShowPreRegForm(false)} data-testid="button-cp-prereg-cancel">Cancel</Button>
                  <Button
                    onClick={() => createPreRegMutation.mutate()}
                    disabled={createPreRegMutation.isPending || !preRegForm.expectedVisitorName || !preRegForm.siteName || !preRegForm.expectedArrival}
                    data-testid="button-cp-prereg-submit"
                  >
                    {createPreRegMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CalendarPlus className="h-4 w-4 mr-2" />}
                    Submit Pre-Registration
                  </Button>
                </UniversalModalFooter>
              </UniversalModalContent>
            </UniversalModal>
          </TabsContent>
        </Tabs>
      </div>

      {/* Floating DockChat Widget */}
      <DockChatWidget
        orgWorkspaceId={(user as any)?.workspaceId || ""}
        clientId={String(currentClient.id)}
        clientName={currentClient.companyName || `${currentClient.firstName || ""} ${currentClient.lastName || ""}`.trim()}
        clientEmail={currentClient.email || user?.email || ""}
      />

      {/* Dialogs */}
      <COIRequestDialog open={coiDialogOpen} onOpenChange={setCoiDialogOpen} />
      <RenewalRequestDialog
        open={renewalDialog.open}
        onOpenChange={v => setRenewalDialog(p => ({ ...p, open: v }))}
        contractTitle={renewalDialog.title}
      />

      {/* Stripe Invoice Payment Modal */}
      {payingInvoice && portalAccessToken && (
        <InvoicePaymentModal
          invoice={payingInvoice}
          accessToken={portalAccessToken}
          onClose={() => setPayingInvoice(null)}
          onPaid={() => queryClient.invalidateQueries({ queryKey: ["/api/invoices"] })}
        />
      )}
    </CanvasHubPage>
  );
}
