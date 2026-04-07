import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Mail, Send, Users, Target, CheckCircle2, Clock, Plus, ArrowRight, TrendingUp, FileText, Sparkles
} from "lucide-react";
import type { OrgInvitation, Proposal, Deal, Lead } from "@shared/schema";
import { MARKETING } from "@shared/marketingConfig";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";

const pageConfig: CanvasPageConfig = {
  id: 'workspace-sales',
  title: 'Sales Command Center',
  subtitle: 'Invite organizations to sign up or send custom proposals',
  category: 'operations',
};

/**
 * UNIFIED WORKSPACE SALES PAGE
 * ===========================
 * Single page for:
 * - Inviting organizations to sign up
 * - Sending proposals for business
 * - Tracking leads and deals
 * - Managing sales pipeline
 */
export default function WorkspaceSales() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("invitations");

  // INVITATION FORM STATE
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteOrg, setInviteOrg] = useState("");
  const [inviteContact, setInviteContact] = useState("");
  const [inviteTier, setInviteTier] = useState("starter");

  // PROPOSAL FORM STATE
  const [proposalName, setProposalName] = useState("");
  const [selectedDealId, setSelectedDealId] = useState("");

  // QUERIES
  const { data: invitations = [], refetch: refetchInvitations, isLoading: invitationsLoading } = useQuery<OrgInvitation[]>({
    queryKey: ["/api/sales/invitations"],
  });

  const { data: proposals = [], isLoading: proposalsLoading } = useQuery<Proposal[]>({
    queryKey: ["/api/sales/proposals"],
  });

  const { data: deals = [] } = useQuery<Deal[]>({
    queryKey: ["/api/sales/deals"],
  });

  const { data: leads = [] } = useQuery<Lead[]>({
    queryKey: ["/api/sales/leads"],
  });

  // MUTATIONS
  const sendInvitation = useMutation({
    mutationFn: async (data: { email: string; organizationName: string; contactName: string; offeredTier: string }) => {
      return await apiRequest("POST", "/api/sales/invitations/send", data);
    },
    onSuccess: () => {
      toast({
        title: "Invitation Sent!",
        description: "Organization invitation sent successfully.",
      });
      setInviteEmail("");
      setInviteOrg("");
      setInviteContact("");
      refetchInvitations();
    },
    onError: (error: Error) => {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    },
  });

  const createProposal = useMutation({
    mutationFn: async (data: {
      proposalName: string;
      dealId: string;
      status?: string;
    }) => {
      return await apiRequest("POST", "/api/sales/proposals", data);
    },
    onSuccess: () => {
      toast({ title: "Proposal Created", description: "Proposal draft created and linked to deal." });
      setProposalName("");
      setSelectedDealId("");
      queryClient.invalidateQueries({ queryKey: ["/api/sales/proposals"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    },
  });

  // HANDLERS
  const handleSendInvitation = () => {
    if (!inviteEmail || !inviteOrg) {
      toast({ title: "Missing Info", description: "Email and org name required", variant: "destructive" });
      return;
    }
    sendInvitation.mutate({ email: inviteEmail, organizationName: inviteOrg, contactName: inviteContact, offeredTier: inviteTier });
  };

  const handleCreateProposal = () => {
    if (!proposalName || !selectedDealId) {
      toast({ title: "Missing Info", description: "Proposal name and deal selection required", variant: "destructive" });
      return;
    }
    createProposal.mutate({
      proposalName,
      dealId: selectedDealId,
      status: "draft",
    });
  };

  // METRICS
  const safeInvitations = Array.isArray(invitations) ? invitations : [];
  const safeProposals = Array.isArray(proposals) ? proposals : [];
  const safeDeals = Array.isArray(deals) ? deals : [];
  const safeLeads = Array.isArray(leads) ? leads : [];
  const activeInvitations = safeInvitations.filter(i => i.status === "pending" || i.status === "accepted");
  const completedInvitations = safeInvitations.filter(i => i.status === "completed");
  const sentProposals = safeProposals.filter(p => p.status !== "draft");
  const totalPipelineValue = safeDeals.reduce((sum, d) => sum + (parseFloat(d.estimatedValue?.toString() || "0")), 0);

  return (
    <CanvasHubPage config={pageConfig}>
      {/* Key Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="hover-elevate">
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Invites</CardTitle>
              <Mail className="h-4 w-4 text-blue-500 dark:text-blue-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeInvitations.length}</div>
              <p className="text-xs text-muted-foreground">Pending or in progress</p>
            </CardContent>
          </Card>

          <Card className="hover-elevate">
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Onboarded</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500 dark:text-green-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{completedInvitations.length}</div>
              <p className="text-xs text-muted-foreground">Completed setup</p>
            </CardContent>
          </Card>

          <Card className="hover-elevate">
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Proposals Sent</CardTitle>
              <FileText className="h-4 w-4 text-purple-500 dark:text-purple-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{sentProposals.length}</div>
              <p className="text-xs text-muted-foreground">Active deals</p>
            </CardContent>
          </Card>

          <Card className="hover-elevate">
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pipeline Value</CardTitle>
              <TrendingUp className="h-4 w-4 text-orange-500 dark:text-orange-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${(totalPipelineValue / 1000).toFixed(0)}K</div>
              <p className="text-xs text-muted-foreground">{safeDeals.length} deals tracked</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="invitations" data-testid="tab-invitations">
              <Mail className="h-4 w-4 mr-2" />
              Invitations
            </TabsTrigger>
            <TabsTrigger value="proposals" data-testid="tab-proposals">
              <Target className="h-4 w-4 mr-2" />
              Proposals
            </TabsTrigger>
          </TabsList>

          {/* INVITATIONS TAB */}
          <TabsContent value="invitations" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Send Invitation Card */}
              <Card className="lg:col-span-1">
                <CardHeader>
                  <CardTitle className="text-base">Send Trial Invite</CardTitle>
                  <CardDescription>Invite an organization to try CoAIleague</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="invite-email">Email *</Label>
                    <Input
                      id="invite-email"
                      type="email"
                      placeholder="contact@company.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      data-testid="input-invite-email"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="invite-org">Organization *</Label>
                    <Input
                      id="invite-org"
                      placeholder="ABC Corp"
                      value={inviteOrg}
                      onChange={(e) => setInviteOrg(e.target.value)}
                      data-testid="input-invite-org"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="invite-contact">Contact Name</Label>
                    <Input
                      id="invite-contact"
                      placeholder="Enter contact name"
                      value={inviteContact}
                      onChange={(e) => setInviteContact(e.target.value)}
                      data-testid="input-invite-contact"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="invite-tier">Trial Tier</Label>
                    <Select value={inviteTier} onValueChange={setInviteTier}>
                      <SelectTrigger data-testid="select-invite-tier">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MARKETING.pricing.getTiers()
                          .filter(tier => tier.id !== 'enterprise')
                          .map(tier => (
                            <SelectItem key={tier.id} value={tier.id}>
                              {tier.name} ({tier.id === 'free' ? '30 days' : '14 days'})
                            </SelectItem>
                          ))
                        }
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    onClick={handleSendInvitation}
                    disabled={sendInvitation.isPending}
                    className="w-full"
                    data-testid="button-send-invite"
                  >
                    <Send className="h-4 w-4 mr-2" />
                    {sendInvitation.isPending ? "Sending..." : "Send Invitation"}
                  </Button>
                </CardContent>
              </Card>

              {/* Active Invitations */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-base">Active Invitations</CardTitle>
                  <CardDescription>Organizations in onboarding process</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {invitationsLoading ? (
                    <p className="text-sm text-muted-foreground">Loading...</p>
                  ) : activeInvitations.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Mail className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No active invitations yet</p>
                    </div>
                  ) : (
                    activeInvitations.map((inv) => (
                      <div key={inv.id} className="border rounded-lg p-4 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium">{inv.organizationName}</p>
                            <p className="text-sm text-muted-foreground">{inv.email}</p>
                            {inv.contactName && <p className="text-sm text-muted-foreground">{inv.contactName}</p>}
                          </div>
                          <Badge variant={inv.status === "accepted" ? "default" : "secondary"}>
                            {inv.status === "pending" ? "Pending" : "Accepted"}
                          </Badge>
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-1 text-xs">
                            <span>Onboarding Progress</span>
                            <span>{inv.onboardingProgress}%</span>
                          </div>
                          <Progress value={inv.onboardingProgress} className="h-2" />
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Completed Invitations */}
            {completedInvitations.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                    Completed Onboarding
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {completedInvitations.map((inv) => (
                      <div key={inv.id} className="flex items-center justify-between gap-2 p-3 border rounded-lg">
                        <div>
                          <p className="font-medium">{inv.organizationName}</p>
                          <p className="text-sm text-muted-foreground">{inv.email}</p>
                        </div>
                        <Badge className="bg-green-600">Activated</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* PROPOSALS TAB */}
          <TabsContent value="proposals" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Create Proposal Card */}
              <Card className="lg:col-span-1">
                <CardHeader>
                  <CardTitle className="text-base">Create Proposal</CardTitle>
                  <CardDescription>Create a proposal linked to an existing deal</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="proposal-name">Proposal Name *</Label>
                    <Input
                      id="proposal-name"
                      placeholder="e.g., Enterprise Implementation Plan"
                      value={proposalName}
                      onChange={(e) => setProposalName(e.target.value)}
                      data-testid="input-proposal-name"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="proposal-deal">Link to Deal *</Label>
                    <Select value={selectedDealId} onValueChange={setSelectedDealId}>
                      <SelectTrigger data-testid="select-proposal-deal">
                        <SelectValue placeholder="Select a deal" />
                      </SelectTrigger>
                      <SelectContent>
                        {safeDeals.length === 0 ? (
                          <SelectItem value="none" disabled>No deals available</SelectItem>
                        ) : (
                          safeDeals.map((deal) => (
                            <SelectItem key={deal.id} value={deal.id}>
                              {deal.companyName || deal.id} - ${deal.estimatedValue || 0}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    {safeDeals.length === 0 && (
                      <p className="text-xs text-muted-foreground">Create a deal in the CRM first to link proposals</p>
                    )}
                  </div>

                  <Button
                    onClick={handleCreateProposal}
                    disabled={createProposal.isPending || safeDeals.length === 0}
                    className="w-full"
                    data-testid="button-create-proposal"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    {createProposal.isPending ? "Creating..." : "Create Proposal"}
                  </Button>
                </CardContent>
              </Card>

              {/* Sent Proposals */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-base">Sent Proposals</CardTitle>
                  <CardDescription>{sentProposals.length} proposals in pipeline</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {proposalsLoading ? (
                    <p className="text-sm text-muted-foreground">Loading...</p>
                  ) : sentProposals.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No proposals sent yet</p>
                    </div>
                  ) : (
                    sentProposals.map((proposal) => (
                      <div key={proposal.id} className="border rounded-lg p-4 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{proposal.proposalName}</p>
                            <p className="text-sm text-muted-foreground">Version {proposal.version || 1}</p>
                            <p className="text-xs text-muted-foreground">Deal: {proposal.dealId}</p>
                          </div>
                          <Badge variant={
                            proposal.status === "won" ? "default" :
                            proposal.status === "lost" ? "destructive" :
                            "secondary"
                          }>
                            {proposal.status}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                          <span>{proposal.submittedAt ? `Submitted: ${new Date(proposal.submittedAt).toLocaleDateString()}` : 'Draft'}</span>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
    </CanvasHubPage>
  );
}
