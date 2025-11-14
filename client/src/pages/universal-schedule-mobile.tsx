import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { 
  Calendar, Clock, Users, Plus, Bot, 
  AlertCircle, X, MessageSquare, FileText, MapPin, ChevronLeft,
  ChevronRight, Menu, Bell, Grid, List, Building, Sparkles,
  CheckCircle
} from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useEmployee } from '@/hooks/useEmployee';

type ViewMode = 'day' | 'week' | 'list';

interface Shift {
  id: string;
  employeeId: string | null;
  clientId: string;
  position: string;
  startTime: string;
  endTime: string;
  date: string;
  status: string;
  notes?: string;
  createdByAI?: boolean;
}

export default function UniversalScheduleMobile() {
  const { toast } = useToast();
  const { employee, workspaceRole } = useEmployee();
  
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<ViewMode>('day');
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [showAIPanel, setShowAIPanel] = useState(false);

  const [shiftForm, setShiftForm] = useState({
    employeeId: '',
    clientId: '',
    position: '',
    startTime: '',
    endTime: '',
    date: new Date().toISOString().split('T')[0],
    notes: '',
    isOpenShift: false,
    createChatroom: false
  });

  const canManageShifts = workspaceRole === 'leader' || workspaceRole === 'admin';

  // Fetch shifts
  const { data: shiftsData = [] } = useQuery({
    queryKey: ['/api/shifts', { 
      startDate: getWeekStart(currentDate).toISOString().split('T')[0],
      endDate: getWeekEnd(currentDate).toISOString().split('T')[0]
    }],
  });
  const shifts = shiftsData as Shift[];

  // Fetch employees
  const { data: employeesData = [] } = useQuery({
    queryKey: ['/api/employees'],
  });
  const employees = employeesData as Array<{ id: string; firstName: string; lastName: string; position: string }>;

  // Fetch clients
  const { data: clientsData = [] } = useQuery({
    queryKey: ['/api/clients'],
  });
  const clients = clientsData as Array<{ id: string; companyName: string }>;

  // Fetch AI proposals
  const { data: aiProposalsData = [] } = useQuery({
    queryKey: ['/api/scheduleos/proposals', { status: 'pending' }],
    enabled: canManageShifts,
  });
  const aiProposals = aiProposalsData as Array<{ id: string; confidenceScore: number; reasoning: string }>;

  // Create shift
  const createShift = useMutation({
    mutationFn: async (data: typeof shiftForm) => {
      const response = await apiRequest('POST', '/api/shifts', {
        employeeId: data.isOpenShift ? null : data.employeeId,
        clientId: data.clientId,
        position: data.position,
        startTime: `${data.date}T${data.startTime}:00`,
        endTime: `${data.date}T${data.endTime}:00`,
        status: data.isOpenShift ? 'open' : 'scheduled',
        notes: data.notes,
      });
      return response.json();
    },
    onSuccess: async (newShift: Shift) => {
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
      toast({
        title: 'Shift Created',
        description: shiftForm.isOpenShift ? 'Open shift created' : 'Shift assigned'
      });
      
      if (shiftForm.createChatroom) {
        try {
          await apiRequest('POST', '/api/chat-rooms', {
            name: `Shift: ${shiftForm.position} - ${shiftForm.date}`,
            type: 'shift',
            shiftId: newShift.id,
            autoCloseAt: newShift.endTime,
          });
          toast({
            title: 'Chatroom Created',
            description: 'Shift chatroom created'
          });
        } catch (error) {
          console.error('Failed to create chatroom:', error);
        }
      }
      
      setShowShiftModal(false);
      resetForm();
    },
    onError: () => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to create shift'
      });
    }
  });

  // AI Fill
  const aiFillShift = useMutation({
    mutationFn: async (shiftId: string) => {
      const response = await apiRequest('POST', `/api/shifts/${shiftId}/ai-fill`, {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
      toast({
        title: 'AI Assignment Complete',
        description: 'Best employee assigned'
      });
    },
  });

  // Approve proposal
  const approveProposal = useMutation({
    mutationFn: async (proposalId: string) => {
      const response = await apiRequest('POST', `/api/scheduleos/proposals/${proposalId}/approve`, {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/scheduleos/proposals'] });
      toast({
        title: 'Proposal Approved',
        description: 'Schedule optimized'
      });
    }
  });

  const resetForm = () => {
    setShiftForm({
      employeeId: '',
      clientId: '',
      position: '',
      startTime: '',
      endTime: '',
      date: new Date().toISOString().split('T')[0],
      notes: '',
      isOpenShift: false,
      createChatroom: false
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    }).format(date);
  };

  const todayShifts = shifts.filter((s: Shift) => {
    const shiftDate = new Date(s.startTime).toDateString();
    return shiftDate === currentDate.toDateString();
  }).sort((a: Shift, b: Shift) => 
    new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );

  const getEmployeeName = (employeeId: string | null) => {
    if (!employeeId) return 'Unassigned';
    const emp = employees.find((e: any) => e.id === employeeId);
    return emp ? `${emp.firstName} ${emp.lastName}` : 'Unknown';
  };

  const getClientName = (clientId: string) => {
    const client = clients.find((c: any) => c.id === clientId);
    return client?.companyName || 'Unknown Client';
  };

  const openShiftCount = todayShifts.filter((s: Shift) => s.status === 'open').length;
  const aiGeneratedCount = todayShifts.filter((s: Shift) => s.createdByAI).length;

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary to-primary/80 text-primary-foreground sticky top-0 z-40 shadow-lg">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <button className="p-2 hover:bg-white/20 rounded-lg" data-testid="button-menu-toggle">
              <Menu className="w-6 h-6" />
            </button>
            <h1 className="text-lg font-bold">ScheduleOS™</h1>
            <button className="p-2 hover:bg-white/20 rounded-lg relative" data-testid="button-notifications">
              <Bell className="w-6 h-6" />
              {aiProposals.length > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
              )}
            </button>
          </div>

          {/* Date Nav */}
          <div className="flex items-center justify-between">
            <button 
              onClick={() => {
                const newDate = new Date(currentDate);
                newDate.setDate(newDate.getDate() - 1);
                setCurrentDate(newDate);
              }}
              className="p-2 hover:bg-white/20 rounded-lg"
              data-testid="button-prev-day"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="text-center">
              <div className="text-sm opacity-90">
                {currentDate.toDateString() === new Date().toDateString() ? 'Today' : formatDate(currentDate.toISOString())}
              </div>
              <div className="font-bold">{formatDate(currentDate.toISOString())}</div>
            </div>
            <button 
              onClick={() => {
                const newDate = new Date(currentDate);
                newDate.setDate(newDate.getDate() + 1);
                setCurrentDate(newDate);
              }}
              className="p-2 hover:bg-white/20 rounded-lg"
              data-testid="button-next-day"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* AI Bar */}
        {canManageShifts && (
          <div className="bg-white/10 backdrop-blur px-4 py-2 flex items-center justify-between text-sm">
            <div className="flex items-center space-x-2">
              <Bot className="w-4 h-4" />
              <span>Smart AI</span>
              <div className="w-1 h-1 bg-green-400 rounded-full animate-pulse"></div>
            </div>
            {aiProposals.length > 0 && (
              <button 
                onClick={() => setShowAIPanel(!showAIPanel)}
                className="px-3 py-1 bg-white/20 rounded-full text-xs font-medium"
                data-testid="button-ai-panel"
              >
                {aiProposals.length} Proposals
              </button>
            )}
          </div>
        )}

        {/* View Tabs */}
        <div className="flex border-t border-white/20">
          <button
            onClick={() => setView('day')}
            className={`flex-1 py-3 text-sm font-medium ${view === 'day' ? 'bg-white/20' : 'hover:bg-white/10'}`}
            data-testid="button-view-day"
          >
            <Calendar className="w-4 h-4 inline mr-2" />
            Day
          </button>
          <button
            onClick={() => setView('week')}
            className={`flex-1 py-3 text-sm font-medium border-l border-r border-white/20 ${view === 'week' ? 'bg-white/20' : 'hover:bg-white/10'}`}
            data-testid="button-view-week"
          >
            <Grid className="w-4 h-4 inline mr-2" />
            Week
          </button>
          <button
            onClick={() => setView('list')}
            className={`flex-1 py-3 text-sm font-medium ${view === 'list' ? 'bg-white/20' : 'hover:bg-white/10'}`}
            data-testid="button-view-list"
          >
            <List className="w-4 h-4 inline mr-2" />
            List
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-4 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-card rounded-lg p-3 shadow-sm border">
            <div className="flex items-center space-x-2 mb-1">
              <Users className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground">Scheduled</span>
            </div>
            <div className="text-xl font-bold" data-testid="text-scheduled-count">
              {todayShifts.filter((s: Shift) => s.employeeId).length}
            </div>
          </div>
          <div className="bg-card rounded-lg p-3 shadow-sm border">
            <div className="flex items-center space-x-2 mb-1">
              <AlertCircle className="w-4 h-4 text-orange-600" />
              <span className="text-xs text-muted-foreground">Open</span>
            </div>
            <div className="text-xl font-bold text-orange-600" data-testid="text-open-count">
              {openShiftCount}
            </div>
          </div>
          <div className="bg-card rounded-lg p-3 shadow-sm border">
            <div className="flex items-center space-x-2 mb-1">
              <Sparkles className="w-4 h-4 text-purple-600" />
              <span className="text-xs text-muted-foreground">AI</span>
            </div>
            <div className="text-xl font-bold text-purple-600" data-testid="text-ai-count">
              {aiGeneratedCount}
            </div>
          </div>
        </div>

        {/* Day View */}
        {view === 'day' && (
          <div className="bg-card rounded-lg shadow-sm border">
            <div className="p-3 border-b flex items-center justify-between">
              <h3 className="font-bold">Today's Schedule</h3>
              {canManageShifts && (
                <Button
                  onClick={() => {
                    setShiftForm({ ...shiftForm, date: currentDate.toISOString().split('T')[0] });
                    setShowShiftModal(true);
                  }}
                  size="sm"
                  data-testid="button-add-shift"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add
                </Button>
              )}
            </div>

            <div className="divide-y">
              {todayShifts.length === 0 ? (
                <div className="p-8 text-center">
                  <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground mb-3">No shifts scheduled</p>
                  {canManageShifts && (
                    <Button onClick={() => setShowShiftModal(true)} data-testid="button-create-first-shift">
                      Create First Shift
                    </Button>
                  )}
                </div>
              ) : (
                todayShifts.map((shift: Shift) => {
                  const isOpen = shift.status === 'open';
                  return (
                    <div key={shift.id} className="p-4" data-testid={`shift-card-${shift.id}`}>
                      <div className="flex items-start space-x-3">
                        <div className="text-center min-w-[60px]">
                          <div className="text-sm font-bold">{formatTime(shift.startTime)}</div>
                          <div className="text-xs text-muted-foreground">to</div>
                          <div className="text-sm font-bold">{formatTime(shift.endTime)}</div>
                        </div>

                        <div className="flex-1 rounded-lg p-3 border-l-4 bg-muted/50" style={{ borderLeftColor: isOpen ? 'hsl(var(--destructive))' : 'hsl(var(--primary))' }}>
                          {isOpen ? (
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <Badge variant="destructive">OPEN SHIFT</Badge>
                                {canManageShifts && (
                                  <Button
                                    onClick={() => aiFillShift.mutate(shift.id)}
                                    size="sm"
                                    disabled={aiFillShift.isPending}
                                    data-testid={`button-ai-fill-${shift.id}`}
                                  >
                                    <Bot className="w-3 h-3 mr-1" />
                                    AI Fill
                                  </Button>
                                )}
                              </div>
                              <div className="text-sm font-medium">{shift.position}</div>
                              <div className="text-xs text-muted-foreground">{getClientName(shift.clientId)}</div>
                            </div>
                          ) : (
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <div>
                                  <div className="font-bold text-sm">{getEmployeeName(shift.employeeId)}</div>
                                  <div className="text-xs text-muted-foreground">{shift.position}</div>
                                </div>
                                {shift.createdByAI && (
                                  <Badge variant="secondary">
                                    <Sparkles className="w-3 h-3 mr-1" />
                                    AI
                                  </Badge>
                                )}
                              </div>
                              
                              <div className="flex items-center space-x-3 text-xs text-muted-foreground">
                                <div className="flex items-center space-x-1">
                                  <Building className="w-3 h-3" />
                                  <span>{getClientName(shift.clientId)}</span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Create Shift Modal */}
      <Dialog open={showShiftModal} onOpenChange={setShowShiftModal}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Shift</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="open-shift"
                checked={shiftForm.isOpenShift}
                onCheckedChange={(checked) => setShiftForm({ ...shiftForm, isOpenShift: !!checked })}
                data-testid="checkbox-open-shift"
              />
              <label htmlFor="open-shift" className="text-sm font-medium">Open Shift</label>
            </div>

            {!shiftForm.isOpenShift && (
              <div>
                <label className="text-sm font-medium mb-2 block">Employee</label>
                <Select value={shiftForm.employeeId} onValueChange={(value) => setShiftForm({ ...shiftForm, employeeId: value })}>
                  <SelectTrigger data-testid="select-employee">
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((emp: any) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.firstName} {emp.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <label className="text-sm font-medium mb-2 block">Client</label>
              <Select value={shiftForm.clientId} onValueChange={(value) => setShiftForm({ ...shiftForm, clientId: value })}>
                <SelectTrigger data-testid="select-client">
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client: any) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.companyName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Position</label>
              <Input
                value={shiftForm.position}
                onChange={(e) => setShiftForm({ ...shiftForm, position: e.target.value })}
                placeholder="e.g., Security Guard"
                data-testid="input-position"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-2 block">Start</label>
                <Input
                  type="time"
                  value={shiftForm.startTime}
                  onChange={(e) => setShiftForm({ ...shiftForm, startTime: e.target.value })}
                  data-testid="input-start-time"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">End</label>
                <Input
                  type="time"
                  value={shiftForm.endTime}
                  onChange={(e) => setShiftForm({ ...shiftForm, endTime: e.target.value })}
                  data-testid="input-end-time"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Notes</label>
              <Textarea
                value={shiftForm.notes}
                onChange={(e) => setShiftForm({ ...shiftForm, notes: e.target.value })}
                placeholder="Additional instructions..."
                rows={3}
                data-testid="textarea-notes"
              />
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="create-chatroom"
                checked={shiftForm.createChatroom}
                onCheckedChange={(checked) => setShiftForm({ ...shiftForm, createChatroom: !!checked })}
                data-testid="checkbox-create-chatroom"
              />
              <label htmlFor="create-chatroom" className="text-sm font-medium flex items-center space-x-1">
                <MessageSquare className="w-4 h-4" />
                <span>Create shift chatroom</span>
              </label>
            </div>

            <div className="flex space-x-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setShowShiftModal(false)}
                className="flex-1"
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                onClick={() => createShift.mutate(shiftForm)}
                disabled={createShift.isPending || !shiftForm.clientId || !shiftForm.position}
                className="flex-1"
                data-testid="button-save-shift"
              >
                {createShift.isPending ? 'Creating...' : 'Create'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* AI Panel */}
      {showAIPanel && canManageShifts && (
        <div className="fixed inset-0 bg-black/50 z-50" onClick={() => setShowAIPanel(false)}>
          <div 
            className="absolute bottom-0 left-0 right-0 bg-card rounded-t-2xl max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-card border-b px-4 py-3 flex items-center justify-between">
              <h3 className="font-bold">AI Proposals</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowAIPanel(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            
            <div className="p-4 space-y-3">
              {aiProposals.map((proposal: any) => (
                <div key={proposal.id} className="bg-muted rounded-lg p-4 border">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="font-medium">Schedule Optimization</div>
                      <div className="text-sm text-muted-foreground">
                        Confidence: {proposal.confidenceScore}%
                      </div>
                    </div>
                    <Badge variant="secondary">
                      <Sparkles className="w-3 h-3 mr-1" />
                      AI
                    </Badge>
                  </div>
                  
                  <p className="text-sm text-muted-foreground mb-3">{proposal.reasoning}</p>
                  
                  <Button
                    onClick={() => approveProposal.mutate(proposal.id)}
                    disabled={approveProposal.isPending}
                    size="sm"
                    className="w-full"
                    data-testid={`button-approve-proposal-${proposal.id}`}
                  >
                    <CheckCircle className="w-4 h-4 mr-1" />
                    Approve
                  </Button>
                </div>
              ))}
              
              {aiProposals.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No pending proposals
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getWeekStart(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

function getWeekEnd(date: Date) {
  const start = getWeekStart(date);
  return new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
}
