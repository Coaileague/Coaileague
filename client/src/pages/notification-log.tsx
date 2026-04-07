import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RefreshCw, Mail, MessageSquare, Bell, Smartphone, AlertTriangle, CheckCircle, Clock, XCircle, RotateCcw } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

type DeliveryStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'retrying' | 'permanently_failed' | 'delivered';
type DeliveryChannel = 'email' | 'sms' | 'websocket' | 'in_app';

interface NotificationDelivery {
  id: string;
  workspaceId: string;
  recipientUserId: string;
  notificationType: string;
  channel: DeliveryChannel;
  subject: string | null;
  status: DeliveryStatus;
  attemptCount: number;
  maxAttempts: number;
  lastError: string | null;
  scheduledAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
  nextRetryAt: string | null;
  createdAt: string;
}

const STATUS_CONFIG: Record<DeliveryStatus, { label: string; icon: typeof CheckCircle; color: string }> = {
  pending:            { label: 'Pending',           icon: Clock,         color: 'text-muted-foreground' },
  sending:            { label: 'Sending',            icon: RefreshCw,     color: 'text-blue-500' },
  sent:               { label: 'Sent',               icon: CheckCircle,   color: 'text-green-500' },
  failed:             { label: 'Failed',             icon: XCircle,       color: 'text-red-500' },
  retrying:           { label: 'Retrying',           icon: RotateCcw,     color: 'text-amber-500' },
  permanently_failed: { label: 'Permanently Failed', icon: AlertTriangle, color: 'text-red-700' },
  delivered:          { label: 'Delivered',          icon: CheckCircle,   color: 'text-green-600' },
};

const CHANNEL_ICONS: Record<DeliveryChannel, typeof Mail> = {
  email:     Mail,
  sms:       Smartphone,
  websocket: MessageSquare,
  in_app:    Bell,
};

function StatusBadge({ status }: { status: DeliveryStatus }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  const Icon = config.icon;
  const variant =
    status === 'sent' || status === 'delivered' ? 'default' :
    status === 'permanently_failed' || status === 'failed' ? 'destructive' :
    status === 'retrying' ? 'secondary' : 'outline';

  return (
    <Badge variant={variant} data-testid={`badge-status-${status}`} className="gap-1">
      <Icon className="w-3 h-3" />
      {config.label}
    </Badge>
  );
}

function ChannelBadge({ channel }: { channel: DeliveryChannel }) {
  const Icon = CHANNEL_ICONS[channel] ?? Bell;
  return (
    <Badge variant="outline" data-testid={`badge-channel-${channel}`} className="gap-1 capitalize">
      <Icon className="w-3 h-3" />
      {channel}
    </Badge>
  );
}

function DeliveryRow({ delivery }: { delivery: NotificationDelivery }) {
  return (
    <div
      className="flex flex-col gap-2 p-4 border-b last:border-b-0"
      data-testid={`row-delivery-${delivery.id}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1 min-w-0">
          <span
            data-testid={`text-type-${delivery.id}`}
            className="font-medium text-sm truncate"
          >
            {delivery.notificationType.replace(/_/g, ' ')}
          </span>
          {delivery.subject && (
            <span className="text-xs text-muted-foreground truncate">
              {delivery.subject}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1 shrink-0">
          <ChannelBadge channel={delivery.channel} />
          <StatusBadge status={delivery.status} />
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span data-testid={`text-attempts-${delivery.id}`}>
          Attempts: {delivery.attemptCount}/{delivery.maxAttempts}
        </span>
        <span data-testid={`text-created-${delivery.id}`}>
          Created: {formatDistanceToNow(new Date(delivery.createdAt), { addSuffix: true })}
        </span>
        {delivery.sentAt && (
          <span data-testid={`text-sent-${delivery.id}`}>
            Sent: {format(new Date(delivery.sentAt), 'MMM d, HH:mm')}
          </span>
        )}
        {delivery.nextRetryAt && delivery.status === 'retrying' && (
          <span className="text-amber-600" data-testid={`text-retry-${delivery.id}`}>
            Next retry: {formatDistanceToNow(new Date(delivery.nextRetryAt), { addSuffix: true })}
          </span>
        )}
      </div>

      {delivery.lastError && (
        <div
          className="text-xs text-destructive bg-destructive/10 rounded-md px-2 py-1 font-mono"
          data-testid={`text-error-${delivery.id}`}
        >
          {delivery.lastError}
        </div>
      )}
    </div>
  );
}

function DeliveryRowSkeleton() {
  return (
    <div className="flex flex-col gap-2 p-4 border-b">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1 flex-1">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-56" />
        </div>
        <div className="flex gap-1">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-16" />
        </div>
      </div>
      <div className="flex gap-4">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-28" />
      </div>
    </div>
  );
}

export default function NotificationLog() {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [page, setPage] = useState(1);

  const params = new URLSearchParams();
  if (statusFilter !== 'all') params.set('status', statusFilter);
  if (channelFilter !== 'all') params.set('channel', channelFilter);
  params.set('page', String(page));
  params.set('limit', '50');

  const { data, isLoading, isFetching, refetch } = useQuery<{
    data: NotificationDelivery[];
    page: number;
    limit: number;
  }>({
    queryKey: ['/api/notifications/log', statusFilter, channelFilter, page],
    refetchInterval: 30_000,
  });

  const deliveries = data?.data ?? [];

  const statusCounts = deliveries.reduce<Record<string, number>>((acc, d) => {
    acc[d.status] = (acc[d.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
        <div>
          <h1 className="text-2xl font-bold" data-testid="heading-notification-log">
            Notification Delivery Log
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track every outbound notification — email, SMS, WebSocket, and in-app.
          </p>
        </div>
        <Button
          size="default"
          variant="outline"
          onClick={() => refetch()}
          disabled={isFetching}
          data-testid="button-refresh-log"
          className="gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Summary Stats */}
      {!isLoading && deliveries.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {Object.entries(statusCounts).map(([status, count]) => (
            <Badge
              key={status}
              variant={status === 'permanently_failed' || status === 'failed' ? 'destructive' : 'secondary'}
              data-testid={`stat-${status}`}
              className="gap-1 cursor-pointer"
              onClick={() => setStatusFilter(status === statusFilter ? 'all' : status)}
            >
              {STATUS_CONFIG[status as DeliveryStatus]?.label ?? status}: {count}
            </Badge>
          ))}
        </div>
      )}

      {/* Filters */}
      <Card className="mb-4">
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground font-medium">Status</label>
              <Select
                value={statusFilter}
                onValueChange={v => { setStatusFilter(v); setPage(1); }}
              >
                <SelectTrigger className="w-40" data-testid="select-status-filter">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="sending">Sending</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="retrying">Retrying</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="permanently_failed">Permanently Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground font-medium">Channel</label>
              <Select
                value={channelFilter}
                onValueChange={v => { setChannelFilter(v); setPage(1); }}
              >
                <SelectTrigger className="w-36" data-testid="select-channel-filter">
                  <SelectValue placeholder="All channels" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All channels</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="websocket">WebSocket</SelectItem>
                  <SelectItem value="in_app">In-App</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Log Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {isLoading ? (
              <Skeleton className="h-5 w-32" />
            ) : (
              `${deliveries.length} notification${deliveries.length !== 1 ? 's' : ''}`
            )}
          </CardTitle>
          <CardDescription>Sorted newest first. Auto-refreshes every 30 seconds.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[600px]">
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => <DeliveryRowSkeleton key={i} />)
            ) : deliveries.length === 0 ? (
              <div
                className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3"
                data-testid="text-empty-state"
              >
                <Bell className="w-10 h-10 opacity-30" />
                <p className="text-sm">No notifications yet.</p>
                <p className="text-xs">Notifications will appear here once the system sends them.</p>
              </div>
            ) : (
              deliveries.map(d => <DeliveryRow key={d.id} delivery={d} />)
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Pagination */}
      {!isLoading && deliveries.length >= 50 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <Button
            variant="outline"
            size="default"
            disabled={page === 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            data-testid="button-prev-page"
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground" data-testid="text-page">
            Page {page}
          </span>
          <Button
            variant="outline"
            size="default"
            onClick={() => setPage(p => p + 1)}
            data-testid="button-next-page"
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
