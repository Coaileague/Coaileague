import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Plus, Edit2, Trash2, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";

interface CustomSchedulerInterval {
  id: string;
  name: string;
  description?: string;
  scheduleType: 'weekly' | 'biweekly' | 'monthly' | 'custom_cron';
  scheduleValue: string;
  autoApprovalThreshold?: number;
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
  runCount: number;
  createdAt: string;
}

function getScheduleLabel(type: string) {
  switch (type) {
    case 'weekly':
      return 'Weekly';
    case 'biweekly':
      return 'Bi-weekly';
    case 'monthly':
      return 'Monthly';
    case 'custom_cron':
      return 'Custom (Cron)';
    default:
      return type;
  }
}

export default function CustomSchedulerIntervals() {
  const { toast } = useToast();
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    scheduleType: "weekly" as 'weekly' | 'biweekly' | 'monthly' | 'custom_cron',
    scheduleValue: "",
    autoApprovalThreshold: 0,
  });

  // Fetch intervals
  const { data: intervals = [], isLoading } = useQuery<CustomSchedulerInterval[]>({
    queryKey: ['/api/automation/scheduler-intervals'],
  });

  // Create/Update mutation
  const saveMutation = useMutation({
    mutationFn: async (data: typeof formData & { id?: string }) => {
      if (data.id) {
        return await apiRequest(`/api/automation/scheduler-intervals/${data.id}`, 'PATCH', data);
      } else {
        return await apiRequest('/api/automation/scheduler-intervals', 'POST', data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/automation/scheduler-intervals'] });
      toast({
        title: editingId ? "Interval updated" : "Interval created",
        description: "Scheduler interval has been saved successfully",
      });
      setShowDialog(false);
      setEditingId(null);
      setFormData({
        name: "",
        description: "",
        scheduleType: "weekly",
        scheduleValue: "",
        autoApprovalThreshold: 0,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save interval",
        variant: "destructive",
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/automation/scheduler-intervals/${id}`, 'DELETE', {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/automation/scheduler-intervals'] });
      toast({
        title: "Interval deleted",
        description: "Scheduler interval has been removed",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete interval",
        variant: "destructive",
      });
    },
  });

  const handleEdit = (interval: CustomSchedulerInterval) => {
    setEditingId(interval.id);
    setFormData({
      name: interval.name,
      description: interval.description || "",
      scheduleType: interval.scheduleType,
      scheduleValue: interval.scheduleValue,
      autoApprovalThreshold: interval.autoApprovalThreshold || 0,
    });
    setShowDialog(true);
  };

  const handleSave = () => {
    if (!formData.name.trim() || !formData.scheduleValue.trim()) {
      toast({
        title: "Missing required fields",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }
    saveMutation.mutate({
      ...formData,
      ...(editingId && { id: editingId }),
    });
  };

  
  const activeCount = intervals.filter(i => i.enabled).length;
  const enabledIntervals = intervals.filter(i => i.enabled);
  const disabledIntervals = intervals.filter(i => !i.enabled);

  return (
    <div className="container mx-auto py-8 px-4 space-y-6">
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'Edit Scheduler Interval' : 'Create Scheduler Interval'}
            </DialogTitle>
            <DialogDescription>
              {editingId
                ? 'Update the automation schedule'
                : 'Set up a new custom automation schedule'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                placeholder="e.g., Daily batch payroll"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                disabled={saveMutation.isPending}
                data-testid="input-interval-name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="What does this schedule do?"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                disabled={saveMutation.isPending}
                className="min-h-[80px]"
                data-testid="textarea-interval-description"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="schedule-type">Schedule Type *</Label>
                <Select
                  value={formData.scheduleType}
                  onValueChange={(value: any) =>
                    setFormData({ ...formData, scheduleType: value })
                  }
                  disabled={saveMutation.isPending}
                >
                  <SelectTrigger id="schedule-type" data-testid="select-schedule-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="biweekly">Bi-weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="custom_cron">Custom (Cron)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="schedule-value">Schedule Value *</Label>
                <Input
                  id="schedule-value"
                  placeholder={
                    formData.scheduleType === 'custom_cron'
                      ? 'e.g., 0 9 * * MON'
                      : formData.scheduleType === 'weekly'
                        ? 'e.g., MON'
                        : formData.scheduleType === 'biweekly'
                          ? 'e.g., MON (week 1)'
                          : 'e.g., 1 (1st of month)'
                  }
                  value={formData.scheduleValue}
                  onChange={(e) => setFormData({ ...formData, scheduleValue: e.target.value })}
                  disabled={saveMutation.isPending}
                  data-testid="input-schedule-value"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="threshold">Auto-approval Threshold (hours)</Label>
              <Input
                id="threshold"
                type="number"
                placeholder="0 (disabled)"
                value={formData.autoApprovalThreshold}
                onChange={(e) =>
                  setFormData({ ...formData, autoApprovalThreshold: parseInt(e.target.value) || 0 })
                }
                disabled={saveMutation.isPending}
                data-testid="input-approval-threshold"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDialog(false)}
              disabled={saveMutation.isPending}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending} data-testid="button-save-interval">
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Interval'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Custom Scheduler Intervals</h1>
          <p className="text-muted-foreground mt-2">
            Manage automated scheduling patterns for shift approvals and other tasks
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingId(null);
            setFormData({
              name: "",
              description: "",
              scheduleType: "weekly",
              scheduleValue: "",
              autoApprovalThreshold: 0,
            });
            setShowDialog(true);
          }}
          data-testid="button-create-interval"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Interval
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : intervals.length === 0 ? (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            No scheduler intervals yet. Create one to automate shift approvals and other tasks.
          </AlertDescription>
        </Alert>
      ) : (
        <Tabs defaultValue="active" className="space-y-4">
          <TabsList>
            <TabsTrigger value="active">Active ({activeCount})</TabsTrigger>
            <TabsTrigger value="all">All ({intervals.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="space-y-4">
            {enabledIntervals.length === 0 ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>No active scheduler intervals</AlertDescription>
              </Alert>
            ) : (
              enabledIntervals.map((interval) => (
                <IntervalCard
                  key={interval.id}
                  interval={interval}
                  onEdit={handleEdit}
                  onDelete={() => deleteMutation.mutate(interval.id)}
                  isDeleting={deleteMutation.isPending}
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="all" className="space-y-4">
            {intervals.map((interval) => (
              <IntervalCard
                key={interval.id}
                interval={interval}
                onEdit={handleEdit}
                onDelete={() => deleteMutation.mutate(interval.id)}
                isDeleting={deleteMutation.isPending}
              />
            ))}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function IntervalCard({
  interval,
  onEdit,
  onDelete,
  isDeleting,
}: {
  interval: CustomSchedulerInterval;
  onEdit: (interval: CustomSchedulerInterval) => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <CardTitle>{interval.name}</CardTitle>
              {interval.enabled && (
                <Badge variant="default" className="bg-green-600">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Active
                </Badge>
              )}
            </div>
            {interval.description && (
              <CardDescription className="mt-1">{interval.description}</CardDescription>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div>
            <p className="text-xs font-semibold text-muted-foreground">Schedule Type</p>
            <p className="text-sm font-medium">{getScheduleLabel(interval.scheduleType)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground">Schedule Value</p>
            <p className="text-sm font-mono">{interval.scheduleValue}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground">Run Count</p>
            <p className="text-sm font-medium">{interval.runCount}</p>
          </div>
          {interval.lastRun && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Last Run</p>
              <p className="text-sm">{format(new Date(interval.lastRun), 'MMM d, h:mm a')}</p>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onEdit(interval)}
            data-testid={`button-edit-interval-${interval.id}`}
          >
            <Edit2 className="h-4 w-4 mr-1" />
            Edit
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={onDelete}
            disabled={isDeleting}
            data-testid={`button-delete-interval-${interval.id}`}
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4 mr-1" />
            )}
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
