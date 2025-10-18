import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Calendar, Clock, FileText, DollarSign,
  User, Award, TrendingUp, Download
} from "lucide-react";
import { Link } from "wouter";
import type { Employee, Shift, TimeEntry } from "@shared/schema";

export default function EmployeePortalCompact() {
  const { user } = useAuth();

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
  });

  const { data: shifts = [] } = useQuery<Shift[]>({
    queryKey: ["/api/shifts"],
  });

  const { data: timeEntries = [] } = useQuery<TimeEntry[]>({
    queryKey: ["/api/time-entries"],
  });

  const currentEmployee = employees.find(emp => emp.email === user?.email);

  const today = new Date();
  const weekStart = new Date(today.setDate(today.getDate() - today.getDay()));
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  const myShifts = shifts.filter(shift => 
    shift.employeeId === currentEmployee?.id &&
    new Date(shift.startTime) >= weekStart &&
    new Date(shift.startTime) <= weekEnd
  );

  const myTimeEntries = timeEntries.filter(entry => entry.employeeId === currentEmployee?.id);

  const totalHoursThisWeek = myTimeEntries
    .filter(entry => {
      const entryDate = new Date(entry.clockIn);
      return entryDate >= weekStart && entryDate <= weekEnd && entry.clockOut;
    })
    .reduce((sum, entry) => sum + Number(entry.totalHours || 0), 0);

  const totalEarnings = myTimeEntries
    .filter(entry => entry.clockOut)
    .reduce((sum, entry) => sum + Number(entry.totalAmount || 0), 0);

  if (!currentEmployee) {
    return (
      <div className="p-3">
        <Card>
          <CardContent className="p-8 text-center">
            <User className="h-12 w-12 text-amber-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Employee Profile Not Found</h2>
            <p className="text-sm text-muted-foreground">
              You need to be registered as an employee to access this portal.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const initials = `${currentEmployee.firstName?.[0] || ''}${currentEmployee.lastName?.[0] || ''}`.toUpperCase();

  return (
    <div className="p-3 max-w-[1920px] mx-auto">
      {/* COMPACT HEADER */}
      <div className="flex items-center justify-between mb-3 bg-gradient-to-r from-violet-900 to-indigo-900 text-white p-3 rounded-lg">
        <div className="flex items-center gap-2">
          <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center font-bold text-sm">
            {initials}
          </div>
          <div>
            <h1 className="text-lg font-bold">Welcome, {currentEmployee.firstName}!</h1>
            <p className="text-xs opacity-75">Employee Portal · {currentEmployee.role || "Team Member"}</p>
          </div>
        </div>
        
        {/* QUICK ACTIONS */}
        <div className="flex items-center gap-2">
          <Link href="/time-tracking">
            <Button size="sm" variant="outline" className="bg-white/10 border-white/20 hover:bg-white/20 text-white h-7 text-xs" data-testid="button-clock-in">
              <Clock className="h-3 w-3 mr-1" />
              Clock In/Out
            </Button>
          </Link>
          <Link href="/schedules">
            <Button size="sm" variant="outline" className="bg-white/10 border-white/20 hover:bg-white/20 text-white h-7 text-xs" data-testid="button-view-schedule">
              <Calendar className="h-3 w-3 mr-1" />
              Schedule
            </Button>
          </Link>
          <Button size="sm" variant="outline" className="bg-white/10 border-white/20 hover:bg-white/20 text-white h-7 text-xs" data-testid="button-documents">
            <FileText className="h-3 w-3 mr-1" />
            Docs
          </Button>
        </div>
      </div>

      {/* COMPACT STATS */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        {[
          { icon: Clock, label: "Hours This Week", value: `${totalHoursThisWeek.toFixed(1)}h`, color: "text-indigo-600", testid: "stat-hours" },
          { icon: DollarSign, label: "Total Earnings", value: `$${totalEarnings.toFixed(2)}`, color: "text-emerald-600", testid: "stat-earnings" },
          { icon: Calendar, label: "Shifts This Week", value: myShifts.length, color: "text-blue-600", testid: "stat-shifts" },
          { icon: Award, label: "Status", value: currentEmployee.onboardingStatus === 'completed' ? 'Active' : 'Pending', color: currentEmployee.onboardingStatus === 'completed' ? "text-emerald-600" : "text-amber-600", testid: "stat-status" },
        ].map((stat, i) => (
          <Card key={i} className="hover-elevate">
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] text-muted-foreground truncate">{stat.label}</div>
                  <div className="text-base font-bold" data-testid={stat.testid}>{stat.value}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* CONTENT GRID */}
      <div className="grid grid-cols-2 gap-3">
        {/* This Week's Schedule */}
        <Card>
          <CardContent className="p-3">
            <h3 className="text-xs font-semibold mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                This Week's Schedule
              </span>
              <Badge variant="secondary" className="h-4 text-[10px]">{myShifts.length} shifts</Badge>
            </h3>
            <ScrollArea className="h-[200px]">
              {myShifts.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">No scheduled shifts this week</p>
              ) : (
                <div className="space-y-1">
                  {myShifts.map((shift) => (
                    <div key={shift.id} className="p-2 rounded bg-muted/50 hover:bg-muted text-xs">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium">{new Date(shift.startTime).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                        <Badge variant="outline" className="h-4 text-[10px]">Shift</Badge>
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {new Date(shift.startTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} - {new Date(shift.endTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Recent Time Entries */}
        <Card>
          <CardContent className="p-3">
            <h3 className="text-xs font-semibold mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Recent Time Entries
              </span>
              <Link href="/time-tracking">
                <Button size="sm" variant="ghost" className="h-5 text-[10px] px-2">View All</Button>
              </Link>
            </h3>
            <ScrollArea className="h-[200px]">
              {myTimeEntries.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">No time entries yet</p>
              ) : (
                <div className="space-y-1">
                  {myTimeEntries.slice(0, 10).map((entry) => (
                    <div key={entry.id} className="p-2 rounded bg-muted/50 hover:bg-muted text-xs">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium">{new Date(entry.clockIn).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                        <span className="text-[10px] font-bold text-emerald-600">${Number(entry.totalAmount || 0).toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>{entry.totalHours ? `${Number(entry.totalHours).toFixed(1)}h` : 'In progress'}</span>
                        {entry.clockOut && (
                          <Badge variant="secondary" className="h-3 text-[9px]">Completed</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
