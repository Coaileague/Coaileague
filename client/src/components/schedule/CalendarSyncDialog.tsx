/**
 * Calendar Sync Dialog - Phase 5 Calendar Integration
 * Provides export, import, and subscription functionality for schedules
 */

import { secureFetch } from "@/lib/csrf";
import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { apiFetch, AnyResponse } from "@/lib/apiError";
import { useToast } from '@/hooks/use-toast';
import { UniversalModal, UniversalModalDescription, UniversalModalFooter, UniversalModalHeader, UniversalModalTitle, UniversalModalContent } from '@/components/ui/universal-modal';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Download,
  Upload,
  Link2,
  Calendar as CalendarIcon,
  Copy,
  Check,
  RefreshCw,
  Trash2,
  ExternalLink,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { SiGooglecalendar, SiApple } from 'react-icons/si';

interface CalendarSyncDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId?: string;
}

interface Subscription {
  id: string;
  name: string;
  subscriptionType: string;
  token: string;
  lastAccessedAt: string | null;
  accessCount: number;
  createdAt: string;
  urls: {
    icsUrl: string;
    webcalUrl: string;
    googleCalendarSubscribeUrl: string;
    outlookSubscribeUrl: string;
    appleCalendarUrl: string;
  };
}

export function CalendarSyncDialog({ open, onOpenChange, employeeId }: CalendarSyncDialogProps) {
  // V1.1 Feature Flag — calendar sync backend not yet deployed
  return (
    <div className="p-6 text-center space-y-3">
      <div className="text-3xl">📅</div>
      <p className="font-medium">Calendar Sync</p>
      <p className="text-sm text-muted-foreground">
        iCal import/export and calendar subscriptions launch in V1.1.
      </p>
      <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/10 text-amber-600 rounded-full text-xs font-medium border border-amber-500/20">
        Coming in V1.1
      </div>
    </div>
  );

  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('export');
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [conflictResolution, setConflictResolution] = useState<'skip' | 'overwrite' | 'merge'>('skip');
  const [includeTeamSchedule, setIncludeTeamSchedule] = useState(false);
  const [includePendingShifts, setIncludePendingShifts] = useState(true);

  const { data: calendarStatus } = useQuery({
    queryKey: ['/api/calendar/status'],
    enabled: open,
    queryFn: () => apiFetch('/api/calendar/status', AnyResponse),
  });

  const { data: subscriptionsData, isLoading: subscriptionsLoading } = useQuery<{
    success: boolean;
    subscriptions: Subscription[];
  }>({
    queryKey: ['/api/calendar/subscriptions'],
    enabled: open,
  });

  const subscriptions = subscriptionsData?.subscriptions || [];

  const createSubscriptionMutation = useMutation({
    mutationFn: async (data: { name: string; subscriptionType: string; includePendingShifts: boolean }) => {
      const res = await apiRequest('POST', '/api/calendar/subscriptions', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calendar/subscriptions'] });
      toast({
        title: 'Subscription created',
        description: 'Your calendar subscription URL has been generated',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to create subscription',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const revokeSubscriptionMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest('DELETE', `/api/calendar/subscriptions/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calendar/subscriptions'] });
      toast({
        title: 'Subscription revoked',
        description: 'The subscription has been deactivated',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to revoke subscription',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const regenerateTokenMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest('POST', `/api/calendar/subscriptions/${id}/regenerate`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calendar/subscriptions'] });
      toast({
        title: 'Token regenerated',
        description: 'Your subscription URL has been updated',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to regenerate token',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const importMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const res = await secureFetch('/api/calendar/import/ical', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Import failed');
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
      toast({
        title: 'Import completed',
        description: data.message || `Imported ${data.result?.eventsImported || 0} events`,
      });
      setUploadedFile(null);
    },
    onError: (error: any) => {
      toast({
        title: 'Import failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleExport = async (type: 'my' | 'team') => {
    try {
      const params = new URLSearchParams();
      if (type === 'team') {
        params.set('includeTeam', 'true');
      }
      params.set('includePending', includePendingShifts.toString());

      const response = await secureFetch(`/api/calendar/export/ical?${params.toString()}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Export failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `schedule-${new Date().toISOString().split('T')[0]}.ics`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: 'Export successful',
        description: 'Your schedule has been downloaded as an iCal file',
      });
    } catch (error: any) {
      toast({
        title: 'Export failed',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleCopyUrl = (url: string, type: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(type);
    setTimeout(() => setCopiedUrl(null), 2000);
    toast({
      title: 'URL copied',
      description: 'Calendar subscription URL copied to clipboard',
    });
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: 'File too large',
          description: 'Maximum file size is 5MB',
          variant: 'destructive',
        });
        return;
      }
      setUploadedFile(file);
    }
  };

  const handleImport = () => {
    if (!uploadedFile) return;

    const formData = new FormData();
    formData.append('file', uploadedFile);
    formData.append('conflictResolution', conflictResolution);

    importMutation.mutate(formData);
  };

  const handleCreateSubscription = () => {
    createSubscriptionMutation.mutate({
      name: 'My Work Schedule',
      subscriptionType: 'shifts',
      includePendingShifts,
    });
  };

  return (
    <UniversalModal open={open} onOpenChange={onOpenChange}>
      <UniversalModalContent size="xl" className="overflow-y-auto">
        <UniversalModalHeader>
          <UniversalModalTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-primary" />
            Calendar Sync
          </UniversalModalTitle>
          <UniversalModalDescription>
            Export, import, or subscribe to your work schedule
          </UniversalModalDescription>
        </UniversalModalHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="export" className="gap-2" data-testid="tab-calendar-export">
              <Download className="h-4 w-4" />
              Export
            </TabsTrigger>
            <TabsTrigger value="subscribe" className="gap-2" data-testid="tab-calendar-subscribe">
              <Link2 className="h-4 w-4" />
              Subscribe
            </TabsTrigger>
            <TabsTrigger value="import" className="gap-2" data-testid="tab-calendar-import">
              <Upload className="h-4 w-4" />
              Import
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[400px] mt-4">
            <TabsContent value="export" className="space-y-4 pr-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Download iCal File</CardTitle>
                  <CardDescription>
                    Export your schedule as an .ics file to import into any calendar app
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="include-pending">Include pending shifts</Label>
                    <Switch
                      id="include-pending"
                      checked={includePendingShifts}
                      onCheckedChange={setIncludePendingShifts}
                      data-testid="switch-include-pending"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Button
                      onClick={() => handleExport('my')}
                      className="gap-2"
                      data-testid="button-export-my-schedule"
                    >
                      <Download className="h-4 w-4" />
                      My Schedule
                    </Button>
                    <Button
                      onClick={() => handleExport('team')}
                      variant="outline"
                      className="gap-2"
                      data-testid="button-export-team-schedule"
                    >
                      <Download className="h-4 w-4" />
                      Team Schedule
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <SiGooglecalendar className="h-5 w-5 text-blue-500" />
                    Google Calendar via ICS
                  </CardTitle>
                  <CardDescription>
                    Subscribe to your schedule in Google Calendar using the ICS URL
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-sm text-muted-foreground">
                  <ol className="list-decimal pl-4 space-y-2">
                    <li>Click <strong>Subscribe</strong> in the <em>Subscribe</em> tab above and copy your ICS URL.</li>
                    <li>Open <strong>Google Calendar</strong> and click the <strong>+</strong> next to "Other calendars".</li>
                    <li>Choose <strong>From URL</strong> and paste your ICS URL.</li>
                    <li>Click <strong>Add calendar</strong>. Your schedule will appear and refresh automatically.</li>
                  </ol>
                  <p className="text-xs">Google Calendar checks for updates roughly every 12–24 hours. For real-time access, use the ICS export directly.</p>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="subscribe" className="space-y-4 pr-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Calendar Subscription</CardTitle>
                  <CardDescription>
                    Subscribe to your schedule for live updates in any calendar app
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {subscriptionsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : subscriptions.length === 0 ? (
                    <div className="text-center py-6">
                      <CalendarIcon className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                      <p className="text-sm text-muted-foreground mb-4">
                        No active subscriptions. Create one to sync with your calendar.
                      </p>
                      <Button
                        onClick={handleCreateSubscription}
                        disabled={createSubscriptionMutation.isPending}
                        className="gap-2"
                        data-testid="button-create-subscription"
                      >
                        {createSubscriptionMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Link2 className="h-4 w-4" />
                        )}
                        Create Subscription
                      </Button>
                    </div>
                  ) : (
                    subscriptions.map((sub) => (
                      <div key={sub.id} className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="font-medium">{sub.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {sub.accessCount} syncs • Created {new Date(sub.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => regenerateTokenMutation.mutate(sub.id)}
                              disabled={regenerateTokenMutation.isPending}
                              data-testid={`button-regenerate-${sub.id}`}
                              aria-label="Regenerate subscription token"
                            >
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => revokeSubscriptionMutation.mutate(sub.id)}
                              disabled={revokeSubscriptionMutation.isPending}
                              data-testid={`button-revoke-${sub.id}`}
                              aria-label="Revoke subscription"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Input
                              value={sub.urls.webcalUrl}
                              readOnly
                              className="text-xs font-mono"
                              data-testid={`input-webcal-url-${sub.id}`}
                            />
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => handleCopyUrl(sub.urls.webcalUrl, `webcal-${sub.id}`)}
                              data-testid={`button-copy-webcal-${sub.id}`}
                            >
                              {copiedUrl === `webcal-${sub.id}` ? (
                                <Check className="h-4 w-4 text-green-500" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </Button>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-2"
                              onClick={() => window.open(sub.urls.googleCalendarSubscribeUrl, '_blank')}
                              data-testid={`button-google-subscribe-${sub.id}`}
                            >
                              <SiGooglecalendar className="h-4 w-4" />
                              Google
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-2"
                              onClick={() => window.open(sub.urls.appleCalendarUrl)}
                              data-testid={`button-apple-subscribe-${sub.id}`}
                            >
                              <SiApple className="h-4 w-4" />
                              Apple
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-2"
                              onClick={() => window.open(sub.urls.outlookSubscribeUrl, '_blank')}
                              data-testid={`button-outlook-subscribe-${sub.id}`}
                            >
                              <ExternalLink className="h-4 w-4" />
                              Outlook
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="import" className="space-y-4 pr-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Import iCal File</CardTitle>
                  <CardDescription>
                    Upload an .ics file to create shifts from external calendar events
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="border-2 border-dashed rounded-lg p-6 text-center">
                    <input
                      type="file"
                      accept=".ics,.ical,text/calendar"
                      onChange={handleFileUpload}
                      className="hidden"
                      id="ical-upload"
                      data-testid="input-ical-upload"
                    />
                    <label
                      htmlFor="ical-upload"
                      className="cursor-pointer flex flex-col items-center gap-2"
                    >
                      <Upload className="h-8 w-8 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        Click to upload or drag and drop
                      </span>
                      <span className="text-xs text-muted-foreground">
                        .ics or .ical files up to 5MB
                      </span>
                    </label>
                  </div>

                  {uploadedFile && (
                    <div className="flex items-center justify-between gap-2 bg-muted/50 rounded-lg p-3">
                      <div className="flex items-center gap-2">
                        <CalendarIcon className="h-5 w-5 text-primary" />
                        <span className="text-sm font-medium">{uploadedFile.name}</span>
                        <Badge variant="secondary">
                          {(uploadedFile.size / 1024).toFixed(1)} KB
                        </Badge>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setUploadedFile(null)}
                        data-testid="button-remove-file"
                        aria-label="Remove uploaded file"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Conflict Resolution</Label>
                    <Select
                      value={conflictResolution}
                      onValueChange={(v) => setConflictResolution(v as any)}
                    >
                      <SelectTrigger data-testid="select-conflict-resolution">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="skip">Skip conflicting events</SelectItem>
                        <SelectItem value="overwrite">Overwrite existing shifts</SelectItem>
                        <SelectItem value="merge">Create alongside existing</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-start gap-2 text-sm text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3">
                    <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                    <p>
                      Imported events will be created as draft shifts assigned to your profile.
                      A manager will need to approve them.
                    </p>
                  </div>

                  <Button
                    onClick={handleImport}
                    disabled={!uploadedFile || importMutation.isPending}
                    className="w-full gap-2"
                    data-testid="button-import-calendar"
                  >
                    {importMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    Import Calendar
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </ScrollArea>
        </Tabs>

        <UniversalModalFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </UniversalModalFooter>
      </UniversalModalContent>
    </UniversalModal>
  );
}
