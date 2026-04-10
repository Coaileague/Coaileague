import { Router, Request, Response } from "express";
import { db } from "../../db";
import {
  employees,
  complianceRequirements,
  complianceChecklists,
  complianceStates,
  complianceDocuments,
  employeeComplianceRecords,
} from '@shared/schema';
import { eq, and, sql, inArray } from "drizzle-orm";
import { requireAuth } from "../../auth";
import { createLogger } from '../../lib/logger';
const log = createLogger('Matrix');


const router = Router();

router.use(requireAuth);

router.get("/", async (req: Request, res: Response) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || (req.user)?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: "Workspace required" });
    }

    const { stateCode, role, site } = req.query;

    const allEmployees = await db.select().from(employees)
      .where(eq(employees.workspaceId, workspaceId));

    let filteredEmployees = allEmployees;
    if (role && typeof role === "string") {
      filteredEmployees = filteredEmployees.filter(e => e.role === role || e.position === role);
    }
    if (site && typeof site === "string") {
      filteredEmployees = filteredEmployees.filter(e => e.state === site || e.city === site);
    }

    const records = await db.select().from(employeeComplianceRecords)
      .where(eq(employeeComplianceRecords.workspaceId, workspaceId));

    let stateFilter: string | undefined;
    if (stateCode && typeof stateCode === "string") {
      const stateRows = await db.select().from(complianceStates)
        .where(eq(complianceStates.stateCode, stateCode.toUpperCase()))
        .limit(1);
      if (stateRows.length) {
        stateFilter = stateRows[0].id;
      }
    }

    const states = await db.select().from(complianceStates);
    const stateIds = stateFilter ? [stateFilter] : states.map(s => s.id);

    let requirements: any[] = [];
    if (stateIds.length > 0) {
      requirements = await db.select().from(complianceRequirements)
        .where(and(
          inArray(complianceRequirements.stateId, stateIds),
          eq(complianceRequirements.isActive, true)
        ))
        .orderBy(complianceRequirements.sortOrder);
    }

    const checklists = await db.select().from(complianceChecklists)
      .where(eq(complianceChecklists.workspaceId, workspaceId));

    const documents = await db.select({
      id: complianceDocuments.id,
      employeeId: complianceDocuments.employeeId,
      requirementId: complianceDocuments.requirementId,
      status: complianceDocuments.status,
      expirationDate: complianceDocuments.expirationDate,
      complianceRecordId: complianceDocuments.complianceRecordId,
    }).from(complianceDocuments)
      .where(eq(complianceDocuments.workspaceId, workspaceId));

    const checklistMap = new Map<string, any>();
    for (const cl of checklists) {
      const key = `${cl.complianceRecordId}:${cl.requirementId}`;
      checklistMap.set(key, cl);
    }

    const docMap = new Map<string, any[]>();
    for (const doc of documents) {
      const key = `${doc.complianceRecordId}:${doc.requirementId}`;
      if (!docMap.has(key)) docMap.set(key, []);
      docMap.get(key)!.push(doc);
    }

    const recordsByEmployee = new Map<string, any>();
    for (const rec of records) {
      recordsByEmployee.set(rec.employeeId, rec);
    }

    const now = new Date();
    const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    let compliant = 0;
    let nonCompliant = 0;
    let partial = 0;
    let expiringSoon = 0;
    let missing = 0;
    let total = 0;

    const matrixRows = filteredEmployees.map(emp => {
      const record = recordsByEmployee.get(emp.id);
      const cells: Record<string, { status: string; expirationDate: string | null; isExpiringSoon: boolean }> = {};

      let empCompliant = true;
      let empHasAny = false;

      for (const req of requirements) {
        total++;
        if (!record) {
          cells[req.id] = { status: "missing", expirationDate: null, isExpiringSoon: false };
          missing++;
          empCompliant = false;
          continue;
        }

        const clKey = `${record.id}:${req.id}`;
        const cl = checklistMap.get(clKey);
        const docs = docMap.get(clKey) || [];

        if (cl?.isCompleted) {
          const expDate = cl.expirationDate;
          const isExpiring = expDate ? new Date(expDate) <= thirtyDays : false;
          if (isExpiring) {
            cells[req.id] = { status: "expiring", expirationDate: expDate?.toISOString() || null, isExpiringSoon: true };
            expiringSoon++;
            empHasAny = true;
          } else {
            cells[req.id] = { status: "complete", expirationDate: expDate?.toISOString() || null, isExpiringSoon: false };
            empHasAny = true;
          }
        } else if (docs.length > 0) {
          const latestDoc = docs[docs.length - 1];
          if (latestDoc.status === "approved" || latestDoc.status === "verified") {
            cells[req.id] = { status: "complete", expirationDate: latestDoc.expirationDate?.toISOString() || null, isExpiringSoon: false };
            empHasAny = true;
          } else if (latestDoc.status === "pending" || latestDoc.status === "pending_review") {
            cells[req.id] = { status: "pending", expirationDate: null, isExpiringSoon: false };
            empHasAny = true;
            empCompliant = false;
          } else if (latestDoc.status === "rejected") {
            cells[req.id] = { status: "rejected", expirationDate: null, isExpiringSoon: false };
            empCompliant = false;
          } else {
            cells[req.id] = { status: "pending", expirationDate: null, isExpiringSoon: false };
            empHasAny = true;
            empCompliant = false;
          }
        } else {
          cells[req.id] = { status: "missing", expirationDate: null, isExpiringSoon: false };
          missing++;
          empCompliant = false;
        }
      }

      if (empCompliant && requirements.length > 0) {
        compliant++;
      } else if (empHasAny) {
        partial++;
      } else if (requirements.length > 0) {
        nonCompliant++;
      }

      return {
        employeeId: emp.id,
        firstName: emp.firstName,
        lastName: emp.lastName,
        role: emp.role || emp.position || "Staff",
        state: emp.state || "",
        complianceScore: record?.complianceScore ?? 0,
        overallStatus: record?.overallStatus ?? "incomplete",
        cells,
      };
    });

    const uniqueRoles = [...new Set(allEmployees.map(e => e.role || e.position).filter(Boolean))];
    const uniqueSites = [...new Set(allEmployees.map(e => e.state).filter(Boolean))];

    res.json({
      success: true,
      matrix: {
        requirements: requirements.map(r => ({
          id: r.id,
          code: r.requirementCode,
          name: r.requirementName,
          category: r.category,
          isCritical: r.isCritical,
          isRequired: r.isRequired,
          stateId: r.stateId,
        })),
        rows: matrixRows,
        stats: {
          totalEmployees: filteredEmployees.length,
          compliant,
          nonCompliant,
          partial,
          expiringSoon,
          missingDocuments: missing,
          totalCells: total,
          complianceRate: filteredEmployees.length > 0
            ? Math.round((compliant / filteredEmployees.length) * 100)
            : 0,
        },
        filters: {
          roles: uniqueRoles,
          sites: uniqueSites,
          states: states.map(s => ({ id: s.id, code: s.stateCode, name: s.stateName })),
        },
      },
    });
  } catch (error) {
    log.error("[Compliance Matrix] Error:", error);
    res.status(500).json({ success: false, error: "Failed to build compliance matrix" });
  }
});

export const matrixRoutes = router;
