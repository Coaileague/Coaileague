import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspaceAccess } from "@/hooks/useWorkspaceAccess";
import { useIsMobile } from "@/hooks/use-mobile";
import { hasManagerAccess } from "@/config/mobileConfig";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub/CanvasHubRegistry";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Users, 
  Clock, 
  Calendar, 
  MapPin, 
  Phone, 
  Mail,
  CheckCircle2,
  Circle,
  ArrowLeft,
  UserCheck,
  AlertCircle
} from "lucide-react";

interface TeamMember {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  role?: string;
  organizationalTitle?: string;
  isClockedIn: boolean;
  clockInTime: string | null;
  isScheduledToday: boolean;
  scheduledShift: {
    startTime: string;
    endTime: string;
    clientId?: string;
  } | null;
  hoursWorkedToday: number;
}

interface TeamResponse {
  teamMembers: TeamMember[];
  summary: {
    total: number;
    clockedIn: number;
    scheduledToday: number;
  };
}

function TeamMemberCard({ member }: { member: TeamMember }) {
  const initials = `${member.firstName?.[0] || ''}${member.lastName?.[0] || ''}`.toUpperCase();
  
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <Card className="hover-elevate" data-testid={`team-member-card-${member.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Avatar className="h-12 w-12 shrink-0">
            <AvatarFallback className={member.isClockedIn ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-muted"}>
              {initials}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-medium truncate">
                {member.firstName} {member.lastName}
              </h3>
              {member.isClockedIn && (
                <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800 shrink-0">
                  <Circle className="h-2 w-2 fill-current mr-1" />
                  Working
                </Badge>
              )}
            </div>
            
            {member.role && (
              <p className="text-sm text-muted-foreground truncate">{member.role}</p>
            )}

            <div className="mt-2 space-y-1">
              {member.isClockedIn && member.clockInTime && (
                <div className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  <span>Clocked in at {formatTime(member.clockInTime)}</span>
                </div>
              )}
              
              {member.isScheduledToday && member.scheduledShift && (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    {formatTime(member.scheduledShift.startTime)} - {formatTime(member.scheduledShift.endTime)}
                  </span>
                </div>
              )}
              
              {member.hoursWorkedToday > 0 && (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  <span>{member.hoursWorkedToday.toFixed(1)} hrs today</span>
                </div>
              )}
            </div>
          </div>
        </div>
        
        {(member.phone || member.email) && (
          <div className="mt-3 pt-3 border-t flex flex-wrap gap-3">
            {member.phone && (
              <a 
                href={`tel:${member.phone}`} 
                className="flex items-center gap-1.5 text-sm text-primary hover:underline"
                data-testid={`call-member-${member.id}`}
              >
                <Phone className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{member.phone}</span>
                <span className="sm:hidden">Call</span>
              </a>
            )}
            {member.email && (
              <a 
                href={`mailto:${member.email}`} 
                className="flex items-center gap-1.5 text-sm text-primary hover:underline"
                data-testid={`email-member-${member.id}`}
              >
                <Mail className="h-3.5 w-3.5" />
                <span className="hidden sm:inline truncate max-w-[150px]">{member.email}</span>
                <span className="sm:hidden">Email</span>
              </a>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TeamSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map(i => (
        <Card key={i}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-40" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function MyTeamContent() {
  const [activeTab, setActiveTab] = useState<'working' | 'scheduled' | 'all'>('working');
  
  const { data, isLoading, error } = useQuery<TeamResponse>({
    queryKey: ['/api/my-team'],
  });

  const teamMembers = data?.teamMembers || [];
  const summary = data?.summary || { total: 0, clockedIn: 0, scheduledToday: 0 };

  const filteredMembers = teamMembers.filter(member => {
    switch (activeTab) {
      case 'working':
        return member.isClockedIn;
      case 'scheduled':
        return member.isScheduledToday;
      case 'all':
      default:
        return true;
    }
  });

  if (error) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-medium mb-1">Unable to Load Team</h3>
          <p className="text-sm text-muted-foreground">
            {(error as any)?.message || "Please try again later"}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Card className="text-center p-2 sm:p-3">
          <div className="text-xl sm:text-2xl font-bold">{summary.total}</div>
          <div className="text-xs text-muted-foreground">Team</div>
        </Card>
        <Card className="text-center p-2 sm:p-3 bg-green-50 dark:bg-green-900/20">
          <div className="text-xl sm:text-2xl font-bold text-green-600 dark:text-green-400">{summary.clockedIn}</div>
          <div className="text-xs text-muted-foreground">Working</div>
        </Card>
        <Card className="text-center p-2 sm:p-3 bg-blue-50 dark:bg-blue-900/20">
          <div className="text-xl sm:text-2xl font-bold text-blue-600 dark:text-blue-400">{summary.scheduledToday}</div>
          <div className="text-xs text-muted-foreground">Scheduled</div>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList className="w-full grid grid-cols-3 h-auto">
          <TabsTrigger value="working" className="gap-1 min-w-0 text-xs sm:text-sm" data-testid="tab-working">
            <Circle className="h-3 w-3 shrink-0 fill-green-500 text-green-500" />
            <span className="truncate">Working ({summary.clockedIn})</span>
          </TabsTrigger>
          <TabsTrigger value="scheduled" className="gap-1 min-w-0 text-xs sm:text-sm" data-testid="tab-scheduled">
            <Calendar className="h-3 w-3 shrink-0" />
            <span className="truncate">Today ({summary.scheduledToday})</span>
          </TabsTrigger>
          <TabsTrigger value="all" className="min-w-0 text-xs sm:text-sm" data-testid="tab-all">
            <span className="truncate">All ({summary.total})</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {isLoading ? (
            <TeamSkeleton />
          ) : filteredMembers.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center">
                <UserCheck className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <h3 className="font-medium mb-1">
                  {activeTab === 'working' ? 'No One Working Right Now' : 
                   activeTab === 'scheduled' ? 'No One Scheduled Today' : 
                   'No Team Members'}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {activeTab === 'working' ? 'Check back when employees clock in' :
                   activeTab === 'scheduled' ? 'No shifts scheduled for today' :
                   'Assign employees to your team to see them here'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredMembers.map(member => (
                <TeamMemberCard key={member.id} member={member} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function MyTeam() {
  const { user } = useAuth();
  const { workspaceRole } = useWorkspaceAccess();
  const [, setLocation] = useLocation();
  const isMobile = useIsMobile();

  const isManager = hasManagerAccess(workspaceRole);

  const noAccessPageConfig: CanvasPageConfig = {
    id: "my-team",
    title: "My Team",
    subtitle: "Team Dashboard",
    category: "operations",
  };

  if (!isManager) {
    return (
      <CanvasHubPage config={noAccessPageConfig}>
        <Card className="max-w-md mx-auto mt-8">
          <CardContent className="p-6 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <h3 className="font-medium mb-1">Manager Access Required</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Only managers and supervisors can view the team dashboard.
            </p>
            <Button onClick={() => setLocation('/dashboard')} data-testid="button-back-dashboard">
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </CanvasHubPage>
    );
  }

  const teamAction = isMobile ? (
    <Button size="icon" variant="ghost" onClick={() => setLocation('/employees')} data-testid="button-manage-employees">
      <Users className="h-5 w-5" />
    </Button>
  ) : (
    <Button onClick={() => setLocation('/employees')} variant="outline" data-testid="button-manage-team">
      Manage Employees
    </Button>
  );

  const pageConfig: CanvasPageConfig = {
    id: "my-team",
    title: "My Team",
    subtitle: "Monitor your team's activity today",
    category: "operations",
    headerActions: teamAction,
    backButton: true,
    onBack: () => setLocation('/dashboard'),
    withBottomNav: isMobile,
  };

  return (
    <CanvasHubPage config={pageConfig}>
      <div className={isMobile ? "pb-20" : "max-w-4xl mx-auto"}>
        <MyTeamContent />
      </div>
    </CanvasHubPage>
  );
}
