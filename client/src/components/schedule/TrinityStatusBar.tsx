/**
 * TrinityStatusBar - Ultra-compact single-line automation toggle
 * 
 * @description GetSling-style minimal Trinity automation toggle
 * Single line: [Trinity Icon] Trinity AI: Ready [Enable Auto-Schedule] [Settings]
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Settings, Check } from 'lucide-react';
import { TrinityIconStatic } from '@/components/trinity-button';
import { TrinitySchedulingProgress } from './TrinitySchedulingProgress';

interface TrinityStatusBarProps {
  automationEnabled: boolean;
  manualApprovalMode: boolean;
  isPending: boolean;
  workspaceId: string;
  onToggle: (enabled: boolean) => void;
  onOpenSettings?: () => void;
}

export function TrinityStatusBar({
  automationEnabled,
  manualApprovalMode,
  isPending,
  workspaceId,
  onToggle,
  onOpenSettings,
}: TrinityStatusBarProps) {
  const [showProgress, setShowProgress] = useState(false);

  return (
    <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-gradient-to-r from-[var(--ds-info)]/5 to-[var(--ds-warning)]/5 border-b text-sm">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <TrinityIconStatic size={16} />
          <span className="font-medium">Trinity AI:</span>
          <span className={automationEnabled ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}>
            {automationEnabled ? 'Active' : 'Ready'}
          </span>
        </div>

        <Button
          variant={automationEnabled ? "default" : "outline"}
          size="sm"
          onClick={() => onToggle(!automationEnabled)}
          disabled={isPending}
          data-testid="button-ai-toggle"
        >
          {isPending ? '...' : automationEnabled ? (
            <>
              <Check className="w-3 h-3 mr-1" />
              Enabled
            </>
          ) : 'Enable'}
        </Button>

        {showProgress && (
          <div className="max-w-xs">
            <TrinitySchedulingProgress workspaceId={workspaceId} embedded={true} />
          </div>
        )}
      </div>

      <div className="flex items-center gap-1">
        {manualApprovalMode && (
          <span className="text-xs text-yellow-600 dark:text-yellow-400 mr-2">
            Manual Approval
          </span>
        )}
        
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" data-testid="button-trinity-settings" aria-label="Trinity settings">
              <Settings className="w-3.5 h-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56" align="end">
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Trinity Settings</h4>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>Auto-fill open shifts</p>
                <p>Conflict resolution</p>
                <p>Profit optimization</p>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full text-xs"
                onClick={() => setShowProgress(!showProgress)}
              >
                {showProgress ? 'Hide' : 'Show'} Progress
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
