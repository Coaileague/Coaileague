import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Clock, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface MaintenanceStatus {
  success: boolean;
  isUnderMaintenance: boolean;
  message: string;
  estimatedEndTime: string | null;
  progressPercent: number;
}

export function MaintenanceBanner({ className }: { className?: string }) {
  const { data: status } = useQuery<MaintenanceStatus>({
    queryKey: ["/api/maintenance/status"],
    refetchInterval: 30000,
    staleTime: 10000,
  });

  if (!status?.isUnderMaintenance) {
    return null;
  }

  const estimatedEnd = status.estimatedEndTime 
    ? new Date(status.estimatedEndTime).toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit' 
      })
    : null;

  return (
    <div 
      className={cn(
        "w-full bg-amber-500 dark:bg-amber-600 text-black px-4 py-2",
        "flex items-center justify-center gap-3 text-sm font-medium",
        className
      )}
      data-testid="banner-maintenance"
    >
      <AlertTriangle className="h-4 w-4 flex-shrink-0" />
      <span className="text-center">
        {status.message}
        {estimatedEnd && (
          <span className="ml-2 inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Est. completion: {estimatedEnd}
          </span>
        )}
      </span>
      {status.progressPercent > 0 && status.progressPercent < 100 && (
        <span className="inline-flex items-center gap-1 ml-2">
          <RefreshCw className="h-3 w-3 animate-spin" />
          {status.progressPercent}%
        </span>
      )}
    </div>
  );
}

export function MaintenanceModal({ 
  isOpen, 
  onClose 
}: { 
  isOpen: boolean; 
  onClose: () => void;
}) {
  const { data: status } = useQuery<MaintenanceStatus>({
    queryKey: ["/api/maintenance/status"],
    refetchInterval: 15000,
    enabled: isOpen,
  });

  if (!isOpen || !status?.isUnderMaintenance) {
    return null;
  }

  const estimatedEnd = status.estimatedEndTime 
    ? new Date(status.estimatedEndTime)
    : null;

  return (
    <div 
      className="fixed inset-0 z-[6500] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      data-testid="modal-maintenance"
      role="dialog"
      aria-modal="true"
      aria-labelledby="maintenance-title"
      aria-describedby="maintenance-description"
    >
      <div className="bg-card border rounded-lg shadow-sm max-w-md w-full p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 text-amber-500">
            <AlertTriangle className="h-6 w-6 sm:h-8 sm:w-8 flex-shrink-0" />
            <h2 id="maintenance-title" className="text-lg sm:text-xl font-bold text-foreground">
              Scheduled Maintenance
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-muted transition-colors"
            aria-label="Close"
            data-testid="button-maintenance-modal-close"
          >
            <svg className="h-5 w-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <p id="maintenance-description" className="text-sm sm:text-base text-muted-foreground">
          {status.message}
        </p>

        {estimatedEnd && (
          <div className="bg-muted rounded-md p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="text-foreground">
                Expected completion: {estimatedEnd.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: true
                })}
              </span>
            </div>
            
            {status.progressPercent > 0 && (
              <div className="space-y-1">
                <div className="flex justify-between gap-1 text-xs text-muted-foreground">
                  <span>Progress</span>
                  <span>{status.progressPercent}%</span>
                </div>
                <div className="h-2 bg-muted-foreground/20 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary transition-all duration-500"
                    style={{ width: `${status.progressPercent}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        <p className="text-xs sm:text-sm text-muted-foreground">
          Please try again later. We apologize for the inconvenience.
        </p>

        <button
          onClick={onClose}
          className="w-full mt-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover-elevate text-sm sm:text-base"
          data-testid="button-maintenance-close"
        >
          OK, I'll Try Later
        </button>
      </div>
    </div>
  );
}
