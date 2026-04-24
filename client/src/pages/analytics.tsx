import { useState } from "react";
import { secureFetch } from "@/lib/csrf";
import { useQuery } from "@tanstack/react-query";
import { 
  DollarSign, Clock, Users, UserCheck, TrendingUp, TrendingDown, 
  FileText, BarChart3, Download, FileSpreadsheet, Calendar, 
  Activity, Target, AlertCircle, ChevronDown, Lightbulb, Award,
  Brain, Sparkles, Zap, AlertTriangle, ArrowUpRight, ArrowDownRight, Minus, MapPin
} from "lucide-react";
import { HideInSimpleMode } from "@/components/SimpleMode";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { CalendarHeatmap } from "@/components/calendar-heatmap";
import { IncidentHeatmap } from "@/components/incident-heatmap";
import "leaflet/dist/leaflet.css";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { exportReport } from "@/lib/exportUtils";
import { useToast } from "@/hooks/use-toast";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig
} from "@/components/ui/chart";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/formatters";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Area,
  AreaChart,
  PieChart,
  Pie,
  Cell,
  Legend,
  Tooltip
} from "recharts";

interface DashboardMetrics {
  totalHours: number;
  totalRevenue: number;
  laborCost: number;
  revenuePerHour: number;
  utilizationRate: number;
  activeEmployees: number;
  activeClients: number;
  pendingInvoices: number;
  paidInvoices: number;
  comparison?: {
    hoursChange: number;
    revenueChange: number;
    laborCostChange: number;
  };
  trends: { period: string; hours: number; revenue: number; laborCost: number }[];
}

interface TimeUsageMetrics {
  totalHours: number;
  byEmployee: { employeeId: string; name: string; totalHours: number; regularHours: number; overtimeHours: number }[];
  byClient: { clientId: string; name: string; totalHours: number; revenue: number }[];
  byDay: { date: string; hours: number; employeeCount: number }[];
  overtimeHours: number;
  averageHoursPerDay: number;
}

interface SchedulingMetrics {
  totalShifts: number;
  completedShifts: number;
  cancelledShifts: number;
  noShows: number;
  fillRate: number;
  coverageRate: number;
  averageShiftDuration: number;
  byStatus: { status: string; count: number }[];
  byDay: { day: string; scheduled: number; completed: number }[];
}

interface RevenueMetrics {
  totalInvoiced: number;
  totalPaid: number;
  totalPending: number;
  totalOverdue: number;
  averageInvoiceAmount: number;
  collectionRate: number;
  byClient: { clientId: string; name: string; invoiced: number; paid: number }[];
  byMonth: { month: string; invoiced: number; paid: number }[];
  platformFees: number;
  netRevenue: number;
}

interface EmployeePerformance {
  employeeId: string;
  name: string;
  totalShifts: number;
  completedShifts: number;
  noShows: number;
  lateArrivals: number;
  attendanceRate: number;
  punctualityRate: number;
  totalHours: number;
}

interface EmployeePerformanceMetrics {
  employees: EmployeePerformance[];
  averageAttendanceRate: number;
  averagePunctualityRate: number;
  topPerformers: EmployeePerformance[];
}

interface Anomaly {
  type: 'hours' | 'revenue' | 'attendance' | 'scheduling';
  severity: 'low' | 'medium' | 'high';
  description: string;
  metric: string;
  deviation: number;
}

interface Forecast {
  metric: string;
  currentValue: number;
  projectedValue: number;
  trend: 'up' | 'down' | 'stable';
  confidence: number;
  period: string;
}

interface InsightsData {
  insights: string[];
  recommendations: string[];
  anomalies: Anomaly[];
  forecasts: Forecast[];
}

const DATE_PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'this_week', label: 'This Week' },
  { value: 'last_week', label: 'Last Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'this_quarter', label: 'This Quarter' },
  { value: 'last_quarter', label: 'Last Quarter' },
  { value: 'this_year', label: 'This Year' },
  { value: 'last_30_days', label: 'Last 30 Days' },
];

import { CHART_PALETTE, CHART_SERIES } from "@/lib/chartPalette";

const trendChartConfig = {
  hours: { label: "Hours", color: CHART_PALETTE.BRAND },
  revenue: { label: "Revenue", color: CHART_PALETTE.INFO },
  labor_cost: { label: "Labor Cost", color: CHART_PALETTE.SUCCESS },
} satisfies ChartConfig;

const schedulingChartConfig = {
  scheduled: { label: "Scheduled", color: CHART_PALETTE.INFO },
  completed: { label: "Completed", color: CHART_PALETTE.SUCCESS },
} satisfies ChartConfig;

function MetricCard({ 
  title, 
  value, 
  subtitle, 
  icon: Icon, 
  change, 
  colorClass = "from-primary/10 to-blue-500/5",
  borderClass = "border-primary/20"
}: { 
  title: string; 
  value: string | number; 
  subtitle?: string; 
  icon: any;
  change?: number;
  colorClass?: string;
  borderClass?: string;
}) {
  return (
    <Card className={`group backdrop-blur-xl bg-gradient-to-br ${colorClass} border ${borderClass} hover:shadow-sm transition-all duration-300`}>
      <CardContent className="p-3 sm:p-6">
        <div className="flex items-center justify-between gap-2 mb-2 sm:mb-4">
          <div className="p-2 sm:p-3 bg-muted/20 rounded-md shrink-0">
            <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
          </div>
          {change !== undefined && (
            <Badge variant={change >= 0 ? "default" : "destructive"} className="gap-1">
              {change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {Math.abs(change)}%
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground text-xs sm:text-sm mb-1 sm:mb-2 truncate">{title}</p>
        <div className="text-base sm:text-2xl font-bold text-foreground mb-1 truncate" data-testid={`text-${title.toLowerCase().replace(/\s+/g, '-')}`}>
          {value}
        </div>
        {subtitle && <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

function UtilizationGauge({ value }: { value: number }) {
  const getColor = (v: number) => {
    if (v >= 90) return 'text-green-500 dark:text-green-400';
    if (v >= 70) return 'text-cyan-500 dark:text-cyan-400';
    if (v >= 50) return 'text-cyan-400 dark:text-cyan-300';
    return 'text-red-500 dark:text-red-400';
  };

  return (
    <div className="flex flex-col items-center justify-center p-6">
      <div className="relative w-32 h-32">
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            className="text-muted/20"
          />
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            strokeDasharray={`${value * 2.51} 251`}
            strokeLinecap="round"
            className={getColor(value)}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center flex-col">
          <span className={`text-2xl font-bold ${getColor(value)}`}>{value}%</span>
          <span className="text-xs text-muted-foreground">Utilization</span>
        </div>
      </div>
    </div>
  );
}

function EmployeeLeaderboard({ employees }: { employees: EmployeePerformance[] }) {
  return (
    <div className="space-y-3">
      {employees.slice(0, 5).map((emp, index) => (
        <div key={emp.employeeId} className="flex items-center gap-3 p-3 rounded-md bg-muted/50">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
            index === 0 ? 'bg-cyan-500/20 text-cyan-600' :
            index === 1 ? 'bg-slate-400/20 text-slate-500' :
            index === 2 ? 'bg-teal-500/20 text-teal-600' :
            'bg-muted text-muted-foreground'
          }`}>
            {index + 1}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">{emp.name}</p>
            <p className="text-xs text-muted-foreground">
              {(emp.totalHours ?? 0).toFixed(1)} hrs | {emp.attendanceRate}% attendance
            </p>
          </div>
          <div className="text-right">
            <Badge variant={emp.attendanceRate >= 95 ? "default" : emp.attendanceRate >= 80 ? "secondary" : "destructive"}>
              {emp.attendanceRate}%
            </Badge>
          </div>
        </div>
      ))}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <Card key={i}>
            <CardContent className="p-6">
              <Skeleton className="h-10 w-10 rounded-md mb-4" />
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-8 w-32 mb-1" />
              <Skeleton className="h-3 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[300px] w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[300px] w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function AIInsightsPanel({ 
  insights, 
  recommendations, 
  anomalies, 
  forecasts,
  isLoading 
}: { 
  insights: string[]; 
  recommendations: string[];
  anomalies: Anomaly[];
  forecasts: Forecast[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <Card className="backdrop-blur-xl bg-gradient-to-br from-blue-500/10 to-cyan-500/5 border border-blue-500/20">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-blue-500 dark:text-blue-400 animate-pulse" />
            <CardTitle>AI-Powered Insights</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-5/6" />
        </CardContent>
      </Card>
    );
  }

  const hasContent = insights.length > 0 || recommendations.length > 0 || anomalies.length > 0 || forecasts.length > 0;

  if (!hasContent) {
    return (
      <Card className="backdrop-blur-xl bg-gradient-to-br from-blue-500/10 to-cyan-500/5 border border-blue-500/20">
        <CardContent className="p-8 text-center">
          <Brain className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No AI insights available yet. Add more data to enable intelligent analysis.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {(insights.length > 0 || recommendations.length > 0) && (
        <Card className="backdrop-blur-xl bg-gradient-to-br from-blue-500/10 to-cyan-500/5 border border-blue-500/20">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-blue-500 dark:text-blue-400" />
              <CardTitle>AI-Powered Insights</CardTitle>
            </div>
            <CardDescription>Intelligent analysis of your business metrics</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {insights.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Sparkles className="w-4 h-4" />
                  <span>Key Insights</span>
                </div>
                <div className="space-y-2">
                  {insights.slice(0, 5).map((insight, i) => (
                    <div key={i} className="flex items-start gap-2 p-3 bg-muted/30 rounded-md">
                      <Lightbulb className="w-4 h-4 mt-0.5 text-cyan-500 flex-shrink-0" />
                      <p className="text-sm">{insight}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {recommendations.length > 0 && (
              <div className="space-y-2 pt-2 border-t">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Zap className="w-4 h-4" />
                  <span>Recommendations</span>
                </div>
                <div className="space-y-2">
                  {recommendations.slice(0, 4).map((rec, i) => (
                    <div key={i} className="flex items-start gap-2 p-3 bg-green-500/10 rounded-md border border-green-500/20">
                      <Target className="w-4 h-4 mt-0.5 text-green-500 dark:text-green-400 flex-shrink-0" />
                      <p className="text-sm">{rec}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <HideInSimpleMode>
        <div className="space-y-6">
          {anomalies.length > 0 && (
            <Card className="backdrop-blur-xl bg-gradient-to-br from-teal-500/10 to-cyan-500/5 border border-teal-500/20">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-teal-500" />
                  <CardTitle>Anomalies Detected</CardTitle>
                </div>
                <CardDescription>Areas requiring attention</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {anomalies.slice(0, 5).map((anomaly, i) => (
                  <div 
                    key={i} 
                    className={`flex items-start gap-3 p-3 rounded-md ${
                      anomaly.severity === 'high' ? 'bg-red-500/10 border border-red-500/20' :
                      anomaly.severity === 'medium' ? 'bg-teal-500/10 border border-teal-500/20' :
                      'bg-cyan-500/10 border border-cyan-500/20'
                    }`}
                  >
                    <Badge 
                      variant={anomaly.severity === 'high' ? 'destructive' : 'secondary'}
                      className="flex-shrink-0"
                    >
                      {anomaly.severity}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium capitalize">{anomaly.type}</p>
                      <p className="text-sm text-muted-foreground">{anomaly.description}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {forecasts.length > 0 && (
            <Card className="backdrop-blur-xl bg-gradient-to-br from-cyan-500/10 to-blue-500/5 border border-cyan-500/20">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-cyan-500" />
                  <CardTitle>Forecasts</CardTitle>
                </div>
                <CardDescription>Projected trends for next period</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {forecasts.slice(0, 4).map((forecast, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 p-3 bg-muted/30 rounded-md">
                    <div className="flex items-center gap-2">
                      {forecast.trend === 'up' ? (
                        <ArrowUpRight className="w-4 h-4 text-green-500" />
                      ) : forecast.trend === 'down' ? (
                        <ArrowDownRight className="w-4 h-4 text-red-500" />
                      ) : (
                        <Minus className="w-4 h-4 text-muted-foreground" />
                      )}
                      <span className="text-sm font-medium">{forecast.metric}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">
                        {forecast.metric.includes('Rate') 
                          ? `${forecast.projectedValue.toFixed(1)}%`
                          : forecast.metric.includes('Revenue') || forecast.metric.includes('$')
                            ? `$${forecast.projectedValue.toLocaleString()}`
                            : forecast.projectedValue.toLocaleString('en-US', { maximumFractionDigits: 1 })}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {forecast.confidence}% confidence
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </HideInSimpleMode>
    </div>
  );
}

const analyticsPageConfig: CanvasPageConfig = {
  id: 'analytics',
  title: 'Analytics Dashboard',
  subtitle: 'Track your business performance and key metrics',
  category: 'operations',
  maxWidth: '7xl',
};

export default function Analytics() {
  const { toast } = useToast();
  const [period, setPeriod] = useState('last_30_days');
  const [activeTab, setActiveTab] = useState('overview');

  const { data: dashboard, isLoading: dashboardLoading } = useQuery<{ data: DashboardMetrics }>({
    queryKey: ['/api/analytics/dashboard', period],
    queryFn: async () => {
      const res = await secureFetch(`/api/analytics/dashboard?period=${period}`);
      if (!res.ok) throw new Error('Failed to fetch dashboard');
      return res.json();
    }
  });

  const { data: timeUsage, isLoading: timeUsageLoading } = useQuery<{ data: TimeUsageMetrics }>({
    queryKey: ['/api/analytics/time-usage', period],
    queryFn: async () => {
      const res = await secureFetch(`/api/analytics/time-usage?period=${period}`);
      if (!res.ok) throw new Error('Failed to fetch time usage');
      return res.json();
    },
    enabled: activeTab === 'time' || activeTab === 'overview'
  });

  const { data: scheduling, isLoading: schedulingLoading } = useQuery<{ data: SchedulingMetrics }>({
    queryKey: ['/api/analytics/scheduling', period],
    queryFn: async () => {
      const res = await secureFetch(`/api/analytics/scheduling?period=${period}`);
      if (!res.ok) throw new Error('Failed to fetch scheduling');
      return res.json();
    },
    enabled: activeTab === 'scheduling' || activeTab === 'overview'
  });

  const { data: revenue, isLoading: revenueLoading } = useQuery<{ data: RevenueMetrics }>({
    queryKey: ['/api/analytics/revenue', period],
    queryFn: async () => {
      const res = await secureFetch(`/api/analytics/revenue?period=${period}`);
      if (!res.ok) throw new Error('Failed to fetch revenue');
      return res.json();
    },
    enabled: activeTab === 'revenue' || activeTab === 'overview'
  });

  const { data: performance, isLoading: performanceLoading } = useQuery<{ data: EmployeePerformanceMetrics }>({
    queryKey: ['/api/analytics/employee-performance', period],
    queryFn: async () => {
      const res = await secureFetch(`/api/analytics/employee-performance?period=${period}`);
      if (!res.ok) throw new Error('Failed to fetch performance');
      return res.json();
    },
    enabled: activeTab === 'employees' || activeTab === 'overview'
  });

  const { data: insightsData, isLoading: insightsLoading } = useQuery<{ data: InsightsData }>({
    queryKey: ['/api/analytics/insights', period],
    queryFn: async () => {
      const res = await secureFetch(`/api/analytics/insights?period=${period}`);
      if (!res.ok) throw new Error('Failed to fetch insights');
      return res.json();
    }
  });

  const handleExport = (format: 'csv' | 'pdf') => {
    if (!dashboard?.data) {
      toast({
        title: "Analytics not ready yet",
        description: "Export becomes available after this dashboard finishes loading data for the selected period.",
        variant: "destructive",
      });
      return;
    }

    const d = dashboard.data;
    const exportData = [
      { metric: 'Total Hours', value: formatNumber(d.totalHours), category: 'Operations' },
      { metric: 'Total Revenue', value: formatCurrency(d.totalRevenue), category: 'Financial' },
      { metric: 'Labor Cost', value: formatCurrency(d.laborCost), category: 'Financial' },
      { metric: 'Revenue Per Hour', value: formatCurrency(d.revenuePerHour), category: 'KPI' },
      { metric: 'Utilization Rate', value: formatPercent(d.utilizationRate), category: 'KPI' },
      { metric: 'Active Employees', value: formatNumber(d.activeEmployees), category: 'Team' },
      { metric: 'Active Clients', value: formatNumber(d.activeClients), category: 'Business' },
      { metric: 'Pending Invoices', value: formatNumber(d.pendingInvoices), category: 'Billing' },
      { metric: 'Paid Invoices', value: formatNumber(d.paidInvoices), category: 'Billing' },
    ];

    if (d.comparison) {
      exportData.push(
        { metric: 'Hours Change', value: `${d.comparison.hoursChange}%`, category: 'Comparison' },
        { metric: 'Revenue Change', value: `${d.comparison.revenueChange}%`, category: 'Comparison' },
        { metric: 'Labor Cost Change', value: `${d.comparison.laborCostChange}%`, category: 'Comparison' }
      );
    }

    exportReport(format, 'Analytics Dashboard', exportData, {
      columns: ['metric', 'value', 'category'],
      columnLabels: { metric: 'Metric', value: 'Value', category: 'Category' },
      onPopupBlocked: () => {
        toast({
          title: "Pop-up Blocked",
          description: "Please allow pop-ups for this site to download PDF reports.",
          variant: "destructive",
        });
      },
    });

    if (format === 'csv') {
      toast({
        title: "CSV Export Started",
        description: "Your analytics report is downloading",
      });
    }
  };

  const isLoading = dashboardLoading && activeTab === 'overview';
  const insights = insightsData?.data?.insights || [];
  const recommendations = insightsData?.data?.recommendations || [];
  const anomalies = insightsData?.data?.anomalies || [];
  const forecasts = insightsData?.data?.forecasts || [];

  const actionButtons = (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={period} onValueChange={setPeriod}>
        <SelectTrigger className="w-full md:w-[160px]" data-testid="select-period">
          <Calendar className="w-4 h-4 mr-2" />
          <SelectValue placeholder="Select period" />
        </SelectTrigger>
        <SelectContent>
          {DATE_PRESETS.map(preset => (
            <SelectItem key={preset.value} value={preset.value}>
              {preset.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size="sm"
        onClick={() => handleExport('csv')}
        data-testid="button-export-csv"
        className="gap-2"
      >
        <FileSpreadsheet className="h-4 w-4" />
        <span className="hidden sm:inline">CSV</span>
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => handleExport('pdf')}
        data-testid="button-export-pdf"
        className="gap-2"
      >
        <Download className="h-4 w-4" />
        <span className="hidden sm:inline">PDF</span>
      </Button>
    </div>
  );

  const analyticsConfig: CanvasPageConfig = {
    ...analyticsPageConfig,
    headerActions: actionButtons,
  };

  return (
    <CanvasHubPage config={analyticsConfig}>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 sm:grid-cols-6 lg:w-auto lg:inline-grid">
            <TabsTrigger value="overview" className="gap-2" data-testid="tab-overview">
              <BarChart3 className="w-4 h-4 hidden sm:inline" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="time" className="gap-2" data-testid="tab-time">
              <Clock className="w-4 h-4 hidden sm:inline" />
              Time
            </TabsTrigger>
            <TabsTrigger value="scheduling" className="gap-2" data-testid="tab-scheduling">
              <Calendar className="w-4 h-4 hidden sm:inline" />
              Scheduling
            </TabsTrigger>
            <TabsTrigger value="revenue" className="gap-2" data-testid="tab-revenue">
              <DollarSign className="w-4 h-4 hidden sm:inline" />
              Revenue
            </TabsTrigger>
            <TabsTrigger value="employees" className="gap-2" data-testid="tab-employees">
              <Users className="w-4 h-4 hidden sm:inline" />
              Employees
            </TabsTrigger>
            <TabsTrigger value="incidents" className="gap-2" data-testid="tab-incidents">
              <MapPin className="w-4 h-4 hidden sm:inline" />
              Incidents
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {isLoading ? (
              <LoadingSkeleton />
            ) : dashboard?.data ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <MetricCard
                    title="Total Hours"
                    value={formatNumber(dashboard.data.totalHours)}
                    subtitle="Hours tracked"
                    icon={Clock}
                    change={dashboard.data.comparison?.hoursChange}
                  />
                  <MetricCard
                    title="Total Revenue"
                    value={formatCurrency(dashboard.data.totalRevenue, 0)}
                    subtitle="Invoiced amount"
                    icon={DollarSign}
                    change={dashboard.data.comparison?.revenueChange}
                    colorClass="from-green-500/10 to-emerald-500/5"
                    borderClass="border-green-500/20"
                  />
                  <MetricCard
                    title="Active Employees"
                    value={formatNumber(dashboard.data.activeEmployees)}
                    subtitle="Working this period"
                    icon={UserCheck}
                    colorClass="from-blue-500/10 to-indigo-500/5"
                    borderClass="border-blue-500/20"
                  />
                  <MetricCard
                    title="Active Clients"
                    value={formatNumber(dashboard.data.activeClients)}
                    subtitle="With time entries"
                    icon={Users}
                    colorClass="from-purple-500/10 to-violet-500/5"
                    borderClass="border-purple-500/20"
                  />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <Card className="lg:col-span-2">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-primary" />
                        Trends Over Time
                      </CardTitle>
                      <CardDescription>Hours worked and revenue by day</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {dashboard.data.trends && dashboard.data.trends.length > 0 ? (
                        <ChartContainer config={trendChartConfig} className="h-[300px]">
                          <AreaChart data={dashboard.data.trends}>
                            <defs>
                              <linearGradient id="colorHours" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={CHART_PALETTE.BRAND} stopOpacity={0.3}/>
                                <stop offset="95%" stopColor={CHART_PALETTE.BRAND} stopOpacity={0}/>
                              </linearGradient>
                              <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={CHART_PALETTE.INFO} stopOpacity={0.3}/>
                                <stop offset="95%" stopColor={CHART_PALETTE.INFO} stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis 
                              dataKey="period" 
                              tickFormatter={(v) => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              className="text-xs"
                            />
                            <YAxis yAxisId="left" className="text-xs" />
                            <YAxis yAxisId="right" orientation="right" className="text-xs" />
                            <ChartTooltip content={<ChartTooltipContent />} />
                            <Area
                              yAxisId="left"
                              type="monotone"
                              dataKey="hours"
                              stroke={CHART_PALETTE.BRAND}
                              fillOpacity={1}
                              fill="url(#colorHours)"
                              name="Hours"
                            />
                            <Area
                              yAxisId="right"
                              type="monotone"
                              dataKey="revenue"
                              stroke={CHART_PALETTE.INFO}
                              fillOpacity={1}
                              fill="url(#colorRevenue)"
                              name="Revenue"
                            />
                          </AreaChart>
                        </ChartContainer>
                      ) : (
                        <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                          No trend data available
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Target className="w-5 h-5 text-primary" />
                        Utilization Rate
                      </CardTitle>
                      <CardDescription>Actual vs scheduled hours</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <UtilizationGauge value={dashboard.data.utilizationRate} />
                      <div className="mt-4 space-y-3">
                        <div className="flex justify-between gap-2 text-sm">
                          <span className="text-muted-foreground">Revenue/Hour</span>
                          <span className="font-medium">{formatCurrency(dashboard.data.revenuePerHour)}</span>
                        </div>
                        <div className="flex justify-between gap-2 text-sm">
                          <span className="text-muted-foreground">Labor Cost</span>
                          <span className="font-medium">{formatCurrency(dashboard.data.laborCost, 0)}</span>
                        </div>
                        <div className="flex justify-between gap-2 text-sm">
                          <span className="text-muted-foreground">Invoices Pending</span>
                          <span className="font-medium">{formatNumber(dashboard.data.pendingInvoices)}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {performance?.data && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Award className="w-5 h-5 text-yellow-500" />
                          Top Performers
                        </CardTitle>
                        <CardDescription>By hours and attendance</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <EmployeeLeaderboard employees={performance.data.topPerformers} />
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Activity className="w-5 h-5 text-primary" />
                          Team Performance
                        </CardTitle>
                        <CardDescription>Overall metrics</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        <div>
                          <div className="flex justify-between gap-2 mb-2">
                            <span className="text-sm text-muted-foreground">Average Attendance</span>
                            <span className="text-sm font-medium">{performance.data.averageAttendanceRate}%</span>
                          </div>
                          <Progress value={performance.data.averageAttendanceRate} className="h-2" />
                        </div>
                        <div>
                          <div className="flex justify-between gap-2 mb-2">
                            <span className="text-sm text-muted-foreground">Average Punctuality</span>
                            <span className="text-sm font-medium">{performance.data.averagePunctualityRate}%</span>
                          </div>
                          <Progress value={performance.data.averagePunctualityRate} className="h-2" />
                        </div>
                        <div className="pt-4 border-t">
                          <div className="flex justify-between gap-2 text-sm">
                            <span className="text-muted-foreground">Active Employees</span>
                            <span className="font-medium">{performance.data.employees.length}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}

                <AIInsightsPanel
                  insights={insights}
                  recommendations={recommendations}
                  anomalies={anomalies}
                  forecasts={forecasts}
                  isLoading={insightsLoading}
                />
              </>
            ) : (
              <Card>
                <CardContent className="p-12 text-center">
                  <BarChart3 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No analytics data available for this period</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="time" className="space-y-6">
            {timeUsageLoading ? (
              <LoadingSkeleton />
            ) : timeUsage?.data ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <MetricCard
                    title="Total Hours"
                    value={formatNumber(timeUsage.data.totalHours)}
                    subtitle="All time entries"
                    icon={Clock}
                  />
                  <MetricCard
                    title="Overtime Hours"
                    value={formatNumber(timeUsage.data.overtimeHours)}
                    subtitle="Above 8hrs/day"
                    icon={AlertCircle}
                    colorClass="from-orange-500/10 to-amber-500/5"
                    borderClass="border-orange-500/20"
                  />
                  <MetricCard
                    title="Avg Hours/Day"
                    value={formatNumber(timeUsage.data.averageHoursPerDay)}
                    subtitle="Per working day"
                    icon={Activity}
                  />
                  <MetricCard
                    title="Employees"
                    value={formatNumber(timeUsage.data.byEmployee.length)}
                    subtitle="With time entries"
                    icon={Users}
                  />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Hours by Employee</CardTitle>
                      <CardDescription>Top performers by hours tracked</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {timeUsage.data.byEmployee.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                          <BarChart data={timeUsage.data.byEmployee.slice(0, 10)} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis type="number" className="text-xs" />
                            <YAxis dataKey="name" type="category" width={100} className="text-xs" />
                            <Tooltip />
                            <Bar dataKey="totalHours" fill={CHART_PALETTE.BRAND} radius={[0, 4, 4, 0]} name="Total Hours" />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                          No employee data available
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Hours by Client</CardTitle>
                      <CardDescription>Time allocation by client</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {timeUsage.data.byClient.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                          <PieChart>
                            <Pie
                              data={timeUsage.data.byClient.slice(0, 6)}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={100}
                              paddingAngle={2}
                              dataKey="totalHours"
                              nameKey="name"
                              label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                              labelLine={false}
                            >
                              {timeUsage.data.byClient.slice(0, 6).map((_, index) => (
                                <Cell key={`cell-${index}`} fill={CHART_SERIES[index % CHART_SERIES.length]} />
                              ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                          No client data available
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </>
            ) : (
              <Card>
                <CardContent className="p-12 text-center">
                  <Clock className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No time usage data available for this period</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="scheduling" className="space-y-6">
            {schedulingLoading ? (
              <LoadingSkeleton />
            ) : scheduling?.data ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <MetricCard
                    title="Total Shifts"
                    value={scheduling.data.totalShifts}
                    subtitle="Scheduled"
                    icon={Calendar}
                  />
                  <MetricCard
                    title="Fill Rate"
                    value={`${scheduling.data.fillRate}%`}
                    subtitle="Shifts with employees"
                    icon={UserCheck}
                    colorClass={scheduling.data.fillRate >= 80 ? "from-green-500/10 to-emerald-500/5" : "from-red-500/10 to-orange-500/5"}
                    borderClass={scheduling.data.fillRate >= 80 ? "border-green-500/20" : "border-red-500/20"}
                  />
                  <MetricCard
                    title="Coverage Rate"
                    value={`${scheduling.data.coverageRate}%`}
                    subtitle="Completed shifts"
                    icon={Target}
                  />
                  <MetricCard
                    title="No Shows"
                    value={scheduling.data.noShows}
                    subtitle="This period"
                    icon={AlertCircle}
                    colorClass="from-red-500/10 to-orange-500/5"
                    borderClass="border-red-500/20"
                  />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Shifts by Day</CardTitle>
                      <CardDescription>Scheduled vs completed</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {scheduling.data.byDay.length > 0 ? (
                        <ChartContainer config={schedulingChartConfig} className="h-[300px]">
                          <BarChart data={scheduling.data.byDay}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis dataKey="day" className="text-xs" />
                            <YAxis className="text-xs" />
                            <ChartTooltip content={<ChartTooltipContent />} />
                            <Bar dataKey="scheduled" fill={CHART_PALETTE.INFO} radius={[4, 4, 0, 0]} name="Scheduled" />
                            <Bar dataKey="completed" fill={CHART_PALETTE.SUCCESS} radius={[4, 4, 0, 0]} name="Completed" />
                          </BarChart>
                        </ChartContainer>
                      ) : (
                        <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                          No daily data available
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Shift Status</CardTitle>
                      <CardDescription>Breakdown by status</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {scheduling.data.byStatus.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                          <PieChart>
                            <Pie
                              data={scheduling.data.byStatus}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={100}
                              paddingAngle={2}
                              dataKey="count"
                              nameKey="status"
                              label={({ status, percent }) => `${status}: ${(percent * 100).toFixed(0)}%`}
                            >
                              {scheduling.data.byStatus.map((_, index) => (
                                <Cell key={`cell-${index}`} fill={CHART_SERIES[index % CHART_SERIES.length]} />
                              ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                          No status data available
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <CalendarHeatmap showAIInsights={true} />
              </>
            ) : (
              <Card>
                <CardContent className="p-12 text-center">
                  <Calendar className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No scheduling data available for this period</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="revenue" className="space-y-6">
            {revenueLoading ? (
              <LoadingSkeleton />
            ) : revenue?.data ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <MetricCard
                    title="Total Invoiced"
                    value={`$${revenue.data.totalInvoiced.toLocaleString('en-US', { maximumFractionDigits: 0 })}`}
                    subtitle="All invoices"
                    icon={FileText}
                    colorClass="from-blue-500/10 to-indigo-500/5"
                    borderClass="border-blue-500/20"
                  />
                  <MetricCard
                    title="Total Paid"
                    value={`$${revenue.data.totalPaid.toLocaleString('en-US', { maximumFractionDigits: 0 })}`}
                    subtitle="Collected"
                    icon={DollarSign}
                    colorClass="from-green-500/10 to-emerald-500/5"
                    borderClass="border-green-500/20"
                  />
                  <MetricCard
                    title="Pending"
                    value={`$${revenue.data.totalPending.toLocaleString('en-US', { maximumFractionDigits: 0 })}`}
                    subtitle="Awaiting payment"
                    icon={Clock}
                    colorClass="from-yellow-500/10 to-amber-500/5"
                    borderClass="border-yellow-500/20"
                  />
                  <MetricCard
                    title="Overdue"
                    value={`$${revenue.data.totalOverdue.toLocaleString('en-US', { maximumFractionDigits: 0 })}`}
                    subtitle="Past due date"
                    icon={AlertCircle}
                    colorClass="from-red-500/10 to-orange-500/5"
                    borderClass="border-red-500/20"
                  />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <Card className="lg:col-span-2">
                    <CardHeader>
                      <CardTitle>Revenue by Month</CardTitle>
                      <CardDescription>Invoiced vs collected</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {revenue.data.byMonth.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                          <BarChart data={revenue.data.byMonth}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis dataKey="month" className="text-xs" />
                            <YAxis className="text-xs" />
                            <Tooltip formatter={(value: number) => `$${value.toLocaleString()}`} />
                            <Legend />
                            <Bar dataKey="invoiced" fill={CHART_PALETTE.INFO} radius={[4, 4, 0, 0]} name="Invoiced" />
                            <Bar dataKey="paid" fill={CHART_PALETTE.SUCCESS} radius={[4, 4, 0, 0]} name="Paid" />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                          No monthly data available
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Collection Rate</CardTitle>
                      <CardDescription>Payment performance</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col items-center justify-center h-[300px]">
                      <div className="relative w-32 h-32">
                        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                          <circle
                            cx="50"
                            cy="50"
                            r="40"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="8"
                            className="text-muted/20"
                          />
                          <circle
                            cx="50"
                            cy="50"
                            r="40"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="8"
                            strokeDasharray={`${revenue.data.collectionRate * 2.51} 251`}
                            strokeLinecap="round"
                            className="text-green-500"
                          />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center flex-col">
                          <span className="text-2xl font-bold text-green-500">{revenue.data.collectionRate}%</span>
                          <span className="text-xs text-muted-foreground">Collected</span>
                        </div>
                      </div>
                      <div className="mt-6 space-y-2 w-full">
                        <div className="flex justify-between gap-2 text-sm">
                          <span className="text-muted-foreground">Avg Invoice</span>
                          <span className="font-medium">${revenue.data.averageInvoiceAmount.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                        </div>
                        <div className="flex justify-between gap-2 text-sm">
                          <span className="text-muted-foreground">Net Revenue</span>
                          <span className="font-medium">${revenue.data.netRevenue.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                        </div>
                        <div className="flex justify-between gap-2 text-sm">
                          <span className="text-muted-foreground">Platform Fees</span>
                          <span className="font-medium">${revenue.data.platformFees.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Top Clients by Revenue</CardTitle>
                    <CardDescription>Invoiced vs paid amounts</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {revenue.data.byClient.slice(0, 5).map((client, index) => (
                        <div key={client.clientId} className="flex items-center gap-4">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                            {index + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{client.name}</p>
                            <div className="flex gap-4 text-sm text-muted-foreground">
                              <span>Invoiced: ${client.invoiced.toLocaleString()}</span>
                              <span>Paid: ${client.paid.toLocaleString()}</span>
                            </div>
                          </div>
                          <Progress 
                            value={client.invoiced > 0 ? (client.paid / client.invoiced) * 100 : 0} 
                            className="w-24 h-2" 
                          />
                        </div>
                      ))}
                      {revenue.data.byClient.length === 0 && (
                        <p className="text-center text-muted-foreground py-8">No client revenue data available</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card>
                <CardContent className="p-12 text-center">
                  <DollarSign className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No revenue data available for this period</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="employees" className="space-y-6">
            {performanceLoading ? (
              <LoadingSkeleton />
            ) : performance?.data ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <MetricCard
                    title="Total Employees"
                    value={performance.data.employees.length}
                    subtitle="Active this period"
                    icon={Users}
                  />
                  <MetricCard
                    title="Avg Attendance"
                    value={`${performance.data.averageAttendanceRate}%`}
                    subtitle="Across all employees"
                    icon={UserCheck}
                    colorClass={performance.data.averageAttendanceRate >= 90 ? "from-green-500/10 to-emerald-500/5" : "from-yellow-500/10 to-amber-500/5"}
                    borderClass={performance.data.averageAttendanceRate >= 90 ? "border-green-500/20" : "border-yellow-500/20"}
                  />
                  <MetricCard
                    title="Avg Punctuality"
                    value={`${performance.data.averagePunctualityRate}%`}
                    subtitle="On-time arrivals"
                    icon={Clock}
                  />
                  <MetricCard
                    title="Top Performers"
                    value={performance.data.topPerformers.filter(e => e.attendanceRate >= 95).length}
                    subtitle="95%+ attendance"
                    icon={Award}
                    colorClass="from-yellow-500/10 to-amber-500/5"
                    borderClass="border-yellow-500/20"
                  />
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Award className="w-5 h-5 text-yellow-500" />
                      Employee Leaderboard
                    </CardTitle>
                    <CardDescription>Performance rankings</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {performance.data.employees.slice(0, 10).map((emp, index) => (
                        <div key={emp.employeeId} className="flex items-center gap-3 p-3 rounded-md bg-muted/50 hover-elevate">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
                            index === 0 ? 'bg-yellow-500/20 text-yellow-600' :
                            index === 1 ? 'bg-slate-400/20 text-slate-500' :
                            index === 2 ? 'bg-orange-500/20 text-orange-600' :
                            'bg-muted text-muted-foreground'
                          }`}>
                            {index + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{emp.name}</p>
                            <div className="flex gap-4 text-xs text-muted-foreground">
                              <span>{(emp.totalHours ?? 0).toFixed(1)} hrs</span>
                              <span>{emp.completedShifts} shifts</span>
                              {emp.noShows > 0 && <span className="text-red-500">{emp.noShows} no-shows</span>}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Badge variant={emp.attendanceRate >= 95 ? "default" : emp.attendanceRate >= 80 ? "secondary" : "destructive"}>
                              {emp.attendanceRate}% attend
                            </Badge>
                            <Badge variant="outline">
                              {emp.punctualityRate}% on-time
                            </Badge>
                          </div>
                        </div>
                      ))}
                      {performance.data.employees.length === 0 && (
                        <p className="text-center text-muted-foreground py-8">No employee data available</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card>
                <CardContent className="p-12 text-center">
                  <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No employee performance data available for this period</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="incidents" className="space-y-6">
            <IncidentHeatmap />
          </TabsContent>
      </Tabs>
    </CanvasHubPage>
  );
}
