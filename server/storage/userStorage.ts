/**
 * User Storage — domain facade over DatabaseStorage.user* methods.
 */
import { storage } from '../storage';

export const getUser = (id: string) => storage.getUser(id);
export const getUserByEmail = (email: string) => storage.getUserByEmail(email);
export const getUserByUsernameOrEmail = (usernameOrEmail: string) =>
  storage.getUserByUsernameOrEmail(usernameOrEmail);
export const upsertUser = (data: any) => storage.upsertUser(data);
export const updateUser = (id: string, data: any) => storage.updateUser(id, data);
