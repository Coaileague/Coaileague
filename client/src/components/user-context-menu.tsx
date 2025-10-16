import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
  ContextMenuLabel,
} from "@/components/ui/context-menu";
import {
  Shield,
  UserCheck,
  KeyRound,
  UserX,
  VolumeX,
  ArrowRightLeft,
  Info,
} from "lucide-react";

interface UserContextMenuProps {
  username: string;
  isStaff: boolean;
  onCommandExecute: (command: string) => void;
  children: React.ReactNode;
}

export function UserContextMenu({ 
  username, 
  isStaff, 
  onCommandExecute,
  children 
}: UserContextMenuProps) {
  // Only show context menu for staff users
  if (!isStaff) {
    return <>{children}</>;
  }

  const handleCommand = (command: string, needsConfirm: boolean = false) => {
    if (needsConfirm) {
      const confirmed = window.confirm(
        `Are you sure you want to execute: ${command}?`
      );
      if (!confirmed) return;
    }
    onCommandExecute(command);
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuLabel className="flex items-center gap-2">
          <Shield className="w-3 h-3 text-blue-400" />
          Actions for {username}
        </ContextMenuLabel>
        <ContextMenuSeparator />
        
        <ContextMenuItem
          onClick={() => handleCommand(`/verify ${username}`)}
          className="cursor-pointer"
          data-testid="context-verify"
        >
          <UserCheck className="w-4 h-4 mr-2" />
          Verify User
        </ContextMenuItem>
        
        <ContextMenuItem
          onClick={() => handleCommand(`/auth ${username}`)}
          className="cursor-pointer"
          data-testid="context-auth"
        >
          <Shield className="w-4 h-4 mr-2" />
          Request Authentication
        </ContextMenuItem>
        
        <ContextMenuItem
          onClick={() => {
            const email = prompt(`Enter email for ${username}:`);
            if (email) handleCommand(`/resetpass ${email}`);
          }}
          className="cursor-pointer"
          data-testid="context-resetpass"
        >
          <KeyRound className="w-4 h-4 mr-2" />
          Reset Password
        </ContextMenuItem>
        
        <ContextMenuSeparator />
        
        <ContextMenuItem
          onClick={() => {
            const duration = prompt('Mute duration (minutes):', '5');
            if (duration) handleCommand(`/mute ${username} ${duration}`);
          }}
          className="cursor-pointer"
          data-testid="context-mute"
        >
          <VolumeX className="w-4 h-4 mr-2" />
          Mute User
        </ContextMenuItem>
        
        <ContextMenuItem
          onClick={() => {
            const staff = prompt('Transfer to staff member:');
            if (staff) handleCommand(`/transfer ${staff}`);
          }}
          className="cursor-pointer"
          data-testid="context-transfer"
        >
          <ArrowRightLeft className="w-4 h-4 mr-2" />
          Transfer Ticket
        </ContextMenuItem>
        
        <ContextMenuSeparator />
        
        <ContextMenuItem
          onClick={() => {
            const reason = prompt(`Reason for kicking ${username}:`, 'Violation of terms');
            if (reason) handleCommand(`/kick ${username} ${reason}`, true);
          }}
          className="cursor-pointer text-red-600 dark:text-red-400"
          data-testid="context-kick"
        >
          <UserX className="w-4 h-4 mr-2" />
          Kick User
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
