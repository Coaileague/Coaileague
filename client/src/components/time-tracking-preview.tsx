import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Play, Square, Calendar } from "lucide-react";

/**
 * Time Tracking Preview Component  
 * Shows real WorkforceOS Time Tracking interface
 */
export function TimeTrackingPreview() {
  const timeEntries = [
    { employee: "Alex K.", client: "Tech Corp", hours: "7.5", status: "completed" },
    { employee: "Jordan S.", client: "Retail Co", hours: "8.0", status: "completed" },
    { employee: "Taylor M.", client: "Healthcare", hours: "in progress", status: "active" },
  ];

  return (
    <div className="w-full h-full bg-background rounded-lg overflow-hidden border shadow-xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          <h3 className="font-bold text-sm">Time Tracking</h3>
        </div>
        <Badge variant="default" className="text-xs">Today</Badge>
      </div>

      {/* Active Timer */}
      <Card className="p-3 mb-3 bg-primary/5 border-primary/20">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="font-semibold text-sm mb-1">Taylor M.</div>
            <div className="text-xs text-muted-foreground">Healthcare Inc</div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-primary">2:34:15</div>
            <button className="mt-1 p-1.5 bg-primary text-primary-foreground rounded-md hover-elevate">
              <Square className="h-3 w-3" />
            </button>
          </div>
        </div>
      </Card>

      {/* Time Entries */}
      <div className="space-y-2">
        {timeEntries.slice(0, 2).map((entry, idx) => (
          <Card key={idx} className="p-2.5">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="font-medium text-xs">{entry.employee}</div>
                <div className="text-[10px] text-muted-foreground">{entry.client}</div>
              </div>
              <div className="text-right">
                <div className="font-semibold text-sm">{entry.hours}h</div>
                <div className="text-[10px] text-blue-500">✓ Completed</div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Stats */}
      <div className="mt-4 pt-3 border-t grid grid-cols-2 gap-3 text-center">
        <div>
          <div className="text-lg font-bold text-primary">23.5</div>
          <div className="text-[10px] text-muted-foreground">Hours Today</div>
        </div>
        <div>
          <div className="text-lg font-bold text-blue-500">$1,175</div>
          <div className="text-[10px] text-muted-foreground">Revenue</div>
        </div>
      </div>
    </div>
  );
}
