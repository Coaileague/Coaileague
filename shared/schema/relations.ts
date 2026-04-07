// Cross-Domain Relations — CoAIleague
// All drizzle relations() definitions referencing cross-domain tables.
// This file imports from domain files — no circular dependencies.
// THE LAW: No new relations without Bryan's approval. Match the domain contract.

import { relations } from 'drizzle-orm';

import * as authDomain from './domains/auth';
import * as orgsDomain from './domains/orgs';
import * as workforceDomain from './domains/workforce';
import * as schedulingDomain from './domains/scheduling';
import * as timeDomain from './domains/time';
import * as billingDomain from './domains/billing';
import * as clientsDomain from './domains/clients';

export const usersRelations = relations(authDomain.users, ({ many }) => ({
  ownedWorkspaces: many(orgsDomain.workspaces),
}));

export const workspacesRelations = relations(orgsDomain.workspaces, ({ one, many }) => ({
  owner: one(authDomain.users, {
    fields: [orgsDomain.workspaces.ownerId],
    references: [authDomain.users.id],
  }),
  employees: many(workforceDomain.employees),
  clients: many(clientsDomain.clients),
  shifts: many(schedulingDomain.shifts),
  invoices: many(billingDomain.invoices),
  timeEntries: many(timeDomain.timeEntries),
}));

export const employeesRelations = relations(workforceDomain.employees, ({ one, many }) => ({
  workspace: one(orgsDomain.workspaces, {
    fields: [workforceDomain.employees.workspaceId],
    references: [orgsDomain.workspaces.id],
  }),
  user: one(authDomain.users, {
    fields: [workforceDomain.employees.userId],
    references: [authDomain.users.id],
  }),
  shifts: many(schedulingDomain.shifts),
  timeEntries: many(timeDomain.timeEntries),
}));

export const clientsRelations = relations(clientsDomain.clients, ({ one, many }) => ({
  workspace: one(orgsDomain.workspaces, {
    fields: [clientsDomain.clients.workspaceId],
    references: [orgsDomain.workspaces.id],
  }),
  shifts: many(schedulingDomain.shifts),
  invoices: many(billingDomain.invoices),
  timeEntries: many(timeDomain.timeEntries),
}));

export const shiftsRelations = relations(schedulingDomain.shifts, ({ one, many }) => ({
  workspace: one(orgsDomain.workspaces, {
    fields: [schedulingDomain.shifts.workspaceId],
    references: [orgsDomain.workspaces.id],
  }),
  employee: one(workforceDomain.employees, {
    fields: [schedulingDomain.shifts.employeeId],
    references: [workforceDomain.employees.id],
  }),
  client: one(clientsDomain.clients, {
    fields: [schedulingDomain.shifts.clientId],
    references: [clientsDomain.clients.id],
  }),
  timeEntries: many(timeDomain.timeEntries),
  shiftOrders: many(schedulingDomain.shiftOrders),
  swapRequests: many(schedulingDomain.shiftSwapRequests),
}));

export const recurringShiftPatternsRelations = relations(schedulingDomain.recurringShiftPatterns, ({ one }) => ({
  workspace: one(orgsDomain.workspaces, {
    fields: [schedulingDomain.recurringShiftPatterns.workspaceId],
    references: [orgsDomain.workspaces.id],
  }),
  employee: one(workforceDomain.employees, {
    fields: [schedulingDomain.recurringShiftPatterns.employeeId],
    references: [workforceDomain.employees.id],
  }),
  client: one(clientsDomain.clients, {
    fields: [schedulingDomain.recurringShiftPatterns.clientId],
    references: [clientsDomain.clients.id],
  }),
  createdByUser: one(authDomain.users, {
    fields: [schedulingDomain.recurringShiftPatterns.createdBy],
    references: [authDomain.users.id],
  }),
}));

export const shiftSwapRequestsRelations = relations(schedulingDomain.shiftSwapRequests, ({ one }) => ({
  workspace: one(orgsDomain.workspaces, {
    fields: [schedulingDomain.shiftSwapRequests.workspaceId],
    references: [orgsDomain.workspaces.id],
  }),
  shift: one(schedulingDomain.shifts, {
    fields: [schedulingDomain.shiftSwapRequests.shiftId],
    references: [schedulingDomain.shifts.id],
  }),
  requester: one(workforceDomain.employees, {
    fields: [schedulingDomain.shiftSwapRequests.requesterId],
    references: [workforceDomain.employees.id],
    relationName: 'swapRequester',
  }),
  targetEmployee: one(workforceDomain.employees, {
    fields: [schedulingDomain.shiftSwapRequests.targetEmployeeId],
    references: [workforceDomain.employees.id],
    relationName: 'swapTarget',
  }),
  respondedByUser: one(authDomain.users, {
    fields: [schedulingDomain.shiftSwapRequests.respondedBy],
    references: [authDomain.users.id],
  }),
}));

export const timeEntriesRelations = relations(timeDomain.timeEntries, ({ one, many }) => ({
  workspace: one(orgsDomain.workspaces, {
    fields: [timeDomain.timeEntries.workspaceId],
    references: [orgsDomain.workspaces.id],
  }),
  shift: one(schedulingDomain.shifts, {
    fields: [timeDomain.timeEntries.shiftId],
    references: [schedulingDomain.shifts.id],
  }),
  employee: one(workforceDomain.employees, {
    fields: [timeDomain.timeEntries.employeeId],
    references: [workforceDomain.employees.id],
  }),
  client: one(clientsDomain.clients, {
    fields: [timeDomain.timeEntries.clientId],
    references: [clientsDomain.clients.id],
  }),
  breaks: many(timeDomain.timeEntryBreaks),
  auditEvents: many(timeDomain.timeEntryAuditEvents),
}));

export const timeEntryBreaksRelations = relations(timeDomain.timeEntryBreaks, ({ one }) => ({
  workspace: one(orgsDomain.workspaces, {
    fields: [timeDomain.timeEntryBreaks.workspaceId],
    references: [orgsDomain.workspaces.id],
  }),
  timeEntry: one(timeDomain.timeEntries, {
    fields: [timeDomain.timeEntryBreaks.timeEntryId],
    references: [timeDomain.timeEntries.id],
  }),
  employee: one(workforceDomain.employees, {
    fields: [timeDomain.timeEntryBreaks.employeeId],
    references: [workforceDomain.employees.id],
  }),
}));

export const timeEntryAuditEventsRelations = relations(timeDomain.timeEntryAuditEvents, ({ one }) => ({
  workspace: one(orgsDomain.workspaces, {
    fields: [timeDomain.timeEntryAuditEvents.workspaceId],
    references: [orgsDomain.workspaces.id],
  }),
  timeEntry: one(timeDomain.timeEntries, {
    fields: [timeDomain.timeEntryAuditEvents.timeEntryId],
    references: [timeDomain.timeEntries.id],
  }),
  break: one(timeDomain.timeEntryBreaks, {
    fields: [timeDomain.timeEntryAuditEvents.breakId],
    references: [timeDomain.timeEntryBreaks.id],
  }),
  actorUser: one(authDomain.users, {
    fields: [timeDomain.timeEntryAuditEvents.actorUserId],
    references: [authDomain.users.id],
  }),
  actorEmployee: one(workforceDomain.employees, {
    fields: [timeDomain.timeEntryAuditEvents.actorEmployeeId],
    references: [workforceDomain.employees.id],
  }),
}));

export const shiftOrdersRelations = relations(schedulingDomain.shiftOrders, ({ one, many }) => ({
  workspace: one(orgsDomain.workspaces, {
    fields: [schedulingDomain.shiftOrders.workspaceId],
    references: [orgsDomain.workspaces.id],
  }),
  shift: one(schedulingDomain.shifts, {
    fields: [schedulingDomain.shiftOrders.shiftId],
    references: [schedulingDomain.shifts.id],
  }),
  createdByUser: one(authDomain.users, {
    fields: [schedulingDomain.shiftOrders.createdBy],
    references: [authDomain.users.id],
  }),
  acknowledgments: many(schedulingDomain.shiftOrderAcknowledgments),
}));

export const shiftOrderAcknowledgmentsRelations = relations(schedulingDomain.shiftOrderAcknowledgments, ({ one }) => ({
  workspace: one(orgsDomain.workspaces, {
    fields: [schedulingDomain.shiftOrderAcknowledgments.workspaceId],
    references: [orgsDomain.workspaces.id],
  }),
  shiftOrder: one(schedulingDomain.shiftOrders, {
    fields: [schedulingDomain.shiftOrderAcknowledgments.shiftOrderId],
    references: [schedulingDomain.shiftOrders.id],
  }),
  employee: one(workforceDomain.employees, {
    fields: [schedulingDomain.shiftOrderAcknowledgments.employeeId],
    references: [workforceDomain.employees.id],
  }),
}));

export const invoicesRelations = relations(billingDomain.invoices, ({ one, many }) => ({
  workspace: one(orgsDomain.workspaces, {
    fields: [billingDomain.invoices.workspaceId],
    references: [orgsDomain.workspaces.id],
  }),
  client: one(clientsDomain.clients, {
    fields: [billingDomain.invoices.clientId],
    references: [clientsDomain.clients.id],
  }),
  lineItems: many(billingDomain.invoiceLineItems),
}));

export const invoiceLineItemsRelations = relations(billingDomain.invoiceLineItems, ({ one }) => ({
  invoice: one(billingDomain.invoices, {
    fields: [billingDomain.invoiceLineItems.invoiceId],
    references: [billingDomain.invoices.id],
  }),
  timeEntry: one(timeDomain.timeEntries, {
    fields: [billingDomain.invoiceLineItems.timeEntryId],
    references: [timeDomain.timeEntries.id],
  }),
  shift: one(schedulingDomain.shifts, {
    fields: [billingDomain.invoiceLineItems.shiftId],
    references: [schedulingDomain.shifts.id],
  }),
}));
