import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Target,
  FileText,
  Users,
  TrendingUp,
  Plus,
  Clock,
  DollarSign,
  AlertCircle,
  CheckCircle,
  Sparkles
} from "lucide-react";
import type { Deal, Rfp, Lead } from "@shared/schema";

/**
 * Sales Dashboard - DealOS™ + BidOS™
 * Central hub for sales operations
 */
export default function SalesDashboard() {
  const [selectedView, setSelectedView] = useState("overview");

  // Fetch pipeline deals
  const { data: deals = [] } = useQuery<Deal[]>({
    queryKey: ['/api/sales/deals'],
  });

  // Fetch RFPs
  const { data: rfps = [] } = useQuery<Rfp[]>({
    queryKey: ['/api/sales/rfps'],
  });

  // Fetch leads
  const { data: leads = [] } = useQuery<Lead[]>({
    queryKey: ['/api/sales/leads'],
  });

  // Calculate metrics
  const totalPipelineValue = deals.reduce((sum, deal) => {
    const value = deal.estimatedValue ? parseFloat(deal.estimatedValue.toString()) : 0;
    return sum + value;
  }, 0);

  const activeDeals = deals.filter(d => d.status === 'active').length;
  const activeRfps = rfps.filter(r => r.status === 'active').length;
  const hotLeads = leads.filter(l => (l.leadScore ?? 0) > 70).length;

  // Stage colors
  const getStageColor = (stage: string) => {
    const colors: Record<string, string> = {
      prospect: 'bg-slate-500',
      qualified: 'bg-blue-500',
      rfp_identified: 'bg-purple-500',
      proposal_sent: 'bg-amber-500',
      negotiation: 'bg-orange-500',
      awarded: 'bg-muted/30',
      lost: 'bg-red-500'
    };
    return colors[stage] || 'bg-gray-500';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      {/* Header */}
      <div className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 sm:px-6 py-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Target className="h-6 w-6 text-primary" />
                <h1 className="text-2xl sm:text-3xl font-bold">Sales Command Center</h1>
                <Badge variant="outline" className="text-xs">
                  <Sparkles className="h-3 w-3 mr-1" />
                  DealOS™ + BidOS™
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Pipeline management, RFP tracking, and lead nurturing
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button data-testid="button-add-deal">
                <Plus className="h-4 w-4 mr-2" />
                New Deal
              </Button>
              <Button variant="outline" data-testid="button-add-rfp">
                <FileText className="h-4 w-4 mr-2" />
                Add RFP
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Key Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="hover-elevate">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pipeline Value</CardTitle>
              <DollarSign className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${totalPipelineValue.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">{activeDeals} active deals</p>
            </CardContent>
          </Card>

          <Card className="hover-elevate">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active RFPs</CardTitle>
              <FileText className="h-4 w-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeRfps}</div>
              <p className="text-xs text-muted-foreground">
                {rfps.filter(r => r.status === 'pursuing').length} pursuing
              </p>
            </CardContent>
          </Card>

          <Card className="hover-elevate">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Hot Leads</CardTitle>
              <TrendingUp className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{hotLeads}</div>
              <p className="text-xs text-muted-foreground">Score &gt; 70</p>
            </CardContent>
          </Card>

          <Card className="hover-elevate">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
              <Users className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{leads.length}</div>
              <p className="text-xs text-muted-foreground">
                {leads.filter(l => l.leadStatus === 'qualified').length} qualified
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs for different views */}
        <Tabs value={selectedView} onValueChange={setSelectedView} className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview" data-testid="tab-overview">Pipeline</TabsTrigger>
            <TabsTrigger value="rfps" data-testid="tab-rfps">RFPs</TabsTrigger>
            <TabsTrigger value="leads" data-testid="tab-leads">Leads</TabsTrigger>
          </TabsList>

          {/* Pipeline View */}
          <TabsContent value="overview" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Active Deals</CardTitle>
                <CardDescription>Pipeline by stage</CardDescription>
              </CardHeader>
              <CardContent>
                {deals.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="text-sm">No deals in pipeline yet</p>
                    <Button className="mt-4" size="sm" data-testid="button-create-first-deal">
                      <Plus className="h-4 w-4 mr-2" />
                      Create Your First Deal
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {deals.slice(0, 10).map((deal) => (
                      <div
                        key={deal.id}
                        className="flex items-center justify-between p-3 rounded-lg border hover-elevate cursor-pointer"
                        data-testid={`deal-${deal.id}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold truncate">{deal.dealName}</span>
                            <Badge className={`text-xs ${getStageColor(deal.stage)}`}>
                              {deal.stage?.replace('_', ' ')}
                            </Badge>
                          </div>
                          <div className="text-sm text-muted-foreground">{deal.companyName}</div>
                        </div>
                        <div className="text-right ml-4">
                          <div className="font-bold text-green-600">
                            ${deal.estimatedValue ? parseFloat(deal.estimatedValue.toString()).toLocaleString() : '0'}
                          </div>
                          <div className="text-xs text-muted-foreground">{deal.probability}% prob</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* RFPs View */}
          <TabsContent value="rfps" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Active RFPs</CardTitle>
                <CardDescription>Request for Proposals</CardDescription>
              </CardHeader>
              <CardContent>
                {rfps.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="text-sm">No RFPs tracked yet</p>
                    <Button className="mt-4" size="sm" variant="outline" data-testid="button-add-first-rfp">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Your First RFP
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {rfps.slice(0, 10).map((rfp) => (
                      <div
                        key={rfp.id}
                        className="flex items-start justify-between p-3 rounded-lg border hover-elevate cursor-pointer"
                        data-testid={`rfp-${rfp.id}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold truncate">{rfp.title}</span>
                            {rfp.aiSummary && (
                              <Badge variant="outline" className="text-xs">
                                <Sparkles className="h-3 w-3 mr-1" />
                                AI Analyzed
                              </Badge>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground mb-2">{rfp.buyer}</div>
                          {rfp.dueDate && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              Due: {new Date(rfp.dueDate).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                        <div className="text-right ml-4">
                          {rfp.estimatedValue && (
                            <div className="font-bold text-green-600 mb-1">
                              ${parseFloat(rfp.estimatedValue.toString()).toLocaleString()}
                            </div>
                          )}
                          <Badge variant={rfp.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                            {rfp.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Leads View */}
          <TabsContent value="leads" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Leads</CardTitle>
                <CardDescription>Prospect database</CardDescription>
              </CardHeader>
              <CardContent>
                {leads.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="text-sm">No leads in database yet</p>
                    <Button className="mt-4" size="sm" variant="outline" data-testid="button-add-first-lead">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Your First Lead
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {leads.slice(0, 10).map((lead) => (
                      <div
                        key={lead.id}
                        className="flex items-center justify-between p-3 rounded-lg border hover-elevate cursor-pointer"
                        data-testid={`lead-${lead.id}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold truncate">{lead.companyName}</span>
                            <Badge variant="outline" className="text-xs">
                              Score: {lead.leadScore ?? 0}
                            </Badge>
                          </div>
                          <div className="text-sm text-muted-foreground">{lead.contactEmail}</div>
                        </div>
                        <div className="text-right ml-4">
                          {lead.estimatedValue && (
                            <div className="font-bold text-green-600 mb-1">
                              ${parseFloat(lead.estimatedValue.toString()).toLocaleString()}
                            </div>
                          )}
                          <Badge variant={lead.leadStatus === 'qualified' ? 'default' : 'secondary'} className="text-xs">
                            {lead.leadStatus}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Quick Actions Banner */}
        <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Sparkles className="h-8 w-8 text-primary" />
                <div>
                  <h3 className="font-semibold">Ready to Close More Deals?</h3>
                  <p className="text-sm text-muted-foreground">
                    Add RFPs, track opportunities, and convert leads into revenue
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" data-testid="button-view-pipeline">
                  View Pipeline
                </Button>
                <Button size="sm" data-testid="button-quick-add">
                  <Plus className="h-4 w-4 mr-2" />
                  Quick Add
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
