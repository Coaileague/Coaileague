/**
 * Mobile User Action Sheet
 * TAP USERNAME → Command Wheel (Touch-Optimized)
 * 
 * Solves: No need to type/remember usernames, org IDs, or spelling
 * Mobile support staff can work without PC easily
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
  ArrowRightLeft,
  XCircle,
} from "lucide-react";

interface MobileUserActionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  username: string;
  userId: string;
  userRole: 'staff' | 'customer' | 'guest';
  isStaff: boolean;
  onCommandExecute: (command: string) => void;
}

const STAFF_USER_ACTIONS = [
  {
    id: 'auth',
    label: 'Request Authentication',
    command: '/auth',
    icon: Shield,
    description: 'Ask user to verify identity',
    color: 'text-blue-500',
  },
  {
    id: 'verify',
    label: 'Verify Credentials',
    command: '/verify',
    icon: UserCheck,
    description: 'Check organization database',
    color: 'text-green-500',
  },
  {
    id: 'resetpass',
    label: 'Reset Password',
    command: '/resetpass',
    icon: KeyRound,
    description: 'Send reset link (needs email)',
    color: 'text-yellow-500',
    needsEmail: true,
  },
  {
    id: 'mute',
    label: 'Mute User',
    command: '/mute',
    icon: VolumeX,
    description: 'Temporarily silence user',
    color: 'text-orange-500',
    needsDuration: true,
  },
  {
    id: 'transfer',
    label: 'Transfer Ticket',
    command: '/transfer',
    icon: ArrowRightLeft,
    description: 'Hand off to another agent',
    color: 'text-purple-500',
    needsStaffName: true,
  },
  {
    id: 'kick',
    label: 'Kick User',
    command: '/kick',
    icon: UserX,
    description: 'Remove from chatroom',
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
  onCommandExecute,
}: MobileUserActionSheetProps) {
  
  // Only staff can use user actions
  if (!isStaff) {
    return null;
  }

  // Can't use actions on yourself
  const isSelf = userId === 'current-user'; // You'd get this from context

  const handleActionClick = (action: typeof STAFF_USER_ACTIONS[0]) => {
    let finalCommand = action.command;

    // Handle actions that need additional input
    if (action.needsEmail) {
      const email = prompt(`Enter email for ${username}:`);
      if (!email || !email.trim()) return;
      finalCommand = `${action.command} ${email.trim()}`;
    } else if (action.needsDuration) {
      const duration = prompt(`Mute ${username} for how long? (e.g., "5m", "1h"):`);
      if (!duration || !duration.trim()) return;
      finalCommand = `${action.command} ${username} ${duration.trim()}`;
    } else if (action.needsStaffName) {
      const staffName = prompt('Transfer ticket to which staff member?');
      if (!staffName || !staffName.trim()) return;
      finalCommand = `${action.command} ${staffName.trim()}`;
    } else {
      finalCommand = `${action.command} ${username}`;
    }

    // Confirmation for destructive actions
    if (action.destructive) {
      const confirmed = confirm(`Are you sure you want to kick ${username}?`);
      if (!confirmed) return;
    }

    onCommandExecute(finalCommand);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent 
        side="bottom" 
        className="h-auto max-h-[80vh]"
        data-testid="mobile-user-action-sheet"
      >
        <SheetHeader className="mb-4">
          <SheetTitle className="text-lg">
            Actions for {username}
          </SheetTitle>
          <SheetDescription>
            Select an action to perform (auto-fills username)
          </SheetDescription>
        </SheetHeader>

        {isSelf && (
          <div className="text-center text-muted-foreground text-sm py-8">
            You cannot perform actions on yourself
          </div>
        )}

        {!isSelf && (
          <div className="grid grid-cols-2 gap-3 pb-4">
            {STAFF_USER_ACTIONS.map((action) => (
              <Button
                key={action.id}
                variant="outline"
                className="h-auto flex flex-col items-center justify-center p-4 gap-2"
                onClick={() => handleActionClick(action)}
                data-testid={`action-${action.id}`}
              >
                <action.icon className={`w-6 h-6 ${action.color}`} />
                <div className="text-center">
                  <div className="font-semibold text-sm">{action.label}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {action.description}
                  </div>
                </div>
              </Button>
            ))}
          </div>
        )}

        <Button
          variant="ghost"
          className="w-full"
          onClick={() => onOpenChange(false)}
          data-testid="button-cancel"
        >
          Cancel
        </Button>
      </SheetContent>
    </Sheet>
  );
}
