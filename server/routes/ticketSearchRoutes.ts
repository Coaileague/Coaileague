/**
 * TICKET SEARCH API ROUTES
 *
 * Comprehensive search endpoints for the helpdesk/support system:
 * - Search by ticket number
 * - Search by status
 * - Search by requestor
 * - Full-text search on title/description
 * - Paginated results with proper workspace scoping
 */

import { sanitizeError } from '../middleware/errorHandler';
import { Router, Response } from 'express';
import { db } from '../db';
import { supportTickets, users, employees, workspaces } from '@shared/schema';
import { eq, and, or, ilike, desc, asc, sql, inArray, isNull } from 'drizzle-orm';
import { requireAuth } from '../auth';
import {
  AuthenticatedRequest,
  requirePlatformStaff,
  attachWorkspaceId,
  hasPlatformWideAccess,
  requireManagerOrPlatformStaff
} from '../rbac';
import { z } from 'zod';
import { createLogger } from '../lib/logger';
const log = createLogger('TicketSearchRoutes');


const router = Router();

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['createdAt', 'updatedAt', 'priority', 'status', 'ticketNumber']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

const ticketSearchSchema = paginationSchema.extend({
  ticketNumber: z.string().optional(),
  status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
  statuses: z.string().optional(), // Comma-separated statuses
  requestor: z.string().optional(), // Search by requestor name/email
  query: z.string().optional(), // Full-text search on subject/description
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  type: z.enum(['report_request', 'template_request', 'support', 'other']).optional(),
  isEscalated: z.coerce.boolean().optional(),
  assignedTo: z.string().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

function buildPaginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number
): PaginatedResponse<T> {
  const totalPages = Math.ceil(total / limit);
  return {
    success: true,
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}

// =============================================================================
// SEARCH ENDPOINTS
// =============================================================================

/**
 * GET /api/tickets/search
 *
 * Comprehensive ticket search with multiple filters
 * Supports workspace scoping for regular users, platform-wide for staff
 */
router.get('/search', requireAuth, attachWorkspaceId, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    // Parse and validate query parameters
    const validatedParams = ticketSearchSchema.safeParse(req.query);
    if (!validatedParams.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid search parameters',
        details: validatedParams.error.flatten()
      });
    }

    const {
      page,
      limit,
      sortBy,
      sortOrder,
      ticketNumber,
      status,
      statuses,
      requestor,
      query,
      priority,
      type,
      isEscalated,
      assignedTo,
      dateFrom,
      dateTo,
    } = validatedParams.data;

    // Build WHERE conditions
    const conditions: any[] = [];

    // Workspace scoping - platform staff can see all, regular users see their workspace only
    const isPlatformStaffUser = hasPlatformWideAccess(req.platformRole);

    if (!isPlatformStaffUser) {
      if (!req.workspaceId) {
        return res.status(403).json({
          success: false,
          error: 'No workspace access. Please select a workspace.'
        });
      }
      conditions.push(eq(supportTickets.workspaceId, req.workspaceId));
    }

    // Filter by ticket number (exact or partial match)
    if (ticketNumber) {
      conditions.push(ilike(supportTickets.ticketNumber, `%${ticketNumber}%`));
    }

    // Filter by single status
    if (status) {
      conditions.push(eq(supportTickets.status, status));
    }

    // Filter by multiple statuses
    if (statuses) {
      const statusList = statuses.split(',').map(s => s.trim()).filter(Boolean);
      if (statusList.length > 0) {
        conditions.push(inArray(supportTickets.status, statusList));
      }
    }

    // Filter by requestor (search in requestedBy, or linked employee/client names)
    if (requestor) {
      conditions.push(
        or(
          ilike(supportTickets.requestedBy, `%${requestor}%`),
          // Also search in description which often contains "From: Name <email>"
          ilike(supportTickets.description, `%${requestor}%`)
        )
      );
    }

    // Full-text search on subject and description
    if (query) {
      conditions.push(
        or(
          ilike(supportTickets.subject, `%${query}%`),
          ilike(supportTickets.description, `%${query}%`)
        )
      );
    }

    // Filter by priority
    if (priority) {
      conditions.push(eq(supportTickets.priority, priority));
    }

    // Filter by type
    if (type) {
      conditions.push(eq(supportTickets.type, type));
    }

    // Filter by escalation status
    if (typeof isEscalated === 'boolean') {
      conditions.push(eq(supportTickets.isEscalated, isEscalated));
    }

    // Filter by assigned user
    if (assignedTo) {
      conditions.push(eq(supportTickets.assignedTo, assignedTo));
    }

    // Filter by date range
    if (dateFrom) {
      conditions.push(sql`${supportTickets.createdAt} >= ${new Date(dateFrom)}`);
    }
    if (dateTo) {
      conditions.push(sql`${supportTickets.createdAt} <= ${new Date(dateTo)}`);
    }

    // Build the WHERE clause
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(supportTickets)
      .where(whereClause);

    const total = countResult?.count || 0;

    // Calculate offset
    const offset = (page - 1) * limit;

    // Build ORDER BY clause
    const orderColumn = {
      createdAt: supportTickets.createdAt,
      updatedAt: supportTickets.updatedAt,
      priority: supportTickets.priority,
      status: supportTickets.status,
      ticketNumber: supportTickets.ticketNumber,
    }[sortBy];

    const orderFn = sortOrder === 'asc' ? asc : desc;

    // Fetch tickets with pagination
    const tickets = await db
      .select({
        id: supportTickets.id,
        ticketNumber: supportTickets.ticketNumber,
        workspaceId: supportTickets.workspaceId,
        type: supportTickets.type,
        priority: supportTickets.priority,
        subject: supportTickets.subject,
        description: supportTickets.description,
        status: supportTickets.status,
        requestedBy: supportTickets.requestedBy,
        clientId: supportTickets.clientId,
        employeeId: supportTickets.employeeId,
        assignedTo: supportTickets.assignedTo,
        isEscalated: supportTickets.isEscalated,
        escalatedAt: supportTickets.escalatedAt,
        escalatedReason: supportTickets.escalatedReason,
        platformAssignedTo: supportTickets.platformAssignedTo,
        resolution: supportTickets.resolution,
        resolvedAt: supportTickets.resolvedAt,
        createdAt: supportTickets.createdAt,
        updatedAt: supportTickets.updatedAt,
      })
      .from(supportTickets)
      .where(whereClause)
      .orderBy(orderFn(orderColumn!))
      .limit(limit)
      .offset(offset);

    return res.json(buildPaginatedResponse(tickets, total, page, limit));
  } catch (error: unknown) {
    log.error('[TicketSearch] Search error:', error);
    return res.status(500).json({
      success: false,
      error: 'Search failed',
      message: sanitizeError(error)
    });
  }
});

/**
 * GET /api/tickets/search/by-number/:ticketNumber
 *
 * Quick lookup by exact ticket number
 */
router.get('/search/by-number/:ticketNumber', requireAuth, attachWorkspaceId, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { ticketNumber } = req.params;
    if (!ticketNumber) {
      return res.status(400).json({ success: false, error: 'Ticket number required' });
    }

    // Build conditions
    const conditions: any[] = [eq(supportTickets.ticketNumber, ticketNumber)];

    // Workspace scoping for non-platform staff
    const isPlatformStaffUser = hasPlatformWideAccess(req.platformRole);
    if (!isPlatformStaffUser && req.workspaceId) {
      conditions.push(eq(supportTickets.workspaceId, req.workspaceId));
    }

    const rawTicket = await db.query.supportTickets.findFirst({
      where: and(...conditions),
    });

    let ticket: any = rawTicket;
    if (rawTicket && (rawTicket as any).workspaceId) {
      const ws = await db.query.workspaces.findFirst({ where: eq(workspaces.id, (rawTicket as any).workspaceId) });
      ticket = { ...rawTicket, workspace: ws || null };
    }

    if (!ticket) {
      return res.status(404).json({
        success: false,
        error: 'Ticket not found',
        message: `No ticket found with number: ${ticketNumber}`
      });
    }

    return res.json({ success: true, data: ticket });
  } catch (error: unknown) {
    log.error('[TicketSearch] Lookup by number error:', error);
    return res.status(500).json({
      success: false,
      error: 'Lookup failed',
      message: sanitizeError(error)
    });
  }
});

/**
 * GET /api/tickets/search/by-status/:status
 *
 * Get all tickets with a specific status (paginated)
 */
router.get('/search/by-status/:status', requireAuth, attachWorkspaceId, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { status } = req.params;
    const validStatuses = ['open', 'in_progress', 'resolved', 'closed'];

    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status',
        validStatuses
      });
    }

    // Parse pagination params
    const paginationResult = paginationSchema.safeParse(req.query);
    if (!paginationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid pagination parameters'
      });
    }

    const { page, limit, sortBy, sortOrder } = paginationResult.data;

    // Build conditions
    const conditions: any[] = [eq(supportTickets.status, status)];

    // Workspace scoping
    const isPlatformStaffUser = hasPlatformWideAccess(req.platformRole);
    if (!isPlatformStaffUser) {
      if (!req.workspaceId) {
        return res.status(403).json({
          success: false,
          error: 'No workspace access'
        });
      }
      conditions.push(eq(supportTickets.workspaceId, req.workspaceId));
    }

    const whereClause = and(...conditions);

    // Get total count
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(supportTickets)
      .where(whereClause);

    const total = countResult?.count || 0;
    const offset = (page - 1) * limit;

    // Get tickets
    const orderColumn = {
      createdAt: supportTickets.createdAt,
      updatedAt: supportTickets.updatedAt,
      priority: supportTickets.priority,
      status: supportTickets.status,
      ticketNumber: supportTickets.ticketNumber,
    }[sortBy];

    const orderFn = sortOrder === 'asc' ? asc : desc;

    const tickets = await db
      .select()
      .from(supportTickets)
      .where(whereClause)
      .orderBy(orderFn(orderColumn!))
      .limit(limit)
      .offset(offset);

    return res.json(buildPaginatedResponse(tickets, total, page, limit));
  } catch (error: unknown) {
    log.error('[TicketSearch] Search by status error:', error);
    return res.status(500).json({
      success: false,
      error: 'Search failed',
      message: sanitizeError(error)
    });
  }
});

/**
 * GET /api/tickets/search/by-requestor
 *
 * Search tickets by requestor name or email
 */
router.get('/search/by-requestor', requireAuth, attachWorkspaceId, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const requestor = req.query.requestor as string;
    if (!requestor || requestor.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Requestor search term required (min 2 characters)'
      });
    }

    // Parse pagination params
    const paginationResult = paginationSchema.safeParse(req.query);
    if (!paginationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid pagination parameters'
      });
    }

    const { page, limit, sortBy, sortOrder } = paginationResult.data;

    // Build conditions
    const conditions: any[] = [
      or(
        ilike(supportTickets.requestedBy, `%${requestor}%`),
        ilike(supportTickets.description, `%${requestor}%`)
      )
    ];

    // Workspace scoping
    const isPlatformStaffUser = hasPlatformWideAccess(req.platformRole);
    if (!isPlatformStaffUser) {
      if (!req.workspaceId) {
        return res.status(403).json({
          success: false,
          error: 'No workspace access'
        });
      }
      conditions.push(eq(supportTickets.workspaceId, req.workspaceId));
    }

    const whereClause = and(...conditions);

    // Get total count
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(supportTickets)
      .where(whereClause);

    const total = countResult?.count || 0;
    const offset = (page - 1) * limit;

    // Get tickets
    const orderColumn = {
      createdAt: supportTickets.createdAt,
      updatedAt: supportTickets.updatedAt,
      priority: supportTickets.priority,
      status: supportTickets.status,
      ticketNumber: supportTickets.ticketNumber,
    }[sortBy];

    const orderFn = sortOrder === 'asc' ? asc : desc;

    const tickets = await db
      .select()
      .from(supportTickets)
      .where(whereClause)
      .orderBy(orderFn(orderColumn!))
      .limit(limit)
      .offset(offset);

    return res.json(buildPaginatedResponse(tickets, total, page, limit));
  } catch (error: unknown) {
    log.error('[TicketSearch] Search by requestor error:', error);
    return res.status(500).json({
      success: false,
      error: 'Search failed',
      message: sanitizeError(error)
    });
  }
});

/**
 * GET /api/tickets/search/full-text
 *
 * Full-text search on ticket subject and description
 */
router.get('/search/full-text', requireAuth, attachWorkspaceId, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const query = req.query.q as string;
    if (!query || query.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Search query required (min 2 characters)'
      });
    }

    // Parse pagination params
    const paginationResult = paginationSchema.safeParse(req.query);
    if (!paginationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid pagination parameters'
      });
    }

    const { page, limit, sortBy, sortOrder } = paginationResult.data;

    // Build conditions for full-text search
    // Split query into words for better matching
    const searchTerms = query.split(/\s+/).filter(term => term.length >= 2);

    const textSearchConditions = searchTerms.map(term =>
      or(
        ilike(supportTickets.subject, `%${term}%`),
        ilike(supportTickets.description, `%${term}%`),
        ilike(supportTickets.ticketNumber, `%${term}%`)
      )
    );

    const conditions: any[] = [];

    if (textSearchConditions.length > 0) {
      // All search terms must match (AND logic)
      conditions.push(and(...textSearchConditions));
    }

    // Workspace scoping
    const isPlatformStaffUser = hasPlatformWideAccess(req.platformRole);
    if (!isPlatformStaffUser) {
      if (!req.workspaceId) {
        return res.status(403).json({
          success: false,
          error: 'No workspace access'
        });
      }
      conditions.push(eq(supportTickets.workspaceId, req.workspaceId));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(supportTickets)
      .where(whereClause);

    const total = countResult?.count || 0;
    const offset = (page - 1) * limit;

    // Get tickets
    const orderColumn = {
      createdAt: supportTickets.createdAt,
      updatedAt: supportTickets.updatedAt,
      priority: supportTickets.priority,
      status: supportTickets.status,
      ticketNumber: supportTickets.ticketNumber,
    }[sortBy];

    const orderFn = sortOrder === 'asc' ? asc : desc;

    const tickets = await db
      .select()
      .from(supportTickets)
      .where(whereClause)
      .orderBy(orderFn(orderColumn!))
      .limit(limit)
      .offset(offset);

    return res.json({
      ...buildPaginatedResponse(tickets, total, page, limit),
      searchTerms,
      query,
    });
  } catch (error: unknown) {
    log.error('[TicketSearch] Full-text search error:', error);
    return res.status(500).json({
      success: false,
      error: 'Search failed',
      message: sanitizeError(error)
    });
  }
});

/**
 * GET /api/tickets/search/my-tickets
 *
 * Get tickets created by or assigned to the current user
 */
router.get('/search/my-tickets', requireAuth, attachWorkspaceId, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    // Parse pagination params
    const paginationResult = paginationSchema.safeParse(req.query);
    if (!paginationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid pagination parameters'
      });
    }

    const { page, limit, sortBy, sortOrder } = paginationResult.data;
    const includeAssigned = req.query.includeAssigned === 'true';
    const onlyAssigned = req.query.onlyAssigned === 'true';

    // Build conditions
    let userCondition;

    if (onlyAssigned) {
      // Only show tickets assigned to user
      userCondition = or(
        eq(supportTickets.assignedTo, userId),
        eq(supportTickets.platformAssignedTo, userId)
      );
    } else if (includeAssigned) {
      // Show tickets created by OR assigned to user
      userCondition = or(
        // @ts-expect-error — TS migration: fix in refactoring sprint
        eq(supportTickets.reportedBy, userId),
        eq(supportTickets.assignedTo, userId),
        eq(supportTickets.platformAssignedTo, userId)
      );
    } else {
      // Default: only tickets created by user
      // @ts-expect-error — TS migration: fix in refactoring sprint
      userCondition = eq(supportTickets.reportedBy, userId);
    }

    const conditions: any[] = [userCondition];

    // Optional status filter
    const status = req.query.status as string;
    if (status && ['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
      conditions.push(eq(supportTickets.status, status));
    }

    const whereClause = and(...conditions);

    // Get total count
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(supportTickets)
      .where(whereClause);

    const total = countResult?.count || 0;
    const offset = (page - 1) * limit;

    // Get tickets
    const orderColumn = {
      createdAt: supportTickets.createdAt,
      updatedAt: supportTickets.updatedAt,
      priority: supportTickets.priority,
      status: supportTickets.status,
      ticketNumber: supportTickets.ticketNumber,
    }[sortBy];

    const orderFn = sortOrder === 'asc' ? asc : desc;

    const tickets = await db
      .select()
      .from(supportTickets)
      .where(whereClause)
      .orderBy(orderFn(orderColumn!))
      .limit(limit)
      .offset(offset);

    return res.json(buildPaginatedResponse(tickets, total, page, limit));
  } catch (error: unknown) {
    log.error('[TicketSearch] My tickets error:', error);
    return res.status(500).json({
      success: false,
      error: 'Search failed',
      message: sanitizeError(error)
    });
  }
});

/**
 * GET /api/tickets/search/stats
 *
 * Get ticket statistics for the workspace
 */
router.get('/search/stats', requireAuth, attachWorkspaceId, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    // Workspace scoping
    const isPlatformStaffUser = hasPlatformWideAccess(req.platformRole);
    const workspaceCondition = !isPlatformStaffUser && req.workspaceId
      ? eq(supportTickets.workspaceId, req.workspaceId)
      : undefined;

    // Get counts by status
    const statusCounts = await db
      .select({
        status: supportTickets.status,
        count: sql<number>`count(*)::int`,
      })
      .from(supportTickets)
      .where(workspaceCondition)
      .groupBy(supportTickets.status);

    // Get counts by priority
    const priorityCounts = await db
      .select({
        priority: supportTickets.priority,
        count: sql<number>`count(*)::int`,
      })
      .from(supportTickets)
      .where(workspaceCondition)
      .groupBy(supportTickets.priority);

    // Get escalated count
    const [escalatedCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(supportTickets)
      .where(
        workspaceCondition
          ? and(workspaceCondition, eq(supportTickets.isEscalated, true))
          : eq(supportTickets.isEscalated, true)
      );

    // Get unassigned count
    const [unassignedCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(supportTickets)
      .where(
        workspaceCondition
          ? and(
              workspaceCondition,
              isNull(supportTickets.assignedTo),
              inArray(supportTickets.status, ['open', 'in_progress'])
            )
          : and(
              isNull(supportTickets.assignedTo),
              inArray(supportTickets.status, ['open', 'in_progress'])
            )
      );

    // Get recent tickets (last 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [recentCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(supportTickets)
      .where(
        workspaceCondition
          ? and(workspaceCondition, sql`${supportTickets.createdAt} >= ${oneDayAgo}`)
          : sql`${supportTickets.createdAt} >= ${oneDayAgo}`
      );

    // Build stats object
    const stats = {
      byStatus: Object.fromEntries(statusCounts.map(s => [s.status || 'unknown', s.count])),
      byPriority: Object.fromEntries(priorityCounts.map(p => [p.priority || 'unknown', p.count])),
      escalated: escalatedCount?.count || 0,
      unassigned: unassignedCount?.count || 0,
      recentLast24Hours: recentCount?.count || 0,
      total: statusCounts.reduce((sum, s) => sum + s.count, 0),
    };

    return res.json({ success: true, stats });
  } catch (error: unknown) {
    log.error('[TicketSearch] Stats error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get stats',
      message: sanitizeError(error)
    });
  }
});

/**
 * GET /api/tickets/search/suggestions
 *
 * Get autocomplete suggestions for ticket search
 */
router.get('/search/suggestions', requireAuth, attachWorkspaceId, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const query = (req.query.q as string) || '';
    if (query.length < 1) {
      return res.json({ success: true, suggestions: [] });
    }

    // Workspace scoping
    const isPlatformStaffUser = hasPlatformWideAccess(req.platformRole);
    const workspaceCondition = !isPlatformStaffUser && req.workspaceId
      ? eq(supportTickets.workspaceId, req.workspaceId)
      : undefined;

    // Get matching ticket numbers
    const ticketNumbers = await db
      .selectDistinct({ ticketNumber: supportTickets.ticketNumber })
      .from(supportTickets)
      .where(
        workspaceCondition
          ? and(workspaceCondition, ilike(supportTickets.ticketNumber, `%${query}%`))
          : ilike(supportTickets.ticketNumber, `%${query}%`)
      )
      .limit(5);

    // Get matching subjects
    const subjects = await db
      .selectDistinct({ subject: supportTickets.subject })
      .from(supportTickets)
      .where(
        workspaceCondition
          ? and(workspaceCondition, ilike(supportTickets.subject, `%${query}%`))
          : ilike(supportTickets.subject, `%${query}%`)
      )
      .limit(5);

    const suggestions = [
      ...ticketNumbers.map(t => ({ type: 'ticketNumber', value: t.ticketNumber })),
      ...subjects.map(s => ({ type: 'subject', value: s.subject })),
    ];

    return res.json({ success: true, suggestions, query });
  } catch (error: unknown) {
    log.error('[TicketSearch] Suggestions error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get suggestions',
      message: sanitizeError(error)
    });
  }
});

// =============================================================================
// PLATFORM STAFF ONLY ENDPOINTS
// =============================================================================

/**
 * GET /api/tickets/search/all
 *
 * Platform staff only: search across all workspaces
 */
router.get('/search/all', requirePlatformStaff, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Parse and validate query parameters
    const validatedParams = ticketSearchSchema.safeParse(req.query);
    if (!validatedParams.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid search parameters',
        details: validatedParams.error.flatten()
      });
    }

    const {
      page,
      limit,
      sortBy,
      sortOrder,
      ticketNumber,
      status,
      statuses,
      requestor,
      query,
      priority,
      type,
      isEscalated,
      assignedTo,
      dateFrom,
      dateTo,
    } = validatedParams.data;

    // Build WHERE conditions (no workspace filter for platform staff)
    const conditions: any[] = [];

    if (ticketNumber) {
      conditions.push(ilike(supportTickets.ticketNumber, `%${ticketNumber}%`));
    }

    if (status) {
      conditions.push(eq(supportTickets.status, status));
    }

    if (statuses) {
      const statusList = statuses.split(',').map(s => s.trim()).filter(Boolean);
      if (statusList.length > 0) {
        conditions.push(inArray(supportTickets.status, statusList));
      }
    }

    if (requestor) {
      conditions.push(
        or(
          ilike(supportTickets.requestedBy, `%${requestor}%`),
          ilike(supportTickets.description, `%${requestor}%`)
        )
      );
    }

    if (query) {
      conditions.push(
        or(
          ilike(supportTickets.subject, `%${query}%`),
          ilike(supportTickets.description, `%${query}%`)
        )
      );
    }

    if (priority) {
      conditions.push(eq(supportTickets.priority, priority));
    }

    if (type) {
      conditions.push(eq(supportTickets.type, type));
    }

    if (typeof isEscalated === 'boolean') {
      conditions.push(eq(supportTickets.isEscalated, isEscalated));
    }

    if (assignedTo) {
      conditions.push(eq(supportTickets.assignedTo, assignedTo));
    }

    if (dateFrom) {
      conditions.push(sql`${supportTickets.createdAt} >= ${new Date(dateFrom)}`);
    }
    if (dateTo) {
      conditions.push(sql`${supportTickets.createdAt} <= ${new Date(dateTo)}`);
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(supportTickets)
      .where(whereClause);

    const total = countResult?.count || 0;
    const offset = (page - 1) * limit;

    const orderColumn = {
      createdAt: supportTickets.createdAt,
      updatedAt: supportTickets.updatedAt,
      priority: supportTickets.priority,
      status: supportTickets.status,
      ticketNumber: supportTickets.ticketNumber,
    }[sortBy];

    const orderFn = sortOrder === 'asc' ? asc : desc;

    // Fetch tickets with workspace info
    const tickets = await db
      .select({
        id: supportTickets.id,
        ticketNumber: supportTickets.ticketNumber,
        workspaceId: supportTickets.workspaceId,
        type: supportTickets.type,
        priority: supportTickets.priority,
        subject: supportTickets.subject,
        description: supportTickets.description,
        status: supportTickets.status,
        requestedBy: supportTickets.requestedBy,
        assignedTo: supportTickets.assignedTo,
        isEscalated: supportTickets.isEscalated,
        escalatedAt: supportTickets.escalatedAt,
        platformAssignedTo: supportTickets.platformAssignedTo,
        resolution: supportTickets.resolution,
        resolvedAt: supportTickets.resolvedAt,
        createdAt: supportTickets.createdAt,
        updatedAt: supportTickets.updatedAt,
        workspaceName: workspaces.name,
      })
      .from(supportTickets)
      .leftJoin(workspaces, eq(supportTickets.workspaceId, workspaces.id))
      .where(whereClause)
      .orderBy(orderFn(orderColumn!))
      .limit(limit)
      .offset(offset);

    return res.json(buildPaginatedResponse(tickets, total, page, limit));
  } catch (error: unknown) {
    log.error('[TicketSearch] Platform search error:', error);
    return res.status(500).json({
      success: false,
      error: 'Search failed',
      message: sanitizeError(error)
    });
  }
});

export const ticketSearchRouter = router;
