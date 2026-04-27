import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Calendar, GripVertical, Sparkles } from "lucide-react";

/**
 * AI Scheduling Preview Component - GetSling-Style Drag & Drop Grid
 * Shows the modern drag-and-drop scheduling interface
 * Showcases the actual product's advanced scheduling capabilities
 */
export function SchedulePreview() {
  // Time slots for grid
  const timeSlots = ["7 AM", "9 AM", "11 AM", "1 PM", "3 PM", "5 PM"];
  
  // Employees with shifts
  const employees = [
    { id: "e1", name: "Sarah M.", initials: "SM", color: "bg-blue-500" },
    { id: "e2", name: "John D.", initials: "JD", color: "bg-muted/30" },
    { id: "e3", name: "Maria G.", initials: "MG", color: "bg-purple-500" },
  ];

  // Shifts positioned in the grid (simplified for preview)
  const shifts = [
    { employeeId: "e1", timeSlot: "9 AM", status: "published", client: "Tech Corp", hours: "4h" },
    { employeeId: "e1", timeSlot: "1 PM", status: "published", client: "Retail Co", hours: "4h" },
    { employeeId: "e2", timeSlot: "7 AM", status: "draft", client: "Healthcare", hours: "8h" },
    { employeeId: "e3", timeSlot: "3 PM", status: "published", client: "Finance Inc", hours: "6h" },
  ];
  
  const getStatusColor = (status: string) => {
    return status === "published" ? "border-primary" : "border-blue-500 border-dashed animate-pulse";
  };

  return (
    <div className="w-full h-full bg-background rounded-md overflow-hidden shadow-sm">
      {/* Header - Modern AI Scheduling branding */}
      <div className="border-b bg-gradient-to-r from-primary/10 via-primary/5 to-background px-4 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" />
          <h3 className="font-bold text-sm">Trinity Schedule</h3>
          <Badge variant="outline" className="text-xs px-2">
            <Sparkles className="h-3 w-3 mr-1" />
            Drag & Drop Grid
          </Badge>
        </div>
        <Badge className="text-xs">Week: Dec 9-15</Badge>
      </div>

      {/* Grid Container - GetSling-style interface */}
      <div className="p-2 overflow-x-auto">
        <div className="min-w-[400px] sm:min-w-[500px]">
          {/* Time header row */}
          <div className="flex gap-0.5 sm:gap-1 mb-2">
            <div className="w-16 sm:w-24 flex-shrink-0" /> {/* Employee column spacer */}
            {timeSlots.map((time) => (
              <div key={time} className="flex-1 text-center text-[8px] sm:text-[10px] font-medium text-muted-foreground py-1 min-w-[40px]">
                {time}
              </div>
            ))}
          </div>

          {/* Employee rows with shift cards */}
          <div className="space-y-1">
            {employees.map((employee) => (
              <div key={employee.id} className="flex gap-0.5 sm:gap-1">
                {/* Employee header cell */}
                <div className="w-16 sm:w-24 flex-shrink-0 flex items-center gap-1 sm:gap-2 py-1 px-1 sm:px-2 rounded bg-muted/30">
                  <Avatar className="h-6 w-6 sm:h-7 sm:w-7">
                    <AvatarFallback className="text-[10px] sm:text-xs font-semibold">{employee.initials}</AvatarFallback>
                  </Avatar>
                  <span className="text-[10px] sm:text-xs font-medium truncate hidden xs:block sm:block">{employee.name}</span>
                </div>

                {/* Time slot cells */}
                {timeSlots.map((time) => {
                  const shift = shifts.find(s => s.employeeId === employee.id && s.timeSlot === time);
                  return (
                    <div key={time} className="flex-1 min-h-[40px] sm:min-h-[48px] p-0.5 min-w-[40px]">
                      {shift ? (
                        <Card className={`h-full p-1 sm:p-2 relative border ${getStatusColor(shift.status)} hover-elevate cursor-grab active:cursor-grabbing transition-all`}>
                          <div className="absolute top-0.5 left-0.5 text-muted-foreground/50 hidden sm:block">
                            <GripVertical className="h-3 w-3" />
                          </div>
                          <div className="text-[8px] sm:text-[10px] font-semibold truncate sm:pl-3">{shift.client}</div>
                          <div className="text-[7px] sm:text-[9px] text-muted-foreground">{shift.hours}</div>
                          <Badge 
                            variant={shift.status === "published" ? "default" : "secondary"}
                            className="absolute -top-1 -right-1 h-3 sm:h-4 px-0.5 sm:px-1 text-[6px] sm:text-[8px]"
                          >
                            {shift.status === "published" ? "✓" : "!"}
                          </Badge>
                        </Card>
                      ) : (
                        <div className="h-full rounded border border-dashed border-muted-foreground/20 bg-muted/10 hover:bg-muted/30 hover:border-primary/40 transition-colors cursor-pointer" />
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Stats footer */}
          <div className="mt-3 pt-2 border-t flex items-center justify-around text-center">
            <div className="space-y-0.5">
              <div className="text-sm font-bold text-primary">24</div>
              <div className="text-[9px] text-muted-foreground">Total Shifts</div>
            </div>
            <div className="h-6 w-px bg-border" />
            <div className="space-y-0.5">
              <div className="text-sm font-bold text-blue-500">156h</div>
              <div className="text-[9px] text-muted-foreground">Scheduled</div>
            </div>
            <div className="h-6 w-px bg-border" />
            <div className="space-y-0.5">
              <div className="text-sm font-bold text-blue-500">$4,280</div>
              <div className="text-[9px] text-muted-foreground">Labor Cost</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
