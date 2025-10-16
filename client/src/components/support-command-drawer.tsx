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
  MessageSquare,
  UserPlus,
  HelpCircle,
  Users,
  PhoneOff,
  Shield,
  Crown,
  User,
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
    description: 'Bot announces you are ready to help',
  },
  {
    id: 'help',
    label: 'Show Commands',
    command: '/help',
    icon: HelpCircle,
    description: 'Display all available commands',
  },
];

const CUSTOMER_MACROS = [
  {
    id: 'help',
    label: 'Show Commands',
    command: '/help',
    icon: HelpCircle,
    description: 'Display available commands',
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

  const handleMacroClick = (command: string) => {
    onCommandSelect(command);
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button 
          variant="outline" 
          size="icon"
          className="md:hidden"
          data-testid="button-support-drawer"
        >
          <MessageSquare className="w-4 h-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[280px] sm:w-[320px]">
        <SheetHeader>
          <SheetTitle>Support Tools</SheetTitle>
          <SheetDescription>
            Quick commands and user list
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {/* Quick Command Macros */}
          <div>
            <h3 className="text-sm font-semibold mb-3 text-slate-300">
              Quick Commands
            </h3>
            <div className="space-y-2">
              {macros.map((macro) => {
                const Icon = macro.icon;
                return (
                  <Button
                    key={macro.id}
                    variant="outline"
                    className="w-full justify-start gap-2 h-auto py-3"
                    onClick={() => handleMacroClick(macro.command)}
                    data-testid={`button-macro-${macro.id}`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <div className="flex-1 text-left">
                      <div className="text-sm font-medium">{macro.label}</div>
                      <div className="text-xs text-muted-foreground">
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
            <h3 className="text-sm font-semibold mb-3 text-slate-300 flex items-center gap-2">
              <Users className="w-4 h-4" />
              Active Users ({users.length})
            </h3>
            <ScrollArea className="h-[300px]">
              <div className="space-y-1">
                {users.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">
                    No users online
                  </p>
                ) : (
                  users.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center gap-2 px-3 py-2 rounded-md hover-elevate"
                      data-testid={`user-item-${user.id}`}
                    >
                      {getRoleIcon(user.role, user.platformRole)}
                      <span className="text-sm flex-1 truncate">{user.name}</span>
                      {user.role === 'staff' && (
                        <span className="text-xs text-blue-500 bg-blue-500/10 px-2 py-0.5 rounded-full">
                          Staff
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
