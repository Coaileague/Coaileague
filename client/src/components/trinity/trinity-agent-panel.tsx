/**
 * TRINITY AGENT PANEL
 * ===================
 * Combined panel showing all Agent Parity components:
 * - Business Impact (sticky top)
 * - Thinking Steps Stream (main content)
 * - Progress Tracker, Cost Tracker, Undo Stack (sidebar)
 * 
 * This creates a split view when Trinity is executing goals.
 */

import { useState, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  PanelRightClose, 
  PanelRightOpen, 
  Bot, 
  Activity,
  Wallet,
  History,
  Zap
} from 'lucide-react';

import { BusinessImpactPanel } from './business-impact-panel';
import { AgentProgressTracker } from './agent-progress-tracker';
import { ThinkingStepsStream } from './thinking-steps-stream';
import { CostTracker } from './cost-tracker';
import { UndoStackPanel } from './undo-stack-panel';
import { ScenarioPreviewModal } from './scenario-preview-modal';

import type { 
  ThinkingStep, 
  Progress, 
  BusinessImpact, 
  CostTracking, 
  ReversibleAction 
} from '@/hooks/use-trinity-state';

interface TrinityAgentPanelProps {
  isExecuting: boolean;
  thinkingSteps: ThinkingStep[];
  progress: Progress | null;
  businessImpact: BusinessImpact | null;
  costs: CostTracking | null;
  reversibleActions: ReversibleAction[];
  confidence: { level: number; threshold: number } | null;
  lastError: string | null;
  onUndoAction: (actionId: string) => Promise<boolean>;
  showSidebar?: boolean;
  onToggleSidebar?: () => void;
}

export function TrinityAgentPanel({
  isExecuting,
  thinkingSteps,
  progress,
  businessImpact,
  costs,
  reversibleActions,
  confidence,
  lastError,
  onUndoAction,
  showSidebar = true,
  onToggleSidebar
}: TrinityAgentPanelProps) {
  const [activeTab, setActiveTab] = useState<'progress' | 'costs' | 'history'>('progress');
  
  const isActive = isExecuting || thinkingSteps.length > 0 || progress !== null;
  
  const completedSteps = useMemo(() => 
    thinkingSteps.filter(s => s.status === 'complete').length,
    [thinkingSteps]
  );
  
  const confidencePercent = useMemo(() => 
    confidence ? Math.round(confidence.level * 100) : null,
    [confidence]
  );

  if (!isActive) {
    return null;
  }

  return (
    <div className="flex flex-col h-full bg-background" data-testid="trinity-agent-panel">
      <BusinessImpactPanel 
        impact={businessImpact} 
        isLoading={isExecuting && !businessImpact}
      />
      
      <div className={`flex-1 flex overflow-hidden ${showSidebar ? 'flex-row' : 'flex-col'}`}>
        <div className={`flex-1 flex flex-col overflow-hidden ${showSidebar ? 'border-r' : ''}`}>
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Agent Execution</span>
              {isExecuting && (
                <Badge variant="default" className="bg-primary animate-pulse text-xs">
                  Running
                </Badge>
              )}
            </div>
            {onToggleSidebar && (
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={onToggleSidebar}
                title={showSidebar ? 'Hide sidebar' : 'Show sidebar'}
              >
                {showSidebar ? (
                  <PanelRightClose className="h-4 w-4" />
                ) : (
                  <PanelRightOpen className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>
          
          <div className="flex-1 overflow-hidden">
            <ThinkingStepsStream 
              steps={thinkingSteps} 
              maxHeight="100%"
              showHeader={false}
            />
          </div>
          
          {confidence && (
            <div className="px-3 py-2 border-t bg-muted/30 flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Confidence</span>
              <div className="flex items-center gap-2">
                <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all ${
                      confidencePercent! >= 70 ? 'bg-emerald-500' :
                      confidencePercent! >= 40 ? 'bg-amber-500' : 'bg-destructive'
                    }`}
                    style={{ width: `${confidencePercent}%` }}
                  />
                </div>
                <span className="text-xs font-medium">{confidencePercent}%</span>
              </div>
            </div>
          )}
        </div>
        
        {showSidebar && (
          <div className="w-64 shrink-0 flex flex-col overflow-hidden bg-muted/20">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex flex-col h-full">
              <TabsList className="grid grid-cols-3 m-2 h-8">
                <TabsTrigger value="progress" className="text-xs gap-1 h-7">
                  <Activity className="h-3 w-3" />
                  <span className="hidden sm:inline">Progress</span>
                </TabsTrigger>
                <TabsTrigger value="costs" className="text-xs gap-1 h-7">
                  <Wallet className="h-3 w-3" />
                  <span className="hidden sm:inline">Costs</span>
                </TabsTrigger>
                <TabsTrigger value="history" className="text-xs gap-1 h-7">
                  <History className="h-3 w-3" />
                  <span className="hidden sm:inline">Undo</span>
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="progress" className="flex-1 m-0 p-2 overflow-auto">
                <AgentProgressTracker 
                  progress={progress}
                  isExecuting={isExecuting}
                  hasError={!!lastError}
                />
              </TabsContent>
              
              <TabsContent value="costs" className="flex-1 m-0 p-2 overflow-auto">
                <CostTracker costs={costs} showDetails />
              </TabsContent>
              
              <TabsContent value="history" className="flex-1 m-0 p-2 overflow-auto">
                <UndoStackPanel 
                  reversibleActions={reversibleActions}
                  onUndoAction={onUndoAction}
                  maxHeight="100%"
                />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
      
      {lastError && (
        <div className="p-3 bg-destructive/10 border-t border-destructive/30">
          <p className="text-sm text-destructive">{lastError}</p>
        </div>
      )}
    </div>
  );
}

interface TrinityAgentWrapperProps {
  children: React.ReactNode;
  isAgentMode: boolean;
  onToggleAgentMode?: () => void;
  agentPanelProps?: Omit<TrinityAgentPanelProps, 'showSidebar' | 'onToggleSidebar'>;
}

export function TrinityAgentWrapper({
  children,
  isAgentMode,
  onToggleAgentMode,
  agentPanelProps
}: TrinityAgentWrapperProps) {
  const [showSidebar, setShowSidebar] = useState(true);

  if (!isAgentMode || !agentPanelProps) {
    return <>{children}</>;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-2 px-4 py-2 border-b bg-primary/5">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Agent Mode Active</span>
        </div>
        {onToggleAgentMode && (
          <Button
            size="sm"
            variant="outline"
            onClick={onToggleAgentMode}
            className="h-7 text-xs"
          >
            Exit Agent Mode
          </Button>
        )}
      </div>
      
      <div className="flex-1 overflow-hidden">
        <TrinityAgentPanel
          {...agentPanelProps}
          showSidebar={showSidebar}
          onToggleSidebar={() => setShowSidebar(!showSidebar)}
        />
      </div>
      
      <div className="border-t">
        {children}
      </div>
    </div>
  );
}
