import { secureFetch } from "@/lib/csrf";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Shield, Search, Filter, Download, Calendar, User, FileText, AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";

interface AuditLog {
  id: string;
  timestamp: string;
  actorType: 'END_USER' | 'SUPPORT_STAFF' | 'AI_AGENT' | 'SYSTEM';
  actorId: string;
  actorName: string;
  action: string;
  resourceType: string;
  resourceId: string;
  status: 'success' | 'failure' | 'warning';
  details: string;
  ipAddress?: string;
  userAgent?: string;
  verificationHash?: string;
}

export default function AuditLogs() {
  const [searchQuery, setSearchQuery] = useState("");
  const [actorFilter, setActorFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  const { data: auditLogs, isLoading } = useQuery<AuditLog[]>({
    queryKey: ['/api/governance/audit-logs', actorFilter, statusFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (actorFilter !== 'all') params.append('actorType', actorFilter);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      params.append('page', page.toString());
      params.append('limit', '50');
      const url = `/api/audit-logs?${params.toString()}`;
      const response = await secureFetch(url);
      if (!response.ok) throw new Error('Failed to fetch audit logs');
      return response.json();
    },
    enabled: true,
  });

  const getActorBadgeVariant = (actorType: string) => {
    switch (actorType) {
      case 'AI_AGENT': return 'default';
      case 'END_USER': return 'secondary';
      case 'SUPPORT_STAFF': return 'outline';
      case 'SYSTEM': return 'outline';
      default: return 'secondary';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />;
      case 'failure': return <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />;
      default: return <HelpCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'success': return 'default';
      case 'failure': return 'destructive';
      case 'warning': return 'outline';
      default: return 'secondary';
    }
  };

  const filteredLogs = auditLogs?.filter(log => {
    const matchesSearch = searchQuery === "" || 
      log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.actorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.details.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesActor = actorFilter === "all" || log.actorType === actorFilter;
    const matchesStatus = statusFilter === "all" || log.status === statusFilter;
    
    return matchesSearch && matchesActor && matchesStatus;
  });

  const pageConfig: CanvasPageConfig = {
    id: 'audit-logs',
    title: 'AI Compliance',
    subtitle: 'AI-powered compliance and activity tracking',
    category: 'admin',
    maxWidth: '7xl',
  };

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="text-xs font-medium">Total Actions</CardDescription>
            <CardTitle className="text-2xl" data-testid="stat-total-actions">{auditLogs?.length || 0}</CardTitle>
          </CardHeader>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="text-xs font-medium">AI Actions</CardDescription>
            <CardTitle className="text-2xl text-primary" data-testid="stat-ai-actions">
              {auditLogs?.filter(log => log.actorType === 'AI_AGENT').length || 0}
            </CardTitle>
          </CardHeader>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="text-xs font-medium">Success Rate</CardDescription>
            <CardTitle className="text-2xl text-green-600 dark:text-green-400" data-testid="stat-success-rate">
              {auditLogs && auditLogs.length > 0
                ? Math.round((auditLogs.filter(log => log.status === 'success').length / auditLogs.length) * 100)
                : 0}%
            </CardTitle>
          </CardHeader>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="text-xs font-medium">Warnings</CardDescription>
            <CardTitle className="text-2xl text-yellow-600 dark:text-yellow-400" data-testid="stat-warnings">
              {auditLogs?.filter(log => log.status === 'warning').length || 0}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg">Activity Log</CardTitle>
              <CardDescription className="text-sm">Complete audit trail with AI verification</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" data-testid="button-export-logs">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search activities..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search-logs"
              />
            </div>
            
            <Select value={actorFilter} onValueChange={setActorFilter}>
              <SelectTrigger className="w-full md:w-[180px]" data-testid="select-actor-filter">
                <SelectValue placeholder="Filter by actor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actors</SelectItem>
                <SelectItem value="AI_AGENT">AI Agent</SelectItem>
                <SelectItem value="END_USER">End User</SelectItem>
                <SelectItem value="SUPPORT_STAFF">Support Staff</SelectItem>
                <SelectItem value="SYSTEM">System</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-[180px]" data-testid="select-status-filter">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="failure">Failure</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            {isLoading ? (
              <div className="space-y-1">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="flex gap-4 py-3 border-b border-border animate-pulse">
                    <div className="h-4 bg-muted rounded w-32" />
                    <div className="h-4 bg-muted rounded flex-1" />
                    <div className="h-4 bg-muted rounded w-24" />
                  </div>
                ))}
              </div>
            ) : filteredLogs && filteredLogs.length > 0 ? (
              <>
                {filteredLogs.map((log) => (
                  <Card key={log.id} className="hover-elevate" data-testid={`audit-log-${log.id}`}>
                    <CardContent className="p-4">
                      <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                        <div className="flex-1 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={getActorBadgeVariant(log.actorType)} className="text-xs" data-testid={`badge-actor-${log.id}`}>
                              {log.actorType === 'AI_AGENT' && '🤖 '}
                              {log.actorType === 'END_USER' && '👤 '}
                              {log.actorType === 'SUPPORT_STAFF' && '🛟 '}
                              {log.actorType === 'SYSTEM' && '⚙️ '}
                              {log.actorType.replace('_', ' ')}
                            </Badge>
                            <Badge variant={getStatusBadgeVariant(log.status)} className="text-xs" data-testid={`badge-status-${log.id}`}>
                              {getStatusIcon(log.status)}
                              <span className="ml-1">{log.status.toUpperCase()}</span>
                            </Badge>
                            {log.verificationHash && (
                              <Badge variant="outline" className="text-xs" data-testid={`badge-verified-${log.id}`}>
                                <Shield className="h-3 w-3 mr-1" />
                                Verified
                              </Badge>
                            )}
                          </div>
                          
                          <div>
                            <p className="font-semibold text-sm text-foreground" data-testid={`text-action-${log.id}`}>{log.action}</p>
                            <p className="text-xs text-muted-foreground mt-1" data-testid={`text-details-${log.id}`}>{log.details}</p>
                          </div>
                          
                          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              <span data-testid={`text-actor-name-${log.id}`}>{log.actorName}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <FileText className="h-3 w-3" />
                              <span data-testid={`text-resource-${log.id}`}>{log.resourceType}: {log.resourceId}</span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex flex-col items-end gap-1 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span data-testid={`text-timestamp-${log.id}`}>{new Date(log.timestamp).toLocaleString()}</span>
                          </div>
                          {log.ipAddress && (
                            <span className="text-xs" data-testid={`text-ip-${log.id}`}>IP: {log.ipAddress}</span>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                
                <div className="flex items-center justify-between mt-6 px-2">
                  <div className="text-sm text-muted-foreground">
                    Page {page}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(prev => Math.max(1, prev - 1))}
                      disabled={page === 1}
                      data-testid="button-pagination-prev"
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(prev => prev + 1)}
                      disabled={filteredLogs.length < PAGE_SIZE}
                      data-testid="button-pagination-next"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <Card className="border-2 border-dashed">
                <CardContent className="p-12 text-center">
                  <Shield className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <h3 className="text-lg font-semibold mb-2">
                    {searchQuery || actorFilter !== "all" || statusFilter !== "all"
                      ? "No matching logs"
                      : "No audit logs yet"}
                  </h3>
                  <p className="text-muted-foreground">
                    {searchQuery || actorFilter !== "all" || statusFilter !== "all"
                      ? "Try adjusting your filters to find what you're looking for"
                      : "Activity will appear here as actions are performed in the system"}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </CardContent>
      </Card>
    </CanvasHubPage>
  );
}
