import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { UniversalModal, UniversalModalHeader, UniversalModalTitle, UniversalModalFooter, UniversalModalContent } from '@/components/ui/universal-modal';
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import {
  Plus,
  Building,
  DollarSign,
  User,
  Phone,
  Mail,
  Clock,
  ChevronRight,
  TrendingUp,
  MapPin,
  FileText,
  ArrowRight,
  X,
  MessageSquare,
  AlertCircle,
} from "lucide-react";
import { format } from "date-fns";

const STAGES = [
  { id: "lead", label: "Lead", color: "bg-slate-500", textColor: "text-slate-700 dark:text-slate-300" },
  { id: "survey", label: "Survey", color: "bg-blue-500", textColor: "text-blue-700 dark:text-blue-300" },
  { id: "rfp", label: "RFP", color: "bg-purple-500", textColor: "text-purple-700 dark:text-purple-300" },
  { id: "proposal", label: "Proposal", color: "bg-amber-500", textColor: "text-amber-700 dark:text-amber-300" },
  { id: "contract", label: "Contract", color: "bg-orange-500", textColor: "text-orange-700 dark:text-orange-300" },
  { id: "won", label: "Won", color: "bg-green-500", textColor: "text-green-700 dark:text-green-300" },
  { id: "lost", label: "Lost", color: "bg-red-500", textColor: "text-red-700 dark:text-red-300" },
] as const;

type StageId = typeof STAGES[number]["id"];

interface PipelineDeal {
  id: string;
  workspaceId: string;
  prospectCompany: string;
  prospectContactName: string | null;
  prospectEmail: string | null;
  prospectPhone: string | null;
  source: string | null;
  stage: string;
  estimatedMonthlyValue: string | null;
  coverageType: string | null;
  estimatedHoursWeekly: string | null;
  numberOfSites: number;
  siteSurveyScheduledAt: string | null;
  siteSurveyCompletedAt: string | null;
  siteSurveyNotes: string | null;
  rfpReceivedAt: string | null;
  rfpDueDate: string | null;
  rfpDocumentUrl: string | null;
  rfpResponseUrl: string | null;
  proposalSentAt: string | null;
  proposalDocumentUrl: string | null;
  proposalAmount: string | null;
  contractSentAt: string | null;
  contractSignedAt: string | null;
  contractDocumentUrl: string | null;
  contractStartDate: string | null;
  contractEndDate: string | null;
  outcomeStatus: string | null;
  outcomeLostReason: string | null;
  outcomeClosedAt: string | null;
  assignedTo: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  activities?: PipelineActivity[];
}

interface PipelineActivity {
  id: string;
  dealId: string;
  activityType: string;
  description: string | null;
  performedBy: string | null;
  metadata: Record<string, any>;
  createdAt: string;
}

interface PipelineStats {
  stageStats: Record<string, { count: number; totalValue: number }>;
  totalDeals: number;
  wonDeals: number;
  lostDeals: number;
  conversionRate: number;
  totalPipelineValue: number;
}

function formatCurrency(val: string | number | null | undefined): string {
  if (!val) return "$0";
  const num = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(num)) return "$0";
  return `$${num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatDate(d: string | null | undefined): string {
  if (!d) return "";
  try {
    return format(new Date(d), "MMM d, yyyy");
  } catch {
    return d;
  }
}

function getStageInfo(stageId: string) {
  return STAGES.find((s) => s.id === stageId) || STAGES[0];
}

function DealCard({
  deal,
  onClick,
  onDragStart,
}: {
  deal: PipelineDeal;
  onClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
}) {
  const stage = getStageInfo(deal.stage);
  return (
    <Card
      className="hover-elevate cursor-pointer mb-2"
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      data-testid={`card-deal-${deal.id}`}
    >
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-sm truncate" data-testid={`text-company-${deal.id}`}>
              {deal.prospectCompany}
            </h4>
            {deal.prospectContactName && (
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {deal.prospectContactName}
              </p>
            )}
          </div>
          {deal.estimatedMonthlyValue && parseFloat(deal.estimatedMonthlyValue) > 0 && (
            <Badge variant="secondary" className="shrink-0 text-xs">
              {formatCurrency(deal.estimatedMonthlyValue)}/mo
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1 mt-2 flex-wrap">
          {deal.coverageType && (
            <Badge variant="outline" className="text-xs">
              {deal.coverageType}
            </Badge>
          )}
          {deal.numberOfSites > 1 && (
            <Badge variant="outline" className="text-xs">
              <MapPin className="w-3 h-3 mr-1" />
              {deal.numberOfSites} sites
            </Badge>
          )}
          {deal.source && (
            <Badge variant="outline" className="text-xs">
              {deal.source}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function StageColumn({
  stage,
  deals,
  stageValue,
  onDealClick,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  stage: (typeof STAGES)[number];
  deals: PipelineDeal[];
  stageValue: number;
  onDealClick: (deal: PipelineDeal) => void;
  onDragStart: (e: React.DragEvent, dealId: string) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, stageId: string) => void;
}) {
  const [isDragOver, setIsDragOver] = useState(false);

  return (
    <div
      className={['flex-shrink-0 w-64 border-r flex flex-col transition-colors', isDragOver ? "bg-accent/30" : ""].join(' ')}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
        onDragOver(e);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        setIsDragOver(false);
        onDrop(e, stage.id);
      }}
      data-testid={`column-${stage.id}`}
    >
      <div className="p-3 border-b flex flex-col gap-1 sticky top-0 bg-background z-10">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${stage.color}`} />
            <span className="font-medium text-sm">{stage.label}</span>
          </div>
          <Badge variant="secondary" className="text-xs">
            {deals.length}
          </Badge>
        </div>
        {stageValue > 0 && (
          <span className="text-xs text-muted-foreground">
            {formatCurrency(stageValue)}/mo
          </span>
        )}
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2">
          {deals.map((deal) => (
            <DealCard
              key={deal.id}
              deal={deal}
              onClick={() => onDealClick(deal)}
              onDragStart={(e) => onDragStart(e, deal.id)}
            />
          ))}
          {deals.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No deals
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function DealDetailPanel({
  deal,
  onClose,
  onStageChange,
}: {
  deal: PipelineDeal;
  onClose: () => void;
  onStageChange: (dealId: string, newStage: string) => void;
}) {
  const { toast } = useToast();
  const [activityNote, setActivityNote] = useState("");
  const stage = getStageInfo(deal.stage);

  const { data: dealDetail, isLoading } = useQuery<PipelineDeal>({
    queryKey: ["/api/pipeline-deals", deal.id],
  });

  const addActivityMutation = useMutation({
    mutationFn: (data: { description: string; activityType: string }) =>
      apiRequest("POST", `/api/pipeline-deals/${deal.id}/activities`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pipeline-deals", deal.id] });
      setActivityNote("");
      toast({ title: "Activity added" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add activity", description: error.message, variant: "destructive" });
    },
  });

  const handleAddNote = () => {
    if (!activityNote.trim()) return;
    addActivityMutation.mutate({ description: activityNote, activityType: "note" });
  };

  const currentStageIndex = STAGES.findIndex((s) => s.id === deal.stage);
  const nextStage = currentStageIndex < STAGES.length - 2 ? STAGES[currentStageIndex + 1] : null;

  const detail = dealDetail || deal;
  const activities = detail.activities || [];

  if (isLoading) {
    return (
      <div className="fixed inset-y-0 right-0 w-full max-w-md bg-background border-l shadow-lg z-[2001] flex flex-col" data-testid="panel-deal-detail-loading">
        <div className="flex items-center justify-between gap-2 p-4 border-b">
          <div className="h-6 w-40 bg-muted animate-pulse rounded-md" />
          <Button size="icon" variant="ghost" onClick={onClose} data-testid="button-close-detail-loading"><X /></Button>
        </div>
        <div className="p-4 space-y-3">
          <div className="h-4 w-32 bg-muted animate-pulse rounded-md" />
          <div className="h-20 w-full bg-muted animate-pulse rounded-md" />
          <div className="h-4 w-48 bg-muted animate-pulse rounded-md" />
          <div className="h-32 w-full bg-muted animate-pulse rounded-md" />
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-y-0 right-0 w-full max-w-md bg-background border-l shadow-lg z-[2001] flex flex-col"
      data-testid="panel-deal-detail"
    >
      <div className="flex items-center justify-between gap-2 p-4 border-b">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-3 h-3 rounded-full ${stage.color}`} />
          <h2 className="font-semibold truncate" data-testid="text-deal-company">
            {detail.prospectCompany}
          </h2>
        </div>
        <Button size="icon" variant="ghost" onClick={onClose} data-testid="button-close-detail">
          <X />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={`${stage.color} text-white`}>{stage.label}</Badge>
            {detail.estimatedMonthlyValue && (
              <Badge variant="secondary">
                <DollarSign className="w-3 h-3 mr-1" />
                {formatCurrency(detail.estimatedMonthlyValue)}/mo
              </Badge>
            )}
          </div>

          {nextStage && deal.stage !== "won" && deal.stage !== "lost" && (
            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={() => onStageChange(deal.id, nextStage.id)}
                data-testid="button-advance-stage"
              >
                <ArrowRight className="w-4 h-4 mr-2" />
                Move to {nextStage.label}
              </Button>
              {deal.stage !== "lost" && (
                <Button
                  variant="outline"
                  onClick={() => onStageChange(deal.id, "lost")}
                  data-testid="button-mark-lost"
                >
                  Mark Lost
                </Button>
              )}
            </div>
          )}

          <Separator />

          <div>
            <h3 className="text-sm font-medium mb-3">Contact Information</h3>
            <div className="space-y-2 text-sm">
              {detail.prospectContactName && (
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <span>{detail.prospectContactName}</span>
                </div>
              )}
              {detail.prospectEmail && (
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  <a href={`mailto:${detail.prospectEmail}`} className="hover:underline">
                    {detail.prospectEmail}
                  </a>
                </div>
              )}
              {detail.prospectPhone && (
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  <span>{detail.prospectPhone}</span>
                </div>
              )}
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="text-sm font-medium mb-3">Deal Details</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {detail.coverageType && (
                <div>
                  <span className="text-muted-foreground">Coverage</span>
                  <p className="font-medium">{detail.coverageType}</p>
                </div>
              )}
              {detail.estimatedHoursWeekly && (
                <div>
                  <span className="text-muted-foreground">Hours/Week</span>
                  <p className="font-medium">{detail.estimatedHoursWeekly}</p>
                </div>
              )}
              <div>
                <span className="text-muted-foreground">Sites</span>
                <p className="font-medium">{detail.numberOfSites}</p>
              </div>
              {detail.source && (
                <div>
                  <span className="text-muted-foreground">Source</span>
                  <p className="font-medium">{detail.source}</p>
                </div>
              )}
              {detail.proposalAmount && (
                <div>
                  <span className="text-muted-foreground">Proposal Amt</span>
                  <p className="font-medium">{formatCurrency(detail.proposalAmount)}</p>
                </div>
              )}
              {detail.rfpDueDate && (
                <div>
                  <span className="text-muted-foreground">RFP Due</span>
                  <p className="font-medium">{formatDate(detail.rfpDueDate)}</p>
                </div>
              )}
              {detail.contractStartDate && (
                <div>
                  <span className="text-muted-foreground">Contract Start</span>
                  <p className="font-medium">{formatDate(detail.contractStartDate)}</p>
                </div>
              )}
              {detail.contractEndDate && (
                <div>
                  <span className="text-muted-foreground">Contract End</span>
                  <p className="font-medium">{formatDate(detail.contractEndDate)}</p>
                </div>
              )}
            </div>
          </div>

          {detail.notes && (
            <>
              <Separator />
              <div>
                <h3 className="text-sm font-medium mb-2">Notes</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{detail.notes}</p>
              </div>
            </>
          )}

          <Separator />

          <div>
            <h3 className="text-sm font-medium mb-3">Stage Transitions</h3>
            <div className="flex gap-1 flex-wrap">
              {STAGES.map((s) => (
                <Button
                  key={s.id}
                  variant={s.id === deal.stage ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    if (s.id !== deal.stage) onStageChange(deal.id, s.id);
                  }}
                  data-testid={`button-stage-${s.id}`}
                  disabled={s.id === deal.stage}
                >
                  {s.label}
                </Button>
              ))}
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="text-sm font-medium mb-3">Activity Timeline</h3>
            <div className="space-y-2 mb-4">
              <Textarea
                value={activityNote}
                onChange={(e) => setActivityNote(e.target.value)}
                placeholder="Add a note..."
                className="resize-none text-sm"
                data-testid="input-activity-note"
              />
              <Button
                size="sm"
                onClick={handleAddNote}
                disabled={!activityNote.trim() || addActivityMutation.isPending}
                data-testid="button-add-note"
              >
                <MessageSquare className="w-4 h-4 mr-1" />
                {addActivityMutation.isPending ? "Adding..." : "Add Note"}
              </Button>
            </div>

            {activities.length > 0 ? (
              <div className="space-y-3">
                {activities.map((activity) => (
                  <div key={activity.id} className="flex gap-3 text-sm" data-testid={`activity-${activity.id}`}>
                    <div className="w-2 h-2 rounded-full bg-muted-foreground mt-1.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-foreground">{activity.description}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDate(activity.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No activity yet</p>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

const pageConfig: CanvasPageConfig = {
  id: "rfp-pipeline",
  title: "RFP Pipeline",
  subtitle: "Manage deals from lead to contract",
  category: "operations",
};

export default function RFPPipeline() {
  const { toast } = useToast();
  const [showNewDeal, setShowNewDeal] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<PipelineDeal | null>(null);

  const { data: dealsResponse, isLoading: dealsLoading, isError: dealsError, refetch: refetchDeals } = useQuery<{ items: PipelineDeal[]; total: number } | PipelineDeal[]>({
    queryKey: ["/api/pipeline-deals"],
  });
  const deals: PipelineDeal[] = Array.isArray(dealsResponse) ? dealsResponse : (dealsResponse?.items || []);

  const { data: stats } = useQuery<PipelineStats>({
    queryKey: ["/api/pipeline-deals/stats"],
  });

  const createDealMutation = useMutation({
    mutationFn: (data) => apiRequest("POST", "/api/pipeline-deals", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pipeline-deals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pipeline-deals/stats"] });
      setShowNewDeal(false);
      toast({ title: "Deal created" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create deal", description: error.message, variant: "destructive" });
    },
  });

  const updateDealMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest("PATCH", `/api/pipeline-deals/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pipeline-deals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pipeline-deals/stats"] });
      if (selectedDeal) {
        queryClient.invalidateQueries({ queryKey: ["/api/pipeline-deals", selectedDeal.id] });
      }
      toast({ title: "Deal updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update deal", description: error.message, variant: "destructive" });
    },
  });

  const dealsByStage = STAGES.reduce((acc, stage) => {
    acc[stage.id] = (deals || []).filter((d) => d.stage === stage.id);
    return acc;
  }, {} as Record<string, PipelineDeal[]>);

  const handleDragStart = useCallback((e: React.DragEvent, dealId: string) => {
    e.dataTransfer.setData("dealId", dealId);
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, newStage: string) => {
      e.preventDefault();
      const dealId = e.dataTransfer.getData("dealId");
      if (dealId) {
        const deal = deals?.find((d) => d.id === dealId);
        if (deal && deal.stage !== newStage) {
          updateDealMutation.mutate({ id: dealId, stage: newStage });
        }
      }
    },
    [deals, updateDealMutation]
  );

  const handleStageChange = useCallback(
    (dealId: string, newStage: string) => {
      updateDealMutation.mutate({ id: dealId, stage: newStage });
      if (selectedDeal?.id === dealId) {
        setSelectedDeal((prev) => (prev ? { ...prev, stage: newStage } : null));
      }
    },
    [updateDealMutation, selectedDeal]
  );

  const handleSubmitDeal = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createDealMutation.mutate({
      prospectCompany: fd.get("prospectCompany"),
      prospectContactName: fd.get("prospectContactName") || null,
      prospectEmail: fd.get("prospectEmail") || null,
      prospectPhone: fd.get("prospectPhone") || null,
      source: fd.get("source") || null,
      coverageType: fd.get("coverageType") || null,
      estimatedMonthlyValue: fd.get("estimatedMonthlyValue") || null,
      estimatedHoursWeekly: fd.get("estimatedHoursWeekly") || null,
      numberOfSites: Number(fd.get("numberOfSites")) || 1,
      notes: fd.get("notes") || null,
    });
  };

  const headerActions = (
    <Button onClick={() => setShowNewDeal(true)} data-testid="button-new-deal">
      <Plus className="w-4 h-4 mr-2" />
      New Deal
    </Button>
  );

  return (
    <CanvasHubPage config={{ ...pageConfig, headerActions }}>
      <UniversalModal open={showNewDeal} onOpenChange={setShowNewDeal}>
        <UniversalModalContent>
          <UniversalModalHeader>
            <UniversalModalTitle>New Deal</UniversalModalTitle>
          </UniversalModalHeader>
          <form onSubmit={handleSubmitDeal} className="space-y-4">
            <div>
              <Label htmlFor="prospectCompany">Company Name *</Label>
              <Input id="prospectCompany" name="prospectCompany" required data-testid="input-prospect-company" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="prospectContactName">Contact Name</Label>
                <Input id="prospectContactName" name="prospectContactName" data-testid="input-prospect-contact" />
              </div>
              <div>
                <Label htmlFor="prospectEmail">Email</Label>
                <Input id="prospectEmail" name="prospectEmail" type="email" data-testid="input-prospect-email" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="prospectPhone">Phone</Label>
                <Input id="prospectPhone" name="prospectPhone" type="tel" data-testid="input-prospect-phone" />
              </div>
              <div>
                <Label htmlFor="source">Source</Label>
                <Select name="source">
                  <SelectTrigger data-testid="select-source">
                    <SelectValue placeholder="Select source" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="referral">Referral</SelectItem>
                    <SelectItem value="website">Website</SelectItem>
                    <SelectItem value="cold_call">Cold Call</SelectItem>
                    <SelectItem value="trade_show">Trade Show</SelectItem>
                    <SelectItem value="rfp_listing">RFP Listing</SelectItem>
                    <SelectItem value="existing_client">Existing Client</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="estimatedMonthlyValue">Est. Monthly Value ($)</Label>
                <Input id="estimatedMonthlyValue" name="estimatedMonthlyValue" type="number" step="0.01" data-testid="input-monthly-value" />
              </div>
              <div>
                <Label htmlFor="coverageType">Coverage Type</Label>
                <Select name="coverageType">
                  <SelectTrigger data-testid="select-coverage-type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="armed">Armed</SelectItem>
                    <SelectItem value="unarmed">Unarmed</SelectItem>
                    <SelectItem value="patrol">Patrol</SelectItem>
                    <SelectItem value="concierge">Concierge</SelectItem>
                    <SelectItem value="event">Event</SelectItem>
                    <SelectItem value="mixed">Mixed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="estimatedHoursWeekly">Est. Hours/Week</Label>
                <Input id="estimatedHoursWeekly" name="estimatedHoursWeekly" type="number" step="0.5" data-testid="input-hours-weekly" />
              </div>
              <div>
                <Label htmlFor="numberOfSites">Number of Sites</Label>
                <Input id="numberOfSites" name="numberOfSites" type="number" min="1" defaultValue="1" data-testid="input-num-sites" />
              </div>
            </div>
            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" name="notes" className="resize-none" data-testid="input-deal-notes" />
            </div>
            <UniversalModalFooter>
              <Button type="submit" disabled={createDealMutation.isPending} data-testid="button-submit-deal">
                {createDealMutation.isPending ? "Creating..." : "Create Deal"}
              </Button>
            </UniversalModalFooter>
          </form>
        </UniversalModalContent>
      </UniversalModal>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-500" />
              <div>
                <p className="text-2xl font-bold" data-testid="text-total-deals">{stats?.totalDeals ?? 0}</p>
                <p className="text-sm text-muted-foreground">Total Deals</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-green-500" />
              <div>
                <p className="text-2xl font-bold" data-testid="text-pipeline-value">
                  {formatCurrency(stats?.totalPipelineValue)}
                </p>
                <p className="text-sm text-muted-foreground">Pipeline Value/mo</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Building className="w-5 h-5 text-emerald-500" />
              <div>
                <p className="text-2xl font-bold" data-testid="text-won-deals">{stats?.wonDeals ?? 0}</p>
                <p className="text-sm text-muted-foreground">Won Deals</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <ChevronRight className="w-5 h-5 text-amber-500" />
              <div>
                <p className="text-2xl font-bold" data-testid="text-conversion-rate">{stats?.conversionRate ?? 0}%</p>
                <p className="text-sm text-muted-foreground">Conversion Rate</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex-1 overflow-hidden">
        {dealsError ? (
          <div className="flex items-center justify-center h-64" data-testid="pipeline-error">
            <div className="text-center space-y-3">
              <AlertCircle className="w-10 h-10 text-destructive mx-auto" />
              <p className="text-muted-foreground">Failed to load pipeline data.</p>
              <Button variant="outline" size="sm" onClick={() => refetchDeals()} data-testid="button-retry-pipeline">Retry</Button>
            </div>
          </div>
        ) : dealsLoading ? (
          <div className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">Loading pipeline...</p>
          </div>
        ) : (
          <div className="flex h-full overflow-x-auto">
            {STAGES.map((stage) => (
              <StageColumn
                key={stage.id}
                stage={stage}
                deals={dealsByStage[stage.id] || []}
                stageValue={stats?.stageStats?.[stage.id]?.totalValue ?? 0}
                onDealClick={setSelectedDeal}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              />
            ))}
          </div>
        )}
      </div>

      {selectedDeal && (
        <DealDetailPanel
          deal={selectedDeal}
          onClose={() => setSelectedDeal(null)}
          onStageChange={handleStageChange}
        />
      )}
    </CanvasHubPage>
  );
}
