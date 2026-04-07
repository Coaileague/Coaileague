/**
 * Mobile User Action Sheet
 * TAP/LONG-PRESS USERNAME → Quick Actions (Touch-Optimized)
 * 
 * RBAC-based actions:
 * - Staff → Customer: Auth, Verify, Silence, Unmute, Reset Pass, Kick
 * - Customer → Staff/Bot: Private Message, Screenshot, Verify Me, Request Help, Report Issue
 * 
 * Uses WebSocket commands with IRC-style acknowledgments
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MobileResponsiveSheet } from "@/components/canvas-hub";
import {
  Shield,
  UserCheck,
  KeyRound,
  UserX,
  VolumeX,
  Volume2,
  User,
  MessageSquare,
  Camera,
  HelpCircle,
  AlertTriangle,
  Bot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { KickDialog, SilenceDialog, ResetEmailDialog } from "@/components/moderation-dialogs";

interface MobileUserActionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  username: string;
  userId: string;
  userRole: 'staff' | 'customer' | 'guest' | 'bot';
  isStaff: boolean;
  onKickUser?: (userId: string, reason?: string) => void;
  onSilenceUser?: (userId: string, duration?: number, reason?: string) => void;
  onGiveVoice?: (userId: string) => void;
  onCommandExecute?: (command: string) => void;
}

// Staff actions on customers
const STAFF_TO_CUSTOMER_ACTIONS = [
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

// Customer actions on staff/bots
const CUSTOMER_TO_STAFF_ACTIONS = [
  {
    id: 'dm',
    label: 'Private Message',
    type: 'slash_command',
    command: '/dm',
    icon: MessageSquare,
    description: 'Send direct message',
    color: 'text-blue-500',
  },
  {
    id: 'screenshot',
    label: 'Send Screenshot',
    type: 'slash_command',
    command: '/screenshot',
    icon: Camera,
    description: 'Share your screen',
    color: 'text-purple-500',
  },
  {
    id: 'verifyme',
    label: 'Verify My Account',
    type: 'slash_command',
    command: '/verifyme',
    icon: UserCheck,
    description: 'Request verification',
    color: 'text-green-500',
  },
  {
    id: 'help',
    label: 'Request Help',
    type: 'slash_command',
    command: '/help',
    icon: HelpCircle,
    description: 'Get assistance',
    color: 'text-cyan-500',
  },
  {
    id: 'issue',
    label: 'Report Issue',
    type: 'slash_command',
    command: '/issue',
    icon: AlertTriangle,
    description: 'Flag a problem',
    color: 'text-orange-500',
  },
];

// Staff actions on other staff
const STAFF_TO_STAFF_ACTIONS = [
  {
    id: 'dm',
    label: 'Direct Message',
    type: 'slash_command',
    command: '/dm',
    icon: MessageSquare,
    description: 'Private chat',
    color: 'text-blue-500',
  },
];

type ActionItem = typeof STAFF_TO_CUSTOMER_ACTIONS[0];

// Get actions based on current user role and target user role
function getActionsForRoles(isStaff: boolean, targetRole: 'staff' | 'customer' | 'guest' | 'bot'): ActionItem[] {
  if (isStaff) {
    if (targetRole === 'staff') {
      return STAFF_TO_STAFF_ACTIONS;
    }
    return STAFF_TO_CUSTOMER_ACTIONS;
  } else {
    // Customer/guest actions
    if (targetRole === 'staff' || targetRole === 'bot') {
      return CUSTOMER_TO_STAFF_ACTIONS;
    }
    return []; // Customers can't take actions on other customers
  }
}

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
  const [kickDialogOpen, setKickDialogOpen] = useState(false);
  const [silenceDialogOpen, setSilenceDialogOpen] = useState(false);
  const [resetEmailDialogOpen, setResetEmailDialogOpen] = useState(false);

  // Get available actions based on RBAC
  const availableActions = getActionsForRoles(isStaff, userRole);

  const handleActionClick = (action: ActionItem) => {
    // WebSocket commands - use proper command functions with IRC-style acknowledgments
    if (action.type === 'websocket') {
      switch (action.id) {
        case 'kick':
          setKickDialogOpen(true);
          return;
        case 'silence':
          setSilenceDialogOpen(true);
          return;
        case 'give_voice':
          if (onGiveVoice) {
            onGiveVoice(userId);
          }
          onOpenChange(false);
          return;
      }
      return;
    }

    // Slash commands - fallback for commands not yet migrated to WebSocket
    if (action.type === 'slash_command' && onCommandExecute) {
      if (action.needsEmail) {
        setResetEmailDialogOpen(true);
        return;
      }
      const finalCommand = `${action.command} ${username}`;
      onCommandExecute(finalCommand);
      onOpenChange(false);
    }
  };

  // No actions available - don't render
  if (availableActions.length === 0) {
    return null;
  }

  return (
    <>
      <MobileResponsiveSheet
        open={open}
        onOpenChange={onOpenChange}
        title={`Actions for ${username}`}
        titleIcon={
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center shadow-sm shrink-0">
            <User className="w-3.5 h-3.5 text-white" />
          </div>
        }
        subtitle={userRole === 'staff' ? 'Staff Member' : userRole === 'bot' ? 'AI Assistant' : 'Customer'}
        side="bottom"
        headerGradient={true}
        className="px-4 pb-6"
        maxHeight="100dvh"
      >
        <div className="flex flex-col gap-2 pt-2">
          {availableActions.map((action) => (
            <Button
              key={action.id}
              variant={action.destructive ? "destructive" : "outline"}
              className={cn(
                "h-auto flex flex-row items-center justify-start p-3 gap-3 w-full",
                action.destructive && "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300"
              )}
              onClick={() => handleActionClick(action)}
              data-testid={`action-${action.id}`}
            >
              <div className={cn(
                "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
                action.destructive ? "bg-red-100 dark:bg-red-900/30" : "bg-muted"
              )}>
                <action.icon className={cn("w-4 h-4", action.color)} />
              </div>
              <div className="text-left min-w-0 flex-1">
                <div className="font-medium text-sm">{action.label}</div>
                <div className="text-[11px] text-muted-foreground">
                  {action.description}
                </div>
              </div>
            </Button>
          ))}
        </div>
      </MobileResponsiveSheet>

      <KickDialog
        open={kickDialogOpen}
        userName={username}
        onConfirm={(reason) => {
          if (onKickUser) onKickUser(userId, reason);
          setKickDialogOpen(false);
          onOpenChange(false);
        }}
        onCancel={() => setKickDialogOpen(false)}
      />

      <SilenceDialog
        open={silenceDialogOpen}
        userName={username}
        onConfirm={(duration, reason) => {
          if (onSilenceUser) onSilenceUser(userId, parseInt(duration), reason);
          setSilenceDialogOpen(false);
          onOpenChange(false);
        }}
        onCancel={() => setSilenceDialogOpen(false)}
      />

      <ResetEmailDialog
        open={resetEmailDialogOpen}
        userName={username}
        onConfirm={(email) => {
          if (onCommandExecute) onCommandExecute(`/resetpass ${email.trim()}`);
          setResetEmailDialogOpen(false);
          onOpenChange(false);
        }}
        onCancel={() => setResetEmailDialogOpen(false)}
      />
    </>
  );
}
