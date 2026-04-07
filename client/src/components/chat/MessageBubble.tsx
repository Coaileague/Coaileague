import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDistanceToNow } from "date-fns";
import { Check, CheckCheck, Sparkles } from "lucide-react";
import type { ChatMessage } from "@shared/schema";
import { IrcRoleBadge, IrcSigil, mapToIrcRole, isTrinityBot, type IrcRole } from "./IrcRoleBadge";
import { TrinityLogo } from "@/components/trinity-logo";

interface MessageBubbleProps {
  message: ChatMessage;
  isCurrentUser: boolean;
  readReceipt?: {
    readBy: string;
    readByName: string;
    readAt: Date;
  };
  showAvatar?: boolean;
  platformRole?: string | null;
  workspaceRole?: string | null;
  roomRole?: string | null;
}

export function MessageBubble({ 
  message, 
  isCurrentUser, 
  readReceipt,
  showAvatar = true,
  platformRole,
  workspaceRole,
  roomRole,
}: MessageBubbleProps) {
  const isSystem = message.senderType === 'system';
  const isBot = message.senderType === 'bot';
  const isStaff = message.senderType === 'support' || message.senderType === 'staff';
  const isTrinity = isBot && isTrinityBot(message.senderName);
  
  const ircRole = mapToIrcRole({
    platformRole,
    workspaceRole,
    roomRole,
    isBot,
    senderType: message.senderType,
    senderName: message.senderName,
  });
  
  const initials = message.senderName
    ?.split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '??';

  if (isSystem) {
    return (
      <div className="flex justify-center my-2" data-testid={`message-system-${message.id}`}>
        <div className="px-3 py-1 bg-muted/40 rounded-full max-w-md">
          <p className="text-[10px] text-muted-foreground/70 text-center leading-snug font-medium">
            {message.message}
          </p>
        </div>
      </div>
    );
  }

  const showRoleBadge = ircRole !== 'user' && ircRole !== 'guest';

  const bubbleTailClasses = isCurrentUser
    ? 'msg-bubble-tail-right'
    : 'msg-bubble-tail-left';

  const bubbleColorClasses = isCurrentUser
    ? 'bg-primary text-primary-foreground'
    : isBot
      ? 'msg-bubble-bot bg-card border border-border/60 text-card-foreground'
      : 'bg-muted text-foreground';

  return (
    <div
      className={`flex gap-2 mb-1.5 message-arrive ${
        isCurrentUser ? 'flex-row-reverse' : 'flex-row'
      }`}
      data-testid={`message-bubble-${message.id}`}
    >
      {showAvatar && !isCurrentUser && (
        <div className="relative flex-shrink-0 self-end">
          <Avatar className={`h-7 w-7 ring-2 ring-background ${isBot ? 'msg-bot-avatar' : ''}`} data-testid="avatar-sender">
            <AvatarImage src={undefined} alt={message.senderName} />
            <AvatarFallback className={`text-[10px] font-semibold ${
              isBot 
                ? 'bg-primary/10 text-primary'
                : 'bg-muted text-muted-foreground'
            }`}>
              {isBot ? <TrinityLogo size={14} /> : initials}
            </AvatarFallback>
          </Avatar>
          {isBot && (
            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-primary border border-background flex items-center justify-center msg-ai-indicator" data-testid="indicator-ai-bot">
              <Sparkles className="w-2 h-2 text-primary-foreground" />
            </div>
          )}
        </div>
      )}

      <div className={`flex flex-col max-w-[75%] ${isCurrentUser ? 'items-end' : 'items-start'}`}>
        {!isCurrentUser && (
          <div className="flex items-center gap-1 mb-0.5 px-1 flex-wrap">
            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground/70" data-testid="text-sender-name">
              <IrcSigil role={ircRole} isBot={isBot} />
              {message.senderName}
            </span>
            {showRoleBadge && (
              <IrcRoleBadge 
                role={ircRole}
                isBot={isBot}
                isTrinity={isTrinity}
                platformRole={platformRole}
                workspaceRole={workspaceRole}
                showSigil={false}
                size="xs"
              />
            )}
          </div>
        )}

        <div
          className={`relative px-3 py-1.5 ${bubbleTailClasses} ${bubbleColorClasses} msg-bubble-shadow`}
          data-testid="div-message-content"
        >
          <p className="text-[13px] leading-relaxed break-words whitespace-pre-wrap">
            {message.message}
          </p>
        </div>

        <div className={`flex items-center gap-1 mt-px px-0.5 ${isCurrentUser ? 'flex-row-reverse' : 'flex-row'}`} data-testid="div-message-meta">
          <span className="text-[9px] text-muted-foreground/35 select-none leading-none tracking-tight" data-testid="text-timestamp">
            {message.createdAt ? formatDistanceToNow(new Date(message.createdAt), { addSuffix: true }) : 'Just now'}
          </span>
          
          {isCurrentUser && (
            <div className="flex items-center" data-testid="div-read-status">
              {readReceipt ? (
                <CheckCheck className="h-2.5 w-2.5 text-primary read-receipt" data-testid="icon-read-receipt" />
              ) : (
                <Check className="h-2 w-2 text-muted-foreground/30" data-testid="icon-sent" />
              )}
            </div>
          )}
          
          {readReceipt && isCurrentUser && (
            <span className="text-[8px] text-primary/40 read-receipt leading-none" data-testid="text-read-by">
              {readReceipt.readByName}
            </span>
          )}
        </div>
      </div>

      {showAvatar && isCurrentUser && (
        <Avatar className="h-7 w-7 flex-shrink-0 self-end ring-2 ring-background" data-testid="avatar-current-user">
          <AvatarImage src={undefined} alt={message.senderName} />
          <AvatarFallback className="text-[10px] font-semibold bg-primary text-primary-foreground">
            {initials}
          </AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}
