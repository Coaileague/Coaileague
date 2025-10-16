import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Menu,
  UserPlus,
  HelpCircle,
  Users,
  Shield,
  Crown,
  User,
  UserX,
  UserCheck,
  KeyRound,
  XCircle,
  VolumeX,
  ArrowRightLeft,
  ClipboardList,
  Clock,
} from "lucide-react";

interface User {
  id: string;
  name: string;
  role: 'staff' | 'customer' | 'guest';
  platformRole?: string;
}

interface SupportCommandDrawerProps {
  onCommandSelect: (command: string) => void;
  users?: User[];
  isStaff?: boolean;
}

const STAFF_MACROS = [
  {
    id: 'intro',
    label: 'Introduce to Customer',
    command: '/intro',
    icon: UserPlus,
    description: 'Bot announces you are ready',
    needsInput: false,
  },
  {
    id: 'auth',
    label: 'Request Auth',
    command: '/auth',
    icon: Shield,
    description: 'Ask user to authenticate',
    needsInput: true,
    inputPrompt: 'Enter username to authenticate:',
  },
  {
    id: 'verify',
    label: 'Verify Organization',
    command: '/verify',
    icon: UserCheck,
    description: 'Verify user credentials',
    needsInput: true,
    inputPrompt: 'Enter username to verify:',
  },
  {
    id: 'resetpass',
    label: 'Reset Password',
    command: '/resetpass',
    icon: KeyRound,
    description: 'Send password reset link',
    needsInput: true,
    inputPrompt: 'Enter user email:',
  },
  {
    id: 'kick',
    label: 'Kick User',
    command: '/kick',
    icon: UserX,
    description: 'Remove user from chat',
    needsInput: true,
    inputPrompt: 'Enter username to kick:',
  },
  {
    id: 'mute',
    label: 'Mute User',
    command: '/mute',
    icon: VolumeX,
    description: 'Temporarily mute user',
    needsInput: true,
    inputPrompt: 'Enter username to mute:',
  },
  {
    id: 'transfer',
    label: 'Transfer Ticket',
    command: '/transfer',
    icon: ArrowRightLeft,
    description: 'Transfer to another agent',
    needsInput: true,
    inputPrompt: 'Enter staff username to transfer to:',
  },
  {
    id: 'close',
    label: 'Close Ticket',
    command: '/close',
    icon: XCircle,
    description: 'Close current session',
    needsInput: false,
  },
  {
    id: 'help',
    label: 'Show Commands',
    command: '/help',
    icon: HelpCircle,
    description: 'Display all commands',
    needsInput: false,
  },
];

const CUSTOMER_MACROS = [
  {
    id: 'status',
    label: 'Check Ticket Status',
    command: '/status',
    icon: ClipboardList,
    description: 'View your ticket status',
    needsInput: false,
  },
  {
    id: 'queue',
    label: 'Queue Position',
    command: '/queue',
    icon: Clock,
    description: 'Check your queue position',
    needsInput: false,
  },
  {
    id: 'help',
    label: 'Show Commands',
    command: '/help',
    icon: HelpCircle,
    description: 'Display available commands',
    needsInput: false,
  },
];

function getRoleIcon(role: string, platformRole?: string) {
  if (platformRole === 'root') return <Crown className="w-3 h-3 text-yellow-500" />;
  if (platformRole && ['platform_admin', 'deputy_admin'].includes(platformRole)) {
    return <Shield className="w-3 h-3 text-blue-500" />;
  }
  if (role === 'staff') return <Shield className="w-3 h-3 text-blue-500" />;
  return <User className="w-3 h-3 text-slate-400" />;
}

export function SupportCommandDrawer({ 
  onCommandSelect, 
  users = [],
  isStaff = false 
}: SupportCommandDrawerProps) {
  const [open, setOpen] = useState(false);
  const macros = isStaff ? STAFF_MACROS : CUSTOMER_MACROS;

  const handleMacroClick = (macro: typeof STAFF_MACROS[0]) => {
    if (macro.needsInput && macro.inputPrompt) {
      const input = prompt(macro.inputPrompt);
      if (input && input.trim()) {
        onCommandSelect(`${macro.command} ${input.trim()}`);
        setOpen(false);
      }
    } else {
      onCommandSelect(macro.command);
      setOpen(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon"
          className="flex-shrink-0 text-white hover:bg-white/20"
          data-testid="button-support-drawer"
          title="Quick Commands & Users"
        >
          <Menu className="w-5 h-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[85vw] max-w-[320px] p-4">
        <SheetHeader className="pb-4">
          <SheetTitle className="text-lg">Support Menu</SheetTitle>
          <SheetDescription className="text-xs">
            Commands · Users · Tools
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 overflow-y-auto max-h-[calc(100vh-120px)]">
          {/* Quick Command Macros */}
          <div>
            <h3 className="text-xs font-bold mb-2 text-slate-400 uppercase tracking-wider">
              Quick Commands
            </h3>
            <div className="space-y-1.5">
              {macros.map((macro) => {
                const Icon = macro.icon;
                return (
                  <Button
                    key={macro.id}
                    variant="ghost"
                    className="w-full justify-start gap-2.5 h-auto py-2.5 px-3 hover-elevate"
                    onClick={() => handleMacroClick(macro)}
                    data-testid={`button-macro-${macro.id}`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0 text-blue-400" />
                    <div className="flex-1 text-left min-w-0">
                      <div className="text-sm font-medium truncate">{macro.label}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {macro.description}
                      </div>
                    </div>
                  </Button>
                );
              })}
            </div>
          </div>

          <Separator />

          {/* Active Users List */}
          <div>
            <h3 className="text-xs font-bold mb-2 text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <Users className="w-3.5 h-3.5" />
              Active Users ({users.length})
            </h3>
            <div className="space-y-1 max-h-[200px] overflow-y-auto">
              {users.length === 0 ? (
                <p className="text-xs text-muted-foreground py-3 text-center">
                  No users online
                </p>
              ) : (
                users.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center gap-2 px-2.5 py-2 rounded-md hover-elevate"
                    data-testid={`user-item-${user.id}`}
                  >
                    {getRoleIcon(user.role, user.platformRole)}
                    <span className="text-sm flex-1 truncate">{user.name}</span>
                    {user.role === 'staff' && (
                      <span className="text-[10px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded-full">
                        Staff
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
