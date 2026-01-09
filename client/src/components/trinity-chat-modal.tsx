/**
 * TRINITY 2.0 CHAT MODAL - THE GEMINI KILLER
 * ==========================================
 * Advanced AI assistant interface with:
 * - Mobile: 3-mode bottom sheet (Peek/Split/Immersive) with swipe gestures
 * - Desktop: Draggable floating window with PiP mode
 * - Contextual Quick Actions based on current page
 * - Thinking Visualization with real-time progress
 * - Confidence Indicators (green/yellow/red)
 * - Preview Mode for changes before execution
 * - Command Palette (CMD+K) support
 */

import { useState, useRef, useEffect, useCallback, createContext, useContext, useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/useAuth';
import { isPublicRoute, TRINITY_MODES, type ConversationMode } from '@/config/trinity';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import {
  X,
  Send,
  Loader2,
  Sparkles,
  GripHorizontal,
  Minimize2,
  Trash2,
  ChevronUp,
  ChevronDown,
  Calendar,
  FileText,
  Users,
  DollarSign,
  Clock,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Briefcase,
  Heart,
  Zap,
  Brain,
  Eye,
  Undo2,
  Play,
  Mic,
  Command,
} from 'lucide-react';
import { TrinityIconStatic } from '@/components/trinity-button';
import { TrinityAnimatedLogo } from '@/components/ui/trinity-animated-logo';

// Mobile UI Modes
type MobileMode = 'peek' | 'split' | 'immersive';

// Confidence levels for Trinity responses
type ConfidenceLevel = 'high' | 'medium' | 'low';

interface ThinkingStep {
  id: string;
  label: string;
  status: 'pending' | 'processing' | 'complete';
  detail?: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  confidence?: ConfidenceLevel;
  thinkingSteps?: ThinkingStep[];
  actions?: QuickAction[];
  preview?: PreviewData;
}

interface QuickAction {
  id: string;
  label: string;
  icon: string;
  action: string;
  params?: Record<string, any>;
}

interface PreviewData {
  before: string;
  after: string;
  changes: string[];
}

interface TrinityModalContextType {
  isOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
  toggleModal: () => void;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  clearMessages: () => void;
  mode: ConversationMode;
  setMode: (mode: ConversationMode) => void;
}

const TrinityModalContext = createContext<TrinityModalContextType | null>(null);

export function useTrinityModal() {
  const context = useContext(TrinityModalContext);
  if (!context) {
    throw new Error('useTrinityModal must be used within TrinityModalProvider');
  }
  return context;
}

export function TrinityModalProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [mode, setMode] = useState<ConversationMode>('business');
  const { user, isLoading: authLoading } = useAuth();
  const [location] = useLocation();
  const prevUserRef = useRef<typeof user>(undefined);

  const openModal = useCallback(() => setIsOpen(true), []);
  const closeModal = useCallback(() => setIsOpen(false), []);
  const toggleModal = useCallback(() => setIsOpen(prev => !prev), []);
  const clearMessages = useCallback(() => setMessages([]), []);

  // Clear state on logout
  useEffect(() => {
    if (prevUserRef.current && !user && !authLoading) {
      setIsOpen(false);
      setMessages([]);
    }
    prevUserRef.current = user;
  }, [user, authLoading]);

  // CMD+K command palette shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (user && !isPublicRoute(location)) {
          toggleModal();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [user, location, toggleModal]);

  const shouldRenderModal = useMemo(() => {
    if (!user) return false;
    if (isPublicRoute(location)) return false;
    return true;
  }, [user, location]);

  return (
    <TrinityModalContext.Provider value={{ 
      isOpen, openModal, closeModal, toggleModal, 
      messages, setMessages, clearMessages,
      mode, setMode
    }}>
      {children}
      {isOpen && shouldRenderModal && <TrinityModal onClose={closeModal} />}
    </TrinityModalContext.Provider>
  );
}

// Get contextual quick actions based on current page
function getQuickActions(location: string): QuickAction[] {
  const path = location.toLowerCase();
  
  if (path.includes('schedule') || path.includes('calendar')) {
    return [
      { id: 'add-shift', label: 'Add Shift', icon: 'Calendar', action: 'schedule.addShift' },
      { id: 'assign-guard', label: 'Assign Employee', icon: 'Users', action: 'schedule.assign' },
      { id: 'view-gaps', label: 'View Coverage Gaps', icon: 'AlertCircle', action: 'schedule.gaps' },
      { id: 'analyze-costs', label: 'Analyze Costs', icon: 'DollarSign', action: 'schedule.costs' },
    ];
  }
  
  if (path.includes('client') || path.includes('customer')) {
    return [
      { id: 'log-call', label: 'Log Call', icon: 'Phone', action: 'client.logCall' },
      { id: 'generate-invoice', label: 'Generate Invoice', icon: 'FileText', action: 'client.invoice' },
      { id: 'schedule-meeting', label: 'Schedule Meeting', icon: 'Calendar', action: 'client.meeting' },
      { id: 'view-history', label: 'View History', icon: 'Clock', action: 'client.history' },
    ];
  }
  
  if (path.includes('employee') || path.includes('team')) {
    return [
      { id: 'add-employee', label: 'Add Employee', icon: 'Users', action: 'employee.add' },
      { id: 'view-availability', label: 'Check Availability', icon: 'Calendar', action: 'employee.availability' },
      { id: 'send-notification', label: 'Send Notification', icon: 'Bell', action: 'employee.notify' },
      { id: 'run-payroll', label: 'Run Payroll', icon: 'DollarSign', action: 'employee.payroll' },
    ];
  }
  
  if (path.includes('invoice') || path.includes('billing') || path.includes('finance')) {
    return [
      { id: 'create-invoice', label: 'Create Invoice', icon: 'FileText', action: 'billing.create' },
      { id: 'send-reminders', label: 'Send Reminders', icon: 'Bell', action: 'billing.remind' },
      { id: 'view-aging', label: 'View Aging Report', icon: 'Clock', action: 'billing.aging' },
      { id: 'sync-quickbooks', label: 'Sync QuickBooks', icon: 'Zap', action: 'billing.qbSync' },
    ];
  }
  
  // Default actions
  return [
    { id: 'ask-question', label: 'Ask a Question', icon: 'HelpCircle', action: 'general.ask' },
    { id: 'generate-report', label: 'Generate Report', icon: 'FileText', action: 'general.report' },
    { id: 'view-insights', label: 'View Insights', icon: 'Sparkles', action: 'general.insights' },
  ];
}

// Confidence indicator component
function ConfidenceIndicator({ level }: { level: ConfidenceLevel }) {
  const config = {
    high: { color: 'text-emerald-500', bg: 'bg-emerald-500/20', label: '95% confident', icon: CheckCircle2 },
    medium: { color: 'text-amber-500', bg: 'bg-amber-500/20', label: '70% confident', icon: AlertCircle },
    low: { color: 'text-red-500', bg: 'bg-red-500/20', label: 'Needs review', icon: HelpCircle },
  };
  const { color, bg, label, icon: Icon } = config[level];
  
  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs ${bg} ${color}`}>
      <Icon className="h-3 w-3" />
      <span>{label}</span>
    </div>
  );
}

// Thinking visualization component with animated Trinity logo
function ThinkingVisualization({ steps, mode }: { steps: ThinkingStep[]; mode: ConversationMode }) {
  // Map conversation mode to TrinityAnimatedLogo mode
  const logoMode = mode === 'business' ? 'business' : mode === 'personal' ? 'personal' : 'integrated';
  
  // Get current active step for the substage display
  const currentStep = steps.find(s => s.status === 'processing') || steps[steps.length - 1];
  const completedCount = steps.filter(s => s.status === 'complete').length;
  const progress = (completedCount / steps.length) * 100;
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex gap-3"
    >
      {/* Animated Trinity Avatar */}
      <div className="shrink-0">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center ring-2 ring-primary/20">
          <TrinityAnimatedLogo size="sm" state="thinking" mode={logoMode} />
        </div>
      </div>
      
      {/* Thinking Content */}
      <div className="flex-1 space-y-2">
        {/* Header with animated text */}
        <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Trinity</span>
            <span className="inline-flex items-center gap-1 text-xs text-primary animate-pulse">
              <Brain className="h-3 w-3" />
              <span className="thinking-dots">Thinking</span>
            </span>
          </div>
          
          {/* Current substage */}
          {currentStep && (
            <motion.p
              key={currentStep.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-sm text-muted-foreground"
            >
              {currentStep.label}...
            </motion.p>
          )}
          
          {/* Progress bar */}
          <div className="h-1 bg-muted-foreground/10 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-primary to-primary/60 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>
        
        {/* Step indicators */}
        <div className="flex items-center gap-3 px-1">
          {steps.map((step, idx) => (
            <motion.div
              key={step.id}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: idx * 0.1 }}
              className="flex items-center gap-1.5"
            >
              {step.status === 'complete' && (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              )}
              {step.status === 'processing' && (
                <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />
              )}
              {step.status === 'pending' && (
                <div className="h-3.5 w-3.5 rounded-full border-2 border-muted-foreground/20" />
              )}
              <span className={`text-xs ${
                step.status === 'complete' ? 'text-emerald-600 dark:text-emerald-400' :
                step.status === 'processing' ? 'text-foreground font-medium' :
                'text-muted-foreground'
              }`}>
                {step.label.split(' ')[0]}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// Preview mode component
function PreviewPanel({ preview, onApply, onCancel }: { 
  preview: PreviewData; 
  onApply: () => void; 
  onCancel: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border rounded-lg p-4 space-y-3"
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        <Eye className="h-4 w-4" />
        <span>Preview Changes</span>
      </div>
      
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground uppercase">Before</span>
          <div className="bg-muted/50 rounded p-2 text-muted-foreground">
            {preview.before}
          </div>
        </div>
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground uppercase">After</span>
          <div className="bg-emerald-500/10 rounded p-2 text-emerald-600 dark:text-emerald-400">
            {preview.after}
          </div>
        </div>
      </div>
      
      {preview.changes.length > 0 && (
        <div className="text-xs text-muted-foreground">
          <span className="font-medium">Changes:</span>
          <ul className="list-disc list-inside mt-1">
            {preview.changes.map((change, idx) => (
              <li key={idx}>{change}</li>
            ))}
          </ul>
        </div>
      )}
      
      <div className="flex gap-2 pt-2">
        <Button size="sm" onClick={onApply} className="flex-1">
          <Play className="h-3.5 w-3.5 mr-1.5" />
          Apply
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel} className="flex-1">
          <Undo2 className="h-3.5 w-3.5 mr-1.5" />
          Cancel
        </Button>
      </div>
    </motion.div>
  );
}

// Mode selector component
function ModeSelector({ mode, onModeChange }: { mode: ConversationMode; onModeChange: (mode: ConversationMode) => void }) {
  return (
    <div className="flex gap-1 p-1 bg-muted rounded-lg">
      {Object.values(TRINITY_MODES).map((modeConfig) => {
        const Icon = modeConfig.icon;
        const isActive = mode === modeConfig.id;
        return (
          <button
            key={modeConfig.id}
            onClick={() => onModeChange(modeConfig.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-all ${
              isActive 
                ? `bg-gradient-to-r ${modeConfig.colors.gradient} text-white shadow-sm` 
                : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
            }`}
            data-testid={`button-trinity-mode-${modeConfig.id}`}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{modeConfig.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// Quick action chip component
function QuickActionChip({ action, onExecute }: { action: QuickAction; onExecute: (action: QuickAction) => void }) {
  const iconMap: Record<string, any> = {
    Calendar, FileText, Users, DollarSign, Clock, AlertCircle, HelpCircle, Sparkles, Zap
  };
  const Icon = iconMap[action.icon] || Sparkles;
  
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onExecute(action)}
      className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-full text-xs font-medium transition-colors"
      data-testid={`button-quick-action-${action.id}`}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{action.label}</span>
    </motion.button>
  );
}

interface TrinityModalProps {
  onClose: () => void;
}

function TrinityModal({ onClose }: TrinityModalProps) {
  const [location] = useLocation();
  const { toast } = useToast();
  const { messages, setMessages, clearMessages, mode, setMode } = useTrinityModal();
  const [inputValue, setInputValue] = useState('');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [mobileMode, setMobileMode] = useState<MobileMode>('peek');
  const [isMinimized, setIsMinimized] = useState(false);
  const [position, setPosition] = useState({ x: window.innerWidth - 440, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[]>([]);
  const dragStart = useRef({ x: 0, y: 0 });
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const quickActions = useMemo(() => getQuickActions(location), [location]);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) {
        setPosition(prev => ({
          x: Math.min(prev.x, window.innerWidth - 420),
          y: Math.min(prev.y, window.innerHeight - 500)
        }));
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (mobileMode === 'immersive') {
          setMobileMode('split');
        } else if (mobileMode === 'split') {
          setMobileMode('peek');
        } else {
          onClose();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, mobileMode]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (!isMinimized && mobileMode !== 'peek') {
      inputRef.current?.focus();
    }
  }, [isMinimized, mobileMode]);

  // Simulate thinking visualization
  const simulateThinking = useCallback(() => {
    setIsThinking(true);
    const steps: ThinkingStep[] = [
      { id: '1', label: 'Analyzing context', status: 'processing' },
      { id: '2', label: 'Checking data', status: 'pending' },
      { id: '3', label: 'Generating response', status: 'pending' },
    ];
    setThinkingSteps(steps);

    // Animate through steps
    setTimeout(() => {
      setThinkingSteps(prev => prev.map((s, i) => 
        i === 0 ? { ...s, status: 'complete', detail: 'Done' } : 
        i === 1 ? { ...s, status: 'processing' } : s
      ));
    }, 800);

    setTimeout(() => {
      setThinkingSteps(prev => prev.map((s, i) => 
        i <= 1 ? { ...s, status: 'complete', detail: 'Done' } : 
        { ...s, status: 'processing' }
      ));
    }, 1500);

    setTimeout(() => {
      setThinkingSteps(prev => prev.map(s => ({ ...s, status: 'complete' as const })));
      setIsThinking(false);
    }, 2200);
  }, []);

  const chatMutation = useMutation({
    mutationFn: async (message: string) => {
      simulateThinking();
      
      const pageContext = {
        currentPage: location,
        pageTitle: document.title,
        timestamp: new Date().toISOString(),
        mode,
      };

      const response = await apiRequest('/api/trinity/chat/chat', {
        method: 'POST',
        body: JSON.stringify({
          message,
          mode,
          pageContext,
          conversationHistory: messages.slice(-10).map(m => ({
            role: m.role,
            content: m.content
          })),
        }),
      });
      return response;
    },
    onSuccess: (data: any) => {
      // Determine confidence based on response
      const confidence: ConfidenceLevel = 
        data.confidence === 'high' ? 'high' :
        data.confidence === 'low' ? 'low' : 'medium';

      const assistantMessage: Message = {
        id: `msg-${Date.now()}-assistant`,
        role: 'assistant',
        content: data.response || data.message || 'I understand. How can I help you further?',
        timestamp: new Date(),
        confidence,
        thinkingSteps,
      };
      setMessages(prev => [...prev, assistantMessage]);
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to get response from Trinity',
        variant: 'destructive',
      });
      const errorMessage: Message = {
        id: `msg-${Date.now()}-error`,
        role: 'assistant',
        content: 'I apologize, but I encountered an error. Please try again.',
        timestamp: new Date(),
        confidence: 'low',
      };
      setMessages(prev => [...prev, errorMessage]);
      setIsThinking(false);
    },
  });

  const handleSend = () => {
    if (!inputValue.trim() || chatMutation.isPending) return;

    const userMessage: Message = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    chatMutation.mutate(inputValue.trim());
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleQuickAction = (action: QuickAction) => {
    const message = `Execute: ${action.label}`;
    setMessages(prev => [...prev, {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      content: message,
      timestamp: new Date(),
    }]);
    chatMutation.mutate(message);
  };

  // Mobile swipe gesture handling
  const handleDragEnd = (_: any, info: PanInfo) => {
    const velocity = info.velocity.y;
    const offset = info.offset.y;

    if (velocity < -500 || offset < -100) {
      // Swiped up
      setMobileMode(prev => prev === 'peek' ? 'split' : 'immersive');
    } else if (velocity > 500 || offset > 100) {
      // Swiped down
      if (mobileMode === 'peek') {
        onClose();
      } else {
        setMobileMode(prev => prev === 'immersive' ? 'split' : 'peek');
      }
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isMobile) return;
    setIsDragging(true);
    dragStart.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    };
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    const newX = e.clientX - dragStart.current.x;
    const newY = e.clientY - dragStart.current.y;
    const maxX = window.innerWidth - 420;
    const maxY = window.innerHeight - 100;
    setPosition({
      x: Math.max(0, Math.min(newX, maxX)),
      y: Math.max(0, Math.min(newY, maxY))
    });
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const modeConfig = TRINITY_MODES[mode];

  // MOBILE UI - 3-Mode Bottom Sheet
  if (isMobile) {
    const heightMap = {
      peek: '25vh',
      split: '55vh',
      immersive: '100vh',
    };

    return (
      <div
        className="fixed inset-x-0 bottom-0 z-[100] pointer-events-none"
        style={{ height: heightMap[mobileMode] }}
      >
        <div
          className={`h-full bg-background rounded-t-3xl shadow-2xl border-t flex flex-col pointer-events-auto ${
            mobileMode === 'immersive' ? 'rounded-none' : ''
          }`}
        >
            {/* Drag Handle */}
            <div className="flex justify-center py-2 shrink-0">
              <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 pb-2 shrink-0">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${modeConfig.colors.gradient} flex items-center justify-center`}>
                  <TrinityIconStatic size={24} />
                </div>
                <div>
                  <h1 className="font-semibold text-sm">Trinity 2.0</h1>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${modeConfig.colors.badge}`}>
                      {modeConfig.label}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">
                      {location}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => setMobileMode(prev => 
                    prev === 'peek' ? 'split' : prev === 'split' ? 'immersive' : 'peek'
                  )}
                  data-testid="button-toggle-mobile-mode"
                >
                  {mobileMode === 'peek' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={onClose}
                  data-testid="button-close-trinity-modal"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Mode Selector (shown in split/immersive) */}
            {mobileMode !== 'peek' && (
              <div className="px-4 pb-2 shrink-0">
                <ModeSelector mode={mode} onModeChange={setMode} />
              </div>
            )}

            {/* Quick Actions (shown in peek mode) */}
            {mobileMode === 'peek' && (
              <div className="px-4 pb-2 shrink-0">
                <ScrollArea className="w-full">
                  <div className="flex gap-2 pb-1">
                    {quickActions.map(action => (
                      <QuickActionChip key={action.id} action={action} onExecute={handleQuickAction} />
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}

            {/* Messages (hidden in peek mode) */}
            {mobileMode !== 'peek' && (
              <ScrollArea className="flex-1 px-4" ref={scrollRef}>
                {messages.length === 0 && !isThinking && (
                  <div className="flex flex-col items-center justify-center h-full text-center py-8">
                    <div className={`w-20 h-20 rounded-full bg-gradient-to-br ${modeConfig.colors.gradient}/20 flex items-center justify-center mb-4 ring-2 ring-primary/10`}>
                      <TrinityAnimatedLogo 
                        size="lg" 
                        state="idle" 
                        mode={mode === 'business' ? 'business' : mode === 'personal' ? 'personal' : 'integrated'} 
                      />
                    </div>
                    <h3 className="font-semibold text-lg mb-2">Ask Trinity Anything</h3>
                    <p className="text-sm text-muted-foreground max-w-xs">
                      I can help with {mode === 'business' ? 'schedules, invoices, and operations' : 
                        mode === 'personal' ? 'personal growth and accountability' : 
                        'business and personal insights'}
                    </p>
                  </div>
                )}
                <div className="space-y-4 pb-4">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      {/* Trinity Avatar for assistant messages */}
                      {msg.role === 'assistant' && (
                        <div className="shrink-0">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center ring-1 ring-primary/20">
                            <TrinityAnimatedLogo 
                              size="sm" 
                              state="responding" 
                              mode={mode === 'business' ? 'business' : mode === 'personal' ? 'personal' : 'integrated'} 
                              className="scale-75"
                            />
                          </div>
                        </div>
                      )}
                      <div className={`max-w-[80%] space-y-1 ${msg.role === 'user' ? '' : ''}`}>
                        <div
                          className={`rounded-2xl px-4 py-2.5 ${
                            msg.role === 'user'
                              ? `bg-gradient-to-r ${modeConfig.colors.gradient} text-white rounded-br-sm`
                              : 'bg-muted rounded-tl-sm'
                          }`}
                        >
                          <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                        </div>
                        {msg.role === 'assistant' && msg.confidence && (
                          <ConfidenceIndicator level={msg.confidence} />
                        )}
                      </div>
                    </div>
                  ))}
                  {isThinking && <ThinkingVisualization steps={thinkingSteps} mode={mode} />}
                </div>
              </ScrollArea>
            )}

            {/* Input Area */}
            <div className="p-4 border-t bg-card/50 shrink-0">
              <div className="flex gap-2">
                <Input
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder={mobileMode === 'peek' ? 'Quick question...' : `Ask Trinity (${modeConfig.label} mode)...`}
                  disabled={chatMutation.isPending}
                  className="flex-1"
                  data-testid="input-trinity-message"
                />
                <Button
                  onClick={handleSend}
                  disabled={!inputValue.trim() || chatMutation.isPending}
                  size="icon"
                  className={`bg-gradient-to-r ${modeConfig.colors.gradient}`}
                  data-testid="button-send-trinity-message"
                >
                  {chatMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <div className="flex items-center justify-center gap-4 mt-2 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Command className="h-3 w-3" />+K to toggle
                </span>
                <span>Swipe up/down to resize</span>
              </div>
            </div>
        </div>
      </div>
    );
  }

  // DESKTOP - Minimized state
  if (isMinimized) {
    return (
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="fixed z-[100] cursor-pointer"
        style={{ left: position.x, top: position.y }}
        onClick={() => setIsMinimized(false)}
        data-testid="trinity-modal-minimized"
      >
        <div className={`w-14 h-14 rounded-full bg-gradient-to-br ${modeConfig.colors.gradient} flex items-center justify-center shadow-lg border border-white/20`}>
          <TrinityIconStatic size={28} />
          {messages.length > 0 && (
            <div className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-primary-foreground rounded-full text-xs flex items-center justify-center">
              {messages.length}
            </div>
          )}
        </div>
      </motion.div>
    );
  }

  // DESKTOP - Full floating window (no blocking backdrop)
  return (
    <Card
          className={`fixed z-[100] w-[420px] shadow-2xl border-2 ${modeConfig.colors.badge.replace('bg-', 'border-').split(' ')[0]}/30`}
          style={{
            left: position.x,
            top: position.y,
            maxHeight: 'calc(100vh - 100px)',
          }}
          data-testid="trinity-modal-desktop"
        >
          <CardHeader
            className="flex flex-row items-center gap-3 py-3 px-4 border-b cursor-move select-none"
            onMouseDown={handleMouseDown}
          >
            <GripHorizontal className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${modeConfig.colors.gradient} flex items-center justify-center shrink-0`}>
              <TrinityIconStatic size={24} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">Trinity 2.0</CardTitle>
                <Badge variant="outline" className={`text-[10px] ${modeConfig.colors.badge}`}>
                  {modeConfig.label}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {location}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={clearMessages}
                title="Clear chat"
                data-testid="button-clear-trinity-chat"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => setIsMinimized(true)}
                title="Minimize"
                data-testid="button-minimize-trinity"
              >
                <Minimize2 className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={onClose}
                title="Close"
                data-testid="button-close-trinity-modal"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {/* Mode Selector */}
            <div className="px-4 pt-3">
              <ModeSelector mode={mode} onModeChange={setMode} />
            </div>

            {/* Quick Actions */}
            <div className="px-4 pt-3">
              <ScrollArea className="w-full">
                <div className="flex gap-2 pb-1">
                  {quickActions.slice(0, 4).map(action => (
                    <QuickActionChip key={action.id} action={action} onExecute={handleQuickAction} />
                  ))}
                </div>
              </ScrollArea>
            </div>

            {/* Messages */}
            <ScrollArea className="h-[300px] px-4 pt-3" ref={scrollRef}>
              {messages.length === 0 && !isThinking && (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div className={`w-14 h-14 rounded-full bg-gradient-to-br ${modeConfig.colors.gradient}/20 flex items-center justify-center mb-3 ring-2 ring-primary/10`}>
                    <TrinityAnimatedLogo 
                      size="md" 
                      state="idle" 
                      mode={mode === 'business' ? 'business' : mode === 'personal' ? 'personal' : 'integrated'} 
                    />
                  </div>
                  <h3 className="font-semibold mb-1">Ask Trinity Anything</h3>
                  <p className="text-xs text-muted-foreground">
                    Press <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">Cmd+K</kbd> anywhere to open
                  </p>
                </div>
              )}
              <div className="space-y-3 pb-3">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    {/* Trinity Avatar for assistant messages */}
                    {msg.role === 'assistant' && (
                      <div className="shrink-0">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center ring-1 ring-primary/20">
                          <TrinityAnimatedLogo 
                            size="sm" 
                            state="responding" 
                            mode={mode === 'business' ? 'business' : mode === 'personal' ? 'personal' : 'integrated'} 
                            className="scale-[0.65]"
                          />
                        </div>
                      </div>
                    )}
                    <div className="max-w-[80%] space-y-1">
                      <div
                        className={`rounded-xl px-3 py-2 ${
                          msg.role === 'user'
                            ? `bg-gradient-to-r ${modeConfig.colors.gradient} text-white rounded-br-sm`
                            : 'bg-muted rounded-tl-sm'
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      </div>
                      {msg.role === 'assistant' && msg.confidence && (
                        <ConfidenceIndicator level={msg.confidence} />
                      )}
                    </div>
                  </div>
                ))}
                {isThinking && <ThinkingVisualization steps={thinkingSteps} mode={mode} />}
              </div>
            </ScrollArea>

            {/* Input Area */}
            <div className="p-3 border-t">
              <div className="flex gap-2">
                <Input
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder={`Ask Trinity (${modeConfig.label})...`}
                  disabled={chatMutation.isPending}
                  className="flex-1"
                  data-testid="input-trinity-message"
                />
                <Button
                  onClick={handleSend}
                  disabled={!inputValue.trim() || chatMutation.isPending}
                  size="icon"
                  className={`bg-gradient-to-r ${modeConfig.colors.gradient}`}
                  data-testid="button-send-trinity-message"
                >
                  {chatMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
  );
}

export default TrinityModal;
