import { Router } from "express";
import { db } from "../db";
import {
  employees,
  trainingCertifications,
} from '@shared/schema';
import { eq, and, desc, lte, gte } from "drizzle-orm";
import type { AuthenticatedRequest } from "../rbac";
import { createLogger } from '../lib/logger';
const log = createLogger('CredentialRoutes');


const router = Router();

router.get("/wallet", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    if (!workspaceId) return res.status(403).json({ error: "Workspace context required" });

    const [employee] = await db
      .select()
      .from(employees)
      .where(and(eq(employees.workspaceId, workspaceId), eq(employees.userId, userId)));

    if (!employee) {
      const allCerts = await db
        .select()
        .from(trainingCertifications)
        .where(eq(trainingCertifications.workspaceId, workspaceId))
        .orderBy(desc(trainingCertifications.createdAt));

      return res.json({ credentials: allCerts, employee: null });
    }

    const certs = await db
      .select()
      .from(trainingCertifications)
      .where(and(
        eq(trainingCertifications.workspaceId, workspaceId),
        eq(trainingCertifications.employeeId, employee.id)
      ))
      .orderBy(desc(trainingCertifications.createdAt));

    res.json({ credentials: certs, employee });
  } catch (error: unknown) {
    log.error("Error fetching credential wallet:", error);
    res.status(500).json({ error: "Failed to fetch credential wallet" });
  }
});

router.get("/expiring", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const now = new Date();
    const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const ninetyDays = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    const expiring = await db
      .select({
        cert: trainingCertifications,
        employee: employees,
      })
      .from(trainingCertifications)
      .leftJoin(employees, eq(trainingCertifications.employeeId, employees.id))
      .where(and(
        eq(trainingCertifications.workspaceId, workspaceId),
        lte(trainingCertifications.expiryDate, ninetyDays),
        gte(trainingCertifications.expiryDate, now)
      ))
      .orderBy(trainingCertifications.expiryDate);

    const critical = expiring.filter(e => e.cert.expiryDate && new Date(e.cert.expiryDate) <= thirtyDays);
    const warning = expiring.filter(e => e.cert.expiryDate && new Date(e.cert.expiryDate) > thirtyDays);

    res.json({ critical, warning, total: expiring.length });
  } catch (error: unknown) {
    log.error("Error fetching expiring credentials:", error);
    res.status(500).json({ error: "Failed to fetch expiring credentials" });
  }
});

router.get("/verify/:certId", async (req: AuthenticatedRequest, res) => {
  try {
    const [cert] = await db
      .select({
        cert: trainingCertifications,
        employee: employees,
      })
      .from(trainingCertifications)
      .leftJoin(employees, eq(trainingCertifications.employeeId, employees.id))
      .where(eq(trainingCertifications.id, req.params.certId));

    if (!cert) return res.status(404).json({ error: "Credential not found", valid: false });

    const isExpired = cert.cert.expiryDate && new Date(cert.cert.expiryDate) < new Date();
    const isVerified = cert.cert.status === "active";

    res.json({
      valid: isVerified && !isExpired,
      credential: {
        type: cert.cert.issuingOrganization,
        name: cert.cert.name,
        number: cert.cert.certificationNumber,
        status: isExpired ? "expired" : cert.cert.status,
        issuingAuthority: cert.cert.issuingOrganization,
        expirationDate: cert.cert.expiryDate,
      },
      holder: cert.employee ? {
        firstName: cert.employee.firstName,
        lastName: cert.employee.lastName,
      } : null,
    });
  } catch (error: unknown) {
    log.error("Error verifying credential:", error);
    res.status(500).json({ error: "Failed to verify credential" });
  }
});

router.get("/summary", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const now = new Date();
    const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const allCerts = await db
      .select()
      .from(trainingCertifications)
      .where(eq(trainingCertifications.workspaceId, workspaceId));

    const total = allCerts.length;
    const verified = allCerts.filter(c => c.status === "active").length;
    const pending = allCerts.filter(c => c.status === "pending").length;
    const expired = allCerts.filter(c => c.status === "expired" || (c.expiryDate && new Date(c.expiryDate) < now)).length;
    const expiringSoon = allCerts.filter(c => c.expiryDate && new Date(c.expiryDate) >= now && new Date(c.expiryDate) <= thirtyDays).length;

    res.json({ total, verified, pending, expired, expiringSoon });
  } catch (error: unknown) {
    log.error("Error fetching credential summary:", error);
    res.status(500).json({ error: "Failed to fetch credential summary" });
  }
});

export default router;
