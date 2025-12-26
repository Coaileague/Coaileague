/**
 * Code Change Review Panel - Trinity™ Code Editor UI
 * Allows support staff to review, approve, reject, apply, and rollback code changes
 * staged by Trinity™ or HelpAI.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { 
  Code2, FileCode, Check, X, Play, RotateCcw, 
  Clock, Loader2, AlertCircle, FileText, FolderOpen,
  ChevronDown, ChevronRight, Eye, Bell
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { StagedCodeChange } from "@shared/schema";

interface CodeChangeResponse {
  success: boolean;
  message: string;
  changes?: StagedCodeChange[];
  change?: StagedCodeChange;
}

const STATUS_CONFIG: Record<string, { color: string; label: string; icon: typeof Clock }> = {
  pending: { color: "bg-yellow-500", label: "Pending Review", icon: Clock },
  approved: { color: "bg-green-500", label: "Approved", icon: Check },
  rejected: { color: "bg-red-500", label: "Rejected", icon: X },
  applied: { color: "bg-blue-500", label: "Applied", icon: Play },
  failed: { color: "bg-destructive", label: "Failed", icon: AlertCircle },
  rolling_back: { color: "bg-orange-500", label: "Rolling Back", icon: RotateCcw },
};

const CHANGE_TYPE_CONFIG: Record<string, { color: string; label: string }> = {
  create: { color: "text-green-500", label: "New File" },
  modify: { color: "text-yellow-500", label: "Modified" },
  delete: { color: "text-red-500", label: "Deleted" },
  rename: { color: "text-blue-500", label: "Renamed" },
};

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || { color: "bg-gray-500", label: status, icon: Clock };
  const Icon = config.icon;
  
  return (
    <Badge variant="secondary" className={`${config.color} text-white`}>
      <Icon className="h-3 w-3 mr-1" />
      {config.label}
    </Badge>
  );
}

function ChangeTypeBadge({ type }: { type: string }) {
  const config = CHANGE_TYPE_CONFIG[type] || { color: "text-gray-500", label: type };
  
  return (
    <Badge variant="outline" className={config.color}>
      <FileCode className="h-3 w-3 mr-1" />
      {config.label}
    </Badge>
  );
}

function DiffViewer({ diff }: { diff: string | null }) {
  if (!diff) return <p className="text-muted-foreground italic">No diff available</p>;
  
  return (
    <pre className="bg-muted p-3 rounded-md text-xs font-mono overflow-x-auto whitespace-pre-wrap">
      {diff.split('\n').map((line, i) => {
        let className = "";
        if (line.startsWith('+') && !line.startsWith('+++')) {
          className = "text-green-600 dark:text-green-400";
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          className = "text-red-600 dark:text-red-400";
        } else if (line.startsWith('@@')) {
          className = "text-blue-600 dark:text-blue-400";
        }
        return (
          <div key={i} className={className}>
            {line}
          </div>
        );
      })}
    </pre>
  );
}

function CodeChangeCard({ 
  change, 
  onApprove, 
  onReject, 
  onApply, 
  onRollback,
  isLoading 
}: { 
  change: StagedCodeChange;
  onApprove: (id: string, notes: string) => void;
  onReject: (id: string, notes: string) => void;
  onApply: (id: string, sendWhatsNew: boolean) => void;
  onRollback: (id: string, reason: string) => void;
  isLoading: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [reviewNotes, setReviewNotes] = useState("");
  const [sendWhatsNew, setSendWhatsNew] = useState(true);
  const [showApplyDialog, setShowApplyDialog] = useState(false);
  const [showRollbackDialog, setShowRollbackDialog] = useState(false);
  const [rollbackReason, setRollbackReason] = useState("");

  return (
    <Card className="border-l-4 border-l-primary/50">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="p-0 h-auto hover:bg-transparent">
                {isOpen ? (
                  <ChevronDown className="h-4 w-4 mr-2" />
                ) : (
                  <ChevronRight className="h-4 w-4 mr-2" />
                )}
                <div className="text-left">
                  <CardTitle className="text-sm font-medium">{change.title}</CardTitle>
                  <CardDescription className="text-xs mt-1 flex items-center gap-2">
                    <FolderOpen className="h-3 w-3" />
                    {change.filePath}
                  </CardDescription>
                </div>
              </Button>
            </CollapsibleTrigger>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <ChangeTypeBadge type={change.changeType} />
              <StatusBadge status={change.status} />
            </div>
          </div>
        </CardHeader>
        
        <CollapsibleContent>
          <CardContent className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">{change.description}</p>
            
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground">Requested by:</span>{" "}
                <span className="font-medium">{change.requestedBy}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Priority:</span>{" "}
                <Badge variant="outline" className="ml-1">P{change.priority}</Badge>
              </div>
              {change.affectedModule && (
                <div>
                  <span className="text-muted-foreground">Module:</span>{" "}
                  <span className="font-medium">{change.affectedModule}</span>
                </div>
              )}
              {change.category && (
                <div>
                  <span className="text-muted-foreground">Category:</span>{" "}
                  <Badge variant="outline" className="ml-1">{change.category}</Badge>
                </div>
              )}
            </div>

            {change.diffPatch && (
              <div className="space-y-2">
                <Label className="text-xs font-medium flex items-center gap-1">
                  <Eye className="h-3 w-3" />
                  Diff Preview
                </Label>
                <ScrollArea className="h-48 w-full rounded-md border">
                  <DiffViewer diff={change.diffPatch} />
                </ScrollArea>
              </div>
            )}

            {change.reviewNotes && (
              <div className="bg-muted p-2 rounded-md text-sm">
                <span className="font-medium">Review Notes:</span> {change.reviewNotes}
              </div>
            )}

            {change.status === 'pending' && (
              <div className="space-y-2">
                <Label htmlFor={`review-notes-${change.id}`} className="text-xs">
                  Review Notes (optional)
                </Label>
                <Textarea
                  id={`review-notes-${change.id}`}
                  placeholder="Add any notes about this change..."
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  className="h-20 text-sm"
                  data-testid={`input-review-notes-${change.id}`}
                />
              </div>
            )}
          </CardContent>
          
          <CardFooter className="flex flex-wrap gap-2 pt-2">
            {change.status === 'pending' && (
              <>
                <Button
                  size="sm"
                  onClick={() => onApprove(change.id, reviewNotes)}
                  disabled={isLoading}
                  data-testid={`button-approve-${change.id}`}
                >
                  {isLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Check className="h-3 w-3 mr-1" />}
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => onReject(change.id, reviewNotes)}
                  disabled={isLoading}
                  data-testid={`button-reject-${change.id}`}
                >
                  {isLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <X className="h-3 w-3 mr-1" />}
                  Reject
                </Button>
              </>
            )}
            
            {change.status === 'approved' && (
              <Dialog open={showApplyDialog} onOpenChange={setShowApplyDialog}>
                <DialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="default"
                    disabled={isLoading}
                    data-testid={`button-apply-${change.id}`}
                  >
                    <Play className="h-3 w-3 mr-1" />
                    Apply Change
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Apply Code Change</DialogTitle>
                    <DialogDescription>
                      This will apply the code change to the codebase. This action modifies actual files.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex items-center space-x-2 py-4">
                    <Switch
                      id="send-whats-new"
                      checked={sendWhatsNew}
                      onCheckedChange={setSendWhatsNew}
                      data-testid="switch-send-whats-new"
                    />
                    <Label htmlFor="send-whats-new" className="flex items-center gap-1">
                      <Bell className="h-4 w-4" />
                      Send What's New notification to users
                    </Label>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowApplyDialog(false)}>
                      Cancel
                    </Button>
                    <Button
                      onClick={() => {
                        onApply(change.id, sendWhatsNew);
                        setShowApplyDialog(false);
                      }}
                      disabled={isLoading}
                      data-testid="button-confirm-apply"
                    >
                      {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Play className="h-4 w-4 mr-1" />}
                      Apply
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
            
            {change.status === 'applied' && change.rollbackAvailable && (
              <Dialog open={showRollbackDialog} onOpenChange={setShowRollbackDialog}>
                <DialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isLoading}
                    data-testid={`button-rollback-${change.id}`}
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Rollback
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Rollback Code Change</DialogTitle>
                    <DialogDescription>
                      This will revert the code change to its original state. The change will return to pending status.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-2 py-4">
                    <Label htmlFor="rollback-reason">Reason for rollback (optional)</Label>
                    <Textarea
                      id="rollback-reason"
                      placeholder="Why are you rolling back this change?"
                      value={rollbackReason}
                      onChange={(e) => setRollbackReason(e.target.value)}
                      className="h-20"
                      data-testid="input-rollback-reason"
                    />
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowRollbackDialog(false)}>
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => {
                        onRollback(change.id, rollbackReason);
                        setShowRollbackDialog(false);
                      }}
                      disabled={isLoading}
                      data-testid="button-confirm-rollback"
                    >
                      {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RotateCcw className="h-4 w-4 mr-1" />}
                      Rollback
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </CardFooter>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

export function CodeChangeReviewPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<string>("pending");
  const [isOpen, setIsOpen] = useState(false);

  const { data: changesData, isLoading: isLoadingChanges } = useQuery<CodeChangeResponse>({
    queryKey: ['/api/support/command/code/pending'],
  });

  const approveMutation = useMutation({
    mutationFn: async ({ changeId, reviewNotes }: { changeId: string; reviewNotes: string }) => {
      const res = await apiRequest('POST', '/api/support/command/code/approve', { changeId, reviewNotes });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Change Approved", description: data.message });
      queryClient.invalidateQueries({ queryKey: ['/api/support/command/code/pending'] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ changeId, reviewNotes }: { changeId: string; reviewNotes: string }) => {
      const res = await apiRequest('POST', '/api/support/command/code/reject', { changeId, reviewNotes });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Change Rejected", description: data.message });
      queryClient.invalidateQueries({ queryKey: ['/api/support/command/code/pending'] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const applyMutation = useMutation({
    mutationFn: async ({ changeId, sendWhatsNew }: { changeId: string; sendWhatsNew: boolean }) => {
      const res = await apiRequest('POST', '/api/support/command/code/apply', { changeId, sendWhatsNew });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Change Applied", description: data.message });
      queryClient.invalidateQueries({ queryKey: ['/api/support/command/code/pending'] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const rollbackMutation = useMutation({
    mutationFn: async ({ changeId, reason }: { changeId: string; reason: string }) => {
      const res = await apiRequest('POST', '/api/support/command/code/rollback', { changeId, reason });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Change Rolled Back", description: data.message });
      queryClient.invalidateQueries({ queryKey: ['/api/support/command/code/pending'] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const isLoading = approveMutation.isPending || rejectMutation.isPending || 
                    applyMutation.isPending || rollbackMutation.isPending;

  const changes = changesData?.changes || [];
  const pendingChanges = changes.filter(c => c.status === 'pending');
  const approvedChanges = changes.filter(c => c.status === 'approved');
  const appliedChanges = changes.filter(c => c.status === 'applied');
  const rejectedChanges = changes.filter(c => c.status === 'rejected' || c.status === 'failed');

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="border border-primary/30 bg-primary/5">
        <CollapsibleTrigger asChild>
          <CardHeader className="py-2 px-4 cursor-pointer hover-elevate">
            <div className="flex items-center gap-2">
              <Code2 className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm font-medium">Trinity™ Code Editor</CardTitle>
              <Badge variant="outline" className="ml-auto border-primary/50 text-primary text-xs py-0 h-5">
                <FileText className="h-2.5 w-2.5 mr-1" />
                {changes.length} Changes
              </Badge>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 pb-3 px-4">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-4 h-8">
                <TabsTrigger value="pending" className="text-xs h-7">
                  <Clock className="h-3 w-3 mr-1" />
                  Pending ({pendingChanges.length})
                </TabsTrigger>
                <TabsTrigger value="approved" className="text-xs h-7">
                  <Check className="h-3 w-3 mr-1" />
                  Approved ({approvedChanges.length})
                </TabsTrigger>
                <TabsTrigger value="applied" className="text-xs h-7">
                  <Play className="h-3 w-3 mr-1" />
                  Applied ({appliedChanges.length})
                </TabsTrigger>
                <TabsTrigger value="rejected" className="text-xs h-7">
                  <X className="h-3 w-3 mr-1" />
                  Rejected ({rejectedChanges.length})
                </TabsTrigger>
              </TabsList>

          <TabsContent value="pending" className="space-y-3 pt-3">
            {isLoadingChanges ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : pendingChanges.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No pending code changes</p>
              </div>
            ) : (
              <ScrollArea className="h-[400px]">
                <div className="space-y-3 pr-4">
                  {pendingChanges.map((change) => (
                    <CodeChangeCard
                      key={change.id}
                      change={change}
                      onApprove={(id, notes) => approveMutation.mutate({ changeId: id, reviewNotes: notes })}
                      onReject={(id, notes) => rejectMutation.mutate({ changeId: id, reviewNotes: notes })}
                      onApply={(id, sendWhatsNew) => applyMutation.mutate({ changeId: id, sendWhatsNew })}
                      onRollback={(id, reason) => rollbackMutation.mutate({ changeId: id, reason })}
                      isLoading={isLoading}
                    />
                  ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>

          <TabsContent value="approved" className="space-y-3 pt-3">
            {approvedChanges.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Check className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No approved changes waiting to be applied</p>
              </div>
            ) : (
              <ScrollArea className="h-[400px]">
                <div className="space-y-3 pr-4">
                  {approvedChanges.map((change) => (
                    <CodeChangeCard
                      key={change.id}
                      change={change}
                      onApprove={(id, notes) => approveMutation.mutate({ changeId: id, reviewNotes: notes })}
                      onReject={(id, notes) => rejectMutation.mutate({ changeId: id, reviewNotes: notes })}
                      onApply={(id, sendWhatsNew) => applyMutation.mutate({ changeId: id, sendWhatsNew })}
                      onRollback={(id, reason) => rollbackMutation.mutate({ changeId: id, reason })}
                      isLoading={isLoading}
                    />
                  ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>

          <TabsContent value="applied" className="space-y-3 pt-3">
            {appliedChanges.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Play className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No applied changes</p>
              </div>
            ) : (
              <ScrollArea className="h-[400px]">
                <div className="space-y-3 pr-4">
                  {appliedChanges.map((change) => (
                    <CodeChangeCard
                      key={change.id}
                      change={change}
                      onApprove={(id, notes) => approveMutation.mutate({ changeId: id, reviewNotes: notes })}
                      onReject={(id, notes) => rejectMutation.mutate({ changeId: id, reviewNotes: notes })}
                      onApply={(id, sendWhatsNew) => applyMutation.mutate({ changeId: id, sendWhatsNew })}
                      onRollback={(id, reason) => rollbackMutation.mutate({ changeId: id, reason })}
                      isLoading={isLoading}
                    />
                  ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>

          <TabsContent value="rejected" className="space-y-3 pt-3">
            {rejectedChanges.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <X className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No rejected or failed changes</p>
              </div>
            ) : (
              <ScrollArea className="h-[400px]">
                <div className="space-y-3 pr-4">
                  {rejectedChanges.map((change) => (
                    <CodeChangeCard
                      key={change.id}
                      change={change}
                      onApprove={(id, notes) => approveMutation.mutate({ changeId: id, reviewNotes: notes })}
                      onReject={(id, notes) => rejectMutation.mutate({ changeId: id, reviewNotes: notes })}
                      onApply={(id, sendWhatsNew) => applyMutation.mutate({ changeId: id, sendWhatsNew })}
                      onRollback={(id, reason) => rollbackMutation.mutate({ changeId: id, reason })}
                      isLoading={isLoading}
                    />
                  ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>
            </Tabs>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
