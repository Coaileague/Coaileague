// Domain Payroll — Route Mounts
// THE LAW: No new routes without Bryan's approval.
// Canonical prefixes: /api/payroll, /api/expenses, /api (pay stubs via per-route auth)
import type { Express, Request, Response } from "express";
import { requireAuth } from "../../auth";
import { mountWorkspaceRoutes } from "./routeMounting";
import payrollRouter from "../payrollRoutes";
import expenseRouter from "../expenseRoutes";
import payStubRouter from "../payStubRoutes";
import plaidRouter from "../plaidRoutes";
import plaidWebhookHandler from "../plaidWebhookRoute";
import { blockFinancialData } from "../../middleware/auditorGuard";
import payrollTimesheetRouter from "../payrollTimesheetRoutes";

export function mountPayrollRoutes(app: Express): void {
  // Property 3: Block auditor sessions from payroll and expense data automatically.
  app.use(["/api/payroll", "/api/expenses"], blockFinancialData);

  // Plaid webhook MUST be registered BEFORE auth middleware — Plaid calls it without user auth.
  app.use("/api/plaid/webhook", plaidWebhookHandler);

  mountWorkspaceRoutes(app, [
    ["/api/payroll", payrollRouter],
    ["/api/timesheets", payrollTimesheetRouter],
    ["/api/expenses", expenseRouter],
    ["/api", payStubRouter],
    ["/api/plaid", plaidRouter],
  ]);
}
