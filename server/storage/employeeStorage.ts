/**
 * Employee Storage — domain facade over DatabaseStorage.employee* methods.
 * Import these directly instead of storage.getEmployee() in new code.
 */
import { storage } from '../storage';
import type { Employee, InsertEmployee } from '@shared/schema';

export const getEmployee = (id: string, workspaceId: string) =>
  storage.getEmployee(id, workspaceId);

export const getEmployeesByWorkspace = (workspaceId: string, limit?: number, offset?: number) =>
  storage.getEmployeesByWorkspace(workspaceId, limit, offset);

export const getEmployeeByUserId = (userId: string, workspaceId?: string) =>
  storage.getEmployeeByUserId(userId, workspaceId);

export const getEmployeeById = (employeeId: string, workspaceId?: string) =>
  storage.getEmployeeById(employeeId, workspaceId);

export const createEmployee = (data: InsertEmployee) =>
  storage.createEmployee(data);

export const updateEmployee = (id: string, workspaceId: string, data: Partial<InsertEmployee>) =>
  storage.updateEmployee(id, workspaceId, data);

export const deleteEmployee = (id: string, workspaceId: string) =>
  storage.deleteEmployee(id, workspaceId);

export const reactivateEmployee = (id: string, workspaceId: string) =>
  storage.reactivateEmployee(id, workspaceId);
