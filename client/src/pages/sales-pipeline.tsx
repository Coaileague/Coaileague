import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, TrendingUp, Users, DollarSign, Target, ChevronRight, Star, Phone, Mail, Building2 } from "lucide-react";

const STAGES = [
  { key: "captured", label: "Captured", color: "bg-slate-500" },
  { key: "qualified", label: "Qualified", color: "bg-blue-500" },
  { key: "outreach_active", label: "Outreach Active", color: "bg-yellow-500" },
  { key: "proposal_sent", label: "Proposal Sent", color: "bg-orange-500" },
  { key: "proposal_approved", label: "Proposal Approved", color: "bg-green-400" },
  { key: "contract_sent", label: "Contract Sent", color: "bg-purple-500" },
  { key: "contract_executed", label: "Contract Executed", color: "bg-emerald-600" },
  { key: "onboarded", label: "Onboarded", color: "bg-green-700" },
];

const LEAD_SOURCES = ["manual_entry", "referral", "website", "cold_call", "linkedin", "event", "partner"];
const POST_TYPES = ["armed_security", "unarmed_security", "patrol", "event_security", "executive_protection", "loss_prevention", "other"];

interface Lead {
  id: string;
  company_name: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  lead_source?: string;
  stage: string;
  lead_score: number;
  estimated_contract_value?: string;
  estimated_officers_needed?: number;
  primary_post_type?: string;
  notes?: string;
  created_at: string;
}

function LeadCard({ lead, onSelect }: { lead: Lead; onSelect: (l: Lead) => void }) {
  return (
    <div
      data-testid={`card-lead-${lead.id}`}
      className="bg-card border rounded-md p-3 mb-2 cursor-pointer hover-elevate"
      onClick={() => onSelect(lead)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate" data-testid={`text-lead-company-${lead.id}`}>{lead.company_name}</p>
          {lead.contact_name && <p className="text-xs text-muted-foreground truncate">{lead.contact_name}</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Star className="h-3 w-3 text-yellow-500" />
          <span className="text-xs font-medium">{lead.lead_score}</span>
        </div>
      </div>
      {lead.estimated_contract_value && (
        <p className="text-xs text-muted-foreground mt-1">
          ${parseFloat(lead.estimated_contract_value).toLocaleString()}/mo
        </p>
      )}
      {lead.primary_post_type && (
        <Badge variant="outline" className="text-xs mt-1">{lead.primary_post_type.replace(/_/g, " ")}</Badge>
      )}
    </div>
  );
}

function AddLeadDialog({ onCreated }: { onCreated: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    companyName: "", contactName: "", contactEmail: "", contactPhone: "",
    leadSource: "manual_entry", primaryPostType: "", estimatedContractValue: "",
    estimatedOfficersNeeded: "", notes: "",
  });

  const createMutation = useMutation({
    mutationFn: (data) => apiRequest("POST", "/api/sales/pipeline/leads", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales/pipeline/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sales/pipeline/pipeline/analytics"] });
      setOpen(false);
      setForm({ companyName: "", contactName: "", contactEmail: "", contactPhone: "", leadSource: "manual_entry", primaryPostType: "", estimatedContractValue: "", estimatedOfficersNeeded: "", notes: "" });
      onCreated();
      toast({ title: "Lead created", description: "Trinity is scoring this lead." });
    },
    onError: () => toast({ title: "Error", description: "Could not create lead.", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="default" data-testid="button-add-lead">
          <Plus className="h-4 w-4 mr-2" /> Add Lead
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>New Sales Lead</DialogTitle></DialogHeader>
        <div className="grid gap-3 py-2">
          <Input data-testid="input-company-name" placeholder="Company Name *" value={form.companyName}
            onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <Input data-testid="input-contact-name" placeholder="Contact Name" value={form.contactName}
              onChange={e => setForm(f => ({ ...f, contactName: e.target.value }))} />
            <Input data-testid="input-contact-phone" placeholder="Phone" value={form.contactPhone}
              onChange={e => setForm(f => ({ ...f, contactPhone: e.target.value }))} />
          </div>
          <Input data-testid="input-contact-email" type="email" placeholder="Contact Email" value={form.contactEmail}
            onChange={e => setForm(f => ({ ...f, contactEmail: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <Select value={form.leadSource} onValueChange={v => setForm(f => ({ ...f, leadSource: v }))}>
              <SelectTrigger data-testid="select-lead-source">
                <SelectValue placeholder="Lead Source" />
              </SelectTrigger>
              <SelectContent>
                {LEAD_SOURCES.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={form.primaryPostType} onValueChange={v => setForm(f => ({ ...f, primaryPostType: v }))}>
              <SelectTrigger data-testid="select-post-type">
                <SelectValue placeholder="Post Type" />
              </SelectTrigger>
              <SelectContent>
                {POST_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input data-testid="input-contract-value" type="number" placeholder="Monthly Value ($)" value={form.estimatedContractValue}
              onChange={e => setForm(f => ({ ...f, estimatedContractValue: e.target.value }))} />
            <Input data-testid="input-officers-needed" type="number" placeholder="Officers Needed" value={form.estimatedOfficersNeeded}
              onChange={e => setForm(f => ({ ...f, estimatedOfficersNeeded: e.target.value }))} />
          </div>
          <Textarea data-testid="input-notes" placeholder="Notes" value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
        </div>
        <Button data-testid="button-submit-lead" onClick={() => createMutation.mutate({
          ...form,
          estimatedContractValue: form.estimatedContractValue ? parseFloat(form.estimatedContractValue) : undefined,
          estimatedOfficersNeeded: form.estimatedOfficersNeeded ? parseInt(form.estimatedOfficersNeeded) : undefined,
        })} disabled={!form.companyName || createMutation.isPending}>
          {createMutation.isPending ? "Creating..." : "Create Lead"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function LeadDetailPanel({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const { toast } = useToast();

  const advanceMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/sales/pipeline/leads/${lead.id}/advance`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales/pipeline/leads"] });
      toast({ title: "Stage advanced" });
      onClose();
    },
    onError: () => toast({ title: "Cannot advance stage", variant: "destructive" }),
  });

  const generateProposal = useMutation({
    mutationFn: () => apiRequest("POST", "/api/sales/pipeline/proposals/generate", { leadId: lead.id, contractTermMonths: 12 }),
    onSuccess: () => {
      toast({ title: "Proposal created" });
    },
    onError: () => toast({ title: "Error creating proposal", variant: "destructive" }),
  });

  const stage = STAGES.find(s => s.key === lead.stage);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {stage && <Badge className={`${stage.color} text-white`}>{stage.label}</Badge>}
        <div className="flex items-center gap-1">
          <Star className="h-4 w-4 text-yellow-500" />
          <span className="text-sm font-medium">Score: {lead.lead_score}/100</span>
        </div>
      </div>

      <div className="grid gap-2 text-sm">
        {lead.contact_name && (
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span>{lead.contact_name}</span>
          </div>
        )}
        {lead.contact_email && (
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <span>{lead.contact_email}</span>
          </div>
        )}
        {lead.contact_phone && (
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-muted-foreground" />
            <span>{lead.contact_phone}</span>
          </div>
        )}
        {lead.estimated_contract_value && (
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            <span>${parseFloat(lead.estimated_contract_value).toLocaleString()}/mo</span>
          </div>
        )}
        {lead.estimated_officers_needed && (
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-muted-foreground" />
            <span>{lead.estimated_officers_needed} officers needed</span>
          </div>
        )}
      </div>

      {lead.notes && (
        <div className="text-sm text-muted-foreground border rounded-md p-2">{lead.notes}</div>
      )}

      <div className="flex gap-2 flex-wrap">
        <Button size="default" onClick={() => advanceMutation.mutate()} disabled={advanceMutation.isPending || lead.stage === "onboarded"}
          data-testid="button-advance-stage">
          <ChevronRight className="h-4 w-4 mr-1" />
          {advanceMutation.isPending ? "Advancing..." : "Advance Stage"}
        </Button>
        {(lead.stage === "qualified" || lead.stage === "outreach_active") && (
          <Button variant="outline" size="default" onClick={() => generateProposal.mutate()} disabled={generateProposal.isPending}
            data-testid="button-generate-proposal">
            {generateProposal.isPending ? "Generating..." : "Generate Proposal"}
          </Button>
        )}
      </div>
    </div>
  );
}

export default function SalesPipelinePage() {
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("all");

  const { data, isLoading } = useQuery<{ leads: Lead[]; total: number }>({
    queryKey: ["/api/sales/pipeline/leads"],
  });

  const { data: analytics } = useQuery<any>({
    queryKey: ["/api/sales/pipeline/pipeline/analytics"],
  });

  const leads = data?.leads || [];

  const filteredLeads = leads.filter(l => {
    const matchSearch = !searchQuery || l.company_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (l.contact_name || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchStage = stageFilter === "all" || l.stage === stageFilter;
    return matchSearch && matchStage;
  });

  const leadsByStage = STAGES.reduce((acc, s) => {
    acc[s.key] = filteredLeads.filter(l => l.stage === s.key);
    return acc;
  }, {} as Record<string, Lead[]>);

  const totalPipelineValue = leads.reduce((sum, l) => sum + parseFloat(l.estimated_contract_value || "0"), 0);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold">Sales Pipeline</h1>
            <p className="text-sm text-muted-foreground">AI-scored leads with autonomous outreach</p>
          </div>
          <AddLeadDialog onCreated={() => {}} />
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <Card>
            <CardContent className="p-3 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-blue-500 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Total Leads</p>
                <p className="font-bold text-sm" data-testid="text-total-leads">{data?.total ?? 0}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-500 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Pipeline Value</p>
                <p className="font-bold text-sm">${(totalPipelineValue).toLocaleString()}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 flex items-center gap-2">
              <Target className="h-5 w-5 text-yellow-500 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Win Rate</p>
                <p className="font-bold text-sm">{analytics?.winRate ?? "0"}%</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 flex items-center gap-2">
              <Star className="h-5 w-5 text-orange-500 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Avg Score</p>
                <p className="font-bold text-sm">{analytics?.avgLeadScore ?? "0"}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mt-3 flex-wrap">
          <Input
            data-testid="input-search-leads"
            placeholder="Search leads..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="max-w-xs"
          />
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger data-testid="select-stage-filter" className="w-44">
              <SelectValue placeholder="All Stages" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stages</SelectItem>
              {STAGES.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-3 p-4 min-w-max h-full">
          {STAGES.map(stage => {
            const stageLeads = leadsByStage[stage.key] || [];
            return (
              <div key={stage.key} className="w-56 flex flex-col" data-testid={`column-stage-${stage.key}`}>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <div className={`w-2 h-2 rounded-full ${stage.color} shrink-0`} />
                  <span className="text-xs font-medium truncate">{stage.label}</span>
                  <Badge variant="secondary" className="ml-auto text-xs shrink-0">{stageLeads.length}</Badge>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {isLoading ? (
                    <div className="space-y-2">
                      {[1,2].map(i => <div key={i} className="h-16 bg-muted rounded-md animate-pulse" />)}
                    </div>
                  ) : stageLeads.length === 0 ? (
                    <div className="text-xs text-muted-foreground text-center py-6 border border-dashed rounded-md">
                      No leads
                    </div>
                  ) : (
                    stageLeads.map(lead => (
                      <LeadCard key={lead.id} lead={lead} onSelect={setSelectedLead} />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Lead Detail Dialog */}
      <Dialog open={!!selectedLead} onOpenChange={open => !open && setSelectedLead(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              {selectedLead?.company_name}
            </DialogTitle>
          </DialogHeader>
          {selectedLead && (
            <LeadDetailPanel lead={selectedLead} onClose={() => setSelectedLead(null)} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
