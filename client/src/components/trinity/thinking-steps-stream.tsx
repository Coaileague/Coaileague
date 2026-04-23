/**
 * THINKING STEPS STREAM
 * =====================
 * Shows live thinking steps as Trinity reasons through the problem.
 * Auto-scrolls to show latest steps.
 */

import { useEffect, useRef } from 'react';
import { TrinityArrowMark } from "@/components/trinity-logo";
import { UniversalSpinner } from '@/components/ui/universal-spinner';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Check, X, Circle, Activity } from 'lucide-react';
import { Suspense } from 'react';
import type { ThinkingStep } from '@/hooks/use-trinity-state';

interface ThinkingStepsStreamProps {
  steps: ThinkingStep[];
  maxHeight?: string;
  showHeader?: boolean;
}

export function ThinkingStepsStream({ 
  steps, 
  maxHeight = '300px',
  showHeader = true 
}: ThinkingStepsStreamProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [steps]);

  const getStatusIcon = (status: ThinkingStep['status']) => {
    switch (status) {
      case 'complete':
        return <Check className="h-3.5 w-3.5 text-emerald-500" />;
      case 'active':
        return <UniversalSpinner size="sm" className="!gap-0 scale-[0.45] origin-center" />;
      case 'error':
        return <X className="h-3.5 w-3.5 text-destructive" />;
      case 'pending':
      default:
        return <Circle className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  const getStatusColor = (status: ThinkingStep['status']) => {
    switch (status) {
      case 'complete':
        return 'border-l-emerald-500 bg-emerald-500/5';
      case 'active':
        return 'border-l-primary bg-primary/5';
      case 'error':
        return 'border-l-destructive bg-destructive/5';
      case 'pending':
      default:
        return 'border-l-muted-foreground bg-muted/50';
    }
  };

  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  if (steps.length === 0) {
    return (
      <Card className="bg-muted/30" data-testid="panel-thinking-empty">
        <CardContent className="py-8 text-center">
          <div className="mx-auto w-12 h-12 mb-2 flex items-center justify-center">
            <Suspense fallback={<div className="w-12 h-12" />}>
              <TrinityArrowMark size={48} />
            </Suspense>
          </div>
          <p className="text-sm text-muted-foreground">
            Waiting for Trinity to start thinking...
          </p>
        </CardContent>
      </Card>
    );
  }

  const content = (
    <ScrollArea className="relative" style={{ height: maxHeight }}>
      <div ref={scrollRef} className="space-y-2 p-4">
        {steps.map((step, index) => (
          <div
            key={step.id}
            className={`flex items-start gap-3 p-2 rounded-r border-l-2 transition-colors ${getStatusColor(step.status)}`}
            data-testid={`thinking-step-${index}`}
          >
            <div className="mt-0.5 shrink-0">
              {getStatusIcon(step.status)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm leading-relaxed">{step.message}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {formatTime(step.timestamp)}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );

  if (!showHeader) {
    return content;
  }

  return (
    <Card data-testid="panel-thinking-stream">
      <CardHeader className="py-3 px-4 border-b">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Trinity Thinking
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            {steps.filter(s => s.status === 'complete').length}/{steps.length} steps
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {content}
      </CardContent>
    </Card>
  );
}
