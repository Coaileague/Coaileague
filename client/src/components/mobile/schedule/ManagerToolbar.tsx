import { Clock3, BarChart3, Users, Target } from 'lucide-react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';

interface ManagerToolbarProps {
  pendingCount: number;
  onShowApprovals: () => void;
  onShowReports: () => void;
  onShowEmployees: () => void;
}

export function ManagerToolbar({ 
  pendingCount, 
  onShowApprovals, 
  onShowReports,
  onShowEmployees 
}: ManagerToolbarProps) {
  const [, setLocation] = useLocation();

  return (
    <div className="px-4 py-3 bg-card border-b">
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onShowApprovals}
          className="flex items-center justify-start gap-2 h-auto py-3"
          data-testid="button-toolbar-approvals"
        >
          <div className="flex items-center gap-2 flex-1">
            <Clock3 className="h-4 w-4 text-orange-600" />
            <span className="text-sm">Approvals</span>
          </div>
          {pendingCount > 0 && (
            <span className="bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {pendingCount}
            </span>
          )}
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={onShowReports}
          className="flex items-center justify-start gap-2 h-auto py-3"
          data-testid="button-toolbar-reports"
        >
          <BarChart3 className="h-4 w-4 text-blue-600" />
          <span className="text-sm">Reports</span>
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={onShowEmployees}
          className="flex items-center justify-start gap-2 h-auto py-3"
          data-testid="button-toolbar-employees"
        >
          <Users className="h-4 w-4 text-green-600" />
          <span className="text-sm">Team</span>
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setLocation('/workflow-approvals')}
          className="flex items-center justify-start gap-2 h-auto py-3"
          data-testid="button-toolbar-workflow"
        >
          <Target className="h-4 w-4 text-purple-600" />
          <span className="text-sm">Workflow</span>
        </Button>
      </div>
    </div>
  );
}
