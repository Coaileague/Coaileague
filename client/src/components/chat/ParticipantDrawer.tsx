import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Users } from "lucide-react";

interface OnlineUser {
  id: string;
  name: string;
  role: string;
  status: 'online' | 'away' | 'busy';
  userType: 'staff' | 'subscriber' | 'org_user' | 'guest';
}

interface ParticipantDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  participants: OnlineUser[];
  conversationTitle?: string;
}

export function ParticipantDrawer({ 
  open, 
  onOpenChange, 
  participants,
  conversationTitle = "Conversation"
}: ParticipantDrawerProps) {
  const getStatusColor = (status: OnlineUser['status']) => {
    switch (status) {
      case 'online': return 'bg-emerald-500';
      case 'away': return 'bg-amber-500';
      case 'busy': return 'bg-red-500';
      default: return 'bg-slate-400';
    }
  };

  const getRoleBadgeColor = (userType: OnlineUser['userType']) => {
    switch (userType) {
      case 'staff': return 'bg-emerald-100 dark:bg-emerald-900 text-blue-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
      case 'subscriber': return 'bg-cyan-100 dark:bg-cyan-900 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800';
      case 'org_user': return 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700';
      default: return 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700';
    }
  };

  const getUserTypeLabel = (userType: OnlineUser['userType']) => {
    switch (userType) {
      case 'staff': return 'Support';
      case 'subscriber': return 'Premium';
      case 'org_user': return 'Member';
      case 'guest': return 'Guest';
      default: return 'User';
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent 
        side="right" 
        className="w-full sm:w-80 p-0 overflow-hidden"
        data-testid="sheet-participants"
      >
        <SheetHeader className="p-6 pb-4 border-b-2 border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" data-testid="icon-users" />
            <SheetTitle className="text-slate-800 dark:text-slate-200" data-testid="text-drawer-title">
              Participants
            </SheetTitle>
          </div>
          <SheetDescription className="text-slate-600 dark:text-slate-400" data-testid="text-drawer-description">
            {participants.length} {participants.length === 1 ? 'person' : 'people'} in {conversationTitle}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-3" data-testid="div-participants-list">
          {participants.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="h-12 w-12 text-slate-300 dark:text-slate-600 mb-3" />
              <p className="text-sm text-slate-500 dark:text-slate-400">No participants yet</p>
            </div>
          ) : (
            participants.map((participant) => {
              const initials = participant.name
                ?.split(' ')
                .map(n => n[0])
                .join('')
                .toUpperCase()
                .slice(0, 2) || '??';

              return (
                <div
                  key={participant.id}
                  className="flex items-center gap-3 p-3 rounded-lg bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 hover-elevate active-elevate-2"
                  data-testid={`participant-${participant.id}`}
                >
                  <div className="relative">
                    <Avatar className="h-10 w-10" data-testid={`avatar-${participant.id}`}>
                      <AvatarImage src={undefined} />
                      <AvatarFallback className="text-xs bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div 
                      className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white dark:border-slate-800 ${getStatusColor(participant.status)}`}
                      data-testid={`status-indicator-${participant.id}`}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate" data-testid={`text-name-${participant.id}`}>
                      {participant.name}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate" data-testid={`text-role-${participant.id}`}>
                      {participant.role}
                    </p>
                  </div>

                  <Badge 
                    variant="secondary"
                    className={`h-5 px-2 text-[10px] font-semibold ${getRoleBadgeColor(participant.userType)}`}
                    data-testid={`badge-type-${participant.id}`}
                  >
                    {getUserTypeLabel(participant.userType)}
                  </Badge>
                </div>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
