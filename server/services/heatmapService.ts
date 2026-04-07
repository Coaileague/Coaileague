/**
 * Heat Map Service - Interactive Calendar Heat Map for Peak Hours Analysis
 * 
 * Aggregates shift data by day-of-week and hour to identify:
 * - Peak staffing periods
 * - Understaffed time slots
 * - Optimal scheduling patterns
 */

import { db } from "../db";
import { shifts, timeEntries, employees, clients } from "@shared/schema";
import { eq, and, gte, lte, sql, count, isNotNull } from "drizzle-orm";
import { platformEventBus } from './platformEventBus';

export interface HeatmapCell {
  dayOfWeek: number;
  hour: number;
  value: number;
  shiftCount: number;
  employeeCount: number;
  hoursWorked: number;
}

export interface HeatmapData {
  grid: HeatmapCell[][];
  maxValue: number;
  minValue: number;
  totalShifts: number;
  peakHours: { dayOfWeek: number; hour: number; value: number }[];
  quietPeriods: { dayOfWeek: number; hour: number; value: number }[];
  averageStaffPerSlot: number;
}

export interface HeatmapFilters {
  workspaceId: string;
  startDate?: Date;
  endDate?: Date;
  clientId?: string;
  location?: string;
  dataSource?: 'shifts' | 'timeEntries' | 'availability';
}

export interface StaffingRecommendation {
  dayOfWeek: number;
  hour: number;
  currentLevel: number;
  recommendedLevel: number;
  reason: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export interface AIStaffingAnalysis {
  recommendations: StaffingRecommendation[];
  understaffedPeriods: { dayOfWeek: number; hour: number; gap: number }[];
  overstaffedPeriods: { dayOfWeek: number; hour: number; excess: number }[];
  optimalStaffingPattern: HeatmapCell[][];
  insights: string[];
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function getDateRange(preset?: string): { startDate: Date; endDate: Date } {
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
    case 'last_30_days':
    default:
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 30);
      break;
  }
  
  return { startDate, endDate };
}

export class HeatmapService {
  /**
   * Get heat map data aggregated by day of week and hour
   */
  async getHeatmapData(filters: HeatmapFilters, period?: string): Promise<HeatmapData> {
    const { startDate, endDate } = period 
      ? getDateRange(period)
      : { 
          startDate: filters.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          endDate: filters.endDate || new Date()
        };

    const conditions = [
      eq(shifts.workspaceId, filters.workspaceId),
      gte(shifts.startTime, startDate),
      lte(shifts.startTime, endDate)
    ];

    if (filters.clientId) {
      conditions.push(eq(shifts.clientId, filters.clientId));
    }

    const shiftData = await db
      .select({
        id: shifts.id,
        employeeId: shifts.employeeId,
        clientId: shifts.clientId,
        startTime: shifts.startTime,
        endTime: shifts.endTime,
        status: shifts.status
      })
      .from(shifts)
      .where(and(...conditions));

    const grid: HeatmapCell[][] = Array.from({ length: 7 }, (_, day) =>
      Array.from({ length: 24 }, (_, hour) => ({
        dayOfWeek: day,
        hour,
        value: 0,
        shiftCount: 0,
        employeeCount: 0,
        hoursWorked: 0
      }))
    );

    const employeesBySlot = new Map<string, Set<string>>();
    let totalShifts = 0;

    for (const shift of shiftData) {
      if (!shift.startTime || !shift.endTime) continue;
      
      totalShifts++;
      const startHour = shift.startTime.getHours();
      const endHour = shift.endTime.getHours();
      const dayOfWeek = shift.startTime.getDay();

      const isSameDay = shift.startTime.toDateString() === shift.endTime.toDateString();
      
      if (isSameDay) {
        for (let h = startHour; h <= endHour && h < 24; h++) {
          const key = `${dayOfWeek}-${h}`;
          if (!employeesBySlot.has(key)) {
            employeesBySlot.set(key, new Set());
          }
          if (shift.employeeId) {
            employeesBySlot.get(key)!.add(shift.employeeId);
          }
          
          grid[dayOfWeek][h].shiftCount++;
          grid[dayOfWeek][h].hoursWorked += 1;
        }
      } else {
        for (let h = startHour; h < 24; h++) {
          const key = `${dayOfWeek}-${h}`;
          if (!employeesBySlot.has(key)) {
            employeesBySlot.set(key, new Set());
          }
          if (shift.employeeId) {
            employeesBySlot.get(key)!.add(shift.employeeId);
          }
          grid[dayOfWeek][h].shiftCount++;
          grid[dayOfWeek][h].hoursWorked += 1;
        }
        
        const nextDay = (dayOfWeek + 1) % 7;
        for (let h = 0; h <= endHour; h++) {
          const key = `${nextDay}-${h}`;
          if (!employeesBySlot.has(key)) {
            employeesBySlot.set(key, new Set());
          }
          if (shift.employeeId) {
            employeesBySlot.get(key)!.add(shift.employeeId);
          }
          grid[nextDay][h].shiftCount++;
          grid[nextDay][h].hoursWorked += 1;
        }
      }
    }

    for (const [key, employees] of employeesBySlot) {
      const [day, hour] = key.split('-').map(Number);
      grid[day][hour].employeeCount = employees.size;
      grid[day][hour].value = employees.size;
    }

    let maxValue = 0;
    let minValue = Infinity;
    const allCells: HeatmapCell[] = [];
    let totalStaffCount = 0;
    let activeSlots = 0;

    for (const row of grid) {
      for (const cell of row) {
        allCells.push(cell);
        if (cell.value > maxValue) maxValue = cell.value;
        if (cell.value < minValue && cell.value > 0) minValue = cell.value;
        if (cell.value > 0) {
          totalStaffCount += cell.value;
          activeSlots++;
        }
      }
    }

    if (minValue === Infinity) minValue = 0;

    allCells.sort((a, b) => b.value - a.value);
    const peakHours = allCells.slice(0, 10).filter(c => c.value > 0);
    
    allCells.sort((a, b) => a.value - b.value);
    const quietPeriods = allCells.filter(c => c.value === 0 || c.value < maxValue * 0.25).slice(0, 10);

    return {
      grid,
      maxValue,
      minValue,
      totalShifts,
      peakHours: peakHours.map(c => ({ dayOfWeek: c.dayOfWeek, hour: c.hour, value: c.value })),
      quietPeriods: quietPeriods.map(c => ({ dayOfWeek: c.dayOfWeek, hour: c.hour, value: c.value })),
      averageStaffPerSlot: activeSlots > 0 ? totalStaffCount / activeSlots : 0
    };
  }

  /**
   * Get heat map data grouped by client
   */
  async getHeatmapByClient(workspaceId: string, period?: string): Promise<Map<string, HeatmapData>> {
    const clientList = await db
      .select({ id: clients.id, name: clients.companyName })
      .from(clients)
      .where(eq(clients.workspaceId, workspaceId));

    const results = new Map<string, HeatmapData>();

    for (const client of clientList) {
      const data = await this.getHeatmapData({ 
        workspaceId, 
        clientId: client.id 
      }, period);
      
      if (data.totalShifts > 0) {
        results.set(client.id, data);
      }
    }

    return results;
  }

  /**
   * Get heat map data grouped by location (using client locations)
   */
  async getHeatmapByLocation(workspaceId: string, period?: string): Promise<Record<string, HeatmapData>> {
    const clientsWithLocations = await db
      .select({ 
        id: clients.id, 
        name: clients.companyName,
        address: clients.address
      })
      .from(clients)
      .where(and(
        eq(clients.workspaceId, workspaceId),
        isNotNull(clients.address)
      ));

    const locationMap: Record<string, string[]> = {};
    
    for (const client of clientsWithLocations) {
      const location = client.address || 'Unknown';
      if (!locationMap[location]) {
        locationMap[location] = [];
      }
      locationMap[location].push(client.id);
    }

    const results: Record<string, HeatmapData> = {};

    for (const [location, clientIds] of Object.entries(locationMap)) {
      const combinedGrid: HeatmapCell[][] = Array.from({ length: 7 }, (_, day) =>
        Array.from({ length: 24 }, (_, hour) => ({
          dayOfWeek: day,
          hour,
          value: 0,
          shiftCount: 0,
          employeeCount: 0,
          hoursWorked: 0
        }))
      );

      let totalShifts = 0;

      for (const clientId of clientIds) {
        const data = await this.getHeatmapData({ 
          workspaceId, 
          clientId 
        }, period);
        
        totalShifts += data.totalShifts;
        
        for (let d = 0; d < 7; d++) {
          for (let h = 0; h < 24; h++) {
            combinedGrid[d][h].shiftCount += data.grid[d][h].shiftCount;
            combinedGrid[d][h].employeeCount += data.grid[d][h].employeeCount;
            combinedGrid[d][h].hoursWorked += data.grid[d][h].hoursWorked;
            combinedGrid[d][h].value += data.grid[d][h].value;
          }
        }
      }

      if (totalShifts > 0) {
        let maxValue = 0;
        let minValue = Infinity;
        const peakHours: { dayOfWeek: number; hour: number; value: number }[] = [];
        const quietPeriods: { dayOfWeek: number; hour: number; value: number }[] = [];

        for (const row of combinedGrid) {
          for (const cell of row) {
            if (cell.value > maxValue) maxValue = cell.value;
            if (cell.value < minValue && cell.value > 0) minValue = cell.value;
          }
        }

        if (minValue === Infinity) minValue = 0;

        results[location] = {
          grid: combinedGrid,
          maxValue,
          minValue,
          totalShifts,
          peakHours,
          quietPeriods,
          averageStaffPerSlot: 0
        };
      }
    }

    return results;
  }

  /**
   * AI-powered staffing analysis and recommendations
   */
  async getAIStaffingAnalysis(workspaceId: string, period?: string): Promise<AIStaffingAnalysis> {
    const heatmapData = await this.getHeatmapData({ workspaceId }, period);
    
    const recommendations: StaffingRecommendation[] = [];
    const understaffedPeriods: { dayOfWeek: number; hour: number; gap: number }[] = [];
    const overstaffedPeriods: { dayOfWeek: number; hour: number; excess: number }[] = [];
    const insights: string[] = [];

    const avgStaff = heatmapData.averageStaffPerSlot;
    const threshold = Math.max(1, avgStaff * 0.7);

    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        const cell = heatmapData.grid[day][hour];
        const isBusinessHours = hour >= 6 && hour <= 22;
        const isWeekday = day >= 1 && day <= 5;

        if (isBusinessHours && cell.value < threshold && isWeekday) {
          const gap = Math.ceil(threshold - cell.value);
          understaffedPeriods.push({ dayOfWeek: day, hour, gap });
          
          recommendations.push({
            dayOfWeek: day,
            hour,
            currentLevel: cell.value,
            recommendedLevel: Math.ceil(avgStaff),
            reason: `Low staffing during peak business hours on ${DAY_NAMES[day]}`,
            priority: cell.value === 0 ? 'critical' : gap > 2 ? 'high' : 'medium'
          });
        }

        if (cell.value > avgStaff * 1.5 && cell.value > 3) {
          const excess = Math.floor(cell.value - avgStaff);
          overstaffedPeriods.push({ dayOfWeek: day, hour, excess });
          
          recommendations.push({
            dayOfWeek: day,
            hour,
            currentLevel: cell.value,
            recommendedLevel: Math.ceil(avgStaff),
            reason: `Potentially overstaffed on ${DAY_NAMES[day]} at ${hour}:00`,
            priority: 'low'
          });
        }
      }
    }

    if (heatmapData.peakHours.length > 0) {
      const topPeak = heatmapData.peakHours[0];
      insights.push(`Peak staffing typically occurs on ${DAY_NAMES[topPeak.dayOfWeek]} at ${topPeak.hour}:00 with ${topPeak.value} employees`);
    }

    if (understaffedPeriods.length > 0) {
      insights.push(`${understaffedPeriods.length} time slots are understaffed during business hours`);
    }

    if (overstaffedPeriods.length > 0) {
      insights.push(`${overstaffedPeriods.length} time slots may have more staff than needed`);
    }

    const weekdayAvg = this.calculateWeekdayAverage(heatmapData.grid);
    const weekendAvg = this.calculateWeekendAverage(heatmapData.grid);
    
    if (weekendAvg > weekdayAvg * 1.2) {
      insights.push('Weekend shifts have higher staffing levels than weekdays');
    } else if (weekdayAvg > weekendAvg * 1.2) {
      insights.push('Weekday shifts have higher staffing levels than weekends');
    }

    recommendations.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    const criticalGaps = recommendations.filter(r => r.priority === 'critical').length;
    if (recommendations.length > 0) {
      platformEventBus.publish({
        type: 'staffing_analysis_completed',
        category: 'scheduling',
        title: 'AI Staffing Analysis Completed',
        description: `Staffing analysis found ${recommendations.length} recommendation(s) for workspace (${criticalGaps} critical gaps)`,
        workspaceId,
        metadata: { recommendationCount: recommendations.length, criticalGaps, understaffedCount: understaffedPeriods.length },
      });
    }

    return {
      recommendations: recommendations.slice(0, 20),
      understaffedPeriods,
      overstaffedPeriods,
      optimalStaffingPattern: this.generateOptimalPattern(heatmapData),
      insights
    };
  }

  private calculateWeekdayAverage(grid: HeatmapCell[][]): number {
    let total = 0;
    let count = 0;
    for (let day = 1; day <= 5; day++) {
      for (let hour = 0; hour < 24; hour++) {
        if (grid[day][hour].value > 0) {
          total += grid[day][hour].value;
          count++;
        }
      }
    }
    return count > 0 ? total / count : 0;
  }

  private calculateWeekendAverage(grid: HeatmapCell[][]): number {
    let total = 0;
    let count = 0;
    for (const day of [0, 6]) {
      for (let hour = 0; hour < 24; hour++) {
        if (grid[day][hour].value > 0) {
          total += grid[day][hour].value;
          count++;
        }
      }
    }
    return count > 0 ? total / count : 0;
  }

  private generateOptimalPattern(data: HeatmapData): HeatmapCell[][] {
    const optimal: HeatmapCell[][] = JSON.parse(JSON.stringify(data.grid));
    const target = Math.ceil(data.averageStaffPerSlot);

    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        const isBusinessHours = hour >= 6 && hour <= 22;
        const isWeekday = day >= 1 && day <= 5;
        
        if (isBusinessHours) {
          optimal[day][hour].value = Math.max(optimal[day][hour].value, target);
        } else if (!isWeekday) {
          optimal[day][hour].value = Math.max(optimal[day][hour].value, Math.ceil(target * 0.7));
        }
      }
    }

    return optimal;
  }
}

export const heatmapService = new HeatmapService();
