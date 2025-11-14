/**
 * Universal Scheduling System - Enhanced
 * Mobile & Desktop responsive schedule with comprehensive shift creation
 * 
 * Features:
 * - Grid plus signs on hover to create shifts
 * - Comprehensive shift modal (employee, position, client, location, clock times, notes, post orders)
 * - Post orders with acknowledgment/signature/photo requirements
 * - Open shifts (orange dashed border) with AI Fill
 * - AI recommendations panel with 99% AI, 1% Human governance
 * - Full mobile responsiveness with touch-friendly controls
 * - RBAC enforcement (manager/admin create, employees view own)
 */

import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, DragEndEvent, useDraggable, useDroppable } from '@dnd-kit/core';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { useEmployee } from '@/hooks/useEmployee';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Calendar, Clock, Users, Edit2, Trash2, Copy, ChevronLeft, ChevronRight, Plus, Download,
  Bot, CheckCircle, AlertCircle, BarChart3, Play, X, Camera, MessageSquare, FileText,
  CheckSquare, MapPin, Menu, Sparkles
} from 'lucide-react';
import type { Shift, Employee, Client, ShiftOrder } from '@shared/schema';

// Post order template data (will be pre-created in database)
const POST_ORDER_TEMPLATES = [
  {
    id: '1',
    title: 'Security Patrol Requirements',
    description: 'Complete hourly patrols of all assigned areas',
    requiresAcknowledgment: true,
    requiresSignature: true,
    requiresPhotos: true,
    photoFrequency: 'hourly' as const,
    photoInstructions: 'Take photos of each checkpoint during patrol'
  },
  {
    id: '2',
    title: 'Opening Procedures',
    description: 'Follow all opening checklist items',
    requiresAcknowledgment: true,
    requiresSignature: false,
    requiresPhotos: false,
    photoFrequency: null,
    photoInstructions: null
  },
  {
    id: '3',
    title: 'Closing Procedures',
    description: 'Complete all closing duties and security checks',
    requiresAcknowledgment: true,
    requiresSignature: true,
    requiresPhotos: true,
    photoFrequency: 'at_completion' as const,
    photoInstructions: 'Document all secured areas before leaving'
  },
  {
    id: '4',
    title: 'Equipment Inspection',
    description: 'Inspect and document condition of all equipment',
    requiresAcknowledgment: true,
    requiresSignature: false,
    requiresPhotos: true,
    photoFrequency: 'hourly' as const,
    photoInstructions: 'Photo evidence of equipment status'
  }
];

interface ShiftFormData {
  employeeId: string | null;
  position: string;
  clockIn: string;
  clockOut: string;
  notes: string;
  postOrders: string[];
  isOpenShift: boolean;
  clientId: string;
  location: string;
}

export default function UniversalSchedule() {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const { employee: currentEmployee } = useEmployee();
  
  // State management
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [automationEnabled, setAutomationEnabled] = useState(false);
  const [manualApprovalMode, setManualApprovalMode] = useState(true);
  const [mobileEmployeePanelOpen, setMobileEmployeePanelOpen] = useState(false);
  
  // Shift modal states
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [modalPosition, setModalPosition] = useState({ day: 0, hour: 0 });
  const [shiftForm, setShiftForm] = useState<ShiftFormData>({
    employeeId: null,
    position: '',
    clockIn: '',
    clockOut: '',
    notes: '',
    postOrders: [],
    isOpenShift: false,
    clientId: '',
    location: ''
  });

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const hours = Array.from({ length: 24 }, (_, i) => i);

  // Calculate week boundaries
  const weekStart = useMemo(() => {
    const date = new Date(currentWeek);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(date.setDate(diff));
  }, [currentWeek]);

  const weekEnd = useMemo(() => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + 6);
    return date;
  }, [weekStart]);

  const weekDisplay = useMemo(() => {
    const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    return `${weekStart.toLocaleDateString('en-US', options)} - ${weekEnd.toLocaleDateString('en-US', options)}, ${weekEnd.getFullYear()}`;
  }, [weekStart, weekEnd]);

  // Fetch shifts for current week with date range filtering
  const { data: shifts = [], isLoading: shiftsLoading } = useQuery<Shift[]>({
    queryKey: ['/api/shifts', weekStart.toISOString(), weekEnd.toISOString()],
    queryFn: async () => {
      const response = await fetch(
        `/api/shifts?weekStart=${weekStart.toISOString()}&weekEnd=${weekEnd.toISOString()}`,
        { credentials: 'include' }
      );
      if (!response.ok) throw new Error('Failed to fetch shifts');
      return response.json();
    }
  });

  // Fetch employees
  const { data: employees = [], isLoading: employeesLoading } = useQuery<Employee[]>({
    queryKey: ['/api/employees'],
  });

  // Fetch clients
  const { data: clients = [], isLoading: clientsLoading } = useQuery<Client[]>({
    queryKey: ['/api/clients'],
  });

  const isLoading = shiftsLoading || employeesLoading || clientsLoading;

  // Week navigation
  const goToPreviousWeek = () => {
    const newDate = new Date(currentWeek);
    newDate.setDate(newDate.getDate() - 7);
    setCurrentWeek(newDate);
  };

  const goToNextWeek = () => {
    const newDate = new Date(currentWeek);
    newDate.setDate(newDate.getDate() + 7);
    setCurrentWeek(newDate);
  };

  // Create shift mutation
  const createShiftMutation = useMutation({
    mutationFn: async (shiftData: ShiftFormData) => {
      const clockInDate = new Date(weekStart);
      clockInDate.setDate(clockInDate.getDate() + modalPosition.day);
      const [clockInHour, clockInMinute] = shiftData.clockIn.split(':');
      clockInDate.setHours(parseInt(clockInHour), parseInt(clockInMinute), 0);

      const clockOutDate = new Date(clockInDate);
      const [clockOutHour, clockOutMinute] = shiftData.clockOut.split(':');
      clockOutDate.setHours(parseInt(clockOutHour), parseInt(clockOutMinute), 0);

      // Include postOrders in the request payload
      return await apiRequest('/api/shifts', 'POST', {
        employeeId: shiftData.isOpenShift ? null : shiftData.employeeId,
        clientId: shiftData.clientId || null,
        title: shiftData.position,
        description: `${shiftData.location ? shiftData.location + ' - ' : ''}${shiftData.notes}`,
        startTime: clockInDate.toISOString(),
        endTime: clockOutDate.toISOString(),
        status: shiftData.isOpenShift ? 'open' : 'draft',
        aiGenerated: false,
        postOrders: shiftData.postOrders // ✅ CRITICAL: Include post orders array
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
      setShowShiftModal(false);
      toast({
        title: 'Shift created',
        description: shiftForm.isOpenShift ? 'Open shift created successfully' : 'Shift created and assigned',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Failed to create shift',
        description: error.message,
      });
    }
  });

  // AI Fill mutation
  const aiFillMutation = useMutation({
    mutationFn: async (shiftId: string) => {
      return await apiRequest(`/api/shifts/${shiftId}/ai-fill`, 'POST', {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
      toast({
        title: 'AI auto-filled shift',
        description: 'Smart AI found the best available employee for this shift',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'AI fill failed',
        description: error.message,
      });
    }
  });

  const handleGridClick = (dayIndex: number, hourIndex: number) => {
    setModalPosition({ day: dayIndex, hour: hourIndex });
    setShiftForm({
      employeeId: null,
      position: '',
      clockIn: `${hourIndex.toString().padStart(2, '0')}:00`,
      clockOut: `${(hourIndex + 8).toString().padStart(2, '0')}:00`,
      notes: '',
      postOrders: [],
      isOpenShift: false,
      clientId: '',
      location: ''
    });
    setShowShiftModal(true);
  };

  const handleCreateShift = () => {
    createShiftMutation.mutate(shiftForm);
  };

  const handleAIFillOpenShift = (shiftId: string) => {
    aiFillMutation.mutate(shiftId);
  };

  const togglePostOrder = (orderId: string) => {
    setShiftForm(prev => ({
      ...prev,
      postOrders: prev.postOrders.includes(orderId)
        ? prev.postOrders.filter(id => id !== orderId)
        : [...prev.postOrders, orderId]
    }));
  };

  // Convert shifts to day/hour grid format
  const shiftsGrid = useMemo(() => {
    const grid: Record<string, Shift[]> = {};
    shifts.forEach(shift => {
      const shiftDate = new Date(shift.startTime);
      const dayOfWeek = shiftDate.getDay();
      const adjustedDay = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Convert to Monday=0
      const hourOfDay = shiftDate.getHours();
      const key = `${adjustedDay}-${hourOfDay}`;
      if (!grid[key]) grid[key] = [];
      grid[key].push(shift);
    });
    return grid;
  }, [shifts]);

  const getShiftPosition = (shift: Shift) => {
    const start = new Date(shift.startTime);
    const end = new Date(shift.endTime);
    const startHour = start.getHours() + start.getMinutes() / 60;
    const duration = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    const topPercent = (startHour / 24) * 100;
    const heightPercent = (duration / 24) * 100;
    return { top: `${topPercent}%`, height: `${heightPercent}%` };
  };

  const getEmployeeColor = (employeeId: string | null) => {
    if (!employeeId) return '#6b7280';
    const employee = employees.find(e => e.id === employeeId);
    // Generate consistent color from employee ID
    const hash = employeeId.split('').reduce((acc, char) => char.charCodeAt(0) + ((acc << 5) - acc), 0);
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#ef4444', '#06b6d4'];
    return colors[Math.abs(hash) % colors.length];
  };

  const isOpenShift = (shift: Shift) => {
    // Open shifts have no assigned employee
    return !shift.employeeId;
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <Sparkles className="h-12 w-12 mx-auto mb-4 animate-pulse" style={{ color: '#3b82f6' }} />
          <p className="text-muted-foreground">Loading schedule...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Desktop Employee Sidebar */}
      {!isMobile && (
        <div className="w-64 bg-card border-r flex flex-col">
          <div className="p-4 border-b">
            <h2 className="text-lg font-bold">Employees</h2>
            <p className="text-sm text-muted-foreground">{employees.length} active</p>
          </div>

          <ScrollArea className="flex-1 p-4">
            <div className="space-y-2">
              {employees.map(employee => (
                <div
                  key={employee.id}
                  onClick={() => setSelectedEmployee(employee)}
                  className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                    selectedEmployee?.id === employee.id
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50'
                  }`}
                  data-testid={`employee-card-${employee.id}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: getEmployeeColor(employee.id) }}
                      />
                      <span className="font-medium text-sm">{employee.firstName} {employee.lastName}</span>
                    </div>
                    {employee.performanceScore && (
                      <span className="text-xs font-bold text-green-600">{employee.performanceScore}</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">{employee.role || 'Employee'}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    ${employee.hourlyRate?.toString() || '0'}/hr
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          <div className="p-4 border-t">
            <Button className="w-full" data-testid="button-add-employee">
              <Plus className="w-4 h-4 mr-2" />
              Add Employee
            </Button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="bg-card border-b p-4">
          <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
            <div className="flex items-center gap-4 min-w-0">
              {/* Mobile Menu */}
              {isMobile && (
                <Sheet open={mobileEmployeePanelOpen} onOpenChange={setMobileEmployeePanelOpen}>
                  <SheetTrigger asChild>
                    <Button variant="outline" size="icon" data-testid="button-menu">
                      <Menu className="h-4 w-4" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-80 p-0">
                    <div className="p-4 border-b">
                      <h2 className="text-lg font-bold">Employees</h2>
                      <p className="text-sm text-muted-foreground">{employees.length} active</p>
                    </div>
                    <ScrollArea className="h-[calc(100vh-120px)] p-4">
                      <div className="space-y-2">
                        {employees.map(employee => (
                          <div
                            key={employee.id}
                            onClick={() => {
                              setSelectedEmployee(employee);
                              setMobileEmployeePanelOpen(false);
                            }}
                            className="p-3 rounded-lg border-2 cursor-pointer transition-all"
                          >
                            <div className="flex items-center space-x-2">
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: getEmployeeColor(employee.id) }}
                              />
                              <span className="font-medium text-sm">{employee.firstName} {employee.lastName}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </SheetContent>
                </Sheet>
              )}

              <h1 className="text-2xl font-bold">Weekly Schedule</h1>
              <div className="flex items-center space-x-2">
                <Button variant="outline" size="icon" onClick={goToPreviousWeek} data-testid="button-prev-week">
                  <ChevronLeft className="w-5 h-5" />
                </Button>
                <span className="text-sm font-medium whitespace-nowrap">{weekDisplay}</span>
                <Button variant="outline" size="icon" onClick={goToNextWeek} data-testid="button-next-week">
                  <ChevronRight className="w-5 h-5" />
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" data-testid="button-export">
                <Download className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">Export</span>
              </Button>
              <Button variant="outline" data-testid="button-reports">
                <BarChart3 className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">Reports</span>
              </Button>
              <Button
                onClick={() => setShowAIPanel(!showAIPanel)}
                className="bg-gradient-to-r from-[#3b82f6] to-[#22d3ee] hover:from-[#2563eb] hover:to-[#06b6d4]"
                data-testid="button-ai-assistant"
              >
                <Bot className="w-4 h-4 mr-2" />
                AI Assistant
              </Button>
            </div>
          </div>

          {/* AI Status Bar */}
          <div className="flex items-center justify-between p-3 bg-gradient-to-r from-[#3b82f6]/10 to-[#22d3ee]/10 rounded-lg border border-[#3b82f6]/20">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5" style={{ color: '#3b82f6' }} />
                <span className="font-medium text-sm">AI Automation</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setAutomationEnabled(!automationEnabled)}
                  className={`h-6 px-2 ${automationEnabled ? 'text-green-600' : 'text-muted-foreground'}`}
                  data-testid="button-ai-toggle"
                >
                  {automationEnabled ? 'ON' : 'OFF'}
                </Button>
              </div>

              <div className="h-6 w-px bg-border" />

              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Smart AI Engine</span>
              </div>
            </div>

            {manualApprovalMode && (
              <Badge variant="outline" className="bg-yellow-100 dark:bg-yellow-900/20 border-yellow-600 text-yellow-800 dark:text-yellow-200">
                <AlertCircle className="w-3 h-3 mr-1" />
                Manual Approval Required
              </Badge>
            )}
          </div>
        </div>

        {/* Schedule Grid */}
        <ScrollArea className="flex-1 p-4">
          <div className="bg-card rounded-lg border overflow-hidden min-w-[800px]">
            {/* Days Header */}
            <div className="grid grid-cols-8 border-b bg-muted/50">
              <div className="p-3 font-medium text-sm text-muted-foreground border-r">
                Time
              </div>
              {days.map(day => (
                <div key={day} className="p-3 text-center font-medium text-sm border-r last:border-r-0">
                  {day}
                </div>
              ))}
            </div>

            {/* Grid Content */}
            <div className="grid grid-cols-8">
              {/* Time Column */}
              <div className="border-r">
                {hours.map(hour => (
                  <div key={hour} className="h-16 border-b p-2 text-xs text-muted-foreground">
                    {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
                  </div>
                ))}
              </div>

              {/* Day Columns with Shifts */}
              {days.map((day, dayIndex) => (
                <div key={day} className="relative border-r last:border-r-0">
                  {/* Hour grid lines with plus icons */}
                  {hours.map(hour => (
                    <div
                      key={hour}
                      className="h-16 border-b hover:bg-primary/5 cursor-pointer transition-colors group relative"
                      onClick={() => handleGridClick(dayIndex, hour)}
                      data-testid={`grid-cell-${dayIndex}-${hour}`}
                    >
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="bg-primary rounded-full p-1">
                          <Plus className="w-4 h-4 text-primary-foreground" />
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Shifts - render all shifts for this day */}
                  {Object.entries(shiftsGrid)
                    .filter(([key]) => key.startsWith(`${dayIndex}-`))
                    .flatMap(([_, dayShifts]) => dayShifts)
                    .map(shift => {
                    const position = getShiftPosition(shift);
                    const employee = shift.employeeId ? employees.find(e => e.id === shift.employeeId) : null;
                    const client = shift.clientId ? clients.find(c => c.id === shift.clientId) : null;
                    const isOpen = isOpenShift(shift);

                    return (
                      <div
                        key={shift.id}
                        className={`absolute left-1 right-1 rounded-lg p-2 cursor-pointer transition-all hover:shadow-lg hover:z-10 group ${
                          isOpen ? 'border-2 border-dashed border-orange-400' : ''
                        }`}
                        style={{
                          top: position.top,
                          height: position.height,
                          backgroundColor: isOpen ? '#fff7ed' : getEmployeeColor(shift.employeeId),
                          opacity: shift.status === 'draft' ? 0.7 : 1,
                          minHeight: '40px'
                        }}
                        data-testid={`shift-${shift.id}`}
                      >
                        {isOpen ? (
                          <div>
                            <div className="text-orange-600 text-xs font-bold flex items-center space-x-1">
                              <AlertCircle className="w-3 h-3" />
                              <span>OPEN SHIFT</span>
                            </div>
                            <div className="text-gray-700 text-xs font-medium truncate">{shift.title}</div>
                            {client && <div className="text-gray-600 text-xs truncate">{client.companyName}</div>}
                            <Button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAIFillOpenShift(shift.id);
                              }}
                              size="sm"
                              className="mt-1 h-6 text-xs bg-gradient-to-r from-[#3b82f6] to-[#22d3ee] hover:from-[#2563eb] hover:to-[#06b6d4]"
                              data-testid={`button-ai-fill-${shift.id}`}
                            >
                              <Bot className="w-3 h-3 mr-1" />
                              AI Fill
                            </Button>
                          </div>
                        ) : (
                          <>
                            <div className="text-white text-xs font-medium truncate">
                              {employee?.firstName} {employee?.lastName}
                            </div>
                            <div className="text-white text-xs opacity-90 truncate">
                              {shift.title || 'Shift'}
                              {client && ` - ${client.companyName}`}
                            </div>
                            {shift.aiGenerated && (
                              <div className="absolute top-1 right-1 bg-white rounded-full p-1">
                                <Bot className="w-3 h-3" style={{ color: '#3b82f6' }} />
                              </div>
                            )}

                            {/* Hover actions */}
                            <div className="absolute top-1 right-1 hidden group-hover:flex space-x-1">
                              <Button variant="secondary" size="icon" className="h-6 w-6">
                                <Edit2 className="w-3 h-3" />
                              </Button>
                              <Button variant="secondary" size="icon" className="h-6 w-6">
                                <Copy className="w-3 h-3" />
                              </Button>
                              <Button variant="destructive" size="icon" className="h-6 w-6">
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </ScrollArea>
      </div>

      {/* Right Sidebar - AI Panel */}
      {showAIPanel && !isMobile && (
        <div className="w-96 bg-card border-l flex flex-col">
          <div className="p-4 border-b">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold">AI Recommendations</h2>
              <Button variant="ghost" size="icon" onClick={() => setShowAIPanel(false)}>
                <X className="w-5 h-5" />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Smart AI monitoring for coverage gaps
            </p>
          </div>

          <ScrollArea className="flex-1 p-4">
            <div className="text-center py-8">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
              <p className="font-medium">All caught up!</p>
              <p className="text-sm text-muted-foreground">No pending AI recommendations</p>
            </div>
          </ScrollArea>

          <div className="p-4 border-t">
            <div className="bg-gradient-to-r from-[#3b82f6]/10 to-[#22d3ee]/10 rounded-lg p-3 mb-3">
              <div className="flex items-center justify-between text-sm mb-2">
                <span>Smart AI Status</span>
                <Badge variant="outline" className="bg-background/50">
                  <Bot className="w-3 h-3 mr-1" />
                  99% AI, 1% Human
                </Badge>
              </div>
            </div>

            <Button
              className="w-full bg-gradient-to-r from-[#3b82f6] to-[#22d3ee] hover:from-[#2563eb] hover:to-[#06b6d4]"
              data-testid="button-generate-schedule"
            >
              <Play className="w-4 h-4 mr-2" />
              Generate AI Schedule for Next Week
            </Button>
          </div>
        </div>
      )}

      {/* Shift Creation Modal */}
      <Dialog open={showShiftModal} onOpenChange={setShowShiftModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Shift</DialogTitle>
            <DialogDescription>
              {days[modalPosition.day]} at {modalPosition.hour}:00
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Open Shift Toggle */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="open-shift"
                checked={shiftForm.isOpenShift}
                onCheckedChange={(checked) =>
                  setShiftForm(prev => ({ ...prev, isOpenShift: checked as boolean }))
                }
                data-testid="checkbox-open-shift"
              />
              <Label htmlFor="open-shift" className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-orange-600" />
                <div>
                  <div className="font-semibold">Open Shift</div>
                  <div className="text-xs text-muted-foreground">
                    AI can auto-fill with best-matched employee
                  </div>
                </div>
              </Label>
            </div>

            {/* Employee Selection */}
            {!shiftForm.isOpenShift && (
              <div className="space-y-2">
                <Label htmlFor="employee">Employee *</Label>
                <Select value={shiftForm.employeeId || ''} onValueChange={(value) =>
                  setShiftForm(prev => ({ ...prev, employeeId: value }))
                }>
                  <SelectTrigger id="employee" data-testid="select-employee">
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map(emp => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.firstName} {emp.lastName} - {emp.role || 'Employee'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Position */}
            <div className="space-y-2">
              <Label htmlFor="position">Position *</Label>
              <Input
                id="position"
                value={shiftForm.position}
                onChange={(e) => setShiftForm(prev => ({ ...prev, position: e.target.value }))}
                placeholder="e.g., Server, Cook, Manager"
                data-testid="input-position"
              />
            </div>

            {/* Client */}
            <div className="space-y-2">
              <Label htmlFor="client">Client/Area</Label>
              <Select value={shiftForm.clientId} onValueChange={(value) =>
                setShiftForm(prev => ({ ...prev, clientId: value }))
              }>
                <SelectTrigger id="client" data-testid="select-client">
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map(client => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.companyName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Location */}
            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                value={shiftForm.location}
                onChange={(e) => setShiftForm(prev => ({ ...prev, location: e.target.value }))}
                placeholder="e.g., Main Dining, Kitchen"
                data-testid="input-location"
              />
            </div>

            {/* Clock In/Out */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="clock-in">Clock In</Label>
                <Input
                  id="clock-in"
                  type="time"
                  value={shiftForm.clockIn}
                  onChange={(e) => setShiftForm(prev => ({ ...prev, clockIn: e.target.value }))}
                  data-testid="input-clock-in"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="clock-out">Clock Out</Label>
                <Input
                  id="clock-out"
                  type="time"
                  value={shiftForm.clockOut}
                  onChange={(e) => setShiftForm(prev => ({ ...prev, clockOut: e.target.value }))}
                  data-testid="input-clock-out"
                />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Shift Notes</Label>
              <Textarea
                id="notes"
                value={shiftForm.notes}
                onChange={(e) => setShiftForm(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Additional notes or instructions..."
                data-testid="textarea-notes"
              />
            </div>

            {/* Post Orders */}
            <div className="space-y-2">
              <Label>Post Orders</Label>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {POST_ORDER_TEMPLATES.map(order => {
                  const isSelected = shiftForm.postOrders.includes(order.id);
                  return (
                    <div
                      key={order.id}
                      className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                        isSelected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                      }`}
                      onClick={() => togglePostOrder(order.id)}
                      data-testid={`post-order-${order.id}`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Checkbox checked={isSelected} />
                          <span className="font-medium text-sm">{order.title}</span>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">{order.description}</p>
                      <div className="flex flex-wrap gap-2 text-xs">
                        {order.requiresAcknowledgment && (
                          <Badge variant="outline" className="gap-1">
                            <CheckSquare className="w-3 h-3" />
                            Acknowledgment
                          </Badge>
                        )}
                        {order.requiresSignature && (
                          <Badge variant="outline" className="gap-1">
                            <FileText className="w-3 h-3" />
                            Signature
                          </Badge>
                        )}
                        {order.requiresPhotos && (
                          <Badge variant="outline" className="gap-1">
                            <Camera className="w-3 h-3" />
                            Photos ({order.photoFrequency})
                          </Badge>
                        )}
                      </div>
                      {order.photoInstructions && isSelected && (
                        <div className="mt-2 text-xs bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded p-2">
                          <MessageSquare className="w-3 h-3 inline mr-1" />
                          {order.photoInstructions}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowShiftModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateShift}
              disabled={createShiftMutation.isPending || (!shiftForm.isOpenShift && !shiftForm.employeeId) || !shiftForm.position}
              className="bg-gradient-to-r from-[#3b82f6] to-[#22d3ee] hover:from-[#2563eb] hover:to-[#06b6d4]"
              data-testid="button-create-shift"
            >
              {createShiftMutation.isPending ? 'Creating...' : 'Create Shift'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
