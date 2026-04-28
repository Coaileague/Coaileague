/**
 * Shift Storage — domain facade over DatabaseStorage.shift* methods.
 */
import { storage } from '../storage';

export const getShift = (id: string, workspaceId: string) =>
  storage.getShift(id, workspaceId);

export const getShiftsByWorkspace = (workspaceId: string, options?: any) =>
  storage.getShiftsByWorkspace(workspaceId, options);

export const createShift = (data: any) =>
  storage.createShift(data);

export const updateShift = (id: string, workspaceId: string, data: any) =>
  storage.updateShift(id, workspaceId, data);

export const deleteShift = (id: string, workspaceId: string) =>
  storage.deleteShift(id, workspaceId);

export const getShiftsByEmployee = (employeeId: string, workspaceId: string) =>
  storage.getShiftsByEmployee(employeeId, workspaceId);
