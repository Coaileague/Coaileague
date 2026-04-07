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
import { cn } from '@/lib/utils';
import { useMutation, useQuery } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
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
import { 
  TRINITY_MODES, 
  TRINITY_BRANDING, 
  TRINITY_MOBILE_CONFIG,
  TRINITY_ALLOWED_ROLES,
  type ConversationMode 
} from '@/config/trinity';
import { motion, AnimatePresence, PanInfo, useDragControls } from 'framer-motion';
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
  Paperclip,
  ImagePlus,
  X as XIcon,
} from 'lucide-react';
import { TrinityLogo } from '@/components/trinity-logo';
import TrinityRedesign from '@/components/trinity-redesign';
import { Suspense } from 'react';
import { TrinityAgentPanel } from '@/components/trinity';
import { TrinityActionHistoryPanel } from '@/components/trinity/TrinityActionHistoryPanel';
import { useTrinityState } from '@/hooks/use-trinity-state';

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
  usage?: UsageData;
  images?: string[];
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

interface UsageAction {
  model: string;
  tokens: number;
  credits: number;
}

interface UsageData {
  timeMs: number;
  totalTokens: number;
  totalCredits: number;
  balanceRemaining: number;
  unlimitedCredits: boolean; // DEPRECATED: Always false now
  tier?: string; // Subscription tier: free, starter, professional, enterprise
  monthlyAllowance?: number; // Monthly credit allowance for tier
  actions: UsageAction[];
}

interface TrinityModalContextType {
  isOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
  toggleModal: () => void;
  openWithContext: (prompt: string, options?: { autoSubmit?: boolean }) => void;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  clearMessages: () => void;
  mode: ConversationMode;
  setMode: (mode: ConversationMode) => void;
  pendingPrompt: string | null;
  setPendingPrompt: (prompt: string | null) => void;
  pendingAutoSubmit: boolean;
  setPendingAutoSubmit: (value: boolean) => void;
}

const TrinityModalContext = createContext<TrinityModalContextType | null>(null);

// Default safe context for HMR resilience
const defaultContext: TrinityModalContextType = {
  isOpen: false,
  openModal: () => {},
  closeModal: () => {},
  toggleModal: () => {},
  openWithContext: () => {},
  messages: [],
  setMessages: () => {},
  clearMessages: () => {},
  mode: 'business',
  setMode: () => {},
  pendingPrompt: null,
  setPendingPrompt: () => {},
  pendingAutoSubmit: false,
  setPendingAutoSubmit: () => {},
};

export function useTrinityModal() {
  const context = useContext(TrinityModalContext);
  // Return default context during HMR or if accidentally used outside provider
  // This prevents crashes during hot reloads
  if (!context) {
    console.warn('[Trinity] Context not available - using safe defaults');
    return defaultContext;
  }
  return context;
}

// BroadcastChannel for cross-tab/device sync
const TRINITY_CHANNEL_NAME = 'trinity-chat-sync';

export function TrinityModalProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [mode, setMode] = useState<ConversationMode>('business');
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [pendingAutoSubmit, setPendingAutoSubmit] = useState(false);
  const { user, isLoading: authLoading } = useAuth();
  const [location] = useLocation();
  const prevUserRef = useRef<typeof user>(undefined);
  const channelRef = useRef<BroadcastChannel | null>(null);

  // Load conversation history when user is available
  const { data: sessionData } = useQuery<{
    session?: { id: string; turns?: Array<{ role: string; content: string; createdAt: string }> };
  }>({
    queryKey: ['/api/trinity/session'],
    enabled: !!user && !authLoading,
    staleTime: 30000,
  });

  // Initialize messages from session data
  useEffect(() => {
    if (sessionData?.session?.turns && sessionData.session.turns.length > 0) {
      const loadedMessages: Message[] = sessionData.session.turns.map((turn, idx) => ({
        id: `loaded-${idx}-${turn.createdAt}`,
        role: turn.role as 'user' | 'assistant',
        content: turn.content,
        timestamp: new Date(turn.createdAt),
        confidence: turn.role === 'assistant' ? 'high' as ConfidenceLevel : undefined,
      }));
      setMessages(loadedMessages);
    }
  }, [sessionData]);

  // Setup BroadcastChannel for cross-tab/device sync
  useEffect(() => {
    if (typeof BroadcastChannel !== 'undefined' && user) {
      channelRef.current = new BroadcastChannel(TRINITY_CHANNEL_NAME);
      
      channelRef.current.onmessage = (event) => {
        const { type, data, userId } = event.data;
        // Only sync if same user
        if (userId !== user.id) return;
        
        if (type === 'new_message') {
          setMessages(prev => {
            // Avoid duplicates
            if (prev.some(m => m.id === data.id)) return prev;
            return [...prev, data];
          });
        } else if (type === 'clear_messages') {
          setMessages([]);
        } else if (type === 'mode_change') {
          setMode(data.mode);
        }
      };

      return () => {
        channelRef.current?.close();
        channelRef.current = null;
      };
    }
  }, [user]);

  // Broadcast new messages to other tabs
  const broadcastMessage = useCallback((message: Message) => {
    if (channelRef.current && user) {
      channelRef.current.postMessage({
        type: 'new_message',
        data: message,
        userId: user.id,
      });
    }
  }, [user]);

  const openModal = useCallback(() => setIsOpen(true), []);
  const closeModal = useCallback(() => setIsOpen(false), []);
  const toggleModal = useCallback(() => setIsOpen(prev => !prev), []);

  /**
   * openWithContext — sets a pre-loaded prompt then opens the modal.
   * The TrinityModal input field consumes pendingPrompt on mount (see line ~954).
   * Used by notification cards to hand off context to the Trinity AI conversation.
   * @param options.autoSubmit - If true, Trinity will auto-send the prompt without user pressing Enter
   */
  const openWithContext = useCallback((prompt: string, options?: { autoSubmit?: boolean }) => {
    setPendingPrompt(prompt);
    if (options?.autoSubmit) setPendingAutoSubmit(true);
    setIsOpen(true);
  }, []);
  
  const clearMessages = useCallback(() => {
    setMessages([]);
    if (channelRef.current && user) {
      channelRef.current.postMessage({
        type: 'clear_messages',
        userId: user.id,
      });
    }
  }, [user]);

  // Enhanced setMessages that broadcasts to other tabs
  const setMessagesWithSync = useCallback((updater: React.SetStateAction<Message[]>) => {
    setMessages(prev => {
      const newMessages = typeof updater === 'function' ? updater(prev) : updater;
      // Broadcast new messages
      if (newMessages.length > prev.length) {
        const addedMessages = newMessages.slice(prev.length);
        addedMessages.forEach(msg => broadcastMessage(msg));
      }
      return newMessages;
    });
  }, [broadcastMessage]);

  // Clear state on logout
  useEffect(() => {
    if (prevUserRef.current && !user && !authLoading) {
      setIsOpen(false);
      setMessages([]);
    }
    prevUserRef.current = user;
  }, [user, authLoading]);

  // CMD+K command palette shortcut - works anywhere for logged-in users
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (user) {
          toggleModal();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [user, toggleModal]);

  // Allow modal for any authenticated user, regardless of route
  // This enables Trinity chat on public pages for logged-in users
  const shouldRenderModal = useMemo(() => {
    return !!user;
  }, [user]);

  return (
    <TrinityModalContext.Provider value={{ 
      isOpen, openModal, closeModal, toggleModal, openWithContext,
      messages, setMessages: setMessagesWithSync, clearMessages,
      mode, setMode,
      pendingPrompt, setPendingPrompt,
      pendingAutoSubmit, setPendingAutoSubmit,
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
  
  // Default quick prompts - Fortune 500 polished suggestions
  return [
    { id: 'today-schedule', label: "Today's schedule", icon: 'Calendar', action: "Show me today's schedule" },
    { id: 'pending-invoices', label: 'Pending invoices', icon: 'DollarSign', action: "What invoices are pending?" },
    { id: 'whos-working', label: "Who's working", icon: 'Users', action: "Who's working right now?" },
    { id: 'hours-week', label: 'Hours this week', icon: 'Clock', action: "Show me hours worked this week" },
    { id: 'weekly-report', label: 'Weekly report', icon: 'FileText', action: "Give me a weekly summary report" },
    { id: 'open-shifts', label: 'Open shifts', icon: 'AlertCircle', action: "Are there any open shifts?" },
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

// Action Broadcast Panel — last 5 Trinity actions in compact pill list
function ActionBroadcastPanel({ messages }: { messages: Message[] }) {
  const assistantMsgs = messages
    .filter((m) => m.role === 'assistant')
    .slice(-5)
    .reverse();

  if (assistantMsgs.length === 0) return null;

  return (
    <div
      className="border-t px-3 py-2 bg-muted/20 shrink-0"
      data-testid="action-broadcast-panel"
    >
      <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
        Recent Actions
      </p>
      <div className="flex flex-col gap-0.5">
        {assistantMsgs.map((msg) => (
          <div
            key={msg.id}
            className="flex items-start gap-1.5 min-w-0"
            data-testid={`action-broadcast-item-${msg.id}`}
          >
            <span className="mt-1.5 w-1 h-1 rounded-full bg-primary/50 flex-shrink-0" aria-hidden="true" />
            <span className="text-[11px] text-muted-foreground truncate leading-4">
              {msg.content.length > 90 ? `${msg.content.slice(0, 90)}…` : msg.content}
            </span>
            {msg.confidence && (
              <span
                className={cn(
                  'flex-shrink-0 text-[9px] px-1 rounded leading-4 mt-0.5',
                  msg.confidence === 'high' ? 'text-emerald-500 bg-emerald-500/10' :
                  msg.confidence === 'medium' ? 'text-amber-500 bg-amber-500/10' :
                  'text-red-500 bg-red-500/10'
                )}
              >
                {msg.confidence}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function UsageBlock({ usage }: { usage: UsageData }) {
  const [expanded, setExpanded] = useState(false);
  
  const formatTime = (ms: number) => {
    const seconds = Math.round(ms / 1000);
    return seconds < 1 ? '<1s' : `${seconds}s`;
  };
  
  const formatTokens = (tokens: number) => {
    return tokens.toLocaleString();
  };
  
  const formatCredits = (credits: number) => {
    return credits.toFixed(2);
  };
  
  const formatBalance = (balance: number) => {
    if (balance >= 999999) return '∞';
    return balance.toLocaleString();
  };
  
  const formatTier = (tier?: string) => {
    if (!tier) return 'Standard';
    const tierNames: Record<string, string> = {
      'free': 'Free',
      'starter': 'Starter',
      'professional': 'Professional',
      'enterprise': 'Enterprise',
      'unlimited': 'Enterprise Plus',
      'platform_staff': 'Platform Staff',
    };
    return tierNames[tier] || tier.charAt(0).toUpperCase() + tier.slice(1);
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      className="mt-2"
      data-testid="usage-block"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left"
        data-testid="button-toggle-usage-details"
      >
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-muted/50 border border-border/50 text-[10px] text-muted-foreground hover-elevate transition-colors">
          <Zap className="h-3 w-3 text-amber-500 shrink-0" />
          <span className="font-medium shrink-0">Usage</span>
          <span className="text-muted-foreground/70 shrink-0">|</span>
          <span className="shrink-0">{formatTime(usage.timeMs)}</span>
          <span className="text-muted-foreground/70 shrink-0">|</span>
          <span className="shrink-0">{formatTokens(usage.totalTokens)} tok</span>
          <span className="text-muted-foreground/70 shrink-0">|</span>
          <span className="text-amber-600 dark:text-amber-400 font-medium shrink-0">-{formatCredits(usage.totalCredits)}</span>
          <ChevronDown className={`h-3 w-3 ml-auto shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </button>
      
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-1 px-2.5 py-2 rounded-lg bg-muted/30 border border-border/30 text-[10px] space-y-1.5 overflow-hidden" data-testid="usage-details-expanded">
              <div className="flex items-center gap-1.5 text-muted-foreground font-medium flex-wrap">
                <span>Time: {formatTime(usage.timeMs)}</span>
                <span className="text-muted-foreground/50">|</span>
                <span>Actions: {usage.actions.length}</span>
                {usage.tier && (
                  <>
                    <span className="text-muted-foreground/50">|</span>
                    <span className="text-primary">{formatTier(usage.tier)}</span>
                  </>
                )}
              </div>
              
              <div className="space-y-1 text-muted-foreground/80 overflow-hidden">
                {usage.actions.map((action, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 overflow-hidden">
                    <span className="text-muted-foreground/50 shrink-0">{idx === usage.actions.length - 1 ? '└' : '├'}</span>
                    <span className="font-mono text-[9px] bg-muted/50 px-1 rounded truncate max-w-[80px]">{action.model}</span>
                    <span className="shrink-0">{formatTokens(action.tokens)} tok</span>
                    <span className="text-amber-600 dark:text-amber-400 shrink-0">-{formatCredits(action.credits)}</span>
                  </div>
                ))}
              </div>
              
              <div className="pt-1 border-t border-border/30 flex items-center justify-between text-muted-foreground font-medium gap-2 flex-wrap">
                <span>{formatTokens(usage.totalTokens)} tok | <span className="text-amber-600 dark:text-amber-400">-{formatCredits(usage.totalCredits)}</span></span>
                <span className="text-primary truncate">
                  Bal: {formatBalance(usage.balanceRemaining)}{usage.monthlyAllowance ? `/${usage.monthlyAllowance.toLocaleString()}` : ''}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// Thinking visualization component with animated Trinity mascot
function ThinkingVisualization({ steps, mode }: { steps: ThinkingStep[]; mode: ConversationMode }) {
  // Using SVG TrinityAnimatedLogo for crisp rendering at any size
  
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
      {/* Animated Trinity Avatar - Canvas for crisp rendering */}
      <div className="shrink-0">
        <div className="w-10 h-10 flex items-center justify-center">
          <Suspense fallback={<div className="w-10 h-10" />}>
            <TrinityRedesign size={40} mode="THINKING" />
          </Suspense>
        </div>
      </div>
      
      {/* Thinking Content */}
      <div className="flex-1 space-y-2">
        {/* Header with animated text */}
        <div className="bg-muted rounded-md rounded-tl-sm px-4 py-3 space-y-2">
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
        <div className="flex items-center gap-2 px-1 overflow-hidden flex-wrap">
          {steps.map((step, idx) => (
            <motion.div
              key={step.id}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: idx * 0.1 }}
              className="flex items-center gap-1 shrink-0"
            >
              {step.status === 'complete' && (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              )}
              {step.status === 'processing' && (
                <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />
              )}
              {step.status === 'pending' && (
                <div className="h-3.5 w-3.5 rounded-full border border-muted-foreground/20" />
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

// Mode selector component - shows Guru mode only for platform staff
function ModeSelector({ mode, onModeChange }: { mode: ConversationMode; onModeChange: (mode: ConversationMode) => void }) {
  const { user } = useAuth();
  
  // Check if user is platform staff using TRINITY_ALLOWED_ROLES (centralized config)
  const isPlatformStaff = user?.role && 
    (TRINITY_ALLOWED_ROLES.platformRoles as readonly string[]).includes(user.role);
  
  // Filter modes - only show Guru to platform staff (support agents)
  const availableModes = Object.values(TRINITY_MODES).filter(modeConfig => {
    if (modeConfig.requiresSupportAgent && !isPlatformStaff) return false;
    return true;
  });
  
  return (
    <div className="flex gap-1 p-1 bg-muted rounded-lg">
      {availableModes.map((modeConfig) => {
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

const quickActionIconMap: Record<string, any> = {
  Calendar, FileText, Users, DollarSign, Clock, AlertCircle, HelpCircle, Sparkles, Zap
};

function QuickActionChip({ action, onExecute }: { action: QuickAction; onExecute: (action: QuickAction) => void }) {
  const Icon = quickActionIconMap[action.icon] || Sparkles;
  
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onExecute(action)}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-muted/80 hover:bg-muted text-foreground/80 hover:text-foreground rounded-full text-xs font-medium border border-border/50 hover:border-border transition-all whitespace-nowrap"
      data-testid={`button-quick-action-${action.id}`}
    >
      <Icon className="h-3 w-3" />
      <span>{action.label}</span>
    </motion.button>
  );
}

function QuickActionGrid({ actions, onExecute }: { actions: QuickAction[]; onExecute: (action: QuickAction) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1.5 max-h-[200px] overflow-y-auto" data-testid="quick-action-grid">
      {actions.map(action => {
        const Icon = quickActionIconMap[action.icon] || Sparkles;
        return (
          <button
            key={action.id}
            onClick={() => onExecute(action)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-left text-xs text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors border border-transparent hover:border-border/50 min-w-0"
            data-testid={`button-quick-action-${action.id}`}
          >
            <Icon className="h-3.5 w-3.5 shrink-0 text-primary/60" />
            <span className="truncate block">{action.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function CommandSuggestions({ 
  query, 
  actions, 
  onSelect, 
  onClearInput,
  visible 
}: { 
  query: string; 
  actions: QuickAction[]; 
  onSelect: (action: QuickAction) => void;
  onClearInput: () => void;
  visible: boolean;
}) {
  if (!visible || !query.trim()) return null;
  
  const filtered = actions.filter(a => 
    a.label.toLowerCase().includes(query.toLowerCase()) ||
    a.action.toLowerCase().includes(query.toLowerCase())
  );
  
  if (filtered.length === 0) return null;
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      className="absolute bottom-full left-0 right-0 mb-1 bg-popover border border-border rounded-lg shadow-sm overflow-hidden z-10 max-h-[200px] overflow-y-auto"
      data-testid="command-suggestions"
    >
      {filtered.map(action => {
        const Icon = quickActionIconMap[action.icon] || Sparkles;
        return (
          <button
            key={action.id}
            onClick={() => {
              onClearInput();
              onSelect(action);
            }}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-left text-sm hover:bg-muted/80 transition-colors"
            data-testid={`suggestion-${action.id}`}
          >
            <Icon className="h-3.5 w-3.5 shrink-0 text-primary/70" />
            <span className="truncate">{action.label}</span>
          </button>
        );
      })}
    </motion.div>
  );
}

function renderInlineMarkdown(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/g;
  let lastIndex = 0;
  let match;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const token = match[0];
    if (token.startsWith('**')) {
      parts.push(<strong key={key++} className="font-semibold">{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('`')) {
      parts.push(<code key={key++} className="bg-background/30 px-1 py-0.5 rounded text-[11px] font-mono">{token.slice(1, -1)}</code>);
    } else {
      parts.push(<em key={key++}>{token.slice(1, -1)}</em>);
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

function TrinityMarkdown({ content }: { content: string }) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^#{1,3} /.test(line)) {
      const htext = line.replace(/^#{1,3} /, '');
      elements.push(<p key={i} className="font-semibold text-sm mt-1 mb-0.5">{renderInlineMarkdown(htext)}</p>);
      i++;
    } else if (/^[\*\-] /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[\*\-] /.test(lines[i])) { items.push(lines[i].slice(2)); i++; }
      elements.push(
        <ul key={`ul-${i}`} className="my-1 space-y-1">
          {items.map((item, j) => (
            <li key={j} className="flex gap-2 items-start text-sm">
              <span className="mt-[5px] w-1.5 h-1.5 rounded-full bg-current shrink-0 opacity-50" />
              <span className="break-words [overflow-wrap:anywhere]">{renderInlineMarkdown(item)}</span>
            </li>
          ))}
        </ul>
      );
    } else if (/^\d+\. /.test(line)) {
      const items: { num: string; text: string }[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        const m = lines[i].match(/^(\d+)\. (.*)$/);
        if (m) items.push({ num: m[1], text: m[2] });
        i++;
      }
      elements.push(
        <ol key={`ol-${i}`} className="my-1 space-y-1">
          {items.map((item, j) => (
            <li key={j} className="flex gap-2 items-start text-sm">
              <span className="font-semibold text-[11px] opacity-60 mt-0.5 shrink-0 min-w-[1rem]">{item.num}.</span>
              <span className="break-words [overflow-wrap:anywhere]">{renderInlineMarkdown(item.text)}</span>
            </li>
          ))}
        </ol>
      );
    } else if (line.trim() === '') {
      if (i > 0 && i < lines.length - 1) elements.push(<div key={i} className="h-1" />);
      i++;
    } else {
      elements.push(
        <p key={i} className="text-sm break-words [overflow-wrap:anywhere] leading-relaxed">
          {renderInlineMarkdown(line)}
        </p>
      );
      i++;
    }
  }
  return <div className="space-y-0.5">{elements}</div>;
}

interface TrinityModalProps {
  onClose: () => void;
}

function TrinityModal({ onClose }: TrinityModalProps) {
  const [location] = useLocation();
  const { toast } = useToast();
  const { messages, setMessages, clearMessages, mode, setMode, pendingPrompt, setPendingPrompt, pendingAutoSubmit, setPendingAutoSubmit } = useTrinityModal();
  const [inputValue, setInputValue] = useState('');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [mobileMode, setMobileMode] = useState<MobileMode>('immersive');
  const [isMinimized, setIsMinimized] = useState(false);
  const autoSubmitTextRef = useRef<string | null>(null);
  const [autoSubmitTick, setAutoSubmitTick] = useState(0);
  const [position, setPosition] = useState({ x: window.innerWidth - 440, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const speakingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[]>([]);
  const [agentModeActive, setAgentModeActive] = useState(false);
  const [conversationId] = useState(() => `trinity-${Date.now()}`);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [isListening, setIsListening] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const agentState = useTrinityState({
    conversationId: agentModeActive ? conversationId : null,
    onExecutionComplete: (success) => {
      if (success) {
        toast({
          title: 'Goal Complete',
          description: 'Trinity successfully completed the requested action.',
        });
      }
    }
  });

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
    if (!isMobile) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const handleVVChange = () => {
      const offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKeyboardOffset(offset);
      if (offset > 100) {
        setMobileMode(prev => prev === 'peek' ? 'split' : prev === 'immersive' ? 'split' : prev);
      } else if (offset === 0) {
        setMobileMode(prev => prev === 'split' ? 'immersive' : prev);
      }
    };
    vv.addEventListener('resize', handleVVChange);
    vv.addEventListener('scroll', handleVVChange);
    return () => {
      vv.removeEventListener('resize', handleVVChange);
      vv.removeEventListener('scroll', handleVVChange);
    };
  }, [isMobile]);

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

  // Consume pendingPrompt — sets input value, optionally auto-submits
  useEffect(() => {
    if (pendingPrompt) {
      const text = pendingPrompt;
      const shouldAutoSubmit = pendingAutoSubmit;
      setPendingPrompt(null);
      if (shouldAutoSubmit) setPendingAutoSubmit(false);
      setInputValue(text);
      setMobileMode('immersive');
      if (shouldAutoSubmit) {
        autoSubmitTextRef.current = text;
        setAutoSubmitTick(t => t + 1);
      } else {
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    }
  }, [pendingPrompt, setPendingPrompt, pendingAutoSubmit, setPendingAutoSubmit]);

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
    mutationFn: async (payload: { message: string; images?: string[] }) => {
      simulateThinking();
      
      setAgentModeActive(true);
      agentState.startExecution();
      
      const pageContext = {
        currentPage: location,
        pageTitle: document.title,
        timestamp: new Date().toISOString(),
        mode,
      };

      const response = await apiRequest('POST', '/api/trinity/chat/chat', {
        message: payload.message,
        mode,
        sessionId: conversationId,
        pageContext,
        images: payload.images,
        conversationHistory: messages.slice(-10).map(m => ({
          role: m.role,
          content: m.content
        })),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || 'Failed to send message');
      }
      return response.json();
    },
    onSuccess: (data: any) => {
      agentState.stopExecution();
      
      // Determine confidence based on response
      const confidence: ConfidenceLevel = 
        data.confidence === 'high' ? 'high' :
        data.confidence === 'low' ? 'low' : 'medium';

      // Extract usage data from response if present
      const usage: UsageData | undefined = data.usage ? {
        timeMs: data.usage.timeMs || data.usage.time_ms || 0,
        totalTokens: data.usage.totalTokens || data.usage.total_tokens || 0,
        totalCredits: data.usage.totalCredits || data.usage.total_credits || 0,
        balanceRemaining: data.usage.balanceRemaining || data.usage.balance_remaining || 0,
        unlimitedCredits: data.usage.unlimitedCredits || data.usage.unlimited_credits || false,
        tier: data.usage.tier || undefined,
        monthlyAllowance: data.usage.monthlyAllowance || data.usage.monthly_allowance || undefined,
        actions: (data.usage.actions || []).map((a: any) => ({
          model: a.model || 'unknown',
          tokens: a.tokens || 0,
          credits: a.credits || 0,
        })),
      } : undefined;

      const assistantMessage: Message = {
        id: `msg-${Date.now()}-assistant`,
        role: 'assistant',
        content: data.response || data.message || 'I understand. How can I help you further?',
        timestamp: new Date(),
        confidence,
        thinkingSteps,
        usage,
      };
      setMessages(prev => [...prev, assistantMessage]);
      // Flash SPEAKING state on mascot for 2.5 seconds after response
      if (speakingTimerRef.current) clearTimeout(speakingTimerRef.current);
      setIsSpeaking(true);
      speakingTimerRef.current = setTimeout(() => setIsSpeaking(false), 2500);
    },
    onError: () => {
      agentState.stopExecution();
      
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
    if (!inputValue.trim() && pendingImages.length === 0) return;
    if (chatMutation.isPending) return;

    const text = inputValue.trim() || (pendingImages.length > 0 ? 'Please analyze this image.' : '');
    const images = pendingImages.length > 0 ? [...pendingImages] : undefined;

    const userMessage: Message = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      content: text,
      timestamp: new Date(),
      images,
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setPendingImages([]);
    chatMutation.mutate({ message: text, images });
  };

  // Auto-submit effect — fires only when autoSubmitTick changes (set in pendingPrompt effect)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!autoSubmitTick || !autoSubmitTextRef.current || chatMutation.isPending) return;
    const text = autoSubmitTextRef.current;
    autoSubmitTextRef.current = null;
    const userMessage: Message = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      content: text,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    chatMutation.mutate({ message: text });
  }, [autoSubmitTick]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const remaining = 5 - pendingImages.length;
    const toProcess = files.slice(0, remaining);

    toProcess.forEach(file => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        if (dataUrl) {
          // Strip the data URL prefix — send only base64 content
          const base64 = dataUrl.split(',')[1];
          if (base64) {
            setPendingImages(prev => prev.length < 5 ? [...prev, base64] : prev);
          }
        }
      };
      reader.readAsDataURL(file);
    });

    // Reset input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = '';
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
    chatMutation.mutate({ message });
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

  // Mobile drag controls - restricts drag to handle only
  const mobileDragControls = useDragControls();

  // MOBILE UI - Fortune 500-grade bottom sheet with optimized touch
  if (isMobile) {
    // Height map for mobile modes - using config values with fallback
    const heightMap = TRINITY_MOBILE_CONFIG.heights;

    // Handle swipe gestures - tuned for smooth touch response
    const handleDragEnd = (_: any, info: PanInfo) => {
      const { offset, velocity } = info;
      // Use config thresholds with sensible defaults
      const swipeThreshold = TRINITY_MOBILE_CONFIG.swipe?.threshold || 50;
      const velocityThreshold = TRINITY_MOBILE_CONFIG.swipe?.velocityThreshold || 300;
      
      const swipeUp = offset.y < -swipeThreshold || velocity.y < -velocityThreshold;
      const swipeDown = offset.y > swipeThreshold || velocity.y > velocityThreshold;

      if (swipeUp) {
        // Swipe up - expand
        setMobileMode(prev => prev === 'peek' ? 'split' : prev === 'split' ? 'immersive' : 'immersive');
      } else if (swipeDown) {
        // Swipe down - collapse or close
        if (mobileMode === 'peek') {
          onClose();
        } else {
          setMobileMode(prev => prev === 'immersive' ? 'split' : prev === 'split' ? 'peek' : 'peek');
        }
      }
    };

    return (
      <motion.div
        className="fixed inset-x-0 z-[100] pointer-events-none"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ 
          type: 'tween', 
          duration: 0.25,
          ease: [0.32, 0.72, 0, 1] // iOS-style easing
        }}
        style={{ bottom: keyboardOffset }}
      >
        <motion.div
          className="rounded-t-md shadow-sm border-t border-border/30 flex flex-col pointer-events-auto w-full max-w-full overflow-x-hidden"
          style={{ background: "hsl(var(--card))", maxHeight: "85vh" }}
          animate={{ height: heightMap[mobileMode] }}
          transition={{ 
            type: 'tween', 
            duration: 0.3,
            ease: [0.32, 0.72, 0, 1]
          }}
          drag="y"
          dragControls={mobileDragControls}
          dragListener={false}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={0.1}
          onDragEnd={handleDragEnd}
        >
            {/* Large Touch Target Drag Handle - iPhone Messages style */}
            <div 
              className="flex flex-col items-center pt-2 pb-3 shrink-0 cursor-grab active:cursor-grabbing select-none"
              style={{ touchAction: 'none' }}
              onPointerDown={(e) => {
                e.preventDefault();
                mobileDragControls.start(e);
              }}
            >
              <div className="w-10 h-1 bg-muted-foreground/30 rounded-full mb-1" />
            </div>

            {/* Header - Fortune 500 clean design */}
            <div className="flex items-center justify-between gap-2 px-4 pb-2 shrink-0" style={{ touchAction: 'manipulation' }}>
              <div className="flex items-center gap-3">
                <TrinityLogo size={28} />
                <div>
                  <h1 className="font-semibold text-base">{TRINITY_BRANDING.displayName}</h1>
                  <p className="text-xs text-muted-foreground">AI Assistant</p>
                </div>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <Button
                  size="icon"
                  variant="ghost"
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
                  onClick={onClose}
                  data-testid="button-close-trinity-modal"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>


            {/* Quick Actions (shown in peek mode) */}
            {mobileMode === 'peek' && (
              <div className="px-4 pb-2 shrink-0">
                <QuickActionGrid actions={quickActions.slice(0, 6)} onExecute={handleQuickAction} />
              </div>
            )}

            {/* Messages (hidden in peek mode) - touch-action prevents drag interference */}
            {mobileMode !== 'peek' && (
              <ScrollArea className="flex-1 px-4 overflow-x-hidden" ref={scrollRef} style={{ touchAction: 'pan-y' }}>
                {messages.length === 0 && !isThinking && (
                  <div className="flex flex-col items-center justify-center text-center py-6">
                    <div className="w-16 h-16 flex items-center justify-center mb-3">
                      <Suspense fallback={<div className="w-16 h-16" />}>
                        <TrinityRedesign size={64} mode="ANALYZING" />
                      </Suspense>
                    </div>
                    <h3 className="font-semibold text-lg mb-1">Ask Trinity Anything</h3>
                    <p className="text-sm text-muted-foreground max-w-xs mb-4">
                      Schedules, payroll, compliance, and workforce intelligence
                    </p>
                    <div className="w-full">
                      <QuickActionGrid actions={quickActions.slice(0, 6)} onExecute={handleQuickAction} />
                    </div>
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
                        <div className="shrink-0 pt-5">
                          <div className="w-8 h-8 flex items-center justify-center">
                            <TrinityLogo size={24} />
                          </div>
                        </div>
                      )}
                      <div className="max-w-[75%] min-w-0 overflow-hidden space-y-1">
                        {/* Sender label */}
                        <p className={cn(
                        "text-[10px] font-medium px-1",
                        msg.role === 'user' ? 'text-right text-muted-foreground' : 'text-left text-primary/70'
                      )}>
                          {msg.role === 'user' ? 'You' : 'Trinity'}
                        </p>
                        <div
                          className={`rounded-md px-3 py-2.5 overflow-hidden ${
                            msg.role === 'user'
                              ? `bg-gradient-to-r ${modeConfig.colors.gradient} text-white rounded-br-sm shadow-sm`
                              : 'bg-muted border border-border/60 rounded-tl-sm'
                          }`}
                        >
                          {msg.images && msg.images.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-1.5">
                              {msg.images.map((img, i) => (
                                <img
                                  key={i}
                                  src={`data:image/jpeg;base64,${img}`}
                                  alt="attached image"
                                  className="w-24 h-24 object-cover rounded-lg"
                                  data-testid={`img-trinity-attachment-${i}`}
                                />
                              ))}
                            </div>
                          )}
                          {msg.role === 'assistant'
                            ? <TrinityMarkdown content={msg.content} />
                            : <p className="text-sm break-words [overflow-wrap:anywhere] leading-relaxed">{msg.content}</p>
                          }
                        </div>
                        {msg.role === 'assistant' && msg.confidence && (
                          <ConfidenceIndicator level={msg.confidence} />
                        )}
                        {msg.role === 'assistant' && msg.usage && (
                          <UsageBlock usage={msg.usage} />
                        )}
                      </div>
                    </div>
                  ))}
                  {isThinking && <ThinkingVisualization steps={thinkingSteps} mode={mode} />}
                </div>
              </ScrollArea>
            )}

            {/* Agent Panel (shown when active - stays visible after execution completes) */}
            {agentModeActive && (agentState.isExecuting || agentState.thinkingSteps.length > 0 || agentState.progress !== null) && (
              <div className="border-t px-4 py-2 shrink-0 max-h-64 overflow-y-auto">
                <TrinityAgentPanel 
                  isExecuting={agentState.isExecuting}
                  thinkingSteps={agentState.thinkingSteps}
                  progress={agentState.progress}
                  businessImpact={agentState.businessImpact}
                  costs={agentState.costs}
                  reversibleActions={agentState.reversibleActions}
                  confidence={agentState.confidence}
                  lastError={agentState.lastError}
                  onUndoAction={agentState.undoAction}
                  showSidebar={false}
                  onToggleSidebar={() => setAgentModeActive(false)}
                />
              </div>
            )}

            {/* Action Broadcast Panel — last 5 Trinity actions */}
            {messages.some(m => m.role === 'assistant') && (
              <ActionBroadcastPanel messages={messages} />
            )}

            {/* Input Area - Clean, minimal design */}
            <div className="px-3 py-2.5 border-t bg-card/50 shrink-0 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
              {/* Pending image previews */}
              {pendingImages.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {pendingImages.map((img, i) => (
                    <div key={i} className="relative" data-testid={`img-pending-attachment-${i}`}>
                      <img
                        src={`data:image/jpeg;base64,${img}`}
                        alt="pending upload"
                        className="w-14 h-14 object-cover rounded-md"
                      />
                      <button
                        type="button"
                        onClick={() => setPendingImages(prev => prev.filter((_, idx) => idx !== i))}
                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive flex items-center justify-center"
                        data-testid={`button-remove-attachment-${i}`}
                      >
                        <XIcon className="w-2.5 h-2.5 text-destructive-foreground" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="relative">
                <AnimatePresence>
                  <CommandSuggestions
                    query={inputValue}
                    actions={quickActions}
                    onSelect={handleQuickAction}
                    onClearInput={() => setInputValue('')}
                    visible={inputValue.length >= 2}
                  />
                </AnimatePresence>
                <div className="flex gap-1.5 items-center">
                  {/* Hidden file input */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleImageSelect}
                    data-testid="input-image-file-mobile"
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={chatMutation.isPending || pendingImages.length >= 5}
                    className="shrink-0 rounded-md"
                    data-testid="button-attach-image-mobile"
                  >
                    <Paperclip className="h-4 w-4 text-muted-foreground" />
                  </Button>
                  <Input
                    ref={inputRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Ask me anything..."
                    disabled={chatMutation.isPending}
                    className="flex-1 rounded-md text-sm"
                    data-testid="input-trinity-message"
                  />
                  <Button
                    onClick={handleSend}
                    disabled={(!inputValue.trim() && pendingImages.length === 0) || chatMutation.isPending}
                    size="icon"
                    className="bg-primary hover:bg-primary/90 rounded-md shrink-0"
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
              <p className="text-center text-[9px] text-muted-foreground mt-1.5">
                Powered by Trinity AI
              </p>
            </div>
        </motion.div>
      </motion.div>
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
        <div className="w-14 h-14 flex items-center justify-center">
          <Suspense fallback={<div className="w-14 h-14" />}>
            <TrinityRedesign size={56} mode="ANALYZING" />
          </Suspense>
          {messages.length > 0 && (
            <div className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-primary-foreground rounded-full text-xs flex items-center justify-center">
              {messages.length}
            </div>
          )}
        </div>
      </motion.div>
    );
  }

  // DESKTOP - Full floating window with frosted glass effect
  return (
    <Card
          className="fixed z-[100] w-[420px] shadow-sm rounded-md border border-border/50 bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl flex flex-col"
          style={{
            left: position.x,
            top: position.y,
            maxHeight: 'calc(100vh - 100px)',
          }}
          data-testid="trinity-modal-desktop"
        >
          <CardHeader
            className="flex flex-row items-center gap-3 py-4 px-4 border-b cursor-move select-none shrink-0"
            onMouseDown={handleMouseDown}
          >
            <GripHorizontal className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <TrinityLogo size={32} />
              <div>
                <CardTitle className="text-base font-semibold">{TRINITY_BRANDING.displayName}</CardTitle>
                <p className="text-xs text-muted-foreground">AI Assistant</p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setIsMinimized(true)}
                title="Minimize"
                data-testid="button-minimize-trinity"
              >
                <Minimize2 className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={onClose}
                title="Close"
                data-testid="button-close-trinity-modal"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>

          <CardContent className="p-0 flex flex-col min-h-0 flex-1">
            {/* Messages */}
            <ScrollArea className="flex-1 min-h-[200px] max-h-[350px] px-4 pt-3" ref={scrollRef}>
              {messages.length === 0 && !isThinking && (
                <div className="flex flex-col items-center justify-center text-center py-4">
                  <h3 className="font-semibold text-lg mb-1">Ask Trinity Anything</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Schedules, invoices, reports, and more
                  </p>
                  <div className="w-full">
                    <QuickActionGrid actions={quickActions.slice(0, 6)} onExecute={handleQuickAction} />
                  </div>
                </div>
              )}
              <div className="space-y-3 pb-3">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex gap-2.5",
                      msg.role === 'user' ? 'justify-end' : 'justify-start'
                    )}
                  >
                    {/* Trinity Avatar for assistant messages */}
                    {msg.role === 'assistant' && (
                      <div className="shrink-0 pt-5">
                        <div className="w-7 h-7 flex items-center justify-center">
                          <TrinityLogo size={24} />
                        </div>
                      </div>
                    )}
                    <div className="max-w-[80%] min-w-0 space-y-1">
                      {/* Sender label */}
                      <p className={cn(
                        "text-[10px] font-medium px-1",
                        msg.role === 'user' ? 'text-right text-muted-foreground' : 'text-left text-primary/70'
                      )}>
                        {msg.role === 'user' ? 'You' : 'Trinity'}
                      </p>
                      <div
                        className={`rounded-md px-3 py-2.5 overflow-hidden ${
                          msg.role === 'user'
                            ? `bg-gradient-to-r ${modeConfig.colors.gradient} text-white rounded-br-sm shadow-sm`
                            : 'bg-muted border border-border/60 rounded-tl-sm'
                        }`}
                      >
                        {msg.images && msg.images.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-1.5">
                            {msg.images.map((img, i) => (
                              <img
                                key={i}
                                src={`data:image/jpeg;base64,${img}`}
                                alt="attached image"
                                className="w-20 h-20 object-cover rounded-lg"
                                data-testid={`img-trinity-attachment-desktop-${i}`}
                              />
                            ))}
                          </div>
                        )}
                        {msg.role === 'assistant'
                          ? <TrinityMarkdown content={msg.content} />
                          : <p className="text-sm break-words [overflow-wrap:anywhere] leading-relaxed">{msg.content}</p>
                        }
                      </div>
                      {msg.role === 'assistant' && msg.confidence && (
                        <ConfidenceIndicator level={msg.confidence} />
                      )}
                      {msg.role === 'assistant' && msg.usage && (
                        <UsageBlock usage={msg.usage} />
                      )}
                    </div>
                  </div>
                ))}
                {isThinking && <ThinkingVisualization steps={thinkingSteps} mode={mode} />}
              </div>
            </ScrollArea>

            {/* Trinity Action History — collapsible between messages and input */}
            <div className="border-t shrink-0">
              <TrinityActionHistoryPanel compact />
            </div>

            {/* Action Broadcast Panel — last 5 Trinity actions */}
            {messages.some(m => m.role === 'assistant') && (
              <ActionBroadcastPanel messages={messages} />
            )}

            {/* Input Area - Fortune 500 polished design */}
            <div className="p-4 border-t shrink-0">
              {/* Pending image previews */}
              {pendingImages.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {pendingImages.map((img, i) => (
                    <div key={i} className="relative" data-testid={`img-pending-attachment-desktop-${i}`}>
                      <img
                        src={`data:image/jpeg;base64,${img}`}
                        alt="pending upload"
                        className="w-14 h-14 object-cover rounded-md"
                      />
                      <button
                        type="button"
                        onClick={() => setPendingImages(prev => prev.filter((_, idx) => idx !== i))}
                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive flex items-center justify-center"
                        data-testid={`button-remove-attachment-desktop-${i}`}
                      >
                        <XIcon className="w-2.5 h-2.5 text-destructive-foreground" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="relative">
                <AnimatePresence>
                  <CommandSuggestions
                    query={inputValue}
                    actions={quickActions}
                    onSelect={handleQuickAction}
                    onClearInput={() => setInputValue('')}
                    visible={inputValue.length >= 2 && messages.length === 0}
                  />
                </AnimatePresence>
                <div className="flex gap-2 items-center">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={chatMutation.isPending || pendingImages.length >= 5}
                    className="shrink-0 rounded-md"
                    data-testid="button-attach-image-desktop"
                  >
                    <Paperclip className="h-4 w-4 text-muted-foreground" />
                  </Button>
                  <Input
                    ref={inputRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Ask me anything..."
                    disabled={chatMutation.isPending}
                    className="flex-1 rounded-md bg-muted/50 focus:bg-background"
                    data-testid="input-trinity-message"
                  />
                  <div className="relative shrink-0">
                    {isListening && (
                      <span
                        className="absolute inset-0 rounded-md animate-ping"
                        style={{ backgroundColor: "rgba(239,68,68,0.35)" }}
                        aria-hidden="true"
                      />
                    )}
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => setIsListening((v) => !v)}
                      className={cn(
                        "rounded-md relative",
                        isListening && "ring-2 ring-red-500"
                      )}
                      aria-label={isListening ? "Stop voice input" : "Start voice input"}
                      aria-pressed={isListening}
                      data-testid="button-voice-input-trinity"
                    >
                      <Mic className={cn("h-4 w-4", isListening ? "text-red-500" : "text-muted-foreground")} />
                    </Button>
                  </div>
                  <Button
                    onClick={handleSend}
                    disabled={(!inputValue.trim() && pendingImages.length === 0) || chatMutation.isPending}
                    size="icon"
                    className="bg-primary hover:bg-primary/90 rounded-md"
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
              <p className="text-center text-[10px] text-muted-foreground mt-3">
                Powered by Trinity AI
              </p>
            </div>
          </CardContent>
        </Card>
  );
}

export default TrinityModal;
