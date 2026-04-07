import { CanvasHubPage, type CanvasPageConfig } from '@/components/canvas-hub';
import { useIsMobile } from '@/hooks/use-mobile';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, Plus, Trash2, Clock, Users, AlertTriangle, Check, X, Loader2, Save, RefreshCw } from "lucide-react";
import React, { useState, useEffect } from "react";
import { UniversalModal, UniversalModalDescription, UniversalModalFooter, UniversalModalHeader, UniversalModalTitle, UniversalModalTrigger, UniversalModalContent } from '@/components/ui/universal-modal';
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useIdentity } from "@/hooks/useIdentity";
import { cn } from "@/lib/utils";
import type { EmployeeAvailability } from "@shared/schema";

const DAYS_OF_WEEK = [
  { value: 0, label: "Sunday", short: "Sun" },
  { value: 1, label: "Monday", short: "Mon" },
  { value: 2, label: "Tuesday", short: "Tue" },
  { value: 3, label: "Wednesday", short: "Wed" },
  { value: 4, label: "Thursday", short: "Thu" },
  { value: 5, label: "Friday", short: "Fri" },
  { value: 6, label: "Saturday", short: "Sat" },
];

const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const hours = Math.floor(i / 2);
  const minutes = i % 2 === 0 ? "00" : "30";
  const time = `${hours.toString().padStart(2, "0")}:${minutes}`;
  const label = hours >= 12
    ? `${hours === 12 ? 12 : hours - 12}:${minutes} PM`
    : `${hours === 0 ? 12 : hours}:${minutes} AM`;
  return { value: time, label };
});

const STATUS_COLORS = {
  available: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
  unavailable: "bg-red-500/10 text-red-500 border-red-500/30",
  preferred: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
  limited: "bg-amber-500/10 text-amber-500 border-amber-500/30",
};

const EXCEPTION_TYPES = [
  { value: "vacation", label: "Vacation" },
  { value: "sick", label: "Sick Leave" },
  { value: "personal", label: "Personal" },
  { value: "unpaid", label: "Unpaid Leave" },
];

interface AvailabilitySlot {
  id?: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  status: "available" | "unavailable" | "preferred" | "limited";
  isRecurring: boolean;
  notes?: string;
}

interface TeamMemberAvailability {
  employeeId: string;
  employeeName: string;
  availability: EmployeeAvailability[];
  timeOffRequests: any[];
  totalAvailableHours: number;
}

interface UnderstaffingAlert {
  dayOfWeek: number;
  requiredStaff: number;
  availableStaff: number;
  gap: number;
  severity: "low" | "medium" | "high" | "critical";
  suggestions: string[];
}

export default function AvailabilityPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { workspaceRole, platformRole } = useIdentity();
  const isMobile = useIsMobile();
  const isManager = workspaceRole === 'org_owner' || 
                   workspaceRole === 'manager' || 
                   platformRole === 'root_admin' || 
                   platformRole === 'deputy_admin';
  const [activeTab, setActiveTab] = useState<"my-availability" | "team" | "exceptions">("my-availability");
  const [addSlotDialogOpen, setAddSlotDialogOpen] = useState(false);
  const [exceptionDialogOpen, setExceptionDialogOpen] = useState(false);
  const [editingSlots, setEditingSlots] = useState<AvailabilitySlot[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  const [newSlot, setNewSlot] = useState<AvailabilitySlot>({
    dayOfWeek: 1,
    startTime: "09:00",
    endTime: "17:00",
    status: "available",
    isRecurring: true,
  });

  const [newException, setNewException] = useState({
    startDate: "",
    endDate: "",
    requestType: "vacation" as const,
    reason: "",
    notes: "",
  });

  const { data: availabilityData, isLoading: availabilityLoading } = useQuery<EmployeeAvailability[]>({
    queryKey: ["/api/availability"],
    enabled: !!user,
  });

  const { data: teamData, isLoading: teamLoading } = useQuery<TeamMemberAvailability[]>({
    queryKey: ["/api/availability/team"],
    enabled: isManager,
  });

  const { data: understaffingAlerts } = useQuery<UnderstaffingAlert[]>({
    queryKey: ["/api/availability/understaffing"],
    enabled: isManager,
  });

  const saveAvailabilityMutation = useMutation({
    mutationFn: async (slots: AvailabilitySlot[]) => {
      const response = await apiRequest("POST", "/api/availability", { slots });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/availability"] });
      queryClient.invalidateQueries({ queryKey: ["/api/availability/team"] });
      toast({
        title: "Availability Saved",
        description: "Your availability has been updated successfully.",
      });
      setHasChanges(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save availability",
        variant: "destructive",
      });
    },
  });

  const deleteSlotMutation = useMutation({
    mutationFn: async (slotId: string) => {
      await apiRequest("DELETE", `/api/availability/${slotId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/availability"] });
      toast({
        title: "Slot Deleted",
        description: "Availability slot has been removed.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete slot",
        variant: "destructive",
      });
    },
  });

  const createExceptionMutation = useMutation({
    mutationFn: async (data: typeof newException) => {
      const response = await apiRequest("POST", "/api/availability/exception", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/availability"] });
      toast({
        title: "Time Off Requested",
        description: "Your time off request has been submitted.",
      });
      setExceptionDialogOpen(false);
      setNewException({
        startDate: "",
        endDate: "",
        requestType: "vacation",
        reason: "",
        notes: "",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to submit time off request",
        variant: "destructive",
      });
    },
  });

  const handleAddSlot = () => {
    setEditingSlots(prev => [...prev, { ...newSlot }]);
    setHasChanges(true);
    setAddSlotDialogOpen(false);
    setNewSlot({
      dayOfWeek: 1,
      startTime: "09:00",
      endTime: "17:00",
      status: "available",
      isRecurring: true,
    });
  };

  const handleRemoveSlot = (index: number) => {
    const slot = editingSlots[index];
    if (slot.id) {
      deleteSlotMutation.mutate(slot.id);
    }
    setEditingSlots(editingSlots.filter((_, i) => i !== index));
    setHasChanges(true);
  };

  const handleSaveAvailability = () => {
    saveAvailabilityMutation.mutate(editingSlots);
  };

  const handleResetChanges = () => {
    if (availabilityData) {
      setEditingSlots(
        availabilityData.map((a) => ({
          id: a.id,
          dayOfWeek: a.dayOfWeek,
          startTime: a.startTime,
          endTime: a.endTime,
          status: (a.status as any) || "available",
          isRecurring: a.isRecurring ?? true,
          notes: a.notes || undefined,
        }))
      );
    }
    setHasChanges(false);
  };

  const initializeEditingSlots = () => {
    if (availabilityData && editingSlots.length === 0) {
      setEditingSlots(
        availabilityData.map((a) => ({
          id: a.id,
          dayOfWeek: a.dayOfWeek,
          startTime: a.startTime,
          endTime: a.endTime,
          status: (a.status as any) || "available",
          isRecurring: a.isRecurring ?? true,
          notes: a.notes || undefined,
        }))
      );
    }
  };

  useEffect(() => {
    if (availabilityData && editingSlots.length === 0 && !hasChanges) {
      initializeEditingSlots();
    }
  }, [availabilityData]);

  const getSlotsByDay = (slots: AvailabilitySlot[], day: number) => {
    return slots.filter((s) => s.dayOfWeek === day);
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical": return "bg-red-500/10 text-red-500 border-red-500/30";
      case "high": return "bg-orange-500/10 text-orange-500 border-orange-500/30";
      case "medium": return "bg-amber-500/10 text-amber-500 border-amber-500/30";
      default: return "bg-yellow-500/10 text-yellow-500 border-yellow-500/30";
    }
  };

  const headerAction = (
    <div className="flex gap-2 flex-wrap">
      {activeTab === "my-availability" && hasChanges && (
        <>
          <Button
            variant="outline"
            onClick={handleResetChanges}
            data-testid="button-reset-availability"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            {!isMobile && "Reset"}
          </Button>
          <Button
            onClick={handleSaveAvailability}
            disabled={saveAvailabilityMutation.isPending}
            data-testid="button-save-availability"
          >
            {saveAvailabilityMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {!isMobile && "Save Changes"}
          </Button>
        </>
      )}
      {activeTab === "exceptions" && (
        <UniversalModal open={exceptionDialogOpen} onOpenChange={setExceptionDialogOpen}>
          <UniversalModalTrigger asChild>
            <Button data-testid="button-add-exception">
              <Plus className="h-4 w-4 mr-2" />
              {!isMobile && "Request Time Off"}
            </Button>
          </UniversalModalTrigger>
          <UniversalModalContent size="md" data-testid="dialog-add-exception">
            <UniversalModalHeader>
              <UniversalModalTitle>Request Time Off</UniversalModalTitle>
              <UniversalModalDescription>
                Submit a time off request for vacation, sick leave, or personal days
              </UniversalModalDescription>
            </UniversalModalHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="exception-type">Type</Label>
                <Select
                  value={newException.requestType}
                  onValueChange={(value) =>
                    setNewException({ ...newException, requestType: value as any })
                  }
                >
                  <SelectTrigger data-testid="select-exception-type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {EXCEPTION_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="exception-start">Start Date</Label>
                  <Input
                    id="exception-start"
                    type="date"
                    value={newException.startDate}
                    onChange={(e) =>
                      setNewException({ ...newException, startDate: e.target.value })
                    }
                    data-testid="input-exception-start"
                  />
                </div>
                <div>
                  <Label htmlFor="exception-end">End Date</Label>
                  <Input
                    id="exception-end"
                    type="date"
                    value={newException.endDate}
                    onChange={(e) =>
                      setNewException({ ...newException, endDate: e.target.value })
                    }
                    data-testid="input-exception-end"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="exception-reason">Reason</Label>
                <Textarea
                  id="exception-reason"
                  placeholder="Brief reason for time off..."
                  value={newException.reason}
                  onChange={(e) =>
                    setNewException({ ...newException, reason: e.target.value })
                  }
                  data-testid="input-exception-reason"
                />
              </div>
              <div>
                <Label htmlFor="exception-notes">Additional Notes</Label>
                <Textarea
                  id="exception-notes"
                  placeholder="Any additional information..."
                  value={newException.notes}
                  onChange={(e) =>
                    setNewException({ ...newException, notes: e.target.value })
                  }
                  data-testid="input-exception-notes"
                />
              </div>
            </div>
            <UniversalModalFooter>
              <Button
                variant="outline"
                onClick={() => setExceptionDialogOpen(false)}
                data-testid="button-cancel-exception"
              >
                Cancel
              </Button>
              <Button
                onClick={() => createExceptionMutation.mutate(newException)}
                disabled={
                  createExceptionMutation.isPending ||
                  !newException.startDate ||
                  !newException.endDate
                }
                data-testid="button-submit-exception"
              >
                {createExceptionMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                Submit Request
              </Button>
            </UniversalModalFooter>
          </UniversalModalContent>
        </UniversalModal>
      )}
    </div>
  );

  const pageConfig: CanvasPageConfig = {
    id: 'availability',
    title: 'Availability Management',
    subtitle: 'Set your work schedule and manage time-off requests',
    category: 'operations',
    headerActions: headerAction,
  };

  return (
    <CanvasHubPage config={pageConfig}>
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as typeof activeTab)}
        className="mt-2"
      >
        <TabsList className={cn(
          "grid w-full mx-auto",
          isManager ? "max-w-md grid-cols-3" : "max-w-xs grid-cols-2"
        )} data-testid="tabs-availability">
          <TabsTrigger value="my-availability" data-testid="tab-my-availability">
            <Clock className="h-4 w-4 mr-2" />
            {!isMobile && "My"} Availability
          </TabsTrigger>
          <TabsTrigger value="exceptions" data-testid="tab-exceptions">
            <Calendar className="h-4 w-4 mr-2" />
            Time Off
          </TabsTrigger>
          {isManager && (
            <TabsTrigger value="team" data-testid="tab-team">
              <Users className="h-4 w-4 mr-2" />
              Team{!isMobile && " View"}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="my-availability" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <CardTitle>Weekly Availability</CardTitle>
                  <CardDescription>
                    Set your recurring weekly schedule. These times will be used for shift scheduling.
                  </CardDescription>
                </div>
                <UniversalModal open={addSlotDialogOpen} onOpenChange={setAddSlotDialogOpen}>
                  <UniversalModalTrigger asChild>
                    <Button data-testid="button-add-slot">
                      <Plus className="h-4 w-4 mr-2" />
                      {!isMobile && "Add Time Slot"}
                    </Button>
                  </UniversalModalTrigger>
                  <UniversalModalContent size="md" data-testid="dialog-add-slot">
                    <UniversalModalHeader>
                      <UniversalModalTitle>Add Availability Slot</UniversalModalTitle>
                      <UniversalModalDescription>
                        Add a time slot when you're available to work
                      </UniversalModalDescription>
                    </UniversalModalHeader>
                    <div className="space-y-4">
                      <div>
                        <Label>Day of Week</Label>
                        <Select
                          value={newSlot.dayOfWeek.toString()}
                          onValueChange={(v) =>
                            setNewSlot({ ...newSlot, dayOfWeek: parseInt(v) })
                          }
                        >
                          <SelectTrigger data-testid="select-day">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {DAYS_OF_WEEK.map((day) => (
                              <SelectItem key={day.value} value={day.value.toString()}>
                                {day.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <Label>Start Time</Label>
                          <Select
                            value={newSlot.startTime}
                            onValueChange={(v) => setNewSlot({ ...newSlot, startTime: v })}
                          >
                            <SelectTrigger data-testid="select-start-time">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {TIME_OPTIONS.map((time) => (
                                <SelectItem key={time.value} value={time.value}>
                                  {time.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>End Time</Label>
                          <Select
                            value={newSlot.endTime}
                            onValueChange={(v) => setNewSlot({ ...newSlot, endTime: v })}
                          >
                            <SelectTrigger data-testid="select-end-time">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {TIME_OPTIONS.map((time) => (
                                <SelectItem key={time.value} value={time.value}>
                                  {time.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div>
                        <Label>Status</Label>
                        <Select
                          value={newSlot.status}
                          onValueChange={(v) =>
                            setNewSlot({ ...newSlot, status: v as typeof newSlot.status })
                          }
                        >
                          <SelectTrigger data-testid="select-status">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="available">Available</SelectItem>
                            <SelectItem value="preferred">Preferred</SelectItem>
                            <SelectItem value="limited">Limited Availability</SelectItem>
                            <SelectItem value="unavailable">Unavailable</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={newSlot.isRecurring}
                          onCheckedChange={(checked) =>
                            setNewSlot({ ...newSlot, isRecurring: checked })
                          }
                          data-testid="switch-recurring"
                        />
                        <Label>Recurring weekly</Label>
                      </div>
                    </div>
                    <UniversalModalFooter>
                      <Button
                        variant="outline"
                        onClick={() => setAddSlotDialogOpen(false)}
                        data-testid="button-cancel-slot"
                      >
                        Cancel
                      </Button>
                      <Button onClick={handleAddSlot} data-testid="button-confirm-slot">
                        Add Slot
                      </Button>
                    </UniversalModalFooter>
                  </UniversalModalContent>
                </UniversalModal>
              </div>
            </CardHeader>
            <CardContent>
              {availabilityLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className={cn(
                  "grid gap-4",
                  isMobile ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-7"
                )}>
                  {DAYS_OF_WEEK.map((day) => (
                    <div
                      key={day.value}
                      className="border rounded-lg p-3 md:p-4 min-h-[150px] md:min-h-[200px]"
                      data-testid={`day-column-${day.value}`}
                    >
                      <div className="font-medium text-xs md:text-sm mb-2 md:mb-3 text-center">
                        {isMobile ? day.short : day.label}
                      </div>
                      <div className="space-y-2">
                        {getSlotsByDay(editingSlots, day.value).map((slot, index) => {
                          const slotIndex = editingSlots.findIndex(
                            (s) =>
                              s.dayOfWeek === slot.dayOfWeek &&
                              s.startTime === slot.startTime &&
                              s.endTime === slot.endTime
                          );
                          return (
                            <div
                              key={`${slot.dayOfWeek}-${slot.startTime}-${index}`}
                              className={cn(
                                "p-2 rounded-md border text-xs relative group",
                                STATUS_COLORS[slot.status]
                              )}
                              data-testid={`slot-${day.value}-${index}`}
                            >
                              <div className="font-medium text-[10px] md:text-xs">
                                {slot.startTime} - {slot.endTime}
                              </div>
                              <div className="text-muted-foreground capitalize text-[10px] md:text-xs">{slot.status}</div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="absolute top-1 right-1 h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => handleRemoveSlot(slotIndex)}
                                data-testid={`button-remove-slot-${slotIndex}`}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          );
                        })}
                        {getSlotsByDay(editingSlots, day.value).length === 0 && (
                          <div className="text-[10px] md:text-xs text-muted-foreground text-center py-4">
                            No availability
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-3 md:gap-4 mt-4 md:mt-6 justify-center">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-emerald-500" />
                  <span className="text-xs md:text-sm text-muted-foreground">Available</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-cyan-400" />
                  <span className="text-xs md:text-sm text-muted-foreground">Preferred</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-amber-500" />
                  <span className="text-xs md:text-sm text-muted-foreground">Limited</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <span className="text-xs md:text-sm text-muted-foreground">Unavailable</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="exceptions" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Time Off Requests</CardTitle>
              <CardDescription>
                Request vacation, sick leave, or personal days
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center py-12">
                <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground text-center">
                  Submit time off requests to notify your manager and prevent scheduling conflicts
                </p>
                <Button className="mt-4" onClick={() => setExceptionDialogOpen(true)} data-testid="button-request-time-off">
                  <Plus className="h-4 w-4 mr-2" />
                  Request Time Off
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {isManager && (
          <TabsContent value="team" className="mt-6 space-y-6">
            {understaffingAlerts && understaffingAlerts.length > 0 && (
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                    <CardTitle className="text-lg">Understaffing Alerts</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                    {understaffingAlerts.map((alert) => (
                      <div
                        key={alert.dayOfWeek}
                        className={cn(
                          "p-4 rounded-lg border",
                          getSeverityColor(alert.severity)
                        )}
                        data-testid={`alert-day-${alert.dayOfWeek}`}
                      >
                        <div className="font-medium">
                          {DAYS_OF_WEEK.find((d) => d.value === alert.dayOfWeek)?.label}
                        </div>
                        <div className="text-sm mt-1">
                          Need {alert.requiredStaff} staff, have {alert.availableStaff}
                        </div>
                        <Badge className="mt-2 capitalize">{alert.severity}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Team Availability Overview</CardTitle>
                <CardDescription>
                  View all team members' availability at a glance
                </CardDescription>
              </CardHeader>
              <CardContent>
                {teamLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : teamData && teamData.length > 0 ? (
                  <div className="space-y-4">
                    {teamData.map((member) => (
                      <div
                        key={member.employeeId}
                        className="p-4 border rounded-lg"
                        data-testid={`team-member-${member.employeeId}`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="font-medium">{member.employeeName}</div>
                          <Badge variant="outline">
                            {member.totalAvailableHours}h/week
                          </Badge>
                        </div>
                        <div className="grid grid-cols-7 gap-1">
                          {DAYS_OF_WEEK.map((day) => {
                            const daySlots = member.availability.filter(
                              (a) => a.dayOfWeek === day.value
                            );
                            const hasAvailability = daySlots.length > 0;
                            return (
                              <div
                                key={day.value}
                                className={cn(
                                  "text-center p-2 rounded text-xs",
                                  hasAvailability
                                    ? "bg-emerald-500/10 text-emerald-500"
                                    : "bg-muted text-muted-foreground"
                                )}
                              >
                                <div className="font-medium">{day.short}</div>
                                {daySlots.length > 0 && (
                                  <div className="text-[10px] mt-1">
                                    {daySlots.map((s, i) => (
                                      <div key={i}>
                                        {s.startTime.slice(0, 5)}-{s.endTime.slice(0, 5)}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12">
                    <Users className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground text-center">
                      No team members have submitted their availability yet
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </CanvasHubPage>
  );
}
