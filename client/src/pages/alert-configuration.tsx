/**
 * Alert Configuration - Customizable Alert System Dashboard
 * 
 * Features:
 * - Configure alert thresholds for critical business events
 * - Manage notification channels (in-app, email, SMS)
 * - View alert history and acknowledgments
 * - Test alerts before deployment
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { 
  Bell, AlertTriangle, Clock, Users, DollarSign, Shield, 
  CheckCircle, XCircle, Mail, MessageSquare, Smartphone,
  Settings, History, Zap, RefreshCw, Save, TestTube
} from "lucide-react";

interface AlertConfiguration {
  id: string;
  alertType: string;
  isEnabled: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
  thresholds: Record<string, number>;
  channels: string[];
  cooldownMinutes: number;
  maxAlertsPerHour: number;
}

interface AlertHistoryItem {
  id: string;
  alertType: string;
  title: string;
  message: string;
  severity: string;
  isAcknowledged: boolean;
  acknowledgedAt?: string;
  createdAt: string;
}

const ALERT_TYPE_CONFIG: Record<string, { label: string; icon: any; description: string; thresholdLabel: string; thresholdUnit: string }> = {
  overtime: {
    label: 'Overtime Alert',
    icon: Clock,
    description: 'Triggered when employees exceed overtime hours threshold',
    thresholdLabel: 'Hours',
    thresholdUnit: 'hours',
  },
  low_coverage: {
    label: 'Low Staff Coverage',
    icon: Users,
    description: 'Triggered when scheduled coverage falls below minimum percentage',
    thresholdLabel: 'Minimum Coverage',
    thresholdUnit: '%',
  },
  compliance_violation: {
    label: 'Compliance Violation',
    icon: Shield,
    description: 'Triggered on any compliance or policy violation',
    thresholdLabel: 'Violations',
    thresholdUnit: 'count',
  },
  payment_overdue: {
    label: 'Payment Overdue',
    icon: DollarSign,
    description: 'Triggered when invoices are overdue past threshold',
    thresholdLabel: 'Days Overdue',
    thresholdUnit: 'days',
  },
  shift_unfilled: {
    label: 'Unfilled Shifts',
    icon: Clock,
    description: 'Alert when shifts remain unfilled close to start time',
    thresholdLabel: 'Hours Before Shift',
    thresholdUnit: 'hours',
  },
  clock_anomaly: {
    label: 'Clock Anomaly',
    icon: AlertTriangle,
    description: 'Unusual clock in/out patterns detected',
    thresholdLabel: 'Variance',
    thresholdUnit: 'minutes',
  },
  budget_exceeded: {
    label: 'Budget Overrun',
    icon: DollarSign,
    description: 'Department or project budget exceeded threshold',
    thresholdLabel: 'Budget Threshold',
    thresholdUnit: '%',
  },
  approval_pending: {
    label: 'Pending Approvals',
    icon: Clock,
    description: 'Approvals waiting longer than threshold',
    thresholdLabel: 'Hours Pending',
    thresholdUnit: 'hours',
  },
};

const SEVERITY_COLORS: Record<string, string> = {
  low: 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200',
  medium: 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-200',
  high: 'bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-200',
  critical: 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200',
};

const CHANNEL_ICONS: Record<string, any> = {
  in_app: Bell,
  email: Mail,
  sms: Smartphone,
};

export default function AlertConfiguration() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('configuration');
  const [editingConfig, setEditingConfig] = useState<AlertConfiguration | null>(null);

  const { data: configsData, isLoading: configsLoading } = useQuery<{ success: boolean; data: AlertConfiguration[] }>({
    queryKey: ['/api/alerts/config'],
  });

  const { data: historyData, isLoading: historyLoading } = useQuery<{ success: boolean; history: AlertHistoryItem[] }>({
    queryKey: ['/api/alerts/history'],
    refetchInterval: 30000,
  });

  const updateConfigMutation = useMutation({
    mutationFn: async (config: Partial<AlertConfiguration> & { id: string }) => {
      const response = await apiRequest('PUT', `/api/alerts/config/${config.alertType}`, config);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Configuration Updated', description: 'Alert settings have been saved.' });
      queryClient.invalidateQueries({ queryKey: ['/api/alerts/config'] });
      setEditingConfig(null);
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update configuration', variant: 'destructive' });
    },
  });

  const toggleAlertMutation = useMutation({
    mutationFn: async ({ alertType, isEnabled }: { alertType: string; isEnabled: boolean }) => {
      const response = await apiRequest('PATCH', `/api/alerts/config/${alertType}/toggle`, { isEnabled });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/alerts/config'] });
    },
  });

  const acknowledgeAlertMutation = useMutation({
    mutationFn: async (alertId: string) => {
      const response = await apiRequest('POST', `/api/alerts/${alertId}/acknowledge`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/alerts/history'] });
      toast({ title: 'Alert Acknowledged' });
    },
  });

  const testAlertMutation = useMutation({
    mutationFn: async (alertType: string) => {
      const response = await apiRequest('POST', '/api/alerts/test', { alertType });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Test Alert Sent', description: 'Check your configured channels for the test alert.' });
    },
    onError: () => {
      toast({ title: 'Test Failed', description: 'Could not send test alert', variant: 'destructive' });
    },
  });

  const configurations = configsData?.data || [];
  const history = historyData?.history || [];
  const unacknowledgedCount = history.filter(h => !h.isAcknowledged).length;

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    const minutes = Math.floor(diff / (1000 * 60));
    return `${minutes}m ago`;
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3" data-testid="text-page-title">
            <Bell className="w-8 h-8 text-primary" />
            Alert Configuration
          </h1>
          <p className="text-muted-foreground mt-1">
            Customize alerts for critical business events
          </p>
        </div>
        {unacknowledgedCount > 0 && (
          <Badge variant="destructive" className="text-lg px-4 py-2">
            <AlertTriangle className="w-4 h-4 mr-2" />
            {unacknowledgedCount} Unacknowledged
          </Badge>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="configuration" data-testid="tab-configuration">
            <Settings className="w-4 h-4 mr-2" />
            Configuration
          </TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">
            <History className="w-4 h-4 mr-2" />
            Alert History
            {unacknowledgedCount > 0 && (
              <Badge variant="destructive" className="ml-2 h-5 min-w-5 text-xs">
                {unacknowledgedCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="configuration">
          <div className="grid md:grid-cols-2 gap-4">
            {configsLoading ? (
              <div className="col-span-full flex items-center justify-center h-32">
                <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : configurations.length > 0 ? (
              configurations.map((config) => {
                const typeConfig = ALERT_TYPE_CONFIG[config.alertType] || {
                  label: config.alertType,
                  icon: Bell,
                  description: 'Custom alert type',
                  thresholdLabel: 'Threshold',
                  thresholdUnit: '',
                };
                const TypeIcon = typeConfig.icon;
                const thresholdValue = Object.values(config.thresholds || {})[0] || 0;
                const thresholdKey = Object.keys(config.thresholds || {})[0] || 'threshold';

                return (
                  <Card key={config.id} className={`${!config.isEnabled ? 'opacity-60' : ''}`} data-testid={`alert-config-${config.alertType}`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${SEVERITY_COLORS[config.severity]}`}>
                            <TypeIcon className="w-5 h-5" />
                          </div>
                          <div>
                            <CardTitle className="text-base">{typeConfig.label}</CardTitle>
                            <CardDescription className="text-xs">{typeConfig.description}</CardDescription>
                          </div>
                        </div>
                        <Switch
                          checked={config.isEnabled}
                          onCheckedChange={(checked) => toggleAlertMutation.mutate({ alertType: config.alertType, isEnabled: checked })}
                          data-testid={`toggle-${config.alertType}`}
                        />
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{typeConfig.thresholdLabel}</span>
                        <Badge variant="outline">{thresholdValue} {typeConfig.thresholdUnit}</Badge>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Severity</span>
                        <Badge className={SEVERITY_COLORS[config.severity]}>{config.severity}</Badge>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Channels</span>
                        <div className="flex gap-1">
                          {config.channels.map((channel) => {
                            const ChannelIcon = CHANNEL_ICONS[channel] || Bell;
                            return (
                              <div key={channel} className="p-1 rounded bg-secondary" title={channel}>
                                <ChannelIcon className="w-3 h-3" />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Cooldown</span>
                        <span>{config.cooldownMinutes} min</span>
                      </div>
                    </CardContent>
                    <CardFooter className="gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex-1"
                        onClick={() => setEditingConfig(config)}
                        data-testid={`edit-${config.alertType}`}
                      >
                        <Settings className="w-4 h-4 mr-1" />
                        Configure
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => testAlertMutation.mutate(config.alertType)}
                        disabled={testAlertMutation.isPending || !config.isEnabled}
                        data-testid={`test-${config.alertType}`}
                      >
                        <TestTube className="w-4 h-4 mr-1" />
                        Test
                      </Button>
                    </CardFooter>
                  </Card>
                );
              })
            ) : (
              <div className="col-span-full flex flex-col items-center justify-center h-32 text-muted-foreground">
                <Bell className="w-8 h-8 mb-2 opacity-50" />
                <p>No alert configurations found</p>
                <p className="text-sm">Alert configurations will be created automatically</p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="w-5 h-5" />
                Alert History
              </CardTitle>
              <CardDescription>Recent alerts and their status</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                {historyLoading ? (
                  <div className="flex items-center justify-center h-32">
                    <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : history.length > 0 ? (
                  <div className="space-y-3">
                    {history.map((item) => {
                      const typeConfig = ALERT_TYPE_CONFIG[item.alertType] || { label: item.alertType, icon: Bell };
                      const TypeIcon = typeConfig.icon;
                      return (
                        <div 
                          key={item.id}
                          className={`flex items-start gap-4 p-4 rounded-lg border ${!item.isAcknowledged ? 'bg-destructive/5 border-destructive/20' : ''}`}
                          data-testid={`history-item-${item.id}`}
                        >
                          <div className={`p-2 rounded-lg ${SEVERITY_COLORS[item.severity]}`}>
                            <TypeIcon className="w-5 h-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium">{item.title}</span>
                              <Badge className={SEVERITY_COLORS[item.severity]} variant="secondary">
                                {item.severity}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">{item.message}</p>
                            <p className="text-xs text-muted-foreground mt-1">{formatTimeAgo(item.createdAt)}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {item.isAcknowledged ? (
                              <Badge variant="outline" className="text-green-600">
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Acknowledged
                              </Badge>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => acknowledgeAlertMutation.mutate(item.id)}
                                disabled={acknowledgeAlertMutation.isPending}
                                data-testid={`acknowledge-${item.id}`}
                              >
                                <CheckCircle className="w-4 h-4 mr-1" />
                                Acknowledge
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                    <CheckCircle className="w-8 h-8 mb-2 opacity-50" />
                    <p>No alerts in history</p>
                    <p className="text-sm">Alerts will appear here when triggered</p>
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {editingConfig && (
        <EditAlertDialog
          config={editingConfig}
          onClose={() => setEditingConfig(null)}
          onSave={(updated) => updateConfigMutation.mutate(updated)}
          isSaving={updateConfigMutation.isPending}
        />
      )}
    </div>
  );
}

interface EditAlertDialogProps {
  config: AlertConfiguration;
  onClose: () => void;
  onSave: (config: Partial<AlertConfiguration> & { id: string }) => void;
  isSaving: boolean;
}

function EditAlertDialog({ config, onClose, onSave, isSaving }: EditAlertDialogProps) {
  const typeConfig = ALERT_TYPE_CONFIG[config.alertType] || {
    label: config.alertType,
    thresholdLabel: 'Threshold',
    thresholdUnit: '',
  };
  
  const thresholdKey = Object.keys(config.thresholds || {})[0] || 'threshold';
  const [thresholdValue, setThresholdValue] = useState(Object.values(config.thresholds || {})[0] || 0);
  const [severity, setSeverity] = useState(config.severity);
  const [channels, setChannels] = useState<string[]>(config.channels);
  const [cooldownMinutes, setCooldownMinutes] = useState(config.cooldownMinutes);

  const toggleChannel = (channel: string) => {
    if (channels.includes(channel)) {
      setChannels(channels.filter(c => c !== channel));
    } else {
      setChannels([...channels, channel]);
    }
  };

  const handleSave = () => {
    onSave({
      id: config.id,
      thresholds: { [thresholdKey]: thresholdValue },
      severity,
      channels,
      cooldownMinutes,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <Card className="w-full max-w-md mx-4 animate-success-pop">
        <CardHeader>
          <CardTitle>Configure {typeConfig.label}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>{typeConfig.thresholdLabel} ({typeConfig.thresholdUnit})</Label>
            <div className="flex items-center gap-4">
              <Slider
                value={[thresholdValue]}
                onValueChange={(v) => setThresholdValue(v[0])}
                min={1}
                max={100}
                step={1}
                className="flex-1"
              />
              <Input
                type="number"
                value={thresholdValue}
                onChange={(e) => setThresholdValue(parseInt(e.target.value) || 0)}
                className="w-20"
                data-testid="input-threshold"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Severity</Label>
            <Select value={severity} onValueChange={(v) => setSeverity(v as any)}>
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
              {Object.entries(CHANNEL_ICONS).map(([channel, Icon]) => (
                <Button
                  key={channel}
                  variant={channels.includes(channel) ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => toggleChannel(channel)}
                  data-testid={`channel-${channel}`}
                >
                  <Icon className="w-4 h-4 mr-1" />
                  {channel.replace('_', ' ')}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Cooldown (minutes)</Label>
            <Input
              type="number"
              value={cooldownMinutes}
              onChange={(e) => setCooldownMinutes(parseInt(e.target.value) || 0)}
              data-testid="input-cooldown"
            />
            <p className="text-xs text-muted-foreground">Minimum time between repeated alerts</p>
          </div>
        </CardContent>
        <CardFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1" data-testid="button-cancel">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving} className="flex-1" data-testid="button-save">
            {isSaving ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save Changes
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
