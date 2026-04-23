/**
 * Automation Settings — Configure Trinity™ automation cycles, workflows, and pipelines.
 * Each automation can be individually toggled and configured with its own cycle/frequency.
 * Settings persist to DB and Trinity reads them for all scheduled operations.
 */

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { UniversalSpinner } from '@/components/ui/universal-spinner';
import {
  Sparkles, DollarSign, AlertTriangle, Save, Calendar,
  FileText, Clock, Bell, Shield, ChevronDown, ChevronRight,
  CheckCircle2, Settings2, Zap, RefreshCcw
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { CanvasHubPage, type CanvasPageConfig } from '@/components/canvas-hub';
import { apiRequest, queryClient } from '@/lib/queryClient';
type InvoicingCycle = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'net30';
type PayrollCycle = 'daily' | 'weekly' | 'biweekly' | 'semi_monthly' | 'monthly';
type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
type BreakComplianceRule = 'US-FEDERAL' | 'CA' | 'NY' | 'TX' | 'WA' | 'FL' | 'IL' | 'AZ' | 'NV' | 'CO' | 'GA' | 'NC' | 'OH' | 'PA';

interface AutomationSettings {
  scheduling: boolean;
  invoicing: boolean;
  payroll: boolean;
  time_tracking: boolean;
  shift_monitoring: boolean;
  quickbooks_sync: boolean;
  shift_reminders_enabled?: boolean;
  requireApprovalForAll?: boolean;
  autoApproveThreshold?: number;
  notifyOnRequest?: boolean;
  notifyOnComplete?: boolean;
  notifyOnError?: boolean;
  invoicingCycle?: InvoicingCycle;
  invoicingDayOfWeek?: DayOfWeek;
  invoicingDayOfMonth?: number;
  invoicingNetDays?: number;
  payrollCycle?: PayrollCycle;
  payrollDayOfWeek?: DayOfWeek;
  payrollSemiMonthlyDays?: string;
  breakComplianceRule?: BreakComplianceRule;
  shiftReminderHours?: number;
}

const DAYS_OF_WEEK: { value: DayOfWeek; label: string }[] = [
  { value: 'monday', label: 'Monday' },
  { value: 'tuesday', label: 'Tuesday' },
  { value: 'wednesday', label: 'Wednesday' },
  { value: 'thursday', label: 'Thursday' },
  { value: 'friday', label: 'Friday' },
  { value: 'saturday', label: 'Saturday' },
  { value: 'sunday', label: 'Sunday' },
];

const INVOICING_CYCLES: { value: InvoicingCycle; label: string; description: string }[] = [
  { value: 'daily', label: 'Daily', description: 'Invoice generated every day' },
  { value: 'weekly', label: 'Weekly', description: 'Invoice generated once per week' },
  { value: 'biweekly', label: 'Biweekly', description: 'Invoice generated every two weeks' },
  { value: 'monthly', label: 'Monthly', description: 'Invoice generated once per month' },
  { value: 'net30', label: 'Net 30', description: 'Invoice due 30 days after delivery' },
];

const PAYROLL_CYCLES: { value: PayrollCycle; label: string; description: string }[] = [
  { value: 'daily', label: 'Daily', description: 'Payroll processed every day' },
  { value: 'weekly', label: 'Weekly', description: 'Payroll processed once per week' },
  { value: 'biweekly', label: 'Biweekly', description: 'Payroll processed every two weeks (most common)' },
  { value: 'semi_monthly', label: 'Semi-Monthly', description: 'Payroll on two fixed dates per month' },
  { value: 'monthly', label: 'Monthly', description: 'Payroll processed once per month' },
];

const COMPLIANCE_RULES: { value: BreakComplianceRule; label: string }[] = [
  { value: 'US-FEDERAL', label: 'US Federal (FLSA)' },
  { value: 'CA', label: 'California' },
  { value: 'NY', label: 'New York' },
  { value: 'TX', label: 'Texas' },
  { value: 'WA', label: 'Washington' },
  { value: 'FL', label: 'Florida' },
  { value: 'IL', label: 'Illinois' },
  { value: 'AZ', label: 'Arizona' },
  { value: 'NV', label: 'Nevada' },
  { value: 'CO', label: 'Colorado' },
  { value: 'GA', label: 'Georgia' },
  { value: 'NC', label: 'North Carolina' },
  { value: 'OH', label: 'Ohio' },
  { value: 'PA', label: 'Pennsylvania' },
];

const DAYS_OF_MONTH = Array.from({ length: 28 }, (_, i) => i + 1);

function cycleLabel(cycle: InvoicingCycle | PayrollCycle | undefined): string {
  if (!cycle) return '';
  const map: Record<string, string> = {
    daily: 'Daily', weekly: 'Weekly', biweekly: 'Bi-weekly',
    monthly: 'Monthly', net30: 'Net 30', semi_monthly: 'Semi-monthly',
  };
  return map[cycle] || cycle;
}

function buildInvoicingSubtitle(s: AutomationSettings): string {
  const cycle = s.invoicingCycle || 'monthly';
  if (cycle === 'weekly') return `Weekly · ${s.invoicingDayOfWeek ? capitalize(s.invoicingDayOfWeek) : 'Monday'}`;
  if (cycle === 'biweekly') return `Bi-weekly · ${s.invoicingDayOfWeek ? capitalize(s.invoicingDayOfWeek) : 'Monday'}`;
  if (cycle === 'monthly') return `Monthly · Day ${s.invoicingDayOfMonth || 1}`;
  if (cycle === 'net30') return `Net ${s.invoicingNetDays || 30}`;
  if (cycle === 'daily') return 'Daily';
  return cycleLabel(cycle);
}

function buildPayrollSubtitle(s: AutomationSettings): string {
  const cycle = s.payrollCycle || 'biweekly';
  if (cycle === 'weekly') return `Weekly · ${s.payrollDayOfWeek ? capitalize(s.payrollDayOfWeek) : 'Friday'}`;
  if (cycle === 'biweekly') return `Bi-weekly · ${s.payrollDayOfWeek ? capitalize(s.payrollDayOfWeek) : 'Friday'}`;
  if (cycle === 'semi_monthly') return `Semi-monthly · ${s.payrollSemiMonthlyDays || '1,15'}`;
  if (cycle === 'monthly') return 'Monthly';
  if (cycle === 'daily') return 'Daily';
  return cycleLabel(cycle);
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

interface AutomationCardProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  testId: string;
  children?: React.ReactNode;
  badge?: string;
  badgeVariant?: 'default' | 'secondary' | 'outline';
}

function AutomationCard({ icon, title, subtitle, enabled, onToggle, testId, children, badge, badgeVariant = 'secondary' }: AutomationCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className={`transition-all duration-200 ${enabled ? 'border-primary/20' : ''}`}>
      <CardHeader className="pb-0">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <button
            type="button"
            className="flex items-center gap-3 flex-1 text-left"
            onClick={() => enabled && setExpanded(v => !v)}
            data-testid={`${testId}-expand`}
          >
            <div className={`p-2 rounded-md ${enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
              {icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{title}</span>
                {badge && <Badge variant={badgeVariant} className="text-xs">{badge}</Badge>}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{subtitle}</p>
            </div>
            {enabled && children && (
              <span className="text-muted-foreground">
                {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </span>
            )}
          </button>
          <Switch
            checked={enabled}
            onCheckedChange={onToggle}
            data-testid={testId}
          />
        </div>
      </CardHeader>
      {enabled && expanded && children && (
        <CardContent className="pt-4">
          <Separator className="mb-4" />
          {children}
        </CardContent>
      )}
    </Card>
  );
}

export default function AutomationSettings() {
  const { toast } = useToast();

  const { data: apiResponse, isLoading } = useQuery<{ settings: AutomationSettings }>({
    queryKey: ['/api/automation/trinity/settings'],
  });

  const settingsData = apiResponse?.settings;

  const [autoScheduling, setAutoScheduling] = useState(false);
  const [autoInvoicing, setAutoInvoicing] = useState(false);
  const [autoPayroll, setAutoPayroll] = useState(false);
  const [autoTimeTracking, setAutoTimeTracking] = useState(false);
  const [autoShiftMonitoring, setAutoShiftMonitoring] = useState(true);
  const [autoQuickbooksSync, setAutoQuickbooksSync] = useState(false);
  const [requireApprovalForAll, setRequireApprovalForAll] = useState(true);
  const [notifyOnRequest, setNotifyOnRequest] = useState(true);
  const [notifyOnComplete, setNotifyOnComplete] = useState(true);
  const [notifyOnError, setNotifyOnError] = useState(true);

  const [invoicingCycle, setInvoicingCycle] = useState<InvoicingCycle>('monthly');
  const [invoicingDayOfWeek, setInvoicingDayOfWeek] = useState<DayOfWeek>('monday');
  const [invoicingDayOfMonth, setInvoicingDayOfMonth] = useState(1);
  const [invoicingNetDays, setInvoicingNetDays] = useState(30);

  const [payrollCycle, setPayrollCycle] = useState<PayrollCycle>('biweekly');
  const [payrollDayOfWeek, setPayrollDayOfWeek] = useState<DayOfWeek>('friday');
  const [payrollSemiMonthlyDays, setPayrollSemiMonthlyDays] = useState('1,15');

  const [breakComplianceRule, setBreakComplianceRule] = useState<BreakComplianceRule>('US-FEDERAL');
  const [shiftReminderHours, setShiftReminderHours] = useState(1);
  const [shiftRemindersEnabled, setShiftRemindersEnabled] = useState(true);

  useEffect(() => {
    if (settingsData) {
      setAutoScheduling(settingsData.scheduling ?? false);
      setAutoInvoicing(settingsData.invoicing ?? false);
      setAutoPayroll(settingsData.payroll ?? false);
      setAutoTimeTracking(settingsData.time_tracking ?? false);
      setAutoShiftMonitoring(settingsData.shift_monitoring ?? true);
      setAutoQuickbooksSync(settingsData.quickbooks_sync ?? false);
      setRequireApprovalForAll(settingsData.requireApprovalForAll ?? true);
      setNotifyOnRequest(settingsData.notifyOnRequest ?? true);
      setNotifyOnComplete(settingsData.notifyOnComplete ?? true);
      setNotifyOnError(settingsData.notifyOnError ?? true);
      setInvoicingCycle(settingsData.invoicingCycle ?? 'monthly');
      setInvoicingDayOfWeek(settingsData.invoicingDayOfWeek ?? 'monday');
      setInvoicingDayOfMonth(settingsData.invoicingDayOfMonth ?? 1);
      setInvoicingNetDays(settingsData.invoicingNetDays ?? 30);
      setPayrollCycle(settingsData.payrollCycle ?? 'biweekly');
      setPayrollDayOfWeek(settingsData.payrollDayOfWeek ?? 'friday');
      setPayrollSemiMonthlyDays(settingsData.payrollSemiMonthlyDays ?? '1,15');
      setBreakComplianceRule(settingsData.breakComplianceRule ?? 'US-FEDERAL');
      setShiftReminderHours(settingsData.shiftReminderHours ?? 1);
      setShiftRemindersEnabled(settingsData.shift_reminders_enabled ?? true);
    }
  }, [settingsData]);

  const currentSettings: AutomationSettings = {
    scheduling: autoScheduling,
    invoicing: autoInvoicing,
    payroll: autoPayroll,
    time_tracking: autoTimeTracking,
    shift_monitoring: autoShiftMonitoring,
    quickbooks_sync: autoQuickbooksSync,
    requireApprovalForAll,
    notifyOnRequest,
    notifyOnComplete,
    notifyOnError,
    invoicingCycle,
    invoicingDayOfWeek,
    invoicingDayOfMonth,
    invoicingNetDays,
    payrollCycle,
    payrollDayOfWeek,
    payrollSemiMonthlyDays,
    breakComplianceRule,
    shiftReminderHours,
    shift_reminders_enabled: shiftRemindersEnabled,
  };

  const saveMutation = useMutation({
    mutationFn: async (settings: AutomationSettings) => {
      const res = await apiRequest('PATCH', '/api/automation/trinity/settings', settings);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Settings Saved",
        description: "Trinity has updated your automation pipelines. Changes take effect on the next cycle.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/automation/trinity/settings'] });
    },
    onError: (error: any) => {
      toast({
        title: "Save Failed",
        description: error.message || "Failed to save automation settings",
        variant: "destructive",
      });
    },
  });

  const saveButton = (
    <Button onClick={() => saveMutation.mutate(currentSettings)} disabled={saveMutation.isPending} data-testid="button-save-automation-settings">
      {saveMutation.isPending ? (
        <UniversalSpinner size="sm" className="mr-1.5 !gap-0 scale-[0.45] origin-center" />
      ) : (
        <Save className="mr-2 h-4 w-4" />
      )}
      {saveMutation.isPending ? 'Saving...' : 'Save Settings'}
    </Button>
  );

  const pageConfig: CanvasPageConfig = {
    id: 'automation-settings',
    title: 'Automation Settings',
    subtitle: 'Configure cycles, pipelines, and workflows — each organization is different',
    category: 'settings',
    headerActions: saveButton,
  };

  if (isLoading) {
    return (
      <CanvasHubPage
        config={{
          id: 'automation-settings',
          title: 'Automation Settings',
          subtitle: 'Loading automation policies and saved Trinity preferences',
          category: 'settings'
        }}
      >
        <div className="space-y-3 max-w-2xl py-2">
          <div className="flex items-center justify-center py-2">
            <UniversalSpinner size="md" label="Trinity is loading automation pipelines…" />
          </div>
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 flex-1">
                    <Skeleton className="h-9 w-9 rounded-md" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-44" />
                      <Skeleton className="h-3 w-64" />
                    </div>
                  </div>
                  <Skeleton className="h-6 w-11 rounded-full" />
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      </CanvasHubPage>
    );
  }

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="space-y-3 max-w-2xl">

        {/* Section: Core Pipelines */}
        <div className="space-y-1 pb-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">Core Pipelines</p>
        </div>

        {/* Auto Invoicing */}
        <AutomationCard
          icon={<FileText className="h-4 w-4" />}
          title="Auto Invoicing"
          subtitle={buildInvoicingSubtitle(currentSettings)}
          enabled={autoInvoicing}
          onToggle={setAutoInvoicing}
          testId="switch-auto-invoicing"
          badge={cycleLabel(invoicingCycle)}
        >
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">Billing Cycle</Label>
              <Select value={invoicingCycle} onValueChange={(v) => setInvoicingCycle(v as InvoicingCycle)}>
                <SelectTrigger data-testid="select-invoicing-cycle">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INVOICING_CYCLES.map(c => (
                    <SelectItem key={c.value} value={c.value}>
                      <div>
                        <div className="font-medium">{c.label}</div>
                        <div className="text-xs text-muted-foreground">{c.description}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(invoicingCycle === 'weekly' || invoicingCycle === 'biweekly') && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Run Day</Label>
                <Select value={invoicingDayOfWeek} onValueChange={(v) => setInvoicingDayOfWeek(v as DayOfWeek)}>
                  <SelectTrigger data-testid="select-invoicing-day-of-week">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAYS_OF_WEEK.map(d => (
                      <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {invoicingCycle === 'monthly' && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Day of Month</Label>
                <Select value={String(invoicingDayOfMonth)} onValueChange={(v) => setInvoicingDayOfMonth(Number(v))}>
                  <SelectTrigger data-testid="select-invoicing-day-of-month">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAYS_OF_MONTH.map(d => (
                      <SelectItem key={d} value={String(d)}>Day {d}{d === 1 ? ' (1st)' : d === 15 ? ' (15th)' : d === 28 ? ' (last safe)' : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {invoicingCycle === 'net30' && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Net Days</Label>
                <Select value={String(invoicingNetDays)} onValueChange={(v) => setInvoicingNetDays(Number(v))}>
                  <SelectTrigger data-testid="select-invoicing-net-days">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">Net 15</SelectItem>
                    <SelectItem value="30">Net 30</SelectItem>
                    <SelectItem value="45">Net 45</SelectItem>
                    <SelectItem value="60">Net 60</SelectItem>
                    <SelectItem value="90">Net 90</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="p-3 bg-blue-50 dark:bg-blue-900/10 rounded-lg border border-blue-200 dark:border-blue-800 text-xs text-blue-800 dark:text-blue-200">
              Trinity will auto-generate and send invoices to all active clients on this schedule. Each client can have individual overrides set in their profile.
            </div>
          </div>
        </AutomationCard>

        {/* Auto Payroll */}
        <AutomationCard
          icon={<DollarSign className="h-4 w-4" />}
          title="Auto Payroll"
          subtitle={buildPayrollSubtitle(currentSettings)}
          enabled={autoPayroll}
          onToggle={setAutoPayroll}
          testId="switch-auto-payroll"
          badge={cycleLabel(payrollCycle)}
        >
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">Payroll Cycle</Label>
              <Select value={payrollCycle} onValueChange={(v) => setPayrollCycle(v as PayrollCycle)}>
                <SelectTrigger data-testid="select-payroll-cycle">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYROLL_CYCLES.map(c => (
                    <SelectItem key={c.value} value={c.value}>
                      <div>
                        <div className="font-medium">{c.label}</div>
                        <div className="text-xs text-muted-foreground">{c.description}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(payrollCycle === 'weekly' || payrollCycle === 'biweekly') && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Processing Day</Label>
                <Select value={payrollDayOfWeek} onValueChange={(v) => setPayrollDayOfWeek(v as DayOfWeek)}>
                  <SelectTrigger data-testid="select-payroll-day-of-week">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAYS_OF_WEEK.map(d => (
                      <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {payrollCycle === 'semi_monthly' && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Processing Days</Label>
                <Select value={payrollSemiMonthlyDays} onValueChange={setPayrollSemiMonthlyDays}>
                  <SelectTrigger data-testid="select-payroll-semi-monthly-days">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1,15">1st & 15th</SelectItem>
                    <SelectItem value="15,30">15th & last day</SelectItem>
                    <SelectItem value="1,16">1st & 16th</SelectItem>
                    <SelectItem value="5,20">5th & 20th</SelectItem>
                    <SelectItem value="10,25">10th & 25th</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="p-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg">
              <div className="flex gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-amber-900 dark:text-amber-100">
                  <strong>Review Required:</strong> Trinity will calculate payroll but hold for manager approval before processing. Requires approval gate to execute.
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div>
                <Label className="text-sm">Require Manual Approval</Label>
                <p className="text-xs text-muted-foreground">Always require a manager to approve before payroll runs</p>
              </div>
              <Switch
                checked={requireApprovalForAll}
                onCheckedChange={setRequireApprovalForAll}
                data-testid="switch-payroll-require-approval"
              />
            </div>
          </div>
        </AutomationCard>

        {/* AI Scheduling */}
        <AutomationCard
          icon={<Calendar className="h-4 w-4" />}
          title="AI Scheduling"
          subtitle={autoScheduling ? 'Auto-approves high-confidence schedules' : 'Manual approval required'}
          enabled={autoScheduling}
          onToggle={setAutoScheduling}
          testId="switch-auto-scheduling"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <Label className="text-sm">Require Approval for All Schedules</Label>
                <p className="text-xs text-muted-foreground">Disable to let Trinity auto-publish when confidence is high</p>
              </div>
              <Switch
                checked={requireApprovalForAll}
                onCheckedChange={setRequireApprovalForAll}
                data-testid="switch-require-all-approval"
              />
            </div>
            <div className="p-3 bg-blue-50 dark:bg-blue-900/10 rounded-lg border border-blue-200 dark:border-blue-800 text-xs text-blue-800 dark:text-blue-200">
              Trinity generates weekly schedules every Sunday at 11pm. Managers receive a preview for approval before it goes live.
            </div>
          </div>
        </AutomationCard>

        <Separator />
        <div className="space-y-1 pb-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">Compliance & Field Operations</p>
        </div>

        {/* Break Compliance */}
        <AutomationCard
          icon={<Shield className="h-4 w-4" />}
          title="Break Compliance"
          subtitle={`${COMPLIANCE_RULES.find(r => r.value === breakComplianceRule)?.label || breakComplianceRule} · Auto-enforced`}
          enabled={autoShiftMonitoring}
          onToggle={setAutoShiftMonitoring}
          testId="switch-break-compliance"
          badge={breakComplianceRule}
          badgeVariant="outline"
        >
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">Compliance Rule Set</Label>
              <Select value={breakComplianceRule} onValueChange={(v) => setBreakComplianceRule(v as BreakComplianceRule)}>
                <SelectTrigger data-testid="select-break-compliance-rule">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMPLIANCE_RULES.map(r => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Determines mandatory break rules (meal periods, rest breaks) for shift compliance monitoring.
              </p>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div>
                <Label className="text-sm">Auto-Approve GPS-Verified Clock-Ins</Label>
                <p className="text-xs text-muted-foreground">Automatically approve time entries verified by GPS</p>
              </div>
              <Switch
                checked={autoTimeTracking}
                onCheckedChange={setAutoTimeTracking}
                data-testid="switch-auto-time-tracking"
              />
            </div>
          </div>
        </AutomationCard>

        {/* Shift Reminders */}
        <AutomationCard
          icon={<Bell className="h-4 w-4" />}
          title="Shift Reminders"
          subtitle={`${shiftReminderHours === 1 ? '1 hour' : `${shiftReminderHours} hours`} before shift · Auto-sent`}
          enabled={shiftRemindersEnabled}
          onToggle={setShiftRemindersEnabled}
          testId="switch-shift-reminders"
          badge={`${shiftReminderHours}h before`}
        >
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">Lead Time</Label>
              <Select value={String(shiftReminderHours)} onValueChange={(v) => setShiftReminderHours(Number(v))}>
                <SelectTrigger data-testid="select-shift-reminder-hours">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 hour before</SelectItem>
                  <SelectItem value="2">2 hours before</SelectItem>
                  <SelectItem value="4">4 hours before</SelectItem>
                  <SelectItem value="8">8 hours before</SelectItem>
                  <SelectItem value="12">12 hours before</SelectItem>
                  <SelectItem value="24">24 hours before (day before)</SelectItem>
                  <SelectItem value="48">48 hours before (2 days)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Trinity sends push notification and SMS to officers this far in advance of their scheduled shift.
              </p>
            </div>
          </div>
        </AutomationCard>

        <Separator />
        <div className="space-y-1 pb-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">Integrations & Sync</p>
        </div>

        {/* QuickBooks Sync */}
        <AutomationCard
          icon={<RefreshCcw className="h-4 w-4" />}
          title="QuickBooks Sync"
          subtitle={autoQuickbooksSync ? 'Auto-syncing invoices and payroll to QuickBooks' : 'Manual sync only'}
          enabled={autoQuickbooksSync}
          onToggle={setAutoQuickbooksSync}
          testId="switch-quickbooks-sync"
        >
          <div className="p-3 bg-muted/50 rounded-lg text-xs text-muted-foreground">
            When enabled, Trinity automatically pushes finalized invoices and approved payroll runs to your connected QuickBooks account. Requires an active QuickBooks integration.
          </div>
        </AutomationCard>

        <Separator />
        <div className="space-y-1 pb-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">Notification Preferences</p>
        </div>

        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-sm font-medium">Automation Requests</p>
                <p className="text-xs text-muted-foreground">Notify when Trinity requests approval</p>
              </div>
              <Switch checked={notifyOnRequest} onCheckedChange={setNotifyOnRequest} data-testid="switch-notify-request" />
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-sm font-medium">Pipeline Completions</p>
                <p className="text-xs text-muted-foreground">Notify when payroll or invoicing runs complete</p>
              </div>
              <Switch checked={notifyOnComplete} onCheckedChange={setNotifyOnComplete} data-testid="switch-notify-complete" />
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-sm font-medium">Errors & Failures</p>
                <p className="text-xs text-muted-foreground">Notify when an automation encounters an error</p>
              </div>
              <Switch checked={notifyOnError} onCheckedChange={setNotifyOnError} data-testid="switch-notify-error" />
            </div>
          </CardContent>
        </Card>

        {/* Bottom save for convenience */}
        <div className="flex justify-end pt-2 pb-6">
          <Button
            onClick={() => saveMutation.mutate(currentSettings)}
            disabled={saveMutation.isPending}
            size="lg"
            data-testid="button-save-bottom"
          >
            {saveMutation.isPending ? (
              <UniversalSpinner size="sm" className="mr-1.5 !gap-0 scale-[0.45] origin-center" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {saveMutation.isPending ? 'Saving...' : 'Save All Settings'}
          </Button>
        </div>

      </div>
    </CanvasHubPage>
  );
}
