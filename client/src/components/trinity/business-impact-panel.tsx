/**
 * BUSINESS IMPACT PANEL
 * =====================
 * Shows real-time business impact: cost, time saved, people affected, compliance.
 * Sticky at top of Trinity modal for constant visibility.
 */

import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DollarSign, Clock, Users, ShieldCheck, AlertTriangle, Loader2 } from 'lucide-react';
import type { BusinessImpact } from '@/hooks/use-trinity-state';

interface BusinessImpactPanelProps {
  impact: BusinessImpact | null;
  isLoading?: boolean;
}

export function BusinessImpactPanel({ impact, isLoading }: BusinessImpactPanelProps) {
  if (isLoading) {
    return (
      <Card className="sticky top-0 z-10 bg-card/95 backdrop-blur">
        <CardHeader className="py-2 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Analyzing business impact...
          </CardTitle>
        </CardHeader>
      </Card>
    );
  }

  if (!impact) {
    return null;
  }

  const complianceConfig = {
    checking: { color: 'bg-muted', icon: Loader2, label: 'Checking...', className: 'animate-spin' },
    compliant: { color: 'bg-emerald-500/10 text-emerald-600', icon: ShieldCheck, label: 'Compliant' },
    warning: { color: 'bg-amber-500/10 text-amber-600', icon: AlertTriangle, label: 'Warning' },
    violation: { color: 'bg-destructive/10 text-destructive', icon: AlertTriangle, label: 'Violation' }
  };

  const compliance = complianceConfig[impact.compliance];
  const ComplianceIcon = compliance.icon;

  return (
    <Card className="sticky top-0 z-10 bg-card/95 backdrop-blur border-primary/20" data-testid="panel-business-impact">
      <CardHeader className="py-2 px-4">
        <CardTitle className="text-sm font-medium text-muted-foreground">Business Impact</CardTitle>
      </CardHeader>
      <CardContent className="py-2 px-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-primary/10">
              <DollarSign className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Cost</p>
              <p className="text-sm font-semibold">${impact.cost.toFixed(2)}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-emerald-500/10">
              <Clock className="h-4 w-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Time Saved</p>
              <p className="text-sm font-semibold">{impact.timeSaved.toFixed(1)}h</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-blue-500/10">
              <Users className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">People</p>
              <p className="text-sm font-semibold">{impact.peopleAffected}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`${compliance.color} gap-1`}>
              // @ts-ignore — TS migration: fix in refactoring sprint
              <ComplianceIcon className={`h-3 w-3 ${(compliance as any).className || ''}`} />
              {compliance.label}
            </Badge>
          </div>
        </div>
        
        {impact.complianceDetails && (
          <p className="text-xs text-muted-foreground mt-2">{impact.complianceDetails}</p>
        )}
      </CardContent>
    </Card>
  );
}
