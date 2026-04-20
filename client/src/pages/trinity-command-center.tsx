/**
 * TRINITY COMMAND CENTER (TCC) - Universal Cognitive Command Center
 * 
 * Fortune 500-grade Trinity™ orchestration interface with:
 * - Natural language & voice command interface with Trinity
 * - RBAC-based Quick Actions (role-gated tools)
 * - Real-time AI output panels with dynamic reports
 * - Subagent testing and hotfix deployment
 * - Mobile-first responsive design
 * - Integration with orchestration hierarchy
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { 
  Brain, 
  Send, 
  Mic,
  MicOff,
  Activity, 
  CheckCircle, 
  XCircle,
  AlertTriangle,
  AlertCircle,
  Zap,
  Shield,
  Settings,
  Play,
  Pause,
  RotateCcw,
  Wrench,
  Terminal,
  FileText,
  Users,
  Calendar,
  Clock,
  Eye,
  Lock,
  Unlock,
  ChevronRight,
  ChevronDown,
  BarChart3,
  TrendingUp,
  Bot,
  Sparkles,
  RefreshCw,
  Command,
  Loader2,
  Menu,
  X,
  Maximize2,
  Minimize2,
  MessageSquare,
  Ticket,
  HelpCircle,
  Database,
  Server,
  Cpu,
  ListChecks,
  FileSearch,
  Bug,
  TestTube,
  Gauge,
  Target,
  DollarSign,
  CreditCard,
  BellRing
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { isSupportStaff } from "@/components/support-staff-route";
import { QuickBooksCompliancePanel } from "@/components/quickbooks-compliance-panel";

// ============================================================================
// TYPES
// ============================================================================

interface TrinityMessage {
  id: string;
  role: 'user' | 'trinity' | 'system';
  content: string;
  timestamp: Date;
  actionId?: string;
  executionTimeMs?: number;
  success?: boolean;
  data?: any;
  outputType?: 'text' | 'chart' | 'table' | 'report' | 'simulation' | 'evolution';
  // Frontier capability metadata
  frontierCapability?: 'hire_agent' | 'predict_frustration' | 'run_simulation' | 'check_ethics' | 'propose_evolution';
  collaboratorJoined?: string; // External agent name when hired
  complianceVerified?: { passed: boolean; guardrails: string[]; }; // Ethics check result
  evolutionLog?: { before: string; after: string; reason: string; }; // Evolution diff
  simulationResults?: { bottleneck: string; recommendation: string; confidence: number; }; // Digital Twin results
}

// Frontier capability mode toggle
type TrinityMode = 'diagnostic' | 'strategic_guru';

interface QuickAction {
  id: string;
  name: string;
  icon: string;
  category: 'hotfix' | 'subagent' | 'report' | 'system' | 'meeting' | 'ticket';
  description: string;
  requiredRole: 'employee' | 'manager' | 'admin' | 'super_admin' | 'root';
  riskLevel: 'safe' | 'moderate' | 'elevated' | 'critical';
  actionId: string;
  enabled: boolean;
}

interface ReportItem {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress?: number;
  lastRun?: string;
}

interface RoleStatus {
  role: string;
  displayName: string;
  permissionLevel: number;
  allowedCategories: string[];
  restricted: boolean;
}

interface ServiceStatus {
  name: string;
  status: 'running' | 'paused' | 'stopped' | 'error';
  health: 'healthy' | 'degraded' | 'unhealthy';
  lastCheck: string;
}

// ============================================================================
// RBAC CONFIGURATION
// ============================================================================

const ROLE_HIERARCHY: Record<string, RoleStatus> = {
  employee: {
    role: 'employee',
    displayName: 'Employee',
    permissionLevel: 1,
    allowedCategories: ['report'],
    restricted: true
  },
  support: {
    role: 'support',
    displayName: 'Support',
    permissionLevel: 2,
    allowedCategories: ['report', 'ticket'],
    restricted: true
  },
  manager: {
    role: 'manager',
    displayName: 'Manager',
    permissionLevel: 3,
    allowedCategories: ['report', 'ticket', 'meeting'],
    restricted: true
  },
  admin: {
    role: 'admin',
    displayName: 'Admin',
    permissionLevel: 4,
    allowedCategories: ['report', 'ticket', 'meeting', 'subagent', 'system'],
    restricted: true
  },
  super_admin: {
    role: 'super_admin',
    displayName: 'Super Admin',
    permissionLevel: 5,
    allowedCategories: ['report', 'ticket', 'meeting', 'subagent', 'system', 'hotfix'],
    restricted: true
  },
  root: {
    role: 'root',
    displayName: 'Root',
    permissionLevel: 9,
    allowedCategories: ['report', 'ticket', 'meeting', 'subagent', 'system', 'hotfix'],
    restricted: false
  }
};

const QUICK_ACTIONS: QuickAction[] = [
  // Safe actions (all roles)
  { id: 'view-logs', name: 'View Logs', icon: 'FileSearch', category: 'report', description: 'View system logs', requiredRole: 'employee', riskLevel: 'safe', actionId: 'logs.view', enabled: true },
  { id: 'my-schedule', name: 'My Schedule', icon: 'Calendar', category: 'report', description: 'View your schedule', requiredRole: 'employee', riskLevel: 'safe', actionId: 'scheduling.get_my_schedule', enabled: true },
  
  // Manager actions
  { id: 'team-report', name: 'Team Report', icon: 'Users', category: 'report', description: 'Generate team performance report', requiredRole: 'manager', riskLevel: 'safe', actionId: 'analytics.team_report', enabled: true },
  { id: 'timesheet-review', name: 'Timesheet Review', icon: 'Clock', category: 'report', description: 'Review pending timesheets', requiredRole: 'manager', riskLevel: 'safe', actionId: 'time_tracking.review', enabled: true },
  
  // Admin actions
  { id: 'test-subagent', name: 'Test Subagent', icon: 'TestTube', category: 'subagent', description: 'Run subagent diagnostic tests', requiredRole: 'admin', riskLevel: 'moderate', actionId: 'diagnostics.domain_scan', enabled: true },
  { id: 'system-health', name: 'System Health', icon: 'Activity', category: 'system', description: 'Check platform health status', requiredRole: 'admin', riskLevel: 'safe', actionId: 'health.self_check', enabled: true },
  { id: 'view-tickets', name: 'View Tickets', icon: 'Ticket', category: 'ticket', description: 'View support tickets', requiredRole: 'admin', riskLevel: 'safe', actionId: 'tickets.list', enabled: true },
  
  // Super Admin actions
  { id: 'deploy-hotfix', name: 'Deploy Hotfix', icon: 'Wrench', category: 'hotfix', description: 'Deploy emergency hotfix', requiredRole: 'super_admin', riskLevel: 'elevated', actionId: 'diagnostics.execute_hotpatch', enabled: true },
  { id: 'restart-service', name: 'Restart Service', icon: 'RefreshCw', category: 'system', description: 'Restart a platform service', requiredRole: 'super_admin', riskLevel: 'elevated', actionId: 'system.restart_service', enabled: true },
  { id: 'run-diagnostics', name: 'Full Diagnostics', icon: 'Bug', category: 'subagent', description: 'Run full platform diagnostics', requiredRole: 'super_admin', riskLevel: 'moderate', actionId: 'diagnostics.full_scan', enabled: true },
  
  // Root-only actions
  { id: 'db-maintenance', name: 'DB Maintenance', icon: 'Database', category: 'system', description: 'Run database maintenance', requiredRole: 'root', riskLevel: 'critical', actionId: 'system.db_maintenance', enabled: true },
  { id: 'force-sync', name: 'Force Sync', icon: 'RotateCcw', category: 'system', description: 'Force sync all services', requiredRole: 'root', riskLevel: 'critical', actionId: 'system.force_sync', enabled: true },
];

const ICON_MAP: Record<string, any> = {
  FileSearch, Calendar, Users, Clock, TestTube, Activity, Ticket, Wrench, 
  RefreshCw, Bug, Database, RotateCcw, Brain, Zap, Shield, Settings,
  BarChart3, TrendingUp, Gauge, Target, DollarSign, CreditCard, BellRing
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getActionIcon(iconName: string) {
  return ICON_MAP[iconName] || Zap;
}

function getRiskBadgeClass(risk: string) {
  switch (risk) {
    case 'safe': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
    case 'moderate': return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
    case 'elevated': return 'bg-orange-500/10 text-orange-400 border-orange-500/30';
    case 'critical': return 'bg-red-500/10 text-red-400 border-red-500/30';
    default: return 'bg-slate-500/10 text-slate-400 border-slate-500/30';
  }
}

function canUserAccessAction(userRole: string, requiredRole: string): boolean {
  const userLevel = ROLE_HIERARCHY[userRole]?.permissionLevel || 0;
  const requiredLevel = ROLE_HIERARCHY[requiredRole]?.permissionLevel || 999;
  return userLevel >= requiredLevel;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function TrinityCommandCenter() {
  const { toast } = useToast();
  
  // State
  const [messages, setMessages] = useState<TrinityMessage[]>([
    {
      id: '1',
      role: 'trinity',
      content: "Welcome to Trinity Command Center. I'm your Trinity™ assistant with access to the full orchestration hierarchy. I can help you run diagnostics, deploy hotfixes, test subagents, generate reports, and execute platform operations. How can I assist you today?",
      timestamp: new Date(),
      outputType: 'text'
    }
  ]);
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedTab, setSelectedTab] = useState('chat');
  const [selectedAction, setSelectedAction] = useState<QuickAction | null>(null);
  const [showActionDialog, setShowActionDialog] = useState(false);
  const [actionNotes, setActionNotes] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isOutputExpanded, setIsOutputExpanded] = useState(false);
  const [trinityMode, setTrinityMode] = useState<TrinityMode>('diagnostic');
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Queries
  const { data: userData } = useQuery<{ id: string; role?: string; platformRole?: string }>({
    queryKey: ['/api/auth/me'],
  });

  const { data: orchestrationHealth, refetch: refetchOrchestration } = useQuery<{
    overall: 'healthy' | 'degraded' | 'unhealthy';
    services: ServiceStatus[];
    summary: { runningServices: number; pausedServices: number; errorServices: number; totalServices: number };
  }>({
    queryKey: ['/api/ai-brain/control/health'],
    refetchInterval: 15000,
  });

  const { data: actionsData } = useQuery<{ actions: any[] }>({
    queryKey: ['/api/helpai/orchestrator/actions'],
  });

  const { data: creditsData } = useQuery<{ balance: number; used: number; limit: number }>({
    queryKey: ['/api/usage/tokens'],
  });

  const { data: reportsData } = useQuery<{ reports: ReportItem[] }>({
    queryKey: ['/api/ai-brain/reports'],
  });

  const { data: subagentsData } = useQuery<{ subagents: any[] }>({
    queryKey: ['/api/subagent/list'],
  });

  // Derived state
  const userRole = userData?.platformRole || userData?.role || 'employee';
  const roleStatus = ROLE_HIERARCHY[userRole] || ROLE_HIERARCHY.employee;
  const availableActions = QUICK_ACTIONS.filter(action => 
    canUserAccessAction(userRole, action.requiredRole) && action.enabled
  );
  
  // Only support staff can use the full chat interface
  // Regular org owners only see Quick Actions based on their business
  // userRole already has the fallback: platformRole || role || 'employee'
  const canUseChat = isSupportStaff(userRole);

  // Frontier diagnostics query - must be after canUseChat is defined
  const { data: frontierDiagnostics, refetch: refetchDiagnostics } = useQuery<{
    success: boolean;
    data: {
      capabilities: { id: string; name: string; enabled: boolean; }[];
      checks: { name: string; status: string; error?: string; result?: string; bottlenecksFound?: number; }[];
    };
    message: string;
  }>({
    queryKey: ['/api/helpai/orchestrator/execute', 'frontier.run_diagnostics'],
    queryFn: async () => {
      const res = await apiRequest('POST', '/api/helpai/orchestrator/execute', {
        actionId: 'frontier.run_diagnostics',
        payload: { source: 'command_center' }
      });
      return res.json();
    },
    refetchInterval: 60000,
    enabled: canUseChat,
  });

  // Auto-scroll chat
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Send message mutation
  const sendMessage = useMutation({
    mutationFn: async (message: string) => {
      const res = await apiRequest('POST', '/api/trinity/command', { 
        message,
        context: {
          role: userRole,
          source: 'command_center',
          mode: trinityMode
        }
      });
      return res.json();
    },
    onSuccess: (data) => {
      const trinityResponse: TrinityMessage = {
        id: Date.now().toString(),
        role: 'trinity',
        content: data.response || data.message || 'Command executed.',
        timestamp: new Date(),
        actionId: data.actionId,
        executionTimeMs: data.executionTimeMs,
        success: data.success !== false,
        data: data.data,
        outputType: data.outputType || 'text',
        frontierCapability: data.frontierCapability,
        collaboratorJoined: data.collaboratorJoined,
        complianceVerified: data.complianceVerified,
        evolutionLog: data.evolutionLog,
        simulationResults: data.simulationResults
      };
      setMessages(prev => [...prev, trinityResponse]);
      setIsProcessing(false);
    },
    onError: (error: any) => {
      const errorMessage: TrinityMessage = {
        id: Date.now().toString(),
        role: 'system',
        content: `Error: ${error.message || 'Command failed'}`,
        timestamp: new Date(),
        success: false
      };
      setMessages(prev => [...prev, errorMessage]);
      setIsProcessing(false);
      toast({ title: "Command failed", description: error.message, variant: "destructive" });
    }
  });

  // Execute quick action mutation
  const executeAction = useMutation({
    mutationFn: async ({ actionId, payload }: { actionId: string; payload?: any }) => {
      const res = await apiRequest('POST', '/api/helpai/orchestrator/execute', { 
        actionId,
        payload: {
          ...payload,
          notes: actionNotes,
          source: 'command_center'
        }
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Action executed", description: data.message || "Success" });
      setShowActionDialog(false);
      setSelectedAction(null);
      setActionNotes('');
      
      // Add to chat
      const actionMessage: TrinityMessage = {
        id: Date.now().toString(),
        role: 'trinity',
        content: `Action completed: ${data.message || 'Success'}`,
        timestamp: new Date(),
        actionId: selectedAction?.actionId,
        executionTimeMs: data.executionTimeMs,
        success: true,
        data: data.data,
        outputType: data.outputType || 'text'
      };
      setMessages(prev => [...prev, actionMessage]);
    },
    onError: (error: any) => {
      toast({ title: "Action failed", description: error.message, variant: "destructive" });
    }
  });

  // Handle send
  const handleSend = useCallback(() => {
    // Defensive check: prevent non-support users from sending chat messages
    if (!canUseChat) return;
    if (!input.trim() || isProcessing) return;
    
    const userMessage: TrinityMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsProcessing(true);
    sendMessage.mutate(input.trim());
  }, [input, isProcessing, sendMessage, canUseChat]);

  // Handle voice input toggle
  const toggleVoice = useCallback(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      setIsListening(!isListening);
      toast({ 
        title: isListening ? "Voice input stopped" : "Listening...",
        description: isListening ? "" : "Speak your command"
      });
    } else {
      toast({ title: "Voice not supported", description: "Your browser doesn't support voice input", variant: "destructive" });
    }
  }, [isListening, toast]);

  // Handle action click
  const handleActionClick = (action: QuickAction) => {
    if (action.riskLevel === 'critical' && userRole !== 'root') {
      toast({ title: "Access denied", description: "Only root users can execute critical actions", variant: "destructive" });
      return;
    }
    setSelectedAction(action);
    setActionNotes('');
    setShowActionDialog(true);
  };

  // Handle action confirm
  const handleActionConfirm = () => {
    if (!selectedAction) return;
    executeAction.mutate({ actionId: selectedAction.actionId, payload: { actionNotes } });
  };

  return (
    <div className="flex flex-col h-full bg-slate-950">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-700/50 px-4 py-3 lg:px-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Mobile menu */}
            <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
              <SheetTrigger asChild className="lg:hidden">
                <Button variant="ghost" size="icon" className="text-slate-300 hover:text-white hover:bg-slate-800">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="bg-slate-900 border-slate-700 w-80">
                <SheetHeader>
                  <SheetTitle className="text-white flex items-center gap-2">
                    <Brain className="w-5 h-5 text-cyan-400" />
                    Trinity Command
                  </SheetTitle>
                </SheetHeader>
                <div className="mt-6 space-y-4">
                  <MobileQuickActions 
                    actions={availableActions} 
                    onAction={(action) => {
                      setIsMobileMenuOpen(false);
                      handleActionClick(action);
                    }}
                    userRole={userRole}
                  />
                </div>
              </SheetContent>
            </Sheet>
            
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-400 via-cyan-500 to-blue-500 flex items-center justify-center shadow-lg shadow-cyan-500/20">
                <Brain className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">Trinity Command Center</h1>
                <p className="text-xs text-slate-400 hidden sm:block">Trinity™ Orchestration</p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Role badge */}
            <Badge className={`hidden sm:flex ${roleStatus.restricted ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'}`}>
              {roleStatus.displayName}
            </Badge>
            
            {/* Health status */}
            <Badge 
              className={`${
                orchestrationHealth?.overall === 'healthy' 
                  ? 'bg-emerald-500/10 text-emerald-400' 
                  : orchestrationHealth?.overall === 'degraded'
                  ? 'bg-amber-500/10 text-amber-400'
                  : 'bg-red-500/10 text-red-400'
              }`}
              data-testid="badge-health-status"
            >
              <Activity className="w-3 h-3 mr-1" />
              {orchestrationHealth?.overall || 'Unknown'}
            </Badge>
            
            {/* Credit balance */}
            {creditsData && (
              <Badge className="bg-purple-500/10 text-purple-400 border-purple-500/30 hidden lg:flex">
                <Zap className="w-3 h-3 mr-1" />
                {creditsData.balance?.toLocaleString() || 0}
              </Badge>
            )}
          </div>
        </div>
      </header>

      {/* Main Content - Split Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Trinity AI Output (Desktop only, Support Staff only) */}
        {canUseChat && (
          <div className={`hidden lg:flex flex-col w-[55%] border-r border-slate-700/50 ${isOutputExpanded ? 'lg:w-[70%]' : ''}`}>
            {/* Output Header with Frontier Mode Toggle */}
            <div className="bg-slate-900/50 border-b border-slate-700/50 px-4 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                <span className="text-sm font-medium text-white">Trinity AI Output</span>
                <span className="text-xs text-slate-400">/ {trinityMode === 'strategic_guru' ? 'Strategic Guru' : 'Diagnostic'}</span>
              </div>
              <div className="flex items-center gap-3">
                {/* Frontier Mode Toggle */}
                <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-slate-800/50 border border-slate-700">
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`h-6 px-2 text-xs ${trinityMode === 'diagnostic' ? 'bg-cyan-500/20 text-cyan-400' : 'text-slate-400 hover:text-white'}`}
                    onClick={() => setTrinityMode('diagnostic')}
                    data-testid="button-mode-diagnostic"
                  >
                    <Bug className="w-3 h-3 mr-1" />
                    Diagnostic
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`h-6 px-2 text-xs ${trinityMode === 'strategic_guru' ? 'bg-purple-500/20 text-purple-400' : 'text-slate-400 hover:text-white'}`}
                    onClick={() => setTrinityMode('strategic_guru')}
                    data-testid="button-mode-guru"
                  >
                    <Sparkles className="w-3 h-3 mr-1" />
                    Guru Mode
                  </Button>
                </div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-7 w-7 text-slate-400 hover:text-white"
                  onClick={() => setIsOutputExpanded(!isOutputExpanded)}
                >
                  {isOutputExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </Button>
              </div>
            </div>
            
            {/* Chat Messages */}
            <ScrollArea className="flex-1 p-4" ref={scrollRef}>
              <div className="space-y-4">
                {messages.map((msg) => (
                  <MessageBubble key={msg.id} message={msg} />
                ))}
                {isProcessing && (
                  <div className="flex items-center gap-2 text-cyan-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Trinity is thinking...</span>
                  </div>
                )}
              </div>
            </ScrollArea>
            
            {/* Token Usage Footer */}
            <div className="border-t border-slate-700/50 px-4 py-2 bg-slate-900/30">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>
                  Tokens Used: <span className="text-cyan-400 font-mono">{(creditsData?.used || 0).toLocaleString()}</span>
                  {' | '}
                  Cost: <span className="text-emerald-400 font-mono">${((creditsData?.used || 0) * 0.0001).toFixed(2)}</span>
                </span>
                <span>Last Action: {messages[messages.length - 1]?.executionTimeMs ? `${messages[messages.length - 1].executionTimeMs}ms ago` : 'N/A'}</span>
              </div>
            </div>
          </div>
        )}

        {/* Right Panel - Command & Control */}
        <div className={`flex-1 flex flex-col ${canUseChat ? (isOutputExpanded ? 'lg:w-[30%]' : 'lg:w-[45%]') : 'w-full'}`}>
          {/* Mobile Chat (shown on mobile, Support Staff only) */}
          {canUseChat && (
            <div className="lg:hidden flex-1 flex flex-col">
              <ScrollArea className="flex-1 p-4" ref={scrollRef}>
                <div className="space-y-4">
                  {messages.map((msg) => (
                    <MessageBubble key={msg.id} message={msg} />
                  ))}
                  {isProcessing && (
                    <div className="flex items-center gap-2 text-cyan-400">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm">Processing...</span>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Command & Control Panel */}
          <div className="bg-slate-900/50 border-t lg:border-t-0 lg:border-l border-slate-700/50 p-4 space-y-4">
            {/* Chat Input - Support Staff Only */}
            {canUseChat ? (
              <div className="space-y-2">
                <Label className="text-slate-300 text-xs">Talk to Trinity...</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                      placeholder="Enter command or ask a question..."
                      className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 pr-10"
                      data-testid="input-trinity-command"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 ${isListening ? 'text-red-400' : 'text-slate-400 hover:text-white'}`}
                      onClick={toggleVoice}
                      data-testid="button-voice-input"
                    >
                      {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    </Button>
                  </div>
                  <Button 
                    onClick={handleSend}
                    disabled={!input.trim() || isProcessing}
                    className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600"
                    data-testid="button-send-command"
                  >
                    {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-slate-300">
                  <Brain className="w-5 h-5 text-cyan-400" />
                  <span className="font-medium">Trinity Quick Actions</span>
                </div>
                <p className="text-xs text-slate-400">
                  Use the quick actions below to run AI-powered tasks for your organization.
                </p>
              </div>
            )}

            {canUseChat && <Separator className="bg-slate-700/50" />}

            {/* Quick Actions Grid */}
            <div className={`space-y-2 ${canUseChat ? 'hidden lg:block' : 'block'}`}>
              <Label className="text-slate-300 text-xs">Quick Actions</Label>
              <div className={`grid gap-2 ${canUseChat ? 'grid-cols-4' : 'grid-cols-3 md:grid-cols-4 lg:grid-cols-6'}`}>
                {availableActions.slice(0, canUseChat ? 12 : 18).map((action) => {
                  const Icon = getActionIcon(action.icon);
                  return (
                    <Button
                      key={action.id}
                      variant="outline"
                      size="sm"
                      className={`flex flex-col h-auto py-2 px-2 bg-slate-800/50 border-slate-700 hover:bg-slate-700 hover:border-cyan-500/50 text-slate-300 hover:text-white ${!canUseChat ? 'py-3' : ''}`}
                      onClick={() => handleActionClick(action)}
                      data-testid={`button-action-${action.id}`}
                    >
                      <Icon className={`mb-1 ${canUseChat ? 'w-4 h-4' : 'w-5 h-5'}`} />
                      <span className={`leading-tight text-center ${canUseChat ? 'text-[10px]' : 'text-xs'}`}>{action.name}</span>
                    </Button>
                  );
                })}
              </div>
            </div>

            {canUseChat && <Separator className="bg-slate-700/50 hidden lg:block" />}

            {/* Reports - Support Staff Only */}
            {canUseChat && (
              <div className="space-y-2 hidden lg:block">
                <Label className="text-slate-300 text-xs">Reports</Label>
                <div className="space-y-2">
                  <ReportRow 
                    name="Payroll Report" 
                    status="completed" 
                    onClick={() => handleActionClick({ ...QUICK_ACTIONS[0], name: 'Payroll Report', actionId: 'payroll.report' })}
                  />
                  <ReportRow 
                    name="Team Approvals" 
                    status="pending" 
                    progress={67}
                    onClick={() => handleActionClick({ ...QUICK_ACTIONS[0], name: 'Team Approvals', actionId: 'approvals.pending' })}
                  />
                </div>
              </div>
            )}

            <Separator className="bg-slate-700/50" />

            {/* Role Status */}
            <div className="space-y-2">
              <Label className="text-slate-300 text-xs">Role Status</Label>
              <Card className="bg-slate-800/50 border-slate-700">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${roleStatus.restricted ? 'bg-cyan-400' : 'bg-red-400'}`} />
                    <span className="text-sm text-white">{roleStatus.displayName}</span>
                    {roleStatus.restricted ? (
                      <Lock className="w-3 h-3 text-slate-400 ml-auto" />
                    ) : (
                      <Unlock className="w-3 h-3 text-red-400 ml-auto" />
                    )}
                  </div>
                  <p className="text-xs text-slate-400">
                    {roleStatus.restricted 
                      ? `Access: ${roleStatus.allowedCategories.join(', ')}`
                      : 'Full unrestricted access'}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* System Approved Quick Access - Support Staff Only */}
            {canUseChat && (
              <div className="space-y-2">
                <Label className="text-slate-300 text-xs">System Approved</Label>
                <div className="space-y-1">
                  <QuickAccessRow 
                    icon={<Gauge className="w-4 h-4" />}
                    label="Recent Inbox"
                    onClick={() => setInput('/inbox recent')}
                  />
                  <QuickAccessRow 
                    icon={<Settings className="w-4 h-4" />}
                    label="Open Functionality"
                    onClick={() => setInput('/help features')}
                  />
                  <QuickAccessRow 
                    icon={<Activity className="w-4 h-4" />}
                    label="Recent Activity"
                    onClick={() => setInput('/activity recent')}
                  />
                </div>
              </div>
            )}

            {/* Trinity System Issues - Support Staff Only */}
            {canUseChat && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-slate-300 text-xs flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-amber-400" />
                    System Issues
                  </Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1.5 text-[10px] text-cyan-400 hover:text-white"
                    onClick={() => refetchDiagnostics()}
                    data-testid="button-refresh-diagnostics"
                  >
                    <RefreshCw className="w-3 h-3 mr-1" />
                    Scan
                  </Button>
                </div>
                <Card className="bg-slate-800/50 border-slate-700">
                  <CardContent className="p-2 space-y-1.5">
                    {frontierDiagnostics?.data?.checks ? (
                      frontierDiagnostics.data.checks
                        .filter(c => c.status !== 'operational' || c.bottlenecksFound)
                        .map((check, idx) => (
                          <div 
                            key={idx}
                            className={`flex items-center justify-between p-1.5 rounded text-xs ${
                              check.status !== 'operational' 
                                ? 'bg-red-500/10 border border-red-500/30' 
                                : 'bg-amber-500/10 border border-amber-500/30'
                            }`}
                          >
                            <div className="flex items-center gap-1.5">
                              {check.status !== 'operational' ? (
                                <XCircle className="w-3 h-3 text-red-400" />
                              ) : (
                                <AlertTriangle className="w-3 h-3 text-amber-400" />
                              )}
                              <span className={check.status !== 'operational' ? 'text-red-300' : 'text-amber-300'}>
                                {check.name}
                              </span>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 px-1.5 text-[10px] text-cyan-400 hover:text-white"
                              onClick={() => {
                                setInput(`Trinity, fix the ${check.name} issue: ${check.error || 'bottleneck detected'}`);
                                inputRef.current?.focus();
                              }}
                              data-testid={`button-fix-issue-${idx}`}
                            >
                              Fix
                            </Button>
                          </div>
                        ))
                    ) : null}
                    {(!frontierDiagnostics?.data?.checks || 
                      frontierDiagnostics.data.checks.every(c => c.status === 'operational' && !c.bottlenecksFound)) && (
                      <div className="flex items-center gap-1.5 p-1.5 text-xs text-emerald-400">
                        <CheckCircle className="w-3 h-3" />
                        All systems operational
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
            
            {/* QuickBooks Compliance Telemetry - Guru Mode Only */}
            {canUseChat && trinityMode === 'strategic_guru' && (
              <div className="space-y-2">
                <QuickBooksCompliancePanel />
              </div>
            )}
            
            {/* Org Owner Info */}
            {!canUseChat && (
              <div className="mt-4 p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-full bg-cyan-500/10">
                    <Shield className="w-4 h-4 text-cyan-400" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-300 font-medium">Copilot Automation</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Trinity handles 99% of operations automatically. Critical actions require your approval to ensure legal safety and compliance.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Action Confirmation Dialog */}
      <Dialog open={showActionDialog} onOpenChange={setShowActionDialog}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedAction && (
                <>
                  {(() => { const Icon = getActionIcon(selectedAction.icon); return <Icon className="w-5 h-5 text-cyan-400" />; })()}
                  {selectedAction.name}
                </>
              )}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {selectedAction?.description}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-300">Risk Level:</span>
              <Badge className={getRiskBadgeClass(selectedAction?.riskLevel || 'safe')}>
                {selectedAction?.riskLevel?.toUpperCase()}
              </Badge>
            </div>
            
            <div className="space-y-2">
              <Label className="text-slate-300">Notes (optional)</Label>
              <Textarea 
                value={actionNotes}
                onChange={(e) => setActionNotes(e.target.value)}
                placeholder="Add notes about why you're running this action..."
                className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
              />
            </div>

            {selectedAction?.riskLevel === 'critical' && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <div className="flex items-center gap-2 text-red-400">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="text-sm font-medium">Critical Action Warning</span>
                </div>
                <p className="text-xs text-red-300 mt-1">
                  This action may have significant system impact. Proceed with caution.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowActionDialog(false)} className="border-slate-700 text-slate-300">
              Cancel
            </Button>
            <Button 
              onClick={handleActionConfirm}
              disabled={executeAction.isPending}
              className="bg-gradient-to-r from-teal-500 to-cyan-500"
            >
              {executeAction.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Execute
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function MessageBubble({ message }: { message: TrinityMessage }) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
        isUser 
          ? 'bg-slate-700' 
          : isSystem 
          ? 'bg-amber-500/20' 
          : 'bg-gradient-to-br from-teal-400 to-cyan-500'
      }`}>
        {isUser ? (
          <span className="text-xs text-white">You</span>
        ) : isSystem ? (
          <AlertCircle className="w-4 h-4 text-amber-400" />
        ) : (
          <Brain className="w-4 h-4 text-white" />
        )}
      </div>
      
      <div className={`flex-1 max-w-[80%] ${isUser ? 'text-right' : ''}`}>
        {/* Collaborator Joined Badge - when external agent is hired */}
        {message.collaboratorJoined && (
          <div className="mb-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-purple-500/20 border border-purple-500/40 text-purple-300 text-xs">
            <Bot className="w-3 h-3" />
            <span>Collaborator Joined: {message.collaboratorJoined}</span>
          </div>
        )}
        
        <div className={`inline-block rounded-lg px-4 py-2 ${
          isUser 
            ? 'bg-slate-700 text-white' 
            : isSystem 
            ? 'bg-amber-500/10 border border-amber-500/30 text-amber-200'
            : 'bg-slate-800/50 border border-slate-700 text-white'
        }`}>
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          
          {/* Digital Twin Simulation Results */}
          {message.simulationResults && (
            <div className="mt-3 p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/30">
              <div className="flex items-center gap-2 text-indigo-300 text-xs font-medium mb-2">
                <Activity className="w-3 h-3" />
                Digital Twin Simulation
              </div>
              <table className="w-full text-xs">
                <tbody>
                  <tr className="border-b border-indigo-500/20">
                    <td className="py-1 text-slate-400">Bottleneck</td>
                    <td className="py-1 text-white font-medium">{message.simulationResults.bottleneck}</td>
                  </tr>
                  <tr className="border-b border-indigo-500/20">
                    <td className="py-1 text-slate-400">Recommendation</td>
                    <td className="py-1 text-cyan-300">{message.simulationResults.recommendation}</td>
                  </tr>
                  <tr>
                    <td className="py-1 text-slate-400">Confidence</td>
                    <td className="py-1">
                      <div className="flex items-center gap-2">
                        <Progress value={message.simulationResults.confidence} className="h-1.5 flex-1" />
                        <span className="text-emerald-400">{message.simulationResults.confidence}%</span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          
          {/* Evolution Log - Before/After diff */}
          {message.evolutionLog && (
            <div className="mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
              <div className="flex items-center gap-2 text-amber-300 text-xs font-medium mb-2">
                <Sparkles className="w-3 h-3" />
                Self-Evolution Log
              </div>
              <div className="space-y-2 text-xs">
                <div>
                  <span className="text-slate-400">Before:</span>
                  <pre className="mt-1 p-2 rounded bg-slate-900/50 text-red-300 overflow-x-auto">{message.evolutionLog.before}</pre>
                </div>
                <div>
                  <span className="text-slate-400">After:</span>
                  <pre className="mt-1 p-2 rounded bg-slate-900/50 text-emerald-300 overflow-x-auto">{message.evolutionLog.after}</pre>
                </div>
                <div className="text-slate-400 italic">Reason: {message.evolutionLog.reason}</div>
              </div>
            </div>
          )}
          
          {message.data && (
            <div className="mt-2 pt-2 border-t border-slate-700">
              {message.outputType === 'table' && (
                <div className="text-xs text-slate-400">
                  <pre className="overflow-x-auto">{JSON.stringify(message.data, null, 2)}</pre>
                </div>
              )}
            </div>
          )}
          
          {/* Compliance Verified Footer - Ethics check result */}
          {message.complianceVerified && (
            <div className={`mt-3 pt-2 border-t ${message.complianceVerified.passed ? 'border-emerald-500/30' : 'border-red-500/30'}`}>
              <div className={`flex items-center gap-1.5 text-xs ${message.complianceVerified.passed ? 'text-emerald-400' : 'text-red-400'}`}>
                {message.complianceVerified.passed ? (
                  <CheckCircle className="w-3 h-3" />
                ) : (
                  <XCircle className="w-3 h-3" />
                )}
                <span className="font-medium">Compliance {message.complianceVerified.passed ? 'Verified' : 'Failed'}</span>
              </div>
              {message.complianceVerified.guardrails.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {message.complianceVerified.guardrails.map((guardrail, idx) => (
                    <Badge key={idx} variant="outline" className="text-[10px] py-0 px-1.5 border-slate-600 text-slate-400">
                      {guardrail}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
          <span>{format(message.timestamp, 'h:mm a')}</span>
          {message.executionTimeMs && (
            <span className="text-cyan-400">{message.executionTimeMs}ms</span>
          )}
          {message.success !== undefined && (
            message.success ? (
              <CheckCircle className="w-3 h-3 text-emerald-400" />
            ) : (
              <XCircle className="w-3 h-3 text-red-400" />
            )
          )}
          {message.frontierCapability && (
            <Badge variant="outline" className="text-[10px] py-0 border-cyan-500/30 text-cyan-400">
              {message.frontierCapability.replace('_', ' ')}
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

function ReportRow({ name, status, progress, onClick }: { name: string; status: string; progress?: number; onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="w-full flex items-center justify-between p-2 rounded-lg bg-slate-800/50 hover:bg-slate-700 transition-colors group"
    >
      <div className="flex items-center gap-2">
        <FileText className="w-4 h-4 text-slate-400 group-hover:text-cyan-400" />
        <span className="text-sm text-slate-300">{name}</span>
      </div>
      <div className="flex items-center gap-2">
        {progress !== undefined && (
          <span className="text-xs text-slate-400">Fetching in {Math.round((100 - progress) / 10)}s</span>
        )}
        {status === 'completed' ? (
          <div className="w-2 h-2 rounded-full bg-emerald-400" />
        ) : status === 'pending' ? (
          <div className="w-2 h-2 rounded-full bg-amber-400" />
        ) : (
          <Loader2 className="w-3 h-3 animate-spin text-cyan-400" />
        )}
        <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white" />
      </div>
    </button>
  );
}

function QuickAccessRow({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="w-full flex items-center justify-between p-2 rounded-lg bg-slate-800/50 hover:bg-slate-700 transition-colors group"
    >
      <div className="flex items-center gap-2 text-slate-400 group-hover:text-white">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white" />
    </button>
  );
}

function MobileQuickActions({ actions, onAction, userRole }: { actions: QuickAction[]; onAction: (action: QuickAction) => void; userRole: string }) {
  const categories = [...new Set(actions.map(a => a.category))];
  
  return (
    <div className="space-y-4">
      {categories.map(category => (
        <div key={category}>
          <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">{category}</h3>
          <div className="space-y-1">
            {actions.filter(a => a.category === category).map(action => {
              const Icon = getActionIcon(action.icon);
              return (
                <button
                  key={action.id}
                  onClick={() => onAction(action)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg bg-slate-800/50 hover:bg-slate-700 transition-colors"
                >
                  <Icon className="w-5 h-5 text-cyan-400" />
                  <div className="flex-1 text-left">
                    <p className="text-sm text-white">{action.name}</p>
                    <p className="text-xs text-slate-400">{action.description}</p>
                  </div>
                  <Badge className={getRiskBadgeClass(action.riskLevel)}>
                    {action.riskLevel}
                  </Badge>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
