/**
 * Broadcast Notification Adapter
 * Bridges UNS notifications with the BroadcastCard component
 * Fetches broadcast data by ID and renders the full BroadcastCard
 */

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BroadcastCard } from './BroadcastCard';
import type { Broadcast, BroadcastRecipient } from '@shared/types/broadcasts';

interface UNSNotification {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  isRead?: boolean;
  read?: boolean;
  type?: string;
  priority?: string;
  category?: string;
  actionType?: string;
  actionData?: Record<string, unknown>;
  actions?: Array<{ type: string; label: string; url?: string }>;
  metadata?: {
    broadcastId?: string;
    broadcastType?: string;
    [key: string]: unknown;
  };
}

interface BroadcastNotificationAdapterProps {
  notification: UNSNotification;
  onDismiss: () => void;
}

interface BroadcastDetailResponse {
  success: boolean;
  broadcast: Broadcast;
  recipient?: BroadcastRecipient;
}

export function BroadcastNotificationAdapter({ notification, onDismiss }: BroadcastNotificationAdapterProps) {
  const broadcastId = notification.metadata?.broadcastId;

  const { data, isLoading, error } = useQuery<BroadcastDetailResponse>({
    queryKey: ['/api/broadcasts', broadcastId],
    enabled: !!broadcastId,
  });

  if (!broadcastId) {
    return null;
  }

  if (isLoading) {
    return (
      <Card className="border border-blue-500" data-testid={`broadcast-card-loading-${notification.id}`}>
        <CardContent className="p-3">
          <div className="flex items-start gap-3">
            <Skeleton className="h-8 w-8 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data?.success || !data.broadcast) {
    return null;
  }

  return (
    <BroadcastCard
      broadcast={data.broadcast}
      recipient={data.recipient}
      onDismiss={onDismiss}
    />
  );
}
