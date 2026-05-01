import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { UniversalEmptyState } from "@/components/universal";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UniversalModal, UniversalModalContent, UniversalModalHeader, UniversalModalTitle, UniversalModalFooter } from "@/components/ui/universal-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  FileText,
  Plus,
  Download,
  Pencil,
  Trash2,
  Send,
  Copy,
  DollarSign,
  Calendar,
  Building2,
  User,
  Shield,
  Clock,
  ExternalLink,
  CheckCircle2,
  PenLine,
  Users,
  Loader2,
} from "lucide-react";

const pageConfig: CanvasPageConfig = {
  title: "Proposal Builder",
  subtitle: "Create and manage client proposals with templates and PDF generation",
  icon: FileText,
};

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground border-border" },
  review: { label: "In Review", className: "bg-yellow-500/10 text-yellow-700 border-yellow-200" },
  submitted: { label: "Submitted", className: "bg-blue-500/10 text-blue-700 border-blue-200" },
  won: { label: "Won", className: "bg-green-500/10 text-green-700 border-green-200" },
  lost: { label: "Lost", className: "bg-red-500/10 text-red-700 border-red-200" },
};

interface LineItem {
  description: string;
  quantity: number;
  rate: number;
  total: number;
}

interface ProposalSection {
  title: string;
  content: string;
}

const DAYS_OF_WEEK = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const SERVICE_TYPES: Record<string, string> = {
  unarmed: "Unarmed Guard",
  armed: "Armed Guard",
  patrol: "Patrol Officer",
  mobile: "Mobile Patrol",
  event: "Event Security",
  executive: "Executive Protection",
};
const SECURITY_DEFAULT_TERMS = `This Security Services Agreement is entered into by and between the service provider ("Company") and the client ("Client"). Services shall be rendered in accordance with all applicable state and local laws governing private security. Either party may terminate this agreement with thirty (30) days written notice. Billing is due within 15 days of invoice date. Late payments accrue 1.5% monthly interest. The Company maintains general liability insurance and workers' compensation as required by law. Client agrees to provide a safe working environment for all security personnel.`;

interface ProposalForm {
  proposalName: string;
  templateId: string;
  clientName: string;
  clientAddress: string;
  clientContact: string;
  clientEmail: string;
  clientPhone: string;
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  validUntil: string;
  sections: ProposalSection[];
  lineItems: LineItem[];
  termsAndConditions: string;
  status: string;
  // Security shift proposal fields
  proposalType?: string;
  serviceType?: string;
  siteName?: string;
  shiftDays?: string[];
  shiftStartTime?: string;
  shiftEndTime?: string;
  numGuards?: number;
  billRatePerHour?: number;
  contractTermMonths?: number;
}

const EMPTY_FORM: ProposalForm = {
  proposalName: "",
  templateId: "",
  proposalType: "general",
  serviceType: "unarmed",
  siteName: "",
  shiftDays: ["Monday","Tuesday","Wednesday","Thursday","Friday"],
  shiftStartTime: "08:00",
  shiftEndTime: "17:00",
  numGuards: 1,
  billRatePerHour: 20,
  contractTermMonths: 12,
  clientName: "",
  clientAddress: "",
  clientContact: "",
  clientEmail: "",
  clientPhone: "",
  companyName: "",
  companyAddress: "",
  companyPhone: "",
  companyEmail: "",
  validUntil: "",
  sections: [{ title: "Introduction", content: "" }],
  lineItems: [{ description: "", quantity: 1, rate: 0, total: 0 }],
  termsAndConditions: "",
  status: "draft",
};

function ProposalFormDialog({
  proposal,
  onClose,
}: {
  proposal?: any;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const workspaceId = (user as any)?.currentWorkspaceId;
  const { toast } = useToast();

  const [form, setForm] = useState<ProposalForm>(() => {
    if (proposal) {
      return {
        proposalName: proposal.proposalName ?? "",
        templateId: proposal.templateId ?? "",
        clientName: proposal.clientName ?? "",
        clientAddress: proposal.clientAddress ?? "",
        clientContact: proposal.clientContact ?? "",
        clientEmail: proposal.clientEmail ?? "",
        clientPhone: proposal.clientPhone ?? "",
        companyName: proposal.companyName ?? "",
        companyAddress: proposal.companyAddress ?? "",
        companyPhone: proposal.companyPhone ?? "",
        companyEmail: proposal.companyEmail ?? "",
        validUntil: proposal.validUntil
          ? new Date(proposal.validUntil).toISOString().split("T")[0]
          : "",
        sections: proposal.sections ?? [{ title: "Introduction", content: "" }],
        lineItems: proposal.lineItems ?? [{ description: "", quantity: 1, rate: 0, total: 0 }],
        termsAndConditions: proposal.termsAndConditions ?? "",
        status: proposal.status ?? "draft",
      };
    }
    return { ...EMPTY_FORM };
  });

  const [step, setStep] = useState<"template" | "details" | "content" | "pricing">(
    proposal ? "details" : "template"
  );

  const { data: templates } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/proposals/templates"],
  });

  const applyTemplateMutation = useMutation({
    mutationFn: (templateId: string) => apiRequest("GET", `/api/proposals/templates/${templateId}`),
    onSuccess: (template) => {
      setForm((p) => ({
        ...p,
        templateId: template.id,
        sections: template.sections || p.sections,
        termsAndConditions: template.termsAndConditions || p.termsAndConditions,
      }));
      setStep("details");
      toast({ title: `Template "${template.name}" applied` });
    },
  });

  const saveMutation = useMutation({
    mutationFn: (data) =>
      proposal
        ? apiRequest("PATCH", `/api/proposals/${proposal.id}`, data)
        : apiRequest("POST", "/api/proposals", { ...data, workspaceId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals"] });
      toast({ title: proposal ? "Proposal updated" : "Proposal created" });
      onClose();
    },
    onError: () => toast({ title: "Failed to save proposal", variant: "destructive" }),
  });

  const handleSave = () => {
    if (!form.proposalName.trim()) {
      toast({ title: "Proposal name is required", variant: "destructive" });
      return;
    }
    const totalValue = form.lineItems.reduce((sum, item) => sum + (item.total || 0), 0);
    saveMutation.mutate({
      ...form,
      totalValue: totalValue > 0 ? String(totalValue) : null,
      validUntil: form.validUntil ? new Date(form.validUntil).toISOString() : null,
    });
  };

  const updateSection = (index: number, field: keyof ProposalSection, value: string) => {
    setForm((p) => {
      const sections = [...p.sections];
      sections[index] = { ...sections[index], [field]: value };
      return { ...p, sections };
    });
  };

  const addSection = () => {
    setForm((p) => ({
      ...p,
      sections: [...p.sections, { title: "", content: "" }],
    }));
  };

  const removeSection = (index: number) => {
    setForm((p) => ({
      ...p,
      sections: p.sections.filter((_, i) => i !== index),
    }));
  };

  const updateLineItem = (index: number, field: keyof LineItem, value: string | number) => {
    setForm((p) => {
      const items = [...p.lineItems];
      const item = { ...items[index], [field]: value };
      if (field === "quantity" || field === "rate") {
        item.total = Number(item.quantity) * Number(item.rate);
      }
      items[index] = item;
      return { ...p, lineItems: items };
    });
  };

  const addLineItem = () => {
    setForm((p) => ({
      ...p,
      lineItems: [...p.lineItems, { description: "", quantity: 1, rate: 0, total: 0 }],
    }));
  };

  const removeLineItem = (index: number) => {
    setForm((p) => ({
      ...p,
      lineItems: p.lineItems.filter((_, i) => i !== index),
    }));
  };

  const grandTotal = form.lineItems.reduce((sum, item) => sum + (item.total || 0), 0);

  const autoGenerateContent = () => {
    const clientName = form.clientName || "[Client Name]";
    const siteName = form.siteName || form.clientAddress || "[Site Name]";
    const serviceLabel = SERVICE_TYPES[form.serviceType || "unarmed"];
    const days = form.shiftDays?.join(", ") || "Monday–Friday";
    const startT = form.shiftStartTime || "08:00";
    const endT = form.shiftEndTime || "17:00";
    const guards = form.numGuards || 1;
    const rate = form.billRatePerHour || 20;
    const term = form.contractTermMonths || 12;
    const [startH, startM] = startT.split(":").map(Number);
    const [endH, endM] = endT.split(":").map(Number);
    const dailyHrs = (endH + endM / 60) - (startH + startM / 60);
    const daysPerWeek = form.shiftDays?.length || 5;
    const weeklyHrs = dailyHrs * daysPerWeek * guards;
    const monthlyHrs = weeklyHrs * 4.33;
    const monthlyRate = monthlyHrs * rate;
    const totalValue = monthlyRate * term;

    setForm((p) => ({
      ...p,
      sections: [
        { title: "Executive Summary", content: `We are pleased to present this Security Services Proposal for ${clientName}. Our professional security team will provide ${serviceLabel.toLowerCase()} coverage at ${siteName}, tailored to meet your specific safety and compliance requirements.` },
        { title: "Scope of Services", content: `Service Type: ${serviceLabel}\nSite Location: ${siteName}\nCoverage Area: All designated access points, parking areas, and common areas as directed by client.\n\nOur officers are licensed, bonded, and trained in emergency response, access control, and conflict de-escalation.` },
        { title: "Shift Schedule & Coverage", content: `Days of Coverage: ${days}\nShift Hours: ${startT} – ${endT}\nNumber of Officers: ${guards}\nEstimated Hours per Week: ${weeklyHrs.toFixed(1)} hrs\n\nAny changes to the schedule require 72 hours advance notice.` },
        { title: "Billing & Payment Terms", content: `Billing Rate: $${rate.toFixed(2)}/hr per officer\nEstimated Monthly Cost: $${monthlyRate.toFixed(2)}\nContract Term: ${term} months\nEstimated Total Contract Value: $${totalValue.toFixed(2)}\n\nInvoices issued bi-weekly. Payment due within 15 days of invoice date.` },
        { title: "Guard Requirements & Post Orders", content: `All assigned officers will:\n• Hold a valid state security officer license\n• Complete site-specific orientation before first shift\n• Maintain a professional appearance and demeanor\n• Submit incident reports for any notable events\n• Follow all post orders as established during onboarding` },
        { title: "Terms & Conditions", content: SECURITY_DEFAULT_TERMS },
      ],
      lineItems: [
        {
          description: `${serviceLabel} — ${guards} officer${guards > 1 ? "s" : ""} × ${dailyHrs.toFixed(1)}hrs/day × ${daysPerWeek} days/wk × 4.33 wks/mo`,
          quantity: term,
          rate: Math.round(monthlyRate * 100) / 100,
          total: Math.round(totalValue * 100) / 100,
        },
      ],
      proposalName: p.proposalName || `Security Services Proposal — ${clientName}`,
    }));
    setStep("content");
    toast({ title: "Content generated", description: "Review and customize the proposal sections." });
  };

  return (
    <>
      <UniversalModalHeader>
        <UniversalModalTitle data-testid="text-proposal-dialog-title">
          {proposal ? "Edit Proposal" : "Create Proposal"}
        </UniversalModalTitle>
      </UniversalModalHeader>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {(["template", "details", "content", "pricing"] as const).map((s, i) => (
          <Button
            key={s}
            variant={step === s ? "default" : "outline"}
            size="sm"
            onClick={() => setStep(s)}
            data-testid={`button-step-${s}`}
          >
            {i + 1}. {s.charAt(0).toUpperCase() + s.slice(1)}
          </Button>
        ))}
      </div>

      {step === "template" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Choose a template to get started, or start from scratch.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Card
              className="cursor-pointer hover-elevate"
              onClick={() => {
                setForm((p) => ({
                  ...p,
                  proposalType: "shift_proposal",
                  serviceType: "unarmed",
                  shiftDays: ["Monday","Tuesday","Wednesday","Thursday","Friday"],
                  shiftStartTime: "08:00",
                  shiftEndTime: "17:00",
                  numGuards: 1,
                  billRatePerHour: 20,
                  contractTermMonths: 12,
                  termsAndConditions: SECURITY_DEFAULT_TERMS,
                }));
                setStep("details");
              }}
              data-testid="card-security-proposal-template"
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" />
                  <span className="font-medium text-sm">Security Shift Proposal</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Armed, unarmed, patrol, or mobile — with auto-generated content</p>
              </CardContent>
            </Card>
            {templates?.map((t) => (
              <Card
                key={t.id}
                className="cursor-pointer hover-elevate"
                onClick={() => applyTemplateMutation.mutate(t.id)}
                data-testid={`card-template-${t.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-sm">{t.name}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Button variant="outline" onClick={() => setStep("details")} data-testid="button-skip-template">
            Skip - Start Blank
          </Button>
        </div>
      )}

      {step === "details" && (
        <div className="space-y-4">
          <div>
            <Label>Proposal Name *</Label>
            <Input
              value={form.proposalName}
              onChange={(e) => setForm((p) => ({ ...p, proposalName: e.target.value }))}
              placeholder="e.g. Security Services for Acme Corp"
              data-testid="input-proposal-name"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-3">
              <h4 className="text-sm font-medium flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5" /> Client Info
              </h4>
              <div>
                <Label>Client Name</Label>
                <Input
                  value={form.clientName}
                  onChange={(e) => setForm((p) => ({ ...p, clientName: e.target.value }))}
                  placeholder="Acme Corporation"
                  data-testid="input-client-name"
                />
              </div>
              <div>
                <Label>Contact Person</Label>
                <Input
                  value={form.clientContact}
                  onChange={(e) => setForm((p) => ({ ...p, clientContact: e.target.value }))}
                  placeholder="John Smith"
                  data-testid="input-client-contact"
                />
              </div>
              <div>
                <Label>Client Email</Label>
                <Input
                  type="email"
                  value={form.clientEmail}
                  onChange={(e) => setForm((p) => ({ ...p, clientEmail: e.target.value }))}
                  placeholder="john@acme.com"
                  data-testid="input-client-email"
                />
              </div>
              <div>
                <Label>Client Phone</Label>
                <Input
                  value={form.clientPhone}
                  onChange={(e) => setForm((p) => ({ ...p, clientPhone: e.target.value }))}
                  placeholder="(555) 123-4567"
                  data-testid="input-client-phone"
                />
              </div>
              <div>
                <Label>Client Address</Label>
                <Textarea
                  value={form.clientAddress}
                  onChange={(e) => setForm((p) => ({ ...p, clientAddress: e.target.value }))}
                  placeholder="123 Main St, City, ST 12345"
                  rows={2}
                  data-testid="input-client-address"
                />
              </div>
            </div>
            <div className="space-y-3">
              <h4 className="text-sm font-medium flex items-center gap-1">
                <User className="h-3.5 w-3.5" /> Your Company Info
              </h4>
              <div>
                <Label>Company Name</Label>
                <Input
                  value={form.companyName}
                  onChange={(e) => setForm((p) => ({ ...p, companyName: e.target.value }))}
                  placeholder="Your Security Company"
                  data-testid="input-company-name"
                />
              </div>
              <div>
                <Label>Company Email</Label>
                <Input
                  type="email"
                  value={form.companyEmail}
                  onChange={(e) => setForm((p) => ({ ...p, companyEmail: e.target.value }))}
                  placeholder="info@yoursecurity.com"
                  data-testid="input-company-email"
                />
              </div>
              <div>
                <Label>Company Phone</Label>
                <Input
                  value={form.companyPhone}
                  onChange={(e) => setForm((p) => ({ ...p, companyPhone: e.target.value }))}
                  placeholder="(555) 987-6543"
                  data-testid="input-company-phone"
                />
              </div>
              <div>
                <Label>Company Address</Label>
                <Textarea
                  value={form.companyAddress}
                  onChange={(e) => setForm((p) => ({ ...p, companyAddress: e.target.value }))}
                  placeholder="456 Security Blvd, City, ST 67890"
                  rows={2}
                  data-testid="input-company-address"
                />
              </div>
              <div>
                <Label>Valid Until</Label>
                <Input
                  type="date"
                  value={form.validUntil}
                  onChange={(e) => setForm((p) => ({ ...p, validUntil: e.target.value }))}
                  data-testid="input-valid-until"
                />
              </div>
            </div>
          </div>

          {form.proposalType === "shift_proposal" && (
            <>
              <Separator />
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h4 className="text-sm font-medium flex items-center gap-1">
                    <Shield className="h-3.5 w-3.5 text-primary" /> Security Service Details
                  </h4>
                  <Button size="sm" variant="outline" onClick={autoGenerateContent} type="button" data-testid="button-auto-generate">
                    <PenLine className="h-3.5 w-3.5 mr-1" /> Auto-Generate Content
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label>Service Type</Label>
                    <Select value={form.serviceType || "unarmed"} onValueChange={(v) => setForm((p) => ({ ...p, serviceType: v }))}>
                      <SelectTrigger data-testid="select-service-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(SERVICE_TYPES).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Site / Location Name</Label>
                    <Input
                      value={form.siteName || ""}
                      onChange={(e) => setForm((p) => ({ ...p, siteName: e.target.value }))}
                      placeholder="e.g. Acme Warehouse - North Campus"
                      data-testid="input-site-name"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label>Days of Coverage</Label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {DAYS_OF_WEEK.map((day) => {
                        const selected = form.shiftDays?.includes(day);
                        return (
                          <button
                            key={day}
                            type="button"
                            className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${selected ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover-elevate"}`}
                            onClick={() => setForm((p) => ({
                              ...p,
                              shiftDays: selected
                                ? (p.shiftDays || []).filter((d) => d !== day)
                                : [...(p.shiftDays || []), day],
                            }))}
                            data-testid={`button-day-${day.toLowerCase()}`}
                          >
                            {day.slice(0, 3)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <Label>Shift Start Time</Label>
                    <Input
                      type="time"
                      value={form.shiftStartTime || "08:00"}
                      onChange={(e) => setForm((p) => ({ ...p, shiftStartTime: e.target.value }))}
                      data-testid="input-shift-start"
                    />
                  </div>
                  <div>
                    <Label>Shift End Time</Label>
                    <Input
                      type="time"
                      value={form.shiftEndTime || "17:00"}
                      onChange={(e) => setForm((p) => ({ ...p, shiftEndTime: e.target.value }))}
                      data-testid="input-shift-end"
                    />
                  </div>
                  <div>
                    <Label>Number of Guards</Label>
                    <Input
                      type="number"
                      min={1}
                      value={form.numGuards || 1}
                      onChange={(e) => setForm((p) => ({ ...p, numGuards: Number(e.target.value) }))}
                      data-testid="input-num-guards"
                    />
                  </div>
                  <div>
                    <Label>Bill Rate ($/hr per guard)</Label>
                    <Input
                      type="number"
                      min={0}
                      step={0.50}
                      value={form.billRatePerHour || 20}
                      onChange={(e) => setForm((p) => ({ ...p, billRatePerHour: Number(e.target.value) }))}
                      data-testid="input-bill-rate"
                    />
                  </div>
                  <div>
                    <Label>Contract Term (months)</Label>
                    <Select
                      value={String(form.contractTermMonths || 12)}
                      onValueChange={(v) => setForm((p) => ({ ...p, contractTermMonths: Number(v) }))}
                    >
                      <SelectTrigger data-testid="select-contract-term">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 month</SelectItem>
                        <SelectItem value="3">3 months</SelectItem>
                        <SelectItem value="6">6 months</SelectItem>
                        <SelectItem value="12">12 months</SelectItem>
                        <SelectItem value="24">24 months</SelectItem>
                        <SelectItem value="36">36 months</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {step === "content" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h4 className="text-sm font-medium">Proposal Sections</h4>
            <Button size="sm" variant="outline" onClick={addSection} data-testid="button-add-section">
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Section
            </Button>
          </div>
          {form.sections.map((section, i) => (
            <Card key={i}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    value={section.title}
                    onChange={(e) => updateSection(i, "title", e.target.value)}
                    placeholder="Section Title"
                    className="flex-1"
                    data-testid={`input-section-title-${i}`}
                  />
                  {form.sections.length > 1 && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => removeSection(i)}
                      data-testid={`button-remove-section-${i}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <Textarea
                  value={section.content}
                  onChange={(e) => updateSection(i, "content", e.target.value)}
                  placeholder="Section content..."
                  rows={4}
                  data-testid={`input-section-content-${i}`}
                />
              </CardContent>
            </Card>
          ))}
          <div>
            <Label>Terms and Conditions</Label>
            <Textarea
              value={form.termsAndConditions}
              onChange={(e) => setForm((p) => ({ ...p, termsAndConditions: e.target.value }))}
              placeholder="Enter terms and conditions..."
              rows={4}
              data-testid="input-terms"
            />
          </div>
        </div>
      )}

      {step === "pricing" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h4 className="text-sm font-medium">Line Items</h4>
            <Button size="sm" variant="outline" onClick={addLineItem} data-testid="button-add-line-item">
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Item
            </Button>
          </div>
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_70px_90px_90px_36px] gap-2 text-xs text-muted-foreground font-medium px-1">
              <span>Description</span>
              <span>Qty</span>
              <span>Rate</span>
              <span>Total</span>
              <span />
            </div>
            {form.lineItems.map((item, i) => (
              <div key={i} className="grid grid-cols-[1fr_70px_90px_90px_36px] gap-2 items-center">
                <Input
                  value={item.description}
                  onChange={(e) => updateLineItem(i, "description", e.target.value)}
                  placeholder="Service description"
                  data-testid={`input-line-desc-${i}`}
                />
                <Input
                  type="number"
                  min={0}
                  value={item.quantity}
                  onChange={(e) => updateLineItem(i, "quantity", Number(e.target.value))}
                  data-testid={`input-line-qty-${i}`}
                />
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={item.rate}
                  onChange={(e) => updateLineItem(i, "rate", Number(e.target.value))}
                  data-testid={`input-line-rate-${i}`}
                />
                <div className="text-sm font-medium px-2">${item.total.toFixed(2)}</div>
                {form.lineItems.length > 1 && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => removeLineItem(i)}
                    data-testid={`button-remove-line-${i}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <div className="text-lg font-semibold">
              Grand Total: ${grandTotal.toFixed(2)}
            </div>
          </div>
          <div>
            <Label>Status</Label>
            <Select
              value={form.status}
              onValueChange={(v) => setForm((p) => ({ ...p, status: v }))}
            >
              <SelectTrigger data-testid="select-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="review">In Review</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="won">Won</SelectItem>
                <SelectItem value="lost">Lost</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <UniversalModalFooter className="flex-wrap gap-2">
        <Button variant="outline" onClick={onClose} data-testid="button-cancel">
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saveMutation.isPending} data-testid="button-save-proposal">
          {saveMutation.isPending ? "Saving..." : proposal ? "Update Proposal" : "Create Proposal"}
        </Button>
      </UniversalModalFooter>
    </>
  );
}

function ProposalCard({
  proposal,
  onEdit,
  onDelete,
  onDownload,
  onDuplicate,
  onSendPortal,
}: {
  proposal: any;
  onEdit: () => void;
  onDelete: () => void;
  onDownload: () => void;
  onDuplicate: () => void;
  onSendPortal: () => void;
}) {
  const status = STATUS_CONFIG[proposal.status] || STATUS_CONFIG.draft;
  const totalValue = proposal.totalValue ? Number(proposal.totalValue) : 0;

  return (
    <Card data-testid={`card-proposal-${proposal.id}`}>
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
        <div className="flex-1 min-w-0">
          <CardTitle className="text-base truncate" data-testid={`text-proposal-name-${proposal.id}`}>
            {proposal.proposalName}
          </CardTitle>
          {proposal.clientName && (
            <p className="text-sm text-muted-foreground mt-0.5" data-testid={`text-client-${proposal.id}`}>
              {proposal.clientName}
            </p>
          )}
        </div>
        <Badge variant="outline" className={status.className} data-testid={`badge-status-${proposal.id}`}>
          {status.label}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
          {totalValue > 0 && (
            <span className="flex items-center gap-1">
              <DollarSign className="h-3.5 w-3.5" />
              {totalValue.toLocaleString("en-US", { style: "currency", currency: "USD" })}
            </span>
          )}
          {proposal.validUntil && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              Valid until {new Date(proposal.validUntil).toLocaleDateString()}
            </span>
          )}
          {proposal.templateId && (
            <span className="flex items-center gap-1">
              <FileText className="h-3.5 w-3.5" />
              Template
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <Button size="sm" variant="outline" onClick={onEdit} data-testid={`button-edit-${proposal.id}`}>
            <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
          </Button>
          <Button size="sm" variant="default" onClick={onSendPortal} data-testid={`button-send-portal-${proposal.id}`}>
            <Send className="h-3.5 w-3.5 mr-1" /> Send via Portal
          </Button>
          <Button size="sm" variant="outline" onClick={onDownload} data-testid={`button-download-${proposal.id}`}>
            <Download className="h-3.5 w-3.5 mr-1" /> PDF
          </Button>
          <Button size="sm" variant="outline" onClick={onDuplicate} data-testid={`button-duplicate-${proposal.id}`}>
            <Copy className="h-3.5 w-3.5 mr-1" /> Duplicate
          </Button>
          <Button size="sm" variant="destructive" onClick={onDelete} data-testid={`button-delete-${proposal.id}`} aria-label="Delete proposal">
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ProposalBuilderPage() {
  const { user } = useAuth();
  const workspaceId = (user as any)?.currentWorkspaceId;
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProposal, setEditingProposal] = useState<any>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [portalModal, setPortalModal] = useState<{ open: boolean; url: string; contractId: string } | null>(null);
  const [orgSignModal, setOrgSignModal] = useState<{ open: boolean; contract: any } | null>(null);
  const [orgSignerName, setOrgSignerName] = useState("");
  const [orgSignerEmail, setOrgSignerEmail] = useState(() => (user as any)?.email || "");
  const [orgSignerTitle, setOrgSignerTitle] = useState("");
  const [orgTypedSig, setOrgTypedSig] = useState("");

  const { data: proposalsList, isLoading } = useQuery<any[]>({
    queryKey: ["/api/proposals"],
    enabled: !!workspaceId,
  });

  const { data: pendingSignData } = useQuery<{ contracts: any[] }>({
    queryKey: ["/api/contracts", { status: "partially_signed" }],
    enabled: !!workspaceId,
  });
  const pendingContracts = pendingSignData?.contracts || [];

  const sendPortalMutation = useMutation({
    mutationFn: async (proposal) => {
      if (!proposal.clientEmail) throw new Error("Client email is required to send via portal");
      const content = (proposal.sections || [])
        .map((s) => `## ${s.title}\n\n${s.content}`)
        .join("\n\n") || proposal.proposalName;
      const contractRes = await apiRequest("POST", "/api/contracts", {
        clientName: proposal.clientName || "Client",
        clientEmail: proposal.clientEmail,
        title: proposal.proposalName,
        content,
        docType: "proposal",
        services: proposal.lineItems || [],
        billingTerms: { rate: proposal.lineItems?.[0]?.rate, term: proposal.contractTermMonths },
        totalValue: proposal.totalValue ? Number(proposal.totalValue) : undefined,
        specialTerms: proposal.termsAndConditions,
        expiresAt: proposal.validUntil || undefined,
      });
      const contractId = contractRes.contract?.id;
      if (!contractId) throw new Error("Failed to create contract document");
      const sendRes = await apiRequest("POST", `/api/contracts/${contractId}/send`);
      return { portalUrl: sendRes.portalUrl as string, contractId };
    },
    onSuccess: (data) => setPortalModal({ open: true, url: data.portalUrl, contractId: data.contractId }),
    onError: (err: Error) => toast({ title: "Failed to send via portal", description: err.message, variant: "destructive" }),
  });

  const orgSignMutation = useMutation({
    mutationFn: async ({ contractId, name, email, title, sigData }: { contractId: string; name: string; email: string; title: string; sigData: string }) => {
      return apiRequest("POST", `/api/contracts/${contractId}/sign`, {
        signerRole: "company",
        signerName: name,
        signerEmail: email,
        signerTitle: title || undefined,
        signatureType: "typed",
        signatureData: sigData,
        consentText: "I authorize this electronic signature on behalf of the company.",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
    },
    onSuccess: () => {
      toast({ title: "Contract countersigned", description: "The contract is now fully executed." });
      setOrgSignModal(null);
      setOrgTypedSig("");
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", { status: "partially_signed" }] });
    },
    onError: (err: Error) => toast({ title: "Signing failed", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/proposals/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals"] });
      toast({ title: "Proposal deleted" });
    },
    onError: () => toast({ title: "Failed to delete proposal", variant: "destructive" }),
  });

  const duplicateMutation = useMutation({
    mutationFn: async (proposal) => {
      const { id, createdAt, updatedAt, fileUrl, submittedAt, ...rest } = proposal;
      return apiRequest("POST", "/api/proposals", {
        ...rest,
        proposalName: `${rest.proposalName} (Copy)`,
        status: "draft",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals"] });
      toast({ title: "Proposal duplicated" });
    },
    onError: () => toast({ title: "Failed to duplicate proposal", variant: "destructive" }),
  });

  const handleDownloadPdf = async (id: string) => {
    try {
      const res = await fetch(`/api/proposals/${id}/generate-pdf`, { method: "POST", credentials: "include", headers: { 'Content-Type': 'application/json' } });
      if (!res.ok) throw new Error("PDF generation failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `proposal-${id.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "PDF downloaded" });
    } catch {
      toast({ title: "Failed to generate PDF", variant: "destructive" });
    }
  };

  const filtered = (proposalsList || []).filter(
    (p) => filterStatus === "all" || p.status === filterStatus
  );

  const stats = {
    total: proposalsList?.length || 0,
    draft: proposalsList?.filter((p) => p.status === "draft").length || 0,
    submitted: proposalsList?.filter((p) => p.status === "submitted").length || 0,
    won: proposalsList?.filter((p) => p.status === "won").length || 0,
    totalValue: proposalsList
      ?.filter((p) => p.status === "won")
      .reduce((sum: number, p: any) => sum + (Number(p.totalValue) || 0), 0) || 0,
  };

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold" data-testid="text-stat-total">{stats.total}</div>
              <div className="text-xs text-muted-foreground">Total Proposals</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold" data-testid="text-stat-draft">{stats.draft}</div>
              <div className="text-xs text-muted-foreground">Drafts</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold" data-testid="text-stat-submitted">{stats.submitted}</div>
              <div className="text-xs text-muted-foreground">Submitted</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-green-600" data-testid="text-stat-won-value">
                {stats.totalValue > 0
                  ? stats.totalValue.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
                  : "$0"}
              </div>
              <div className="text-xs text-muted-foreground">Won Value</div>
            </CardContent>
          </Card>
        </div>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[140px]" data-testid="select-filter-status">
                <SelectValue placeholder="Filter status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="review">In Review</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="won">Won</SelectItem>
                <SelectItem value="lost">Lost</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={() => {
              setEditingProposal(null);
              setDialogOpen(true);
            }}
            data-testid="button-create-proposal"
          >
            <Plus className="h-4 w-4 mr-1" /> New Proposal
          </Button>
        </div>

        {pendingContracts.length > 0 && (
          <Card className="border-amber-500/50 bg-amber-50/50 dark:bg-amber-900/10">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <PenLine className="h-4 w-4 text-amber-600" />
                <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                  Awaiting Your Signature ({pendingContracts.length})
                </h3>
              </div>
              <p className="text-xs text-muted-foreground">
                These contracts have been signed by the client and are waiting for your countersignature.
              </p>
              <div className="space-y-2">
                {pendingContracts.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-2 flex-wrap bg-background rounded-md p-2.5 border">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{c.title || "Contract"}</p>
                      <p className="text-xs text-muted-foreground">{c.clientName} · {c.clientEmail}</p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => {
                        setOrgSignerEmail((user as any)?.email || "");
                        setOrgSignModal({ open: true, contract: c });
                      }}
                      data-testid={`button-countersign-${c.id}`}
                    >
                      <PenLine className="h-3.5 w-3.5 mr-1" /> Countersign
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-40" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <UniversalEmptyState
            icon={<FileText size={32} />}
            title={filterStatus === "all" ? "No Proposals Yet" : `No ${filterStatus} Proposals`}
            description={filterStatus === "all" ? "Create your first proposal to get started." : `No proposals with status "${filterStatus}".`}
            action={{
              label: "Create Proposal",
              onClick: () => {
                setEditingProposal(null);
                setDialogOpen(true);
              },
            }}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filtered.map((p) => (
              <ProposalCard
                key={p.id}
                proposal={p}
                onEdit={() => {
                  setEditingProposal(p);
                  setDialogOpen(true);
                }}
                onDelete={() => setDeleteConfirmId(p.id)}
                onDownload={() => handleDownloadPdf(p.id)}
                onDuplicate={() => duplicateMutation.mutate(p)}
                onSendPortal={() => sendPortalMutation.mutate(p)}
              />
            ))}
          </div>
        )}
      </div>

      <UniversalModal open={dialogOpen} onOpenChange={setDialogOpen} className="max-w-3xl overflow-y-auto">
        {dialogOpen && (
          <ProposalFormDialog
            proposal={editingProposal}
            onClose={() => setDialogOpen(false)}
          />
        )}
      </UniversalModal>

      <UniversalModal
        open={!!portalModal?.open}
        onOpenChange={(o) => !o && setPortalModal(null)}
        className="max-w-md"
      >
        {portalModal && (
          <UniversalModalContent className="space-y-4">
            <div className="flex items-center gap-2">
              <ExternalLink className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Portal Link Ready</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              The proposal has been sent to the client's portal. Share this link directly, or the client will receive it by email.
            </p>
            <div className="flex items-center gap-2 bg-muted rounded-md p-2.5">
              <span className="text-xs text-muted-foreground flex-1 break-all font-mono">{portalModal.url}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => { navigator.clipboard.writeText(portalModal.url); toast({ title: "Link copied" }); }}
                data-testid="button-copy-portal-link"
              >
                Copy
              </Button>
            </div>
            <Button
              className="w-full"
              variant="outline"
              onClick={() => window.open(portalModal.url, "_blank")}
              data-testid="button-open-portal-preview"
            >
              <ExternalLink className="h-4 w-4 mr-1" /> Preview in Portal
            </Button>
          </UniversalModalContent>
        )}
      </UniversalModal>

      <UniversalModal
        open={!!orgSignModal?.open}
        onOpenChange={(o) => !o && setOrgSignModal(null)}
        className="max-w-md"
      >
        {orgSignModal && (
          <UniversalModalContent className="space-y-4">
            <div className="flex items-center gap-2">
              <PenLine className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Countersign Contract</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              You are signing <strong>{orgSignModal.contract.title}</strong> on behalf of your organization.
            </p>
            <div className="space-y-3">
              <div>
                <Label>Your Full Name *</Label>
                <Input value={orgSignerName} onChange={(e) => setOrgSignerName(e.target.value)} placeholder="Jane Smith" data-testid="input-org-signer-name" />
              </div>
              <div>
                <Label>Your Email *</Label>
                <Input type="email" value={orgSignerEmail} onChange={(e) => setOrgSignerEmail(e.target.value)} data-testid="input-org-signer-email" />
              </div>
              <div>
                <Label>Title / Role</Label>
                <Input value={orgSignerTitle} onChange={(e) => setOrgSignerTitle(e.target.value)} placeholder="Operations Manager" data-testid="input-org-signer-title" />
              </div>
              <div>
                <Label>Type Your Full Name as Signature *</Label>
                <Input
                  value={orgTypedSig}
                  onChange={(e) => setOrgTypedSig(e.target.value)}
                  placeholder="Type your name to sign"
                  className="font-serif italic"
                  data-testid="input-org-typed-sig"
                />
                <p className="text-xs text-muted-foreground mt-1">By typing your name, you agree this constitutes a legal electronic signature.</p>
              </div>
            </div>
            <Button
              className="w-full"
              disabled={!orgSignerName || !orgSignerEmail || !orgTypedSig || orgSignMutation.isPending}
              onClick={() => orgSignMutation.mutate({
                contractId: orgSignModal.contract.id,
                name: orgSignerName,
                email: orgSignerEmail,
                title: orgSignerTitle,
                sigData: orgTypedSig,
              })}
              data-testid="button-submit-org-sig"
            >
              {orgSignMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <PenLine className="h-4 w-4 mr-1" />}
              Sign & Execute Contract
            </Button>
          </UniversalModalContent>
        )}
      </UniversalModal>

      <UniversalModal open={!!deleteConfirmId} onOpenChange={v => !v && setDeleteConfirmId(null)} className="max-w-sm">
        <UniversalModalContent className="space-y-4">
          <UniversalModalHeader>
            <UniversalModalTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              Delete Proposal?
            </UniversalModalTitle>
          </UniversalModalHeader>
          <p className="text-sm text-muted-foreground">This will permanently delete this proposal. This action cannot be undone.</p>
          <UniversalModalFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => { if (deleteConfirmId) { deleteMutation.mutate(deleteConfirmId); setDeleteConfirmId(null); } }}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete-proposal"
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete Proposal"}
            </Button>
          </UniversalModalFooter>
        </UniversalModalContent>
      </UniversalModal>
    </CanvasHubPage>
  );
}
