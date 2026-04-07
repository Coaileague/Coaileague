/**
 * SCENARIO PREVIEW MODAL
 * ======================
 * Shows before/after comparison of changes before execution.
 * Requires explicit user approval before Trinity proceeds.
 */

import { UniversalModal, UniversalModalHeader, UniversalModalTitle, UniversalModalDescription, UniversalModalFooter } from '@/components/ui/universal-modal';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowRight, Check, X, Edit2, AlertTriangle } from 'lucide-react';

interface ScenarioPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentState: Record<string, any>;
  proposedState: Record<string, any>;
  planSummary?: string;
  estimatedTime?: string;
  onApprove: () => void;
  onReject: () => void;
  onModify?: () => void;
}

export function ScenarioPreviewModal({
  open,
  onOpenChange,
  currentState,
  proposedState,
  planSummary,
  estimatedTime,
  onApprove,
  onReject,
  onModify
}: ScenarioPreviewModalProps) {
  const hasChanges = JSON.stringify(currentState) !== JSON.stringify(proposedState);
  
  const renderStateValue = (value: any): string => {
    if (value === null || value === undefined) return 'Not set';
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  };

  const getChangedKeys = (): string[] => {
    const allKeys = new Set([...Object.keys(currentState), ...Object.keys(proposedState)]);
    return Array.from(allKeys).filter(key => 
      JSON.stringify(currentState[key]) !== JSON.stringify(proposedState[key])
    );
  };

  return (
    <UniversalModal open={open} onOpenChange={onOpenChange} size="full" className="max-h-[90vh]" data-testid="modal-scenario-preview">
        <UniversalModalHeader>
          <UniversalModalTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Preview Changes
          </UniversalModalTitle>
          <UniversalModalDescription>
            Review what Trinity will change before proceeding
          </UniversalModalDescription>
        </UniversalModalHeader>

        {planSummary && (
          <div className="bg-muted/50 rounded-lg p-3 mb-4">
            <p className="text-sm font-medium">Plan Summary</p>
            <p className="text-sm text-muted-foreground mt-1">{planSummary}</p>
            {estimatedTime && (
              <Badge variant="outline" className="mt-2">
                Estimated time: {estimatedTime}
              </Badge>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm text-muted-foreground">Current State</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[300px]">
                <div className="p-4 space-y-2">
                  {Object.entries(currentState).length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">No existing data</p>
                  ) : (
                    Object.entries(currentState).map(([key, value]) => (
                      <div key={key} className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">{key}</p>
                        <pre className="text-sm bg-muted/50 rounded p-2 overflow-x-auto">
                          {renderStateValue(value)}
                        </pre>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className="border-primary/30">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <ArrowRight className="h-4 w-4 text-primary" />
                <span className="text-primary">After Trinity</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[300px]">
                <div className="p-4 space-y-2">
                  {Object.entries(proposedState).length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">No changes proposed</p>
                  ) : (
                    Object.entries(proposedState).map(([key, value]) => {
                      const isChanged = JSON.stringify(currentState[key]) !== JSON.stringify(value);
                      return (
                        <div key={key} className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                            {key}
                            {isChanged && (
                              <Badge variant="default" className="text-xs py-0 h-4">
                                Changed
                              </Badge>
                            )}
                          </p>
                          <pre className={`text-sm rounded p-2 overflow-x-auto ${
                            isChanged ? 'bg-primary/10 border border-primary/20' : 'bg-muted/50'
                          }`}>
                            {renderStateValue(value)}
                          </pre>
                        </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {!hasChanges && (
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <p className="text-sm text-muted-foreground">No changes detected</p>
          </div>
        )}

        <UniversalModalFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={onReject}
            className="gap-2"
            data-testid="button-scenario-reject"
          >
            <X className="h-4 w-4" />
            Cancel
          </Button>
          
          {onModify && (
            <Button
              variant="outline"
              onClick={onModify}
              className="gap-2"
              data-testid="button-scenario-modify"
            >
              <Edit2 className="h-4 w-4" />
              Modify
            </Button>
          )}
          
          <Button
            onClick={onApprove}
            className="gap-2"
            disabled={!hasChanges}
            data-testid="button-scenario-approve"
          >
            <Check className="h-4 w-4" />
            Execute
          </Button>
        </UniversalModalFooter>
    </UniversalModal>
  );
}
