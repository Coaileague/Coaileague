/**
 * QuickBooks Compliance Panel for Trinity Guru Mode
 * 
 * Displays real-time QuickBooks API compliance telemetry:
 * - Rate Limit Visualizer (Bucket Fill Gauge)
 * - Token Health Badge
 * - Quota Warning Alerts
 * - Audit Log Link
 */

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Gauge,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Activity,
  Database,
  Clock,
  Zap,
  FileText,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

interface RateLimitData {
  realmId: string;
  tokensRemaining: number;
  maxTokens: number;
  usagePercent: number;
  concurrentRequests: number;
  isThrottled: boolean;
  requestsLastMinute: number;
}

interface TokenDaemonStatus {
  isRunning: boolean;
  cachedCredentials: number;
  health: 'healthy' | 'stopped' | 'degraded';
}

interface CredentialHealth {
  realmId: string;
  isHealthy: boolean;
  expiresAt: string;
  failedAttempts: number;
  lastRefreshed: string;
}

interface TelemetryData {
  rateLimits: RateLimitData[];
  tokenDaemon: TokenDaemonStatus;
  credentialsHealth: CredentialHealth[];
  recentUsage: any[];
  summary: {
    activeRealms: number;
    healthScore: number;
    throttledRealms: number;
    totalRequestsLastHour: number;
  };
}

interface UsageLog {
  id: string;
  realmId: string;
  workspaceId: string;
  requestCount: number;
  periodStart: string;
}

function BucketFillGauge({ data }: { data: RateLimitData }) {
  const fillPercent = data.usagePercent;
  const isWarning = fillPercent >= 75;
  const isCritical = fillPercent >= 90 || data.isThrottled;
  
  const fillColor = isCritical 
    ? 'bg-red-500' 
    : isWarning 
      ? 'bg-yellow-500' 
      : 'bg-emerald-500';
  
  const borderColor = isCritical 
    ? 'border-red-500/50' 
    : isWarning 
      ? 'border-yellow-500/50' 
      : 'border-emerald-500/50';

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700">
      <div className="relative w-12 h-16 rounded-lg border-2 border-slate-600 overflow-hidden bg-slate-900">
        <div 
          className={`absolute bottom-0 left-0 right-0 transition-all duration-500 ${fillColor}`}
          style={{ height: `${fillPercent}%` }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-bold text-white drop-shadow-lg">
            {Math.round(fillPercent)}%
          </span>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-300 truncate">
            Realm: {data.realmId.slice(0, 12)}...
          </span>
          {data.isThrottled && (
            <Badge variant="destructive" className="text-xs">
              Throttled
            </Badge>
          )}
        </div>
        <div className="text-xs text-slate-400 mt-1">
          {data.tokensRemaining}/{data.maxTokens} tokens remaining
        </div>
        <div className="text-xs text-slate-500">
          {data.requestsLastMinute} req/min | {data.concurrentRequests} concurrent
        </div>
      </div>
    </div>
  );
}

function TokenHealthBadge({ status }: { status: TokenDaemonStatus }) {
  const isHealthy = status.isRunning && status.health === 'healthy';
  
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700">
      {isHealthy ? (
        <div className="relative">
          <RefreshCw className="w-5 h-5 text-emerald-400 animate-spin" style={{ animationDuration: '3s' }} />
          <div className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-400 rounded-full" />
        </div>
      ) : (
        <div className="relative">
          <RefreshCw className="w-5 h-5 text-red-400" />
          <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-400 rounded-full" />
        </div>
      )}
      <div className="flex-1">
        <div className="text-sm font-medium text-slate-300">
          Token Refresh Daemon
        </div>
        <div className="text-xs text-slate-400">
          {isHealthy ? 'Active' : 'Stopped'} | {status.cachedCredentials} cached
        </div>
      </div>
      <Badge 
        variant={isHealthy ? "default" : "destructive"}
        className="text-xs"
        data-testid="badge-token-health"
      >
        {isHealthy ? 'Healthy' : 'Unhealthy'}
      </Badge>
    </div>
  );
}

export function QuickBooksCompliancePanel() {
  const { toast } = useToast();
  const [selectedRealm, setSelectedRealm] = useState<string | null>(null);
  const [showUsageLogs, setShowUsageLogs] = useState(false);
  
  const { data: telemetry, isLoading, refetch } = useQuery<{ success: boolean; telemetry: TelemetryData }>({
    queryKey: ['/api/integrations/quickbooks/compliance-telemetry'],
    refetchInterval: 15000,
  });
  
  const { data: usageLogs } = useQuery<{ success: boolean; logs: UsageLog[] }>({
    queryKey: ['/api/integrations/quickbooks/usage-logs', selectedRealm],
    enabled: !!selectedRealm && showUsageLogs,
  });
  
  useEffect(() => {
    if (telemetry?.telemetry) {
      const { rateLimits } = telemetry.telemetry;
      const criticalRealms = rateLimits.filter(r => r.usagePercent >= 90 || r.isThrottled);
      
      if (criticalRealms.length > 0) {
        toast({
          title: "QuickBooks Quota Warning",
          description: `${criticalRealms.length} realm(s) approaching rate limit. Proactive outreach recommended.`,
          variant: "destructive",
        });
      }
    }
  }, [telemetry?.telemetry?.rateLimits]);
  
  if (isLoading) {
    return (
      <Card className="bg-slate-900/50 border-slate-700">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-slate-300">
            <Gauge className="w-4 h-4" />
            QuickBooks Compliance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-32 text-slate-400">
            <Activity className="w-5 h-5 animate-pulse mr-2" />
            Loading telemetry...
          </div>
        </CardContent>
      </Card>
    );
  }
  
  const data = telemetry?.telemetry;
  
  if (!data) {
    return (
      <Card className="bg-slate-900/50 border-slate-700">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-slate-300">
            <Gauge className="w-4 h-4" />
            QuickBooks Compliance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-slate-400 py-4">
            No QuickBooks connections active
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="bg-slate-900/50 border-slate-700" data-testid="card-qb-compliance">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2 text-slate-300">
              <Gauge className="w-4 h-4 text-cyan-400" />
              QuickBooks Compliance Telemetry
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge 
                variant={data.summary.healthScore >= 80 ? "default" : data.summary.healthScore >= 50 ? "secondary" : "destructive"}
                data-testid="badge-health-score"
              >
                Health: {data.summary.healthScore}%
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-slate-400 hover:text-white"
                onClick={() => refetch()}
                data-testid="button-refresh-telemetry"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-4 gap-3 text-center">
            <div className="p-2 rounded-lg bg-slate-800/30">
              <div className="text-lg font-bold text-cyan-400" data-testid="text-active-realms">
                {data.summary.activeRealms}
              </div>
              <div className="text-xs text-slate-400">Active Realms</div>
            </div>
            <div className="p-2 rounded-lg bg-slate-800/30">
              <div className="text-lg font-bold text-emerald-400" data-testid="text-requests-hour">
                {data.summary.totalRequestsLastHour}
              </div>
              <div className="text-xs text-slate-400">Req/Hour</div>
            </div>
            <div className="p-2 rounded-lg bg-slate-800/30">
              <div className={`text-lg font-bold ${data.summary.throttledRealms > 0 ? 'text-red-400' : 'text-emerald-400'}`} data-testid="text-throttled">
                {data.summary.throttledRealms}
              </div>
              <div className="text-xs text-slate-400">Throttled</div>
            </div>
            <div className="p-2 rounded-lg bg-slate-800/30">
              <div className="text-lg font-bold text-purple-400" data-testid="text-cached-creds">
                {data.tokenDaemon.cachedCredentials}
              </div>
              <div className="text-xs text-slate-400">Cached Creds</div>
            </div>
          </div>
          
          <TokenHealthBadge status={data.tokenDaemon} />
          
          {data.rateLimits.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                  Rate Limit Buckets
                </span>
              </div>
              <ScrollArea className="h-[140px]">
                <div className="space-y-2">
                  {data.rateLimits.map((limit) => (
                    <div 
                      key={limit.realmId}
                      onClick={() => {
                        setSelectedRealm(limit.realmId);
                        setShowUsageLogs(true);
                      }}
                      className="cursor-pointer hover:opacity-80 transition-opacity"
                    >
                      <BucketFillGauge data={limit} />
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          ) : (
            <div className="text-center text-slate-500 py-4 text-sm">
              No active rate limit buckets
            </div>
          )}
          
          {data.credentialsHealth.length > 0 && (
            <div className="space-y-2">
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                Credential Health
              </span>
              <div className="space-y-1">
                {data.credentialsHealth.map((cred) => (
                  <div 
                    key={cred.realmId}
                    className="flex items-center justify-between p-2 rounded bg-slate-800/30"
                  >
                    <div className="flex items-center gap-2">
                      {cred.isHealthy ? (
                        <CheckCircle className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-400" />
                      )}
                      <span className="text-sm text-slate-300 font-mono">
                        {cred.realmId.slice(0, 12)}...
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {cred.failedAttempts > 0 && (
                        <Badge variant="destructive" className="text-xs">
                          {cred.failedAttempts} failures
                        </Badge>
                      )}
                      <span className="text-xs text-slate-400">
                        Refreshed {formatDistanceToNow(new Date(cred.lastRefreshed))} ago
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-slate-400 hover:text-white"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedRealm(cred.realmId);
                          setShowUsageLogs(true);
                        }}
                        data-testid={`button-view-logs-${cred.realmId}`}
                      >
                        <FileText className="w-3 h-3 mr-1" />
                        Logs
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      
      <Dialog open={showUsageLogs} onOpenChange={setShowUsageLogs}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-100">
              <Database className="w-5 h-5 text-cyan-400" />
              API Usage Logs - Realm {selectedRealm?.slice(0, 12)}...
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Detailed QuickBooks API usage history for compliance audit
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="h-[400px]">
            {usageLogs?.logs && usageLogs.logs.length > 0 ? (
              <div className="space-y-2">
                {usageLogs.logs.map((log: UsageLog) => (
                  <div 
                    key={log.id}
                    className="p-3 rounded-lg bg-slate-800/50 border border-slate-700"
                    data-testid={`usage-log-${log.id}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-yellow-400" />
                        <span className="text-sm font-medium text-slate-300">
                          {log.requestCount} requests
                        </span>
                      </div>
                      <span className="text-xs text-slate-400">
                        <Clock className="w-3 h-3 inline mr-1" />
                        {formatDistanceToNow(new Date(log.periodStart))} ago
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500 font-mono">
                      Workspace: {log.workspaceId}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-32 text-slate-400">
                No usage logs found for this realm
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
