/**
 * Storage domain facades — thin re-export wrappers over DatabaseStorage.
 *
 * The monolithic server/storage.ts (9107L, 491 methods) is the canonical
 * source. These facades provide domain-scoped imports so new code can write:
 *
 *   import { getEmployee, createEmployee } from '../storage/employeeStorage';
 *
 * instead of:
 *
 *   import { storage } from '../storage';
 *   storage.getEmployee(...)
 *
 * Existing callers are unchanged. New code uses domain facades.
 * Over time, the class can be physically split here without touching callers.
 */
export { storage } from '../storage';
export * from './employeeStorage';
export * from './clientStorage';
export * from './shiftStorage';
export * from './userStorage';
export * from './workspaceStorage';
