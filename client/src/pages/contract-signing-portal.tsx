import { useState, useRef, useEffect, useCallback } from "react";
import { sanitizeRichHtml } from "@/lib/sanitize";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  Eye,
  FileText,
  Pen,
  CheckCircle,
  XCircle,
  Clock,
  Shield,
  AlertTriangle,
  Download,
  MessageSquare,
  Eraser,
  Lock,
  ChevronDown,
  ChevronUp,
  Upload,
  CheckSquare,
  Hourglass,
} from 'lucide-react';;
import { format } from "date-fns";

interface ContractData {
  id: string;
  title: string;
  docType: string;
  content: string;
  summary?: string;
  clientName?: string;
  clientEmail?: string;
  services?: any[];
  billingTerms?: any;
  totalValue?: string;
  status: string;
  effectiveDate?: string;
  termEndDate?: string;
  expiresAt?: string;
  requiresWitness?: boolean;
  requiresNotary?: boolean;
  specialTerms?: string;
  viewCount?: number;
  createdAt: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  draft: { label: "Draft", color: "bg-muted text-muted-foreground", icon: FileText },
  sent: { label: "Awaiting Review", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200", icon: Eye },
  viewed: { label: "Under Review", color: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200", icon: Eye },
  accepted: { label: "Accepted", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200", icon: CheckCircle },
  signed: { label: "Signed", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200", icon: CheckCircle },
  partially_signed: { label: "Awaiting Company Signature", color: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200", icon: Hourglass },
  executed: { label: "Fully Executed", color: "bg-green-200 text-green-900 dark:bg-green-800 dark:text-green-100", icon: Shield },
  declined: { label: "Declined", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200", icon: XCircle },
  changes_requested: { label: "Changes Requested", color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200", icon: MessageSquare },
  expired: { label: "Expired", color: "bg-muted text-muted-foreground", icon: Clock },
};

const INITIAL_SECTIONS = [
  { key: "services", label: "Section 1: Scope of Services" },
  { key: "billing", label: "Section 2: Billing Terms & Rates" },
  { key: "liability", label: "Section 3: Liability & Insurance" },
  { key: "termination", label: "Section 4: Termination & Cancellation" },
];

const DOC_TYPE_LABELS: Record<string, string> = {
  proposal: "Proposal",
  contract: "Contract",
  sow: "Statement of Work",
  msa: "Master Service Agreement",
  nda: "Non-Disclosure Agreement",
  amendment: "Amendment",
  addendum: "Addendum",
};

function SignaturePad({ onSignatureChange, onClear }: { onSignatureChange: (data: string) => void; onClear: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return;
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    ctx.strokeStyle = "hsl(var(--foreground))";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  useEffect(() => {
    initCanvas();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => {
      initCanvas();
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [initCanvas]);

  const getPosition = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }, []);

  const startDrawing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    const pos = getPosition(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    setIsDrawing(true);
  }, [getPosition]);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    const pos = getPosition(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    setHasSignature(true);
  }, [isDrawing, getPosition]);

  const stopDrawing = useCallback(() => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas && hasSignature) {
      onSignatureChange(canvas.toDataURL("image/png"));
    }
  }, [isDrawing, hasSignature, onSignatureChange]);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    onClear();
  }, [onClear]);

  return (
    <div className="space-y-2">
      <div className="relative border rounded-md overflow-hidden bg-background">
        <canvas
          ref={canvasRef}
          className="w-full cursor-crosshair touch-none"
          style={{ height: "190px" }}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          data-testid="signature-canvas"
        />
        <div className="absolute bottom-2 left-3 right-3 border-b border-dashed border-muted-foreground/30 pointer-events-none" />
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">Draw your signature above</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={clearCanvas}
          disabled={!hasSignature}
          data-testid="button-clear-signature"
        >
          <Eraser className="w-3 h-3 mr-1" />
          Clear
        </Button>
      </div>
    </div>
  );
}

function TypedSignature({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Type your full legal name"
        data-testid="input-typed-signature"
      />
      {value && (
        <div className="border rounded-md p-4 bg-background flex items-center justify-center min-h-[80px]">
          <span
            className="text-2xl italic text-foreground"
            style={{ fontFamily: "'Dancing Script', 'Brush Script MT', cursive" }}
            data-testid="text-signature-preview"
          >
            {value}
          </span>
        </div>
      )}
    </div>
  );
}

export default function ContractSigningPortal({ token }: { token: string }) {
  const { toast } = useToast();
  const [signatureTab, setSignatureTab] = useState<string>("draw");
  const [drawnSignatureData, setDrawnSignatureData] = useState<string>("");
  const [typedSignature, setTypedSignature] = useState("");
  const [signerName, setSignerName] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [signerTitle, setSignerTitle] = useState("");
  const [consentGiven, setConsentGiven] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [changesRequested, setChangesRequested] = useState("");
  const [showDecline, setShowDecline] = useState(false);
  const [showChanges, setShowChanges] = useState(false);
  const [showContent, setShowContent] = useState(true);
  const [sectionInitials, setSectionInitials] = useState<Record<string, boolean>>({});
  const [govIdType, setGovIdType] = useState("");
  const [govIdDataUrl, setGovIdDataUrl] = useState<string>("");

  const contractQuery = useQuery<{ contract: ContractData }>({
    queryKey: ["/api/contracts/portal", token],
    queryFn: async () => {
      const res = await fetch(`/api/contracts/portal/${token}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to load" }));
        throw new Error(err.error || "Failed to load contract");
      }
      return res.json();
    },
    retry: false,
  });

  const signMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch(`/api/contracts/portal/${token}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Sign failed" }));
        throw new Error(err.error || "Failed to sign");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Contract signed successfully", description: "A confirmation will be sent to your email." });
      contractQuery.refetch();
    },
    onError: (err: Error) => {
      toast({ title: "Signing failed", description: err.message, variant: "destructive" });
    },
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/contracts/portal/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Accept failed" }));
        throw new Error(err.error || "Failed to accept");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Proposal accepted", description: "The proposal has been accepted." });
      contractQuery.refetch();
    },
    onError: (err: Error) => {
      toast({ title: "Action failed", description: err.message, variant: "destructive" });
    },
  });

  const declineMutation = useMutation({
    mutationFn: async (reason: string) => {
      const res = await fetch(`/api/contracts/portal/${token}/decline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Decline failed" }));
        throw new Error(err.error || "Failed to decline");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Declined", description: "The document has been declined." });
      setShowDecline(false);
      contractQuery.refetch();
    },
    onError: (err: Error) => {
      toast({ title: "Action failed", description: err.message, variant: "destructive" });
    },
  });

  const requestChangesMutation = useMutation({
    mutationFn: async (changes: string) => {
      const res = await fetch(`/api/contracts/portal/${token}/request-changes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changesRequested: changes }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error || "Failed to request changes");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Changes requested", description: "Your requested changes have been sent." });
      setShowChanges(false);
      contractQuery.refetch();
    },
    onError: (err: Error) => {
      toast({ title: "Action failed", description: err.message, variant: "destructive" });
    },
  });

  const handleSign = () => {
    if (!signerName.trim() || !signerEmail.trim()) {
      toast({ title: "Missing information", description: "Please enter your name and email.", variant: "destructive" });
      return;
    }
    if (!consentGiven) {
      toast({ title: "Consent required", description: "Please agree to the electronic signature consent.", variant: "destructive" });
      return;
    }
    const allInitialed = INITIAL_SECTIONS.every((s) => sectionInitials[s.key]);
    if (!allInitialed) {
      toast({ title: "Initials required", description: "Please initial all contract sections before signing.", variant: "destructive" });
      return;
    }
    const signatureType = signatureTab === "draw" ? "drawn" : "typed";
    const signatureData = signatureTab === "draw" ? drawnSignatureData : typedSignature;
    if (!signatureData) {
      toast({ title: "Signature required", description: `Please ${signatureTab === "draw" ? "draw" : "type"} your signature.`, variant: "destructive" });
      return;
    }

    signMutation.mutate({
      signerName: signerName.trim(),
      signerEmail: signerEmail.trim(),
      signerTitle: signerTitle.trim() || undefined,
      signatureType,
      signatureData,
      consentText: "I agree that my electronic signature is the legal equivalent of my manual signature.",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      clientInitials: sectionInitials,
      governmentIdData: govIdDataUrl || undefined,
      governmentIdType: govIdType || undefined,
    });
  };

  if (contractQuery.isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardContent className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
            <p className="text-muted-foreground" data-testid="text-loading">Loading document...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (contractQuery.error) {
    const errMsg = (contractQuery.error as Error).message;
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardContent className="p-8 text-center space-y-4">
            <AlertTriangle className="w-12 h-12 text-destructive mx-auto" />
            <h2 className="text-lg font-semibold" data-testid="text-error-title">Unable to Access Document</h2>
            <p className="text-muted-foreground text-sm" data-testid="text-error-message">
              {errMsg.includes("expired") ? "This link has expired. Please contact the sender for a new link." :
               errMsg.includes("revoked") ? "This access link has been revoked." :
               "This link is invalid or the document is no longer available."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const contract = contractQuery.data?.contract;
  if (!contract) return null;

  const statusInfo = STATUS_CONFIG[contract.status] || STATUS_CONFIG.draft;
  const StatusIcon = statusInfo.icon;
  const docTypeLabel = DOC_TYPE_LABELS[contract.docType] || contract.docType;
  const isActionable = ["sent", "viewed"].includes(contract.status);
  const isSignable = ["accepted"].includes(contract.status);
  const isAwaitingOrgSig = contract.status === "partially_signed";
  const isFinal = ["signed", "executed", "declined", "partially_signed"].includes(contract.status);

  return (
    <div className="min-h-screen bg-background" data-testid="contract-signing-portal">
      <div className="bg-card border-b">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <Shield className="w-5 h-5 text-primary shrink-0" />
            <span className="font-semibold text-sm truncate" data-testid="text-portal-brand">Secure Document Portal</span>
          </div>
          <div className="flex items-center gap-2">
            <Lock className="w-3 h-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Encrypted</span>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <Badge className={statusInfo.color} data-testid="badge-contract-status">
                  <StatusIcon className="w-3 h-3 mr-1" />
                  {statusInfo.label}
                </Badge>
                <Badge variant="outline" data-testid="badge-doc-type">{docTypeLabel}</Badge>
              </div>
              <CardTitle className="text-xl" data-testid="text-contract-title">{contract.title}</CardTitle>
              {contract.clientName && (
                <p className="text-sm text-muted-foreground mt-1" data-testid="text-client-name">
                  Prepared for: {contract.clientName}
                </p>
              )}
            </div>
            <div className="text-right text-sm text-muted-foreground shrink-0">
              <p>Created: {format(new Date(contract.createdAt), "MMM d, yyyy")}</p>
              {contract.expiresAt && (
                <p className="text-amber-600 dark:text-amber-400">
                  Expires: {format(new Date(contract.expiresAt), "MMM d, yyyy")}
                </p>
              )}
            </div>
          </CardHeader>
        </Card>

        {contract.summary && (
          <Card>
            <CardContent className="p-4">
              <h3 className="text-sm font-medium mb-2">Summary</h3>
              <p className="text-sm text-muted-foreground" data-testid="text-contract-summary">{contract.summary}</p>
            </CardContent>
          </Card>
        )}

        {(contract.totalValue || contract.effectiveDate || contract.termEndDate) && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {contract.totalValue && (
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Total Value</p>
                  <p className="text-lg font-semibold" data-testid="text-total-value">
                    ${parseFloat(contract.totalValue).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </p>
                </CardContent>
              </Card>
            )}
            {contract.effectiveDate && (
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Effective Date</p>
                  <p className="text-sm font-medium" data-testid="text-effective-date">
                    {format(new Date(contract.effectiveDate), "MMMM d, yyyy")}
                  </p>
                </CardContent>
              </Card>
            )}
            {contract.termEndDate && (
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Term End</p>
                  <p className="text-sm font-medium" data-testid="text-term-end">
                    {format(new Date(contract.termEndDate), "MMMM d, yyyy")}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        <Card>
          <CardHeader
            className="flex flex-row items-center justify-between gap-2 cursor-pointer"
            onClick={() => setShowContent(!showContent)}
          >
            <CardTitle className="text-base">Document Content</CardTitle>
            <Button variant="ghost" size="icon" data-testid="button-toggle-content">
              {showContent ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </CardHeader>
          {showContent && (
            <CardContent>
              <ScrollArea className="max-h-[500px]">
                <div
                  className="prose dark:prose-invert max-w-none text-sm leading-relaxed"
                  data-testid="text-contract-content"
                  dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(contract.content.replace(/\n/g, "<br/>")) }}
                />
              </ScrollArea>
            </CardContent>
          )}
        </Card>

        {contract.specialTerms && (
          <Card>
            <CardContent className="p-4">
              <h3 className="text-sm font-medium mb-2 flex items-center gap-1">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                Special Terms
              </h3>
              <p className="text-sm text-muted-foreground" data-testid="text-special-terms">{contract.specialTerms}</p>
            </CardContent>
          </Card>
        )}

        {isFinal && (
          <Card>
            <CardContent className="p-6 text-center space-y-2">
              <StatusIcon className={`w-10 h-10 mx-auto ${contract.status === "declined" ? "text-destructive" : "text-green-600 dark:text-green-400"}`} />
              <h3 className="text-lg font-semibold" data-testid="text-final-status">
                {contract.status === "declined" ? "Document Declined" :
                 contract.status === "executed" ? "Fully Executed" : "Signed Successfully"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {contract.status === "declined" ? "This document has been declined." :
                 "This document has been signed and is legally binding."}
              </p>
            </CardContent>
          </Card>
        )}

        {contract.status === "changes_requested" && (
          <Card>
            <CardContent className="p-6 text-center space-y-2">
              <MessageSquare className="w-10 h-10 mx-auto text-orange-500" />
              <h3 className="text-lg font-semibold">Changes Requested</h3>
              <p className="text-sm text-muted-foreground">
                You have requested changes to this document. The sender will review and update it.
              </p>
              // @ts-ignore — TS migration: fix in refactoring sprint
              {(contract as any).changesRequested && (
                // @ts-expect-error — TS migration: fix in refactoring sprint
                <p className="text-sm bg-muted p-3 rounded-md text-left mt-2">{contract.changesRequested}</p>
              )}
            </CardContent>
          </Card>
        )}

        {isAwaitingOrgSig && (
          <Card className="border-amber-300 bg-amber-50/50 dark:bg-amber-900/10">
            <CardContent className="p-6 text-center space-y-3">
              <Hourglass className="w-10 h-10 mx-auto text-amber-500" />
              <h3 className="text-lg font-semibold text-amber-700 dark:text-amber-300">Your Signature Was Received</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Thank you for signing. This contract is now awaiting the countersignature from the service provider.
                You will receive a confirmation email once both parties have signed.
              </p>
              <div className="flex items-center justify-center gap-2 text-xs text-amber-600 dark:text-amber-400">
                <Lock className="w-3 h-3" />
                <span>Your signature is securely recorded and time-stamped</span>
              </div>
            </CardContent>
          </Card>
        )}

        {isActionable && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Review & Respond</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Please review the document above carefully, then choose one of the following actions:
              </p>
              <div className="flex flex-wrap gap-3">
                {contract.docType === "proposal" ? (
                  <Button
                    onClick={() => acceptMutation.mutate()}
                    disabled={acceptMutation.isPending}
                    data-testid="button-accept-proposal"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    {acceptMutation.isPending ? "Accepting..." : "Accept Proposal"}
                  </Button>
                ) : (
                  <Button
                    onClick={() => acceptMutation.mutate()}
                    disabled={acceptMutation.isPending}
                    data-testid="button-accept-contract"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    {acceptMutation.isPending ? "Accepting..." : "Accept & Proceed to Sign"}
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => { setShowChanges(true); setShowDecline(false); }}
                  data-testid="button-request-changes"
                >
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Request Changes
                </Button>
                <Button
                  variant="outline"
                  onClick={() => { setShowDecline(true); setShowChanges(false); }}
                  className="text-destructive"
                  data-testid="button-decline"
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Decline
                </Button>
              </div>

              {showChanges && (
                <div className="space-y-3 pt-2">
                  <Separator />
                  <Label>Describe the changes you'd like:</Label>
                  <Textarea
                    value={changesRequested}
                    onChange={(e) => setChangesRequested(e.target.value)}
                    placeholder="Please describe what changes you'd like made to this document..."
                    data-testid="input-changes-requested"
                  />
                  <div className="flex gap-2">
                    <Button
                      onClick={() => requestChangesMutation.mutate(changesRequested)}
                      disabled={!changesRequested.trim() || requestChangesMutation.isPending}
                      data-testid="button-submit-changes"
                    >
                      {requestChangesMutation.isPending ? "Sending..." : "Submit Request"}
                    </Button>
                    <Button variant="ghost" onClick={() => setShowChanges(false)}>Cancel</Button>
                  </div>
                </div>
              )}

              {showDecline && (
                <div className="space-y-3 pt-2">
                  <Separator />
                  <Label>Reason for declining (optional):</Label>
                  <Textarea
                    value={declineReason}
                    onChange={(e) => setDeclineReason(e.target.value)}
                    placeholder="Please share why you're declining this document..."
                    data-testid="input-decline-reason"
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="destructive"
                      onClick={() => declineMutation.mutate(declineReason)}
                      disabled={declineMutation.isPending}
                      data-testid="button-confirm-decline"
                    >
                      {declineMutation.isPending ? "Declining..." : "Confirm Decline"}
                    </Button>
                    <Button variant="ghost" onClick={() => setShowDecline(false)}>Cancel</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {isSignable && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Pen className="w-4 h-4" />
                Sign Document
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <CheckSquare className="w-4 h-4 text-primary" />
                  <p className="text-sm font-medium">Initial Each Section to Confirm Review *</p>
                </div>
                <p className="text-xs text-muted-foreground">Click the checkbox next to each section to confirm you have read and agree to it.</p>
                <div className="space-y-2">
                  {INITIAL_SECTIONS.map((section) => (
                    <div key={section.key} className="flex items-center gap-3 p-2.5 rounded-md border" data-testid={`row-initial-${section.key}`}>
                      <Checkbox
                        id={`initial-${section.key}`}
                        checked={!!sectionInitials[section.key]}
                        onCheckedChange={(v) => setSectionInitials((prev) => ({ ...prev, [section.key]: v === true }))}
                        data-testid={`checkbox-initial-${section.key}`}
                      />
                      <Label htmlFor={`initial-${section.key}`} className="text-sm cursor-pointer flex-1">
                        {section.label}
                      </Label>
                      {sectionInitials[section.key] && (
                        <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Upload className="w-4 h-4 text-primary" />
                  <p className="text-sm font-medium">Government ID Verification (Recommended)</p>
                </div>
                <p className="text-xs text-muted-foreground">Upload a copy of your government-issued ID to strengthen the legal validity of this agreement.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label>ID Type</Label>
                    <select
                      className="w-full mt-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
                      value={govIdType}
                      onChange={(e) => setGovIdType(e.target.value)}
                      data-testid="select-gov-id-type"
                    >
                      <option value="">Select type…</option>
                      <option value="drivers_license">Driver's License</option>
                      <option value="passport">Passport</option>
                      <option value="state_id">State ID</option>
                      <option value="military_id">Military ID</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <Label>Upload ID</Label>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      className="mt-1 w-full text-sm file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-xs file:bg-primary file:text-primary-foreground cursor-pointer"
                      data-testid="input-gov-id-file"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (evt) => setGovIdDataUrl(evt.target?.result as string);
                        reader.readAsDataURL(file);
                      }}
                    />
                  </div>
                </div>
                {govIdDataUrl && (
                  <div className="flex items-center gap-2 text-xs text-green-600">
                    <CheckCircle className="w-3.5 h-3.5" /> ID uploaded successfully
                  </div>
                )}
              </div>

              <Separator />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="signerName">Full Legal Name *</Label>
                  <Input
                    id="signerName"
                    value={signerName}
                    onChange={(e) => setSignerName(e.target.value)}
                    placeholder="John Smith"
                    data-testid="input-signer-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signerEmail">Email Address *</Label>
                  <Input
                    id="signerEmail"
                    type="email"
                    value={signerEmail}
                    onChange={(e) => setSignerEmail(e.target.value)}
                    placeholder="john@company.com"
                    data-testid="input-signer-email"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="signerTitle">Title / Position (optional)</Label>
                  <Input
                    id="signerTitle"
                    value={signerTitle}
                    onChange={(e) => setSignerTitle(e.target.value)}
                    placeholder="CEO, Director, etc."
                    data-testid="input-signer-title"
                  />
                </div>
              </div>

              <Separator />

              <div>
                <Label className="mb-2 block">Signature Method</Label>
                <Tabs value={signatureTab} onValueChange={setSignatureTab}>
                  <TabsList className="w-full sm:w-auto overflow-x-auto">
                    <TabsTrigger value="draw" data-testid="tab-draw-signature">
                      <Pen className="w-3 h-3 mr-1" />
                      Draw
                    </TabsTrigger>
                    <TabsTrigger value="type" data-testid="tab-type-signature">
                      <FileText className="w-3 h-3 mr-1" />
                      Type
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="draw" className="mt-3">
                    <SignaturePad
                      onSignatureChange={setDrawnSignatureData}
                      onClear={() => setDrawnSignatureData("")}
                    />
                  </TabsContent>
                  <TabsContent value="type" className="mt-3">
                    <TypedSignature value={typedSignature} onChange={setTypedSignature} />
                  </TabsContent>
                </Tabs>
              </div>

              <Separator />

              <div className="flex items-start gap-3">
                <Checkbox
                  id="consent"
                  checked={consentGiven}
                  onCheckedChange={(v) => setConsentGiven(v === true)}
                  data-testid="checkbox-consent"
                />
                <Label htmlFor="consent" className="text-sm leading-relaxed cursor-pointer">
                  I agree that my electronic signature is the legal equivalent of my manual signature on this document. 
                  I consent to be legally bound by this document's terms upon signing.
                </Label>
              </div>

              <Button
                className="w-full"
                size="lg"
                onClick={handleSign}
                disabled={signMutation.isPending}
                data-testid="button-sign-document"
              >
                <Pen className="w-4 h-4 mr-2" />
                {signMutation.isPending ? "Signing..." : "Sign Document"}
              </Button>

              <p className="text-xs text-muted-foreground text-center">
                By signing, you acknowledge that electronic signatures are legally binding under 
                the E-SIGN Act and UETA. Your IP address, timestamp, and browser information 
                will be recorded for verification purposes.
              </p>
            </CardContent>
          </Card>
        )}

        <div className="text-center text-xs text-muted-foreground pb-8 space-y-1">
          <p>Secure Document Portal</p>
          <p className="flex items-center justify-center gap-1">
            <Lock className="w-3 h-3" />
            All data is encrypted in transit and at rest
          </p>
        </div>
      </div>
    </div>
  );
}
