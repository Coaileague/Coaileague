import { useEffect, useState } from "react";
import { useGlobalLoading } from "@/contexts/loading-context";
import { getRandomLoadingMessage } from "@/config/loading-messages";

export function GlobalLoadingToast() {
  const { isLoading, progress, pendingRequests } = useGlobalLoading();
  const [loadingMessage, setLoadingMessage] = useState(() => getRandomLoadingMessage());

  // Change loading message every 600ms
  useEffect(() => {
    if (!isLoading) return;
    
    const messageInterval = setInterval(() => {
      setLoadingMessage(getRandomLoadingMessage());
    }, 600);
    
    return () => clearInterval(messageInterval);
  }, [isLoading]);

  if (!isLoading) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 sm:bottom-6 sm:right-6 sm:left-auto sm:w-full sm:max-w-sm z-50 p-4 sm:p-0">
      <div
        className="animate-in fade-in slide-in-from-bottom-5 sm:slide-in-from-right-5 duration-500"
        style={{
          animation: "slideUp 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
        }}
      >
        <style>{`
          @keyframes slideUp {
            from {
              opacity: 0;
              transform: translateY(20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `}</style>

        <div className="bg-gradient-to-br from-blue-600 via-blue-500 to-cyan-500 dark:from-blue-700 dark:via-blue-600 dark:to-cyan-600 rounded-lg sm:rounded-xl p-5 sm:p-6 shadow-2xl text-white">
          {/* Loading requests count */}
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">Loading data...</h3>
            <span className="text-xs text-white/70">{pendingRequests.length} request{pendingRequests.length !== 1 ? 's' : ''}</span>
          </div>

          {/* Loading message */}
          <p className="text-white/80 text-xs sm:text-sm font-medium h-5 sm:h-6 flex items-center mb-3">
            {loadingMessage}
          </p>

          {/* Progress section */}
          <div className="space-y-2">
            {/* Progress bar */}
            <div className="w-full h-2 sm:h-2.5 bg-white/20 rounded-full overflow-hidden backdrop-blur-sm">
              <div
                className="h-full bg-white/95 rounded-full transition-all duration-100 ease-out"
                style={{
                  width: `${progress}%`,
                  boxShadow: "0 0 15px rgba(255, 255, 255, 0.6)"
                }}
              />
            </div>

            {/* Large, bold percentage text */}
            <div className="flex items-center justify-between">
              <span className="text-white/70 text-xs">
                {pendingRequests[0]?.endpoint ? `${pendingRequests[0].endpoint}...` : "Loading..."}
              </span>
              <span className="text-white font-bold text-base sm:text-lg tabular-nums">
                {progress}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
