/**
 * Auditor Public Routes — token-only access for state regulators.
 *
 * Public surface (no CoAIleague login required). Each endpoint validates a
 * stateless signed auditor token (see services/documents/auditorTokenService)
 * and is mounted behind `portalLimiter` (60 req/min per IP) at the domain
 * router level.
 *
 * Endpoints:
 *   GET /api/public/auditor/document/:token            — preview PDF inline
 *   GET /api/public/auditor/document/:token/download   — force download
 *   GET /api/public/auditor/document/:token/info       — metadata + integrity
 *
 * Each access is audit-logged with the regulator email, IP, and User-Agent.
 * The PDF is delivered with the same hardened response headers as authenticated
 * downloads, plus an additional X-Auditor-Access header so the regulator's
 * tooling can record the issuance context.
 */
import { Router, type Request, type Response } from "express";
import { createHash } from "crypto";
import { db } from "../db";
import { documentVault } from "@shared/schema";
import { and, eq, isNull } from "drizzle-orm";
import { downloadFileFromObjectStorage } from "../objectStorage";
import { writeHardenedPdfHeaders } from "../lib/pdfResponseHeaders";
import { universalAudit } from "../services/universalAuditService";
import { verifyAuditorToken } from "../services/documents/auditorTokenService";
import { createLogger } from "../lib/logger";

const log = createLogger("AuditorPublicRoutes");

export const auditorPublicRouter = Router();

/** Resolve the vault doc this token grants access to, or return null and a status code. */
async function resolveTokenAndDoc(req: Request, res: Response) {
  const token = req.params.token;
  const result = verifyAuditorToken(token);
  if (!result.ok) {
    log.warn(`[AuditorPublic] token ${result.reason} from ${req.ip}`);
    res.status(result.reason === "expired" ? 410 : 401).json({
      error: result.reason === "expired" ? "Auditor link has expired" : "Invalid auditor token",
    });
    return null;
  }
  const payload = result.payload;

  const [doc] = await db
    .select()
    .from(documentVault)
    .where(and(
      eq(documentVault.id, payload.v),
      eq(documentVault.workspaceId, payload.w),
      isNull(documentVault.deletedAt),
    ));
  if (!doc) {
    res.status(404).json({ error: "Document no longer available" });
    return null;
  }

  return { payload, doc };
}

async function streamForAuditor(req: Request, res: Response, mode: "inline" | "attachment") {
  const resolved = await resolveTokenAndDoc(req, res);
  if (!resolved) return;
  const { payload, doc } = resolved;

  const fileUrl = doc.fileUrl || "";
  if (!fileUrl || /^https?:\/\//i.test(fileUrl) || fileUrl.startsWith("internal://")) {
    return res.status(409).json({ error: "Document file is not available for streaming" });
  }
  // Defense in depth — same workspaceId-in-path check as authenticated stream
  if (fileUrl.startsWith("vault/") || fileUrl.startsWith("/vault/")) {
    const segments = fileUrl.split("/").filter(Boolean);
    if (!segments.includes(payload.w)) {
      log.error(`[AuditorPublic] CROSS-TENANT PATH BLOCKED — doc=${doc.id} ws=${payload.w}`);
      return res.status(403).json({ error: "Access denied" });
    }
  }

  let buffer: Buffer;
  try {
    buffer = await downloadFileFromObjectStorage(fileUrl);
  } catch (err: unknown) {
    log.error(`[AuditorPublic] storage fetch failed for doc=${doc.id}:`, (err instanceof Error ? err.message : String(err)));
    return res.status(404).json({ error: "Document file not found" });
  }

  // Integrity verification — refuse to serve a tampered file
  if (doc.integrityHash) {
    const computed = createHash("sha256").update(buffer).digest("hex");
    if (computed !== doc.integrityHash) {
      log.error(`[AuditorPublic] INTEGRITY MISMATCH doc=${doc.id}`);
      return res.status(409).json({ error: "Document integrity check failed" });
    }
  }

  await universalAudit.log({
    workspaceId: payload.w,
    actorId: `regulator:${payload.aud}`,
    actorType: "external",
    changeType: "read",
    action: mode === "inline" ? "AUDITOR_TOKEN:PREVIEWED" : "AUDITOR_TOKEN:DOWNLOADED",
    entityType: "document_vault",
    entityId: doc.id,
    entityName: doc.title,
    metadata: {
      regulatorEmail: payload.aud,
      regulatorName: payload.name ?? null,
      issuingUserId: payload.iss,
      tokenExpiresAt: new Date(payload.exp).toISOString(),
      remoteIp: req.ip,
      userAgent: req.headers["user-agent"] ?? null,
      sizeBytes: buffer.length,
    },
  });

  writeHardenedPdfHeaders(res, {
    filename: `${doc.documentNumber || doc.id}.pdf`,
    size: buffer.length,
    mode,
    contentType: doc.mimeType || "application/pdf",
  });
  // Surface the issuance metadata in headers so the regulator's tooling
  // records who issued the token and when it expires.
  res.setHeader("X-Auditor-Access", "true");
  res.setHeader("X-Auditor-Email", payload.aud);
  res.setHeader("X-Auditor-Token-Expires", new Date(payload.exp).toISOString());
  return res.send(buffer);
}

auditorPublicRouter.get("/document/:token", async (req, res) => {
  return streamForAuditor(req, res, "inline");
});

auditorPublicRouter.get("/document/:token/download", async (req, res) => {
  return streamForAuditor(req, res, "attachment");
});

auditorPublicRouter.get("/document/:token/info", async (req, res) => {
  const resolved = await resolveTokenAndDoc(req, res);
  if (!resolved) return;
  const { payload, doc } = resolved;

  // Lightweight info endpoint — regulator's portal can preflight what the
  // token grants before triggering the download. Emails and signatures are
  // intentionally omitted.
  res.json({
    documentNumber: doc.documentNumber,
    title: doc.title,
    category: doc.category,
    fileSizeBytes: doc.fileSizeBytes,
    isSigned: doc.isSigned,
    createdAt: doc.createdAt,
    integrityHashPrefix: doc.integrityHash ? doc.integrityHash.slice(0, 16) : null,
    issuance: {
      regulatorEmail: payload.aud,
      regulatorName: payload.name ?? null,
      issuedAt: new Date(payload.iat).toISOString(),
      expiresAt: new Date(payload.exp).toISOString(),
    },
  });
});

export default auditorPublicRouter;
