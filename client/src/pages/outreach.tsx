import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  Globe, Search, Send, Users, TrendingUp, Mail, Building2,
  MapPin, Phone, ExternalLink, AlertCircle, CheckCircle,
  Clock, ArrowRight, Sparkles, Brain, Target, Zap
} from "lucide-react";

const pageConfig: CanvasPageConfig = {
  title: "Trinity Outreach",
  subtitle: "AI-powered prospect discovery and automated outreach",
  icon: Globe,
  badge: "AI Sales",
  badgeVariant: "default" as const,
};

interface PipelineSummary {
  total: number;
  prospected: number;
  contacted: number;
  responded: number;
  demo: number;
  subscribed: number;
  conversionRate: number;
}

interface CrawlResult {
  companyName: string;
  website: string;
  emails: string[];
  contactName?: string;
  phone?: string;
  location?: string;
  services?: string[];
  robotsAllowed: boolean;
}

interface Prospect {
  companyName: string;
  email: string;
  contactName?: string;
  website: string;
  location?: string;
  services?: string[];
  stage: string;
}

export default function OutreachPage() {
  const { toast } = useToast();
  const [urls, setUrls] = useState("");
  const [customMessage, setCustomMessage] = useState("");
  const [crawlResults, setCrawlResults] = useState<CrawlResult[]>([]);
  const [selectedProspects, setSelectedProspects] = useState<Set<number>>(new Set());
  const [activeTab, setActiveTab] = useState("discover");

  const pipelineQuery = useQuery<PipelineSummary>({
    queryKey: ["/api/sales/outreach/pipeline"],
  });

  const prospectsQuery = useQuery<Prospect[]>({
    queryKey: ["/api/sales/outreach/pipeline/all"],
    enabled: activeTab === "pipeline",
  });

  const crawlMutation = useMutation({
    mutationFn: async (websiteUrls: string[]) => {
      const res = await apiRequest("POST", "/api/sales/outreach/crawl", { urls: websiteUrls });
      return res.json();
    },
    onSuccess: (data) => {
      setCrawlResults(data.results || []);
      setSelectedProspects(new Set());
      toast({ title: "Scan complete", description: `Found ${data.results?.length || 0} companies, ${data.emailsFound || 0} contacts` });
    },
    onError: () => {
      toast({ title: "Scan failed", description: "Could not crawl the provided websites", variant: "destructive" });
    },
  });

  const sendMutation = useMutation({
    mutationFn: async (candidates: { companyName: string; email: string; contactName?: string; website: string; services?: string[] }[]) => {
      const res = await apiRequest("POST", "/api/sales/outreach/send", { candidates, customMessage: customMessage || undefined });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Outreach sent", description: `${data.emailsSent || 0} invitations delivered` });
      setCrawlResults([]);
      setSelectedProspects(new Set());
      setCustomMessage("");
      queryClient.invalidateQueries({ queryKey: ["/api/sales/outreach/pipeline"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sales/outreach/pipeline/all"] });
    },
    onError: () => {
      toast({ title: "Send failed", variant: "destructive" });
    },
  });

  const handleCrawl = () => {
    const urlList = urls.split("\n").map(u => u.trim()).filter(u => u.length > 0);
    if (urlList.length === 0) {
      toast({ title: "Enter at least one website URL", variant: "destructive" });
      return;
    }
    if (urlList.length > 20) {
      toast({ title: "Maximum 20 URLs per scan", variant: "destructive" });
      return;
    }
    crawlMutation.mutate(urlList);
  };

  const handleSendOutreach = () => {
    const selected = crawlResults
      .filter((_, i) => selectedProspects.has(i))
      .filter(r => r.emails.length > 0 && r.robotsAllowed)
      .map(r => ({
        companyName: r.companyName,
        email: r.emails[0],
        contactName: r.contactName,
        website: r.website,
        services: r.services,
      }));

    if (selected.length === 0) {
      toast({ title: "Select at least one prospect with a valid email", variant: "destructive" });
      return;
    }
    sendMutation.mutate(selected);
  };

  const toggleProspect = (index: number) => {
    setSelectedProspects(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const selectAll = () => {
    const validIndexes = crawlResults
      .map((r, i) => (r.emails.length > 0 && r.robotsAllowed ? i : -1))
      .filter(i => i >= 0);
    setSelectedProspects(new Set(validIndexes));
  };

  const pipeline = pipelineQuery.data;
  const pipelineStages = [
    { key: "prospected", label: "Prospected", color: "hsl(var(--muted-foreground))" },
    { key: "contacted", label: "Contacted", color: "hsl(var(--chart-1))" },
    { key: "responded", label: "Responded", color: "hsl(var(--chart-2))" },
    { key: "demo", label: "Demo", color: "hsl(var(--chart-3))" },
    { key: "subscribed", label: "Subscribed", color: "hsl(var(--chart-4))" },
  ];

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="space-y-4 p-4 max-w-6xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {pipelineQuery.isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Card key={i}><CardContent className="p-3"><Skeleton className="h-10 w-full" /></CardContent></Card>
            ))
          ) : (
            pipelineStages.map(stage => (
              <Card key={stage.key}>
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">{stage.label}</p>
                  <p className="text-2xl font-bold" data-testid={`text-pipeline-${stage.key}`}>
                    {pipeline ? (pipeline as any)[stage.key] : 0}
                  </p>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {pipeline && pipeline.total > 0 && (
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Conversion Rate</span>
                </div>
                <div className="flex items-center gap-2">
                  <Progress value={pipeline.conversionRate} className="w-32 h-2" />
                  <span className="text-sm font-medium" data-testid="text-conversion-rate">{pipeline.conversionRate}%</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full sm:w-auto overflow-x-auto">
            <TabsTrigger value="discover" data-testid="tab-discover">
              <Search className="h-3.5 w-3.5 mr-1.5" />
              Discover
            </TabsTrigger>
            <TabsTrigger value="pipeline" data-testid="tab-pipeline">
              <TrendingUp className="h-3.5 w-3.5 mr-1.5" />
              Pipeline
            </TabsTrigger>
          </TabsList>

          <TabsContent value="discover" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Brain className="h-4 w-4" />
                  Website Scanner
                </CardTitle>
                <CardDescription>
                  Enter security company websites to discover contacts. Trinity will crawl them (respecting robots.txt) and extract business information.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  placeholder={"Enter website URLs (one per line):\nwww.example-security.com\nwww.another-guard.com"}
                  value={urls}
                  onChange={e => setUrls(e.target.value)}
                  className="min-h-[100px] text-sm"
                  data-testid="input-urls"
                />
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-xs text-muted-foreground">
                    {urls.split("\n").filter(u => u.trim()).length} URLs entered (max 20)
                  </p>
                  <Button
                    onClick={handleCrawl}
                    disabled={crawlMutation.isPending}
                    data-testid="button-scan"
                  >
                    {crawlMutation.isPending ? (
                      <><Clock className="h-4 w-4 mr-1.5 animate-spin" /> Scanning...</>
                    ) : (
                      <><Search className="h-4 w-4 mr-1.5" /> Scan Websites</>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {crawlResults.length > 0 && (
              <>
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <CardTitle className="text-base">
                        Discovered Prospects ({crawlResults.length})
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={selectAll} data-testid="button-select-all">
                          Select All Valid
                        </Button>
                        <Badge variant="secondary">
                          {selectedProspects.size} selected
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {crawlResults.map((result, index) => {
                      const hasEmail = result.emails.length > 0;
                      const isBlocked = !result.robotsAllowed;
                      const isSelected = selectedProspects.has(index);

                      return (
                        <div
                          key={index}
                          className={['flex items-start gap-3 p-3 rounded-md border cursor-pointer transition-colors', isSelected ? "border-primary bg-primary/5" : "hover-elevate", isBlocked ? "opacity-50" : ""].join(' ')}
                          onClick={() => !isBlocked && hasEmail && toggleProspect(index)}
                          data-testid={`card-prospect-${index}`}
                        >
                          <div className={['mt-1 w-4 h-4 rounded border flex items-center justify-center flex-shrink-0', isSelected ? "bg-primary border-primary" : "border-muted-foreground/30"].join(' ')}>
                            {isSelected && <CheckCircle className="h-3 w-3 text-primary-foreground" />}
                          </div>

                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              <span className="font-medium text-sm truncate">{result.companyName}</span>
                              {isBlocked && <Badge variant="destructive">Blocked by robots.txt</Badge>}
                              {!hasEmail && !isBlocked && <Badge variant="secondary">No email found</Badge>}
                            </div>

                            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                              {result.emails[0] && (
                                <span className="flex items-center gap-1">
                                  <Mail className="h-3 w-3" /> {result.emails[0]}
                                </span>
                              )}
                              {result.location && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3" /> {result.location}
                                </span>
                              )}
                              {result.phone && (
                                <span className="flex items-center gap-1">
                                  <Phone className="h-3 w-3" /> {result.phone}
                                </span>
                              )}
                              <a
                                href={result.website.startsWith("http") ? result.website : `https://${result.website}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 hover:underline"
                                onClick={e => e.stopPropagation()}
                              >
                                <ExternalLink className="h-3 w-3" /> Website
                              </a>
                            </div>

                            {result.services && result.services.length > 0 && (
                              <div className="flex gap-1 flex-wrap">
                                {result.services.slice(0, 5).map(s => (
                                  <Badge key={s} variant="outline" className="text-[10px] py-0">
                                    {s}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Send className="h-4 w-4" />
                      Send Outreach
                    </CardTitle>
                    <CardDescription>
                      Customize the invitation message (optional). Selected prospects will receive a branded email with a free trial link.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Textarea
                      placeholder="Add a custom paragraph to the outreach email (optional)..."
                      value={customMessage}
                      onChange={e => setCustomMessage(e.target.value)}
                      className="min-h-[60px] text-sm"
                      data-testid="input-custom-message"
                    />
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="text-xs text-muted-foreground">
                        {selectedProspects.size} prospects will receive invitations
                      </p>
                      <Button
                        onClick={handleSendOutreach}
                        disabled={sendMutation.isPending || selectedProspects.size === 0}
                        data-testid="button-send-outreach"
                      >
                        {sendMutation.isPending ? (
                          <><Clock className="h-4 w-4 mr-1.5 animate-spin" /> Sending...</>
                        ) : (
                          <><Send className="h-4 w-4 mr-1.5" /> Send Invitations</>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          <TabsContent value="pipeline" className="space-y-4 mt-4">
            {prospectsQuery.isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : !prospectsQuery.data || prospectsQuery.data.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <Globe className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">No prospects in pipeline yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Use the Discover tab to scan websites and send outreach</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {prospectsQuery.data.map((prospect, index) => (
                  <Card key={index}>
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 min-w-0">
                          <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span className="font-medium text-sm truncate">{prospect.companyName}</span>
                          <Badge variant={
                            prospect.stage === "subscribed" ? "default" :
                            prospect.stage === "demo" ? "secondary" :
                            prospect.stage === "responded" ? "secondary" :
                            "outline"
                          }>
                            {prospect.stage}
                          </Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">{prospect.email}</span>
                      </div>
                      {prospect.contactName && (
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <Users className="h-3 w-3" /> {prospect.contactName}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </CanvasHubPage>
  );
}
