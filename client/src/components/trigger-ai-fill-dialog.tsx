import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Zap, Loader2, AlertCircle } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface TriggerAIFillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shiftIds?: string[];
}

export function TriggerAIFillDialog({
  open,
  onOpenChange,
  shiftIds = [],
}: TriggerAIFillDialogProps) {
  const [aiLevel, setAiLevel] = useState<'standard' | 'advanced' | 'expert'>('standard');
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: async () => {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      return apiRequest('/api/ai/trigger-fill', {
        method: 'POST',
        body: {
          shiftIds: shiftIds.length > 0 ? shiftIds : undefined,
          aiLevel,
        },
      });
    },
    onSuccess: (result: any) => {
      toast({
        title: 'AI Fill Triggered',
        description: `AI scheduling has been initiated with ${aiLevel} mode. ${result.data?.shiftsToFill || 0} shifts will be filled.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to trigger AI fill',
        variant: 'destructive',
      });
    },
  });

  const levelDescriptions: Record<string, string> = {
    standard: 'Basic matching based on availability and skills',
    advanced: 'Considers patterns, preferences, and compliance',
    expert: 'Full AI analysis with optimization and fairness',
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-600" />
            Trigger AI Schedule Fill
          </DialogTitle>
          <DialogDescription>
            Use AI to automatically fill open shifts with qualified employees.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">AI Intelligence Level</label>
            <Select value={aiLevel} onValueChange={(value: any) => setAiLevel(value)}>
              <SelectTrigger data-testid="select-ai-level">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">Standard</Badge>
                    <span className="text-xs">Basic</span>
                  </div>
                </SelectItem>
                <SelectItem value="advanced">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">Advanced</Badge>
                    <span className="text-xs">Smart</span>
                  </div>
                </SelectItem>
                <SelectItem value="expert">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">Expert</Badge>
                    <span className="text-xs">Full Analysis</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
            <p className="text-xs text-blue-900 dark:text-blue-200">
              {levelDescriptions[aiLevel]}
            </p>
          </div>

          {shiftIds.length > 0 && (
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 flex gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-900 dark:text-amber-200">
                Will fill {shiftIds.length} selected shift{shiftIds.length !== 1 ? 's' : ''}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
            data-testid="button-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="bg-yellow-600 hover:bg-yellow-700"
            data-testid="button-trigger-ai"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Triggering...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 mr-2" />
                Trigger AI Fill
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
