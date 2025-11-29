import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Menu,
  MessageSquare,
  Users,
  Settings,
  Clock,
  Shield,
  AlertCircle,
  CheckCircle,
  XCircle,
  Info,
  HelpCircle,
  Zap,
  Terminal,
  Radio,
  Lock,
  Unlock,
  Bell
} from "lucide-react";

interface QueuedUser {
  id: string;
  ticketNumber: string;
  email: string;
  waitTime: number;
  position: number;
  priority: number;
  subscriptionTier: string;
  isOrganizationOwner: boolean;
  specialNeeds: boolean;
}

interface SupportCommand {
  command: string;
  description: string;
  usage: string;
  icon: React.ReactNode;
}

interface ChatAction {
  id: string;
  label: string;
  description: string;
  command: string;
  icon: React.ReactNode;
  variant?: 'default' | 'outline' | 'secondary';
}

const chatActions: ChatAction[] = [
  { id: 'intro', label: "Send Welcome", description: "Introduce yourself to customer", command: "/intro", icon: <MessageSquare className="h-4 w-4" />, variant: 'default' },
  { id: 'auth', label: "Request Auth", description: "Ask for authentication", command: "/auth", icon: <Lock className="h-4 w-4" />, variant: 'outline' },
  { id: 'help', label: "Show Help", description: "Display command reference", command: "/help", icon: <HelpCircle className="h-4 w-4" />, variant: 'outline' },
  { id: 'close', label: "Close & Feedback", description: "End chat with review request", command: "/close", icon: <XCircle className="h-4 w-4" />, variant: 'secondary' },
];

const systemCommands: SupportCommand[] = [
  { command: "Room Status", description: "Toggle room open/closed", usage: "Click status button", icon: <Radio className="h-4 w-4" /> },
  { command: "Priority Queue", description: "View users by priority", usage: "See queue panel", icon: <AlertCircle className="h-4 w-4" /> },
  { command: "Staff Bypass", description: "Platform staff auto-access", usage: "Automatic for staff", icon: <Shield className="h-4 w-4" /> },
  { command: "Audit Logs", description: "View support activity", usage: "System tracking", icon: <Terminal className="h-4 w-4" /> },
];

const supportActions: SupportCommand[] = [
  { command: "Answer Next", description: "Help next user in queue", usage: "Click user from queue", icon: <Users className="h-4 w-4" /> },
  { command: "Check Wait Time", description: "View queue wait times", usage: "See queue statistics", icon: <Clock className="h-4 w-4" /> },
  { command: "Priority Alert", description: "High-priority notifications", usage: "Automatic alerts", icon: <Bell className="h-4 w-4" /> },
  { command: "Macro Response", description: "Quick reply templates", usage: "Use support drawer", icon: <Zap className="h-4 w-4" /> },
];

interface SupportMobileMenuProps {
  onExecuteCommand?: (command: string) => void;
}

export function SupportMobileMenu({ onExecuteCommand }: SupportMobileMenuProps = {}) {
  const [isOpen, setIsOpen] = useState(false);
  const [copiedTicket, setCopiedTicket] = useState<string | null>(null);

  // Fetch queue data
  const { data: queue = [] } = useQuery<QueuedUser[]>({
    queryKey: ['/api/helpdesk/queue'],
    enabled: isOpen,
    refetchInterval: 5000 // Update every 5 seconds when open
  });

  const pendingCount = queue.length;
  const highPriorityCount = queue.filter(u => u.priority >= 80).length;

  const handleCopyTicket = async (ticketNumber: string) => {
    try {
      await navigator.clipboard.writeText(ticketNumber);
      setCopiedTicket(ticketNumber);
      setTimeout(() => setCopiedTicket(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleAction = (action: ChatAction) => {
    if (onExecuteCommand) {
      onExecuteCommand(action.command);
      setIsOpen(false); // Close menu after action
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="relative md:hidden"
          data-testid="button-support-menu"
        >
          <Menu className="h-5 w-5" />
          {pendingCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
            >
              {pendingCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[85vw] sm:w-[400px] p-0">
        <ScrollArea className="h-full">
          <div className="p-6">
            <SheetHeader className="mb-6">
              <SheetTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Support Staff Menu
              </SheetTitle>
              <SheetDescription>
                Mobile command center for HelpAI
              </SheetDescription>
            </SheetHeader>

            <Accordion type="multiple" defaultValue={["queue", "actions", "system"]} className="space-y-2">
              
              {/* Category 1: Support Queue & Actions */}
              <AccordionItem value="queue" className="border rounded-md">
                <AccordionTrigger className="px-4 hover:no-underline" data-testid="accordion-queue">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    <span>Support Queue</span>
                    {pendingCount > 0 && (
                      <Badge variant="destructive" data-testid="badge-queue-count">{pendingCount}</Badge>
                    )}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4 space-y-3">
                  {/* Queue statistics */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-3 border rounded-md">
                      <p className="text-xs text-muted-foreground">Waiting</p>
                      <p className="text-lg font-bold" data-testid="text-waiting-count">{pendingCount}</p>
                    </div>
                    <div className="p-3 border rounded-md">
                      <p className="text-xs text-muted-foreground">High Priority</p>
                      <p className="text-lg font-bold text-destructive" data-testid="text-priority-count">{highPriorityCount}</p>
                    </div>
                  </div>

                  {/* Queued users */}
                  {queue.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Next in Queue:</p>
                      {queue.slice(0, 3).map((user) => (
                        <Button
                          key={user.id}
                          variant="outline"
                          className="w-full justify-start text-left"
                          size="sm"
                          onClick={() => handleCopyTicket(user.ticketNumber)}
                          data-testid={`button-user-${user.ticketNumber}`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-xs">
                                #{user.position}
                              </Badge>
                              <span className="text-sm font-medium truncate">
                                {copiedTicket === user.ticketNumber ? '✓ Copied!' : user.ticketNumber}
                              </span>
                              {user.specialNeeds && (
                                <AlertCircle className="h-3 w-3 text-destructive" />
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Wait: {Math.floor(user.waitTime / 60)}m | {user.subscriptionTier}
                            </p>
                          </div>
                        </Button>
                      ))}
                      {queue.length > 3 && (
                        <p className="text-xs text-muted-foreground text-center">
                          +{queue.length - 3} more waiting
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No users in queue
                    </p>
                  )}

                  {/* Support actions */}
                  <div className="space-y-2 pt-2">
                    <p className="text-sm font-medium">Quick Actions:</p>
                    {supportActions.map((action) => (
                      <div key={action.command} className="flex items-start gap-2 p-2 rounded-md hover-elevate active-elevate-2">
                        <div className="mt-0.5">{action.icon}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{action.command}</p>
                          <p className="text-xs text-muted-foreground">{action.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* Category 2: Quick Actions (Tap to Execute) */}
              <AccordionItem value="actions" className="border rounded-md">
                <AccordionTrigger className="px-4 hover:no-underline" data-testid="accordion-actions">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    <span>Quick Actions</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4 space-y-2">
                  <p className="text-xs text-muted-foreground mb-3">Tap any action to execute instantly:</p>
                  {chatActions.map((action) => (
                    <Button
                      key={action.id}
                      variant={action.variant || 'outline'}
                      size="sm"
                      onClick={() => handleAction(action)}
                      className="w-full justify-start gap-2"
                      data-testid={`action-${action.id}`}
                    >
                      {action.icon}
                      <div className="flex-1 text-left">
                        <p className="text-sm font-medium">{action.label}</p>
                        <p className="text-xs text-muted-foreground">{action.description}</p>
                      </div>
                    </Button>
                  ))}
                </AccordionContent>
              </AccordionItem>

              {/* Category 3: System Dashboard */}
              <AccordionItem value="system" className="border rounded-md">
                <AccordionTrigger className="px-4 hover:no-underline" data-testid="accordion-system">
                  <div className="flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    <span>System Dashboard</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4 space-y-2">
                  {systemCommands.map((cmd) => (
                    <div key={cmd.command} className="flex items-start gap-2 p-2 rounded-md hover-elevate active-elevate-2">
                      <div className="mt-0.5">{cmd.icon}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{cmd.command}</p>
                        <p className="text-xs text-muted-foreground">{cmd.description}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {cmd.usage}
                        </p>
                      </div>
                    </div>
                  ))}
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            {/* Queue automation notice */}
            <div className="mt-6 p-4 border rounded-md bg-muted/50">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 mt-0.5 text-blue-500" />
                <div className="flex-1 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground mb-1">HelpAI AI Queue</p>
                  <p>Users are automatically queued by priority: subscription tier, wait time, special needs, and owner status. Click any user above to help them.</p>
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
