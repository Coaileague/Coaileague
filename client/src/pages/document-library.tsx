import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiFetch, AnyResponse } from "@/lib/apiError";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { UniversalModal, UniversalModalHeader, UniversalModalTitle, UniversalModalTrigger, UniversalModalFooter, UniversalModalDescription, UniversalModalContent } from '@/components/ui/universal-modal';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Upload, FileText, FolderOpen, Pen, Eye, Download, Trash2, Search, Clock, User, CheckCircle, XCircle, Send, Shield, Briefcase, Filter, Plus, X, Mail, Users, FileSignature, Loader2, ExternalLink, MoreHorizontal } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";
import { CanvasHubPage, type CanvasPageConfig } from '@/components/canvas-hub';
import { PDFFieldPlacer } from '@/components/PDFFieldPlacer';

const DOCUMENT_CATEGORIES = [
  { id: "client_contract", label: "Client Contracts", icon: FileText },
  { id: "employee_handbook", label: "Employee Handbooks", icon: FileText },
  { id: "sop", label: "SOPs & Procedures", icon: FolderOpen },
  { id: "training_material", label: "Training Materials", icon: FileText },
  { id: "form", label: "Forms & Templates", icon: FileText },
  { id: "proposal", label: "Proposals", icon: FileText },
  { id: "shared", label: "Shared Documents", icon: FolderOpen },
];

const CONTRACT_STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  draft: { label: "Draft", variant: "secondary" },
  sent: { label: "Sent", variant: "outline" },
  viewed: { label: "Viewed", variant: "outline" },
  accepted: { label: "Accepted", variant: "default" },
  signed: { label: "Signed", variant: "default" },
  executed: { label: "Executed", variant: "default" },
  declined: { label: "Declined", variant: "destructive" },
  changes_requested: { label: "Changes Requested", variant: "outline" },
  expired: { label: "Expired", variant: "secondary" },
};

const CONTRACT_DOC_TYPES: Record<string, string> = {
  proposal: "Proposal",
  contract: "Contract",
  sow: "Statement of Work",
  msa: "Master Service Agreement",
  nda: "NDA",
  amendment: "Amendment",
  addendum: "Addendum",
};

interface PipelineContract {
  id: string;
  title: string;
  docType: string;
  clientName?: string;
  clientEmail?: string;
  status: string;
  totalValue?: string;
  createdAt: string;
  sentAt?: string;
  acceptedAt?: string;
  executedAt?: string;
  expiresAt?: string;
}

function CreateContractDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    title: "",
    docType: "contract",
    clientName: "",
    clientEmail: "",
    totalValue: "",
    content: "",
    expiresAt: "",
    specialTerms: "",
  });

  const TEMPLATES: Record<string, { title: string; content: string }> = {
    service_agreement: {
      title: "Security Services Agreement",
      content: `SECURITY SERVICES AGREEMENT\n\nThis Security Services Agreement ("Agreement") is entered into between [CLIENT NAME] ("Client") and [YOUR COMPANY] ("Service Provider").\n\n1. SERVICES\nService Provider agrees to furnish trained security personnel to Client at the location(s) designated by Client.\n\n2. TERM\nThis Agreement shall commence on the Effective Date and continue for a period of twelve (12) months unless earlier terminated.\n\n3. COMPENSATION\nClient agrees to pay Service Provider the rates set forth in the attached Schedule A.\n\n4. INDEMNIFICATION\nClient shall indemnify and hold harmless Service Provider from any claims arising out of Client's negligence.\n\n5. GOVERNING LAW\nThis Agreement shall be governed by the laws of the State of [STATE].\n\nIN WITNESS WHEREOF, the parties have executed this Agreement as of the date last signed below.`,
    },
    nda: {
      title: "Non-Disclosure Agreement",
      content: `MUTUAL NON-DISCLOSURE AGREEMENT\n\nThis Mutual Non-Disclosure Agreement ("Agreement") is entered into between [CLIENT NAME] ("Disclosing Party") and [YOUR COMPANY] ("Receiving Party").\n\n1. CONFIDENTIAL INFORMATION\nEach party may disclose certain confidential information to the other party in connection with evaluating a potential business relationship.\n\n2. OBLIGATIONS\nThe Receiving Party agrees to: (a) keep all Confidential Information strictly confidential; (b) not disclose Confidential Information to third parties without prior written consent.\n\n3. TERM\nThis Agreement shall remain in effect for a period of three (3) years from the date of execution.\n\n4. GOVERNING LAW\nThis Agreement shall be governed by the laws of the State of [STATE].`,
    },
    proposal: {
      title: "Security Services Proposal",
      content: `SECURITY SERVICES PROPOSAL\n\nPrepared for: [CLIENT NAME]\nPrepared by: [YOUR COMPANY]\nDate: [DATE]\n\nEXECUTIVE SUMMARY\nWe are pleased to present this proposal for comprehensive security services tailored to meet your organization's needs.\n\nSCOPE OF SERVICES\n• Uniformed security officers (armed/unarmed as required)\n• Access control management\n• Visitor management and badging\n• Emergency response coordination\n• Incident reporting and documentation\n\nSTAFFING PLAN\n[Detail officer counts, shifts, and coverage plan here]\n\nPRICING\n[Detail service rates and billing terms here]\n\nWHY CHOOSE US\n[Your company differentiators, certifications, experience]\n\nNEXT STEPS\nUpon acceptance of this proposal, we will schedule an onboarding meeting and begin transition planning.`,
    },
    employee_disciplinary: {
      title: "Employee Written Warning",
      content: `EMPLOYEE WRITTEN WARNING\n\nEmployee Name: [EMPLOYEE NAME]\nEmployee ID: [ID]\nDate of Warning: [DATE]\nIssued By: [SUPERVISOR NAME]\n\nNATURE OF VIOLATION\n[Describe the policy violation or performance issue in detail]\n\nPRIOR WARNINGS\n[List any prior verbal or written warnings]\n\nCORRECTIVE ACTION REQUIRED\n[Specify exactly what the employee must do to correct the issue and by when]\n\nCONSEQUENCES\nFailure to improve as outlined above may result in further disciplinary action up to and including termination of employment.\n\nEMPLOYEE ACKNOWLEDGMENT\nI acknowledge receipt of this warning. My signature does not necessarily indicate agreement.\n\nEmployee Signature: ________________________  Date: ________\nSupervisor Signature: _______________________  Date: ________`,
    },
    msa: {
      title: "Master Service Agreement",
      content: `MASTER SERVICE AGREEMENT\n\nThis Master Service Agreement ("MSA") is entered into between [CLIENT NAME] ("Client") and [YOUR COMPANY] ("Service Provider").\n\n1. SERVICES\nService Provider shall provide the services described in individual Statements of Work ("SOW") executed under this MSA.\n\n2. PAYMENT TERMS\nClient shall pay invoices within thirty (30) days of receipt. Late payments accrue interest at 1.5% per month.\n\n3. INTELLECTUAL PROPERTY\nAll work product created by Service Provider under SOWs shall be the property of Client upon full payment.\n\n4. LIMITATION OF LIABILITY\nNeither party shall be liable for indirect, incidental, or consequential damages.\n\n5. TERM AND TERMINATION\nThis MSA shall remain in effect until terminated by either party with thirty (30) days written notice.\n\n6. DISPUTE RESOLUTION\nDisputes shall be resolved by binding arbitration under the AAA Commercial Arbitration Rules.`,
    },
  };

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/contracts", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts"] });
      toast({ title: "Contract created", description: `"${form.title}" is ready in Draft status` });
      onOpenChange(false);
      setForm({ title: "", docType: "contract", clientName: "", clientEmail: "", totalValue: "", content: "", expiresAt: "", specialTerms: "" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to create", description: err.message, variant: "destructive" });
    },
  });

  const applyTemplate = (key: string) => {
    const tpl = TEMPLATES[key];
    if (tpl) setForm(prev => ({ ...prev, title: tpl.title, content: tpl.content }));
  };

  const handleCreate = () => {
    if (!form.title || !form.clientName || !form.clientEmail || !form.content) {
      toast({ title: "Fill in all required fields", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      title: form.title,
      docType: form.docType,
      clientName: form.clientName,
      clientEmail: form.clientEmail,
      content: form.content,
      totalValue: form.totalValue ? parseFloat(form.totalValue) : undefined,
      expiresAt: form.expiresAt || undefined,
      specialTerms: form.specialTerms || undefined,
    });
  };

  return (
    <UniversalModal open={open} onOpenChange={onOpenChange}>
      <UniversalModalContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <UniversalModalHeader>
          <UniversalModalTitle>New Contract / Document</UniversalModalTitle>
          <UniversalModalDescription>Create a contract, proposal, NDA, or any document and send it for signing via email or internally.</UniversalModalDescription>
        </UniversalModalHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Start from a Template</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {Object.entries(TEMPLATES).map(([key, tpl]) => (
                <Button key={key} size="sm" variant="outline" onClick={() => applyTemplate(key)} data-testid={`button-template-${key}`}>
                  {tpl.title}
                </Button>
              ))}
            </div>
          </div>
          <Separator />
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label htmlFor="cc-title">Document Title *</Label>
              <Input id="cc-title" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Security Services Agreement — Acme Corp" data-testid="input-contract-title" />
            </div>
            <div>
              <Label htmlFor="cc-type">Document Type</Label>
              <Select value={form.docType} onValueChange={v => setForm(p => ({ ...p, docType: v }))}>
                <SelectTrigger id="cc-type" data-testid="select-contract-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CONTRACT_DOC_TYPES).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="cc-value">Contract Value ($)</Label>
              <Input id="cc-value" type="number" min="0" step="0.01" value={form.totalValue} onChange={e => setForm(p => ({ ...p, totalValue: e.target.value }))} placeholder="0.00" data-testid="input-contract-value" />
            </div>
            <div>
              <Label htmlFor="cc-client-name">Client / Recipient Name *</Label>
              <Input id="cc-client-name" value={form.clientName} onChange={e => setForm(p => ({ ...p, clientName: e.target.value }))} placeholder="Full name or company" data-testid="input-client-name" />
            </div>
            <div>
              <Label htmlFor="cc-client-email">Client / Recipient Email *</Label>
              <Input id="cc-client-email" type="email" value={form.clientEmail} onChange={e => setForm(p => ({ ...p, clientEmail: e.target.value }))} placeholder="client@example.com" data-testid="input-client-email" />
            </div>
            <div>
              <Label htmlFor="cc-expires">Expiry Date</Label>
              <Input id="cc-expires" type="date" value={form.expiresAt} onChange={e => setForm(p => ({ ...p, expiresAt: e.target.value }))} data-testid="input-contract-expires" />
            </div>
            <div>
              <Label htmlFor="cc-terms">Special Terms (optional)</Label>
              <Input id="cc-terms" value={form.specialTerms} onChange={e => setForm(p => ({ ...p, specialTerms: e.target.value }))} placeholder="e.g. Net 30 payment" data-testid="input-special-terms" />
            </div>
            <div className="col-span-2">
              <Label htmlFor="cc-content">Document Body *</Label>
              <Textarea id="cc-content" value={form.content} onChange={e => setForm(p => ({ ...p, content: e.target.value }))} placeholder="Paste or type the full document content here…" rows={10} className="font-mono text-sm" data-testid="input-contract-content" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">After creating, you can send it for signature via email or internally from the contract card.</p>
        </div>
        <UniversalModalFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={createMutation.isPending} data-testid="button-create-contract">
            {createMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating…</> : <><Plus className="w-4 h-4 mr-2" />Create Document</>}
          </Button>
        </UniversalModalFooter>
      </UniversalModalContent>
    </UniversalModal>
  );
}

function ContractCard({ contract, onSend }: { contract: PipelineContract; onSend: (contract: PipelineContract) => void }) {
  const { toast } = useToast();
  const statusInfo = CONTRACT_STATUS_LABELS[contract.status] || { label: contract.status, variant: "secondary" as const };
  const typeLabel = CONTRACT_DOC_TYPES[contract.docType] || contract.docType;

  const sendMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/contracts/${contract.id}/send`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts"] });
      toast({ title: "Contract sent", description: `Sent to ${contract.clientEmail}` });
    },
    onError: (err: any) => toast({ title: "Send failed", description: err.message, variant: "destructive" }),
  });

  return (
    <Card className="hover-elevate" data-testid={`card-contract-${contract.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-primary/10 rounded-lg shrink-0">
            <Briefcase className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-medium truncate" data-testid={`text-contract-title-${contract.id}`}>{contract.title}</h4>
            <p className="text-sm text-muted-foreground truncate">
              {contract.clientName || contract.clientEmail || "No client assigned"}
            </p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge variant={statusInfo.variant} className="text-xs" data-testid={`badge-status-${contract.id}`}>
                {statusInfo.label}
              </Badge>
              <Badge variant="outline" className="text-xs">{typeLabel}</Badge>
              {contract.totalValue && (
                <span className="text-xs text-muted-foreground">
                  ${parseFloat(contract.totalValue).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-3 pt-3 border-t flex-wrap">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" />{format(new Date(contract.createdAt), "MMM d, yyyy")}
          </span>
          {contract.expiresAt && (
            <span className="text-xs text-amber-600 dark:text-amber-400">
              Exp {format(new Date(contract.expiresAt), "MMM d")}
            </span>
          )}
          <div className="ml-auto flex items-center gap-1">
            {contract.status === "draft" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => sendMutation.mutate()}
                disabled={sendMutation.isPending}
                data-testid={`button-send-contract-${contract.id}`}
              >
                {sendMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1" />}
                Send
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onSend(contract)}
              data-testid={`button-signers-${contract.id}`}
            >
              <FileSignature className="w-3.5 h-3.5 mr-1" />
              Sign / Send
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface OrgDocument {
  id: string;
  category: string;
  fileName: string;
  filePath: string;
  fileSizeBytes: number;
  fileType: string;
  description: string;
  requiresSignature: boolean;
  totalSignaturesRequired: number;
  signaturesCompleted: number;
  signatureFields?: any[];
  createdAt: string;
  uploadedByUser?: { id: string; firstName: string; lastName: string };
}

interface Signature {
  id: string;
  signedAt: string;
  signatureType: string;
  signer?: { id: string; firstName: string; lastName: string; email: string };
  signerEmail?: string;
  signerName?: string;
}

function DocumentCard({ doc, onView, onSign, onSendForSignature, onPlaceFields }: { 
  doc: OrgDocument; 
  onView: () => void; 
  onSign: () => void;
  onSendForSignature: () => void;
  onPlaceFields?: () => void;
}) {
  const category = DOCUMENT_CATEGORIES.find(c => c.id === doc.category);
  const Icon = category?.icon || FileText;
  
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  return (
    <Card className="hover-elevate" data-testid={`card-document-${doc.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Icon className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-medium truncate">{doc.fileName}</h4>
            <p className="text-sm text-muted-foreground truncate">{doc.description || "No description"}</p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge variant="outline" className="text-xs">{category?.label || doc.category}</Badge>
              {doc.fileType && <Badge variant="secondary" className="text-xs">.{doc.fileType}</Badge>}
              {doc.fileSizeBytes > 0 && (
                <span className="text-xs text-muted-foreground">{formatBytes(doc.fileSizeBytes)}</span>
              )}
            </div>
            {doc.requiresSignature && (
              <div className="flex items-center gap-2 mt-2">
                {doc.signaturesCompleted >= doc.totalSignaturesRequired && doc.totalSignaturesRequired > 0 ? (
                  <Badge className="bg-green-600 dark:bg-green-700 text-white text-xs">
                    <CheckCircle className="w-3 h-3 mr-1" /> Fully Signed
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs">
                    <Pen className="w-3 h-3 mr-1" />
                    {doc.signaturesCompleted}/{doc.totalSignaturesRequired} signed
                  </Badge>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 mt-4 pt-3 border-t flex-wrap">
          <Button size="sm" variant="ghost" onClick={onView} data-testid={`button-view-${doc.id}`}>
            <Eye className="w-4 h-4 mr-1" /> View
          </Button>
          {(doc.fileType === "pdf" || doc.filePath?.endsWith(".pdf")) && onPlaceFields && (
            <Button size="sm" variant="ghost" onClick={onPlaceFields} data-testid={`button-place-fields-${doc.id}`}>
              <FileSignature className="w-4 h-4 mr-1" /> Place Fields
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onSendForSignature} data-testid={`button-send-sig-${doc.id}`}>
            <Send className="w-4 h-4 mr-1" /> Send for Signature
          </Button>
          {doc.requiresSignature && (
            <Button size="sm" variant="ghost" onClick={onSign} data-testid={`button-sign-${doc.id}`}>
              <Pen className="w-4 h-4 mr-1" /> Sign
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface RecipientEntry {
  name: string;
  email: string;
  type: 'internal' | 'external';
}

function SendForSignatureDialog({ 
  doc, 
  open, 
  onOpenChange,
  onSuccess 
}: { 
  doc: OrgDocument | null; 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [recipients, setRecipients] = useState<RecipientEntry[]>([{ name: "", email: "", type: "external" }]);
  const [message, setMessage] = useState("");

  const sendMutation = useMutation({
    mutationFn: (data: { recipients: RecipientEntry[]; message: string }) =>
      apiRequest('POST', `/api/documents/${doc?.id}/send-for-signature`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      toast({ title: "Signature requests sent", description: `Sent to ${recipients.length} recipient(s)` });
      setRecipients([{ name: "", email: "", type: "external" }]);
      setMessage("");
      onSuccess();
    },
    onError: (err: any) => {
      toast({ title: "Failed to send", description: err.message, variant: "destructive" });
    },
  });

  const addRecipient = () => {
    setRecipients(prev => [...prev, { name: "", email: "", type: "external" }]);
  };

  const removeRecipient = (index: number) => {
    if (recipients.length <= 1) return;
    setRecipients(recipients.filter((_, i) => i !== index));
  };

  const updateRecipient = (index: number, field: keyof RecipientEntry, value: string) => {
    const updated = [...recipients];
    (updated[index] as any)[field] = value;
    setRecipients(updated);
  };

  const handleSend = () => {
    const validRecipients = recipients.filter(r => r.email.trim() && r.name.trim());
    if (validRecipients.length === 0) {
      toast({ title: "Add at least one recipient", variant: "destructive" });
      return;
    }
    sendMutation.mutate({ recipients: validRecipients, message });
  };

  if (!doc) return null;

  return (
    <UniversalModal open={open} onOpenChange={onOpenChange}>
      <UniversalModalContent className="max-w-lg">
        <UniversalModalHeader>
          <UniversalModalTitle>Send for Signature</UniversalModalTitle>
          <UniversalModalDescription>
            Send "{doc.fileName}" to one or more people for signature. They will receive an email with a secure signing link.
          </UniversalModalDescription>
        </UniversalModalHeader>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <Label className="text-sm font-medium">Recipients</Label>
              <Button size="sm" variant="ghost" onClick={addRecipient} data-testid="button-add-recipient">
                <Plus className="w-4 h-4 mr-1" /> Add
              </Button>
            </div>
            <div className="space-y-3">
              {recipients.map((r, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="flex-1 space-y-2">
                    <Input
                      placeholder="Full name"
                      value={r.name}
                      onChange={(e) => updateRecipient(i, "name", e.target.value)}
                      data-testid={`input-recipient-name-${i}`}
                    />
                    <Input
                      placeholder="Email address"
                      type="email"
                      value={r.email}
                      onChange={(e) => updateRecipient(i, "email", e.target.value)}
                      data-testid={`input-recipient-email-${i}`}
                    />
                  </div>
                  {recipients.length > 1 && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => removeRecipient(i)}
                      data-testid={`button-remove-recipient-${i}`}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div>
            <Label htmlFor="send-message">Message (optional)</Label>
            <Textarea
              id="send-message"
              placeholder="Add a personal message to include in the signing email..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="mt-1"
              data-testid="input-send-message"
            />
          </div>
        </div>
        <UniversalModalFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-send">Cancel</Button>
          <Button onClick={handleSend} disabled={sendMutation.isPending} data-testid="button-confirm-send">
            {sendMutation.isPending ? (
              "Sending..."
            ) : (
              <>
                <Mail className="w-4 h-4 mr-1" />
                Send to {recipients.filter(r => r.email.trim() && r.name.trim()).length} Recipient(s)
              </>
            )}
          </Button>
        </UniversalModalFooter>
      </UniversalModalContent>
    </UniversalModal>
  );
}

export default function DocumentLibrary() {
  const { toast } = useToast();
  const [activeCategory, setActiveCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<OrgDocument | null>(null);
  const [showSignDialog, setShowSignDialog] = useState(false);
  const [showSendForSigDialog, setShowSendForSigDialog] = useState(false);
  const [showPlaceFields, setShowPlaceFields] = useState(false);
  const [signatureData, setSignatureData] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [contractStatusFilter, setContractStatusFilter] = useState("all");
  const [contractTypeFilter, setContractTypeFilter] = useState("all");
  const [showCreateContract, setShowCreateContract] = useState(false);
  const [selectedContractForSign, setSelectedContractForSign] = useState<PipelineContract | null>(null);

  const isContractsView = activeCategory === "contracts_pipeline";

  const { data: docsData, isLoading } = useQuery({
    queryKey: ["/api/documents", (activeCategory !== "all" && activeCategory !== "contracts_pipeline") ? { category: activeCategory } : undefined],
    enabled: !isContractsView,
    queryFn: () => apiFetch(
      activeCategory !== "all" && activeCategory !== "contracts_pipeline"
        ? `/api/documents?category=${encodeURIComponent(activeCategory)}`
        : '/api/documents',
      AnyResponse
    ),
  });

  const { data: contractsData, isLoading: contractsLoading } = useQuery<{ contracts: PipelineContract[] }>({
    queryKey: ["/api/contracts"],
    enabled: isContractsView,
    // @ts-expect-error — TS migration: fix in refactoring sprint
    queryFn: () => apiFetch('/api/contracts', AnyResponse),
  });

  const { data: contractStats } = useQuery<{ stats: any }>({
    queryKey: ["/api/contracts/stats"],
    enabled: isContractsView,
    // @ts-expect-error — TS migration: fix in refactoring sprint
    queryFn: () => apiFetch('/api/contracts/stats', AnyResponse),
  });

  const { data: signaturesData } = useQuery({
    queryKey: ["/api/documents", selectedDoc?.id, "signatures"],
    queryFn: () => fetch(`/api/documents/${selectedDoc?.id}/signatures`, { credentials: 'include' }).then(r => r.json()),
    enabled: !!selectedDoc?.id,
  });

  const uploadMutation = useMutation({
    mutationFn: (data: any) => apiRequest('POST', '/api/documents', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      setShowUpload(false);
      toast({ title: "Document uploaded successfully" });
    },
    onError: (error: Error) => {
      toast({
        title: 'Upload Document Failed',
        description: error.message || 'Something went wrong.',
        variant: 'destructive',
      });
    },
  });

  const signMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest('POST', `/api/documents/${id}/sign`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      setShowSignDialog(false);
      setSelectedDoc(null);
      setSignatureData("");
      toast({ title: "Document signed successfully" });
    },
    onError: (error: Error) => {
      toast({
        title: 'Sign Document Failed',
        description: error.message || 'Something went wrong.',
        variant: 'destructive',
      });
    },
  });


  // @ts-expect-error — TS migration: fix in refactoring sprint
  const documents: OrgDocument[] = docsData?.data?.map((d: any) => ({ ...d.document, uploadedByUser: d.uploadedByUser })) || [];
  const signatures: Signature[] = signaturesData?.data?.map((s: any) => ({ ...s.signature, signer: s.signer })) || [];

  const filteredDocs = documents.filter(doc => {
    const matchesCategory = activeCategory === "all" || doc.category === activeCategory;
    const matchesSearch = !searchQuery || 
      doc.fileName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.description?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // @ts-expect-error — TS migration: fix in refactoring sprint
  const allContracts: PipelineContract[] = contractsData?.contracts || [];
  const filteredContracts = allContracts.filter(c => {
    const matchesStatus = contractStatusFilter === "all" || c.status === contractStatusFilter;
    const matchesType = contractTypeFilter === "all" || c.docType === contractTypeFilter;
    const matchesSearch = !searchQuery ||
      c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.clientName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.clientEmail?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesType && matchesSearch;
  });

  const handleUpload = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    uploadMutation.mutate({
      category: formData.get("category"),
      fileName: formData.get("fileName"),
      filePath: `/uploads/${Date.now()}-${formData.get("fileName")}`,
      description: formData.get("description"),
      requiresSignature: formData.get("requiresSignature") === "on",
      totalSignaturesRequired: Number(formData.get("totalSignaturesRequired")) || 0,
    });
  };

  const handleSign = () => {
    if (!selectedDoc || !signatureData) return;
    signMutation.mutate({
      id: selectedDoc.id,
      signatureData,
      signatureType: "drawn",
    });
  };


  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    setIsDrawing(true);
    ctx.beginPath();
    ctx.moveTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.lineTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      setSignatureData(canvas.toDataURL());
    }
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureData("");
  };

  const uploadButton = (
    <UniversalModal open={showUpload} onOpenChange={setShowUpload}>
      <UniversalModalTrigger asChild>
        <Button data-testid="button-upload" className="hidden sm:inline-flex">
          <Upload className="w-4 h-4 mr-2" />
          Upload Document
        </Button>
      </UniversalModalTrigger>
      <UniversalModalTrigger asChild>
        <Button size="icon" data-testid="button-upload-mobile" className="sm:hidden">
          <Upload className="w-4 h-4" />
        </Button>
      </UniversalModalTrigger>
    </UniversalModal>
  );

  const newContractButton = (
    <Button onClick={() => setShowCreateContract(true)} data-testid="button-new-contract">
      <Plus className="w-4 h-4 mr-2" />
      New Contract
    </Button>
  );

  const pageConfig: CanvasPageConfig = {
    id: 'document-library',
    title: 'Document Center',
    subtitle: 'Unified document management, contracts, and e-signatures',
    category: 'operations',
    variant: 'fullWidth',
    headerActions: isContractsView ? newContractButton : uploadButton,
  };

  return (
    <CanvasHubPage config={pageConfig}>
      <UniversalModal open={showUpload} onOpenChange={setShowUpload}>
          <UniversalModalContent>
            <UniversalModalHeader>
              <UniversalModalTitle>Upload Document</UniversalModalTitle>
            </UniversalModalHeader>
            <form onSubmit={handleUpload} className="space-y-4">
              <div>
                <Label htmlFor="fileName">Document Name *</Label>
                <Input id="fileName" name="fileName" required data-testid="input-file-name" />
              </div>
              <div>
                <Label htmlFor="category">Category *</Label>
                <Select name="category" required>
                  <SelectTrigger data-testid="select-category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {DOCUMENT_CATEGORIES.map(cat => (
                      <SelectItem key={cat.id} value={cat.id}>{cat.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" name="description" data-testid="input-description" />
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="requiresSignature" name="requiresSignature" className="w-4 h-4" data-testid="checkbox-requires-signature" />
                  <Label htmlFor="requiresSignature">Requires Signature</Label>
                </div>
                <div className="flex-1">
                  <Label htmlFor="totalSignaturesRequired">Signatures Needed</Label>
                  <Input type="number" id="totalSignaturesRequired" name="totalSignaturesRequired" min="0" defaultValue="0" data-testid="input-signatures-needed" />
                </div>
              </div>
              <UniversalModalFooter>
                <Button type="submit" disabled={uploadMutation.isPending} data-testid="button-submit-upload">
                  {uploadMutation.isPending ? "Uploading..." : "Upload"}
                </Button>
              </UniversalModalFooter>
            </form>
          </UniversalModalContent>
        </UniversalModal>

      <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
        <div className="hidden md:block w-56 border-r p-4 space-y-1 shrink-0">
          <Button
            variant={activeCategory === "all" ? "secondary" : "ghost"}
            className="w-full justify-start"
            onClick={() => setActiveCategory("all")}
            data-testid="button-category-all"
          >
            <FolderOpen className="w-4 h-4 mr-2" />
            All Documents
          </Button>
          {DOCUMENT_CATEGORIES.map(cat => (
            <Button
              key={cat.id}
              variant={activeCategory === cat.id ? "secondary" : "ghost"}
              className="w-full justify-start"
              onClick={() => setActiveCategory(cat.id)}
              data-testid={`button-category-${cat.id}`}
            >
              <cat.icon className="w-4 h-4 mr-2" />
              {cat.label}
            </Button>
          ))}
          <Separator className="my-2" />
          <p className="text-xs font-medium text-muted-foreground px-2 py-1">Contract Pipeline</p>
          <Button
            variant={activeCategory === "contracts_pipeline" ? "secondary" : "ghost"}
            className="w-full justify-start"
            onClick={() => setActiveCategory("contracts_pipeline")}
            data-testid="button-category-contracts-pipeline"
          >
            <Briefcase className="w-4 h-4 mr-2" />
            Contracts & Agreements
          </Button>
        </div>

        <div className="md:hidden border-b px-3 py-2">
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            <Button
              size="sm"
              variant={activeCategory === "all" ? "secondary" : "outline"}
              className="shrink-0"
              onClick={() => setActiveCategory("all")}
              data-testid="button-category-all-mobile"
            >
              <FolderOpen className="w-3.5 h-3.5 mr-1.5" />
              All
            </Button>
            {DOCUMENT_CATEGORIES.map(cat => (
              <Button
                key={cat.id}
                size="sm"
                variant={activeCategory === cat.id ? "secondary" : "outline"}
                className="shrink-0"
                onClick={() => setActiveCategory(cat.id)}
                data-testid={`button-category-${cat.id}-mobile`}
              >
                <cat.icon className="w-3.5 h-3.5 mr-1.5" />
                {cat.label}
              </Button>
            ))}
            <Button
              size="sm"
              variant={activeCategory === "contracts_pipeline" ? "secondary" : "outline"}
              className="shrink-0"
              onClick={() => setActiveCategory("contracts_pipeline")}
              data-testid="button-category-contracts-pipeline-mobile"
            >
              <Briefcase className="w-3.5 h-3.5 mr-1.5" />
              Contracts
            </Button>
          </div>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <div className="p-3 md:p-4 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search documents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search"
              />
            </div>
          </div>

          {isContractsView && (
            <div className="px-3 md:px-4 pb-2 pt-2 flex items-center gap-2 flex-wrap">
              <Select value={contractStatusFilter} onValueChange={setContractStatusFilter}>
                <SelectTrigger className="w-[calc(50%-4px)] md:w-[160px]" data-testid="select-contract-status-filter">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {Object.entries(CONTRACT_STATUS_LABELS).map(([key, val]) => (
                    <SelectItem key={key} value={key}>{val.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={contractTypeFilter} onValueChange={setContractTypeFilter}>
                <SelectTrigger className="w-[calc(50%-4px)] md:w-[160px]" data-testid="select-contract-type-filter">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {Object.entries(CONTRACT_DOC_TYPES).map(([key, val]) => (
                    <SelectItem key={key} value={key}>{val}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              // @ts-ignore — TS migration: fix in refactoring sprint
              {(contractStats as any)?.stats && (
                <span className="text-xs text-muted-foreground ml-auto" data-testid="text-contract-count">
                  {allContracts.length} total contracts
                </span>
              )}
            </div>
          )}

          <ScrollArea className="flex-1 p-3 md:p-4 pb-20 md:pb-4">
            {isContractsView ? (
              contractsLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading contracts...</div>
              ) : filteredContracts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground" data-testid="text-no-contracts">
                  {allContracts.length === 0 ? "No contracts yet. Create one to get started." : "No contracts match your filters."}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                  {filteredContracts.map(contract => (
                    <ContractCard key={contract.id} contract={contract} onSend={setSelectedContractForSign} />
                  ))}
                </div>
              )
            ) : (
              isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading documents...</div>
              ) : filteredDocs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No documents found</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                  {filteredDocs.map(doc => (
                    <DocumentCard
                      key={doc.id}
                      doc={doc}
                      onView={() => setSelectedDoc(doc)}
                      onSign={() => { setSelectedDoc(doc); setShowSignDialog(true); }}
                      onSendForSignature={() => { setSelectedDoc(doc); setShowSendForSigDialog(true); }}
                      onPlaceFields={() => { setSelectedDoc(doc); setShowPlaceFields(true); }}
                    />
                  ))}
                </div>
              )
            )}
          </ScrollArea>
        </div>
      </div>

      <UniversalModal open={!!selectedDoc && !showSignDialog && !showSendForSigDialog} onOpenChange={() => setSelectedDoc(null)}>
        <UniversalModalContent size="xl">
          {selectedDoc && (
            <>
              <UniversalModalHeader>
                <UniversalModalTitle>{selectedDoc.fileName}</UniversalModalTitle>
                <UniversalModalDescription>{selectedDoc.description}</UniversalModalDescription>
              </UniversalModalHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Category</p>
                    <p className="font-medium">{DOCUMENT_CATEGORIES.find(c => c.id === selectedDoc.category)?.label}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Uploaded</p>
                    <p className="font-medium">{format(new Date(selectedDoc.createdAt), "MMM d, yyyy")}</p>
                  </div>
                </div>
                {selectedDoc.requiresSignature && (
                  <div>
                    <h4 className="font-medium mb-2">Signatures ({signatures.length}/{selectedDoc.totalSignaturesRequired})</h4>
                    {signatures.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No signatures yet</p>
                    ) : (
                      <div className="space-y-2">
                        {signatures.map(sig => (
                          <div key={sig.id} className="flex items-center gap-2 p-2 border rounded-md">
                            <CheckCircle className="w-4 h-4 text-green-500" />
                            <span className="text-sm">
                              {sig.signer ? `${sig.signer.firstName} ${sig.signer.lastName}` : sig.signerName || sig.signerEmail}
                            </span>
                            <span className="text-xs text-muted-foreground ml-auto">
                              {format(new Date(sig.signedAt), "MMM d, yyyy h:mm a")}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div className="flex gap-2 pt-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      setShowSendForSigDialog(true);
                    }}
                    data-testid="button-send-sig-from-detail"
                  >
                    <Send className="w-4 h-4 mr-1" /> Send for Signature
                  </Button>
                  {selectedDoc.requiresSignature && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setShowSignDialog(true);
                      }}
                      data-testid="button-sign-from-detail"
                    >
                      <Pen className="w-4 h-4 mr-1" /> Sign Myself
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </UniversalModalContent>
      </UniversalModal>

      <UniversalModal open={showSignDialog} onOpenChange={setShowSignDialog}>
        <UniversalModalContent>
          <UniversalModalHeader>
            <UniversalModalTitle>Sign Document</UniversalModalTitle>
            <UniversalModalDescription>Draw your signature below</UniversalModalDescription>
          </UniversalModalHeader>
          <div className="space-y-4">
            <div className="border rounded-lg p-2 bg-white">
              <canvas
                ref={canvasRef}
                width={400}
                height={150}
                className="w-full cursor-crosshair"
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                data-testid="canvas-signature"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={clearSignature} data-testid="button-clear-signature">Clear</Button>
            </div>
          </div>
          <UniversalModalFooter>
            <Button variant="outline" onClick={() => setShowSignDialog(false)}>Cancel</Button>
            <Button onClick={handleSign} disabled={!signatureData || signMutation.isPending} data-testid="button-submit-signature">
              {signMutation.isPending ? "Signing..." : "Sign Document"}
            </Button>
          </UniversalModalFooter>
        </UniversalModalContent>
      </UniversalModal>

      <SendForSignatureDialog
        doc={selectedDoc}
        open={showSendForSigDialog}
        onOpenChange={(open) => {
          setShowSendForSigDialog(open);
          if (!open) setSelectedDoc(null);
        }}
        onSuccess={() => {
          setShowSendForSigDialog(false);
          setSelectedDoc(null);
        }}
      />

      <CreateContractDialog
        open={showCreateContract}
        onOpenChange={setShowCreateContract}
      />

      <UniversalModal open={!!selectedContractForSign} onOpenChange={(open) => !open && setSelectedContractForSign(null)}>
        <UniversalModalContent className="max-w-md">
          <UniversalModalHeader>
            <UniversalModalTitle>Send "{selectedContractForSign?.title}" for Signing</UniversalModalTitle>
            <UniversalModalDescription>
              Choose how to send this document to {selectedContractForSign?.clientName || selectedContractForSign?.clientEmail}.
            </UniversalModalDescription>
          </UniversalModalHeader>
          <div className="space-y-3">
            <div className="p-3 rounded-lg border bg-muted/30">
              <p className="text-sm font-medium">Recipient</p>
              <p className="text-sm text-muted-foreground">{selectedContractForSign?.clientName} — {selectedContractForSign?.clientEmail}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="flex-col h-auto py-3 gap-1"
                onClick={() => {
                  if (!selectedContractForSign) return;
                  apiRequest("POST", `/api/contracts/${selectedContractForSign.id}/send`)
                    .then(() => {
                      queryClient.invalidateQueries({ queryKey: ["/api/contracts"] });
                      toast({ title: "Sent via email", description: `Contract sent to ${selectedContractForSign.clientEmail}` });
                      setSelectedContractForSign(null);
                    })
                    .catch((err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }));
                }}
                data-testid="button-send-email"
              >
                <Mail className="w-5 h-5 text-primary" />
                <span className="text-xs">Send via Email</span>
              </Button>
              <Button
                variant="outline"
                className="flex-col h-auto py-3 gap-1"
                onClick={() => {
                  if (!selectedContractForSign) return;
                  apiRequest("POST", `/api/contracts/${selectedContractForSign.id}/signers`, {
                    signerEmail: selectedContractForSign.clientEmail,
                    signerName: selectedContractForSign.clientName,
                    role: "signer",
                  })
                    .then(() => {
                      queryClient.invalidateQueries({ queryKey: ["/api/contracts"] });
                      toast({ title: "Internal signing request created", description: "Signer added for internal signature" });
                      setSelectedContractForSign(null);
                    })
                    .catch((err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }));
                }}
                data-testid="button-send-internal"
              >
                <FileSignature className="w-5 h-5 text-primary" />
                <span className="text-xs">Internal Signing</span>
              </Button>
            </div>
          </div>
          <UniversalModalFooter>
            <Button variant="ghost" onClick={() => setSelectedContractForSign(null)}>Cancel</Button>
          </UniversalModalFooter>
        </UniversalModalContent>
      </UniversalModal>
      {selectedDoc && showPlaceFields && (
        <PDFFieldPlacer
          docId={selectedDoc.id}
          docName={selectedDoc.fileName}
          pdfUrl={selectedDoc.filePath}
          initialFields={selectedDoc.signatureFields || []}
          recipientCount={Math.max(1, selectedDoc.totalSignaturesRequired || 1)}
          open={showPlaceFields}
          onOpenChange={(open) => { setShowPlaceFields(open); if (!open) setSelectedDoc(null); }}
        />
      )}
    </CanvasHubPage>
  );
}
