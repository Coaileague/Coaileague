/**
 * MobileQuickActionsFAB - Floating Action Button for quick mobile actions
 * 
 * Features:
 * - Expandable FAB with common quick actions
 * - Clock In/Out toggle
 * - Request Time Off
 * - View Schedule
 * - Touch-optimized with haptic feedback
 * - Keyboard-aware hiding
 * - Positioned above bottom nav
 */

import { Plus, X, Clock, CalendarDays, CalendarPlus, type LucideIcon } from "lucide-react";
import { useLocation } from "wouter";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface QuickActionItemProps {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  color?: string;
  isLoading?: boolean;
  testId?: string;
}

function QuickActionItem({ icon: Icon, label, onClick, color = "bg-cyan-600", isLoading, testId }: QuickActionItemProps) {
  const handleClick = () => {
    if ('vibrate' in navigator) {
      navigator.vibrate(10);
    }
    onClick();
  };

  return (
    <button
      onClick={handleClick}
      disabled={isLoading}
      className={cn(
        "flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg transition-all duration-200",
        "active:scale-95 min-h-[48px]",
        color,
        isLoading && "opacity-50 cursor-not-allowed"
      )}
      style={{ WebkitTapHighlightColor: 'transparent' }}
      data-testid={testId || `fab-action-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <Icon className="w-5 h-5 text-white" />
      <span className="text-sm font-medium text-white whitespace-nowrap">{label}</span>
    </button>
  );
}

export function MobileQuickActionsFAB() {
  const [, setLocation] = useLocation();
  const [location] = useLocation();
  const isMobile = useIsMobile();
  const [isExpanded, setIsExpanded] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const { toast } = useToast();

  const { data: clockStatus, isLoading: isClockStatusLoading } = useQuery<{ isClockedIn: boolean }>({
    queryKey: ['/api/time-tracking/clock-status'],
    queryFn: async () => {
      const response = await fetch('/api/time-tracking/clock-status', {
        credentials: 'include',
      });
      if (!response.ok) {
        return { isClockedIn: false };
      }
      return response.json();
    },
    enabled: isMobile,
    refetchInterval: 30000,
    staleTime: 10000,
  });

  const clockMutation = useMutation({
    mutationFn: async (action: 'in' | 'out') => {
      return apiRequest(`/api/time-tracking/clock-${action}`, {
        method: 'POST',
      });
    },
    onSuccess: (_, action) => {
      queryClient.invalidateQueries({ queryKey: ['/api/time-tracking/clock-status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/time-tracking'] });
      toast({
        title: action === 'in' ? "Clocked In" : "Clocked Out",
        description: action === 'in' 
          ? "You're now on the clock. Have a great shift!" 
          : "You've clocked out. See you next time!",
      });
      setIsExpanded(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update clock status. Please try again.",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (typeof window !== 'undefined' && 'visualViewport' in window && window.visualViewport) {
      const vv = window.visualViewport;
      
      const handleViewportChange = () => {
        const heightDiff = window.innerHeight - vv.height;
        setKeyboardVisible(heightDiff > 150);
      };
      
      vv.addEventListener('resize', handleViewportChange);
      return () => vv.removeEventListener('resize', handleViewportChange);
    }
  }, []);

  useEffect(() => {
    setIsExpanded(false);
  }, [location]);

  if (!isMobile || keyboardVisible) {
    return null;
  }

  const hiddenPaths = ['/chat', '/helpdesk', '/inbox', '/time-tracking'];
  if (hiddenPaths.some(path => location.startsWith(path))) {
    return null;
  }

  const isClockedIn = clockStatus?.isClockedIn ?? false;

  const handleClockToggle = () => {
    clockMutation.mutate(isClockedIn ? 'out' : 'in');
  };

  const handleRequestTimeOff = () => {
    setIsExpanded(false);
    setLocation('/hr/pto');
  };

  const handleViewSchedule = () => {
    setIsExpanded(false);
    setLocation('/schedule');
  };

  const toggleExpand = () => {
    if ('vibrate' in navigator) {
      navigator.vibrate(10);
    }
    setIsExpanded(!isExpanded);
  };

  return (
    <div 
      className="fixed z-40 right-4"
      style={{
        bottom: 'calc(80px + env(safe-area-inset-bottom, 0px))'
      }}
      data-testid="mobile-quick-actions-fab"
    >
      {isExpanded && (
        <>
          <div 
            className="fixed inset-0 bg-black/40 z-30"
            onClick={() => setIsExpanded(false)}
            data-testid="fab-backdrop"
          />
          
          <div className="absolute bottom-16 right-0 flex flex-col gap-2 z-40 animate-in fade-in slide-in-from-bottom-4 duration-200">
            <QuickActionItem
              icon={Clock}
              label={isClockStatusLoading ? "Loading..." : (isClockedIn ? "Clock Out" : "Clock In")}
              onClick={handleClockToggle}
              color={isClockedIn ? "bg-orange-600" : "bg-green-600"}
              isLoading={clockMutation.isPending || isClockStatusLoading}
              testId="fab-action-clock-toggle"
            />
            <QuickActionItem
              icon={CalendarPlus}
              label="Request Time Off"
              onClick={handleRequestTimeOff}
              color="bg-purple-600"
            />
            <QuickActionItem
              icon={CalendarDays}
              label="View Schedule"
              onClick={handleViewSchedule}
              color="bg-blue-600"
            />
          </div>
        </>
      )}
      
      <button
        onClick={toggleExpand}
        className={cn(
          "w-14 h-14 rounded-full shadow-xl flex items-center justify-center",
          "transition-all duration-200 active:scale-95",
          isExpanded 
            ? "bg-slate-700 rotate-45" 
            : "bg-gradient-to-br from-cyan-500 to-cyan-600"
        )}
        style={{ WebkitTapHighlightColor: 'transparent' }}
        data-testid="fab-toggle"
        aria-label={isExpanded ? "Close quick actions" : "Open quick actions"}
        aria-expanded={isExpanded}
      >
        {isExpanded ? (
          <X className="w-6 h-6 text-white" />
        ) : (
          <Plus className="w-6 h-6 text-white" />
        )}
      </button>
    </div>
  );
}
