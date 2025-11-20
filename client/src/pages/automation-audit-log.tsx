/**
 * Automation Audit Log - View history of all AI Brain automation runs
 */

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileText, Calendar, DollarSign, Users, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { format } from 'date-fns';
import type { AuditEvent } from '@shared/schema';

export default function AutomationAuditLog() {
  // Fetch automation-related audit events
  const { data: events = [], isLoading } = useQuery<AuditEvent[]>({
    queryKey: ['/api/audit-events/automation'],
    queryFn: async () => {
      // Placeholder: In production, this would fetch filtered audit events
      // For now, return empty array
      return [];
    },
  });

  const getEventIcon = (eventType: string) => {
    if (eventType.includes('schedule')) return <Calendar className="h-4 w-4" />;
    if (eventType.includes('invoice')) return <FileText className="h-4 w-4" />;
    if (eventType.includes('payroll')) return <DollarSign className="h-4 w-4" />;
    if (eventType.includes('compliance')) return <AlertCircle className="h-4 w-4" />;
    return <Clock className="h-4 w-4" />;
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case 'committed':
        return <Badge className="bg-green-500/10 text-green-700 dark:text-green-400">Success</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      case 'pending':
        return <Badge variant="secondary">Pending</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  return (
    <div className="container max-w-6xl py-8 space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <FileText className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Automation Audit Log</h1>
          <p className="text-muted-foreground">Complete history of all AI Brain automation runs and results</p>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-primary" />
              <div>
                <div className="text-2xl font-bold">0</div>
                <div className="text-xs text-muted-foreground">Schedules Generated</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-primary" />
              <div>
                <div className="text-2xl font-bold">0</div>
                <div className="text-xs text-muted-foreground">Invoices Created</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <DollarSign className="h-5 w-5 text-primary" />
              <div>
                <div className="text-2xl font-bold">0</div>
                <div className="text-xs text-muted-foreground">Payroll Runs</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-primary" />
              <div>
                <div className="text-2xl font-bold">0</div>
                <div className="text-xs text-muted-foreground">Compliance Scans</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Audit Events List */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Automation Events</CardTitle>
          <CardDescription>All AI Brain actions with timestamps, actors, and results</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px]">
            {isLoading ? (
              <div className="text-center py-12 text-muted-foreground">Loading audit log...</div>
            ) : events.length === 0 ? (
              <div className="text-center py-12 space-y-3">
                <CheckCircle className="h-12 w-12 mx-auto text-muted-foreground opacity-30" />
                <div className="text-muted-foreground">
                  No automation events yet. Run your first automation from the Automation Control Panel.
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {events.map((event) => (
                  <div
                    key={event.id}
                    className="p-4 border rounded-lg hover-elevate active-elevate-2 cursor-pointer"
                    data-testid={`audit-event-${event.id}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="mt-0.5 text-primary">
                          {getEventIcon(event.eventType)}
                        </div>
                        <div className="flex-1">
                          <div className="font-medium">{event.eventType}</div>
                          {event.actorName && (
                            <div className="text-sm text-muted-foreground">
                              by {event.actorName} ({event.actorType})
                            </div>
                          )}
                          <div className="text-xs text-muted-foreground mt-1">
                            {format(new Date(event.timestamp), 'PPp')}
                          </div>
                        </div>
                      </div>
                      <div className="flex-shrink-0">
                        {getStatusBadge(event.status)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
