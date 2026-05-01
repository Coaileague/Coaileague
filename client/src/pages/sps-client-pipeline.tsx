import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { CanvasHubPage } from "@/components/canvas-hub";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  FileSignature,
  Plus,
  Send,
  MessageSquare,
  CheckCircle2,
  Clock,
  Building2,
  User,
  MapPin,
  Calendar,
  Sparkles,
  Printer,
  ChevronRight,
  Shield,
  Search,
  Check,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import type { SpsDocument, SpsNegotiationThread, SpsNegotiationMessage } from "@shared/schema";

const SERVICE_TYPES = [
  { id: 'armed', label: 'Armed Security Officer', icon: Shield },
  { id: 'unarmed', label: 'Unarmed/Non-Commissioned', icon: Shield },
  { id: 'ppo', label: 'PPO', icon: User },
  { id: 'patrol', label: 'Mobile Patrol', icon: MapPin },
  { id: 'event', label: 'Event Security', icon: Calendar },
];

const CONTRACT_TERMS = [
  "30-Day Trial",
  "60-Day Trial",
  "90-Day Trial",
  "1 Year",
  "2 Year",
];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// LEGAL_BLOCK is built dynamically from workspace settings — see ContractDialog

export default function SpsClientPipeline() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("proposals");
  const [isNewProposalOpen, setIsNewProposalOpen] = useState(false);

  // Queries
  const { data: documents = [], isLoading: isLoadingDocs } = useQuery<SpsDocument[]>({
    queryKey: ["/api/sps/documents"],
  });

  const { data: negotiations = [], isLoading: isLoadingNegs } = useQuery<SpsNegotiationThread[]>({
    queryKey: ["/api/sps/negotiations"],
  });

  const proposals = documents.filter(d => d.documentType === 'proposal');
  const contracts = documents.filter(d => d.documentType === 'client_contract');

  return (
    <CanvasHubPage
      config={{
        id: "sps-client-pipeline",
        title: "Client Pipeline",
        subtitle: "Manage your sales pipeline from proposal to signed contract",
        category: "operations",
      }}
    >
      <div className="space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div className="overflow-x-auto -mx-1 px-1">
              <TabsList className="w-max">
                <TabsTrigger value="proposals" data-testid="tab-proposals">Proposals</TabsTrigger>
                <TabsTrigger value="negotiations" data-testid="tab-negotiations">Negotiations</TabsTrigger>
                <TabsTrigger value="contracts" data-testid="tab-contracts">Contracts</TabsTrigger>
              </TabsList>
            </div>

            {activeTab === "proposals" && (
              <div className="flex justify-end sm:justify-start shrink-0">
                <Sheet open={isNewProposalOpen} onOpenChange={setIsNewProposalOpen}>
                  <SheetTrigger asChild>
                    <Button data-testid="button-new-proposal">
                      <Plus className="h-4 w-4 mr-2" />
                      New Proposal
                    </Button>
                  </SheetTrigger>
                  <NewProposalSheet onClose={() => setIsNewProposalOpen(false)} />
                </Sheet>
              </div>
            )}
          </div>

          <TabsContent value="proposals" className="mt-0">
            <ProposalsTab proposals={proposals} isLoading={isLoadingDocs} />
          </TabsContent>

          <TabsContent value="negotiations" className="mt-0">
            <NegotiationsTab negotiations={negotiations} isLoading={isLoadingNegs} onContractCreated={() => setActiveTab("contracts")} />
          </TabsContent>

          <TabsContent value="contracts" className="mt-0">
            <ContractsTab contracts={contracts} isLoading={isLoadingDocs} />
          </TabsContent>
        </Tabs>
      </div>
    </CanvasHubPage>
  );
}

function NewProposalSheet({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const { data: workspace } = useQuery<{ companyName?: string; stateLicenseNumber?: string; name?: string }>({
    queryKey: ["/api/workspace/current"],
  });
  const wsOrgName = workspace?.companyName || workspace?.name || "Provider";
  const wsLicenseNum = workspace?.stateLicenseNumber;
  const legalBlock = `${wsOrgName}${wsLicenseNum ? `, LIC#${wsLicenseNum}` : ""}. Fully bonded and insured. A 2% late fee applies to invoices unpaid after 30 days. This company holds a valid state Private Security license.`;

  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    clientName: "",
    clientEmail: "",
    clientPhone: "",
    clientCompanyName: "",
    serviceLocation: "",
    serviceType: "",
    ratePrimary: "",
    rateAdditional: "",
    schedule: {} as Record<string, boolean>,
    shiftStartTime: "08:00",
    shiftEndTime: "17:00",
    contractTerm: "90-Day Trial",
  });

  const createProposalMutation = useMutation({
    mutationFn: async (data) => {
      // First create the document (proposal type)
      const docRes = await apiRequest("POST", "/api/sps/documents", {
        documentType: 'proposal',
        recipientName: data.clientName,
        recipientEmail: data.clientEmail,
        clientCompanyName: data.clientCompanyName,
        serviceLocation: data.serviceLocation,
        serviceType: data.serviceType,
        ratePrimary: data.ratePrimary,
        rateAdditional: data.rateAdditional,
        contractTerm: data.contractTerm,
      });
      const doc = await docRes.json();

      // Then create the negotiation thread
      return apiRequest("POST", "/api/sps/negotiations", {
        clientName: data.clientName,
        clientEmail: data.clientEmail,
        clientPhone: data.clientPhone,
        clientCompanyName: data.clientCompanyName,
        serviceLocation: data.serviceLocation,
        documentId: doc.id,
        proposalData: {
          serviceType: data.serviceType,
          ratePrimary: data.ratePrimary,
          rateAdditional: data.rateAdditional,
          schedule: data.schedule,
          shiftStartTime: data.shiftStartTime,
          shiftEndTime: data.shiftEndTime,
          contractTerm: data.contractTerm,
        }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sps/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sps/negotiations"] });
      toast({ title: "Proposal sent successfully" });
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: 'Proposal Failed',
        description: error.message || 'Something went wrong. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createProposalMutation.mutate(formData);
  };

  return (
    <SheetContent className="sm:max-w-[540px] overflow-y-auto">
      <SheetHeader>
        <SheetTitle>New Service Proposal</SheetTitle>
        <SheetDescription>
          Generate a professional security services proposal and start negotiations.
        </SheetDescription>
      </SheetHeader>

      <form onSubmit={handleSubmit} className="space-y-6 py-6">
        <div className="space-y-4">
          <Label>Service Type</Label>
          <div className="grid grid-cols-2 gap-3">
            {SERVICE_TYPES.map((type) => (
              <Card
                key={type.id}
                className={`cursor-pointer transition-all hover-elevate ${formData.serviceType === type.id ? 'border-primary ring-1 ring-primary' : ''}`}
                onClick={() => setFormData({ ...formData, serviceType: type.id })}
                data-testid={`card-service-type-${type.id}`}
              >
                <CardContent className="p-4 flex flex-col items-center justify-center gap-2 text-center">
                  <type.icon className={`h-6 w-6 ${formData.serviceType === type.id ? 'text-primary' : 'text-muted-foreground'}`} />
                  <span className="text-xs font-medium">{type.label}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {formData.serviceType && (
          <div className="space-y-6 animate-in fade-in slide-in-from-top-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ratePrimary">Primary Rate ($/hr)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                  <Input
                    id="ratePrimary"
                    className="pl-7"
                    placeholder="0.00"
                    value={formData.ratePrimary}
                    onChange={(e) => setFormData({ ...formData, ratePrimary: e.target.value })}
                    required
                    data-testid="input-rate-primary"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rateAdditional">Addl. Rate ($/hr)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                  <Input
                    id="rateAdditional"
                    className="pl-7"
                    placeholder="0.00"
                    value={formData.rateAdditional}
                    onChange={(e) => setFormData({ ...formData, rateAdditional: e.target.value })}
                    required
                    data-testid="input-rate-additional"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-semibold">Client Information</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 col-span-2">
                  <Label htmlFor="clientCompanyName">Company Name</Label>
                  <Input
                    id="clientCompanyName"
                    value={formData.clientCompanyName}
                    onChange={(e) => setFormData({ ...formData, clientCompanyName: e.target.value })}
                    required
                    data-testid="input-client-company"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="clientName">Contact Name</Label>
                  <Input
                    id="clientName"
                    value={formData.clientName}
                    onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
                    required
                    data-testid="input-client-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="clientEmail">Email</Label>
                  <Input
                    id="clientEmail"
                    type="email"
                    value={formData.clientEmail}
                    onChange={(e) => setFormData({ ...formData, clientEmail: e.target.value })}
                    required
                    data-testid="input-client-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="clientPhone">Phone</Label>
                  <Input
                    id="clientPhone"
                    value={formData.clientPhone}
                    onChange={(e) => setFormData({ ...formData, clientPhone: e.target.value })}
                    data-testid="input-client-phone"
                  />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label htmlFor="serviceLocation">Service Location</Label>
                  <Input
                    id="serviceLocation"
                    value={formData.serviceLocation}
                    onChange={(e) => setFormData({ ...formData, serviceLocation: e.target.value })}
                    required
                    data-testid="input-service-location"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-semibold">Schedule & Term</h4>
              <div className="space-y-2">
                <Label>Service Days</Label>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map((day) => (
                    <Button
                      key={day}
                      type="button"
                      variant={formData.schedule[day] ? "default" : "outline"}
                      size="sm"
                      className="h-8 px-3"
                      onClick={() => {
                        setFormData({
                          ...formData,
                          schedule: { ...formData.schedule, [day]: !formData.schedule[day] }
                        });
                      }}
                      data-testid={`button-day-${day.toLowerCase()}`}
                    >
                      {day}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startTime">Start Time</Label>
                  <Input
                    id="startTime"
                    type="time"
                    value={formData.shiftStartTime}
                    onChange={(e) => setFormData({ ...formData, shiftStartTime: e.target.value })}
                    data-testid="input-shift-start"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endTime">End Time</Label>
                  <Input
                    id="endTime"
                    type="time"
                    value={formData.shiftEndTime}
                    onChange={(e) => setFormData({ ...formData, shiftEndTime: e.target.value })}
                    data-testid="input-shift-end"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Contract Term</Label>
                <div className="flex flex-wrap gap-2">
                  {CONTRACT_TERMS.map((term) => (
                    <Button
                      key={term}
                      type="button"
                      variant={formData.contractTerm === term ? "default" : "outline"}
                      size="sm"
                      className="h-8 px-3"
                      onClick={() => setFormData({ ...formData, contractTerm: term })}
                      data-testid={`button-term-${term.replace(/\s+/g, '-').toLowerCase()}`}
                    >
                      {term}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Legal Disclosures</Label>
              <div className="p-3 bg-muted rounded-md text-[10px] leading-relaxed text-muted-foreground border">
                {legalBlock}
              </div>
            </div>
          </div>
        )}

        <SheetFooter>
          <Button
            type="submit"
            className="w-full"
            disabled={createProposalMutation.isPending || !formData.serviceType}
            data-testid="button-send-proposal"
          >
            {createProposalMutation.isPending ? "Sending..." : "Send Proposal"}
          </Button>
        </SheetFooter>
      </form>
    </SheetContent>
  );
}

function ProposalsTab({ proposals, isLoading }: { proposals: SpsDocument[], isLoading: boolean }) {
  if (isLoading) return <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    {[1, 2, 3].map(i => <Card key={i} className="h-48 animate-pulse bg-muted" />)}
  </div>;

  if (proposals.length === 0) return (
    <div className="flex flex-col items-center justify-center py-20 bg-muted/30 rounded-lg border-2 border-dashed px-6 text-center">
      <FileSignature className="h-12 w-12 text-muted-foreground mb-4 shrink-0" />
      <h3 className="text-lg font-medium">No proposals yet</h3>
      <p className="text-muted-foreground text-sm">Create your first proposal to start a new client relationship.</p>
    </div>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {proposals.map((prop) => (
        <Card key={prop.id} className="hover-elevate transition-all border-l-4 border-l-primary">
          <CardHeader className="pb-2">
            <div className="flex justify-between items-start">
              <Badge variant="outline" className="text-[10px] font-mono">{prop.documentNumber}</Badge>
              <Badge className={prop.status === 'sent' ? 'bg-blue-500' : 'bg-green-500'}>{prop.status}</Badge>
            </div>
            <CardTitle className="text-base mt-2">{prop.recipientName}</CardTitle>
            <p className="text-xs text-muted-foreground font-medium">{prop.clientCompanyName}</p>
          </CardHeader>
          <CardContent className="pb-2">
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Shield className="h-3 w-3" />
                <span>{prop.serviceType}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>Sent {format(new Date(prop.createdAt), 'MMM d, yyyy')}</span>
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button variant="ghost" size="sm" className="w-full justify-between" data-testid={`button-view-proposal-${prop.id}`}>
              View Proposal
              <ChevronRight className="h-4 w-4" />
            </Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}

function NegotiationsTab({ negotiations, isLoading, onContractCreated }: { negotiations: SpsNegotiationThread[], isLoading: boolean, onContractCreated: () => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(negotiations[0]?.id || null);

  const { data: threadData, isLoading: isLoadingThread } = useQuery<{ thread: SpsNegotiationThread, messages: SpsNegotiationMessage[] }>({
    queryKey: ["/api/sps/negotiations", selectedId],
    enabled: !!selectedId,
  });

  if (isLoading) return <div className="h-[600px] w-full animate-pulse bg-muted rounded-lg" />;

  if (negotiations.length === 0) return (
    <div className="flex flex-col items-center justify-center py-20 bg-muted/30 rounded-lg border-2 border-dashed">
      <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
      <h3 className="text-lg font-medium">No active negotiations</h3>
      <p className="text-muted-foreground">Active proposals requiring negotiation will appear here.</p>
    </div>
  );

  return (
    <div className="flex h-[700px] border rounded-lg overflow-hidden bg-background">
      {/* Thread List */}
      <div className="w-[300px] border-r flex flex-col">
        <div className="p-4 border-b bg-muted/20">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search negotiations..." className="pl-8 h-9" />
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="divide-y">
            {negotiations.map((neg) => (
              <div
                key={neg.id}
                className={`p-4 cursor-pointer hover:bg-muted/50 transition-colors ${selectedId === neg.id ? 'bg-muted border-l-4 border-l-primary' : ''}`}
                onClick={() => setSelectedId(neg.id)}
                data-testid={`thread-item-${neg.id}`}
              >
                <div className="flex justify-between items-start mb-1">
                  <span className="text-sm font-semibold truncate">{neg.clientName}</span>
                  {neg.agreementDetected && <Badge className="bg-green-500 scale-75 origin-right">Agreement</Badge>}
                </div>
                <p className="text-[10px] text-muted-foreground font-mono mb-1">{neg.proposalNumber}</p>
                <p className="text-xs text-muted-foreground line-clamp-1">Last message snippet...</p>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col relative">
        {selectedId && threadData ? (
          <>
            <div className="p-4 border-b flex justify-between items-center bg-background z-10 shadow-sm">
              <div>
                <h3 className="font-semibold text-sm">{threadData.thread.clientName}</h3>
                <p className="text-xs text-muted-foreground">{threadData.thread.clientCompanyName}</p>
              </div>
              {threadData.thread.agreementDetected && (
                <ConvertContractButton threadId={selectedId} onContractCreated={onContractCreated} />
              )}
            </div>

            {threadData.thread.agreementDetected && threadData.thread.status === 'active' && (
              <div className="bg-yellow-50 border-y border-yellow-200 p-2 flex items-center justify-between px-4 animate-in slide-in-from-top duration-300">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-yellow-600" />
                  <span className="text-xs font-medium text-yellow-800">Agreement detected — Ready to convert to contract</span>
                </div>
              </div>
            )}

            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4 max-w-3xl mx-auto">
                {threadData.messages.map((msg) => (
                  <div key={msg.id} className={`flex flex-col ${msg.senderType === 'org' ? 'items-end' : 'items-start'}`}>
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="text-[10px] font-medium text-muted-foreground">{msg.senderName}</span>
                      <span className="text-[10px] text-muted-foreground/60">{format(new Date(msg.createdAt), 'h:mm a')}</span>
                    </div>
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm shadow-sm ${
                        msg.senderType === 'org'
                          ? 'bg-primary text-primary-foreground rounded-tr-none'
                          : 'bg-muted text-foreground rounded-tl-none'
                      }`}
                    >
                      {msg.messageRaw}
                    </div>
                    {(msg as any).proposedTerms && Object.keys(msg.proposedTerms as any).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {Object.entries(msg.proposedTerms as any).map(([key, val]) => {
                           if (!val) return null;
                           return <Badge key={key} variant="secondary" className="text-[9px] h-4 bg-blue-50 text-blue-700 border-blue-100">{key}: {String(val)}</Badge>
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>

            <NegotiationComposer threadId={selectedId} />
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
            <MessageSquare className="h-12 w-12 mb-4 opacity-20" />
            <p>Select a negotiation to view messages</p>
          </div>
        )}
      </div>

      {/* Terms Tracker Sidebar */}
      {selectedId && threadData && (
        <div className="w-[240px] border-l bg-muted/5 p-4 hidden xl:block overflow-y-auto">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">Terms Tracker</h4>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground">Current Rate</Label>
              <div className="p-2 bg-background border rounded text-sm font-mono flex justify-between">
                <span className="text-muted-foreground">$</span>
                <span>{(threadData.thread.proposalData as any)?.ratePrimary || '--'}</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground">Service Type</Label>
              <div className="p-2 bg-background border rounded text-xs font-medium">
                {(threadData.thread.proposalData as any)?.serviceType || '--'}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground">Term</Label>
              <div className="p-2 bg-background border rounded text-xs font-medium">
                {(threadData.thread.proposalData as any)?.contractTerm || '--'}
              </div>
            </div>
            <Separator />
            <div className="space-y-2">
              <h5 className="text-[10px] font-bold text-muted-foreground uppercase">Schedule</h5>
              <div className="grid grid-cols-4 gap-1">
                {DAYS.map(day => (
                  <div key={day} className={['text-[9px] text-center py-1 rounded border', (threadData.thread.proposalData as any)?.schedule?.[day] ? 'bg-primary/10 border-primary/20 text-primary font-bold' : 'text-muted-foreground/40'].join(' ')}>
                    {day}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NegotiationComposer({ threadId }: { threadId: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const [isPolishing, setIsPolishing] = useState(false);
  const [polishResult, setPolishResult] = useState<{ original: string, polished: string } | null>(null);

  const sendMessageMutation = useMutation({
    mutationFn: (data) => apiRequest("POST", `/api/sps/negotiations/${threadId}/messages`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sps/negotiations", threadId] });
      setMessage("");
      setPolishResult(null);
      toast({ title: 'Message Sent', description: 'Your message has been sent.' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Message Failed',
        description: error.message || 'Something went wrong. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const polishMutation = useMutation({
    mutationFn: async (msg: string) => {
      setIsPolishing(true);
      const res = await apiRequest("POST", `/api/sps/negotiations/${threadId}/polish`, { messageRaw: msg });
      return res.json();
    },
    onSuccess: (data) => {
      setPolishResult(data);
      setIsPolishing(false);
    },
    onError: () => setIsPolishing(false),
  });

  const handleSend = (text: string, usedAi = false) => {
    if (!text.trim()) return;
    sendMessageMutation.mutate({
      messageRaw: text,
      senderType: 'org',
      senderName: user ? `${user.firstName} ${user.lastName}` : 'Agent',
      senderEmail: user?.email || '',
      aiSuggestionUsed: usedAi
    });
  };

  return (
    <div className="p-4 border-t bg-background space-y-4">
      {polishResult && (
        <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-bottom-4">
          <Card className="bg-muted/30 border-dashed">
            <CardHeader className="p-3">
              <CardTitle className="text-[10px] text-muted-foreground uppercase">Original</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 text-xs italic opacity-60">
              {polishResult.original}
            </CardContent>
            <CardFooter className="p-2 pt-0">
              <Button size="sm" variant="ghost" className="h-6 text-[10px] w-full" onClick={() => handleSend(polishResult.original)}>Use Original</Button>
            </CardFooter>
          </Card>
          <Card className="bg-primary/5 border-primary/20 ring-1 ring-primary/10">
            <CardHeader className="p-3">
              <CardTitle className="text-[10px] text-primary uppercase flex items-center gap-1">
                <Sparkles className="h-2.5 w-2.5" /> Trinity Enhanced
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 text-xs font-medium">
              {polishResult.polished}
            </CardContent>
            <CardFooter className="p-2 pt-0">
              <Button size="sm" className="h-6 text-[10px] w-full" onClick={() => handleSend(polishResult.polished, true)}>Use Enhanced</Button>
            </CardFooter>
          </Card>
        </div>
      )}

      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type your message..."
            className="min-h-[80px] pr-20"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend(message);
              }
            }}
          />
          <div className="absolute right-2 bottom-2 flex gap-1">
             <Button
               type="button"
               size="sm"
               variant="ghost"
               className="h-8 w-8 p-0"
               onClick={() => polishMutation.mutate(message)}
               disabled={!message.trim() || isPolishing}
               title="Enhance with AI"
               data-testid="button-enhance-ai"
             >
               {isPolishing ? <Clock className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-primary" />}
             </Button>
             <Button
               size="sm"
               className="h-8 w-8 p-0"
               onClick={() => handleSend(message)}
               disabled={!message.trim()}
               data-testid="button-send-message"
             >
               <Send className="h-4 w-4" />
             </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConvertContractButton({ threadId, onContractCreated }: { threadId: string, onContractCreated: () => void }) {
  const { toast } = useToast();
  const convertMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/sps/negotiations/${threadId}/convert-to-contract`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sps/negotiations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sps/documents"] });
      toast({ title: "Contract generated successfully" });
      onContractCreated();
    },
    onError: (error: Error) => {
      toast({
        title: 'Contract Generation Failed',
        description: error.message || 'Something went wrong. Please try again.',
        variant: 'destructive',
      });
    },
  });

  return (
    <Button
      size="sm"
      className="bg-green-600 hover:bg-green-700 h-8"
      onClick={() => convertMutation.mutate()}
      disabled={convertMutation.isPending}
      data-testid="button-convert-contract"
    >
      {convertMutation.isPending ? <Clock className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
      Convert to Contract
    </Button>
  );
}

function ContractsTab({ contracts, isLoading }: { contracts: SpsDocument[], isLoading: boolean }) {
  if (isLoading) return <div className="space-y-4">
    {[1, 2, 3].map(i => <div key={i} className="h-16 animate-pulse bg-muted rounded-md" />)}
  </div>;

  if (contracts.length === 0) return (
    <div className="flex flex-col items-center justify-center py-20 bg-muted/30 rounded-lg border-2 border-dashed">
      <FileSignature className="h-12 w-12 text-muted-foreground mb-4" />
      <h3 className="text-lg font-medium">No contracts generated</h3>
      <p className="text-muted-foreground">Agreed negotiations converted to contracts will appear here.</p>
    </div>
  );

  return (
    <Card>
      <div className="divide-y">
        <div className="grid grid-cols-6 p-4 text-xs font-bold text-muted-foreground uppercase tracking-wider bg-muted/30">
          <div className="col-span-1">Contract #</div>
          <div className="col-span-1">Client</div>
          <div className="col-span-1">Service Type</div>
          <div className="col-span-1">Status</div>
          <div className="col-span-1">Created</div>
          <div className="col-span-1 text-right">Action</div>
        </div>
        {contracts.map((contract) => (
          <div key={contract.id} className="grid grid-cols-6 p-4 text-sm items-center hover:bg-muted/20 transition-colors">
            <div className="col-span-1 font-mono text-xs">{contract.documentNumber}</div>
            <div className="col-span-1 font-medium">{contract.clientCompanyName}</div>
            <div className="col-span-1 text-xs">{contract.serviceType}</div>
            <div className="col-span-1">
              <Badge className={contract.status === 'completed' ? 'bg-green-500' : 'bg-blue-500'}>{contract.status}</Badge>
            </div>
            <div className="col-span-1 text-xs text-muted-foreground">{format(new Date(contract.createdAt), 'MMM d, yyyy')}</div>
            <div className="col-span-1 text-right">
              <ContractDialog contract={contract} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ContractDialog({ contract }: { contract: SpsDocument }) {
  const { data: workspace } = useQuery<{ companyName?: string; stateLicenseNumber?: string; name?: string }>({
    queryKey: ["/api/workspace/current"],
  });
  const orgName = workspace?.companyName || workspace?.name || "Provider";
  const licenseNum = workspace?.stateLicenseNumber;
  const legalBlock = `${orgName}${licenseNum ? `, LIC#${licenseNum}` : ""}. Fully bonded and insured. A 2% late fee applies to invoices unpaid after 30 days. This company holds a valid state Private Security license.`;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" data-testid={`button-view-contract-${contract.id}`}>View</Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80dvh] sm:max-h-[90dvh] overflow-y-auto">
        <DialogHeader className="border-b pb-4 mb-4">
          <div className="flex justify-between items-center pr-8">
            <DialogTitle>Client Service Contract: {contract.documentNumber}</DialogTitle>
            <Button variant="outline" size="sm" onClick={() => window.print()} data-testid="button-print-contract">
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
          </div>
          <DialogDescription>
            Master service agreement between {orgName} and {contract.clientCompanyName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-8 text-sm p-4 bg-card text-foreground print:p-0">
          {/* Header */}
          <div className="text-center space-y-2 mb-10">
            <h1 className="text-2xl font-bold uppercase tracking-tight">Security Services Agreement</h1>
            <p className="text-sm font-mono">{contract.documentNumber}</p>
          </div>

          {/* Section 1: Parties */}
          <section className="space-y-2">
            <h2 className="font-bold border-b pb-1">1. PARTIES</h2>
            <p>
              This Agreement is made as of <strong>{format(new Date(contract.createdAt), 'MMMM d, yyyy')}</strong>, by and between:
            </p>
            <div className="grid grid-cols-2 gap-8 mt-4">
              <div>
                <p className="font-bold text-[10px] uppercase text-muted-foreground">Provider</p>
                <p className="font-bold">{orgName}</p>
                {licenseNum && <p>License: {licenseNum}</p>}
              </div>
              <div>
                <p className="font-bold text-[10px] uppercase text-muted-foreground">Client</p>
                <p className="font-bold">{contract.clientCompanyName}</p>
                <p>{contract.clientAddress || 'As specified in service location'}</p>
                <p>Contact: {contract.clientContactName}</p>
              </div>
            </div>
          </section>

          {/* Section 2: Recitals */}
          <section className="space-y-2">
            <h2 className="font-bold border-b pb-1">2. RECITALS</h2>
            <p className="text-justify leading-relaxed">
              Provider is a licensed private security agency in the State of Texas, providing professional security personnel and mobile patrol services. Client desires to engage Provider to perform security services as described herein, and Provider agrees to perform such services under the terms and conditions of this Agreement.
            </p>
          </section>

          {/* Section 3: Scope of Services */}
          <section className="space-y-2">
            <h2 className="font-bold border-b pb-1">3. SCOPE OF SERVICES</h2>
            <p>Provider shall provide <strong>{contract.serviceType}</strong> services at the designated location.</p>
            <p>Number of Officers Required: <strong>{contract.officersRequired || 1}</strong></p>
          </section>

          {/* Section 4: Officer Requirements */}
          <section className="space-y-2">
            <h2 className="font-bold border-b pb-1">4. OFFICER REQUIREMENTS</h2>
            <p className="text-justify">
              All security personnel assigned by Provider will be duly licensed by the Texas Department of Public Safety (TXDPS) Private Security Bureau. Officers will be trained in accordance with state law and specific site post orders established by both parties.
            </p>
          </section>

          {/* Section 5: Rates & Billing */}
          <section className="space-y-2">
            <h2 className="font-bold border-b pb-1">5. RATES & BILLING</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-muted/10 border rounded">
                <p className="text-[10px] uppercase font-bold text-muted-foreground">Primary Bill Rate</p>
                <p className="text-xl font-bold">${contract.ratePrimary}/hr</p>
              </div>
              <div className="p-3 bg-muted/10 border rounded">
                <p className="text-[10px] uppercase font-bold text-muted-foreground">Additional/Holiday Rate</p>
                <p className="text-xl font-bold">${contract.rateAdditional}/hr</p>
              </div>
            </div>
            <p className="text-xs mt-2">Billing Cycle: Bi-weekly. Terms: Net-30. A 2% late fee applies to unpaid balances.</p>
          </section>

          {/* Section 6: Schedule */}
          <section className="space-y-2">
            <h2 className="font-bold border-b pb-1">6. SCHEDULE</h2>
            <p>Service Days: <strong>{Object.entries((contract.formData as any)?.proposalData?.schedule || {}).filter(([_,v]) => v).map(([k]) => k).join(', ') || 'As requested'}</strong></p>
            <p>Shift Times: <strong>{(contract.formData as any)?.proposalData?.shiftStartTime} - {(contract.formData as any)?.proposalData?.shiftEndTime}</strong></p>
          </section>

          {/* standard legal sections 7-19 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-[11px] leading-tight">
             {[
               { n: 7, t: "Equipment", c: "Provider supplies all necessary security equipment for officer performance." },
               { n: 8, t: "Uniforms & Appearance", c: "Officers will maintain Provider standard uniform excellence at all times." },
               { n: 9, t: "Reporting", c: "Daily activity reports (DARs) will be provided via CoAIleague platform." },
               { n: 10, t: "Communication", c: "Emergency protocols are established in site post orders." },
               { n: 11, t: "Confidentiality", c: "Mutual non-disclosure of proprietary business information." },
               { n: 12, t: "Liability", c: "Limitation of liability as standard for security services." },
               { n: 13, t: "Indemnification", c: "Mutual indemnification clause for third-party claims." },
               { n: 14, t: "Insurance", c: "Provider maintains required general liability and workers comp coverage." },
               { n: 15, t: "Termination", c: "30-day written notice required for termination without cause." },
               { n: 16, t: "Governing Law", c: "Governed by the laws of the State of Texas." },
               { n: 17, t: "Dispute Resolution", c: "Mediation required before arbitration in Harris County, TX." },
               { n: 18, t: "Advertising Compliance", c: licenseNum ? `State license LIC#${licenseNum} must appear on all correspondence per regulatory requirements.` : "Provider's state license number must appear on all correspondence per regulatory requirements." },
               { n: 19, t: "License Information", c: licenseNum ? `License ${licenseNum} is active and in good standing.` : "Provider's license is active and in good standing." },
             ].map(sec => (
               <div key={sec.n} className="space-y-1">
                 <h4 className="font-bold uppercase text-[10px]">{sec.n}. {sec.t}</h4>
                 <p className="text-muted-foreground">{sec.c}</p>
               </div>
             ))}
          </div>

          {/* Section 20: Signatures */}
          <section className="space-y-4 pt-8">
            <h2 className="font-bold border-b pb-1">20. SIGNATURES</h2>
            <div className="grid grid-cols-2 gap-12 mt-8">
              <div className="space-y-8">
                <div className="border-b h-12 flex items-end font-serif italic text-xl px-2">
                  {contract.status === 'completed' && "Signed Digitally"}
                </div>
                <div>
                  <p className="font-bold">By: {contract.recipientName}</p>
                  <p className="text-xs">Authorized Signatory for Client</p>
                  <p className="text-xs">Date: {contract.completedAt ? format(new Date(contract.completedAt), 'MM/dd/yyyy') : 'Pending'}</p>
                </div>
              </div>
              <div className="space-y-8">
                <div className="border-b h-12 flex items-end font-serif italic text-xl px-2">
                  {contract.orgSignerName}
                </div>
                <div>
                  <p className="font-bold">By: {contract.orgSignerName}</p>
                  <p className="text-xs">Authorized Signatory, {orgName}</p>
                  <p className="text-xs">Date: {format(new Date(contract.createdAt), 'MM/dd/yyyy')}</p>
                </div>
              </div>
            </div>
          </section>

          {/* Section 21: Amendments */}
          <section className="space-y-2 pt-4">
            <h2 className="font-bold border-b pb-1 text-[11px]">21. AMENDMENTS</h2>
            <p className="text-[10px] text-muted-foreground">This agreement may only be amended in writing, signed by both parties.</p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
