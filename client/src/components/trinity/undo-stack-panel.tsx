/**
 * UNDO STACK PANEL
 * ================
 * Shows reversible actions with undo buttons.
 * Allows users to roll back Trinity's changes.
 */

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Undo2, Clock, Lock, Loader2, History } from 'lucide-react';
import type { ReversibleAction } from '@/hooks/use-trinity-state';

interface UndoStackPanelProps {
  reversibleActions: ReversibleAction[];
  onUndoAction: (actionId: string) => Promise<boolean>;
  maxHeight?: string;
}

export function UndoStackPanel({ 
  reversibleActions, 
  onUndoAction,
  maxHeight = '200px'
}: UndoStackPanelProps) {
  const [undoingId, setUndoingId] = useState<string | null>(null);

  const handleUndo = async (actionId: string) => {
    setUndoingId(actionId);
    try {
      await onUndoAction(actionId);
    } finally {
      setUndoingId(null);
    }
  };

  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffSeconds < 60) return 'Just now';
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const reversibleCount = reversibleActions.filter(a => a.reversible).length;

  if (reversibleActions.length === 0) {
    return (
      <Card className="bg-muted/30" data-testid="panel-undo-empty">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
            <History className="h-4 w-4" />
            Recent Changes
          </CardTitle>
        </CardHeader>
        <CardContent className="py-4 text-center">
          <p className="text-sm text-muted-foreground">No changes yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="panel-undo-stack">
      <CardHeader className="py-3 px-4 border-b">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            Recent Changes
          </CardTitle>
          {reversibleCount > 0 && (
            <Badge variant="outline" className="text-xs">
              {reversibleCount} undoable
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea style={{ height: maxHeight }}>
          <div className="p-2 space-y-2">
            {reversibleActions.map((action) => (
              <div 
                key={action.id}
                className="flex items-center justify-between gap-2 p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                data-testid={`undo-action-${action.id}`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate" title={action.description}>
                    {action.description}
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatTime(action.timestamp)}
                  </p>
                </div>
                
                {action.reversible ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleUndo(action.id)}
                    disabled={undoingId === action.id}
                    className="shrink-0 gap-1"
                    data-testid={`button-undo-${action.id}`}
                  >
                    {undoingId === action.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Undo2 className="h-3 w-3" />
                    )}
                    Undo
                  </Button>
                ) : (
                  <Badge variant="secondary" className="gap-1 shrink-0">
                    <Lock className="h-3 w-3" />
                    <span className="text-xs">Can't undo</span>
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
