import { useState, useEffect, useRef } from 'react';
import { TrinityAnimatedLogo } from "@/components/ui/trinity-animated-logo";
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TrinityLogo } from '@/components/ui/coaileague-logo-mark';
import { ChevronDown, ChevronUp, Loader2, X, CheckCircle, AlertTriangle, ClipboardCheck, Activity, Lightbulb, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TrinitySchedulingSession, TrinityThought } from '@/hooks/use-trinity-scheduling-progress';

interface TrinityStatusBarProps {
  session: TrinitySchedulingSession;
  onAbort?: () => void;
  onReview?: () => void;
  onDismiss?: () => void;
}

export function TrinityStatusBar({ session, onAbort, onReview, onDismiss }: TrinityStatusBarProps) {
  // Show while working OR for a short period after completion (gives review/dismiss options)
  const hasActivity = session.isWorking || session.thoughts.length > 0;
  if (!hasActivity) return null;

  const progressPercent = session.totalShifts > 0
    ? Math.round((session.currentIndex / session.totalShifts) * 100)
    : 0;

  const latestThought = [...session.thoughts].reverse().find(t => t.type === 'deliberating' || t.type === 'analyzing' || t.type === 'assigned' || t.type === 'skipped');
  const assignedCount = session.thoughts.filter(t => t.type === 'assigned').length;
  const skippedCount = session.thoughts.filter(t => t.type === 'skipped').length;

  if (!session.isWorking && session.thoughts.length > 0) {
    // Completed state — show summary with review/dismiss actions
    return (
      <div
        className="bg-green-600 dark:bg-green-700 text-white border-b border-green-500/60 px-3 py-1.5 shrink-0"
        data-testid="trinity-status-bar-complete"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <CheckCircle className="h-4 w-4 shrink-0" />
            <span className="text-[11px] sm:text-xs font-semibold">
              Trinity complete — {assignedCount} filled{skippedCount > 0 ? `, ${skippedCount} skipped` : ''}
            </span>
            <span className="text-[10px] opacity-75 hidden sm:inline">
              Review before publishing
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {onReview && (
              <Button
                size="sm"
                variant="secondary"
                className="h-6 text-xs px-2"
                onClick={onReview}
                data-testid="btn-review-trinity"
              >
                <ClipboardCheck className="h-3 w-3 mr-1" />
                Review
              </Button>
            )}
            {onDismiss && (
              <Button
                size="icon"
                variant="ghost"
                className="text-white h-6 w-6 hover:bg-white/20"
                onClick={onDismiss}
                data-testid="btn-dismiss-trinity"
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="bg-primary text-primary-foreground border-b border-primary/60 px-3 py-1.5 shrink-0"
      data-testid="trinity-status-bar"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="animate-pulse shrink-0">
            <TrinityAnimatedLogo size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] sm:text-xs font-semibold whitespace-nowrap">
                {(() => {
                  if (!latestThought) return 'Trinity is starting...';
                  if (latestThought.type === 'assigned') return 'Assigning';
                  if (latestThought.type === 'skipped') return 'Evaluating';
                  if (latestThought.type === 'analyzing') return 'Processing';
                  if (latestThought.deliberationType === 'analysis') return 'Analyzing';
                  if (latestThought.deliberationType === 'decision') return 'Deciding';
                  if (latestThought.deliberationType === 'action') return 'Executing';
                  if (latestThought.deliberationType === 'review') return 'Reviewing';
                  return 'Thinking';
                })()}
              </span>
              <span className="text-[10px] sm:text-xs opacity-80 font-mono">
                {session.currentIndex}/{session.totalShifts}
              </span>
              <div className="w-12 sm:w-20 h-1 bg-primary-foreground/20 rounded-full overflow-hidden shrink-0">
                <div
                  className="h-full bg-primary-foreground/70 transition-all duration-300 ease-out"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
            {latestThought && (
              <div className="text-[10px] opacity-70 truncate mt-0.5 italic">
                {latestThought.message}
              </div>
            )}
          </div>
        </div>

        {onAbort && (
          <Button
            variant="ghost"
            size="icon"
            className="text-primary-foreground h-7 w-7"
            onClick={onAbort}
            data-testid="btn-abort-trinity"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

interface TrinityThinkingPanelProps {
  thoughts: TrinityThought[];
  isWorking: boolean;
  onClear?: () => void;
  onReviewRequested?: () => void;
}

function DeliberationIcon({ deliberationType, className }: { deliberationType?: string; className?: string }) {
  switch (deliberationType) {
    case 'analysis':
      return <Search className={cn("h-3 w-3 text-blue-500 dark:text-cyan-400", className)} />;
    case 'decision':
      return <Lightbulb className={cn("h-3 w-3 text-amber-500 dark:text-amber-400", className)} />;
    case 'action':
      return <Activity className={cn("h-3 w-3 text-blue-600 dark:text-blue-400", className)} />;
    case 'review':
      return <Activity className={cn("h-3 w-3 text-violet-500 dark:text-purple-400", className)} />;
    default:
      return <Activity className={cn("h-3 w-3 text-muted-foreground", className)} />;
  }
}

function ThoughtLine({ thought, isLatest }: { thought: TrinityThought; isLatest: boolean }) {
  const isDeliberation = thought.type === 'deliberating';
  
  return (
    <div 
      className={cn(
        "flex items-start gap-1.5 py-0.5",
        isDeliberation ? "pl-4 opacity-70" : "",
        isLatest && "opacity-100"
      )}
    >
      <span className="text-muted-foreground font-mono shrink-0 text-[9px] leading-[18px] whitespace-nowrap">
        {thought.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </span>
      <span className="shrink-0 mt-[2px]">
        {thought.type === 'assigned' && <CheckCircle className="h-3 w-3 text-green-600 dark:text-green-400" />}
        {thought.type === 'analyzing' && <Loader2 className={cn("h-3 w-3 text-blue-500 dark:text-blue-400", isLatest && "animate-spin")} />}
        {thought.type === 'skipped' && <X className="h-3 w-3 text-amber-500 dark:text-yellow-400" />}
        {thought.type === 'error' && <X className="h-3 w-3 text-destructive" />}
        {thought.type === 'deliberating' && <DeliberationIcon deliberationType={thought.deliberationType} />}
      </span>
      <span className={cn(
        "text-[11px] leading-[18px] break-words min-w-0",
        isDeliberation ? "text-muted-foreground italic" : "text-foreground",
        thought.type === 'assigned' && "text-green-700 dark:text-green-300",
        thought.type === 'skipped' && "text-amber-600 dark:text-yellow-300",
        thought.type === 'error' && "text-destructive",
      )}>
        {thought.message}
      </span>
    </div>
  );
}

export function TrinityThinkingPanel({ thoughts, isWorking, onClear, onReviewRequested }: TrinityThinkingPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showReviewPrompt, setShowReviewPrompt] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollEndRef = useRef<HTMLDivElement | null>(null);
  
  useEffect(() => {
    if (!isWorking && thoughts.length > 0) {
      setShowReviewPrompt(true);
      if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = setTimeout(() => {
        setIsClosing(true);
        setTimeout(() => {
          onClear?.();
          setIsClosing(false);
        }, 400);
      }, 15000);
    }
    return () => {
      if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
    };
  }, [isWorking, thoughts.length]);

  useEffect(() => {
    if (scrollEndRef.current && isExpanded) {
      scrollEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [thoughts.length, isExpanded]);
  
  if (thoughts.length === 0 || isClosing) return null;
  
  const assignedCount = thoughts.filter(t => t.type === 'assigned').length;
  const skippedCount = thoughts.filter(t => t.type === 'skipped').length;
  const deliberationCount = thoughts.filter(t => t.type === 'deliberating').length;
  
  return (
    <div 
      className={cn(
        "sticky top-0 left-0 right-0 bg-card border border-border rounded-md shadow-sm z-50 transition-all duration-300 flex flex-col mx-2 mt-2",
        isExpanded ? "max-h-[50dvh]" : "max-h-10"
      )}
      data-testid="trinity-thinking-panel"
    >
      <button 
        className="w-full h-10 px-3 flex items-center justify-between gap-2 text-xs hover-elevate transition-colors border-b border-border/50 shrink-0 rounded-t-md"
        onClick={() => setIsExpanded(!isExpanded)}
        data-testid="btn-toggle-thinking"
      >
        <span className="flex items-center gap-1.5 min-w-0">
          <TrinityAnimatedLogo size={14} />
          {isWorking ? (
            <Badge variant="secondary" className="h-[18px] px-1.5 text-[9px] no-default-hover-elevate no-default-active-elevate">
              <Loader2 className="h-2.5 w-2.5 mr-0.5 animate-spin" />
              {(() => {
                const latest = [...thoughts].reverse().find(t => t.type === 'deliberating' || t.type === 'analyzing' || t.type === 'assigned' || t.type === 'skipped');
                if (!latest) return 'Starting...';
                if (latest.type === 'assigned') return 'Assigning';
                if (latest.type === 'skipped') return 'Evaluating';
                if (latest.type === 'analyzing') return 'Processing';
                if (latest.deliberationType === 'analysis') return 'Analyzing';
                if (latest.deliberationType === 'decision') return 'Deciding';
                if (latest.deliberationType === 'action') return 'Executing';
                if (latest.deliberationType === 'review') return 'Evaluating';
                return 'Thinking';
              })()}
            </Badge>
          ) : (
            <Badge variant="secondary" className="h-[18px] px-1.5 text-[9px] bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 border-green-300 dark:border-green-700 no-default-hover-elevate no-default-active-elevate">
              <CheckCircle className="h-2.5 w-2.5 mr-0.5" />
              Done
            </Badge>
          )}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[9px] text-muted-foreground">{thoughts.length} steps</span>
          {deliberationCount > 0 && (
            <span className="text-[9px] text-violet-600 dark:text-purple-400">{deliberationCount} thoughts</span>
          )}
          {isExpanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronUp className="h-3 w-3 text-muted-foreground" />
          )}
        </div>
      </button>
      
      {isExpanded && !isWorking && (
        <div className="px-3 py-2 bg-muted/50 border-b border-border/50 shrink-0">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-[11px] font-medium text-foreground">Auto-Schedule Complete</span>
          </div>
          <div className="flex gap-3 text-[10px] flex-wrap">
            <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
              <CheckCircle className="h-2.5 w-2.5 shrink-0" />
              {assignedCount} filled
            </span>
            {skippedCount > 0 && (
              <span className="text-amber-600 dark:text-yellow-400 flex items-center gap-1">
                <X className="h-2.5 w-2.5 shrink-0" />
                {skippedCount} skipped
              </span>
            )}
          </div>
          
          <div className="mt-2 p-1.5 bg-amber-50 dark:bg-amber-900/30 rounded-md border border-amber-200 dark:border-amber-700/50 flex items-start gap-1.5">
            <AlertTriangle className="h-3 w-3 text-amber-500 dark:text-amber-400 mt-0.5 shrink-0" />
            <p className="text-[10px] text-amber-800 dark:text-amber-200/90 leading-relaxed">
              AI can make mistakes. Review all changes before publishing — 1% human verification required.
            </p>
          </div>

          {showReviewPrompt && (
            <div className="mt-1.5 flex gap-2">
              <Button 
                size="sm" 
                variant="default"
                className="flex-1 gap-1 h-7 text-xs"
                onClick={() => {
                  setShowReviewPrompt(false);
                  onReviewRequested?.();
                }}
                data-testid="btn-review-schedule"
              >
                <ClipboardCheck className="h-3 w-3" />
                Review
              </Button>
              <Button 
                size="sm" 
                variant="outline"
                className="h-7 text-xs"
                onClick={() => {
                  setShowReviewPrompt(false);
                  onClear?.();
                }}
                data-testid="btn-dismiss-thinking"
              >
                Dismiss
              </Button>
            </div>
          )}
        </div>
      )}
      
      {isExpanded && (
        <div className="flex-1 min-h-0 max-h-[260px] overflow-y-auto overscroll-contain px-2 py-1">
          <div className="space-y-0">
            {thoughts.slice(-80).map((thought, i) => (
              <ThoughtLine 
                key={`${thought.timestamp.getTime()}-${i}`} 
                thought={thought}
                isLatest={i === thoughts.slice(-80).length - 1 && isWorking}
              />
            ))}
            <div ref={scrollEndRef} />
          </div>
        </div>
      )}
    </div>
  );
}

interface ShiftProcessingOverlayProps {
  isProcessing: boolean;
  wasJustAssigned: boolean;
}

export function ShiftProcessingOverlay({ isProcessing, wasJustAssigned }: ShiftProcessingOverlayProps) {
  if (!isProcessing && !wasJustAssigned) return null;
  
  return (
    <>
      {isProcessing && (
        <div className="absolute inset-0 bg-violet-500/20 dark:bg-purple-500/20 rounded-md flex items-center justify-center pointer-events-none z-10">
          <div className="flex items-center gap-2 text-xs text-violet-700 dark:text-purple-300 bg-violet-100 dark:bg-purple-900/80 px-2 py-1 rounded-full">
            <Loader2 className="h-3 w-3 animate-spin" />
            Analyzing...
          </div>
        </div>
      )}
      {wasJustAssigned && (
        <div className="absolute inset-0 rounded-md pointer-events-none z-10 animate-pulse-once bg-green-500/30" />
      )}
    </>
  );
}
