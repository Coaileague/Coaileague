import { useQuery } from "@tanstack/react-query";
import { Activity, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

interface BrainLogEntry {
  id: string;
  action: string;
  actionType: string;
  status: "pending" | "processing" | "completed" | "failed" | "error";
  priority: string;
  createdAt: string;
  executionTimeMs?: number;
  error?: string;
}

interface BrainLogsResponse {
  logs: BrainLogEntry[];
}

export function BrainActivityFeed() {
  const { data, isLoading, refetch } = useQuery<BrainLogsResponse>({
    queryKey: ["/api/ai-brain/logs", { limit: 15 }],
    staleTime: 5000,
    refetchInterval: 8000,
  });

  const getStatusColor = (status: string) => {
    if (status === "completed") return "text-green-500";
    if (status === "processing" || status === "pending") return "text-primary";
    if (status === "failed" || status === "error") return "text-red-500";
    return "text-muted-foreground";
  };

  const getStatusDot = (status: string) => {
    if (status === "completed") return "bg-green-500";
    if (status === "processing") return "bg-primary animate-pulse";
    if (status === "pending") return "bg-amber-500/70 animate-pulse";
    return "bg-red-500";
  };

  const formatAction = (action: string) =>
    action?.replace(/_/g, " ").replace(/\./g, " › ") ?? "Unknown";

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const logs = data?.logs ?? [];
  const activeCount = logs.filter(
    (l) => l.status === "processing" || l.status === "pending",
  ).length;

  return (
    <div className="bg-card border border-border rounded-lg p-5 space-y-3" data-testid="panel-brain-activity-feed">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Activity className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-foreground text-sm">Brain Activity</p>
            <p className="text-xs text-muted-foreground">
              {isLoading
                ? "Loading…"
                : activeCount > 0
                ? `${activeCount} active · live feed`
                : "Idle · polling every 8s"}
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          onClick={() => refetch()}
          data-testid="button-refresh-brain-activity"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </div>

      <ScrollArea className="h-52">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex gap-2 py-1">
                <div className="w-2 h-2 bg-muted/40 rounded-full mt-1.5 shrink-0 animate-pulse" />
                <div className="flex-1 space-y-1">
                  <div className="h-3 bg-muted/40 rounded animate-pulse w-3/4" />
                  <div className="h-2.5 bg-muted/40 rounded animate-pulse w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
            <Activity className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-sm">No recent activity</p>
          </div>
        ) : (
          <div className="space-y-0.5 pr-2">
            {logs.map((entry) => (
              <div
                key={entry.id}
                className="flex items-start gap-2.5 py-1.5 px-2 rounded hover:bg-muted/30 transition-colors group"
              >
                <div
                  className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${getStatusDot(entry.status)}`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground leading-snug truncate">
                    {formatAction(entry.action)}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {formatTime(entry.createdAt)}
                    </span>
                    <span className={`text-[10px] ${getStatusColor(entry.status)}`}>
                      {entry.status}
                    </span>
                    {entry.executionTimeMs && (
                      <span className="text-[10px] text-muted-foreground/60">
                        {entry.executionTimeMs}ms
                      </span>
                    )}
                  </div>
                  {entry.error && (
                    <p className="text-[10px] text-red-400 mt-0.5 truncate">{entry.error}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
