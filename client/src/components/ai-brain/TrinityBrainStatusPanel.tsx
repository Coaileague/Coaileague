import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface CircuitStatus {
  state: "closed" | "open" | "half_open";
  failures: number;
  lastFailure: string | null;
}

interface CircuitStatusResponse {
  success: boolean;
  circuits: Record<string, CircuitStatus>;
  timestamp: string;
}

interface TrinityBrainStatusPanelProps {
  canReset?: boolean;
}

export function TrinityBrainStatusPanel({ canReset = true }: TrinityBrainStatusPanelProps) {
  const { toast } = useToast();
  const [resettingService, setResettingService] = useState<string | null>(null);

  const {
    data: circuits,
    isLoading: circuitsLoading,
    refetch: refetchCircuits,
  } = useQuery<CircuitStatusResponse>({
    queryKey: ["/api/resilience/circuit-breaker/status"],
    staleTime: 10000,
    refetchInterval: 15000,
  });

  const resetMutation = useMutation({
    mutationFn: async (service: string) => {
      return apiRequest("POST", `/api/resilience/circuit-breaker/${service}/reset`);
    },
    onMutate: (service) => setResettingService(service),
    onSuccess: (_, service) => {
      queryClient.invalidateQueries({ queryKey: ["/api/resilience/circuit-breaker/status"] });
      toast({ title: "Circuit Reset", description: `${service} circuit breaker reset to CLOSED.` });
    },
    onError: (error: Error, service) => {
      toast({
        title: "Reset Failed",
        description: error.message || `Could not reset ${service}.`,
        variant: "destructive",
      });
    },
    onSettled: () => setResettingService(null),
  });

  const getCircuitIcon = (state: string) => {
    if (state === "closed") return <CheckCircle className="w-3.5 h-3.5 text-green-500" />;
    if (state === "open") return <XCircle className="w-3.5 h-3.5 text-red-500" />;
    return <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />;
  };

  const getCircuitBadge = (state: string) => {
    if (state === "closed") {
      return (
        <Badge className="bg-green-500/15 text-green-400 border-green-500/30 text-[10px] px-1.5">
          CLOSED
        </Badge>
      );
    }
    if (state === "open") {
      return (
        <Badge className="bg-red-500/15 text-red-400 border-red-500/30 text-[10px] px-1.5">
          OPEN
        </Badge>
      );
    }
    return (
      <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-[10px] px-1.5">
        HALF-OPEN
      </Badge>
    );
  };

  const circuitEntries = Object.entries(circuits?.circuits ?? {});
  const openCount = circuitEntries.filter(([, c]) => c.state === "open").length;
  const halfOpenCount = circuitEntries.filter(([, c]) => c.state === "half_open").length;
  const allHealthy = openCount === 0 && halfOpenCount === 0;

  return (
    <div className="bg-card border border-border rounded-lg p-5 space-y-4" data-testid="panel-trinity-brain-status">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`p-2 rounded-lg ${
              allHealthy
                ? "bg-green-500/10"
                : openCount > 0
                ? "bg-red-500/10"
                : "bg-amber-500/10"
            }`}
          >
            <Activity
              className={`w-5 h-5 ${
                allHealthy
                  ? "text-green-500"
                  : openCount > 0
                  ? "text-red-500"
                  : "text-amber-500"
              }`}
            />
          </div>
          <div>
            <p className="font-semibold text-foreground text-sm">Trinity Brain</p>
            <p className="text-xs text-muted-foreground">
              {circuitsLoading
                ? "Loading…"
                : allHealthy
                ? "All systems nominal"
                : `${openCount} open · ${halfOpenCount} testing`}
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          onClick={() => refetchCircuits()}
          data-testid="button-refresh-circuits"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </div>

      {!circuitsLoading && circuitEntries.length > 0 && (
        <div className="space-y-1.5">
          {circuitEntries.map(([service, circuit]) => (
            <div
              key={service}
              className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                {getCircuitIcon(circuit.state)}
                <span className="text-xs text-foreground capitalize truncate">
                  {service.replace(/_/g, " ")}
                </span>
                {circuit.failures > 0 && (
                  <span className="text-[10px] text-muted-foreground">
                    {circuit.failures} fail{circuit.failures !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {getCircuitBadge(circuit.state)}
                {canReset && circuit.state !== "closed" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[10px] px-2"
                    disabled={resettingService === service}
                    onClick={() => resetMutation.mutate(service)}
                    data-testid={`button-reset-${service}`}
                  >
                    {resettingService === service ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <>
                        <RotateCcw className="w-3 h-3 mr-1" />
                        Reset
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {circuitsLoading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-7 bg-muted/40 rounded animate-pulse" />
          ))}
        </div>
      )}

      {circuits?.timestamp && (
        <p className="text-[10px] text-muted-foreground text-right">
          Updated {new Date(circuits.timestamp).toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}
