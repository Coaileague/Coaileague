import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, ChevronRight } from "lucide-react";
import { useLocation } from "wouter";

interface PendingApproval {
  id: string;
  actionType: string;
  requestedByName: string;
  shiftDate: string;
}

export function PendingApprovalsBanner() {
  const [, setLocation] = useLocation();

  // Fetch pending approvals count
  const { data: pendingCount = 0 } = useQuery<number>({
    queryKey: ['/api/shifts/approvals/pending-count'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/shifts/approvals/pending-count', {
          credentials: 'include',
        });
        if (!res.ok) return 0;
        const data = await res.json();
        return data.count || 0;
      } catch {
        return 0;
      }
    },
  });

  if (pendingCount === 0) return null;

  return (
    <Alert className="bg-amber-50 border-amber-200 text-amber-900">
      <AlertCircle className="h-4 w-4 text-amber-600" />
      <AlertDescription className="flex items-center justify-between">
        <span>
          You have <Badge variant="secondary">{pendingCount}</Badge>{' '}
          {pendingCount === 1 ? 'shift approval' : 'shift approvals'} pending
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation('/shift-approvals')}
          data-testid="button-view-approvals"
        >
          Review
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </AlertDescription>
    </Alert>
  );
}
