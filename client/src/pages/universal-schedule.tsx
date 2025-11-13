/**
 * Universal Scheduling System - Desktop & Mobile
 * Sling-style drag & drop calendar with Gemini AI automation
 * 
 * Architecture:
 * - ScheduleWorkspace: Main shell orchestrating layout & data
 * - EmployeePanel: Sidebar (desktop) / Bottom sheet (mobile)
 * - ScheduleGrid: Week grid with time slots and shift blocks
 * - ShiftComposer: Create/edit shift dialog
 * - AIPipelines: Wraps ScheduleOS AI components
 */

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { useIdentity } from "@/hooks/useIdentity";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  Calendar, ChevronLeft, ChevronRight, Plus, Download, 
  BarChart3, Bot, Users, Menu, Sparkles, Clock
} from "lucide-react";
import { ScheduleOSPanel } from "@/components/scheduleos-panel";
import { ScheduleProposalDrawer } from "@/components/schedule-proposal-drawer";
import { ScheduleMigrationDialog } from "@/components/schedule-migration-dialog";
import type { Shift, Employee, Client } from "@shared/schema";

/**
 * Main Workspace Shell
 */
export default function UniversalSchedule() {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const { identity } = useIdentity();
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [showProposalDrawer, setShowProposalDrawer] = useState(false);
  const [showMigrationDialog, setShowMigrationDialog] = useState(false);
  const [mobileEmployeePanelOpen, setMobileEmployeePanelOpen] = useState(false);

  // Calculate week boundaries
  const weekStart = useMemo(() => {
    const date = new Date(currentWeek);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
    return new Date(date.setDate(diff));
  }, [currentWeek]);

  const weekEnd = useMemo(() => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + 6);
    return date;
  }, [weekStart]);

  // Fetch shifts for current week
  const { data: shifts = [], isLoading: shiftsLoading } = useQuery<Shift[]>({
    queryKey: ['/api/shifts', weekStart.toISOString(), weekEnd.toISOString()],
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

  const goToToday = () => {
    setCurrentWeek(new Date());
  };

  // Format week display
  const weekDisplay = useMemo(() => {
    const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    return `${weekStart.toLocaleDateString('en-US', options)} - ${weekEnd.toLocaleDateString('en-US', options)}, ${weekEnd.getFullYear()}`;
  }, [weekStart, weekEnd]);

  return (
    <div className="flex h-screen bg-background">
      {/* Desktop Employee Sidebar */}
      {!isMobile && (
        <EmployeePanel
          employees={employees}
          selectedEmployee={selectedEmployee}
          onSelectEmployee={setSelectedEmployee}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="bg-card border-b p-4">
          <div className="flex items-center justify-between gap-4 mb-4">
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
                    <EmployeePanel
                      employees={employees}
                      selectedEmployee={selectedEmployee}
                      onSelectEmployee={(emp) => {
                        setSelectedEmployee(emp);
                        setMobileEmployeePanelOpen(false);
                      }}
                    />
                  </SheetContent>
                </Sheet>
              )}

              <h1 className="text-xl md:text-2xl font-bold truncate">
                Weekly Schedule
              </h1>

              {/* Week Navigation */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={goToPreviousWeek}
                  data-testid="button-previous-week"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  onClick={goToToday}
                  className="hidden sm:flex"
                  data-testid="button-today"
                >
                  Today
                </Button>
                <span className="text-sm font-medium whitespace-nowrap">
                  {weekDisplay}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={goToNextWeek}
                  data-testid="button-next-week"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="hidden sm:flex"
                data-testid="button-export"
              >
                <Download className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="hidden sm:flex"
                data-testid="button-reports"
              >
                <BarChart3 className="h-4 w-4" />
              </Button>
              <Button
                onClick={() => setShowAIPanel(!showAIPanel)}
                className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700"
                data-testid="button-ai-assistant"
              >
                <Bot className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">AI Assistant</span>
              </Button>
            </div>
          </div>

          {/* AI Status Bar */}
          <AIStatusBar />
        </div>

        {/* Schedule Grid */}
        <div className="flex-1 overflow-hidden">
          <ScheduleGrid
            weekStart={weekStart}
            shifts={shifts}
            employees={employees}
            clients={clients}
            isLoading={isLoading}
          />
        </div>
      </div>

      {/* AI Panels (Desktop Right Sidebar / Mobile Drawer) */}
      {showAIPanel && (
        <AIPipelines
          onClose={() => setShowAIPanel(false)}
          onOpenProposal={() => setShowProposalDrawer(true)}
          onOpenMigration={() => setShowMigrationDialog(true)}
        />
      )}

      {/* AI Proposal Drawer */}
      <ScheduleProposalDrawer
        open={showProposalDrawer}
        onOpenChange={setShowProposalDrawer}
      />

      {/* Migration Dialog */}
      <ScheduleMigrationDialog
        open={showMigrationDialog}
        onOpenChange={setShowMigrationDialog}
      />
    </div>
  );
}

/**
 * Employee Panel - Sidebar (desktop) / Sheet content (mobile)
 */
interface EmployeePanelProps {
  employees: Employee[];
  selectedEmployee: Employee | null;
  onSelectEmployee: (employee: Employee | null) => void;
}

function EmployeePanel({ employees, selectedEmployee, onSelectEmployee }: EmployeePanelProps) {
  const { toast } = useToast();

  return (
    <div className="w-80 bg-card border-r flex flex-col h-full">
      <div className="p-4 border-b">
        <h2 className="text-lg font-bold">Employees</h2>
        <p className="text-sm text-muted-foreground">{employees.length} active</p>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-2">
          {employees.map((employee) => (
            <div
              key={employee.id}
              onClick={() => onSelectEmployee(employee)}
              className={`p-3 rounded-lg border-2 cursor-pointer transition-all hover-elevate ${
                selectedEmployee?.id === employee.id
                  ? 'border-primary bg-accent'
                  : 'border-border'
              }`}
              data-testid={`employee-card-${employee.id}`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: employee.color || '#3b82f6' }}
                  />
                  <span className="font-medium text-sm truncate">
                    {employee.firstName} {employee.lastName}
                  </span>
                </div>
                <Badge variant="secondary" className="text-xs">
                  {employee.position || 'N/A'}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                {employee.email}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="p-4 border-t">
        <Button className="w-full" data-testid="button-add-employee">
          <Plus className="h-4 w-4 mr-2" />
          Add Employee
        </Button>
      </div>
    </div>
  );
}

/**
 * AI Status Bar
 */
function AIStatusBar() {
  const [automationEnabled, setAutomationEnabled] = useState(false);

  return (
    <div className="flex items-center justify-between p-3 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-950/20 dark:to-cyan-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-blue-600" />
          <span className="font-medium text-sm">AI Brain</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAutomationEnabled(!automationEnabled)}
            className={`px-2 ${automationEnabled ? 'text-green-600' : 'text-muted-foreground'}`}
            data-testid="button-ai-toggle"
          >
            {automationEnabled ? 'ON' : 'OFF'}
          </Button>
        </div>

        <div className="h-6 w-px bg-border" />

        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            Gemini 2.0 Flash Exp
          </span>
        </div>
      </div>

      <Badge variant="outline" className="bg-background/50">
        <Bot className="h-3 w-3 mr-1" />
        99% AI, 1% Human
      </Badge>
    </div>
  );
}

/**
 * Schedule Grid Placeholder - Will implement next
 */
interface ScheduleGridProps {
  weekStart: Date;
  shifts: Shift[];
  employees: Employee[];
  clients: Client[];
  isLoading: boolean;
}

function ScheduleGrid({ weekStart, shifts, employees, clients, isLoading }: ScheduleGridProps) {
  return (
    <div className="h-full flex items-center justify-center p-8 text-center">
      <div>
        <Calendar className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
        <h3 className="text-lg font-semibold mb-2">Schedule Grid Coming Soon</h3>
        <p className="text-sm text-muted-foreground max-w-md">
          Building Sling-style drag & drop calendar with time slots and shift blocks...
        </p>
      </div>
    </div>
  );
}

/**
 * AI Pipelines Placeholder - Will integrate existing components
 */
interface AIPipelinesProps {
  onClose: () => void;
  onOpenProposal: () => void;
  onOpenMigration: () => void;
}

function AIPipelines({ onClose, onOpenProposal, onOpenMigration }: AIPipelinesProps) {
  return (
    <div className="w-96 bg-card border-l flex flex-col">
      <div className="p-4 border-b flex items-center justify-between">
        <h2 className="text-lg font-bold">AI Recommendations</h2>
        <Button variant="ghost" size="icon" onClick={onClose} data-testid="button-close-ai">
          ×
        </Button>
      </div>
      <ScrollArea className="flex-1 p-4">
        <p className="text-sm text-muted-foreground">
          AI recommendations panel will integrate ScheduleOS components here...
        </p>
      </ScrollArea>
    </div>
  );
}
