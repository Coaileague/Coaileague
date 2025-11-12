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
  XCircle,
  MessageSquare,
  Brain,
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

// REORGANIZED: Condensed into logical groups
const STAFF_COMMAND_GROUPS = [
  {
    category: "Quick Actions",
    icon: MessageSquare,
    commands: [
      {
        id: 'intro',
        label: 'Introduce Yourself',
        command: '/intro',
        icon: UserPlus,
        description: 'Bot announces you',
      },
      {
        id: 'close',
        label: 'Close Ticket',
        command: '/close',
        icon: XCircle,
        description: 'End session',
      },
    ]
  },
  {
    category: "AI Assistant",
    icon: Brain,
    commands: [
      {
        id: 'ask',
        label: 'Ask KnowledgeOS™',
        command: '/ask',
        icon: Brain,
        description: 'Search policies & docs',
        needsInput: true,
        inputPrompt: 'What do you need help with?',
      },
    ]
  },
  {
    category: "User Management",
    icon: Users,
    note: "Tap user avatar for quick actions",
    commands: []
  }
];

const CUSTOMER_COMMAND_GROUPS = [
  {
    category: "Help & Info",
    icon: HelpCircle,
    commands: [
      {
        id: 'status',
        label: 'Check Ticket Status',
        command: '/status',
        icon: MessageSquare,
        description: 'View your ticket',
      },
      {
        id: 'ask',
        label: 'Ask KnowledgeOS™',
        command: '/ask',
        icon: Brain,
        description: 'Search policies & FAQs',
        needsInput: true,
        inputPrompt: 'What do you need help with?',
      },
      {
        id: 'help',
        label: 'Show Commands',
        command: '/help',
        icon: HelpCircle,
        description: 'All available commands',
      },
    ]
  }
];

function getRoleIcon(role: string, platformRole?: string) {
  if (platformRole === 'root_admin') return <Crown className="w-3 h-3 text-blue-600" />;
  if (platformRole && ['deputy_admin'].includes(platformRole)) {
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
  const commandGroups = isStaff ? STAFF_COMMAND_GROUPS : CUSTOMER_COMMAND_GROUPS;

  const handleCommandClick = (command: any) => {
    if (command.needsInput && command.inputPrompt) {
      const input = prompt(command.inputPrompt);
      if (input && input.trim()) {
        onCommandSelect(`${command.command} ${input.trim()}`);
        setOpen(false);
      }
    } else {
      onCommandSelect(command.command);
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
          title="Quick Commands"
        >
          <Menu className="w-5 h-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[85vw] max-w-[320px] p-4">
        <SheetHeader className="pb-4">
          <SheetTitle className="text-lg">Chat Tools</SheetTitle>
          <SheetDescription className="text-xs">
            {isStaff ? 'Commands · Users · Actions' : 'Commands · Help'}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-120px)] pr-3">
          <div className="space-y-5">
            {/* Command Groups */}
            {commandGroups.map((group) => {
              const CategoryIcon = group.icon;
              return (
                <div key={group.category}>
                  <div className="flex items-center gap-2 mb-2">
                    <CategoryIcon className="w-3.5 h-3.5 text-blue-400" />
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      {group.category}
                    </h3>
                  </div>
                  
                  {'note' in group && group.note && (
                    <p className="text-xs text-muted-foreground mb-2 italic">
                      💡 {group.note}
                    </p>
                  )}

                  {group.commands.length > 0 && (
                    <div className="space-y-1">
                      {group.commands.map((cmd) => {
                        const CmdIcon = cmd.icon;
                        return (
                          <Button
                            key={cmd.id}
                            variant="ghost"
                            className="w-full justify-start gap-2.5 h-auto py-2.5 px-3 hover-elevate"
                            onClick={() => handleCommandClick(cmd)}
                            data-testid={`button-cmd-${cmd.id}`}
                          >
                            <CmdIcon className="w-4 h-4 flex-shrink-0 text-blue-400" />
                            <div className="flex-1 text-left min-w-0">
                              <div className="text-sm font-medium truncate">{cmd.label}</div>
                              <div className="text-xs text-muted-foreground truncate">
                                {cmd.description}
                              </div>
                            </div>
                          </Button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            <Separator />

            {/* Active Users List */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-3.5 h-3.5 text-blue-400" />
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Online ({users.length})
                </h3>
              </div>
              <div className="space-y-1 max-h-[180px] overflow-y-auto">
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
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
