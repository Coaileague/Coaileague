import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MobileResponsiveSheet } from "@/components/canvas-hub";
import { Users, ChevronRight } from "lucide-react";
import { IrcRoleBadge, IrcSigil, mapToIrcRole, isTrinityBot, IRC_ROLE_ORDER, type IrcRole } from "./IrcRoleBadge";
import { TrinityLogo } from "@/components/ui/coaileague-logo-mark";

interface OnlineUser {
  id: string;
  name: string;
  role: string;
  status: 'online' | 'away' | 'busy';
  userType: 'staff' | 'subscriber' | 'org_user' | 'guest';
  platformRole?: string | null;
  workspaceRole?: string | null;
  roomRole?: 'owner' | 'operator' | 'voice' | 'user' | 'guest' | null;
  isBot?: boolean;
}

interface ParticipantDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  participants: OnlineUser[];
  conversationTitle?: string;
  onParticipantClick?: (participant: OnlineUser) => void;
  currentUserId?: string;
}

export function ParticipantDrawer({ 
  open, 
  onOpenChange, 
  participants,
  conversationTitle = "Conversation",
  onParticipantClick,
  currentUserId,
}: ParticipantDrawerProps) {
  const getStatusColor = (status: OnlineUser['status']) => {
    switch (status) {
      case 'online': return 'bg-emerald-500';
      case 'away': return 'bg-amber-500';
      case 'busy': return 'bg-red-500';
      default: return 'bg-muted-foreground/50';
    }
  };

  const sortedParticipants = [...participants].sort((a, b) => {
    const roleA = mapToIrcRole({
      platformRole: a.platformRole,
      workspaceRole: a.workspaceRole,
      roomRole: a.roomRole,
      isBot: a.isBot,
    });
    
    const roleB = mapToIrcRole({
      platformRole: b.platformRole,
      workspaceRole: b.workspaceRole,
      roomRole: b.roomRole,
      isBot: b.isBot,
    });
    
    return (IRC_ROLE_ORDER[roleA] ?? 99) - (IRC_ROLE_ORDER[roleB] ?? 99);
  });

  return (
    <MobileResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Participants"
      titleIcon={
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center shadow-sm shrink-0">
          <Users className="w-3.5 h-3.5 text-white" />
        </div>
      }
      subtitle={`${participants.length} ${participants.length === 1 ? 'person' : 'people'} in ${conversationTitle}`}
      side="right"
      headerGradient={true}
      className="px-4 py-2"
    >
      <div className="flex-1 overflow-y-auto space-y-1" data-testid="div-participants-list">
        {sortedParticipants.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="h-12 w-12 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No participants yet</p>
          </div>
        ) : (
          <>
            <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider px-2 py-1 border-b border-border mb-2">
              Channel Users ({sortedParticipants.length})
            </div>
            
            {sortedParticipants.map((participant) => {
              const ircRole = mapToIrcRole({
                platformRole: participant.platformRole,
                workspaceRole: participant.workspaceRole,
                roomRole: participant.roomRole,
                isBot: participant.isBot,
              });
              
              const initials = participant.name
                ?.split(' ')
                .map(n => n[0])
                .join('')
                .toUpperCase()
                .slice(0, 2) || '??';
              
              const isCurrentUser = participant.id === currentUserId;
              const canClick = onParticipantClick && !isCurrentUser && !participant.isBot;

              return (
                <button
                  key={participant.id}
                  type="button"
                  onClick={() => canClick && onParticipantClick(participant)}
                  disabled={isCurrentUser || participant.isBot}
                  className={`w-full flex items-center gap-3 p-2.5 rounded-lg bg-card border border-border text-left ${canClick ? 'hover-elevate active-elevate-2 cursor-pointer' : 'cursor-default'}`}
                  data-testid={`participant-${participant.id}`}
                >
                  <div className="relative shrink-0">
                    <Avatar className="h-9 w-9" data-testid={`avatar-${participant.id}`}>
                      <AvatarImage src={undefined} alt={participant.name} />
                      <AvatarFallback className={`text-sm font-semibold ${
                        participant.isBot
                          ? 'bg-gradient-to-br from-blue-500 via-purple-500 to-amber-500 text-white'
                          : 'bg-muted text-foreground'
                      }`}>
                        {participant.isBot ? <TrinityLogo size={18} /> : initials}
                      </AvatarFallback>
                    </Avatar>
                    <div 
                      className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border border-card ${
                        participant.isBot ? 'bg-gradient-to-r from-blue-500 to-purple-500 animate-pulse' : getStatusColor(participant.status)
                      }`}
                      data-testid={`status-indicator-${participant.id}`}
                    />
                  </div>

                  <div className="flex-1 min-w-0 overflow-hidden">
                    <p className="flex items-center gap-1 text-sm font-medium text-foreground" data-testid={`text-name-${participant.id}`}>
                      <IrcSigil role={ircRole} isBot={participant.isBot} />
                      <span className="truncate">{participant.name}</span>
                      {isCurrentUser && <span className="text-[10px] text-muted-foreground ml-0.5">(you)</span>}
                    </p>
                    <p className="text-xs text-muted-foreground truncate font-mono" data-testid={`text-role-${participant.id}`}>
                      {participant.role || (participant.isBot ? 'AI Assistant' : 'Member')}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {ircRole !== 'user' && ircRole !== 'guest' && (
                      <IrcRoleBadge 
                        role={ircRole}
                        isBot={participant.isBot}
                        isTrinity={participant.isBot && isTrinityBot(participant.name)}
                        platformRole={participant.platformRole}
                        workspaceRole={participant.workspaceRole}
                        showSigil={false}
                        size="xs"
                      />
                    )}
                    {canClick && (
                      <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                    )}
                  </div>
                </button>
              );
            })}
            
            <div className="mt-3 pt-2 border-t border-border">
              <div className="text-[9px] font-mono text-muted-foreground px-2 space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-red-500 font-bold">~</span>
                  <span>Root Admin</span>
                  <span className="text-orange-500 font-bold">&</span>
                  <span>Co-Admin</span>
                  <span className="text-purple-500 font-bold">@</span>
                  <span>Sysop</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-blue-500 font-bold">%</span>
                  <span>HalfOp</span>
                  <span className="text-green-500 font-bold">+</span>
                  <span>Voice</span>
                  <TrinityLogo size={10} className="inline-block" />
                  <span>Bot</span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </MobileResponsiveSheet>
  );
}
