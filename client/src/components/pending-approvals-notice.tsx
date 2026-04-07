import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, ChevronRight, Clock, Calendar, FileText, DollarSign } from "lucide-react";
import { useLocation } from "wouter";

interface ApprovalCounts {
  shifts: number;
  timesheets: number;
  timeoff: number;
  expenses: number;
  total: number;
}

export function PendingApprovalsBanner() {
  const [, setLocation] = useLocation();

  const { data: counts } = useQuery<ApprovalCounts>({
    queryKey: ['/api/approvals/all-pending-counts'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/approvals/all-pending-counts', { credentials: 'include' });
        if (!res.ok) return { shifts: 0, timesheets: 0, timeoff: 0, expenses: 0, total: 0 };
        const json = await res.json();
        return json.data ?? { shifts: 0, timesheets: 0, timeoff: 0, expenses: 0, total: 0 };
      } catch {
        return { shifts: 0, timesheets: 0, timeoff: 0, expenses: 0, total: 0 };
      }
    },
    refetchInterval: 60000,
  });

  if (!counts || counts.total === 0) return null;

  const approvalItems = [
    { count: counts.shifts, label: 'shift', plural: 'shifts', icon: Calendar, route: '/shift-approvals' },
    { count: counts.timesheets, label: 'timesheet', plural: 'timesheets', icon: Clock, route: '/timesheet-approvals' },
    { count: counts.timeoff, label: 'time off', plural: 'time off requests', icon: FileText, route: '/timeoff-approvals' },
    { count: counts.expenses, label: 'expense', plural: 'expenses', icon: DollarSign, route: '/expense-approvals' },
  ].filter(item => item.count > 0);

  if (approvalItems.length === 1) {
    const item = approvalItems[0];
    return (
      <Alert className="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-100">
        <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        <AlertDescription className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <item.icon className="h-4 w-4" />
            You have <Badge variant="secondary" className="mx-1">{item.count}</Badge>
            {item.count === 1 ? item.label : item.plural} pending approval
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation(item.route)}
            data-testid={`button-view-${item.label}-approvals`}
          >
            Review
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert className="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-100">
      <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
      <AlertDescription>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="font-medium">
            You have <Badge variant="secondary" className="mx-1">{counts.total}</Badge> items pending approval
          </span>
          <div className="flex flex-wrap gap-2">
            {approvalItems.map((item) => (
              <Button
                key={item.label}
                variant="outline"
                size="sm"
                onClick={() => setLocation(item.route)}
                className="gap-1"
                data-testid={`button-view-${item.label}-approvals`}
              >
                <item.icon className="h-3 w-3" />
                {item.count} {item.count === 1 ? item.label : item.plural}
              </Button>
            ))}
          </div>
        </div>
      </AlertDescription>
    </Alert>
  );
}
