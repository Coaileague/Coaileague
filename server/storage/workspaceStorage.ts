/**
 * Workspace Storage — domain facade over DatabaseStorage.workspace* methods.
 */
import { storage } from '../storage';

export const getWorkspace = (id: string) => storage.getWorkspace(id);
export const getWorkspaceByOwnerId = (ownerId: string) =>
  storage.getWorkspaceByOwnerId(ownerId);
export const createWorkspace = (data: any) => storage.createWorkspace(data);
export const updateWorkspace = (id: string, data: any) => storage.updateWorkspace(id, data);
export const resolveWorkspaceForUser = (userId: string, requestedWorkspaceId?: string) =>
  storage.resolveWorkspaceForUser(userId, requestedWorkspaceId);
