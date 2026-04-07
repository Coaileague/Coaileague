import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { AlertTriangle, ShieldCheck, X, ChevronRight, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

export function ComplianceEnrollmentBanner() {
  const [, navigate] = useLocation();
  const [dismissed, setDismissed] = useState(false);

  const { data } = useQuery<any>({
    queryKey: ['/api/compliance/enrollment/status'],
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  if (!data?.success || !data.data?.requiresAction) return null;
  if (dismissed) return null;

  const { daysRemaining, isOverdue, deadline } = data.data;

  const isUrgent = daysRemaining <= 7;
  const isCritical = daysRemaining <= 3 || isOverdue;

  const bgClass = isCritical
    ? 'bg-red-900/90 border-red-700'
    : isUrgent
    ? 'bg-amber-900/90 border-amber-700'
    : 'bg-[#1e293b] border-[#ffc83c]/40';

  const iconClass = isCritical ? 'text-red-400' : isUrgent ? 'text-amber-400' : 'text-[#ffc83c]';

  const label = isOverdue
    ? 'Regulatory credential overdue'
    : isCritical
    ? `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} left to submit credential`
    : isUrgent
    ? `${daysRemaining} days left to submit your operator credential`
    : `${daysRemaining} days remaining to complete regulatory enrollment`;

  const deadlineStr = new Date(deadline).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  return (
    <div
      data-testid="banner-compliance-enrollment"
      className={`flex items-center gap-3 px-4 py-2 border-b text-sm ${bgClass} z-50`}
    >
      <AlertTriangle className={`shrink-0 w-4 h-4 ${iconClass}`} />
      <div className="flex-1 flex items-center gap-2 flex-wrap">
        <span className="text-white font-medium">{label}.</span>
        <span className="text-white/60 hidden sm:inline">
          All org members must submit a TX DPS operator credential by {deadlineStr}.
        </span>
      </div>
      <Button
        size="sm"
        variant="outline"
        data-testid="button-enroll-now"
        className="shrink-0 border-white/30 text-white hover:text-white text-xs gap-1"
        onClick={() => navigate('/compliance/regulatory-enrollment')}
      >
        Submit Now
        <ChevronRight className="w-3 h-3" />
      </Button>
      <button
        data-testid="button-dismiss-banner"
        className="shrink-0 text-white/40 hover:text-white/70 transition-colors"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
