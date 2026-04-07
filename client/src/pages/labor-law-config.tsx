import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Scale, Search, MapPin, Clock, Coffee, AlertTriangle,
  CheckCircle, Building2, Timer, CalendarDays, Shield
} from "lucide-react";
import {
  DsPageWrapper,
  DsPageHeader,
  DsStatCard,
  DsTabBar,
  DsSectionCard,
  DsDataRow,
  DsBadge,
  DsEmptyState
} from "@/components/ui/ds-components";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const secureFetch = async (url: string, options?: RequestInit) => {
  const res = await fetch(url, { ...options, credentials: 'include' });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
};

interface LaborRule {
  jurisdiction: string;
  jurisdictionName: string;
  country: string;
  restBreakEnabled: boolean;
  restBreakMinShiftHours: number;
  restBreakDurationMinutes: number;
  restBreakIsPaid: boolean;
  restBreakFrequencyHours: number;
  mealBreakEnabled: boolean;
  mealBreakMinShiftHours: number;
  mealBreakDurationMinutes: number;
  mealBreakIsPaid: boolean;
  mealBreakMaxDelayHours: number;
  overtimeEnabled: boolean;
  overtimeDailyThresholdHours: number;
  overtimeWeeklyThresholdHours: number;
  overtimeMultiplier: number;
  doubleOvertimeEnabled: boolean;
  doubleOvertimeThresholdHours: number;
  doubleOvertimeMultiplier: number;
  minRestBetweenShiftsHours: number;
  maxConsecutiveDaysAllowed: number;
  splitShiftAllowed: boolean;
  splitShiftPremiumRequired: boolean;
  isActive: boolean;
  effectiveDate: string;
  notes: string;
}

function RuleDetailRow({ label, value, icon: Icon }: { label: string; value: string | number | boolean; icon?: any }) {
  return (
    <div className="flex items-center justify-between gap-3 p-2 border-b border-[var(--ds-border)] last:border-0">
      <div className="flex items-center gap-2 min-w-0">
        {Icon && <Icon className="h-3.5 w-3.5 opacity-50 shrink-0" />}
        <span className="text-xs opacity-60 truncate">{label}</span>
      </div>
      <span className="text-xs font-bold shrink-0">
        {typeof value === "boolean" ? (
          <DsBadge color={value ? "success" : "muted"}>{value ? "Yes" : "No"}</DsBadge>
        ) : (
          String(value)
        )}
      </span>
    </div>
  );
}

export default function LaborLawConfigPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  const allRulesQuery = useQuery<LaborRule[]>({
    queryKey: ["/api/breaks/rules"],
    queryFn: () => secureFetch("/api/breaks/rules"),
    select: (data: any) => (Array.isArray(data) ? data : data?.rules || []),
  });

  const workspaceRulesQuery = useQuery({
    queryKey: ["/api/breaks/rules/workspace"],
    queryFn: () => secureFetch("/api/breaks/rules/workspace"),
  });

  const allRules = allRulesQuery.data || [];
  const workspaceRule = workspaceRulesQuery.data?.rules?.[0] || workspaceRulesQuery.data;
  const isLoading = allRulesQuery.isLoading;

  const filteredRules = allRules.filter(r =>
    r.jurisdictionName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.jurisdiction?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const activeCount = allRules.filter(r => r.isActive).length;
  const withOvertimeCount = allRules.filter(r => r.overtimeEnabled).length;
  const withBreaksCount = allRules.filter(r => r.restBreakEnabled || r.mealBreakEnabled).length;

  const tabs = [
    { id: "all", label: "All Jurisdictions" },
    { id: "workspace", label: "Workspace Rules" },
    { id: "compliance", label: "Compliance Overview" }
  ];

  return (
    <DsPageWrapper className="max-w-5xl mx-auto">
      <DsPageHeader 
        title="Labor Law Configuration" 
        subtitle="50-state labor law rules and compliance management"
      />

      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <DsStatCard label="Jurisdictions" value={allRules.length} color="info" icon={MapPin} />
          <DsStatCard label="Active Rules" value={activeCount} color="success" icon={CheckCircle} />
          <DsStatCard label="Workspace" value={workspaceRule?.jurisdiction || "--"} color="gold" icon={Building2} />
          <DsStatCard label="Compliance" value={activeCount > 0 ? "Live" : "Pending"} color="warning" icon={Shield} />
        </div>

        <DsTabBar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

        <div className="mt-6">
          {activeTab === "all" && (
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-50" />
                <Input
                  placeholder="Search jurisdictions..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 bg-transparent border-[var(--ds-border)]"
                  data-testid="input-search-jurisdictions"
                />
              </div>

              {isLoading ? (
                <p className="text-center py-8 opacity-50">Loading jurisdictions...</p>
              ) : filteredRules.length === 0 ? (
                <DsEmptyState 
                  icon={Scale} 
                  title={searchTerm ? "No Match Found" : "No Rules Configured"} 
                  subtitle={searchTerm ? "Try adjusting your search term" : "Labor law rules have not been configured yet"} 
                />
              ) : (
                <div className="space-y-1">
                  {filteredRules.map(rule => (
                    <DsDataRow key={rule.jurisdiction} data-testid={`card-jurisdiction-${rule.jurisdiction}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <DsBadge color="muted" className="text-[10px]">{rule.jurisdiction}</DsBadge>
                          <span className="font-bold text-sm truncate" data-testid={`text-jurisdiction-name-${rule.jurisdiction}`}>
                            {rule.jurisdictionName}
                          </span>
                          <DsBadge color={rule.isActive ? "success" : "muted"} className="ml-auto">
                            {rule.isActive ? "Active" : "Inactive"}
                          </DsBadge>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                          {rule.overtimeEnabled && (
                            <span className="text-[10px] opacity-50 flex items-center gap-1">
                              <Clock size={10} /> OT: {rule.overtimeWeeklyThresholdHours}h/wk @ {rule.overtimeMultiplier}x
                            </span>
                          )}
                          {rule.mealBreakEnabled && (
                            <span className="text-[10px] opacity-50 flex items-center gap-1">
                              <Timer size={10} /> Meal: {rule.mealBreakDurationMinutes}min
                            </span>
                          )}
                          {rule.restBreakEnabled && (
                            <span className="text-[10px] opacity-50 flex items-center gap-1">
                              <Coffee size={10} /> Rest: {rule.restBreakDurationMinutes}min
                            </span>
                          )}
                        </div>
                      </div>
                    </DsDataRow>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "workspace" && (
            <div className="max-w-3xl mx-auto w-full">
              {!workspaceRule || !workspaceRule.jurisdiction ? (
                <DsEmptyState 
                  icon={Building2} 
                  title="No Workspace Configuration" 
                  subtitle="Set your workspace jurisdiction to view applicable labor law rules." 
                />
              ) : (
                <div className="space-y-6">
                  <DsSectionCard 
                    title={`${workspaceRule.jurisdictionName} (${workspaceRule.jurisdiction})`}
                    actions={<DsBadge color={workspaceRule.isActive ? "success" : "muted"}>{workspaceRule.isActive ? "Active" : "Inactive"}</DsBadge>}
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--ds-gold)] mb-2 flex items-center gap-2">
                          <Coffee size={12} /> Rest Breaks
                        </p>
                        <RuleDetailRow label="Enabled" value={workspaceRule.restBreakEnabled} />
                        <RuleDetailRow label="Min Shift Hours" value={workspaceRule.restBreakMinShiftHours} icon={Clock} />
                        <RuleDetailRow label="Duration" value={`${workspaceRule.restBreakDurationMinutes} minutes`} icon={Timer} />
                        <RuleDetailRow label="Paid" value={workspaceRule.restBreakIsPaid} />
                        <RuleDetailRow label="Frequency" value={`Every ${workspaceRule.restBreakFrequencyHours} hours`} />
                      </div>

                      <div className="space-y-1">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--ds-gold)] mb-2 flex items-center gap-2">
                          <Timer size={12} /> Meal Breaks
                        </p>
                        <RuleDetailRow label="Enabled" value={workspaceRule.mealBreakEnabled} />
                        <RuleDetailRow label="Min Shift Hours" value={workspaceRule.mealBreakMinShiftHours} icon={Clock} />
                        <RuleDetailRow label="Duration" value={`${workspaceRule.mealBreakDurationMinutes} minutes`} icon={Timer} />
                        <RuleDetailRow label="Paid" value={workspaceRule.mealBreakIsPaid} />
                        <RuleDetailRow label="Max Delay" value={`${workspaceRule.mealBreakMaxDelayHours} hours`} />
                      </div>

                      <div className="space-y-1">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--ds-gold)] mb-2 flex items-center gap-2">
                          <Clock size={12} /> Overtime
                        </p>
                        <RuleDetailRow label="Enabled" value={workspaceRule.overtimeEnabled} />
                        <RuleDetailRow label="Daily Threshold" value={`${workspaceRule.overtimeDailyThresholdHours} hours`} icon={Clock} />
                        <RuleDetailRow label="Weekly Threshold" value={`${workspaceRule.weeklyThresholdHours} hours`} icon={Clock} />
                        <RuleDetailRow label="Multiplier" value={`${workspaceRule.overtimeMultiplier}x`} />
                        <RuleDetailRow label="Double OT" value={workspaceRule.doubleOvertimeEnabled} />
                      </div>

                      <div className="space-y-1">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--ds-gold)] mb-2 flex items-center gap-2">
                          <CalendarDays size={12} /> Scheduling
                        </p>
                        <RuleDetailRow label="Min Rest Between Shifts" value={`${workspaceRule.minRestBetweenShiftsHours} hours`} icon={Clock} />
                        <RuleDetailRow label="Max Consecutive Days" value={workspaceRule.maxConsecutiveDaysAllowed} icon={CalendarDays} />
                        <RuleDetailRow label="Split Shift Allowed" value={workspaceRule.splitShiftAllowed} />
                        <RuleDetailRow label="Split Shift Premium" value={workspaceRule.splitShiftPremiumRequired} />
                      </div>
                    </div>

                    {workspaceRule.notes && (
                      <div className="mt-8 p-4 rounded-lg bg-black/20 border border-[var(--ds-border)]">
                        <p className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-2">Legal Notes</p>
                        <p className="text-sm opacity-80 leading-relaxed italic">"{workspaceRule.notes}"</p>
                      </div>
                    )}
                  </DsSectionCard>
                </div>
              )}
            </div>
          )}

          {activeTab === "compliance" && (
            <div className="max-w-2xl mx-auto w-full space-y-6">
              <DsSectionCard title="Compliance Health Summary">
                <div className="space-y-6">
                  {[
                    { label: "Active Jurisdictions", current: activeCount, total: allRules.length, icon: CheckCircle, color: "success" },
                    { label: "Overtime Configuration", current: withOvertimeCount, total: allRules.length, icon: Clock, color: "info" },
                    { label: "Break Requirements", current: withBreaksCount, total: allRules.length, icon: Coffee, color: "gold" },
                  ].map(item => (
                    <div key={item.label} className="space-y-2" data-testid={`compliance-${item.label.toLowerCase().replace(/\s+/g, '-')}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <item.icon size={16} className="opacity-50" />
                          <span className="text-sm font-bold uppercase tracking-widest opacity-70">{item.label}</span>
                        </div>
                        <span className="text-sm font-bold">{item.current} / {item.total}</span>
                      </div>
                      <Progress 
                        value={(item.current / Math.max(item.total, 1)) * 100} 
                        className="h-1.5 bg-[var(--ds-navy-light)]"
                      />
                    </div>
                  ))}
                </div>
              </DsSectionCard>

              <DsSectionCard title="Notable Provisions">
                <div className="grid gap-3">
                  {[
                    { label: "Double Overtime Clauses", count: allRules.filter(r => r.doubleOvertimeEnabled).length, icon: Clock },
                    { label: "Split Shift Premiums", count: allRules.filter(r => r.splitShiftPremiumRequired).length, icon: Scale },
                    { label: "Paid Meal Mandates", count: allRules.filter(r => r.mealBreakIsPaid).length, icon: Timer },
                    { label: "Inactive/Pending Jurisdictions", count: allRules.filter(r => !r.isActive).length, icon: AlertTriangle, danger: true },
                  ].map((item, idx) => (
                    <DsDataRow key={idx} className="border border-[var(--ds-border)] rounded-lg">
                      <div className="flex items-center gap-3 w-full">
                        <item.icon size={16} className={cn("opacity-50", item.danger && "text-[var(--ds-danger)]")} />
                        <span className="text-sm opacity-80">{item.label}</span>
                        <DsBadge color={item.danger && item.count > 0 ? "danger" : "muted"} className="ml-auto">
                          {item.count}
                        </DsBadge>
                      </div>
                    </DsDataRow>
                  ))}
                </div>
              </DsSectionCard>
            </div>
          )}
        </div>
      </div>
    </DsPageWrapper>
  );
}
