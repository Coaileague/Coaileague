import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createDisputeSchema, type CreateDispute, type Dispute } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { AlertCircle, CheckCircle, Clock, FileText, Scale, User, Calendar, Eye, ChevronRight } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MobileLoading, LoadingCard } from "@/components/mobile-loading";

export default function DisputesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedDispute, setSelectedDispute] = useState<Dispute | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // Fetch all employees to determine current user's role
  const { data: allEmployees, isLoading: loadingEmployees, isError: employeesError } = useQuery<any[]>({
    queryKey: ['/api/employees'],
    enabled: !!user,
  });
  
  const currentEmployee = allEmployees?.find((emp: any) => emp.userId === user?.id);
  const isHROrManager = currentEmployee && ['owner', 'manager', 'hr_manager'].includes(currentEmployee?.workspaceRole || '');

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
  const disputeType = form.watch("disputeType");
  
  // Update targetType when disputeType changes
  const handleDisputeTypeChange = (value: string) => {
    form.setValue("disputeType", value as any);
    // Map dispute type to target type
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

  const getStatusColor = (status: string | null) => {
    if (!status) return '';
    switch (status) {
      case 'pending': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
      case 'under_review': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'resolved': return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'rejected': return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'appealed': return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
      default: return '';
    }
  };

  const getPriorityColor = (priority: string | null) => {
    if (!priority) return '';
    switch (priority) {
      case 'low': return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
      case 'normal': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'high': return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
      case 'urgent': return 'bg-red-500/10 text-red-500 border-red-500/20';
      default: return '';
    }
  };

  const getStatusIcon = (status: string | null) => {
    if (!status) return <FileText className="w-4 h-4" />;
    switch (status) {
      case 'pending': return <Clock className="w-4 h-4" />;
      case 'under_review': return <Eye className="w-4 h-4" />;
      case 'resolved': return <CheckCircle className="w-4 h-4" />;
      case 'rejected': return <AlertCircle className="w-4 h-4" />;
      case 'appealed': return <Scale className="w-4 h-4" />;
      default: return <FileText className="w-4 h-4" />;
    }
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex-1 flex items-center justify-center">
          <MobileLoading message="Loading disputes..." />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Mobile-optimized header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 p-4 sm:p-6 border-b safe-top">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold truncate" data-testid="text-page-title">Dispute Management</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">Fair employee/employer transparency system</p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto touch-target" data-testid="button-create-dispute">
              <Scale className="w-4 h-4 mr-2 flex-shrink-0" />
              <span className="truncate">File New Dispute</span>
            </Button>
          </DialogTrigger>
          {/* Mobile: Full-screen dialog, Desktop: Standard modal */}
          <DialogContent className="w-full h-full sm:h-auto sm:w-auto sm:max-w-2xl p-0 sm:p-6 overflow-hidden bottom-sheet-enter">
            <div className="h-full overflow-y-auto p-4 sm:p-0">
            <DialogHeader>
              <DialogTitle>File a Dispute</DialogTitle>
              <DialogDescription>
                Submit a formal dispute for a performance review, employer rating, report, or composite score.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                          <SelectItem value="performance_review">Performance Review</SelectItem>
                          <SelectItem value="employer_rating">Employer Rating</SelectItem>
                          <SelectItem value="report_submission">RMS Form/Write-Up</SelectItem>
                          <SelectItem value="composite_score">Composite Score</SelectItem>
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
                      <FormDescription>
                        The ID of the review, rating, form, or score you're disputing
                      </FormDescription>
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
                        <Input placeholder="Brief summary of dispute" {...field} data-testid="input-title" />
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
                        <Textarea 
                          placeholder="Explain why you believe this is unfair or incorrect..." 
                          {...field} 
                          rows={6}
                          data-testid="input-reason"
                        />
                      </FormControl>
                      <FormDescription>
                        Minimum 20 characters required
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="requestedOutcome"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Requested Outcome (Optional)</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="What resolution are you seeking?" 
                          {...field} 
                          rows={3}
                          data-testid="input-outcome"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Priority</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-priority">
                            <SelectValue placeholder="Select priority" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="normal">Normal</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="urgent">Urgent</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end space-x-2 pt-4">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setCreateDialogOpen(false)}
                    data-testid="button-cancel"
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={createMutation.isPending}
                    data-testid="button-submit"
                  >
                    {createMutation.isPending ? "Submitting..." : "Submit Dispute"}
                  </Button>
                </div>
              </form>
            </Form>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Main Content - Mobile optimized */}
      <div className="flex-1 p-3 sm:p-6 overflow-auto mobile-scroll safe-bottom">
        {/* Mobile-optimized filter buttons */}
        <div className="mb-3 sm:mb-4 flex flex-wrap items-center gap-2">
          <Button
            variant={filterStatus === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterStatus("all")}
            className="touch-target text-xs sm:text-sm"
            data-testid="filter-all"
          >
            All
          </Button>
          <Button
            variant={filterStatus === "pending" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterStatus("pending")}
            className="touch-target text-xs sm:text-sm"
            data-testid="filter-pending"
          >
            Pending
          </Button>
          <Button
            variant={filterStatus === "under_review" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterStatus("under_review")}
            className="touch-target text-xs sm:text-sm"
            data-testid="filter-under-review"
          >
            Under Review
          </Button>
          <Button
            variant={filterStatus === "resolved" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterStatus("resolved")}
            className="touch-target text-xs sm:text-sm"
            data-testid="filter-resolved"
          >
            Resolved
          </Button>
        </div>

        {filteredDisputes.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center h-64 space-y-4">
              <Scale className="w-16 h-16 text-muted-foreground" />
              <p className="text-muted-foreground">No disputes found</p>
              {filterStatus !== "all" && (
                <Button variant="outline" onClick={() => setFilterStatus("all")}>
                  Clear Filters
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:gap-4 mobile-card-enter">
            {filteredDisputes.map((dispute) => (
              <Card 
                key={dispute.id} 
                className="hover-elevate active-elevate-2 cursor-pointer touch-active"
                onClick={() => setSelectedDispute(dispute)}
                data-testid={`card-dispute-${dispute.id}`}
              >
                {/* Mobile-optimized header */}
                <CardHeader className="pb-3 sm:pb-2">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-0">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-sm sm:text-base line-clamp-2" data-testid={`text-title-${dispute.id}`}>
                        {dispute.title}
                      </CardTitle>
                      <CardDescription className="flex flex-wrap items-center gap-1 sm:gap-2 mt-1 text-xs">
                        <span>Filed {new Date(dispute.filedAt).toLocaleDateString()}</span>
                        {dispute.reviewDeadline && (
                          <>
                            <span className="hidden sm:inline">•</span>
                            <span className="text-xs">Review by {new Date(dispute.reviewDeadline).toLocaleDateString()}</span>
                          </>
                        )}
                      </CardDescription>
                    </div>
                    {/* Badges - stack on mobile */}
                    <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                      <Badge className={`${getPriorityColor(dispute.priority)} text-xs`} data-testid={`badge-priority-${dispute.id}`}>
                        {dispute.priority || 'normal'}
                      </Badge>
                      <Badge className={`${getStatusColor(dispute.status)} text-xs`} data-testid={`badge-status-${dispute.id}`}>
                        {getStatusIcon(dispute.status)}
                        <span className="ml-1">{(dispute.status || 'pending').replace('_', ' ')}</span>
                      </Badge>
                      <ChevronRight className="w-4 h-4 text-muted-foreground hidden sm:block" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <FileText className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                      <span className="truncate">{dispute.disputeType.replace('_', ' ')}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <User className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                      <span className="truncate">{dispute.filedByRole}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {selectedDispute && (
        <DisputeDetailDialog 
          dispute={selectedDispute} 
          isOpen={!!selectedDispute} 
          onClose={() => setSelectedDispute(null)}
          isHROrManager={!!isHROrManager}
          user={user}
        />
      )}
    </div>
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
  });

  const resolveMutation = useMutation({
    mutationFn: async (data: { resolution: string; resolutionAction: string }) => {
      return await apiRequest('PATCH', `/api/disputes/${dispute.id}/resolve`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/disputes'] });
      queryClient.invalidateQueries({ queryKey: ['/api/disputes/my-disputes'] });
      toast({ title: "Dispute resolved" });
      onClose();
    },
  });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Dispute Details</DialogTitle>
        </DialogHeader>
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
                <div className="flex space-x-2">
                  <Button 
                    onClick={() => assignMutation.mutate((user as any)?.id)}
                    disabled={assignMutation.isPending}
                    data-testid="button-assign-to-me"
                  >
                    Assign to Me
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      const resolution = prompt("Enter resolution:");
                      if (resolution) {
                        resolveMutation.mutate({ 
                          resolution, 
                          resolutionAction: "approved" 
                        });
                      }
                    }}
                    disabled={resolveMutation.isPending}
                    data-testid="button-resolve"
                  >
                    Resolve
                  </Button>
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function getPriorityColor(priority: string | null) {
  if (!priority) return '';
  switch (priority) {
    case 'low': return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
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
    case 'resolved': return 'bg-green-500/10 text-green-500 border-green-500/20';
    case 'rejected': return 'bg-red-500/10 text-red-500 border-red-500/20';
    case 'appealed': return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
    default: return '';
  }
}
