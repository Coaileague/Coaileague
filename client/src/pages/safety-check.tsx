/**
 * Safety Check Page - Mobile-optimized safety inspection and reporting
 * For field workers to submit site safety checks
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { format } from "date-fns";
import {
  Shield,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Camera,
  MapPin,
  ArrowLeft,
  Send,
  Clock,
  Building2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { useToast } from "@/hooks/use-toast";
import { useLocationCapture } from "@/hooks/use-location-capture";
import { useIsMobile } from "@/hooks/use-mobile";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface SafetyItem {
  id: string;
  label: string;
  category: string;
  required: boolean;
}

const SAFETY_ITEMS: SafetyItem[] = [
  { id: 'fire_exits', label: 'Fire exits clear and accessible', category: 'Emergency', required: true },
  { id: 'fire_extinguishers', label: 'Fire extinguishers visible and charged', category: 'Emergency', required: true },
  { id: 'lighting', label: 'Adequate lighting in all areas', category: 'Environment', required: true },
  { id: 'hazards', label: 'No trip hazards or obstructions', category: 'Environment', required: true },
  { id: 'alarms', label: 'Alarm systems functional', category: 'Security', required: true },
  { id: 'cameras', label: 'Security cameras operational', category: 'Security', required: false },
  { id: 'doors', label: 'All entry points secure', category: 'Security', required: true },
  { id: 'first_aid', label: 'First aid kit stocked', category: 'Emergency', required: false },
];

type CheckStatus = 'pass' | 'fail' | 'na' | null;

interface SafetyCheckRecord {
  id: number;
  siteName: string;
  completedAt: string;
  passCount: number;
  failCount: number;
  status: 'passed' | 'issues_found';
}

const Icon = ({ name, className }: any) => <span className={className}>●</span>;

export default function SafetyCheck() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();

  const [mode, setMode] = useState<'list' | 'check'>('list');
  const [checks, setChecks] = useState<Record<string, CheckStatus>>({});
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { locationData, captureLocation } = useLocationCapture();

  const { data: recentChecks, isLoading } = useQuery<SafetyCheckRecord[]>({
    queryKey: ['/api/safety-checks/recent'],
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      setSubmitting(true);
      return apiRequest('POST', '/api/safety-checks', {
        items: checks,
        notes,
        location: locationData,
        timestamp: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/safety-checks/recent'] });
      toast({ title: 'Safety check submitted', description: 'Your report has been recorded.' });
      setMode('list');
      setChecks({});
      setNotes('');
    },
    onError: (error) => {
      toast({ title: 'Submission failed', description: error.message, variant: 'destructive' });
    },
    onSettled: () => setSubmitting(false),
  });

  const setCheckStatus = (itemId: string, status: CheckStatus) => {
    setChecks(prev => ({ ...prev, [itemId]: status }));
  };

  const completedCount = Object.keys(checks).filter(k => checks[k] !== null).length;
  const passCount = Object.values(checks).filter(v => v === 'pass').length;
  const failCount = Object.values(checks).filter(v => v === 'fail').length;
  const requiredItems = SAFETY_ITEMS.filter(i => i.required);
  const requiredComplete = requiredItems.every(i => checks[i.id] !== null && checks[i.id] !== undefined);

  const StatusButton = ({ itemId, status, icon: Icon, color }: { itemId: string; status: CheckStatus; icon: typeof CheckCircle2; color: string }) => {
    const isSelected = checks[itemId] === status;
    return (
      <button
        onClick={(e) => { e.stopPropagation(); setCheckStatus(itemId, checks[itemId] === status ? null : status); }}
        className={cn(
          "w-11 h-11 rounded-full flex items-center justify-center transition-all border-2",
          isSelected
            ? `${color} border-transparent shadow-md ${status === 'pass' ? 'shadow-green-500/30' : 'shadow-red-500/30'}`
            : "bg-muted/50 dark:bg-muted/30 border-border/60 text-muted-foreground hover-elevate"
        )}
        data-testid={`button-${itemId}-${status}`}
        aria-pressed={isSelected}
        aria-label={`Mark ${status === 'pass' ? 'Pass' : 'Fail'}`}
      >
        <Icon className={cn("w-5 h-5", !isSelected && "opacity-60")} />
      </button>
    );
  };

  const checkConfig: CanvasPageConfig = {
    id: 'safety-check-inspection',
    title: 'Safety Inspection',
    subtitle: `${completedCount}/${SAFETY_ITEMS.length} items checked`,
    category: 'operations',
    backButton: true,
    onBack: () => setMode('list'),
    withBottomNav: true,
  };

  const listConfig: CanvasPageConfig = {
    id: 'safety-check-list',
    title: 'Safety Checks',
    subtitle: 'Site safety inspections',
    category: 'operations',
    backButton: true,
    onBack: () => setLocation('/dashboard'),
    withBottomNav: true,
    headerActions: (
      <Button size="sm" onClick={() => { setMode('check'); captureLocation(); }} data-testid="button-new-check">
        New Check
      </Button>
    ),
  };

  const desktopConfig: CanvasPageConfig = {
    id: 'safety-check-desktop',
    title: 'Safety Checks',
    subtitle: 'Site safety inspection and reporting',
    category: 'operations',
    backButton: true,
    onBack: () => setLocation('/dashboard'),
  };

  if (isMobile) {
    if (mode === 'check') {
      return (
        <CanvasHubPage config={checkConfig}>
          <div className="space-y-4 pb-32">
            {/* Location Capture */}
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={captureLocation}
              data-testid="button-capture-location"
            >
              <MapPin className={cn("w-4 h-4", locationData ? "text-green-500" : "")} />
              {locationData ? 'Location captured' : 'Capture current location'}
            </Button>

            {/* Progress Bar */}
            <div className="space-y-1.5" data-testid="progress-completion">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-muted-foreground">{completedCount} of {SAFETY_ITEMS.length} completed</p>
                <div className="flex items-center gap-2 text-xs">
                  {passCount > 0 && <span className="text-green-600 dark:text-green-400" data-testid="text-pass-count">{passCount} pass</span>}
                  {failCount > 0 && <span className="text-red-600 dark:text-red-400" data-testid="text-fail-count">{failCount} fail</span>}
                </div>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all duration-300"
                  style={{ width: `${(completedCount / SAFETY_ITEMS.length) * 100}%` }}
                />
              </div>
            </div>

            {/* Checklist */}
            <div className="space-y-3">
              {SAFETY_ITEMS.map((item) => {
                const itemStatus = checks[item.id];
                return (
                  <Card
                    key={item.id}
                    className={cn(
                      "p-3 transition-colors cursor-pointer active-elevate-2",
                      itemStatus === 'pass' && "border-green-500/30 bg-green-50 dark:bg-green-950/20",
                      itemStatus === 'fail' && "border-red-500/30 bg-red-50 dark:bg-red-950/20",
                      !itemStatus && "hover-elevate"
                    )}
                    onClick={() => {
                      if (!checks[item.id]) {
                        setCheckStatus(item.id, 'pass');
                      }
                    }}
                    data-testid={`card-item-${item.id}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          "text-sm font-medium",
                          itemStatus === 'pass' && "text-muted-foreground line-through"
                        )}>{item.label}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <Badge variant="outline" className="text-[10px]">{item.category}</Badge>
                          {item.required && <Badge variant="secondary" className="text-[10px]">Required</Badge>}
                          {itemStatus === 'pass' && <Badge className="text-[10px] bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30">Pass</Badge>}
                          {itemStatus === 'fail' && <Badge className="text-[10px] bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30">Fail</Badge>}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <StatusButton itemId={item.id} status="pass" icon={CheckCircle2} color="bg-green-500 text-white" />
                        <StatusButton itemId={item.id} status="fail" icon={XCircle} color="bg-red-500 text-white" />
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>

            {/* Notes */}
            <div>
              <label className="text-sm font-medium mb-2 block">Additional Notes</label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any observations or concerns..."
                className="resize-none"
                rows={3}
                data-testid="input-notes"
              />
            </div>
          </div>

          {/* Fixed Submit Button */}
          <div className="fixed left-0 right-0 p-4 bg-background/95 backdrop-blur-lg border-t safe-area-bottom z-30" style={{ bottom: 'calc(var(--bottom-nav-height, 44px) + env(safe-area-inset-bottom, 0px))' }}>
            <Button
              className="w-full"
              size="lg"
              onClick={() => submitMutation.mutate()}
              disabled={!requiredComplete || submitting}
              data-testid="button-submit-check"
            >
              {submitting ? (
                <Clock className="w-5 h-5 mr-2 animate-spin" />
              ) : (
                <Send className="w-5 h-5 mr-2" />
              )}
              Submit Safety Check
              {failCount > 0 && <Badge variant="destructive" className="ml-2">{failCount} issues</Badge>}
            </Button>
          </div>
        </CanvasHubPage>
      );
    }

    return (
      <CanvasHubPage config={listConfig}>
        <div className="space-y-4">
          {/* Quick Start Card */}
          <Card className="p-4 bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center">
                <Shield className="w-7 h-7 text-green-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">Start Safety Check</h3>
                <p className="text-sm text-muted-foreground">{SAFETY_ITEMS.length} items to inspect</p>
              </div>
              <Button onClick={() => { setMode('check'); captureLocation(); }} data-testid="button-start-check">
                Start
              </Button>
            </div>
          </Card>

          {/* Recent Checks */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground px-1 uppercase tracking-wide">
              Recent Inspections
            </h3>

            {isLoading ? (
              <Card className="p-6 text-center">
                <p className="text-muted-foreground">
                  Loading recent inspections, findings, and follow-up status...
                </p>
              </Card>
            ) : !recentChecks?.length ? (
              <Card className="p-6 text-center">
                <Shield className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No recent checks</p>
              </Card>
            ) : (
              recentChecks.map((check) => (
                <Card key={check.id} className="p-3" data-testid={`card-check-${check.id}`}>
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center",
                      check.status === 'passed' ? "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400" : "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
                    )}>
                      {check.status === 'passed' ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{check.siteName}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        <span>{format(new Date(check.completedAt), 'MMM d, h:mm a')}</span>
                        <span>•</span>
                        <span className="text-green-600 dark:text-green-400">{check.passCount} pass</span>
                        {check.failCount > 0 && <span className="text-red-600 dark:text-red-400">{check.failCount} fail</span>}
                      </div>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>
      </CanvasHubPage>
    );
  }

  // Desktop view
  return (
    <CanvasHubPage config={desktopConfig}>
      <Card className="p-8 text-center max-w-2xl mx-auto">
        <Shield className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">Safety Check Portal</h2>
        <p className="text-muted-foreground mb-4">
          Safety checks are optimized for mobile devices. Use your phone for on-site inspections.
        </p>
        <Button onClick={() => setLocation('/reports')}>
          View Reports Dashboard
        </Button>
      </Card>
    </CanvasHubPage>
  );
}
