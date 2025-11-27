/**
 * Email Campaigns & Prospect Targeting Page
 * Universal RBAC wrapper - requires MANAGE_WORKSPACE permission
 * Manages manual prospect outreach and autonomous email campaigns
 */

import { UniversalPage } from "@/components/UniversalPage";
import { PERMISSIONS } from "@shared/platformConfig";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Mail, Zap, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function EmailCampaigns() {
  const { toast } = useToast();
  const [tab, setTab] = useState<"manual" | "autonomous">("manual");
  const [prospectEmail, setProspectEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [selectedStage, setSelectedStage] = useState("prospect_contact");
  const [campaignName, setCampaignName] = useState("");
  const [recipientCount, setRecipientCount] = useState(10);
  const [campaignType, setCampaignType] = useState("prospect");

  // Fetch stages
  const { data: stagesData } = useQuery<{ data: Array<{ id: string; name: string; description: string; duration: string }> }>({
    queryKey: ["/api/emails/stages"],
    queryFn: () => apiRequest("/api/emails/stages"),
  });

  // Fetch campaigns
  const { data: campaignsData, refetch } = useQuery<{ data: Array<{ id: string; name: string; sentCount: number; recipientCount: number; status: string; type: string }> }>({
    queryKey: ["/api/emails/campaigns"],
    queryFn: () => apiRequest("/api/emails/campaigns"),
  });

  // Send manual email mutation
  const sendManualMutation = useMutation({
    mutationFn: () =>
      apiRequest<{ cost: string; sent: number }>("/api/emails/send-manual", {
        method: "POST",
        body: {
          to: prospectEmail,
          stage: selectedStage,
          templateData: { companyName, contactName },
        },
      }),
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: `Email sent to ${prospectEmail}. Cost: ${data.cost}`,
      });
      setProspectEmail("");
      setCompanyName("");
      setContactName("");
      refetch();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: String(error),
        variant: "destructive",
      });
    },
  });

  // Start autonomous campaign mutation
  const autonomousMutation = useMutation({
    mutationFn: () =>
      apiRequest<{ sent: number; cost: string }>("/api/emails/autonomous-campaign", {
        method: "POST",
        body: {
          campaignType,
          campaignName,
          recipientCount,
        },
      }),
    onSuccess: (data) => {
      toast({
        title: "Campaign Started",
        description: `Sent ${data.sent} emails. Cost: ${data.cost}`,
      });
      setCampaignName("");
      setRecipientCount(10);
      refetch();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: String(error),
        variant: "destructive",
      });
    },
  });

  return (
    <UniversalPage
      title="Email Campaigns"
      description="Send targeted emails to prospects and run autonomous campaigns"
      permission={PERMISSIONS.MANAGE_WORKSPACE}
      className="space-y-6"
    >
      {/* Tab Navigation */}
      <div className="flex gap-2 border-b">
        <Button
          variant={tab === "manual" ? "default" : "ghost"}
          onClick={() => setTab("manual")}
          data-testid="button-tab-manual"
        >
          <Mail className="h-4 w-4 mr-2" />
          Manual Outreach
        </Button>
        <Button
          variant={tab === "autonomous" ? "default" : "ghost"}
          onClick={() => setTab("autonomous")}
          data-testid="button-tab-autonomous"
        >
          <Zap className="h-4 w-4 mr-2" />
          Autonomous Campaigns
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Manual Outreach - Left Column */}
        {tab === "manual" && (
          <div className="lg:col-span-1 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Target Prospect</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium block mb-2">
                    Prospect Email
                  </label>
                  <Input
                    type="email"
                    placeholder="john@company.com"
                    value={prospectEmail}
                    onChange={(e) => setProspectEmail(e.target.value)}
                    data-testid="input-prospect-email"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium block mb-2">Company Name</label>
                  <Input
                    placeholder="Acme Corporation"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    data-testid="input-company-name"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium block mb-2">Contact Name</label>
                  <Input
                    placeholder="John Smith"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    data-testid="input-contact-name"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium block mb-2">Pipeline Stage</label>
                  <Select value={selectedStage} onValueChange={setSelectedStage}>
                    <SelectTrigger data-testid="select-stage">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {stagesData?.data?.map((stage) => (
                        <SelectItem key={stage.id} value={stage.id}>
                          {stage.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  onClick={() => sendManualMutation.mutate()}
                  disabled={
                    !prospectEmail ||
                    !companyName ||
                    !contactName ||
                    sendManualMutation.isPending
                  }
                  className="w-full"
                  data-testid="button-send-manual"
                >
                  <Send className="h-4 w-4 mr-2" />
                  {sendManualMutation.isPending ? "Sending..." : "Send Email"}
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Autonomous Campaigns - Left Column */}
        {tab === "autonomous" && (
          <div className="lg:col-span-1 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Start Campaign</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium block mb-2">Campaign Name</label>
                  <Input
                    placeholder="Q4 Sales Outreach"
                    value={campaignName}
                    onChange={(e) => setCampaignName(e.target.value)}
                    data-testid="input-campaign-name"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium block mb-2">Campaign Type</label>
                  <Select value={campaignType} onValueChange={setCampaignType}>
                    <SelectTrigger data-testid="select-campaign-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="prospect">New Prospect</SelectItem>
                      <SelectItem value="rfp">RFP Response</SelectItem>
                      <SelectItem value="onboarding">Onboarding</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium block mb-2">
                    Number of Recipients
                  </label>
                  <Input
                    type="number"
                    min="1"
                    max="1000"
                    value={recipientCount}
                    onChange={(e) => setRecipientCount(parseInt(e.target.value))}
                    data-testid="input-recipient-count"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    ${(recipientCount * 2) / 100} estimated cost
                  </p>
                </div>

                <Button
                  onClick={() => autonomousMutation.mutate()}
                  disabled={!campaignName || autonomousMutation.isPending}
                  className="w-full"
                  data-testid="button-start-campaign"
                >
                  <Zap className="h-4 w-4 mr-2" />
                  {autonomousMutation.isPending ? "Starting..." : "Start Campaign"}
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Campaigns List - Right Column (spanning 2 cols) */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Campaigns</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {campaignsData?.data && campaignsData.data.length > 0 ? (
                  campaignsData.data.map((campaign) => (
                    <div
                      key={campaign.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                      data-testid={`campaign-row-${campaign.id}`}
                    >
                      <div className="flex-1">
                        <p className="font-medium">{campaign.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {campaign.sentCount || 0} / {campaign.recipientCount} sent
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge
                          variant={
                            campaign.status === "completed" ? "default" : "secondary"
                          }
                        >
                          {campaign.status}
                        </Badge>
                        <Badge variant="outline">{campaign.type}</Badge>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Mail className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No campaigns yet. Create one to get started.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Pipeline Info */}
          <Card>
            <CardHeader>
              <CardTitle>Onboarding Pipeline Stages</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {stagesData?.data?.map((stage, idx) => (
                  <div key={stage.id} className="p-2 border rounded text-sm">
                    <p className="font-medium">
                      {idx + 1}. {stage.name}
                    </p>
                    <p className="text-xs text-muted-foreground">{stage.duration}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </UniversalPage>
  );
}
