/**
 * Shared Schedule Data Hook
 * Provides queries and derived state for both desktop and mobile schedule views
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Shift, Employee, Client } from '@shared/schema';

interface UseScheduleDataProps {
  weekStart: Date;
  weekEnd: Date;
}

export function useScheduleData({ weekStart, weekEnd }: UseScheduleDataProps) {
  // Convert Date objects to stable numbers for query key comparison
  const weekStartTime = weekStart.getTime();
  const weekEndTime = weekEnd.getTime();

  // Fetch shifts for current week with date range filtering
  const { data: shifts = [], isLoading: shiftsLoading } = useQuery<Shift[]>({
    queryKey: ['/api/shifts', weekStartTime, weekEndTime],
    queryFn: async () => {
      const response = await fetch(
        `/api/shifts?weekStart=${weekStart.toISOString()}&weekEnd=${weekEnd.toISOString()}`,
        { credentials: 'include' }
      );
      if (!response.ok) throw new Error('Failed to fetch shifts');
      return response.json();
    },
  });

  // Fetch employees
  const { data: employees = [], isLoading: employeesLoading } = useQuery<Employee[]>({
    queryKey: ['/api/employees'],
  });

  // Fetch clients
  const { data: clients = [], isLoading: clientsLoading } = useQuery<Client[]>({
    queryKey: ['/api/clients'],
  });

  const isLoading = shiftsLoading || employeesLoading || clientsLoading;

  // Derived data: draft/pending shifts count (not yet published)
  const pendingShiftsCount = useMemo(() => {
    return shifts.filter(s => s.status === 'draft').length;
  }, [shifts]);

  // Derived data: open shifts count (no employee assigned)
  const openShiftsCount = useMemo(() => {
    return shifts.filter(s => !s.employeeId).length;
  }, [shifts]);

  // Derived data: total scheduled hours
  const totalScheduledHours = useMemo(() => {
    return shifts.reduce((sum, shift) => {
      const start = new Date(shift.startTime);
      const end = new Date(shift.endTime);
      const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
      return sum + hours;
    }, 0);
  }, [shifts]);

  // Helper: Get employee by ID
  const getEmployee = (id: string | null) => {
    if (!id) return null;
    return employees.find(e => e.id === id) || null;
  };

  // Helper: Get client by ID
  const getClient = (id: string | null) => {
    if (!id) return null;
    return clients.find(c => c.id === id) || null;
  };

  // Helper: Get employee color (consistent hash-based color)
  const getEmployeeColor = (employeeId: string | null) => {
    if (!employeeId) return '#6b7280';
    const employee = employees.find(e => e.id === employeeId);
    if (!employee) {
      // Generate consistent color from employee ID
      const hash = employeeId.split('').reduce((acc, char) => char.charCodeAt(0) + ((acc << 5) - acc), 0);
      const hue = Math.abs(hash) % 360;
      return `hsl(${hue}, 65%, 50%)`;
    }
    // Use employee's actual color if available
    return employee.color || '#6b7280';
  };

  return {
    // Raw data
    shifts,
    employees,
    clients,
    isLoading,

    // Derived stats
    pendingShiftsCount,
    openShiftsCount,
    totalScheduledHours,

    // Helper functions
    getEmployee,
    getClient,
    getEmployeeColor,
  };
}
