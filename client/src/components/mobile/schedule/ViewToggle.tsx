import { Button } from '@/components/ui/button';

interface ViewToggleProps {
  viewMode: 'my' | 'full';
  onViewModeChange: (mode: 'my' | 'full') => void;
}

export function ViewToggle({ viewMode, onViewModeChange }: ViewToggleProps) {
  return (
    <div className="px-4 py-3 bg-muted/50 border-b">
      <div className="flex gap-2">
        <Button
          variant={viewMode === 'my' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onViewModeChange('my')}
          className="flex-1"
          data-testid="button-view-my"
        >
          My Schedule
        </Button>
        <Button
          variant={viewMode === 'full' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onViewModeChange('full')}
          className="flex-1"
          data-testid="button-view-full"
        >
          Full Schedule
        </Button>
      </div>
    </div>
  );
}
