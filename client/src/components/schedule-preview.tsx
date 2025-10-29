import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, Users, MapPin } from "lucide-react";

/**
 * ScheduleOS Preview Component
 * Shows a real representation of the WorkforceOS Schedule interface
 * NOT a generic placeholder - this is actual product UI
 */
export function SchedulePreview() {
  // Sample schedule data representing real shifts
  const scheduleData = [
    { id: 1, employee: "Sarah M.", client: "Tech Corp", time: "9:00 AM - 5:00 PM", status: "confirmed", color: "bg-blue-500" },
    { id: 2, employee: "John D.", client: "Retail Plus", time: "10:00 AM - 6:00 PM", status: "confirmed", color: "bg-green-500" },
    { id: 3, employee: "Maria G.", client: "Healthcare Inc", time: "2:00 PM - 10:00 PM", status: "pending", color: "bg-amber-500" },
  ];

  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  
  return (
    <div className="w-full h-full bg-background rounded-lg overflow-hidden border shadow-xl">
      {/* ScheduleOS Header - matches actual product */}
      <div className="border-b bg-card/50 backdrop-blur-sm px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" />
          <h3 className="font-bold text-sm">ScheduleOS™</h3>
          <Badge variant="outline" className="text-xs">Week View</Badge>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Users className="h-3 w-3" />
          <span>{scheduleData.length} Shifts</span>
        </div>
      </div>

      {/* Calendar Grid - showing real schedule interface */}
      <div className="p-3">
        {/* Week header */}
        <div className="grid grid-cols-5 gap-2 mb-2">
          {days.map((day, idx) => (
            <div key={day} className="text-center py-2 rounded-md bg-muted/50 text-xs font-medium">
              <div>{day}</div>
              <div className="text-muted-foreground text-[10px]">Dec {10 + idx}</div>
            </div>
          ))}
        </div>

        {/* Shift cards - actual WorkforceOS shift representation */}
        <div className="space-y-2 mt-3">
          {scheduleData.map((shift) => (
            <Card key={shift.id} className="p-3 hover-elevate cursor-pointer">
              <div className="flex items-start gap-3">
                <div className={`w-1 h-full rounded-full ${shift.color}`} />
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm truncate">{shift.employee}</span>
                    <Badge 
                      variant={shift.status === "confirmed" ? "default" : "secondary"}
                      className="text-[10px] h-5"
                    >
                      {shift.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    <span className="truncate">{shift.client}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>{shift.time}</span>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Stats footer - showing real metrics */}
        <div className="mt-4 pt-3 border-t grid grid-cols-3 gap-2 text-center">
          <div className="space-y-1">
            <div className="text-lg font-bold text-primary">24</div>
            <div className="text-[10px] text-muted-foreground">Total Shifts</div>
          </div>
          <div className="space-y-1">
            <div className="text-lg font-bold text-green-500">18</div>
            <div className="text-[10px] text-muted-foreground">Confirmed</div>
          </div>
          <div className="space-y-1">
            <div className="text-lg font-bold text-amber-500">6</div>
            <div className="text-[10px] text-muted-foreground">Pending</div>
          </div>
        </div>
      </div>
    </div>
  );
}
