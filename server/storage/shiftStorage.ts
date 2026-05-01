/**
 * Shift Storage — domain facade over DatabaseStorage.shift* methods.
 */
import { storage } from '../storage';

export const getShift = (id: string, workspaceId: string) =>
  storage.getShift(id, workspaceId);

export const getShiftsByWorkspace = (workspaceId: string, options?: unknown) =>
  storage.getShiftsByWorkspace(workspaceId, options);

export const createShift = (data: Record<string, unknown>) =>
  storage.createShift(data);

export const updateShift = (id: string, workspaceId: string, data: Record<string, unknown>) =>
  storage.updateShift(id, workspaceId, data);

export const deleteShift = (id: string, workspaceId: string) =>
  storage.deleteShift(id, workspaceId);

export const getShiftsByEmployeeAndDateRange = (
  workspaceId: string,
  employeeId: string,
  startDate: Date,
  endDate: Date,
) => storage.getShiftsByEmployeeAndDateRange(workspaceId, employeeId, startDate, endDate);
