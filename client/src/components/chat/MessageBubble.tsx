import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { Check, CheckCheck } from "lucide-react";
import type { ChatMessage } from "@shared/schema";

interface MessageBubbleProps {
  message: ChatMessage;
  isCurrentUser: boolean;
  readReceipt?: {
    readBy: string;
    readByName: string;
    readAt: Date;
  };
  showAvatar?: boolean;
}

export function MessageBubble({ 
  message, 
  isCurrentUser, 
  readReceipt,
  showAvatar = true 
}: MessageBubbleProps) {
  const isSystem = message.senderType === 'system';
  const isStaff = message.senderType === 'support' || message.senderType === 'staff';
  
  const initials = message.senderName
    ?.split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '??';

  if (isSystem) {
    return (
      <div className="flex justify-center my-3">
        <div className="px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-full max-w-md">
          <p className="text-xs text-slate-600 dark:text-slate-400 text-center">
            {message.message}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex gap-3 mb-4 ${
        isCurrentUser ? 'flex-row-reverse' : 'flex-row'
      }`}
      data-testid={`message-bubble-${message.id}`}
    >
      {showAvatar && !isCurrentUser && (
        <Avatar className="h-8 w-8 flex-shrink-0" data-testid="avatar-sender">
          <AvatarImage src={undefined} />
          <AvatarFallback className="text-xs bg-slate-200 dark:bg-slate-700">
            {initials}
          </AvatarFallback>
        </Avatar>
      )}

      <div className={`flex flex-col max-w-[75%] ${isCurrentUser ? 'items-end' : 'items-start'}`}>
        {!isCurrentUser && (
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300" data-testid="text-sender-name">
              {message.senderName}
            </span>
            {isStaff && (
              <Badge variant="secondary" className="h-4 px-1.5 text-[10px] bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800" data-testid="badge-staff">
                SUPPORT
              </Badge>
            )}
          </div>
        )}

        <div
          className={`px-4 py-2.5 rounded-2xl ${
            isCurrentUser
              ? 'bg-gradient-to-br from-emerald-600 to-emerald-700 text-white'
              : 'bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200'
          }`}
          data-testid="div-message-content"
        >
          <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">
            {message.message}
          </p>
        </div>

        <div className={`flex items-center gap-1.5 mt-1 text-[10px] text-slate-500 dark:text-slate-400 ${isCurrentUser ? 'flex-row-reverse' : 'flex-row'}`}>
          <span data-testid="text-timestamp">
            {message.createdAt ? formatDistanceToNow(new Date(message.createdAt), { addSuffix: true }) : 'Just now'}
          </span>
          
          {isCurrentUser && (
            <div className="flex items-center" data-testid="div-read-status">
              {readReceipt ? (
                <CheckCheck className="h-3 w-3 text-emerald-600 dark:text-emerald-400" data-testid="icon-read-receipt" />
              ) : (
                <Check className="h-3 w-3" data-testid="icon-sent" />
              )}
            </div>
          )}
          
          {readReceipt && isCurrentUser && (
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400" data-testid="text-read-by">
              Read by {readReceipt.readByName}
            </span>
          )}
        </div>
      </div>

      {showAvatar && isCurrentUser && (
        <Avatar className="h-8 w-8 flex-shrink-0" data-testid="avatar-current-user">
          <AvatarImage src={undefined} />
          <AvatarFallback className="text-xs bg-gradient-to-br from-emerald-600 to-emerald-700 text-white">
            {initials}
          </AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}
