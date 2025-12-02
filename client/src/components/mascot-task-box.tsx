/**
 * MascotTaskBox - Floating task box component for the CoAI mascot
 * 
 * Displays actionable tasks, insights, and tips from HelpAI.
 * Uses smart placement to avoid UI collisions.
 * Can be dismissed by user action.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { X, ChevronRight, Sparkles, Lightbulb, AlertCircle, CheckCircle2, ArrowRight } from 'lucide-react';
import { useSmartBubblePlacement, getArrowStyles } from '@/hooks/use-smart-bubble-placement';
import { useMascotInsights, useMascotTasks } from '@/hooks/use-mascot-ai';
import { useLocation } from 'wouter';

interface TaskItem {
  id: string;
  type: 'tip' | 'advice' | 'task' | 'alert' | 'celebration' | 'insight' | 'warning';
  title: string;
  message: string;
  category?: string;
  priority: 'low' | 'medium' | 'high' | 'normal';
  actionUrl?: string;
  actionLabel?: string;
}

interface MascotTaskBoxProps {
  mascotRef: React.RefObject<HTMLDivElement | null>;
  workspaceId?: string;
  onTaskClick?: (task: TaskItem) => void;
  maxTasks?: number;
}

const TASK_ICONS: Record<string, typeof Sparkles> = {
  tip: Lightbulb,
  advice: Sparkles,
  task: CheckCircle2,
  alert: AlertCircle,
  celebration: Sparkles,
  insight: Sparkles,
  warning: AlertCircle,
};

const PRIORITY_COLORS: Record<string, string> = {
  low: 'border-slate-500',
  normal: 'border-slate-400',
  medium: 'border-amber-500',
  high: 'border-emerald-500',
};

const TASK_BOX_CONFIG = {
  showDelay: 8000,
  minDisplayTime: 5000,
  maxDisplayTime: 15000,
  cooldownTime: 30000,
  taskRotateInterval: 10000,
  boxWidth: 280,
  boxHeight: 140,
};

export function MascotTaskBox({ 
  mascotRef, 
  workspaceId, 
  onTaskClick,
  maxTasks = 1 
}: MascotTaskBoxProps) {
  const [, setLocation] = useLocation();
  const [isVisible, setIsVisible] = useState(false);
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [dismissedTasks, setDismissedTasks] = useState<Set<string>>(new Set());
  
  const showTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const cooldownTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const taskRotateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isCoolingDownRef = useRef<boolean>(false);
  const isScheduledRef = useRef<boolean>(false);
  const mountedRef = useRef<boolean>(true);
  
  const { data: insightsData } = useMascotInsights(workspaceId);
  const { data: tasksData } = useMascotTasks(workspaceId);
  
  const allTasks: TaskItem[] = [
    ...(insightsData?.insights || []).map(insight => ({
      ...insight,
      type: insight.type as TaskItem['type'],
      priority: insight.priority as TaskItem['priority'],
    })),
    ...(tasksData?.tasks || []).map(task => ({
      id: task.id,
      type: 'task' as const,
      title: task.title,
      message: task.description,
      category: task.category,
      priority: task.priority > 3 ? 'high' : task.priority > 1 ? 'medium' : 'low' as TaskItem['priority'],
      actionUrl: task.actionUrl,
      actionLabel: 'Go',
      completed: task.completed,
    })).filter(t => !t.completed),
  ].filter(task => !dismissedTasks.has(task.id));
  
  const sortedTasks = [...allTasks].sort((a, b) => {
    const priorityOrder: Record<string, number> = { high: 0, medium: 1, normal: 2, low: 3 };
    return (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2);
  });
  
  const currentTask = sortedTasks[currentTaskIndex % Math.max(sortedTasks.length, 1)] || null;
  
  const bubblePlacement = useSmartBubblePlacement(
    mascotRef, 
    isVisible,
    { width: TASK_BOX_CONFIG.boxWidth, height: TASK_BOX_CONFIG.boxHeight }
  );
  const arrowStyles = getArrowStyles(bubblePlacement.direction);
  
  const clearAllTimers = useCallback(() => {
    if (showTimeoutRef.current) {
      clearTimeout(showTimeoutRef.current);
      showTimeoutRef.current = null;
    }
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    if (cooldownTimeoutRef.current) {
      clearTimeout(cooldownTimeoutRef.current);
      cooldownTimeoutRef.current = null;
    }
    if (taskRotateIntervalRef.current) {
      clearInterval(taskRotateIntervalRef.current);
      taskRotateIntervalRef.current = null;
    }
    isScheduledRef.current = false;
  }, []);
  
  const hideTaskBox = useCallback(() => {
    if (!mountedRef.current) return;
    
    setIsVisible(false);
    
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    if (taskRotateIntervalRef.current) {
      clearInterval(taskRotateIntervalRef.current);
      taskRotateIntervalRef.current = null;
    }
  }, []);
  
  const showTaskBox = useCallback(() => {
    if (!mountedRef.current || isCoolingDownRef.current || sortedTasks.length === 0) return;
    
    setIsVisible(true);
    isCoolingDownRef.current = true;
    isScheduledRef.current = false;
    
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    hideTimeoutRef.current = setTimeout(() => {
      if (mountedRef.current) {
        hideTaskBox();
      }
    }, TASK_BOX_CONFIG.maxDisplayTime);
    
    if (cooldownTimeoutRef.current) clearTimeout(cooldownTimeoutRef.current);
    cooldownTimeoutRef.current = setTimeout(() => {
      if (mountedRef.current) {
        isCoolingDownRef.current = false;
      }
    }, TASK_BOX_CONFIG.cooldownTime);
    
    if (sortedTasks.length > 1) {
      if (taskRotateIntervalRef.current) clearInterval(taskRotateIntervalRef.current);
      taskRotateIntervalRef.current = setInterval(() => {
        if (mountedRef.current) {
          setCurrentTaskIndex(prev => (prev + 1) % sortedTasks.length);
        }
      }, TASK_BOX_CONFIG.taskRotateInterval);
    }
  }, [sortedTasks.length, hideTaskBox]);
  
  const scheduleShow = useCallback(() => {
    if (isScheduledRef.current || isCoolingDownRef.current || sortedTasks.length === 0) return;
    
    isScheduledRef.current = true;
    if (showTimeoutRef.current) clearTimeout(showTimeoutRef.current);
    showTimeoutRef.current = setTimeout(() => {
      if (mountedRef.current) {
        showTaskBox();
      }
    }, TASK_BOX_CONFIG.showDelay);
  }, [sortedTasks.length, showTaskBox]);
  
  useEffect(() => {
    if (bubblePlacement.shouldAutoDismiss && isVisible) {
      const timer = setTimeout(() => {
        if (mountedRef.current) {
          hideTaskBox();
        }
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [bubblePlacement.shouldAutoDismiss, isVisible, hideTaskBox]);
  
  const dismissTask = useCallback((taskId: string) => {
    setDismissedTasks(prev => new Set([...prev, taskId]));
    if (sortedTasks.length <= 1) {
      hideTaskBox();
    } else {
      setCurrentTaskIndex(prev => (prev + 1) % sortedTasks.length);
    }
  }, [sortedTasks.length, hideTaskBox]);
  
  const handleTaskAction = useCallback((task: TaskItem) => {
    onTaskClick?.(task);
    if (task.actionUrl) {
      setLocation(task.actionUrl);
    }
    dismissTask(task.id);
  }, [onTaskClick, setLocation, dismissTask]);
  
  useEffect(() => {
    mountedRef.current = true;
    
    return () => {
      mountedRef.current = false;
      clearAllTimers();
    };
  }, [clearAllTimers]);
  
  useEffect(() => {
    if (sortedTasks.length > 0 && !isVisible && !isCoolingDownRef.current && !isScheduledRef.current) {
      scheduleShow();
    }
  }, [sortedTasks.length, isVisible, scheduleShow]);
  
  if (!isVisible || !currentTask) return null;
  
  const TaskIcon = TASK_ICONS[currentTask.type] || Sparkles;
  const priorityBorder = PRIORITY_COLORS[currentTask.priority];
  
  return (
    <div 
      className={`absolute px-4 py-3 rounded-xl border ${priorityBorder} text-slate-100 animate-in fade-in slide-in-from-bottom-2 duration-300`}
      style={{
        ...bubblePlacement.position,
        width: `${TASK_BOX_CONFIG.boxWidth}px`,
        maxWidth: '90vw',
        opacity: bubblePlacement.opacity,
        zIndex: 10001,
        background: 'rgba(15, 23, 42, 0.12)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        borderColor: 'rgba(255, 255, 255, 0.15)',
      }}
      data-testid="mascot-task-box"
    >
      <div className="flex items-start gap-3">
        <div 
          className="flex-shrink-0 p-2 rounded-lg border"
          style={{
            background: 'rgba(100, 116, 139, 0.15)',
            borderColor: 'rgba(255, 255, 255, 0.1)'
          }}
        >
          <TaskIcon className="w-4 h-4 text-emerald-400" style={{ filter: 'drop-shadow(0 0 6px rgba(52, 211, 153, 0.6))' }} />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h4 
              className="font-semibold text-sm text-white leading-tight"
              style={{ textShadow: '0 1px 4px rgba(0,0,0,0.8), 0 0 8px rgba(0,0,0,0.4)' }}
            >
              {currentTask.title}
            </h4>
            <button
              onClick={(e) => { e.stopPropagation(); dismissTask(currentTask.id); }}
              className="flex-shrink-0 p-0.5 rounded hover:bg-slate-700/50 transition-colors"
              data-testid="button-task-dismiss"
            >
              <X className="w-3.5 h-3.5 text-slate-400 hover:text-slate-200" />
            </button>
          </div>
          
          <p 
            className="mt-1 text-xs text-white/90 leading-relaxed line-clamp-2"
            style={{ textShadow: '0 1px 3px rgba(0,0,0,0.7)' }}
          >
            {currentTask.message}
          </p>
          
          {currentTask.actionUrl && (
            <button
              onClick={(e) => { e.stopPropagation(); handleTaskAction(currentTask); }}
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 text-xs font-medium hover:bg-emerald-600/30 hover:border-emerald-500/50 transition-all group"
              data-testid="button-task-action"
            >
              {currentTask.actionLabel || 'Go'}
              <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
            </button>
          )}
        </div>
      </div>
      
      {sortedTasks.length > 1 && (
        <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
          <span>{(currentTaskIndex % sortedTasks.length) + 1} of {sortedTasks.length}</span>
          <button
            onClick={(e) => { 
              e.stopPropagation(); 
              setCurrentTaskIndex(prev => (prev + 1) % sortedTasks.length); 
            }}
            className="flex items-center gap-1 hover:text-slate-300 transition-colors"
            data-testid="button-task-next"
          >
            Next <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      )}
      
      <div 
        className={`${arrowStyles.position} w-2.5 h-2.5 ${arrowStyles.borderClasses} border-2 ${priorityBorder}`}
        style={{
          backgroundColor: 'rgb(15 23 42)',
          transform: arrowStyles.transform,
        }}
      />
    </div>
  );
}
