/**
 * Broadcast Card
 * Renders a broadcast notification in the notification hub
 * Handles different types, priorities, and actions
 */

import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  X, ExternalLink, CheckCircle, MessageSquare, AlertTriangle,
  Megaphone, Sparkles, FileText, PartyPopper, Settings, Clipboard,
  CloudRain, Wrench, Pin, User
} from 'lucide-react';
import { useMarkBroadcastRead, useAcknowledgeBroadcast, useDismissBroadcast } from '@/hooks/useBroadcasts';
import { BroadcastFeedbackForm } from './BroadcastFeedbackForm';
import { cn } from '@/lib/utils';
import type { Broadcast, BroadcastRecipient, BroadcastType, BroadcastPriority } from '@shared/types/broadcasts';

// ============================================
// TYPE ICONS
// ============================================

// @ts-expect-error — TS migration: fix in refactoring sprint
const TYPE_ICONS: Record<BroadcastType, React.ReactNode> = {
  announcement: <Megaphone className="h-5 w-5" />,
  alert: <AlertTriangle className="h-5 w-5" />,
  system_notice: <Settings className="h-5 w-5" />,
  feature_release: <Sparkles className="h-5 w-5" />,
  feedback_request: <MessageSquare className="h-5 w-5" />,
  pass_down: <Clipboard className="h-5 w-5" />,
  policy_update: <FileText className="h-5 w-5" />,
  celebration: <PartyPopper className="h-5 w-5" />,
};

// @ts-expect-error — TS migration: fix in refactoring sprint
const TYPE_COLORS: Record<BroadcastType, string> = {
  announcement: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  alert: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
  system_notice: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  feature_release: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
  feedback_request: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
  pass_down: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
  policy_update: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400',
  celebration: 'bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400',
};

const PRIORITY_STYLES: Record<BroadcastPriority, { border: string; bg: string }> = {
  critical: { border: 'border border-red-500', bg: 'bg-red-50/50 dark:bg-red-950/20' },
  high: { border: 'border border-orange-500', bg: '' },
  normal: { border: 'border border-blue-500', bg: '' },
  low: { border: 'border border-gray-300', bg: '' },
};

// ============================================
// MAIN COMPONENT
// ============================================

interface BroadcastCardProps {
  broadcast: Broadcast;
  recipient?: BroadcastRecipient;
  onDismiss?: () => void;
}

export function BroadcastCard({ broadcast, recipient, onDismiss }: BroadcastCardProps) {
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const markRead = useMarkBroadcastRead();
  const acknowledge = useAcknowledgeBroadcast();
  const dismiss = useDismissBroadcast();

  const isRead = !!recipient?.readAt;
  const isAcknowledged = !!recipient?.acknowledgedAt;
  const isCritical = broadcast.priority === 'critical';
  const canDismiss = !isCritical && !isAcknowledged;

  const priorityStyles = PRIORITY_STYLES[broadcast.priority] ?? PRIORITY_STYLES['normal'];
  const typeIcon = TYPE_ICONS[broadcast.type] ?? TYPE_ICONS['announcement'];
  const typeColor = TYPE_COLORS[broadcast.type] ?? TYPE_COLORS['announcement'];

  // Mark as read when card is viewed
  const handleCardClick = () => {
    if (!isRead) {
      markRead.mutate(broadcast.id);
    }
    setIsExpanded(!isExpanded);
  };

  const handleAcknowledge = async () => {
    await acknowledge.mutateAsync({ broadcastId: broadcast.id });
  };

  const handleDismiss = async () => {
    if (!canDismiss) return;
    await dismiss.mutateAsync(broadcast.id);
    onDismiss?.();
  };

  const handleOpenLink = () => {
    if (broadcast.actionConfig?.type === 'link' && broadcast.actionConfig?.url) {
      window.open(broadcast.actionConfig.url, '_blank');
    }
  };

  return (
    <>
      <Card 
        className={cn(
          "relative overflow-visible transition-all cursor-pointer hover-elevate active-elevate-2",
          priorityStyles.border,
          priorityStyles.bg,
          !isRead && "ring-2 ring-primary/20"
        )}
        onClick={handleCardClick}
      >
        <CardContent className="p-4">
          {/* Header Row */}
          <div className="flex items-start gap-3">
            {/* Type Icon */}
            <div className={cn("p-2 rounded-lg flex-shrink-0", typeColor)}>
              {typeIcon}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              {/* Title + Priority */}
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className={cn(
                  "font-semibold text-sm",
                  !isRead && "text-foreground",
                  isRead && "text-muted-foreground"
                )}>
                  {broadcast.title}
                </h4>
                {isCritical && (
                  <Badge variant="destructive" className="text-[10px] px-1.5">
                    CRITICAL
                  </Badge>
                )}
                {broadcast.priority === 'high' && (
                  <Badge variant="outline" className="text-[10px] px-1.5 border-orange-500 text-orange-600">
                    HIGH
                  </Badge>
                )}
                {!isRead && (
                  <Badge className="text-[10px] px-1.5 bg-primary">
                    NEW
                  </Badge>
                )}
              </div>

              {/* Message Preview / Full */}
              <p className={cn(
                "text-sm text-muted-foreground mt-1",
                !isExpanded && "line-clamp-2"
              )}>
                {broadcast.message}
              </p>

              {/* Pass-Down Data (if applicable) */}
              {isExpanded && broadcast.passDownData && (
                <PassDownDetails data={broadcast.passDownData} />
              )}

              {/* Metadata */}
              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                <span>
                  {formatDistanceToNow(new Date(broadcast.createdAt), { addSuffix: true })}
                </span>
                {broadcast.createdByType === 'trinity' && (
                  <Badge variant="outline" className="text-[10px]">
                    <Sparkles className="h-3 w-3 mr-1" /> Trinity
                  </Badge>
                )}
                {isAcknowledged && (
                  <span className="text-green-600 flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" />
                    Acknowledged
                  </span>
                )}
              </div>

              {/* Actions */}
              {isExpanded && (
                <div className="flex items-center gap-2 mt-3 pt-3 border-t">
                  {/* Acknowledge Button */}
                  {broadcast.actionType === 'acknowledge' && !isAcknowledged && (
                    <Button
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAcknowledge();
                      }}
                      disabled={acknowledge.isPending}
                    >
                      <CheckCircle className="h-4 w-4 mr-1" />
                      // @ts-ignore — TS migration: fix in refactoring sprint
                      {(broadcast as any).actionConfig?.buttonLabel || 'I Acknowledge'}
                    </Button>
                  )}

                  {/* Feedback Button */}
                  {broadcast.actionType === 'feedback_form' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowFeedbackForm(true);
                      }}
                    >
                      <MessageSquare className="h-4 w-4 mr-1" />
                      Share Feedback
                    </Button>
                  )}

                  {/* Link Button */}
                  {broadcast.actionType === 'link' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenLink();
                      }}
                    >
                      <ExternalLink className="h-4 w-4 mr-1" />
                      // @ts-ignore — TS migration: fix in refactoring sprint
                      {(broadcast as any).actionConfig?.label || 'Learn More'}
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Dismiss Button */}
            {canDismiss && (
              <Button
                size="icon"
                variant="ghost"
                className="flex-shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDismiss();
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Feedback Form Modal */}
      {showFeedbackForm && (
        <BroadcastFeedbackForm
          open={showFeedbackForm}
          onOpenChange={setShowFeedbackForm}
          broadcastId={broadcast.id}
          // @ts-expect-error — TS migration: fix in refactoring sprint
          feedbackType={broadcast.actionConfig?.formType || 'general'}
        />
      )}
    </>
  );
}

// ============================================
// PASS-DOWN DETAILS SUB-COMPONENT
// ============================================

interface PassDownDetailsProps {
  data: {
    incidents?: Array<{ time?: string; description: string; severity?: string; resolved?: boolean }>;
    clientNotes?: Array<{ note: string; important?: boolean }>;
    equipmentIssues?: Array<{ equipment: string; issue: string; reported?: boolean }>;
    specialInstructions?: string[];
    weatherAlert?: { condition: string; advisory: string };
    keyContacts?: Array<{ name: string; role: string; phone?: string }>;
  };
}

function PassDownDetails({ data }: PassDownDetailsProps) {
  return (
    <div className="mt-3 space-y-3 text-sm">
      {/* Weather Alert */}
      {data.weatherAlert && (
        <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
          <div className="font-medium text-amber-800 dark:text-amber-200 flex items-center gap-1">
            <CloudRain className="h-4 w-4" /> Weather Alert: {data.weatherAlert.condition}
          </div>
          <div className="text-amber-700 dark:text-amber-300 text-xs mt-1">
            {data.weatherAlert.advisory}
          </div>
        </div>
      )}

      {/* Incidents */}
      {data.incidents && data.incidents.length > 0 && (
        <div>
          <div className="font-medium text-xs uppercase text-muted-foreground mb-1">
            Incidents
          </div>
          <ul className="space-y-1">
            {data.incidents.map((incident, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className={cn(
                  "mt-1 w-2 h-2 rounded-full flex-shrink-0",
                  incident.severity === 'high' && "bg-red-500",
                  incident.severity === 'medium' && "bg-amber-500",
                  (!incident.severity || incident.severity === 'low') && "bg-blue-500"
                )} />
                <span className={incident.resolved ? "line-through text-muted-foreground" : ""}>
                  {incident.time && <span className="text-muted-foreground">[{incident.time}]</span>} {incident.description}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Client Notes */}
      {data.clientNotes && data.clientNotes.length > 0 && (
        <div>
          <div className="font-medium text-xs uppercase text-muted-foreground mb-1">
            Client Notes
          </div>
          <ul className="space-y-1">
            {data.clientNotes.map((note, i) => (
              <li key={i} className={cn(
                "flex items-start gap-2",
                note.important && "font-medium text-amber-600 dark:text-amber-400"
              )}>
                {note.important && <AlertTriangle className="h-4 w-4 flex-shrink-0" />}
                {note.note}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Equipment Issues */}
      {data.equipmentIssues && data.equipmentIssues.length > 0 && (
        <div>
          <div className="font-medium text-xs uppercase text-muted-foreground mb-1">
            Equipment Issues
          </div>
          <ul className="space-y-1">
            {data.equipmentIssues.map((issue, i) => (
              <li key={i} className="flex items-start gap-2">
                <Wrench className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span>
                  <strong>{issue.equipment}:</strong> {issue.issue}
                  {issue.reported && <Badge variant="outline" className="ml-2 text-[10px]">Reported</Badge>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Special Instructions */}
      {data.specialInstructions && data.specialInstructions.length > 0 && (
        <div>
          <div className="font-medium text-xs uppercase text-muted-foreground mb-1">
            Special Instructions
          </div>
          <ul className="space-y-1">
            {data.specialInstructions.map((instruction, i) => (
              <li key={i} className="flex items-start gap-2">
                <Pin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                {instruction}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Key Contacts */}
      {data.keyContacts && data.keyContacts.length > 0 && (
        <div>
          <div className="font-medium text-xs uppercase text-muted-foreground mb-1">
            Key Contacts
          </div>
          <ul className="space-y-1">
            {data.keyContacts.map((contact, i) => (
              <li key={i} className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span>
                  <strong>{contact.name}</strong> ({contact.role})
                  {contact.phone && (
                    <a href={`tel:${contact.phone}`} className="ml-2 text-primary hover:underline">
                      {contact.phone}
                    </a>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default BroadcastCard;
