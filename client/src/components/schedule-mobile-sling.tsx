import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ChevronLeft, ChevronRight, Clock, MapPin, Users } from "lucide-react";
import type { Shift, Employee, Client } from "@shared/schema";
import moment from "moment";

interface SlingMobileScheduleProps {
  shifts: Shift[];
  employees: Employee[];
  clients: Client[];
  currentDate: Date;
  onDateChange: (date: Date) => void;
  onShiftClick: (shift: Shift) => void;
}

type TabType = "my-schedule" | "full-schedule" | "pending";

export function SlingMobileSchedule({
  shifts,
  employees,
  clients,
  currentDate,
  onDateChange,
  onShiftClick,
}: SlingMobileScheduleProps) {
  const [activeTab, setActiveTab] = useState<TabType>("full-schedule");
  const [selectedWeekStart, setSelectedWeekStart] = useState(
    moment(currentDate).startOf("week")
  );

  // Get current month for dropdown
  const currentMonth = moment(selectedWeekStart).format("MMMM YYYY");

  // Generate week days (7 days starting from selectedWeekStart)
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) =>
      selectedWeekStart.clone().add(i, "days")
    );
  }, [selectedWeekStart]);

  // Filter shifts for the current week
  const weekShifts = useMemo(() => {
    return shifts.filter((shift) => {
      const shiftDate = moment(shift.startTime);
      return shiftDate.isBetween(
        selectedWeekStart,
        selectedWeekStart.clone().add(7, "days"),
        "day",
        "[)"
      );
    });
  }, [shifts, selectedWeekStart]);

  // Group shifts by day
  const shiftsByDay = useMemo(() => {
    const grouped: Record<string, Shift[]> = {};
    weekDays.forEach((day) => {
      const dayKey = day.format("YYYY-MM-DD");
      grouped[dayKey] = weekShifts
        .filter((s) => moment(s.startTime).isSame(day, "day"))
        .sort((a, b) => moment(a.startTime).diff(moment(b.startTime)));
    });
    return grouped;
  }, [weekShifts, weekDays]);

  // Calculate total hours for the week
  const totalHours = useMemo(() => {
    let total = 0;
    weekShifts.forEach((shift) => {
      const duration = moment.duration(
        moment(shift.endTime).diff(moment(shift.startTime))
      );
      total += duration.asHours();
    });
    return total.toFixed(1);
  }, [weekShifts]);

  // Check if a day has shifts
  const dayHasShifts = (day: moment.Moment) => {
    const dayKey = day.format("YYYY-MM-DD");
    return shiftsByDay[dayKey]?.length > 0;
  };

  // Navigate week
  const navigateWeek = (direction: "prev" | "next") => {
    const newStart = selectedWeekStart.clone().add(direction === "next" ? 7 : -7, "days");
    setSelectedWeekStart(newStart);
    onDateChange(newStart.toDate());
  };

  // Get shift color based on status
  const getShiftColor = (shift: Shift) => {
    if (!shift.employeeId) {
      // Open shift - gray
      return "bg-gray-400 border-gray-300";
    }
    if (shift.status === "draft") {
      // Draft - beige/tan
      return "bg-amber-200 border-amber-300 text-amber-900";
    }
    // Published - red/salmon
    return "bg-red-400 border-red-500";
  };

  // Render shift card
  const ShiftCard = ({ shift }: { shift: Shift }) => {
    const employee = employees.find((e) => e.id === shift.employeeId);
    const client = clients.find((c) => c.id === shift.clientId);
    const duration = moment.duration(
      moment(shift.endTime).diff(moment(shift.startTime))
    );
    const hours = Math.floor(duration.asHours());
    const minutes = duration.minutes();
    const colorClass = getShiftColor(shift);

    return (
      <div
        onClick={() => onShiftClick(shift)}
        className={`${colorClass} rounded-lg p-4 mb-3 shadow-sm border-2 cursor-pointer hover-elevate active-elevate-2 transition-all`}
        data-testid={`mobile-shift-card-${shift.id}`}
      >
        {/* Time and Duration */}
        <div className="font-bold text-lg mb-1">
          {moment(shift.startTime).format("h:mm A")} -{" "}
          {moment(shift.endTime).format("h:mm A")} •{" "}
          <span className="font-normal text-base">
            {hours}h {minutes > 0 ? `${minutes}min` : ""}
          </span>
        </div>

        {/* Employee or "Unassigned" */}
        {employee ? (
          <div className="font-semibold mb-1">
            {employee.firstName} {employee.lastName}
          </div>
        ) : (
          <div className="font-semibold mb-1 flex items-center gap-2">
            <Users className="h-4 w-4" />
            Unassigned
          </div>
        )}

        {/* Client/Location */}
        {client && (
          <div className="flex items-center gap-1 text-sm">
            <MapPin className="h-3 w-3" />
            {client.firstName} {client.lastName}
          </div>
        )}

        {/* Status badge */}
        {shift.status === "draft" && (
          <Badge className="mt-2 text-xs bg-amber-600 text-white">DRAFT</Badge>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Month Selector */}
      <div className="border-b bg-background px-4 py-3">
        <Select value={currentMonth}>
          <SelectTrigger className="w-full font-semibold" data-testid="select-month">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: 12 }, (_, i) => {
              const month = moment().month(i).format("MMMM YYYY");
              return (
                <SelectItem key={month} value={month}>
                  {month}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      {/* Tabs */}
      <div className="border-b bg-background">
        <div className="flex items-center">
          <Button
            variant={activeTab === "my-schedule" ? "default" : "ghost"}
            className={`flex-1 rounded-none h-12 ${
              activeTab === "my-schedule"
                ? "border-b-2 border-primary bg-primary/10"
                : ""
            }`}
            onClick={() => setActiveTab("my-schedule")}
            data-testid="tab-my-schedule-mobile"
          >
            My schedule
          </Button>
          <Button
            variant={activeTab === "full-schedule" ? "default" : "ghost"}
            className={`flex-1 rounded-none h-12 ${
              activeTab === "full-schedule"
                ? "border-b-2 border-primary bg-primary/10"
                : ""
            }`}
            onClick={() => setActiveTab("full-schedule")}
            data-testid="tab-full-schedule-mobile"
          >
            Full schedule
          </Button>
          <Button
            variant={activeTab === "pending" ? "default" : "ghost"}
            className={`flex-1 rounded-none h-12 ${
              activeTab === "pending"
                ? "border-b-2 border-primary bg-primary/10"
                : ""
            }`}
            onClick={() => setActiveTab("pending")}
            data-testid="tab-pending-mobile"
          >
            Pending
          </Button>
        </div>
      </div>

      {/* Week Navigation & Calendar */}
      <div className="border-b bg-muted/20">
        {/* Week navigation header */}
        <div className="flex items-center justify-between px-4 py-2 border-b">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigateWeek("prev")}
            data-testid="button-prev-week-mobile"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="text-center">
            <div className="font-semibold text-sm">
              {weekDays[0].format("D")} -{" "}
              {weekDays[6].format("D MMM")}
            </div>
            <div className="text-xs text-muted-foreground">
              {totalHours}h total
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigateWeek("next")}
            data-testid="button-next-week-mobile"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        {/* Horizontal week calendar */}
        <div className="flex items-center justify-around px-2 py-3">
          {weekDays.map((day, index) => {
            const isToday = day.isSame(moment(), "day");
            const hasShifts = dayHasShifts(day);
            return (
              <div
                key={index}
                className="flex flex-col items-center"
                data-testid={`day-indicator-${day.format("YYYY-MM-DD")}`}
              >
                <div
                  className={`text-xs mb-1 ${
                    isToday ? "font-bold text-primary" : "text-muted-foreground"
                  }`}
                >
                  {day.format("ddd")[0]}
                </div>
                <div
                  className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-semibold ${
                    isToday
                      ? "bg-primary text-primary-foreground"
                      : "bg-background"
                  }`}
                >
                  {day.format("D")}
                </div>
                {/* Dot indicator if day has shifts */}
                {hasShifts && (
                  <div className="w-1 h-1 bg-primary rounded-full mt-1" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Shift Cards List */}
      <div className="flex-1 overflow-auto p-4">
        {weekShifts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-6">
            <Clock className="h-12 w-12 text-muted-foreground mb-3" />
            <h3 className="font-semibold text-lg mb-2">No shifts this week</h3>
            <p className="text-sm text-muted-foreground">
              Shifts will appear here when scheduled
            </p>
          </div>
        ) : (
          <div>
            {weekDays.map((day) => {
              const dayKey = day.format("YYYY-MM-DD");
              const dayShifts = shiftsByDay[dayKey] || [];

              if (dayShifts.length === 0) return null;

              return (
                <div key={dayKey} className="mb-6">
                  {/* Day header */}
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-lg">
                      {day.format("dddd, MMM D")}
                    </h3>
                    <Badge variant="outline" className="text-xs">
                      {dayShifts.length} shift{dayShifts.length !== 1 ? "s" : ""}
                    </Badge>
                  </div>

                  {/* Shifts for this day */}
                  {dayShifts.map((shift) => (
                    <ShiftCard key={shift.id} shift={shift} />
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
