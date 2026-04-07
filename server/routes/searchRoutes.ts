/**
 * PHASE 35 — GLOBAL SEARCH
 * Unified search across all entity types with role gating, workspace isolation,
 * deep links, rate limiting (30 req/min/user), and search query logging.
 */

import { sanitizeError } from '../middleware/errorHandler';
import type { Express, Request, Response } from 'express';
import express from 'express';
import { pool } from '../db';
import { createLogger } from '../lib/logger';
const log = createLogger('SearchRoutes');


interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    workspaceId?: string;
    currentWorkspaceId?: string;
    role?: string;
    workspaceRole?: string;
  };
  workspaceId?: string;
}

// ── Role hierarchy ────────────────────────────────────────────────────────────
const ROLE_LEVEL: Record<string, number> = {
  platform_admin: 100,
  platform_staff: 90,
  org_owner: 80,
  manager: 60,
  compliance_officer: 55,
  supervisor: 40,
  officer: 20,
  client: 10,
};

function roleLevel(role?: string): number {
  return ROLE_LEVEL[role ?? ''] ?? 0;
}

function userRole(req: AuthenticatedRequest): string {
  return req.user?.role ?? req.user?.workspaceRole ?? 'officer';
}

function hasRole(req: AuthenticatedRequest, minRole: string): boolean {
  return roleLevel(userRole(req)) >= roleLevel(minRole);
}

// ── In-memory rate limiter: 30 req/min per user ───────────────────────────────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

// ── Deep link map ─────────────────────────────────────────────────────────────
const DEEP_LINKS: Record<string, (id: string, extra?: Record<string, string>) => string> = {
  officer: (id) => `/officers/${id}`,
  client: (id) => `/clients/${id}`,
  shift: (id) => `/schedule?shiftId=${id}`,
  invoice: (id) => `/invoices/${id}`,
  incident: (id) => `/incidents/${id}`,
  support_ticket: (id) => `/help-desk/tickets/${id}`,
  document: (id) => `/documents/${id}`,
  audit_log: (id) => `/audit-log?entry=${id}`,
};

// ── Entity type icons for frontend ───────────────────────────────────────────
const ENTITY_ICONS: Record<string, string> = {
  officer: 'Users',
  client: 'Building2',
  shift: 'Calendar',
  invoice: 'FileText',
  incident: 'AlertTriangle',
  support_ticket: 'HelpCircle',
  document: 'File',
  audit_log: 'Shield',
};

// ── Search result type ────────────────────────────────────────────────────────
interface SearchResult {
  entity_type: string;
  entity_id: string;
  display_name: string;
  subtitle: string;
  canonical_id?: string | null; // Phase 57 — EMP-ACM-00034, CLT-ACM-00891, etc.
  relevance_score: number;
  created_at: string | null;
  deep_link: string;
  icon: string;
}

// ── Log search query (no PII — no user ID, only role + workspace) ─────────────
async function logSearchQuery(
  workspaceId: string,
  query: string,
  entityTypes: string[],
  resultCount: number,
  tookMs: number,
  userRoleValue: string
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO search_query_log (workspace_id, query_text, entity_types, result_count, took_ms, user_role)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [workspaceId, query.slice(0, 200), entityTypes, resultCount, tookMs, userRoleValue]
    );
  } catch {
    // Non-fatal — search logging failure should never break search
  }
}

// ── Sub-queries per entity type ───────────────────────────────────────────────

async function searchOfficers(workspaceId: string, q: string, limit: number): Promise<SearchResult[]> {
  const { rows } = await pool.query(
    `SELECT id, first_name, last_name, email, employee_number, guard_card_number, role, created_at,
            similarity(coalesce(first_name,'') || ' ' || coalesce(last_name,'') || ' ' || coalesce(email,'') || ' ' || coalesce(employee_number,''), $2) AS sim
     FROM employees
     WHERE workspace_id = $1
       AND is_active = true
       AND (coalesce(first_name,'') || ' ' || coalesce(last_name,'') || ' ' || coalesce(email,'')
            || ' ' || coalesce(employee_number,'') || ' ' || coalesce(guard_card_number,'') || ' ' || coalesce(phone,'')) ILIKE $3
     ORDER BY sim DESC, created_at DESC
     LIMIT $4`,
    [workspaceId, q, `%${q}%`, limit]
  );
  return rows.map((r: any) => ({
    entity_type: 'officer',
    entity_id: r.id,
    display_name: `${r.first_name} ${r.last_name}`,
    subtitle: [r.role, r.employee_number || null, r.email].filter(Boolean).join(' · '),
    canonical_id: r.employee_number || null,
    relevance_score: parseFloat(r.sim ?? '0'),
    created_at: r.created_at,
    deep_link: DEEP_LINKS.officer(r.id),
    icon: ENTITY_ICONS.officer,
  }));
}

async function searchClients(workspaceId: string, q: string, limit: number): Promise<SearchResult[]> {
  const { rows } = await pool.query(
    `SELECT id, company_name, first_name, last_name, email, poc_name, is_active, created_at, client_number,
            similarity(coalesce(company_name,'') || ' ' || coalesce(first_name,'') || ' ' || coalesce(last_name,'') || ' ' || coalesce(client_number,''), $2) AS sim
     FROM clients
     WHERE workspace_id = $1
       AND (coalesce(company_name,'') || ' ' || coalesce(first_name,'') || ' ' || coalesce(last_name,'')
            || ' ' || coalesce(email,'') || ' ' || coalesce(poc_name,'') || ' ' || coalesce(poc_email,'')
            || ' ' || coalesce(client_number,'')) ILIKE $3
     ORDER BY sim DESC, created_at DESC
     LIMIT $4`,
    [workspaceId, q, `%${q}%`, limit]
  );
  return rows.map((r: any) => ({
    entity_type: 'client',
    entity_id: r.id,
    display_name: r.company_name || `${r.first_name} ${r.last_name}`,
    subtitle: [r.poc_name ? `Contact: ${r.poc_name}` : null, r.client_number || null, r.is_active ? 'Active' : 'Inactive'].filter(Boolean).join(' · '),
    canonical_id: r.client_number || null,
    relevance_score: parseFloat(r.sim ?? '0'),
    created_at: r.created_at,
    deep_link: DEEP_LINKS.client(r.id),
    icon: ENTITY_ICONS.client,
  }));
}

async function searchShifts(workspaceId: string, q: string, limit: number): Promise<SearchResult[]> {
  const { rows } = await pool.query(
    `SELECT s.id, s.title, s.description, s.status, s.date, s.start_time, s.end_time, s.created_at, s.shift_number,
            c.company_name AS client_name,
            e.first_name || ' ' || e.last_name AS officer_name,
            similarity(coalesce(s.title,'') || ' ' || coalesce(s.description,'') || ' ' || coalesce(s.shift_number,''), $2) AS sim
     FROM shifts s
     LEFT JOIN clients c ON c.id = s.client_id
     LEFT JOIN employees e ON e.id = s.employee_id
     WHERE s.workspace_id = $1
       AND (coalesce(s.title,'') || ' ' || coalesce(s.description,'') || ' ' || coalesce(c.company_name,'')
            || ' ' || coalesce(e.first_name || ' ' || e.last_name,'') || ' ' || coalesce(s.shift_number,'')) ILIKE $3
     ORDER BY sim DESC, s.created_at DESC
     LIMIT $4`,
    [workspaceId, q, `%${q}%`, limit]
  );
  return rows.map((r: any) => ({
    entity_type: 'shift',
    entity_id: r.id,
    display_name: r.title || r.shift_number || 'Shift',
    subtitle: [r.shift_number, r.client_name, r.officer_name, r.status].filter(Boolean).join(' · '),
    canonical_id: r.shift_number || null,
    relevance_score: parseFloat(r.sim ?? '0'),
    created_at: r.created_at,
    deep_link: DEEP_LINKS.shift(r.id),
    icon: ENTITY_ICONS.shift,
  }));
}

async function searchInvoices(workspaceId: string, q: string, limit: number): Promise<SearchResult[]> {
  const { rows } = await pool.query(
    `SELECT i.id, i.invoice_number, i.status, i.total, i.due_date, i.created_at,
            c.company_name AS client_name,
            similarity(coalesce(i.invoice_number,'') || ' ' || coalesce(c.company_name,''), $2) AS sim
     FROM invoices i
     LEFT JOIN clients c ON c.id = i.client_id
     WHERE i.workspace_id = $1
       AND (coalesce(i.invoice_number,'') || ' ' || coalesce(c.company_name,'') || ' ' || coalesce(i.notes,'')) ILIKE $3
     ORDER BY sim DESC, i.created_at DESC
     LIMIT $4`,
    [workspaceId, q, `%${q}%`, limit]
  );
  return rows.map((r: any) => ({
    entity_type: 'invoice',
    entity_id: r.id,
    display_name: r.invoice_number || `Invoice`,
    subtitle: [r.client_name, r.status, r.total ? `$${parseFloat(r.total).toFixed(2)}` : null].filter(Boolean).join(' · '),
    relevance_score: parseFloat(r.sim ?? '0'),
    created_at: r.created_at,
    deep_link: DEEP_LINKS.invoice(r.id),
    icon: ENTITY_ICONS.invoice,
  }));
}

async function searchIncidents(workspaceId: string, q: string, limit: number): Promise<SearchResult[]> {
  const { rows } = await pool.query(
    `SELECT id, title, incident_type, status, location_address, occurred_at, created_at,
            incident_number,
            similarity(coalesce(title,'') || ' ' || coalesce(polished_description,'') || ' ' || coalesce(incident_type,''), $2) AS sim
     FROM incident_reports
     WHERE workspace_id = $1
       AND (coalesce(title,'') || ' ' || coalesce(polished_description,'') || ' ' || coalesce(raw_description,'') || ' ' || coalesce(incident_type,'') || ' ' || coalesce(location_address,'')) ILIKE $3
     ORDER BY sim DESC, created_at DESC
     LIMIT $4`,
    [workspaceId, q, `%${q}%`, limit]
  );
  return rows.map((r: any) => ({
    entity_type: 'incident',
    entity_id: r.id,
    display_name: r.title || r.incident_number || 'Incident',
    subtitle: [r.incident_type, r.status, r.location_address].filter(Boolean).join(' · '),
    relevance_score: parseFloat(r.sim ?? '0'),
    created_at: r.created_at,
    deep_link: DEEP_LINKS.incident(r.id),
    icon: ENTITY_ICONS.incident,
  }));
}

async function searchSupportTickets(workspaceId: string, q: string, limit: number): Promise<SearchResult[]> {
  const { rows } = await pool.query(
    `SELECT id, ticket_number, subject, status, priority, type, created_at,
            similarity(coalesce(subject,'') || ' ' || coalesce(ticket_number,''), $2) AS sim
     FROM support_tickets
     WHERE workspace_id = $1
       AND (coalesce(subject,'') || ' ' || coalesce(description,'') || ' ' || coalesce(ticket_number,'')) ILIKE $3
     ORDER BY sim DESC, created_at DESC
     LIMIT $4`,
    [workspaceId, q, `%${q}%`, limit]
  );
  return rows.map((r: any) => ({
    entity_type: 'support_ticket',
    entity_id: r.id,
    display_name: r.subject || r.ticket_number || 'Ticket',
    subtitle: [r.ticket_number, r.priority, r.status, r.type].filter(Boolean).join(' · '),
    relevance_score: parseFloat(r.sim ?? '0'),
    created_at: r.created_at,
    deep_link: DEEP_LINKS.support_ticket(r.id),
    icon: ENTITY_ICONS.support_ticket,
  }));
}

async function searchDocuments(workspaceId: string, q: string, limit: number): Promise<SearchResult[]> {
  const { rows } = await pool.query(
    `SELECT id, title, category, related_entity_type, mime_type, created_at,
            similarity(coalesce(title,'') || ' ' || coalesce(category,''), $2) AS sim
     FROM document_vault
     WHERE workspace_id = $1
       AND deleted_at IS NULL
       AND (coalesce(title,'') || ' ' || coalesce(category,'')) ILIKE $3
     ORDER BY sim DESC, created_at DESC
     LIMIT $4`,
    [workspaceId, q, `%${q}%`, limit]
  );
  return rows.map((r: any) => ({
    entity_type: 'document',
    entity_id: r.id,
    display_name: r.title || 'Document',
    subtitle: [r.category, r.related_entity_type].filter(Boolean).join(' · '),
    relevance_score: parseFloat(r.sim ?? '0'),
    created_at: r.created_at,
    deep_link: DEEP_LINKS.document(r.id),
    icon: ENTITY_ICONS.document,
  }));
}

async function searchAuditLog(workspaceId: string, q: string, limit: number): Promise<SearchResult[]> {
  const { rows } = await pool.query(
    `SELECT id::text, action_type, resource_type, resource_id, timestamp AS created_at
     FROM sra_audit_log
     WHERE workspace_id = $1
       AND (coalesce(action_type,'') || ' ' || coalesce(resource_type,'') || ' ' || coalesce(resource_id::text,'')) ILIKE $2
     ORDER BY timestamp DESC
     LIMIT $3`,
    [workspaceId, `%${q}%`, limit]
  );
  return rows.map((r: any) => ({
    entity_type: 'audit_log',
    entity_id: r.id,
    display_name: `${r.action_type} — ${r.resource_type}`,
    subtitle: r.resource_id ? `Resource: ${r.resource_id}` : 'Audit event',
    relevance_score: 0.5,
    created_at: r.created_at,
    deep_link: DEEP_LINKS.audit_log(r.id),
    icon: ENTITY_ICONS.audit_log,
  }));
}

// ── All entity types with role requirements ───────────────────────────────────
const ENTITY_SEARCHERS: Array<{
  type: string;
  minRole: string;
  fn: (wsId: string, q: string, limit: number) => Promise<SearchResult[]>;
}> = [
  { type: 'officer',        minRole: 'supervisor',         fn: searchOfficers },
  { type: 'client',         minRole: 'manager',            fn: searchClients },
  { type: 'shift',          minRole: 'supervisor',         fn: searchShifts },
  { type: 'invoice',        minRole: 'manager',            fn: searchInvoices },
  { type: 'incident',       minRole: 'supervisor',         fn: searchIncidents },
  { type: 'support_ticket', minRole: 'platform_staff',     fn: searchSupportTickets },
  { type: 'document',       minRole: 'manager',            fn: searchDocuments },
  { type: 'audit_log',      minRole: 'org_owner',          fn: searchAuditLog },
];

// ── Route registration ────────────────────────────────────────────────────────

export function registerSearchRoutes(app: Express, requireAuth: any) {
  const searchRouter = express.Router();

  // GET /api/search?q=&types=officer,client&limit=20&offset=0
  searchRouter.get('/', requireAuth, async (req: Request, res: Response) => {
    const start = Date.now();
    const authReq = req as AuthenticatedRequest;

    try {
      const userId = authReq.user?.id;
      if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

      // Rate limit
      if (!checkRateLimit(userId)) {
        return res.status(429).json({ success: false, error: 'Too many search requests — please wait a moment' });
      }

      const workspaceId = authReq.workspaceId || authReq.user?.workspaceId || authReq.user?.currentWorkspaceId;
      if (!workspaceId) return res.status(403).json({ success: false, error: 'No workspace selected' });

      const q = ((req.query.q as string) || '').trim();
      if (q.length < 2) {
        return res.json({ success: true, data: { results: [], total: 0, took_ms: 0, query: q } });
      }
      if (q.length > 100) {
        return res.status(400).json({ success: false, error: 'Query too long (max 100 characters)' });
      }

      // ── ID-prefix shortcut ───────────────────────────────────────────────
      // If the query looks like a canonical ID (ORG-, EMP-, CLT-, INV-, DOC-, CLK-, SHF-, TKT-, INC-, USR-)
      // resolve it directly instead of running fuzzy search.
      // Role gate mirrors the minRole requirements in ENTITY_SEARCHERS below.
      const ID_PREFIX_RE = /^(ORG|EMP|CLT|INV|DOC|CLK|SHF|TKT|INC|USR)-[A-Z0-9-]+$/i;
      if (ID_PREFIX_RE.test(q)) {
        try {
          const { resolveEntityById } = await import('../services/universalIdService');
          const entity = await resolveEntityById(q.toUpperCase(), workspaceId);
          if (entity) {
            // Role gate — must mirror ENTITY_SEARCHERS minRole requirements
            const ENTITY_MIN_ROLES: Record<string, string> = {
              employee: 'supervisor',
              workspace: 'org_owner',
              client: 'manager',
              shift: 'supervisor',
              invoice: 'manager',
              incident: 'supervisor',
              support_ticket: 'platform_staff',
              document: 'manager',
              time_entry: 'supervisor',
              user: 'org_owner',
            };
            const requiredRole = ENTITY_MIN_ROLES[entity.type] || 'manager';
            if (!hasRole(authReq, requiredRole)) {
              // Fall through to normal search — do not disclose entity existence to unauthorized users
            } else {
              // Map internal entity types to frontend SearchResult conventions
              const TYPE_MAP: Record<string, string> = {
                employee: 'officer', workspace: 'workspace', client: 'client',
                shift: 'shift', invoice: 'invoice', support_ticket: 'support_ticket',
                document: 'document', time_entry: 'time_entry', user: 'user',
                incident: 'incident',
              };
              const LINK_MAP: Record<string, string> = {
                employee: `/officers/${entity.id}`, workspace: `/settings/organization`,
                client: `/clients/${entity.id}`, shift: `/schedule?shiftId=${entity.id}`,
                invoice: `/invoices/${entity.id}`, support_ticket: `/help-desk/tickets/${entity.id}`,
                document: `/documents/${entity.id}`, time_entry: `/timeclock?entryId=${entity.id}`,
                user: `/settings/profile`, incident: `/incidents/${entity.id}`,
              };
              const ICON_MAP: Record<string, string> = {
                employee: 'Users', workspace: 'Building', client: 'Building2',
                shift: 'Calendar', invoice: 'FileText', support_ticket: 'HelpCircle',
                document: 'File', time_entry: 'Clock', user: 'Users', incident: 'AlertTriangle',
              };
              const result: SearchResult = {
                entity_type: TYPE_MAP[entity.type] || entity.type,
                entity_id: entity.id,
                display_name: entity.displayName,
                subtitle: entity.humanId,
                canonical_id: entity.humanId,
                relevance_score: 1.0,
                created_at: null,
                deep_link: LINK_MAP[entity.type] || '',
                icon: ICON_MAP[entity.type] || 'Search',
              };
              return res.json({
                success: true,
                data: { query: q, results: [result], total: 1, took_ms: Date.now() - start },
              });
            }
          }
        } catch {
          // Fall through to normal search if resolution fails
        }
      }
      // ────────────────────────────────────────────────────────────────────

      const requestedTypes = req.query.types
        ? (req.query.types as string).split(',').map(t => t.trim())
        : null;
      const limit = Math.min(parseInt((req.query.limit as string) || '20', 10), 50);
      const offset = parseInt((req.query.offset as string) || '0', 10);

      const role = userRole(authReq);

      // Run all permitted entity searches in parallel
      const searchers = ENTITY_SEARCHERS.filter(s => {
        if (requestedTypes && !requestedTypes.includes(s.type)) return false;
        return hasRole(authReq, s.minRole);
      });

      const perTypeLimit = Math.ceil((limit + offset) / Math.max(searchers.length, 1)) + 5;
      const resultSets = await Promise.all(searchers.map(s => s.fn(workspaceId, q, perTypeLimit).catch(() => [])));

      // Flatten, sort by relevance, apply pagination
      const allResults: SearchResult[] = resultSets.flat();
      allResults.sort((a, b) => {
        if (b.relevance_score !== a.relevance_score) return b.relevance_score - a.relevance_score;
        return (b.created_at ?? '') > (a.created_at ?? '') ? 1 : -1;
      });

      const total = allResults.length;
      const paginated = allResults.slice(offset, offset + limit);

      const tookMs = Date.now() - start;

      // Log asynchronously — don't await, never block response
      void logSearchQuery(workspaceId, q, searchers.map(s => s.type), total, tookMs, role);

      return res.json({
        success: true,
        data: {
          query: q,
          results: paginated,
          total,
          took_ms: tookMs,
        },
      });

    } catch (error: unknown) {
      log.error('[Search] Error:', error);
      return res.status(500).json({ success: false, error: 'Search failed', message: sanitizeError(error) });
    }
  });

  // GET /api/search/suggestions?q= (kept for backward compatibility)
  searchRouter.get('/suggestions', requireAuth, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const workspaceId = authReq.workspaceId || authReq.user?.workspaceId || authReq.user?.currentWorkspaceId;
      const q = ((req.query.q as string) || '').trim();
      if (!workspaceId || q.length < 1) {
        return res.json({ success: true, data: { query: q, suggestions: [] } });
      }
      // Return recent distinct queries from the log as suggestions
      const { rows } = await pool.query(
        `SELECT DISTINCT query_text FROM search_query_log
         WHERE workspace_id = $1 AND query_text ILIKE $2
         ORDER BY query_text LIMIT 8`,
        [workspaceId, `${q}%`]
      );
      return res.json({ success: true, data: { query: q, suggestions: rows.map((r: any) => r.query_text) } });
    } catch {
      return res.json({ success: true, data: { query: '', suggestions: [] } });
    }
  });

  // POST /api/search/log-click — log when a result is clicked
  searchRouter.post('/log-click', requireAuth, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const workspaceId = authReq.workspaceId || authReq.user?.workspaceId || authReq.user?.currentWorkspaceId;
      const { entity_type, entity_id } = req.body;
      if (workspaceId && entity_type && entity_id) {
        await pool.query(
          `UPDATE search_query_log SET clicked_entity_type = $1, clicked_entity_id = $2
           WHERE workspace_id = $3 AND id = (SELECT id FROM search_query_log WHERE workspace_id = $3 ORDER BY created_at DESC LIMIT 1)`,
          [entity_type, entity_id, workspaceId]
        );
      }
      return res.json({ success: true });
    } catch {
      return res.json({ success: true });
    }
  });

  // ── GET /api/search/resolve/:humanId — look up any entity by its canonical ID ──
  // e.g. /api/search/resolve/EMP-ACM-00034 → employee record
  searchRouter.get('/resolve/:humanId', requireAuth, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const workspaceId = authReq.workspaceId || authReq.user?.workspaceId || authReq.user?.currentWorkspaceId;
      const { humanId } = req.params;
      const { resolveEntityById } = await import('../services/universalIdService');
      const entity = await resolveEntityById(humanId, workspaceId);
      if (!entity) {
        return res.status(404).json({ success: false, error: `No entity found for ID: ${humanId}` });
      }
      return res.json({ success: true, data: entity });
    } catch (err: unknown) {
      log.error('[Search] resolve error:', err);
      return res.status(500).json({ success: false, error: 'Resolution failed' });
    }
  });

  app.use('/api/search', searchRouter);
}
