/**
 * Mobile User Action Sheet
 * TAP USERNAME → Quick Actions (Touch-Optimized)
 * 
 * Uses WebSocket commands with IRC-style acknowledgments
 * Works exactly like desktop - reliable command execution
 */

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Shield,
  UserCheck,
  KeyRound,
  UserX,
  VolumeX,
  Volume2,
} from "lucide-react";

interface MobileUserActionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  username: string;
  userId: string;
  userRole: 'staff' | 'customer' | 'guest';
  isStaff: boolean;
  onKickUser?: (userId: string, reason?: string) => void;
  onSilenceUser?: (userId: string, duration?: number, reason?: string) => void;
  onGiveVoice?: (userId: string) => void;
  onCommandExecute?: (command: string) => void;
}

// REORGANIZED: Condensed to most-used actions
const STAFF_USER_ACTIONS = [
  {
    id: 'auth',
    label: 'Request Auth',
    type: 'slash_command',
    command: '/auth',
    icon: Shield,
    description: 'Verify identity',
    color: 'text-blue-500',
  },
  {
    id: 'verify',
    label: 'Verify Org',
    type: 'slash_command',
    command: '/verify',
    icon: UserCheck,
    description: 'Check database',
    color: 'text-blue-500',
  },
  {
    id: 'silence',
    label: 'Silence',
    type: 'websocket',
    icon: VolumeX,
    description: 'Mute temporarily',
    color: 'text-orange-500',
  },
  {
    id: 'give_voice',
    label: 'Unmute',
    type: 'websocket',
    icon: Volume2,
    description: 'Restore voice',
    color: 'text-blue-500',
  },
  {
    id: 'resetpass',
    label: 'Reset Pass',
    type: 'slash_command',
    command: '/resetpass',
    icon: KeyRound,
    description: 'Send reset link',
    color: 'text-yellow-500',
    needsEmail: true,
  },
  {
    id: 'kick',
    label: 'Kick User',
    type: 'websocket',
    icon: UserX,
    description: 'Remove from chat',
    color: 'text-red-500',
    destructive: true,
  },
];

export function MobileUserActionSheet({
  open,
  onOpenChange,
  username,
  userId,
  userRole,
  isStaff,
  onKickUser,
  onSilenceUser,
  onGiveVoice,
  onCommandExecute,
}: MobileUserActionSheetProps) {
  
  // Only staff can use user actions
  if (!isStaff) {
    return null;
  }

  const handleActionClick = (action: typeof STAFF_USER_ACTIONS[0]) => {
    // WebSocket commands - use proper command functions with IRC-style acknowledgments
    if (action.type === 'websocket') {
      switch (action.id) {
        case 'kick':
          const kickReason = prompt(`Reason for kicking ${username}?`) || 'violation of chat rules';
          if (onKickUser) {
            onKickUser(userId, kickReason);
          }
          break;
          
        case 'silence':
          const durationInput = prompt(`Silence ${username} for how many minutes?`, '5');
          const duration = durationInput ? parseInt(durationInput) : 5;
          const silenceReason = prompt('Reason?') || 'Chat violation';
          if (onSilenceUser) {
            onSilenceUser(userId, duration, silenceReason);
          }
          break;
          
        case 'give_voice':
          if (onGiveVoice) {
            onGiveVoice(userId);
          }
          break;
      }
      onOpenChange(false);
      return;
    }

    // Slash commands - fallback for commands not yet migrated to WebSocket
    if (action.type === 'slash_command' && onCommandExecute) {
      let finalCommand = action.command!;

      if (action.needsEmail) {
        const email = prompt(`Enter email for ${username}:`);
        if (!email || !email.trim()) return;
        finalCommand = `${action.command} ${email.trim()}`;
      } else {
        finalCommand = `${action.command} ${username}`;
      }

      onCommandExecute(finalCommand);
      onOpenChange(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent 
        side="bottom" 
        className="h-auto max-h-[70vh]"
        data-testid="mobile-user-action-sheet"
      >
        <SheetHeader className="mb-4">
          <SheetTitle className="text-base">
            Actions for {username}
          </SheetTitle>
          <SheetDescription className="text-xs">
            Tap an action (auto-filled)
          </SheetDescription>
        </SheetHeader>

        <div className="grid grid-cols-3 gap-2 pb-4">
          {STAFF_USER_ACTIONS.map((action) => (
            <Button
              key={action.id}
              variant="outline"
              className="h-auto flex flex-col items-center justify-center p-3 gap-1.5"
              onClick={() => handleActionClick(action)}
              data-testid={`action-${action.id}`}
            >
              <action.icon className={`w-5 h-5 ${action.color}`} />
              <div className="text-center">
                <div className="font-semibold text-xs">{action.label}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {action.description}
                </div>
              </div>
            </Button>
          ))}
        </div>

        <Button
          variant="ghost"
          className="w-full text-xs"
          onClick={() => onOpenChange(false)}
          data-testid="button-cancel"
        >
          Cancel
        </Button>
      </SheetContent>
    </Sheet>
  );
}
