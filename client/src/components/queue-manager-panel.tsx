/**
 * Queue Manager Panel - Show users waiting for help
 * Displays both chat users and ticket system users with support actions
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { AutoForceLogo } from "@/components/autoforce-logo";
import {
  Users, MessageSquare, Ticket, Clock, AlertCircle, 
  CheckCircle, UserX, Volume2, VolumeX, Star,
  ArrowRight, Eye, UserCog, Sparkles
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface QueueUser {
  id: string;
  name: string;
  type: 'chat' | 'ticket';
  ticketNumber?: string;
  email?: string;
  waitTime: number; // minutes
  status: 'waiting' | 'silenced' | 'priority' | 'vip';
  tier?: 'free' | 'professional' | 'enterprise' | 'elite';
  position: number;
  lastMessage?: string;
}

interface QueueManagerPanelProps {
  isOpen: boolean;
  onClose: () => void;
  queueUsers?: QueueUser[];
  onUserAction?: (userId: string, action: string) => void;
}

export function QueueManagerPanel({ 
  isOpen, 
  onClose, 
  queueUsers = [],
  onUserAction 
}: QueueManagerPanelProps) {
  const [selectedUser, setSelectedUser] = useState<QueueUser | null>(null);

  // Mock data for demonstration
  const mockQueue: QueueUser[] = queueUsers.length > 0 ? queueUsers : [
    {
      id: '1',
      name: 'Sarah Johnson',
      type: 'chat',
      email: 'sarah@company.com',
      waitTime: 2,
      status: 'priority',
      tier: 'enterprise',
      position: 1,
      lastMessage: 'Need help with billing issue'
    },
    {
      id: '2',
      name: 'Michael Chen',
      type: 'ticket',
      ticketNumber: 'TKT-012345',
      email: 'mchen@email.com',
      waitTime: 5,
      status: 'waiting',
      tier: 'professional',
      position: 2,
      lastMessage: 'Cannot access my account'
    },
    {
      id: '3',
      name: 'Emily Rodriguez',
      type: 'chat',
      email: 'emily.r@work.com',
      waitTime: 12,
      status: 'silenced',
      tier: 'free',
      position: 3,
      lastMessage: 'Hello? Anyone there?'
    },
    {
      id: '4',
      name: 'David Park',
      type: 'ticket',
      ticketNumber: 'TKT-012346',
      email: 'dpark@business.net',
      waitTime: 8,
      status: 'vip',
      tier: 'elite',
      position: 4,
      lastMessage: 'VIP customer - urgent payroll issue'
    },
  ];

  const getStatusColor = (status: QueueUser['status']) => {
    switch (status) {
      case 'priority': return 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100';
      case 'vip': return 'bg-purple-100 text-purple-900 dark:bg-purple-900/30 dark:text-purple-100';
      case 'silenced': return 'bg-red-100 text-red-900 dark:bg-red-900/30 dark:text-red-100';
      default: return 'bg-blue-100 text-blue-900 dark:bg-blue-900/30 dark:text-blue-100';
    }
  };

  const getTierBadge = (tier?: string) => {
    const tierColors = {
      elite: 'bg-gradient-to-r from-yellow-400 to-amber-500 text-black',
      enterprise: 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white',
      professional: 'bg-gradient-to-r from-green-500 to-emerald-600 text-white',
      free: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
    };
    return tierColors[tier as keyof typeof tierColors] || tierColors.free;
  };

  const handleUserAction = (action: string) => {
    if (selectedUser && onUserAction) {
      onUserAction(selectedUser.id, action);
    }
    setSelectedUser(null);
  };

  const supportActions = [
    { id: 'help', label: 'Provide Help', icon: MessageSquare, variant: 'default' as const },
    { id: 'info', label: 'Request Info', icon: Eye, variant: 'default' as const },
    { id: 'restore', label: 'Restore Account', icon: UserCog, variant: 'default' as const },
    { id: 'unmute', label: 'Unmute User', icon: Volume2, variant: 'default' as const },
    { id: 'close', label: 'Close Ticket', icon: CheckCircle, variant: 'default' as const },
    { id: 'escalate', label: 'Escalate', icon: AlertCircle, variant: 'destructive' as const },
  ];

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <div className="flex items-center gap-3 mb-2">
              <AutoForceLogo size="sm" variant="icon" />
              <div>
                <DialogTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-blue-600" />
                  Support Queue Manager
                </DialogTitle>
                <DialogDescription>
                  View all users waiting for help - chat and ticket system
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="grid grid-cols-12 gap-4 flex-1 overflow-hidden">
            {/* Queue List */}
            <div className="col-span-7">
              <Card className="h-full">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span>Waiting Users ({mockQueue.length})</span>
                    <Badge variant="outline" className="font-normal">
                      <Clock className="w-3 h-3 mr-1" />
                      Avg: {Math.round(mockQueue.reduce((acc, u) => acc + u.waitTime, 0) / mockQueue.length)}m
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="flex-1">
                    <div className="space-y-2 p-4">
                      {mockQueue.map((user) => (
                        <button
                          key={user.id}
                          onClick={() => setSelectedUser(user)}
                          className="w-full text-left p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover-elevate active-elevate-2 transition-all"
                          data-testid={`queue-user-${user.id}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge className={`text-[10px] px-1.5 py-0 ${getTierBadge(user.tier)}`}>
                                  {user.tier?.toUpperCase()}
                                </Badge>
                                <span className="font-semibold text-sm truncate">
                                  {user.name}
                                </span>
                                {user.status === 'vip' && (
                                  <Sparkles className="w-3 h-3 text-amber-500 flex-shrink-0" />
                                )}
                              </div>
                              
                              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                                {user.type === 'chat' ? (
                                  <MessageSquare className="w-3 h-3" />
                                ) : (
                                  <Ticket className="w-3 h-3" />
                                )}
                                <span>{user.type === 'ticket' ? user.ticketNumber : user.email}</span>
                              </div>

                              {user.lastMessage && (
                                <p className="text-xs text-muted-foreground truncate">
                                  "{user.lastMessage}"
                                </p>
                              )}
                            </div>

                            <div className="flex flex-col items-end gap-1 flex-shrink-0">
                              <Badge className={`text-[10px] ${getStatusColor(user.status)}`}>
                                {user.status === 'silenced' && <VolumeX className="w-2.5 h-2.5 mr-1" />}
                                {user.status}
                              </Badge>
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock className="w-3 h-3" />
                                {user.waitTime}m
                              </div>
                              <div className="text-xs font-bold text-blue-600">
                                #{user.position}
                              </div>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>

            {/* User Details & Actions */}
            <div className="col-span-5">
              <Card className="h-full">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Support Actions</CardTitle>
                </CardHeader>
                <CardContent>
                  {selectedUser ? (
                    <div className="space-y-4">
                      {/* Selected User Info */}
                      <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h3 className="font-bold text-lg">{selectedUser.name}</h3>
                            <p className="text-sm text-muted-foreground">
                              {selectedUser.type === 'ticket' ? selectedUser.ticketNumber : selectedUser.email}
                            </p>
                          </div>
                          <Badge className={getTierBadge(selectedUser.tier)}>
                            {selectedUser.tier?.toUpperCase()}
                          </Badge>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>Wait: {selectedUser.waitTime}m</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <ArrowRight className="w-3 h-3" />
                            <span>Position #{selectedUser.position}</span>
                          </div>
                        </div>

                        {selectedUser.lastMessage && (
                          <div className="mt-3 p-2 bg-white dark:bg-slate-950 rounded border border-slate-200 dark:border-slate-800">
                            <p className="text-xs text-muted-foreground">Last message:</p>
                            <p className="text-sm mt-1">"{selectedUser.lastMessage}"</p>
                          </div>
                        )}
                      </div>

                      <Separator />

                      {/* Action Buttons */}
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          Quick Actions
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          {supportActions.map((action) => (
                            <Button
                              key={action.id}
                              size="sm"
                              variant={action.variant}
                              onClick={() => handleUserAction(action.id)}
                              className="justify-start gap-2"
                              data-testid={`action-${action.id}`}
                            >
                              <action.icon className="w-3.5 h-3.5" />
                              <span className="text-xs">{action.label}</span>
                            </Button>
                          ))}
                        </div>
                      </div>

                      {/* Status Change */}
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          Status Control
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleUserAction('priority')}
                            data-testid="action-set-priority"
                          >
                            <Star className="w-3.5 h-3.5 mr-1" />
                            Set Priority
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleUserAction('remove')}
                            data-testid="action-remove-queue"
                          >
                            <UserX className="w-3.5 h-3.5 mr-1" />
                            Remove
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center min-h-[300px]">
                      <div className="text-center text-muted-foreground">
                        <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                        <p className="text-sm">Select a user to view actions</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Footer Stats */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <MessageSquare className="w-3 h-3" />
                <span>{mockQueue.filter(u => u.type === 'chat').length} chat</span>
              </div>
              <div className="flex items-center gap-1">
                <Ticket className="w-3 h-3" />
                <span>{mockQueue.filter(u => u.type === 'ticket').length} tickets</span>
              </div>
              <div className="flex items-center gap-1">
                <VolumeX className="w-3 h-3" />
                <span>{mockQueue.filter(u => u.status === 'silenced').length} silenced</span>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
