import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Phone, Mail, Building, DollarSign, User, Clock, Target, ChevronRight, TrendingUp, Filter } from "lucide-react";
import { format } from "date-fns";

const LEAD_STAGES = [
  { id: "new", label: "New", color: "bg-slate-500" },
  { id: "contacted", label: "Contacted", color: "bg-blue-500" },
  { id: "qualified", label: "Qualified", color: "bg-purple-500" },
  { id: "demo_scheduled", label: "Demo Scheduled", color: "bg-amber-500" },
  { id: "proposal_sent", label: "Proposal Sent", color: "bg-orange-500" },
  { id: "won", label: "Won", color: "bg-green-500" },
  { id: "lost", label: "Lost", color: "bg-red-500" },
];

const DEAL_STAGES = [
  { id: "prospect", label: "Prospect", color: "bg-slate-500" },
  { id: "qualified", label: "Qualified", color: "bg-blue-500" },
  { id: "rfp_identified", label: "RFP Identified", color: "bg-purple-500" },
  { id: "proposal_sent", label: "Proposal Sent", color: "bg-amber-500" },
  { id: "negotiation", label: "Negotiation", color: "bg-orange-500" },
  { id: "awarded", label: "Awarded", color: "bg-green-500" },
  { id: "lost", label: "Lost", color: "bg-red-500" },
];

interface Lead {
  id: string;
  companyName: string;
  industry: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  contactTitle: string;
  leadStatus: string;
  leadScore: number;
  estimatedValue: string;
  notes: string;
  lastContactedAt: string;
  nextFollowUpDate: string;
  createdAt: string;
}

interface Deal {
  id: string;
  dealName: string;
  companyName: string;
  stage: string;
  estimatedValue: string;
  probability: number;
  expectedCloseDate: string;
  status: string;
  createdAt: string;
}

function LeadCard({ lead, onClick }: { lead: Lead; onClick: () => void }) {
  const stage = LEAD_STAGES.find(s => s.id === lead.leadStatus);
  
  return (
    <Card className="hover-elevate cursor-pointer mb-2" onClick={onClick} data-testid={`card-lead-${lead.id}`}>
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h4 className="font-medium truncate">{lead.companyName}</h4>
            <p className="text-sm text-muted-foreground truncate">{lead.contactName}</p>
          </div>
          {lead.estimatedValue && (
            <Badge variant="secondary" className="shrink-0">
              ${Number(lead.estimatedValue).toLocaleString()}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 mt-2">
          {lead.industry && (
            <Badge variant="outline" className="text-xs">{lead.industry}</Badge>
          )}
          {lead.leadScore > 0 && (
            <Badge variant="outline" className="text-xs">Score: {lead.leadScore}</Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function DealCard({ deal, onClick }: { deal: Deal; onClick: () => void }) {
  return (
    <Card className="hover-elevate cursor-pointer mb-2" onClick={onClick} data-testid={`card-deal-${deal.id}`}>
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h4 className="font-medium truncate">{deal.dealName}</h4>
            <p className="text-sm text-muted-foreground truncate">{deal.companyName}</p>
          </div>
          {deal.estimatedValue && (
            <Badge variant="secondary" className="shrink-0">
              ${Number(deal.estimatedValue).toLocaleString()}
            </Badge>
          )}
        </div>
        <div className="flex items-center justify-between mt-2">
          <Badge variant="outline" className="text-xs">{deal.probability}% prob</Badge>
          {deal.expectedCloseDate && (
            <span className="text-xs text-muted-foreground">
              {format(new Date(deal.expectedCloseDate), "MMM d")}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function SalesCRM() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("leads");
  const [showNewLead, setShowNewLead] = useState(false);
  const [showNewDeal, setShowNewDeal] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [filterIndustry, setFilterIndustry] = useState("all");

  const { data: leadsData, isLoading: leadsLoading } = useQuery({
    queryKey: ["/api/crm"],
  });

  const { data: dealsData, isLoading: dealsLoading } = useQuery({
    queryKey: ["/api/crm/deals"],
  });

  const { data: statsData } = useQuery({
    queryKey: ["/api/crm/pipeline/stats"],
  });

  const createLeadMutation = useMutation({
    mutationFn: (data: any) => apiRequest("/api/crm", { method: "POST", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm"] });
      setShowNewLead(false);
      toast({ title: "Lead created successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error creating lead", description: error.message, variant: "destructive" });
    },
  });

  const updateLeadMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest(`/api/crm/${id}`, { method: "PATCH", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm"] });
      toast({ title: "Lead updated" });
    },
  });

  const createDealMutation = useMutation({
    mutationFn: (data: any) => apiRequest("/api/crm/deals", { method: "POST", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/deals"] });
      setShowNewDeal(false);
      toast({ title: "Deal created successfully" });
    },
  });

  const leads: Lead[] = leadsData?.data || [];
  const deals: Deal[] = dealsData?.data || [];
  const stats = statsData?.data || { pipeline: [], leads: [] };

  const filteredLeads = filterIndustry === "all" 
    ? leads 
    : leads.filter(l => l.industry === filterIndustry);

  const industries = [...new Set(leads.map(l => l.industry).filter(Boolean))];

  const leadsByStage = LEAD_STAGES.reduce((acc, stage) => {
    acc[stage.id] = filteredLeads.filter(l => l.leadStatus === stage.id);
    return acc;
  }, {} as Record<string, Lead[]>);

  const dealsByStage = DEAL_STAGES.reduce((acc, stage) => {
    acc[stage.id] = deals.filter(d => d.stage === stage.id && d.status === "active");
    return acc;
  }, {} as Record<string, Deal[]>);

  const handleSubmitLead = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createLeadMutation.mutate({
      companyName: formData.get("companyName"),
      industry: formData.get("industry"),
      contactName: formData.get("contactName"),
      contactEmail: formData.get("contactEmail"),
      contactPhone: formData.get("contactPhone"),
      contactTitle: formData.get("contactTitle"),
      estimatedValue: formData.get("estimatedValue"),
      notes: formData.get("notes"),
    });
  };

  const handleSubmitDeal = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createDealMutation.mutate({
      dealName: formData.get("dealName"),
      companyName: formData.get("companyName"),
      estimatedValue: formData.get("estimatedValue"),
      probability: Number(formData.get("probability")) || 50,
      expectedCloseDate: formData.get("expectedCloseDate"),
    });
  };

  const handleDragStart = (e: React.DragEvent, leadId: string) => {
    e.dataTransfer.setData("leadId", leadId);
  };

  const handleDrop = (e: React.DragEvent, newStatus: string) => {
    e.preventDefault();
    const leadId = e.dataTransfer.getData("leadId");
    if (leadId) {
      updateLeadMutation.mutate({ id: leadId, leadStatus: newStatus });
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-4 border-b">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Sales CRM</h1>
          <p className="text-muted-foreground">Manage leads and deals pipeline</p>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={showNewLead} onOpenChange={setShowNewLead}>
            <DialogTrigger asChild>
              <Button data-testid="button-new-lead">
                <Plus className="w-4 h-4 mr-2" />
                New Lead
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Lead</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmitLead} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="companyName">Company Name *</Label>
                    <Input id="companyName" name="companyName" required data-testid="input-company-name" />
                  </div>
                  <div>
                    <Label htmlFor="industry">Industry</Label>
                    <Select name="industry">
                      <SelectTrigger data-testid="select-industry">
                        <SelectValue placeholder="Select industry" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="security">Security</SelectItem>
                        <SelectItem value="healthcare">Healthcare</SelectItem>
                        <SelectItem value="cleaning">Cleaning</SelectItem>
                        <SelectItem value="construction">Construction</SelectItem>
                        <SelectItem value="property_management">Property Management</SelectItem>
                        <SelectItem value="manufacturing">Manufacturing</SelectItem>
                        <SelectItem value="retail">Retail</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="contactName">Contact Name</Label>
                    <Input id="contactName" name="contactName" data-testid="input-contact-name" />
                  </div>
                  <div>
                    <Label htmlFor="contactTitle">Title</Label>
                    <Input id="contactTitle" name="contactTitle" data-testid="input-contact-title" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="contactEmail">Email *</Label>
                    <Input id="contactEmail" name="contactEmail" type="email" required data-testid="input-contact-email" />
                  </div>
                  <div>
                    <Label htmlFor="contactPhone">Phone</Label>
                    <Input id="contactPhone" name="contactPhone" type="tel" data-testid="input-contact-phone" />
                  </div>
                </div>
                <div>
                  <Label htmlFor="estimatedValue">Estimated Value ($)</Label>
                  <Input id="estimatedValue" name="estimatedValue" type="number" data-testid="input-estimated-value" />
                </div>
                <div>
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea id="notes" name="notes" data-testid="input-notes" />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createLeadMutation.isPending} data-testid="button-submit-lead">
                    {createLeadMutation.isPending ? "Creating..." : "Create Lead"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={showNewDeal} onOpenChange={setShowNewDeal}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="button-new-deal">
                <Target className="w-4 h-4 mr-2" />
                New Deal
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Deal</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmitDeal} className="space-y-4">
                <div>
                  <Label htmlFor="dealName">Deal Name *</Label>
                  <Input id="dealName" name="dealName" required data-testid="input-deal-name" />
                </div>
                <div>
                  <Label htmlFor="companyName">Company Name *</Label>
                  <Input id="companyName" name="companyName" required data-testid="input-deal-company" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="estimatedValue">Value ($)</Label>
                    <Input id="estimatedValue" name="estimatedValue" type="number" data-testid="input-deal-value" />
                  </div>
                  <div>
                    <Label htmlFor="probability">Probability (%)</Label>
                    <Input id="probability" name="probability" type="number" min="0" max="100" defaultValue="50" data-testid="input-probability" />
                  </div>
                </div>
                <div>
                  <Label htmlFor="expectedCloseDate">Expected Close Date</Label>
                  <Input id="expectedCloseDate" name="expectedCloseDate" type="date" data-testid="input-close-date" />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createDealMutation.isPending} data-testid="button-submit-deal">
                    {createDealMutation.isPending ? "Creating..." : "Create Deal"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 p-4 border-b">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <User className="w-5 h-5 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{leads.length}</p>
                <p className="text-sm text-muted-foreground">Total Leads</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-purple-500" />
              <div>
                <p className="text-2xl font-bold">{deals.filter(d => d.status === "active").length}</p>
                <p className="text-sm text-muted-foreground">Active Deals</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-green-500" />
              <div>
                <p className="text-2xl font-bold">
                  ${deals.filter(d => d.status === "active").reduce((sum, d) => sum + (Number(d.estimatedValue) || 0), 0).toLocaleString()}
                </p>
                <p className="text-sm text-muted-foreground">Pipeline Value</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-amber-500" />
              <div>
                <p className="text-2xl font-bold">{deals.filter(d => d.status === "won").length}</p>
                <p className="text-sm text-muted-foreground">Won Deals</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 border-b">
          <TabsList>
            <TabsTrigger value="leads" data-testid="tab-leads">Lead Pipeline</TabsTrigger>
            <TabsTrigger value="deals" data-testid="tab-deals">Deals Pipeline</TabsTrigger>
          </TabsList>
          {activeTab === "leads" && (
            <div className="flex items-center gap-2 py-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <Select value={filterIndustry} onValueChange={setFilterIndustry}>
                <SelectTrigger className="w-40" data-testid="select-filter-industry">
                  <SelectValue placeholder="All Industries" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Industries</SelectItem>
                  {industries.map(ind => (
                    <SelectItem key={ind} value={ind!}>{ind}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <TabsContent value="leads" className="flex-1 overflow-hidden m-0 p-0">
          <div className="flex h-full overflow-x-auto">
            {LEAD_STAGES.slice(0, -1).map(stage => (
              <div
                key={stage.id}
                className="flex-shrink-0 w-64 border-r flex flex-col"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleDrop(e, stage.id)}
              >
                <div className="p-3 border-b flex items-center justify-between sticky top-0 bg-background">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${stage.color}`} />
                    <span className="font-medium text-sm">{stage.label}</span>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {leadsByStage[stage.id]?.length || 0}
                  </Badge>
                </div>
                <ScrollArea className="flex-1">
                  <div className="p-2">
                    {leadsByStage[stage.id]?.map(lead => (
                      <div
                        key={lead.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, lead.id)}
                      >
                        <LeadCard lead={lead} onClick={() => setSelectedLead(lead)} />
                      </div>
                    ))}
                    {(!leadsByStage[stage.id] || leadsByStage[stage.id].length === 0) && (
                      <p className="text-sm text-muted-foreground text-center py-4">No leads</p>
                    )}
                  </div>
                </ScrollArea>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="deals" className="flex-1 overflow-hidden m-0 p-0">
          <div className="flex h-full overflow-x-auto">
            {DEAL_STAGES.slice(0, -1).map(stage => (
              <div
                key={stage.id}
                className="flex-shrink-0 w-64 border-r flex flex-col"
              >
                <div className="p-3 border-b flex items-center justify-between sticky top-0 bg-background">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${stage.color}`} />
                    <span className="font-medium text-sm">{stage.label}</span>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {dealsByStage[stage.id]?.length || 0}
                  </Badge>
                </div>
                <ScrollArea className="flex-1">
                  <div className="p-2">
                    {dealsByStage[stage.id]?.map(deal => (
                      <DealCard key={deal.id} deal={deal} onClick={() => setSelectedDeal(deal)} />
                    ))}
                    {(!dealsByStage[stage.id] || dealsByStage[stage.id].length === 0) && (
                      <p className="text-sm text-muted-foreground text-center py-4">No deals</p>
                    )}
                  </div>
                </ScrollArea>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={!!selectedLead} onOpenChange={() => setSelectedLead(null)}>
        <DialogContent size="xl">
          {selectedLead && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Building className="w-5 h-5" />
                  {selectedLead.companyName}
                </DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium mb-2">Contact Information</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-muted-foreground" />
                        <span>{selectedLead.contactName || "N/A"}</span>
                        {selectedLead.contactTitle && (
                          <span className="text-muted-foreground">({selectedLead.contactTitle})</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-muted-foreground" />
                        <a href={`mailto:${selectedLead.contactEmail}`} className="text-primary hover:underline">
                          {selectedLead.contactEmail}
                        </a>
                      </div>
                      {selectedLead.contactPhone && (
                        <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4 text-muted-foreground" />
                          <span>{selectedLead.contactPhone}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <h4 className="font-medium mb-2">Lead Details</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Status:</span>
                        <Badge>{LEAD_STAGES.find(s => s.id === selectedLead.leadStatus)?.label}</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Industry:</span>
                        <span>{selectedLead.industry || "N/A"}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Score:</span>
                        <span>{selectedLead.leadScore}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Value:</span>
                        <span>${Number(selectedLead.estimatedValue || 0).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div>
                  <h4 className="font-medium mb-2">Notes</h4>
                  <p className="text-sm text-muted-foreground">{selectedLead.notes || "No notes"}</p>
                  <div className="mt-4 space-y-2">
                    {selectedLead.lastContactedAt && (
                      <div className="flex items-center gap-2 text-sm">
                        <Clock className="w-4 h-4 text-muted-foreground" />
                        <span>Last contacted: {format(new Date(selectedLead.lastContactedAt), "MMM d, yyyy")}</span>
                      </div>
                    )}
                    {selectedLead.nextFollowUpDate && (
                      <div className="flex items-center gap-2 text-sm">
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        <span>Follow-up: {format(new Date(selectedLead.nextFollowUpDate), "MMM d, yyyy")}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSelectedLead(null)}>Close</Button>
                <Button onClick={() => {
                  const nextStageIndex = LEAD_STAGES.findIndex(s => s.id === selectedLead.leadStatus) + 1;
                  if (nextStageIndex < LEAD_STAGES.length - 1) {
                    updateLeadMutation.mutate({ id: selectedLead.id, leadStatus: LEAD_STAGES[nextStageIndex].id });
                    setSelectedLead(null);
                  }
                }} data-testid="button-advance-lead">
                  Advance Stage <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
