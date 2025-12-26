/**
 * Trinity Reasoning Panel
 * 
 * Displays Trinity AI's step-by-step reasoning process in human-friendly language.
 * Shows phases, thoughts, and actions as they occur - similar to Replit Agent's chat.
 */

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { 
  Brain, 
  Sparkles, 
  Zap, 
  CheckCircle, 
  Clock, 
  ChevronRight,
  Loader2,
  Eye,
  MessageSquare,
  Lightbulb,
  Search,
  Wrench,
  Shield,
  AlertCircle
} from "lucide-react";

export interface ReasoningStep {
  id: string;
  type: 'thinking' | 'searching' | 'analyzing' | 'executing' | 'validating' | 'complete' | 'error';
  phase: string;
  message: string;
  detail?: string;
  timestamp: Date;
  duration?: number;
  isActive?: boolean;
}

export interface ReasoningSession {
  id: string;
  taskDescription: string;
  startTime: Date;
  endTime?: Date;
  steps: ReasoningStep[];
  status: 'active' | 'complete' | 'error';
  fastMode: boolean;
  summary?: string;
}

interface TrinityReasoningPanelProps {
  session: ReasoningSession | null;
  isActive?: boolean;
  fastMode: boolean;
  onFastModeChange: (enabled: boolean) => void;
  onClose?: () => void;
}

const STEP_ICONS: Record<ReasoningStep['type'], any> = {
  thinking: Lightbulb,
  searching: Search,
  analyzing: Eye,
  executing: Wrench,
  validating: Shield,
  complete: CheckCircle,
  error: AlertCircle,
};

const STEP_COLORS: Record<ReasoningStep['type'], string> = {
  thinking: 'text-amber-500',
  searching: 'text-blue-500',
  analyzing: 'text-violet-500',
  executing: 'text-cyan-500',
  validating: 'text-emerald-500',
  complete: 'text-green-500',
  error: 'text-red-500',
};

const STEP_BG_COLORS: Record<ReasoningStep['type'], string> = {
  thinking: 'bg-amber-500/10 border-amber-500/20',
  searching: 'bg-blue-500/10 border-blue-500/20',
  analyzing: 'bg-violet-500/10 border-violet-500/20',
  executing: 'bg-cyan-500/10 border-cyan-500/20',
  validating: 'bg-emerald-500/10 border-emerald-500/20',
  complete: 'bg-green-500/10 border-green-500/20',
  error: 'bg-red-500/10 border-red-500/20',
};

export function TrinityReasoningPanel({ 
  session, 
  isActive = false, 
  fastMode, 
  onFastModeChange,
  onClose 
}: TrinityReasoningPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (scrollRef.current && session?.steps.length) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [session?.steps.length]);

  const toggleStep = (stepId: string) => {
    const newExpanded = new Set(expandedSteps);
    if (newExpanded.has(stepId)) {
      newExpanded.delete(stepId);
    } else {
      newExpanded.add(stepId);
    }
    setExpandedSteps(newExpanded);
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return '';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const progress = session ? (session.steps.filter(s => s.type === 'complete' || !s.isActive).length / Math.max(session.steps.length, 1)) * 100 : 0;

  return (
    <Card className="border-2 border-primary/20 bg-gradient-to-br from-background to-muted/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <Brain className="w-4 h-4 text-white" />
            </div>
            <div>
              <span className="font-semibold">Trinity</span>
              <span className="text-muted-foreground font-normal ml-1">Intelligence</span>
            </div>
          </CardTitle>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Zap className={`w-4 h-4 ${fastMode ? 'text-amber-500' : 'text-muted-foreground'}`} />
              <span className="text-xs font-medium">Fast Mode</span>
              <Switch
                checked={fastMode}
                onCheckedChange={onFastModeChange}
                className="scale-75"
                data-testid="switch-fast-mode"
              />
            </div>
            {isActive && (
              <Badge className="bg-violet-500/20 text-violet-400 border-violet-500/30 animate-pulse">
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                Working
              </Badge>
            )}
          </div>
        </div>
        {session && (
          <div className="mt-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>{session.taskDescription}</span>
              <span>{session.steps.length} steps</span>
            </div>
            <Progress value={progress} className="h-1" />
          </div>
        )}
      </CardHeader>
      
      <CardContent className="pt-0">
        {!session ? (
          <div className="text-center py-8 text-muted-foreground">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Ask Trinity a question or give a command to see her reasoning process here.</p>
          </div>
        ) : (
          <ScrollArea className="h-[300px] pr-3" ref={scrollRef}>
            <div className="space-y-2">
              {session.steps.map((step, index) => {
                const Icon = STEP_ICONS[step.type];
                const colorClass = STEP_COLORS[step.type];
                const bgClass = STEP_BG_COLORS[step.type];
                const isExpanded = expandedSteps.has(step.id);
                const isLatest = index === session.steps.length - 1;

                return (
                  <div
                    key={step.id}
                    className={`
                      relative p-3 rounded-lg border transition-all cursor-pointer
                      ${bgClass}
                      ${isLatest && step.isActive ? 'ring-2 ring-primary/30' : ''}
                    `}
                    onClick={() => step.detail && toggleStep(step.id)}
                    data-testid={`step-${step.id}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`flex-shrink-0 mt-0.5 ${colorClass}`}>
                        {step.isActive && step.type !== 'complete' ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Icon className="w-4 h-4" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {step.phase}
                          </Badge>
                          {step.duration && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatDuration(step.duration)}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-foreground leading-relaxed">
                          {step.message}
                        </p>
                        {step.detail && (
                          <div className={`
                            mt-2 text-xs text-muted-foreground overflow-hidden transition-all
                            ${isExpanded ? 'max-h-40' : 'max-h-0'}
                          `}>
                            <div className="pt-2 border-t border-border/50">
                              {step.detail}
                            </div>
                          </div>
                        )}
                        {step.detail && (
                          <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
                            <ChevronRight className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                            <span>{isExpanded ? 'Hide details' : 'Show details'}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {index < session.steps.length - 1 && (
                      <div className="absolute left-[1.625rem] bottom-0 w-0.5 h-2 bg-border translate-y-full" />
                    )}
                  </div>
                );
              })}

              {session.status === 'complete' && session.summary && (
                <div className="mt-4 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                  <div className="flex items-start gap-3">
                    <Sparkles className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-sm text-green-600 dark:text-green-400 mb-1">
                        Task Complete
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        {session.summary}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

export function createReasoningStep(
  type: ReasoningStep['type'],
  phase: string,
  message: string,
  detail?: string,
  isActive = true
): ReasoningStep {
  return {
    id: `step-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type,
    phase,
    message,
    detail,
    timestamp: new Date(),
    isActive,
  };
}

export function createReasoningSession(
  taskDescription: string,
  fastMode = false
): ReasoningSession {
  return {
    id: `session-${Date.now()}`,
    taskDescription,
    startTime: new Date(),
    steps: [],
    status: 'active',
    fastMode,
  };
}
