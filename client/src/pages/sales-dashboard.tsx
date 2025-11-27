import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Mail, Send, Users, TrendingUp, Target, CheckCircle2, Clock, X, Eye,
  Plus, ArrowRight
} from "lucide-react";
import type { OrgInvitation, Proposal } from "@shared/schema";

export default function SalesDashboard() {
  const { toast } = useToast();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteOrg, setInviteOrg] = useState("");
  const [inviteContact, setInviteContact] = useState("");
  const [inviteTier, setInviteTier] = useState("starter");

  // Fetch active org invitations
  const { data: invitations = [], isLoading: invitationsLoading, refetch: refetchInvitations } = useQuery<OrgInvitation[]>({
    queryKey: ["/api/sales/invitations"],
  });

  // Fetch proposals
  const { data: proposals = [], isLoading: proposalsLoading } = useQuery<Proposal[]>({
    queryKey: ["/api/sales/proposals"],
  });

  // Send org invitation mutation
  const sendInvitation = useMutation({
    mutationFn: async (data: {
      email: string;
      organizationName: string;
      contactName: string;
      offeredTier: string;
    }) => {
      return await apiRequest("/api/sales/invitations/send", "POST", data);
    },
    onSuccess: () => {
      toast({
        title: "Invitation Sent!",
        description: "Free trial invitation sent successfully.",
      });
      setInviteEmail("");
      setInviteOrg("");
      setInviteContact("");
      refetchInvitations();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Send",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Create proposal mutation
  const createProposal = useMutation({
    mutationFn: async (data: {
      title: string;
      description: string;
      prospectEmail: string;
      prospectName: string;
      prospectOrganization: string;
      suggestedTier: string;
      estimatedValue: number;
    }) => {
      return await apiRequest("/api/sales/proposals", "POST", data);
    },
    onSuccess: () => {
      toast({
        title: "Proposal Created",
        description: "Proposal created and ready to send.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/sales/proposals"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Create",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSendInvitation = () => {
    if (!inviteEmail || !inviteOrg) {
      toast({
        title: "Missing Information",
        description: "Please fill in email and organization name",
        variant: "destructive",
      });
      return;
    }

    sendInvitation.mutate({
      email: inviteEmail,
      organizationName: inviteOrg,
      contactName: inviteContact,
      offeredTier: inviteTier,
    });
  };

  const activeInvitations = invitations.filter(inv => inv.status === "pending" || inv.status === "accepted");
  const completedInvitations = invitations.filter(inv => inv.status === "completed");
  const sentProposals = proposals.filter(p => p.status !== "draft");

  return (
    <div className="space-y-8 p-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold">Sales Dashboard</h1>
        <p className="text-muted-foreground mt-2">Manage org invitations, proposals, and track onboarding progress</p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Invites</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeInvitations.length}</div>
            <p className="text-xs text-muted-foreground mt-1">pending or in progress</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Onboarded</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completedInvitations.length}</div>
            <p className="text-xs text-muted-foreground mt-1">completed setup</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Proposals Sent</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{sentProposals.length}</div>
            <p className="text-xs text-muted-foreground mt-1">active deals</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Conv. Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {activeInvitations.length > 0 
                ? Math.round((completedInvitations.length / (activeInvitations.length + completedInvitations.length)) * 100)
                : 0}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">invites to customers</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="invitations" className="space-y-4">
        <TabsList>
          <TabsTrigger value="invitations">Org Invitations</TabsTrigger>
          <TabsTrigger value="proposals">RFPs & Proposals</TabsTrigger>
        </TabsList>

        {/* ===== INVITATIONS TAB ===== */}
        <TabsContent value="invitations" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Send Invitation Card */}
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  Send Trial Invite
                </CardTitle>
                <CardDescription>Invite an organization to try CoAIleague</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="invite-email">Email</Label>
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
                  <Label htmlFor="invite-org">Organization</Label>
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
                    placeholder="John Doe"
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
                      <SelectItem value="free">Free (14 days)</SelectItem>
                      <SelectItem value="starter">Starter (14 days)</SelectItem>
                      <SelectItem value="professional">Professional (30 days)</SelectItem>
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
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Active Invitations
                </CardTitle>
                <CardDescription>Organizations in onboarding progress</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {invitationsLoading ? (
                  <p className="text-sm text-muted-foreground">Loading...</p>
                ) : activeInvitations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No active invitations yet</p>
                ) : (
                  activeInvitations.map((inv) => (
                    <div key={inv.id} className="border rounded-lg p-4 space-y-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium">{inv.organizationName}</p>
                          <p className="text-sm text-muted-foreground">{inv.email}</p>
                          {inv.contactName && (
                            <p className="text-sm text-muted-foreground">{inv.contactName}</p>
                          )}
                        </div>
                        <Badge variant={inv.status === "accepted" ? "default" : "secondary"}>
                          {inv.status === "pending" ? "Pending" : "Accepted"}
                        </Badge>
                      </div>

                      {/* Progress Bar */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium">Onboarding Progress</span>
                          <span className="text-xs text-muted-foreground">{inv.onboardingProgress}%</span>
                        </div>
                        <Progress value={inv.onboardingProgress} className="h-2" />
                      </div>

                      {inv.lastActivityAt && (
                        <p className="text-xs text-muted-foreground">
                          Last activity: {new Date(inv.lastActivityAt).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          {/* Completed/Archived */}
          {completedInvitations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  Completed Onboarding
                </CardTitle>
                <CardDescription>Organizations that completed setup and activated their workspace</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {completedInvitations.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="font-medium">{inv.organizationName}</p>
                        <p className="text-sm text-muted-foreground">{inv.email}</p>
                      </div>
                      <div className="text-right">
                        <Badge className="bg-green-600">Activated</Badge>
                        <p className="text-xs text-muted-foreground mt-1">
                          {inv.acceptedAt ? new Date(inv.acceptedAt).toLocaleDateString() : ""}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ===== PROPOSALS TAB ===== */}
        <TabsContent value="proposals" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Active Proposals
              </CardTitle>
              <CardDescription>RFPs and custom deal proposals</CardDescription>
            </CardHeader>
            <CardContent>
              {proposalsLoading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : sentProposals.length === 0 ? (
                <p className="text-sm text-muted-foreground">No proposals sent yet</p>
              ) : (
                <div className="space-y-3">
                  {sentProposals.map((proposal) => (
                    <div key={proposal.id} className="border rounded-lg p-4 space-y-2">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-medium">{proposal.title}</p>
                          <p className="text-sm text-muted-foreground">{proposal.prospectName} ({proposal.prospectEmail})</p>
                          <p className="text-xs text-muted-foreground">{proposal.prospectOrganization}</p>
                        </div>
                        <div className="text-right">
                          <Badge variant={
                            proposal.status === "accepted" ? "default" :
                            proposal.status === "rejected" ? "destructive" :
                            proposal.status === "viewed" ? "secondary" : "outline"
                          }>
                            {proposal.status === "accepted" ? "✓ Accepted" :
                             proposal.status === "rejected" ? "✗ Rejected" :
                             proposal.status === "viewed" ? "👁 Viewed" :
                             proposal.status === "sent" ? "📬 Sent" : proposal.status}
                          </Badge>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          {proposal.suggestedTier} - ${proposal.estimatedValue || "0"}
                        </span>
                        {proposal.viewCount > 0 && (
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Eye className="h-4 w-4" />
                            {proposal.viewCount} view{proposal.viewCount !== 1 ? "s" : ""}
                          </span>
                        )}
                      </div>

                      {proposal.sentAt && (
                        <p className="text-xs text-muted-foreground">
                          Sent: {new Date(proposal.sentAt).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
