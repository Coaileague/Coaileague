/**
 * Advanced Analytics Service
 * Provides comprehensive business metrics for the analytics dashboard
 */

import { db } from "../db";
import { 
  timeEntries, 
  shifts, 
  invoices, 
  employees, 
  clients,
  payrollEntries,
  payments
} from "@shared/schema";
import { eq, and, gte, lte, sql, count, sum, avg, desc, asc, isNotNull } from "drizzle-orm";

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export interface DashboardMetrics {
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
  trends: TrendData[];
  aiInsights?: string[];
}

export interface TrendData {
  period: string;
  hours: number;
  revenue: number;
  laborCost: number;
}

export interface TimeUsageMetrics {
  totalHours: number;
  byEmployee: EmployeeHours[];
  byClient: ClientHours[];
  byDay: DailyHours[];
  overtimeHours: number;
  averageHoursPerDay: number;
}

export interface EmployeeHours {
  employeeId: string;
  name: string;
  totalHours: number;
  regularHours: number;
  overtimeHours: number;
  efficiency: number;
}

export interface ClientHours {
  clientId: string;
  name: string;
  totalHours: number;
  revenue: number;
}

export interface DailyHours {
  date: string;
  hours: number;
  employeeCount: number;
}

export interface SchedulingMetrics {
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

export interface RevenueMetrics {
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

export interface EmployeePerformanceMetrics {
  employees: EmployeePerformance[];
  averageAttendanceRate: number;
  averagePunctualityRate: number;
  topPerformers: EmployeePerformance[];
}

export interface EmployeePerformance {
  employeeId: string;
  name: string;
  totalShifts: number;
  completedShifts: number;
  noShows: number;
  lateArrivals: number;
  attendanceRate: number;
  punctualityRate: number;
  totalHours: number;
  averageRating?: number;
}

function getDateRange(preset: string): DateRange {
  const now = new Date();
  let startDate: Date;
  let endDate = new Date(now);
  
  switch (preset) {
    case 'today':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case 'this_week':
      const dayOfWeek = now.getDay();
      startDate = new Date(now);
      startDate.setDate(now.getDate() - dayOfWeek);
      startDate.setHours(0, 0, 0, 0);
      break;
    case 'last_week':
      const lastWeekDay = now.getDay();
      startDate = new Date(now);
      startDate.setDate(now.getDate() - lastWeekDay - 7);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);
      break;
    case 'this_month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'last_month':
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      break;
    case 'this_quarter':
      const currentQuarter = Math.floor(now.getMonth() / 3);
      startDate = new Date(now.getFullYear(), currentQuarter * 3, 1);
      break;
    case 'last_quarter':
      const lastQuarter = Math.floor(now.getMonth() / 3) - 1;
      const year = lastQuarter < 0 ? now.getFullYear() - 1 : now.getFullYear();
      const quarter = lastQuarter < 0 ? 3 : lastQuarter;
      startDate = new Date(year, quarter * 3, 1);
      endDate = new Date(year, (quarter + 1) * 3, 0, 23, 59, 59, 999);
      break;
    case 'this_year':
      startDate = new Date(now.getFullYear(), 0, 1);
      break;
    case 'last_30_days':
    default:
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 30);
      break;
  }
  
  return { startDate, endDate };
}

function getPreviousPeriodRange(range: DateRange): DateRange {
  const duration = range.endDate.getTime() - range.startDate.getTime();
  return {
    startDate: new Date(range.startDate.getTime() - duration),
    endDate: new Date(range.startDate.getTime() - 1)
  };
}

export async function getDashboardMetrics(
  workspaceId: string,
  datePreset: string = 'last_30_days',
  customStart?: Date,
  customEnd?: Date
): Promise<DashboardMetrics> {
  const range = customStart && customEnd 
    ? { startDate: customStart, endDate: customEnd }
    : getDateRange(datePreset);
  const prevRange = getPreviousPeriodRange(range);

  const [currentMetrics, prevMetrics, trendData] = await Promise.all([
    getMetricsForPeriod(workspaceId, range),
    getMetricsForPeriod(workspaceId, prevRange),
    getTrendData(workspaceId, range)
  ]);

  const utilizationRate = currentMetrics.scheduledHours > 0 
    ? (currentMetrics.totalHours / currentMetrics.scheduledHours) * 100 
    : 0;

  const revenuePerHour = currentMetrics.totalHours > 0 
    ? currentMetrics.totalRevenue / currentMetrics.totalHours 
    : 0;

  return {
    totalHours: Math.round(currentMetrics.totalHours * 100) / 100,
    totalRevenue: Math.round(currentMetrics.totalRevenue * 100) / 100,
    laborCost: Math.round(currentMetrics.laborCost * 100) / 100,
    revenuePerHour: Math.round(revenuePerHour * 100) / 100,
    utilizationRate: Math.round(utilizationRate * 10) / 10,
    activeEmployees: currentMetrics.activeEmployees,
    activeClients: currentMetrics.activeClients,
    pendingInvoices: currentMetrics.pendingInvoices,
    paidInvoices: currentMetrics.paidInvoices,
    comparison: {
      hoursChange: calculatePercentChange(prevMetrics.totalHours, currentMetrics.totalHours),
      revenueChange: calculatePercentChange(prevMetrics.totalRevenue, currentMetrics.totalRevenue),
      laborCostChange: calculatePercentChange(prevMetrics.laborCost, currentMetrics.laborCost)
    },
    trends: trendData
  };
}

async function getMetricsForPeriod(workspaceId: string, range: DateRange) {
  const [timeData, shiftData, invoiceData, employeeData, clientData] = await Promise.all([
    db.select({
      totalHours: sql<number>`COALESCE(SUM(${timeEntries.totalHours}), 0)`,
      totalAmount: sql<number>`COALESCE(SUM(${timeEntries.totalAmount}), 0)`
    })
    .from(timeEntries)
    .where(and(
      eq(timeEntries.workspaceId, workspaceId),
      gte(timeEntries.clockIn, range.startDate),
      lte(timeEntries.clockIn, range.endDate)
    )),
    
    db.select({
      totalHours: sql<number>`COALESCE(SUM(EXTRACT(EPOCH FROM (${shifts.endTime} - ${shifts.startTime})) / 3600), 0)`
    })
    .from(shifts)
    .where(and(
      eq(shifts.workspaceId, workspaceId),
      gte(shifts.startTime, range.startDate),
      lte(shifts.startTime, range.endDate)
    )),
    
    db.select({
      totalInvoiced: sql<number>`COALESCE(SUM(CASE WHEN ${invoices.status} != 'draft' THEN ${invoices.total} ELSE 0 END), 0)`,
      pendingCount: sql<number>`COUNT(CASE WHEN ${invoices.status} IN ('sent', 'overdue') THEN 1 END)`,
      paidCount: sql<number>`COUNT(CASE WHEN ${invoices.status} = 'paid' THEN 1 END)`
    })
    .from(invoices)
    .where(and(
      eq(invoices.workspaceId, workspaceId),
      gte(invoices.createdAt, range.startDate),
      lte(invoices.createdAt, range.endDate)
    )),
    
    db.select({ count: sql<number>`COUNT(DISTINCT ${timeEntries.employeeId})` })
    .from(timeEntries)
    .where(and(
      eq(timeEntries.workspaceId, workspaceId),
      gte(timeEntries.clockIn, range.startDate),
      lte(timeEntries.clockIn, range.endDate)
    )),
    
    db.select({ count: sql<number>`COUNT(DISTINCT ${timeEntries.clientId})` })
    .from(timeEntries)
    .where(and(
      eq(timeEntries.workspaceId, workspaceId),
      gte(timeEntries.clockIn, range.startDate),
      lte(timeEntries.clockIn, range.endDate),
      isNotNull(timeEntries.clientId)
    ))
  ]);

  return {
    totalHours: parseFloat(timeData[0]?.totalHours?.toString() || '0'),
    laborCost: parseFloat(timeData[0]?.totalAmount?.toString() || '0'),
    scheduledHours: parseFloat(shiftData[0]?.totalHours?.toString() || '0'),
    totalRevenue: parseFloat(invoiceData[0]?.totalInvoiced?.toString() || '0'),
    pendingInvoices: parseInt(invoiceData[0]?.pendingCount?.toString() || '0'),
    paidInvoices: parseInt(invoiceData[0]?.paidCount?.toString() || '0'),
    activeEmployees: parseInt(employeeData[0]?.count?.toString() || '0'),
    activeClients: parseInt(clientData[0]?.count?.toString() || '0')
  };
}

async function getTrendData(workspaceId: string, range: DateRange): Promise<TrendData[]> {
  const daysDiff = Math.ceil((range.endDate.getTime() - range.startDate.getTime()) / (1000 * 60 * 60 * 24));
  
  let groupBy: string;
  let format: string;
  
  if (daysDiff <= 7) {
    groupBy = 'day';
    format = 'YYYY-MM-DD';
  } else if (daysDiff <= 31) {
    groupBy = 'day';
    format = 'YYYY-MM-DD';
  } else if (daysDiff <= 90) {
    groupBy = 'week';
    format = 'IYYY-IW';
  } else {
    groupBy = 'month';
    format = 'YYYY-MM';
  }

  const trendQuery = await db.execute(sql`
    WITH date_series AS (
      SELECT generate_series(
        ${range.startDate}::date,
        ${range.endDate}::date,
        '1 day'::interval
      )::date as date
    ),
    time_data AS (
      SELECT 
        DATE(clock_in) as date,
        COALESCE(SUM(total_hours), 0) as hours,
        COALESCE(SUM(total_amount), 0) as labor_cost
      FROM time_entries
      WHERE workspace_id = ${workspaceId}
        AND clock_in >= ${range.startDate}
        AND clock_in <= ${range.endDate}
      GROUP BY DATE(clock_in)
    ),
    invoice_data AS (
      SELECT 
        DATE(created_at) as date,
        COALESCE(SUM(CASE WHEN status != 'draft' THEN total ELSE 0 END), 0) as revenue
      FROM invoices
      WHERE workspace_id = ${workspaceId}
        AND created_at >= ${range.startDate}
        AND created_at <= ${range.endDate}
      GROUP BY DATE(created_at)
    )
    SELECT 
      ds.date::text as period,
      COALESCE(td.hours, 0) as hours,
      COALESCE(id.revenue, 0) as revenue,
      COALESCE(td.labor_cost, 0) as labor_cost
    FROM date_series ds
    LEFT JOIN time_data td ON ds.date = td.date
    LEFT JOIN invoice_data id ON ds.date = id.date
    ORDER BY ds.date
  `);

  return (trendQuery.rows as any[]).map(row => ({
    period: row.period,
    hours: parseFloat(row.hours) || 0,
    revenue: parseFloat(row.revenue) || 0,
    laborCost: parseFloat(row.labor_cost) || 0
  }));
}

export async function getTimeUsageMetrics(
  workspaceId: string,
  datePreset: string = 'last_30_days',
  customStart?: Date,
  customEnd?: Date
): Promise<TimeUsageMetrics> {
  const range = customStart && customEnd 
    ? { startDate: customStart, endDate: customEnd }
    : getDateRange(datePreset);

  const [byEmployee, byClient, byDay, totals] = await Promise.all([
    db.execute(sql`
      SELECT 
        te.employee_id,
        CONCAT(e.first_name, ' ', e.last_name) as name,
        COALESCE(SUM(te.total_hours), 0) as total_hours,
        COALESCE(SUM(CASE WHEN te.total_hours <= 8 THEN te.total_hours ELSE 8 END), 0) as regular_hours,
        COALESCE(SUM(CASE WHEN te.total_hours > 8 THEN te.total_hours - 8 ELSE 0 END), 0) as overtime_hours
      FROM time_entries te
      LEFT JOIN employees e ON te.employee_id = e.id
      WHERE te.workspace_id = ${workspaceId}
        AND te.clock_in >= ${range.startDate}
        AND te.clock_in <= ${range.endDate}
      GROUP BY te.employee_id, e.first_name, e.last_name
      ORDER BY total_hours DESC
    `),
    
    db.execute(sql`
      SELECT 
        te.client_id,
        c.name,
        COALESCE(SUM(te.total_hours), 0) as total_hours,
        COALESCE(SUM(te.total_amount), 0) as revenue
      FROM time_entries te
      LEFT JOIN clients c ON te.client_id = c.id
      WHERE te.workspace_id = ${workspaceId}
        AND te.clock_in >= ${range.startDate}
        AND te.clock_in <= ${range.endDate}
        AND te.client_id IS NOT NULL
      GROUP BY te.client_id, c.name
      ORDER BY total_hours DESC
    `),
    
    db.execute(sql`
      SELECT 
        DATE(clock_in)::text as date,
        COALESCE(SUM(total_hours), 0) as hours,
        COUNT(DISTINCT employee_id) as employee_count
      FROM time_entries
      WHERE workspace_id = ${workspaceId}
        AND clock_in >= ${range.startDate}
        AND clock_in <= ${range.endDate}
      GROUP BY DATE(clock_in)
      ORDER BY date
    `),
    
    db.execute(sql`
      SELECT 
        COALESCE(SUM(total_hours), 0) as total_hours,
        COALESCE(SUM(CASE WHEN total_hours > 8 THEN total_hours - 8 ELSE 0 END), 0) as overtime_hours,
        COUNT(DISTINCT DATE(clock_in)) as work_days
      FROM time_entries
      WHERE workspace_id = ${workspaceId}
        AND clock_in >= ${range.startDate}
        AND clock_in <= ${range.endDate}
    `)
  ]);

  const totalHours = parseFloat((totals.rows[0] as any)?.total_hours) || 0;
  const overtimeHours = parseFloat((totals.rows[0] as any)?.overtime_hours) || 0;
  const workDays = parseInt((totals.rows[0] as any)?.work_days) || 1;

  return {
    totalHours: Math.round(totalHours * 100) / 100,
    byEmployee: (byEmployee.rows as any[]).map(row => ({
      employeeId: row.employee_id,
      name: row.name || 'Unknown',
      totalHours: parseFloat(row.total_hours) || 0,
      regularHours: parseFloat(row.regular_hours) || 0,
      overtimeHours: parseFloat(row.overtime_hours) || 0,
      efficiency: 100
    })),
    byClient: (byClient.rows as any[]).map(row => ({
      clientId: row.client_id,
      name: row.name || 'Unknown',
      totalHours: parseFloat(row.total_hours) || 0,
      revenue: parseFloat(row.revenue) || 0
    })),
    byDay: (byDay.rows as any[]).map(row => ({
      date: row.date,
      hours: parseFloat(row.hours) || 0,
      employeeCount: parseInt(row.employee_count) || 0
    })),
    overtimeHours: Math.round(overtimeHours * 100) / 100,
    averageHoursPerDay: Math.round((totalHours / workDays) * 100) / 100
  };
}

export async function getSchedulingMetrics(
  workspaceId: string,
  datePreset: string = 'last_30_days',
  customStart?: Date,
  customEnd?: Date
): Promise<SchedulingMetrics> {
  const range = customStart && customEnd 
    ? { startDate: customStart, endDate: customEnd }
    : getDateRange(datePreset);

  const [statusData, dailyData, totals] = await Promise.all([
    db.execute(sql`
      SELECT 
        status,
        COUNT(*) as count
      FROM shifts
      WHERE workspace_id = ${workspaceId}
        AND start_time >= ${range.startDate}
        AND start_time <= ${range.endDate}
      GROUP BY status
    `),
    
    db.execute(sql`
      SELECT 
        TO_CHAR(start_time, 'Day') as day,
        COUNT(*) as scheduled,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed
      FROM shifts
      WHERE workspace_id = ${workspaceId}
        AND start_time >= ${range.startDate}
        AND start_time <= ${range.endDate}
      GROUP BY TO_CHAR(start_time, 'Day'), EXTRACT(DOW FROM start_time)
      ORDER BY EXTRACT(DOW FROM start_time)
    `),
    
    db.execute(sql`
      SELECT 
        COUNT(*) as total_shifts,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_shifts,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_shifts,
        COUNT(CASE WHEN status = 'no_show' THEN 1 END) as no_shows,
        AVG(EXTRACT(EPOCH FROM (end_time - start_time)) / 3600) as avg_duration,
        COUNT(CASE WHEN employee_id IS NOT NULL THEN 1 END) as filled_shifts
      FROM shifts
      WHERE workspace_id = ${workspaceId}
        AND start_time >= ${range.startDate}
        AND start_time <= ${range.endDate}
    `)
  ]);

  const stats = totals.rows[0] as any;
  const totalShifts = parseInt(stats?.total_shifts) || 0;
  const completedShifts = parseInt(stats?.completed_shifts) || 0;
  const filledShifts = parseInt(stats?.filled_shifts) || 0;

  return {
    totalShifts,
    completedShifts,
    cancelledShifts: parseInt(stats?.cancelled_shifts) || 0,
    noShows: parseInt(stats?.no_shows) || 0,
    fillRate: totalShifts > 0 ? Math.round((filledShifts / totalShifts) * 100) : 0,
    coverageRate: totalShifts > 0 ? Math.round((completedShifts / totalShifts) * 100) : 0,
    averageShiftDuration: Math.round(parseFloat(stats?.avg_duration || '0') * 10) / 10,
    byStatus: (statusData.rows as any[]).map(row => ({
      status: row.status,
      count: parseInt(row.count)
    })),
    byDay: (dailyData.rows as any[]).map(row => ({
      day: row.day?.trim() || 'Unknown',
      scheduled: parseInt(row.scheduled) || 0,
      completed: parseInt(row.completed) || 0
    }))
  };
}

export async function getRevenueMetrics(
  workspaceId: string,
  datePreset: string = 'last_30_days',
  customStart?: Date,
  customEnd?: Date
): Promise<RevenueMetrics> {
  const range = customStart && customEnd 
    ? { startDate: customStart, endDate: customEnd }
    : getDateRange(datePreset);

  const [totals, byClient, byMonth] = await Promise.all([
    db.execute(sql`
      SELECT 
        COALESCE(SUM(total), 0) as total_invoiced,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN total ELSE 0 END), 0) as total_paid,
        COALESCE(SUM(CASE WHEN status IN ('sent', 'overdue') THEN total ELSE 0 END), 0) as total_pending,
        COALESCE(SUM(CASE WHEN status IN ('sent', 'overdue') AND due_date < NOW() THEN total ELSE 0 END), 0) as total_overdue,
        COALESCE(AVG(total), 0) as avg_invoice,
        COALESCE(SUM(platform_fee_amount), 0) as platform_fees,
        COALESCE(SUM(business_amount), 0) as net_revenue,
        COUNT(*) as invoice_count,
        COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid_count
      FROM invoices
      WHERE workspace_id = ${workspaceId}
        AND created_at >= ${range.startDate}
        AND created_at <= ${range.endDate}
        AND status != 'draft'
    `),
    
    db.execute(sql`
      SELECT 
        i.client_id,
        c.name,
        COALESCE(SUM(i.total), 0) as invoiced,
        COALESCE(SUM(CASE WHEN i.status = 'paid' THEN i.total ELSE 0 END), 0) as paid
      FROM invoices i
      LEFT JOIN clients c ON i.client_id = c.id
      WHERE i.workspace_id = ${workspaceId}
        AND i.created_at >= ${range.startDate}
        AND i.created_at <= ${range.endDate}
        AND i.status != 'draft'
      GROUP BY i.client_id, c.name
      ORDER BY invoiced DESC
      LIMIT 10
    `),
    
    db.execute(sql`
      SELECT 
        TO_CHAR(created_at, 'YYYY-MM') as month,
        COALESCE(SUM(total), 0) as invoiced,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN total ELSE 0 END), 0) as paid
      FROM invoices
      WHERE workspace_id = ${workspaceId}
        AND created_at >= ${range.startDate}
        AND created_at <= ${range.endDate}
        AND status != 'draft'
      GROUP BY TO_CHAR(created_at, 'YYYY-MM')
      ORDER BY month
    `)
  ]);

  const stats = totals.rows[0] as any;
  const invoiceCount = parseInt(stats?.invoice_count) || 0;
  const paidCount = parseInt(stats?.paid_count) || 0;

  return {
    totalInvoiced: parseFloat(stats?.total_invoiced) || 0,
    totalPaid: parseFloat(stats?.total_paid) || 0,
    totalPending: parseFloat(stats?.total_pending) || 0,
    totalOverdue: parseFloat(stats?.total_overdue) || 0,
    averageInvoiceAmount: parseFloat(stats?.avg_invoice) || 0,
    collectionRate: invoiceCount > 0 ? Math.round((paidCount / invoiceCount) * 100) : 0,
    byClient: (byClient.rows as any[]).map(row => ({
      clientId: row.client_id,
      name: row.name || 'Unknown',
      invoiced: parseFloat(row.invoiced) || 0,
      paid: parseFloat(row.paid) || 0
    })),
    byMonth: (byMonth.rows as any[]).map(row => ({
      month: row.month,
      invoiced: parseFloat(row.invoiced) || 0,
      paid: parseFloat(row.paid) || 0
    })),
    platformFees: parseFloat(stats?.platform_fees) || 0,
    netRevenue: parseFloat(stats?.net_revenue) || 0
  };
}

export async function getEmployeePerformanceMetrics(
  workspaceId: string,
  datePreset: string = 'last_30_days',
  customStart?: Date,
  customEnd?: Date
): Promise<EmployeePerformanceMetrics> {
  const range = customStart && customEnd 
    ? { startDate: customStart, endDate: customEnd }
    : getDateRange(datePreset);

  const performanceData = await db.execute(sql`
    WITH shift_data AS (
      SELECT 
        s.employee_id,
        COUNT(*) as total_shifts,
        COUNT(CASE WHEN s.status = 'completed' THEN 1 END) as completed_shifts,
        COUNT(CASE WHEN s.status = 'no_show' THEN 1 END) as no_shows
      FROM shifts s
      WHERE s.workspace_id = ${workspaceId}
        AND s.start_time >= ${range.startDate}
        AND s.start_time <= ${range.endDate}
        AND s.employee_id IS NOT NULL
      GROUP BY s.employee_id
    ),
    time_data AS (
      SELECT 
        te.employee_id,
        COALESCE(SUM(te.total_hours), 0) as total_hours,
        COUNT(CASE WHEN te.clock_in > te.clock_in + INTERVAL '15 minutes' THEN 1 END) as late_arrivals
      FROM time_entries te
      WHERE te.workspace_id = ${workspaceId}
        AND te.clock_in >= ${range.startDate}
        AND te.clock_in <= ${range.endDate}
      GROUP BY te.employee_id
    )
    SELECT 
      e.id as employee_id,
      CONCAT(e.first_name, ' ', e.last_name) as name,
      COALESCE(sd.total_shifts, 0) as total_shifts,
      COALESCE(sd.completed_shifts, 0) as completed_shifts,
      COALESCE(sd.no_shows, 0) as no_shows,
      COALESCE(td.late_arrivals, 0) as late_arrivals,
      COALESCE(td.total_hours, 0) as total_hours,
      CASE WHEN COALESCE(sd.total_shifts, 0) > 0 
        THEN ROUND((COALESCE(sd.completed_shifts, 0)::numeric / sd.total_shifts) * 100, 1)
        ELSE 100 
      END as attendance_rate,
      CASE WHEN COALESCE(sd.completed_shifts, 0) > 0 
        THEN ROUND(((COALESCE(sd.completed_shifts, 0) - COALESCE(td.late_arrivals, 0))::numeric / sd.completed_shifts) * 100, 1)
        ELSE 100 
      END as punctuality_rate
    FROM employees e
    LEFT JOIN shift_data sd ON e.id = sd.employee_id
    LEFT JOIN time_data td ON e.id = td.employee_id
    WHERE e.workspace_id = ${workspaceId}
      AND e.status = 'active'
    ORDER BY attendance_rate DESC, total_hours DESC
  `);

  const employees: EmployeePerformance[] = (performanceData.rows as any[]).map(row => ({
    employeeId: row.employee_id,
    name: row.name || 'Unknown',
    totalShifts: parseInt(row.total_shifts) || 0,
    completedShifts: parseInt(row.completed_shifts) || 0,
    noShows: parseInt(row.no_shows) || 0,
    lateArrivals: parseInt(row.late_arrivals) || 0,
    attendanceRate: parseFloat(row.attendance_rate) || 100,
    punctualityRate: parseFloat(row.punctuality_rate) || 100,
    totalHours: parseFloat(row.total_hours) || 0
  }));

  const avgAttendance = employees.length > 0 
    ? employees.reduce((sum, e) => sum + e.attendanceRate, 0) / employees.length 
    : 100;
  
  const avgPunctuality = employees.length > 0 
    ? employees.reduce((sum, e) => sum + e.punctualityRate, 0) / employees.length 
    : 100;

  return {
    employees,
    averageAttendanceRate: Math.round(avgAttendance * 10) / 10,
    averagePunctualityRate: Math.round(avgPunctuality * 10) / 10,
    topPerformers: employees.slice(0, 5)
  };
}

function calculatePercentChange(previous: number, current: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100 * 10) / 10;
}

export const advancedAnalyticsService = {
  getDashboardMetrics,
  getTimeUsageMetrics,
  getSchedulingMetrics,
  getRevenueMetrics,
  getEmployeePerformanceMetrics,
  getDateRange
};
