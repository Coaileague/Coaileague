import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  DsPageWrapper, 
  DsPageHeader, 
  DsStatCard, 
  DsTabBar, 
  DsDataRow, 
  DsSectionCard, 
  DsBadge, 
  DsButton, 
  DsInput, 
  DsEmptyState 
} from "@/components/ui/ds-components";
import { 
  UniversalModal, 
  UniversalModalDescription, 
  UniversalModalFooter, 
  UniversalModalHeader, 
  UniversalModalTitle, 
  UniversalModalContent 
} from '@/components/ui/universal-modal';
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardContent, 
  CardDescription 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  GraduationCap, BookOpen, Award, Play, CheckCircle2, Clock,
  Plus, Search, Filter, TrendingUp, Users, Calendar as CalendarIcon, FileText,
  Video, Download, Upload, BarChart3, Target, Star, Trophy,
  AlertCircle, XCircle, Lock, Unlock, Settings, Edit, MapPin, QrCode, ExternalLink, ShieldCheck, Mail, ChevronLeft
} from "lucide-react";
import { 
  CourseCardSkeleton, 
  MetricsCardsSkeleton 
} from "@/components/loading-indicators/skeletons";
import { useModules } from "@/config/moduleConfig";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  startOfWeek,
  endOfWeek,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
} from "date-fns";

// --- Types ---

interface TrainingSession {
  id: string;
  title: string;
  description?: string;
  trainingType: string;
  requiredFor?: string;
  providerId?: string;
  instructorName?: string;
  location?: string;
  sessionDate: string;
  durationHours: string;
  maxAttendees?: number;
  tcoleHoursCredit: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  qrCode?: string;
  createdBy?: string;
}

interface TrainingAttendance {
  id: string;
  sessionId: string;
  employeeId: string;
  employeeName?: string;
  status: 'registered' | 'attended' | 'absent' | 'excused';
  checkInMethod?: 'qr' | 'manual' | 'self_report';
  checkedInAt?: string;
  tcoleHoursAwarded: string;
  certificateUrl?: string;
}

interface TrainingProvider {
  id: string;
  name: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  website?: string;
  approved: boolean;
  tcoleApproved: boolean;
  specialties?: string[];
  notes?: string;
}

interface TCOLECompliance {
  employeeId: string;
  employeeName: string;
  hoursAccumulated: number;
  hoursRequired: number;
  hoursRemaining: number;
  urgency: 'critical' | 'high' | 'medium' | 'low';
  daysUntilDeadline: number;
}

// --- Sub-components ---

function QRCheckInInput({ sessionId }: { sessionId: string }) {
  const { toast } = useToast();
  const [token, setToken] = useState('');

  const qrCheckInMutation = useMutation({
    mutationFn: () =>
      apiRequest('POST', `/api/training/sessions/${sessionId}/checkin`, { method: 'qr', token }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/sessions', sessionId, 'attendance'] });
      queryClient.invalidateQueries({ queryKey: ['/api/training/tcole-hours'] });
      toast({ title: "QR Check-in successful", description: "Your attendance has been recorded." });
      setToken('');
    },
    onError: (err: any) => {
      toast({ variant: 'destructive', title: "Invalid QR token", description: err?.message ?? "Please check the token and try again." });
    },
  });

  return (
    <div className="flex gap-1 w-full">
      <Input
        value={token}
        onChange={(e) => setToken(e.target.value)}
        placeholder="Enter QR token..."
        className="text-xs"
        data-testid="input-qr-token"
      />
      <DsButton
        size="sm"
        variant="outline"
        onClick={() => qrCheckInMutation.mutate()}
        disabled={!token || qrCheckInMutation.isPending}
        data-testid="button-qr-checkin"
      >
        <QrCode className="h-3 w-3" />
      </DsButton>
    </div>
  );
}

function SessionDetailView({ 
  sessionId, 
  onBack, 
  isAdmin 
}: { 
  sessionId: string; 
  onBack: () => void;
  isAdmin: boolean;
}) {
  const { toast } = useToast();
  
  const { data: session, isLoading: sessionLoading } = useQuery<TrainingSession>({
    queryKey: ['/api/training/sessions', sessionId],
  });

  const { data: attendance = [], isLoading: attendanceLoading } = useQuery<TrainingAttendance[]>({
    queryKey: ['/api/training/sessions', sessionId, 'attendance'],
  });

  const checkInMutation = useMutation({
    mutationFn: ({ employeeId, method }: { employeeId: string; method: string }) =>
      apiRequest('POST', `/api/training/sessions/${sessionId}/checkin`, { employeeId, method }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/sessions', sessionId, 'attendance'] });
      toast({ title: "Officer checked in successfully" });
    },
  });

  const selfCheckInMutation = useMutation({
    mutationFn: () =>
      apiRequest('POST', `/api/training/sessions/${sessionId}/checkin`, { method: 'self_report' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/sessions', sessionId, 'attendance'] });
      queryClient.invalidateQueries({ queryKey: ['/api/training/tcole-hours'] });
      toast({ title: "Checked in!", description: "Your attendance has been recorded." });
    },
    onError: (err: any) => {
      toast({ variant: 'destructive', title: "Check-in failed", description: err?.message ?? "Could not process check-in." });
    },
  });

  const registerMutation = useMutation({
    mutationFn: () =>
      apiRequest('POST', `/api/training/sessions/${sessionId}/register`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/sessions', sessionId, 'attendance'] });
      toast({ title: "Registered!", description: "You are now registered for this session." });
    },
    onError: (err: any) => {
      toast({ variant: 'destructive', title: "Registration failed", description: err?.message ?? "Could not register." });
    },
  });

  const completeMutation = useMutation({
    mutationFn: () => apiRequest('POST', `/api/training/sessions/${sessionId}/complete`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/sessions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/training/sessions', sessionId] });
      toast({ title: "Session completed and hours awarded" });
    },
  });

  const startMutation = useMutation({
    mutationFn: () => apiRequest('PATCH', `/api/training/sessions/${sessionId}`, { status: 'in_progress' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/sessions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/training/sessions', sessionId] });
      toast({ title: "Session started", description: "Officers can now check in." });
    },
    onError: (err: any) => {
      toast({ variant: 'destructive', title: "Could not start session", description: err?.message });
    },
  });

  if (sessionLoading) return <div className="p-8 text-center">Loading session details...</div>;
  // @ts-expect-error — TS migration: fix in refactoring sprint
  if (!session) return <DsEmptyState icon={AlertCircle} title="Session not found" description="The requested training session could not be located." />;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 mb-2">
        <DsButton variant="ghost" size="sm" onClick={onBack}>
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back to Sessions
        </DsButton>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <DsSectionCard title="Session Information">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1">
                <Label className="text-muted-foreground">Type</Label>
                <p className="font-medium capitalize">{session.trainingType}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-muted-foreground">TCOLE Credit</Label>
                <p className="font-medium">{session.tcoleHoursCredit} Hours</p>
              </div>
              <div className="space-y-1">
                <Label className="text-muted-foreground">Instructor</Label>
                <p className="font-medium">{session.instructorName || "TBD"}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-muted-foreground">Location</Label>
                <p className="font-medium">{session.location || "Remote"}</p>
              </div>
            </div>
            {session.description && (
              <div className="mt-4 pt-4 border-t">
                <Label className="text-muted-foreground">Description</Label>
                <p className="text-sm mt-1">{session.description}</p>
              </div>
            )}
          </DsSectionCard>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-lg">Attendee Roster</CardTitle>
                <CardDescription>{attendance.length} officers registered</CardDescription>
              </div>
              {isAdmin && session.status !== 'completed' && session.status !== 'cancelled' && (
                <div className="flex items-center gap-2">
                  {session.status === 'scheduled' && (
                    <DsButton
                      size="sm"
                      variant="outline"
                      onClick={() => startMutation.mutate()}
                      disabled={startMutation.isPending}
                      data-testid="button-start-session"
                    >
                      <Play className="h-4 w-4 mr-2" />
                      Start Session
                    </DsButton>
                  )}
                  {session.status === 'in_progress' && (
                    <DsButton 
                      size="sm" 
                      onClick={() => completeMutation.mutate()}
                      disabled={completeMutation.isPending}
                      data-testid="button-complete-session"
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Mark Complete
                    </DsButton>
                  )}
                </div>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {attendanceLoading ? (
                  <div className="p-4">Loading roster...</div>
                ) : attendance.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">No attendees registered for this session.</div>
                ) : (
                  attendance.map((record) => (
                    <div key={record.id} className="p-4 flex items-center justify-between" data-testid={`row-attendee-${record.id}`}>
                      <div>
                        <p className="font-medium">{record.employeeName || "Unknown Officer"}</p>
                        <p className="text-xs text-muted-foreground">
                          {record.checkedInAt 
                            ? `Checked in at ${format(new Date(record.checkedInAt), "p")}` 
                            : "Awaiting check-in"}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant={record.status === 'attended' ? 'default' : 'outline'}>
                          {record.status}
                        </Badge>
                        {isAdmin && record.status === 'registered' && (
                          <DsButton 
                            size="sm" 
                            variant="outline" 
                            onClick={() => checkInMutation.mutate({ employeeId: record.employeeId, method: 'manual' })}
                            disabled={checkInMutation.isPending}
                            data-testid={`button-checkin-${record.id}`}
                          >
                            Check-in
                          </DsButton>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-md">Session Status</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4">
              <Badge className={cn("w-full justify-center py-2 text-sm", 
                session.status === 'scheduled' ? "bg-blue-500/10 text-blue-600 border-blue-500/20" :
                session.status === 'in_progress' ? "bg-amber-500/10 text-amber-600 border-amber-500/20" :
                session.status === 'completed' ? "bg-green-500/10 text-green-600 border-green-500/20" :
                "bg-red-500/10 text-red-600 border-red-500/20"
              )}>
                {session.status.toUpperCase()}
              </Badge>
              
              {(session.status === 'scheduled' || session.status === 'in_progress') && (
                <div className="bg-muted p-4 rounded-lg w-full flex flex-col items-center gap-3">
                  <div className="bg-white p-2 rounded shadow-sm">
                    <QrCode className="h-24 w-24" />
                  </div>
                  <div className="text-center w-full">
                    <p className="text-xs font-bold uppercase text-muted-foreground">QR Token</p>
                    <p className="text-[10px] font-mono mt-1 text-muted-foreground break-all">{session.qrCode || session.id}</p>
                  </div>
                  {!isAdmin && (
                    <div className="w-full space-y-2">
                      <DsButton
                        className="w-full"
                        size="sm"
                        variant="outline"
                        onClick={() => registerMutation.mutate()}
                        disabled={registerMutation.isPending}
                        data-testid="button-officer-register"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Register for Session
                      </DsButton>
                      {session.status === 'in_progress' && (
                        <>
                          <DsButton
                            className="w-full"
                            size="sm"
                            onClick={() => selfCheckInMutation.mutate()}
                            disabled={selfCheckInMutation.isPending}
                            data-testid="button-self-checkin"
                          >
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Self Check-in
                          </DsButton>
                          <QRCheckInInput sessionId={session.id} />
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const STATUS_DOT: Record<string, string> = {
  scheduled: 'bg-blue-500',
  in_progress: 'bg-green-500',
  completed: 'bg-muted-foreground',
  cancelled: 'bg-destructive',
};

function SessionCalendarTab({ 
  sessions, 
  onSelectSession,
  isAdmin,
}: { 
  sessions: TrainingSession[]; 
  onSelectSession: (id: string) => void;
  isAdmin: boolean;
}) {
  const { toast } = useToast();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const registerMutation = useMutation({
    mutationFn: (sessionId: string) =>
      apiRequest('POST', `/api/training/sessions/${sessionId}/register`, {}),
    onSuccess: (_data, sessionId) => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/sessions', sessionId, 'attendance'] });
      toast({ title: "Registered successfully", description: "You are now registered for this training session." });
    },
    onError: (err: any) => {
      toast({ variant: 'destructive', title: "Registration failed", description: err?.message ?? "Could not register for session." });
    },
  });

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [currentMonth]);

  const sessionsByDay = useMemo(() => {
    const map = new Map<string, TrainingSession[]>();
    for (const s of sessions) {
      const key = format(new Date(s.sessionDate), 'yyyy-MM-dd');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return map;
  }, [sessions]);

  const selectedDaySessions = useMemo(() => {
    if (!selectedDay) return [];
    const key = format(selectedDay, 'yyyy-MM-dd');
    return sessionsByDay.get(key) ?? [];
  }, [selectedDay, sessionsByDay]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <Button size="icon" variant="ghost" onClick={() => setCurrentMonth(m => subMonths(m, 1))} data-testid="button-prev-month">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="font-semibold text-base" data-testid="text-calendar-month">
              {format(currentMonth, 'MMMM yyyy')}
            </span>
            <Button size="icon" variant="ghost" onClick={() => setCurrentMonth(m => addMonths(m, 1))} data-testid="button-next-month">
              <ChevronLeft className="h-4 w-4 rotate-180" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-7 mb-1">
            {DAY_LABELS.map(d => (
              <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px bg-border rounded-md overflow-hidden">
            {calendarDays.map((day) => {
              const key = format(day, 'yyyy-MM-dd');
              const daySessions = sessionsByDay.get(key) ?? [];
              const isCurrentMonth = isSameMonth(day, currentMonth);
              const isSelected = selectedDay ? isSameDay(day, selectedDay) : false;
              const isToday = isSameDay(day, new Date());
              return (
                <button
                  key={key}
                  onClick={() => setSelectedDay(prev => prev && isSameDay(prev, day) ? null : day)}
                  data-testid={`button-calendar-day-${key}`}
                  className={cn(
                    "bg-background min-h-[56px] p-1 flex flex-col items-start text-left transition-colors",
                    !isCurrentMonth && "opacity-40",
                    isSelected && "ring-2 ring-inset ring-primary",
                    !isSelected && "hover:bg-accent/50",
                  )}
                >
                  <span className={cn(
                    "text-xs w-5 h-5 flex items-center justify-center rounded-full mb-1",
                    isToday && "bg-primary text-primary-foreground font-bold",
                    !isToday && "text-foreground",
                  )}>
                    {format(day, 'd')}
                  </span>
                  <div className="flex flex-wrap gap-px">
                    {daySessions.slice(0, 3).map(s => (
                      <span
                        key={s.id}
                        className={cn("w-1.5 h-1.5 rounded-full", STATUS_DOT[s.status] ?? 'bg-muted-foreground')}
                      />
                    ))}
                    {daySessions.length > 3 && (
                      <span className="text-[9px] text-muted-foreground leading-none mt-px">+{daySessions.length - 3}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />Scheduled</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />In Progress</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-muted-foreground inline-block" />Completed</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-destructive inline-block" />Cancelled</span>
          </div>
        </CardContent>
      </Card>

      {selectedDay && (
        <div className="space-y-2">
          <h3 className="font-semibold text-sm text-muted-foreground px-1">
            {format(selectedDay, 'EEEE, MMMM d')} — {selectedDaySessions.length === 0 ? 'No sessions' : `${selectedDaySessions.length} session${selectedDaySessions.length !== 1 ? 's' : ''}`}
          </h3>
          {selectedDaySessions.length === 0 && (
            <p className="text-sm text-muted-foreground px-1">No training sessions scheduled for this day.</p>
          )}
          {selectedDaySessions.map((session) => (
            <Card key={session.id} className="hover-elevate">
              <CardContent className="p-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1 cursor-pointer flex-1" onClick={() => onSelectSession(session.id)}>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{session.title}</h3>
                      <Badge variant={
                        session.status === 'scheduled' ? 'outline' :
                        session.status === 'in_progress' ? 'secondary' :
                        session.status === 'completed' ? 'default' : 'destructive'
                      }>
                        {session.status}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{format(new Date(session.sessionDate), 'p')} · {session.durationHours} hrs</span>
                      <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{session.location || "Remote"}</span>
                      <span className="flex items-center gap-1"><ShieldCheck className="h-3 w-3 text-blue-500" />{session.tcoleHoursCredit} TCOLE hrs</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {!isAdmin && (session.status === 'scheduled' || session.status === 'in_progress') && (
                      <DsButton
                        size="sm"
                        variant="outline"
                        onClick={(e) => { e.stopPropagation(); registerMutation.mutate(session.id); }}
                        disabled={registerMutation.isPending}
                        data-testid={`button-register-session-${session.id}`}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Register
                      </DsButton>
                    )}
                    <DsButton size="sm" variant="outline" onClick={() => onSelectSession(session.id)} data-testid={`button-view-session-${session.id}`}>
                      View
                    </DsButton>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!selectedDay && sessions.length === 0 && (
        // @ts-expect-error — TS migration: fix in refactoring sprint
        <DsEmptyState icon={CalendarIcon} title="No sessions scheduled" description="Check back later for new training opportunities." />
      )}
    </div>
  );
}

function MyTCOLEHoursTab() {
  const { data: stats, isLoading } = useQuery<{ hoursAccumulated: number; hoursRequired: number }>({
    queryKey: ['/api/training/tcole-hours'],
  });

  if (isLoading) return <div>Loading hours...</div>;

  const hours = stats?.hoursAccumulated || 0;
  const required = stats?.hoursRequired || 40;
  const progress = Math.min((hours / required) * 100, 100);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>My TCOLE Compliance</CardTitle>
          <CardDescription>Annual hour accumulation for {new Date().getFullYear()}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between items-end">
            <div>
              <span className="text-4xl font-bold">{hours}</span>
              <span className="text-muted-foreground text-lg ml-1">/ {required} hrs</span>
            </div>
            <Badge variant={progress >= 100 ? "default" : "secondary"}>
              {progress >= 100 ? "Compliant" : "In Progress"}
            </Badge>
          </div>
          <Progress value={progress} className="h-3" />
          <p className="text-sm text-muted-foreground">
            {progress >= 100 
              ? "You have met your TCOLE requirements for this year. Great job!" 
              : `You need ${required - hours} more hours to reach your annual requirement.`}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Upcoming Credit Opportunities</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6 text-muted-foreground">
            <Award className="h-12 w-12 mx-auto mb-2 opacity-20" />
            <p className="text-sm">Enrolling in sessions will show your projected hours here.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ComplianceDashboardTab() {
  const { data: compliance = [], isLoading } = useQuery<TCOLECompliance[]>({
    queryKey: ['/api/training-compliance/tcole-compliance'],
  });

  if (isLoading) return <div>Loading compliance data...</div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Workspace TCOLE Compliance</CardTitle>
        <CardDescription>Officers requiring hours before year-end deadline</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-3 px-2 font-medium">Officer</th>
                <th className="text-left py-3 px-2 font-medium">Hours</th>
                <th className="text-left py-3 px-2 font-medium">Required</th>
                <th className="text-left py-3 px-2 font-medium">Remaining</th>
                <th className="text-left py-3 px-2 font-medium">Urgency</th>
              </tr>
            </thead>
            <tbody>
              {compliance.map((item) => (
                <tr key={item.employeeId} className="border-b hover:bg-muted/50 transition-colors">
                  <td className="py-3 px-2 font-medium">{item.employeeName}</td>
                  <td className="py-3 px-2">{item.hoursAccumulated}</td>
                  <td className="py-3 px-2">{item.hoursRequired}</td>
                  <td className="py-3 px-2 font-semibold text-orange-600">{item.hoursRemaining}</td>
                  <td className="py-3 px-2">
                    <Badge variant={
                      item.urgency === 'critical' ? 'destructive' :
                      item.urgency === 'high' ? 'destructive' :
                      item.urgency === 'medium' ? 'secondary' : 'outline'
                    }>
                      {item.urgency}
                    </Badge>
                  </td>
                </tr>
              ))}
              {compliance.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-muted-foreground">
                    All officers are currently on track for TCOLE compliance.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function ProviderDirectoryTab() {
  const { data: providers = [], isLoading } = useQuery<TrainingProvider[]>({
    queryKey: ['/api/training/providers'],
  });

  if (isLoading) return <div>Loading providers...</div>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {providers.map((provider) => (
        <Card key={provider.id} className="flex flex-col">
          <CardHeader>
            <div className="flex justify-between items-start gap-2">
              <CardTitle className="text-lg">{provider.name}</CardTitle>
              {provider.tcoleApproved && (
                <Badge variant="default" title="TCOLE Approved Provider" className="bg-blue-600 hover:bg-blue-700">
                  TCOLE
                </Badge>
              )}
            </div>
            {provider.specialties && provider.specialties.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {provider.specialties.map(s => (
                  <Badge key={s} variant="outline" className="text-[10px] h-4">
                    {s}
                  </Badge>
                ))}
              </div>
            )}
          </CardHeader>
          <CardContent className="flex-1 space-y-3">
            <p className="text-sm text-muted-foreground line-clamp-3">
              {provider.notes || "No additional information provided."}
            </p>
            <div className="space-y-1 text-sm">
              {provider.contactEmail && (
                <div className="flex items-center gap-2">
                  <Mail className="h-3 w-3" />
                  <a href={`mailto:${provider.contactEmail}`} className="hover:underline">{provider.contactEmail}</a>
                </div>
              )}
              {provider.website && (
                <div className="flex items-center gap-2">
                  <ExternalLink className="h-3 w-3" />
                  <a href={provider.website} target="_blank" rel="noopener noreferrer" className="hover:underline text-blue-500">
                    Official Website
                  </a>
                </div>
              )}
              {provider.address && (
                <div className="flex items-center gap-2">
                  <MapPin className="h-3 w-3" />
                  <span>{provider.address}</span>
                </div>
              )}
            </div>
          </CardContent>
          <div className="p-4 border-t bg-muted/20">
            <Button variant="ghost" className="w-full text-xs" size="sm" data-testid={`button-provider-details-${provider.id}`}>
              View Full Profile
            </Button>
          </div>
        </Card>
      ))}
      {providers.length === 0 && (
        <div className="col-span-full">
          {/* @ts-ignore */}
          <DsEmptyState icon={Users} title="No providers registered" description="Approved training providers will appear here." />
        </div>
      )}
    </div>
  );
}

// --- Create Session Modal ---

const TRAINING_TYPES = [
  { value: 'firearms_qualification', label: 'Firearms Qualification' },
  { value: 'de_escalation', label: 'De-Escalation' },
  { value: 'tcole_mandated', label: 'TCOLE Mandated' },
  { value: 'online', label: 'Online / eLearning' },
  { value: 'in_house', label: 'In-House' },
  { value: 'third_party', label: 'Third-Party Provider' },
  { value: 'first_aid', label: 'First Aid / CPR' },
  { value: 'legal', label: 'Legal / Use of Force' },
  { value: 'other', label: 'Other' },
];

const REQUIRED_FOR_OPTIONS = [
  { value: 'all', label: 'All Officers' },
  { value: 'armed', label: 'Armed Officers' },
  { value: 'unarmed', label: 'Unarmed Officers' },
  { value: 'supervisors', label: 'Supervisors' },
  { value: 'custom', label: 'Custom Group' },
];

function CreateSessionModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    title: '',
    training_type: 'firearms_qualification',
    required_for: 'all',
    instructor_name: '',
    location: '',
    session_date: '',
    duration_hours: '8',
    tcole_hours_credit: '8',
    max_attendees: '',
    description: '',
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof form) =>
      apiRequest('POST', '/api/training/sessions', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/sessions'] });
      toast({ title: "Session scheduled", description: "The training session has been created." });
      onClose();
      setForm({
        title: '',
        training_type: 'firearms_qualification',
        required_for: 'all',
        instructor_name: '',
        location: '',
        session_date: '',
        duration_hours: '8',
        tcole_hours_credit: '8',
        max_attendees: '',
        description: '',
      });
    },
    onError: (err: any) => {
      toast({ variant: 'destructive', title: "Failed to schedule session", description: err?.message ?? "An error occurred." });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.session_date || !form.training_type) {
      toast({ variant: 'destructive', title: "Missing required fields", description: "Title, type, and date are required." });
      return;
    }
    createMutation.mutate(form);
  };

  return (
    <UniversalModal open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <UniversalModalContent className="max-w-2xl">
        <UniversalModalHeader>
          <UniversalModalTitle>Schedule Training Session</UniversalModalTitle>
          <UniversalModalDescription>Create a new TCOLE-eligible training session for your workspace.</UniversalModalDescription>
        </UniversalModalHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Label htmlFor="session-title">Session Title *</Label>
              <Input
                id="session-title"
                value={form.title}
                onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g., TCOLE Basic Firearms Proficiency"
                data-testid="input-session-title"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="session-type">Training Type *</Label>
              <Select value={form.training_type} onValueChange={(v) => setForm(f => ({ ...f, training_type: v }))}>
                <SelectTrigger id="session-type" data-testid="select-training-type" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRAINING_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="session-required-for">Required For</Label>
              <Select value={form.required_for} onValueChange={(v) => setForm(f => ({ ...f, required_for: v }))}>
                <SelectTrigger id="session-required-for" data-testid="select-required-for" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REQUIRED_FOR_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="session-date">Session Date & Time *</Label>
              <Input
                id="session-date"
                type="datetime-local"
                value={form.session_date}
                onChange={(e) => setForm(f => ({ ...f, session_date: e.target.value }))}
                data-testid="input-session-date"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="session-instructor">Instructor</Label>
              <Input
                id="session-instructor"
                value={form.instructor_name}
                onChange={(e) => setForm(f => ({ ...f, instructor_name: e.target.value }))}
                placeholder="Instructor name"
                data-testid="input-instructor-name"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="session-location">Location</Label>
              <Input
                id="session-location"
                value={form.location}
                onChange={(e) => setForm(f => ({ ...f, location: e.target.value }))}
                placeholder="Building, address, or 'Remote'"
                data-testid="input-session-location"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="session-duration">Duration (hours)</Label>
              <Input
                id="session-duration"
                type="number"
                min="0.5"
                step="0.5"
                value={form.duration_hours}
                onChange={(e) => setForm(f => ({ ...f, duration_hours: e.target.value }))}
                data-testid="input-duration-hours"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="session-tcole-credit">TCOLE Credit Hours</Label>
              <Input
                id="session-tcole-credit"
                type="number"
                min="0"
                step="0.5"
                value={form.tcole_hours_credit}
                onChange={(e) => setForm(f => ({ ...f, tcole_hours_credit: e.target.value }))}
                data-testid="input-tcole-credit"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="session-max-attendees">Max Attendees (optional)</Label>
              <Input
                id="session-max-attendees"
                type="number"
                min="1"
                value={form.max_attendees}
                onChange={(e) => setForm(f => ({ ...f, max_attendees: e.target.value }))}
                placeholder="Leave blank for unlimited"
                data-testid="input-max-attendees"
                className="mt-1"
              />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="session-description">Description</Label>
              <Textarea
                id="session-description"
                value={form.description}
                onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Session overview, topics, prerequisites..."
                data-testid="input-session-description"
                className="mt-1"
                rows={3}
              />
            </div>
          </div>
          <UniversalModalFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={createMutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-session">
              {createMutation.isPending ? "Scheduling..." : "Schedule Session"}
            </Button>
          </UniversalModalFooter>
        </form>
      </UniversalModalContent>
    </UniversalModal>
  );
}

// --- Main Page ---

export default function TrainingPage() {
  const { user } = useAuth();
  const modules = useModules();
  const module = modules.getModule('learning_management');
  const [activeTab, setActiveTab] = useState("calendar");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const { toast } = useToast();

  const { data: sessions = [], isLoading: sessionsLoading } = useQuery<TrainingSession[]>({
    queryKey: ['/api/training/sessions'],
    enabled: !!user,
  });

  const isAdmin = user?.workspaceRole === "org_owner" || user?.workspaceRole === "co_owner" || user?.platformRole === "root_admin";

  if (!module?.enabled) {
    return (
      <DsPageWrapper>
        {/* @ts-ignore */}
        <DsEmptyState icon={Lock} title="Module Disabled" description="The training management module is not enabled for your organization." />
      </DsPageWrapper>
    );
  }

  return (
    <DsPageWrapper>
      <CreateSessionModal open={showCreateModal} onClose={() => setShowCreateModal(false)} />
      <DsPageHeader 
        title="Training & TCOLE Compliance" 
        subtitle="Schedule sessions, track hours, and manage certifications."
        actions={
          isAdmin && !selectedSessionId && (
            <DsButton onClick={() => setShowCreateModal(true)} data-testid="button-schedule-session">
              <Plus className="h-4 w-4 mr-2" />
              Schedule Session
            </DsButton>
          )
        }
      />

      {!selectedSessionId && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <DsStatCard 
            label="Sessions Today" 
            value={sessions.filter(s => {
              const date = new Date(s.sessionDate);
              const today = new Date();
              return date.toDateString() === today.toDateString();
            }).length} 
            icon={CalendarIcon} 
          />
          <DsStatCard 
            label="My TCOLE Hours" 
            value="24.5" 
            icon={ShieldCheck} 
            color="success" 
          />
          <DsStatCard 
            label="Approvals Pending" 
            value="3" 
            icon={CheckCircle2} 
            color="warning" 
          />
          <DsStatCard 
            label="TCOLE Providers" 
            value="12" 
            icon={Award} 
            color="info" 
          />
        </div>
      )}

      {selectedSessionId ? (
        <SessionDetailView 
          sessionId={selectedSessionId} 
          onBack={() => setSelectedSessionId(null)}
          isAdmin={isAdmin}
        />
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <DsTabBar
            tabs={[
              { id: 'calendar', label: 'Calendar' },
              { id: 'sessions', label: 'Sessions' },
              { id: 'my-hours', label: 'My TCOLE Hours' },
              { id: 'compliance', label: 'Compliance Dashboard' },
              { id: 'providers', label: 'Providers' },
            ]}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />

          <TabsContent value="calendar" className="mt-6">
            <SessionCalendarTab sessions={sessions} onSelectSession={setSelectedSessionId} isAdmin={isAdmin} />
          </TabsContent>

          <TabsContent value="sessions" className="mt-6">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Training Sessions</CardTitle>
                    <CardDescription>All historical and upcoming sessions</CardDescription>
                  </div>
                  <div className="flex gap-2">
                     <Input placeholder="Search..." className="w-64" data-testid="input-search-sessions" />
                     {/* @ts-ignore */}
                     <DsButton variant="outline" size="icon">
                       <Filter className="h-4 w-4" />
                     </DsButton>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <SessionCalendarTab sessions={sessions} onSelectSession={setSelectedSessionId} isAdmin={isAdmin} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="my-hours" className="mt-6">
            <MyTCOLEHoursTab />
          </TabsContent>

          <TabsContent value="compliance" className="mt-6">
            <ComplianceDashboardTab />
          </TabsContent>

          <TabsContent value="providers" className="mt-6">
            <ProviderDirectoryTab />
          </TabsContent>
        </Tabs>
      )}
    </DsPageWrapper>
  );
}
