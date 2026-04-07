/**
 * Approvals Hub - Mobile-friendly central approval management
 * Links to existing approval pages (timesheets, workflows, expenses) with counts
 */

import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  CheckCircle2,
  Clock,
  FileText,
  DollarSign,
  Cog,
  ArrowRight,
  ArrowLeft,
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { cn } from "@/lib/utils";

interface ApprovalCategory {
  id: string;
  title: string;
  description: string;
  icon: typeof CheckCircle2;
  href: string;
  color: string;
  bgColor: string;
}

const APPROVAL_CATEGORIES: ApprovalCategory[] = [
  {
    id: 'timesheets',
    title: 'Timesheet Edits',
    description: 'Review employee time corrections',
    icon: Clock,
    href: '/timesheets/approvals',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
  },
  {
    id: 'workflows',
    title: 'AI Workflows',
    description: 'Approve Trinity AI suggestions',
    icon: Cog,
    href: '/workflow-approvals',
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-100 dark:bg-purple-900/30',
  },
  {
    id: 'expenses',
    title: 'Expense Reports',
    description: 'Review reimbursement requests',
    icon: DollarSign,
    href: '/expense-approvals',
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
  },
];

export default function ApprovalsHub() {
  const [, setLocation] = useLocation();

  const { data: timesheetPending, isLoading: isLoadingTimesheets } = useQuery<any[]>({
    queryKey: ['/api/timesheets/pending-count'],
  });

  const { data: workflowPending, isLoading: isLoadingWorkflows } = useQuery<any[]>({
    queryKey: ['/api/scheduleos/proposals'],
  });

  const { data: expensePending, isLoading: isLoadingExpenses } = useQuery<any[]>({
    queryKey: ['/api/expenses/pending-approval'],
  });

  const isLoading = isLoadingTimesheets || isLoadingWorkflows || isLoadingExpenses;

  const getCounts = (categoryId: string): number => {
    switch (categoryId) {
      case 'timesheets': return timesheetPending?.length || 0;
      case 'workflows': return workflowPending?.length || 0;
      case 'expenses': return expensePending?.length || 0;
      default: return 0;
    }
  };

  const totalPending = (timesheetPending?.length || 0) + (workflowPending?.length || 0) + (expensePending?.length || 0);

  const ApprovalCard = ({ category }: { category: ApprovalCategory }) => {
    const count = getCounts(category.id);
    const Icon = category.icon;
    
    return (
      <Button
        variant="ghost"
        onClick={() => setLocation(category.href)}
        className="w-full p-0 h-auto text-left"
        data-testid={`card-${category.id}-approvals`}
      >
        <Card className="p-4 w-full transition-all">
          <div className="flex items-center gap-4">
            <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", category.bgColor)}>
              <Icon className={cn("w-6 h-6", category.color)} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{category.title}</h3>
                {count > 0 && (
                  <Badge variant="destructive" className="h-5 px-1.5 text-xs">
                    {count}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{category.description}</p>
            </div>
            <ArrowRight className="w-5 h-5 text-muted-foreground" />
          </div>
        </Card>
      </Button>
    );
  };

  const pageConfig: CanvasPageConfig = {
    id: 'approvals-hub',
    title: 'Approvals Hub',
    subtitle: totalPending > 0 ? `${totalPending} items pending review` : 'All approvals are up to date',
    category: 'operations',
  };

  if (isLoading) {
    return (
      <CanvasHubPage config={pageConfig}>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </CanvasHubPage>
    );
  }

  return (
    <CanvasHubPage config={pageConfig}>
      {/* Summary Card */}
      <Card className="p-4 bg-gradient-to-br from-primary/10 to-primary/5 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center">
            <CheckCircle2 className="w-7 h-7 text-primary" />
          </div>
          <div>
            <p className="text-3xl font-bold">{totalPending}</p>
            <p className="text-sm text-muted-foreground">Items awaiting review</p>
          </div>
        </div>
      </Card>

      {/* Approval Categories */}
      <div className="grid gap-4 md:grid-cols-3">
        {APPROVAL_CATEGORIES.map((category) => (
          <ApprovalCard key={category.id} category={category} />
        ))}
      </div>
    </CanvasHubPage>
  );
}
