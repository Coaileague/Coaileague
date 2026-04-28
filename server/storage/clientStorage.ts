/**
 * Client Storage — domain facade over DatabaseStorage.client* methods.
 */
import { storage } from '../storage';
import type { Client, InsertClient } from '@shared/schema';

export const getClient = (id: string, workspaceId: string) =>
  storage.getClient(id, workspaceId);

export const getClientsByWorkspace = (workspaceId: string) =>
  storage.getClientsByWorkspace(workspaceId);

export const getClientByUserId = (userId: string) =>
  storage.getClientByUserId(userId);

export const createClient = (data: InsertClient) =>
  storage.createClient(data);

export const updateClient = (id: string, workspaceId: string, data: Partial<InsertClient>) =>
  storage.updateClient(id, workspaceId, data);

export const deleteClient = (id: string, workspaceId: string) =>
  storage.deleteClient(id, workspaceId);
