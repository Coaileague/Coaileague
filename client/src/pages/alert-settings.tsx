import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { WorkspaceLayout } from "@/components/workspace-layout";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Bell,
  Clock,
  DollarSign,
  AlertTriangle,
  Users,
  Shield,
  Calendar,
  Activity,
  CheckCircle2,
  XCircle,
  Mail,
  MessageSquare,
  Smartphone,
  Settings2,
  History,
  Send,
  Check,
  Eye,
} from "lucide-react";
import { format } from "date-fns";

type AlertType = 'overtime' | 'low_coverage' | 'compliance_violation' | 'payment_overdue' | 'shift_unfilled' | 'clock_anomaly' | 'budget_exceeded' | 'approval_pending';
type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';
type AlertChannel = 'in_app' | 'email' | 'sms';

interface AlertConfiguration {
  id: string;
  workspaceId: string;
  alertType: AlertType;
  isEnabled: boolean;
  thresholds: Record<string, any>;
  severity: AlertSeverity;
  channels: string[];
  notifyRoles: string[];
  notifyUserIds: string[] | null;
  cooldownMinutes: number;
  maxAlertsPerHour: number;
  alertSchedule: Record<string, any>;
  customTitle: string | null;
  customMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AlertHistory {
  id: string;
  workspaceId: string;
  alertType: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  triggerData: Record<string, any>;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  channelsNotified: string[];
  deliveryStatus: Record<string, string>;
  isAcknowledged: boolean;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  acknowledgmentNotes: string | null;
  isResolved: boolean;
  resolvedBy: string | null;
  resolvedAt: string | null;
  resolutionNotes: string | null;
  createdAt: string;
}

const ALERT_TYPE_INFO: Record<AlertType, { label: string; description: string; icon: any; thresholdLabel: string; thresholdUnit: string }> = {
  overtime: {
    label: 'Overtime Alert',
    description: 'Alert when employee overtime exceeds threshold',
    icon: Clock,
    thresholdLabel: 'Maximum overtime hours',
    thresholdUnit: 'hours',
  },
  low_coverage: {
    label: 'Low Coverage Alert',
    description: 'Alert when shift coverage drops below threshold',
    icon: Users,
    thresholdLabel: 'Minimum coverage percentage',
    thresholdUnit: '%',
  },
  compliance_violation: {
    label: 'Compliance Violation',
    description: 'Alert for break/labor law compliance issues',
    icon: Shield,
    thresholdLabel: 'Violation threshold',
    thresholdUnit: 'violations',
  },
  payment_overdue: {
    label: 'Payment Overdue',
    description: 'Alert when invoice payment is past due',
    icon: DollarSign,
    thresholdLabel: 'Days past due',
    thresholdUnit: 'days',
  },
  shift_unfilled: {
    label: 'Unfilled Shift',
    description: 'Alert for upcoming shifts without assignees',
    icon: Calendar,
    thresholdLabel: 'Hours before shift',
    thresholdUnit: 'hours',
  },
  clock_anomaly: {
    label: 'Clock Anomaly',
    description: 'Alert for unusual clock in/out patterns',
    icon: Activity,
    thresholdLabel: 'Variance threshold',
    thresholdUnit: 'minutes',
  },
  budget_exceeded: {
    label: 'Budget Exceeded',
    description: 'Alert when department/project budget is exceeded',
    icon: AlertTriangle,
    thresholdLabel: 'Budget percentage',
    thresholdUnit: '%',
  },
  approval_pending: {
    label: 'Pending Approval',
    description: 'Alert for approvals waiting beyond threshold',
    icon: CheckCircle2,
    thresholdLabel: 'Pending hours',
    thresholdUnit: 'hours',
  },
};

const SEVERITY_COLORS: Record<AlertSeverity, string> = {
  low: 'bg-blue-500/10 text-blue-500 border-blue-500/30',
  medium: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
  high: 'bg-orange-500/10 text-orange-500 border-orange-500/30',
  critical: 'bg-red-500/10 text-red-500 border-red-500/30',
};

const CHANNEL_INFO: Record<AlertChannel, { label: string; icon: any }> = {
  in_app: { label: 'In-App', icon: Bell },
  email: { label: 'Email', icon: Mail },
  sms: { label: 'SMS', icon: Smartphone },
};

export default function AlertSettings() {
  const { toast } = useToast();
  const [selectedConfig, setSelectedConfig] = useState<AlertConfiguration | null>(null);
  const [showAcknowledgeDialog, setShowAcknowledgeDialog] = useState(false);
  const [acknowledgeAlertId, setAcknowledgeAlertId] = useState<string | null>(null);
  const [acknowledgeNotes, setAcknowledgeNotes] = useState('');
  const [historyFilter, setHistoryFilter] = useState<{
    alertType?: string;
    severity?: string;
    acknowledged?: string;
  }>({});

  const { data: configsData, isLoading: configsLoading } = useQuery<{ success: boolean; data: AlertConfiguration[] }>({
    queryKey: ['/api/alerts/config'],
  });

  const { data: historyData, isLoading: historyLoading } = useQuery<{ success: boolean; data: AlertHistory[] }>({
    queryKey: ['/api/alerts/history', historyFilter],
  });

  const { data: unacknowledgedData } = useQuery<{ success: boolean; data: { count: number } }>({
    queryKey: ['/api/alerts/unacknowledged-count'],
  });

  const toggleAlertMutation = useMutation({
    mutationFn: async ({ alertType, isEnabled }: { alertType: string; isEnabled: boolean }) => {
      return await apiRequest('PATCH', `/api/alerts/config/${alertType}/toggle`, { isEnabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/alerts/config'] });
      toast({ title: 'Alert configuration updated' });
    },
    onError: (error: any) => {
      toast({ title: 'Error updating alert', description: error.message, variant: 'destructive' });
    },
  });

  const updateConfigMutation = useMutation({
    mutationFn: async ({ alertType, data }: { alertType: string; data: Partial<AlertConfiguration> }) => {
      return await apiRequest('PUT', `/api/alerts/config/${alertType}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/alerts/config'] });
      setSelectedConfig(null);
      toast({ title: 'Alert configuration saved' });
    },
    onError: (error: any) => {
      toast({ title: 'Error saving configuration', description: error.message, variant: 'destructive' });
    },
  });

  const acknowledgeMutation = useMutation({
    mutationFn: async ({ alertId, notes }: { alertId: string; notes?: string }) => {
      return await apiRequest('POST', `/api/alerts/${alertId}/acknowledge`, { notes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/alerts/history'] });
      queryClient.invalidateQueries({ queryKey: ['/api/alerts/unacknowledged-count'] });
      setShowAcknowledgeDialog(false);
      setAcknowledgeAlertId(null);
      setAcknowledgeNotes('');
      toast({ title: 'Alert acknowledged' });
    },
    onError: (error: any) => {
      toast({ title: 'Error acknowledging alert', description: error.message, variant: 'destructive' });
    },
  });

  const testAlertMutation = useMutation({
    mutationFn: async (alertType: string) => {
      return await apiRequest('POST', '/api/alerts/test', { alertType });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/alerts/history'] });
      toast({ title: 'Test alert sent', description: 'Check your notification channels' });
    },
    onError: (error: any) => {
      toast({ title: 'Error sending test alert', description: error.message, variant: 'destructive' });
    },
  });

  const configs = configsData?.data || [];
  const history = historyData?.data || [];
  const unacknowledgedCount = unacknowledgedData?.data?.count || 0;

  const getThresholdValue = (config: AlertConfiguration): number => {
    const thresholds = config.thresholds as Record<string, number>;
    return Object.values(thresholds)[0] || 0;
  };

  const getThresholdKey = (alertType: AlertType): string => {
    const keyMap: Record<AlertType, string> = {
      overtime: 'hours',
      low_coverage: 'percentage',
      compliance_violation: 'threshold',
      payment_overdue: 'days',
      shift_unfilled: 'hoursBeforeShift',
      clock_anomaly: 'varianceMinutes',
      budget_exceeded: 'percentage',
      approval_pending: 'hours',
    };
    return keyMap[alertType];
  };

  return (
    <WorkspaceLayout>
      <div className="flex flex-col h-full">
        <PageHeader
          title="Alert Settings"
          description="Configure real-time alerts for critical system events"
        />

        <div className="flex-1 overflow-auto p-4 sm:p-6">
          <Tabs defaultValue="configuration" className="space-y-4">
            <TabsList data-testid="tabs-alert-settings">
              <TabsTrigger value="configuration" data-testid="tab-configuration">
                <Settings2 className="w-4 h-4 mr-2" />
                Configuration
              </TabsTrigger>
              <TabsTrigger value="history" data-testid="tab-history">
                <History className="w-4 h-4 mr-2" />
                History
                {unacknowledgedCount > 0 && (
                  <Badge variant="destructive" className="ml-2 h-5 px-1.5">
                    {unacknowledgedCount}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="configuration" className="space-y-4">
              {configsLoading ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-40" />
                  ))}
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {configs.map((config) => {
                    const info = ALERT_TYPE_INFO[config.alertType];
                    const Icon = info.icon;
                    return (
                      <Card key={config.id} data-testid={`card-alert-config-${config.alertType}`}>
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-3">
                              <div className={`p-2 rounded-lg ${config.isEnabled ? 'bg-primary/10' : 'bg-muted'}`}>
                                <Icon className={`w-5 h-5 ${config.isEnabled ? 'text-primary' : 'text-muted-foreground'}`} />
                              </div>
                              <div>
                                <CardTitle className="text-base">{info.label}</CardTitle>
                                <CardDescription className="text-xs mt-0.5">
                                  {info.description}
                                </CardDescription>
                              </div>
                            </div>
                            <Switch
                              checked={config.isEnabled}
                              onCheckedChange={(checked) => 
                                toggleAlertMutation.mutate({ alertType: config.alertType, isEnabled: checked })
                              }
                              data-testid={`switch-alert-${config.alertType}`}
                            />
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="flex items-center justify-between gap-2 text-sm">
                            <span className="text-muted-foreground">Severity</span>
                            <Badge className={SEVERITY_COLORS[config.severity]}>
                              {config.severity}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between gap-2 text-sm">
                            <span className="text-muted-foreground">Threshold</span>
                            <span className="font-medium">
                              {getThresholdValue(config)} {info.thresholdUnit}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2 text-sm">
                            <span className="text-muted-foreground">Channels</span>
                            <div className="flex gap-1">
                              {config.channels.map((channel) => {
                                const channelInfo = CHANNEL_INFO[channel as AlertChannel];
                                if (!channelInfo) return null;
                                const ChannelIcon = channelInfo.icon;
                                return (
                                  <Badge key={channel} variant="outline" className="px-1.5">
                                    <ChannelIcon className="w-3 h-3" />
                                  </Badge>
                                );
                              })}
                            </div>
                          </div>
                          <Separator />
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1"
                              onClick={() => setSelectedConfig(config)}
                              data-testid={`button-edit-${config.alertType}`}
                            >
                              <Settings2 className="w-4 h-4 mr-1" />
                              Configure
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => testAlertMutation.mutate(config.alertType)}
                              disabled={!config.isEnabled || testAlertMutation.isPending}
                              data-testid={`button-test-${config.alertType}`}
                            >
                              <Send className="w-4 h-4" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="history" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <CardTitle className="flex items-center gap-2">
                      <History className="w-5 h-5" />
                      Alert History
                    </CardTitle>
                    <div className="flex flex-wrap gap-2">
                      <Select
                        value={historyFilter.alertType || 'all'}
                        onValueChange={(v) => setHistoryFilter(f => ({ ...f, alertType: v === 'all' ? undefined : v }))}
                      >
                        <SelectTrigger className="w-40" data-testid="select-filter-type">
                          <SelectValue placeholder="All types" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All types</SelectItem>
                          {Object.entries(ALERT_TYPE_INFO).map(([type, info]) => (
                            <SelectItem key={type} value={type}>{info.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={historyFilter.severity || 'all'}
                        onValueChange={(v) => setHistoryFilter(f => ({ ...f, severity: v === 'all' ? undefined : v }))}
                      >
                        <SelectTrigger className="w-32" data-testid="select-filter-severity">
                          <SelectValue placeholder="All severity" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All severity</SelectItem>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="critical">Critical</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select
                        value={historyFilter.acknowledged || 'all'}
                        onValueChange={(v) => setHistoryFilter(f => ({ ...f, acknowledged: v === 'all' ? undefined : v }))}
                      >
                        <SelectTrigger className="w-36" data-testid="select-filter-acknowledged">
                          <SelectValue placeholder="All status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All status</SelectItem>
                          <SelectItem value="false">Pending</SelectItem>
                          <SelectItem value="true">Acknowledged</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {historyLoading ? (
                    <div className="space-y-3">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Skeleton key={i} className="h-20" />
                      ))}
                    </div>
                  ) : history.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <Bell className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>No alerts found</p>
                      <p className="text-sm mt-1">Alerts will appear here when triggered</p>
                    </div>
                  ) : (
                    <ScrollArea className="h-[500px]">
                      <div className="space-y-3 pr-4">
                        {history.map((alert) => {
                          const info = ALERT_TYPE_INFO[alert.alertType];
                          const Icon = info.icon;
                          return (
                            <div
                              key={alert.id}
                              className={`p-4 rounded-lg border ${
                                alert.isAcknowledged
                                  ? 'bg-muted/30 border-border'
                                  : 'bg-card border-orange-500/30'
                              }`}
                              data-testid={`alert-history-${alert.id}`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex items-start gap-3">
                                  <div className={`p-2 rounded-lg ${SEVERITY_COLORS[alert.severity].split(' ')[0]}`}>
                                    <Icon className={`w-4 h-4 ${SEVERITY_COLORS[alert.severity].split(' ')[1]}`} />
                                  </div>
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-medium">{alert.title}</span>
                                      <Badge className={SEVERITY_COLORS[alert.severity]} variant="outline">
                                        {alert.severity}
                                      </Badge>
                                      {alert.isAcknowledged ? (
                                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30">
                                          <Check className="w-3 h-3 mr-1" />
                                          Acknowledged
                                        </Badge>
                                      ) : (
                                        <Badge variant="outline" className="bg-orange-500/10 text-orange-500 border-orange-500/30">
                                          Pending
                                        </Badge>
                                      )}
                                    </div>
                                    <p className="text-sm text-muted-foreground">{alert.message}</p>
                                    <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
                                      <span>{format(new Date(alert.createdAt), 'MMM d, yyyy h:mm a')}</span>
                                      <div className="flex gap-1">
                                        {alert.channelsNotified.map((channel) => {
                                          const channelInfo = CHANNEL_INFO[channel as AlertChannel];
                                          if (!channelInfo) return null;
                                          const ChannelIcon = channelInfo.icon;
                                          const status = (alert.deliveryStatus as Record<string, string>)[channel];
                                          return (
                                            <Badge 
                                              key={channel} 
                                              variant="outline" 
                                              className={`px-1.5 ${status === 'sent' ? 'text-emerald-500' : 'text-muted-foreground'}`}
                                            >
                                              <ChannelIcon className="w-3 h-3" />
                                            </Badge>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                                {!alert.isAcknowledged && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      setAcknowledgeAlertId(alert.id);
                                      setShowAcknowledgeDialog(true);
                                    }}
                                    data-testid={`button-acknowledge-${alert.id}`}
                                  >
                                    <Eye className="w-4 h-4 mr-1" />
                                    Acknowledge
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <Dialog open={!!selectedConfig} onOpenChange={(open) => !open && setSelectedConfig(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedConfig && (
                <>
                  {(() => {
                    const Icon = ALERT_TYPE_INFO[selectedConfig.alertType].icon;
                    return <Icon className="w-5 h-5" />;
                  })()}
                  Configure {ALERT_TYPE_INFO[selectedConfig.alertType].label}
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              Customize the alert threshold, severity, and notification channels.
            </DialogDescription>
          </DialogHeader>
          
          {selectedConfig && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>{ALERT_TYPE_INFO[selectedConfig.alertType].thresholdLabel}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={getThresholdValue(selectedConfig)}
                    onChange={(e) => {
                      const key = getThresholdKey(selectedConfig.alertType);
                      setSelectedConfig({
                        ...selectedConfig,
                        thresholds: { [key]: parseInt(e.target.value) || 0 },
                      });
                    }}
                    className="w-32"
                    data-testid="input-threshold"
                  />
                  <span className="text-muted-foreground">
                    {ALERT_TYPE_INFO[selectedConfig.alertType].thresholdUnit}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Severity Level</Label>
                <Select
                  value={selectedConfig.severity}
                  onValueChange={(v) => setSelectedConfig({ ...selectedConfig, severity: v as AlertSeverity })}
                >
                  <SelectTrigger data-testid="select-severity">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Notification Channels</Label>
                <div className="flex gap-2">
                  {Object.entries(CHANNEL_INFO).map(([channel, info]) => {
                    const isSelected = selectedConfig.channels.includes(channel);
                    const ChannelIcon = info.icon;
                    return (
                      <Button
                        key={channel}
                        variant={isSelected ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => {
                          const newChannels = isSelected
                            ? selectedConfig.channels.filter(c => c !== channel)
                            : [...selectedConfig.channels, channel];
                          setSelectedConfig({ ...selectedConfig, channels: newChannels });
                        }}
                        data-testid={`button-channel-${channel}`}
                      >
                        <ChannelIcon className="w-4 h-4 mr-1" />
                        {info.label}
                      </Button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Rate Limiting</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Cooldown (minutes)</Label>
                    <Input
                      type="number"
                      value={selectedConfig.cooldownMinutes}
                      onChange={(e) => setSelectedConfig({
                        ...selectedConfig,
                        cooldownMinutes: parseInt(e.target.value) || 60,
                      })}
                      data-testid="input-cooldown"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Max per hour</Label>
                    <Input
                      type="number"
                      value={selectedConfig.maxAlertsPerHour}
                      onChange={(e) => setSelectedConfig({
                        ...selectedConfig,
                        maxAlertsPerHour: parseInt(e.target.value) || 10,
                      })}
                      data-testid="input-max-per-hour"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedConfig(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedConfig) {
                  updateConfigMutation.mutate({
                    alertType: selectedConfig.alertType,
                    data: {
                      thresholds: selectedConfig.thresholds,
                      severity: selectedConfig.severity,
                      channels: selectedConfig.channels,
                      cooldownMinutes: selectedConfig.cooldownMinutes,
                      maxAlertsPerHour: selectedConfig.maxAlertsPerHour,
                    },
                  });
                }
              }}
              disabled={updateConfigMutation.isPending}
              data-testid="button-save-config"
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAcknowledgeDialog} onOpenChange={setShowAcknowledgeDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Acknowledge Alert</DialogTitle>
            <DialogDescription>
              Add optional notes about how this alert was addressed.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              placeholder="Notes (optional)"
              value={acknowledgeNotes}
              onChange={(e) => setAcknowledgeNotes(e.target.value)}
              rows={3}
              data-testid="textarea-acknowledge-notes"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAcknowledgeDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (acknowledgeAlertId) {
                  acknowledgeMutation.mutate({
                    alertId: acknowledgeAlertId,
                    notes: acknowledgeNotes || undefined,
                  });
                }
              }}
              disabled={acknowledgeMutation.isPending}
              data-testid="button-confirm-acknowledge"
            >
              <Check className="w-4 h-4 mr-1" />
              Acknowledge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </WorkspaceLayout>
  );
}
