import { useState, Suspense, lazy } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UniversalModal, UniversalModalDescription, UniversalModalHeader, UniversalModalTitle, UniversalModalTrigger, UniversalModalContent, UniversalModalFooter } from '@/components/ui/universal-modal';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createDisputeSchema, type CreateDispute, type Dispute } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { AlertCircle, CheckCircle, Clock, FileText, Scale, User, Calendar, Eye, ChevronRight, Loader2 } from "lucide-react";
import { isManagerOrAbove } from "@/lib/roleHierarchy";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { disputeStatusConfig, disputePriorityConfig, disputeTypesConfig, disputeMessages } from "@/config/disputeConfig";
import { DsPageHeader, DsStatCard, DsTabBar, DsEmptyState, DsDataRow, DsSectionCard, DsBadge, DsPageWrapper } from "@/components/ui/ds-components";

const TrinityRedesign = lazy(() => import("@/components/trinity-redesign"));

export default function DisputesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedDispute, setSelectedDispute] = useState<Dispute | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // Fetch all employees to determine current user's role
  const { data: allEmployees, isLoading: loadingEmployees, isError: employeesError } = useQuery<{ data: any[] }, Error, any[]>({
    queryKey: ['/api/employees'],
    select: (res) => res?.data ?? [],
    enabled: !!user,
  });
  
  const currentEmployee = allEmployees?.find((emp: any) => emp.userId === user?.id);
  const isHROrManager = currentEmployee && isManagerOrAbove(currentEmployee?.workspaceRole);

  const { data: myDisputes, isLoading: loadingMyDisputes } = useQuery<Dispute[]>({
    queryKey: ['/api/disputes/my-disputes'],
    enabled: !!user && !loadingEmployees && !isHROrManager,
  });

  const { data: allDisputes, isLoading: loadingAllDisputes } = useQuery<Dispute[]>({
    queryKey: ['/api/disputes'],
    enabled: !!user && !loadingEmployees && !!isHROrManager,
  });

  const disputes = isHROrManager ? allDisputes : myDisputes;
  const isLoading = loadingEmployees || (isHROrManager ? loadingAllDisputes : loadingMyDisputes);

  const filteredDisputes = disputes?.filter(d => {
    if (filterStatus === "all") return true;
    return d.status === filterStatus;
  }) || [];

  const form = useForm<CreateDispute>({
    resolver: zodResolver(createDisputeSchema),
    defaultValues: {
      disputeType: "performance_review",
      targetType: "performance_reviews",
      targetId: "",
      title: "",
      reason: "",
      evidence: [],
      requestedOutcome: "",
      priority: "normal",
      status: "pending",
    },
  });

  // Watch disputeType to auto-update targetType
  const handleDisputeTypeChange = (value: string) => {
    form.setValue("disputeType", value as any);
    const targetTypeMap: Record<string, string> = {
      "performance_review": "performance_reviews",
      "employer_rating": "employer_ratings",
      "report_submission": "report_submissions",
      "composite_score": "composite_scores",
    };
    form.setValue("targetType", targetTypeMap[value] as any);
  };

  const createMutation = useMutation({
    mutationFn: async (data: CreateDispute) => {
      return await apiRequest('POST', '/api/disputes', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/disputes'] });
      queryClient.invalidateQueries({ queryKey: ['/api/disputes/my-disputes'] });
      toast({
        title: "Dispute submitted",
        description: "Your dispute has been submitted for review.",
      });
      setCreateDialogOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to submit dispute",
      });
    },
  });

  const onSubmit = (data: CreateDispute) => {
    createMutation.mutate(data);
  };

  const getDsBadgeColor = (status: string | null): any => {
    switch (status) {
      case 'pending': return 'warning';
      case 'under_review': return 'info';
      case 'resolved': return 'success';
      case 'rejected': return 'danger';
      case 'appealed': return 'purple';
      default: return 'muted';
    }
  };

  if (isLoading) {
    return (
      <DsPageWrapper className="flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Suspense fallback={<div className="w-16 h-16" />}>
            <TrinityRedesign size={64} mode="THINKING" />
          </Suspense>
          <p className="text-ds-text-secondary">Loading disputes...</p>
        </div>
      </DsPageWrapper>
    );
  }

  const tabs = [
    { id: "all", label: "All" },
    { id: "pending", label: "Pending" },
    { id: "under_review", label: "Under Review" },
    { id: "resolved", label: "Resolved" },
  ];

  return (
    <DsPageWrapper>
      <DsPageHeader 
        title={disputeMessages.title}
        subtitle={disputeMessages.subtitle}
        actions={
          <UniversalModal open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <UniversalModalTrigger asChild>
              <Button className="bg-ds-gold text-black font-bold" data-testid="button-create-dispute">
                <Scale className="w-4 h-4 mr-2" />
                {disputeMessages.fileButton}
              </Button>
            </UniversalModalTrigger>
            <UniversalModalContent size="xl">
              <UniversalModalHeader>
                <UniversalModalTitle>{disputeMessages.fileDialogTitle}</UniversalModalTitle>
                <UniversalModalDescription>
                  {disputeMessages.fileDialogDescription}
                </UniversalModalDescription>
              </UniversalModalHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 p-4">
                  <FormField
                    control={form.control}
                    name="disputeType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Dispute Type</FormLabel>
                        <Select onValueChange={handleDisputeTypeChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-dispute-type">
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {Object.entries(disputeTypesConfig).map(([key, config]) => (
                              <SelectItem key={key} value={key} data-testid={`option-dispute-${key}`}>
                                {config.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="targetId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Target ID</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter target ID" {...field} data-testid="input-target-id" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Title</FormLabel>
                        <FormControl>
                          <Input placeholder="Brief summary" {...field} data-testid="input-title" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="reason"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Detailed Reason</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Explain why..." {...field} rows={4} data-testid="input-reason" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex justify-end space-x-2 pt-4">
                    <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createMutation.isPending} className="bg-ds-gold text-black">
                      {createMutation.isPending ? "Submitting..." : "Submit Dispute"}
                    </Button>
                  </div>
                </form>
              </Form>
            </UniversalModalContent>
          </UniversalModal>
        }
      />

      <DsTabBar tabs={tabs} activeTab={filterStatus} onTabChange={setFilterStatus} className="mb-6" />

      {filteredDisputes.length === 0 ? (
        <DsEmptyState 
          icon={Scale}
          title="No disputes found"
          subtitle={filterStatus !== "all" ? `No disputes with status "${filterStatus}"` : "You haven't filed any disputes yet."}
          action={
            filterStatus !== "all" && (
              <Button variant="outline" onClick={() => setFilterStatus("all")}>
                Clear Filters
              </Button>
            )
          }
        />
      ) : (
        <DsSectionCard noPadding>
          <div className="divide-y divide-ds-border">
            {filteredDisputes.map((dispute) => (
              <DsDataRow 
                key={dispute.id} 
                interactive 
                onClick={() => setSelectedDispute(dispute)}
                className="flex-col items-start gap-2"
              >
                <div className="flex items-center justify-between w-full">
                  <span className="font-bold text-ds-text-primary" style={{ fontFamily: 'var(--ds-font-display)' }}>
                    {dispute.title}
                  </span>
                  <div className="flex gap-2">
                    <DsBadge color={dispute.priority === 'high' || dispute.priority === 'urgent' ? 'danger' : 'muted'}>
                      {dispute.priority}
                    </DsBadge>
                    <DsBadge color={getDsBadgeColor(dispute.status)}>
                      {dispute.status?.replace('_', ' ')}
                    </DsBadge>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-ds-text-muted">
                  <span className="flex items-center gap-1"><Calendar size={12} /> Filed {new Date(dispute.filedAt).toLocaleDateString()}</span>
                  <span className="flex items-center gap-1"><FileText size={12} /> {dispute.disputeType.replace('_', ' ')}</span>
                </div>
              </DsDataRow>
            ))}
          </div>
        </DsSectionCard>
      )}

      {selectedDispute && (
        <DisputeDetailDialog 
          dispute={selectedDispute} 
          isOpen={!!selectedDispute} 
          onClose={() => setSelectedDispute(null)}
          isHROrManager={!!isHROrManager}
          user={user}
        />
      )}
    </DsPageWrapper>
  );
}

function DisputeDetailDialog({ 
  dispute, 
  isOpen, 
  onClose,
  isHROrManager,
  user
}: { 
  dispute: Dispute; 
  isOpen: boolean; 
  onClose: () => void;
  isHROrManager: boolean;
  user: any;
}) {
  const { toast } = useToast();
  const [resolveFormOpen, setResolveFormOpen] = useState(false);
  const [resolutionText, setResolutionText] = useState('');
  const [resolutionAction, setResolutionAction] = useState<'approved' | 'denied' | 'partial' | 'escalated'>('approved');
  
  const assignMutation = useMutation({
    mutationFn: async (userId: string) => {
      return await apiRequest('PATCH', `/api/disputes/${dispute.id}/assign`, { assignedTo: userId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/disputes'] });
      queryClient.invalidateQueries({ queryKey: ['/api/disputes/my-disputes'] });
      toast({ title: "Dispute assigned" });
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: 'Assign Dispute Failed',
        description: error.message || 'Something went wrong.',
        variant: 'destructive',
      });
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async (data: { resolution: string; resolutionAction: string }) => {
      return await apiRequest('POST', `/api/disputes/${dispute.id}/resolve`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/disputes'] });
      queryClient.invalidateQueries({ queryKey: ['/api/disputes/my-disputes'] });
      toast({ title: "Dispute resolved" });
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: 'Resolve Dispute Failed',
        description: error.message || 'Something went wrong.',
        variant: 'destructive',
      });
    },
  });

  return (
    <UniversalModal open={isOpen} onOpenChange={onClose}>
      <UniversalModalContent size="full" className="w-full h-full sm:h-auto sm:w-auto p-0 sm:p-6">
        <div className="h-full overflow-y-auto p-4 sm:p-0">
        <UniversalModalHeader>
          <UniversalModalTitle>Dispute Details</UniversalModalTitle>
        </UniversalModalHeader>
        <ScrollArea className="max-h-[calc(90vh-120px)] pr-4">
          <div className="space-y-6">
            <div>
              <h3 className="font-semibold mb-2">{dispute.title}</h3>
              <div className="flex items-center space-x-2 mb-4">
                <Badge className={getPriorityColor(dispute.priority)}>
                  {dispute.priority || 'normal'}
                </Badge>
                <Badge className={getStatusColor(dispute.status)}>
                  {(dispute.status || 'pending').replace('_', ' ')}
                </Badge>
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Filed By</p>
                <p className="font-medium">{dispute.filedByRole}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Filed Date</p>
                <p className="font-medium">{new Date(dispute.filedAt).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Dispute Type</p>
                <p className="font-medium">{dispute.disputeType.replace('_', ' ')}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Target ID</p>
                <p className="font-medium">{dispute.targetId}</p>
              </div>
            </div>

            <Separator />

            <div>
              <h4 className="font-semibold mb-2">Reason</h4>
              <p className="text-sm whitespace-pre-wrap">{dispute.reason}</p>
            </div>

            {dispute.requestedOutcome && (
              <div>
                <h4 className="font-semibold mb-2">Requested Outcome</h4>
                <p className="text-sm whitespace-pre-wrap">{dispute.requestedOutcome}</p>
              </div>
            )}

            {dispute.resolution && (
              <>
                <Separator />
                <div>
                  <h4 className="font-semibold mb-2">Resolution</h4>
                  <p className="text-sm whitespace-pre-wrap">{dispute.resolution}</p>
                  {dispute.resolutionAction && (
                    <div className="mt-2">
                      <Badge variant="outline">{dispute.resolutionAction}</Badge>
                    </div>
                  )}
                </div>
              </>
            )}

            {isHROrManager && dispute.status === 'pending' && (
              <>
                <Separator />
                {resolveFormOpen ? (
                  <div className="space-y-3 p-4 border rounded-md bg-muted/20">
                    <p className="text-sm font-semibold">Resolve Dispute</p>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Resolution Notes</label>
                      <Textarea
                        placeholder="Describe how this dispute was resolved..."
                        value={resolutionText}
                        onChange={e => setResolutionText(e.target.value)}
                        rows={3}
                        data-testid="input-resolution-text"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Outcome</label>
                      <Select value={resolutionAction} onValueChange={v => setResolutionAction(v as typeof resolutionAction)}>
                        <SelectTrigger data-testid="select-resolution-action">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="approved">Approved</SelectItem>
                          <SelectItem value="denied">Denied</SelectItem>
                          <SelectItem value="partial">Partial Resolution</SelectItem>
                          <SelectItem value="escalated">Escalated</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { setResolveFormOpen(false); setResolutionText(''); }}
                        data-testid="button-cancel-resolve"
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          if (resolutionText.trim()) {
                            resolveMutation.mutate({ resolution: resolutionText, resolutionAction });
                          }
                        }}
                        disabled={resolveMutation.isPending || !resolutionText.trim()}
                        data-testid="button-confirm-resolve"
                      >
                        {resolveMutation.isPending ? (
                          <><Loader2 className="h-3 w-3 animate-spin mr-1.5" />Resolving...</>
                        ) : 'Confirm Resolution'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex space-x-2">
                    <Button 
                      onClick={() => assignMutation.mutate((user as any)?.id)}
                      disabled={assignMutation.isPending}
                      data-testid="button-assign-to-me"
                    >
                      {assignMutation.isPending ? (
                        <><Loader2 className="h-4 w-4 animate-spin mr-2" />Assigning...</>
                      ) : 'Assign to Me'}
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => setResolveFormOpen(true)}
                      data-testid="button-resolve"
                    >
                      Resolve
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>
        </div>
      </UniversalModalContent>
    </UniversalModal>
  );
}

function getPriorityColor(priority: string | null) {
  if (!priority) return '';
  switch (priority) {
    case 'low': return 'bg-gray-500/10 text-gray-500 dark:text-gray-400 border-gray-500/20';
    case 'normal': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
    case 'high': return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
    case 'urgent': return 'bg-red-500/10 text-red-500 border-red-500/20';
    default: return '';
  }
}

function getStatusColor(status: string | null) {
  if (!status) return '';
  switch (status) {
    case 'pending': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
    case 'under_review': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
    case 'resolved': return 'bg-muted/10 text-green-500 border-primary/20';
    case 'rejected': return 'bg-red-500/10 text-red-500 border-red-500/20';
    case 'appealed': return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
    default: return '';
  }
}
