import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  RefreshCw,
  ArrowRight,
  Filter,
  Search,
  XCircle,
  Loader2,
  AlertCircle,
  Zap,
  Users,
  DollarSign,
  Link2,
  Shield
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

interface Exception {
  id: string;
  workspaceId: string;
  errorType: string;
  errorCode?: string;
  errorMessage: string;
  sourceWorkflow?: string;
  sourceCycleKey?: string;
  sourceEntityType?: string;
  sourceEntityId?: string;
  recommendedAction: string;
  status: string;
  priority?: string;
  retryCount: number;
  maxRetries: number;
  createdAt: string;
  resolvedAt?: string;
  resolutionNotes?: string;
}

interface QueueStats {
  total: number;
  pending: number;
  inReview: number;
  resolved: number;
  escalated: number;
  byType: Record<string, number>;
  avgAgeHours: number;
}

interface AutomationHealth {
  status: 'GREEN' | 'YELLOW' | 'RED';
  pendingExceptions: number;
  autopilotEnabled: boolean;
  lastSyncStatus: string;
  tokenHealth: 'valid' | 'expiring_soon' | 'expired';
  mappingCoverage: number;
  message: string;
}

const ERROR_TYPE_ICONS: Record<string, any> = {
  mapping_ambiguous: Users,
  mapping_missing: Link2,
  amount_spike: DollarSign,
  rate_mismatch: DollarSign,
  token_expired: Shield,
  new_client: Users,
  validation_error: AlertCircle,
  api_error: Zap,
};

const ERROR_TYPE_LABELS: Record<string, string> = {
  mapping_ambiguous: 'Ambiguous Match',
  mapping_missing: 'Missing Mapping',
  amount_spike: 'Amount Spike',
  rate_mismatch: 'Rate Mismatch',
  token_expired: 'Token Expired',
  new_client: 'New Client',
  validation_error: 'Validation Error',
  api_error: 'API Error',
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-blue-500',
};

export default function ResolutionInboxPage() {
  const { toast } = useToast();
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selectedException, setSelectedException] = useState<Exception | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');

  const { data: healthData, isLoading: healthLoading } = useQuery<AutomationHealth>({
    queryKey: ['/api/quickbooks/automation-health'],
    refetchInterval: 30000,
  });

  const { data: statsData, isLoading: statsLoading } = useQuery<QueueStats>({
    queryKey: ['/api/exceptions/stats'],
  });

  const { data: exceptions, isLoading: exceptionsLoading, refetch } = useQuery<Exception[]>({
    queryKey: ['/api/exceptions', filter],
    queryFn: async () => {
      const response = await fetch(`/api/exceptions?filter=${encodeURIComponent(filter)}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch exceptions');
      return response.json();
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ id, action, notes }: { id: string; action: string; notes: string }) => {
      return apiRequest(`/api/exceptions/${id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ action, notes }),
      });
    },
    onSuccess: () => {
      toast({ title: 'Exception resolved', description: 'The exception has been marked as resolved.' });
      queryClient.invalidateQueries({ queryKey: ['/api/exceptions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/exceptions/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/quickbooks/automation-health'] });
      setSelectedException(null);
      setResolutionNotes('');
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to resolve exception.', variant: 'destructive' });
    },
  });

  const retryMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/exceptions/${id}/retry`, { method: 'POST' });
    },
    onSuccess: () => {
      toast({ title: 'Retry scheduled', description: 'The operation will be retried.' });
      queryClient.invalidateQueries({ queryKey: ['/api/exceptions'] });
    },
  });

  const filteredExceptions = exceptions?.filter(e => {
    if (filter !== 'all' && e.status !== filter) return false;
    if (search && !e.errorMessage.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }) || [];

  const getAgeDisplay = (createdAt: string) => {
    const hours = Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60));
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl" data-testid="page-resolution-inbox">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Resolution Inbox</h1>
          <p className="text-muted-foreground">
            Manage exceptions and ensure automation health
          </p>
        </div>
        <Button onClick={() => refetch()} variant="outline" data-testid="button-refresh">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      <Card className="mb-6" data-testid="card-automation-health">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Go-Live Confidence Check
          </CardTitle>
          <CardDescription>
            Automation health status for QuickBooks integration
          </CardDescription>
        </CardHeader>
        <CardContent>
          {healthLoading ? (
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Checking automation health...</span>
            </div>
          ) : healthData ? (
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                <div className={`w-4 h-4 rounded-full ${
                  healthData.status === 'GREEN' ? 'bg-green-500' :
                  healthData.status === 'YELLOW' ? 'bg-yellow-500' : 'bg-red-500'
                }`} data-testid="status-health-indicator" />
                <span className="font-semibold text-lg" data-testid="text-health-status">
                  {healthData.status}
                </span>
              </div>
              <div className="text-sm text-muted-foreground">
                {healthData.message}
              </div>
              <div className="flex gap-4 ml-auto text-sm">
                <div>
                  <span className="text-muted-foreground">Pending: </span>
                  <span className="font-medium" data-testid="text-pending-count">{healthData.pendingExceptions}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Coverage: </span>
                  <span className="font-medium">{healthData.mappingCoverage}%</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Token: </span>
                  <Badge variant={healthData.tokenHealth === 'valid' ? 'default' : 'destructive'}>
                    {healthData.tokenHealth}
                  </Badge>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-muted-foreground">No health data available</div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card data-testid="card-stat-pending">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold">{statsData?.pending || 0}</p>
              </div>
              <Clock className="w-8 h-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-stat-in-review">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">In Review</p>
                <p className="text-2xl font-bold">{statsData?.inReview || 0}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-stat-resolved">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Resolved</p>
                <p className="text-2xl font-bold">{statsData?.resolved || 0}</p>
              </div>
              <CheckCircle2 className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-stat-escalated">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Escalated</p>
                <p className="text-2xl font-bold">{statsData?.escalated || 0}</p>
              </div>
              <XCircle className="w-8 h-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle>Exception Queue</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search exceptions..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 w-64"
                  data-testid="input-search"
                />
              </div>
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="w-36" data-testid="select-filter">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_review">In Review</SelectItem>
                  <SelectItem value="escalated">Escalated</SelectItem>
                  <SelectItem value="auto_resolved">Auto Resolved</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {exceptionsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : filteredExceptions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-green-500" />
              <p className="font-medium">All clear!</p>
              <p className="text-sm">No exceptions require attention.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredExceptions.map((exception) => {
                const Icon = ERROR_TYPE_ICONS[exception.errorType] || AlertCircle;
                return (
                  <div
                    key={exception.id}
                    className="flex items-center gap-4 p-4 border rounded-lg hover-elevate cursor-pointer"
                    onClick={() => setSelectedException(exception)}
                    data-testid={`exception-row-${exception.id}`}
                  >
                    <div className={`w-2 h-2 rounded-full ${PRIORITY_COLORS[exception.priority || 'medium']}`} />
                    <Icon className="w-5 h-5 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">
                          {ERROR_TYPE_LABELS[exception.errorType] || exception.errorType}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {exception.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {exception.errorMessage}
                      </p>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {getAgeDisplay(exception.createdAt)}
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedException} onOpenChange={() => setSelectedException(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedException && ERROR_TYPE_ICONS[selectedException.errorType] && (
                (() => {
                  const Icon = ERROR_TYPE_ICONS[selectedException.errorType];
                  return <Icon className="w-5 h-5" />;
                })()
              )}
              {selectedException && (ERROR_TYPE_LABELS[selectedException.errorType] || selectedException.errorType)}
            </DialogTitle>
            <DialogDescription>
              Review and resolve this exception
            </DialogDescription>
          </DialogHeader>
          
          {selectedException && (
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm font-medium mb-1">Error Message</p>
                <p className="text-sm">{selectedException.errorMessage}</p>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Status: </span>
                  <Badge>{selectedException.status}</Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">Retries: </span>
                  {selectedException.retryCount}/{selectedException.maxRetries}
                </div>
                <div>
                  <span className="text-muted-foreground">Source: </span>
                  {selectedException.sourceWorkflow || 'Unknown'}
                </div>
                <div>
                  <span className="text-muted-foreground">Age: </span>
                  {getAgeDisplay(selectedException.createdAt)}
                </div>
              </div>

              <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                <p className="text-sm font-medium mb-1 text-blue-700 dark:text-blue-300">
                  Recommended Action
                </p>
                <p className="text-sm text-blue-600 dark:text-blue-400">
                  {selectedException.recommendedAction}
                </p>
              </div>

              <div>
                <label className="text-sm font-medium">Resolution Notes</label>
                <Textarea
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  placeholder="Add notes about how this was resolved..."
                  className="mt-1"
                  data-testid="textarea-resolution-notes"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                if (selectedException) {
                  retryMutation.mutate(selectedException.id);
                }
              }}
              disabled={retryMutation.isPending}
              data-testid="button-retry"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
            <Button
              onClick={() => {
                if (selectedException) {
                  resolveMutation.mutate({
                    id: selectedException.id,
                    action: 'manual_resolve',
                    notes: resolutionNotes,
                  });
                }
              }}
              disabled={resolveMutation.isPending}
              data-testid="button-resolve"
            >
              {resolveMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4 mr-2" />
              )}
              Mark Resolved
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
