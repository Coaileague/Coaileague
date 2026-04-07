import fs from 'fs';

function extractLineRange(source, startLine, endLine) {
  return source.split('\n').slice(startLine - 1, endLine).join('\n');
}

const hrSource = fs.readFileSync('server/routes/hrInlineRoutes.ts', 'utf8');
const govSource = fs.readFileSync('server/routes/governanceInlineRoutes.ts', 'utf8');
const contentSource = fs.readFileSync('server/routes/contentInlineRoutes.ts', 'utf8');

// === 1. terminationRoutes.ts ===
const terminationRoutes = `import { Router } from "express";
import { isAuthenticated } from "../replitAuth";
import { storage } from "../storage";

const router = Router();

${extractLineRange(hrSource, 38, 129)}

export default router;
`;
fs.writeFileSync('server/routes/terminationRoutes.ts', terminationRoutes);
console.log('Created terminationRoutes.ts');

// === 2. leaderRoutes.ts ===
const leaderRoutes = `import { Router } from "express";
import { isAuthenticated } from "../replitAuth";
import { requireLeader, getUserPlatformRole, type AuthenticatedRequest } from "../rbac";
import { storage } from "../storage";
import { db } from "../db";
import {
  ptoRequests,
  leaderActions,
  escalationTickets,
  timeEntryDiscrepancies,
  disputes,
  platformRoles,
  users,
} from "@shared/schema";
import { sql, eq, and, or, isNull, desc, gte, inArray } from "drizzle-orm";
import crypto from "crypto";
import { emailService } from "../services/emailService";

const router = Router();

${extractLineRange(hrSource, 131, 695)}

export default router;
`;
fs.writeFileSync('server/routes/leaderRoutes.ts', leaderRoutes);
console.log('Created leaderRoutes.ts');

// === 3. policyComplianceRoutes.ts ===
const policyComplianceRoutes = `import { Router } from "express";
import { requireAuth } from "../auth";
import { isAuthenticated } from "../replitAuth";
import { requireManager, type AuthenticatedRequest } from "../rbac";
import { storage } from "../storage";
import { db } from "../db";
import { timeEntryDiscrepancies, stagedShifts } from "@shared/schema";
import { sql, eq, and, desc } from "drizzle-orm";

const router = Router();

${extractLineRange(govSource, 22, 308)}

export default router;
`;
fs.writeFileSync('server/routes/policyComplianceRoutes.ts', policyComplianceRoutes);
console.log('Created policyComplianceRoutes.ts');

// === 4. auditRoutes.ts ===
const auditRoutes = `import { Router } from "express";
import { requireAuth } from "../auth";
import { requireOwner, type AuthenticatedRequest } from "../rbac";
import { storage } from "../storage";
import { db } from "../db";
import { sql, eq, and, desc } from "drizzle-orm";

const router = Router();

${extractLineRange(govSource, 397, 603)}

${extractLineRange(govSource, 727, 969)}

export default router;
`;
fs.writeFileSync('server/routes/auditRoutes.ts', auditRoutes);
console.log('Created auditRoutes.ts');

// === 5. formRoutes.ts ===
// Need schemas (lines 399-429) and helper function (lines 567-576, 675-682) plus routes
const formRoutes = `import { Router } from "express";
import { requireAuth } from "../auth";
import { requireManager, requirePlatformStaff, type AuthenticatedRequest } from "../rbac";
import { mutationLimiter } from "../middleware/rateLimiter";
import { storage } from "../storage";
import { z } from "zod";

const router = Router();

${extractLineRange(contentSource, 399, 429)}

${extractLineRange(contentSource, 431, 565)}

${extractLineRange(contentSource, 567, 846)}

export default router;
`;
fs.writeFileSync('server/routes/formRoutes.ts', formRoutes);
console.log('Created formRoutes.ts');

// === 6. reviewRoutes.ts additions ===
// Need to append report-templates and report-submissions to existing reviewRoutes.ts
const reviewAdditions = `
// === Report Templates ===
${extractLineRange(contentSource, 26, 80)}

// === Report Submissions ===
${extractLineRange(contentSource, 82, 262)}
`;

const existingReview = fs.readFileSync('server/routes/reviewRoutes.ts', 'utf8');
const updatedReview = existingReview.replace(
  'export default router;',
  reviewAdditions + '\nexport default router;\n'
);
fs.writeFileSync('server/routes/reviewRoutes.ts', updatedReview);
console.log('Updated reviewRoutes.ts with report-templates and report-submissions');

// === 7. Add remaining misc routes to miscRoutes.ts ===
// From contentInlineRoutes.ts: customer-reports, client-reports, locked-reports, report-analytics, contract-documents, custom-rules, signatures
// From governanceInlineRoutes.ts: audit-trail, audit-logs, safety-checks, security-compliance, dar
// From hrInlineRoutes.ts: i9-records, manager-assignments, organizations, employee, employee-reputation, invites, hr/pto-*, hr/review-reminders/*, organization-onboarding, experience

const miscAdditions = `
// === From governanceInlineRoutes.ts ===
${extractLineRange(govSource, 310, 395)}

${extractLineRange(govSource, 605, 725)}

// === From contentInlineRoutes.ts ===
${extractLineRange(contentSource, 264, 397)}

${extractLineRange(contentSource, 848, 1182)}

// === From hrInlineRoutes.ts ===
${extractLineRange(hrSource, 697, 747)}

${extractLineRange(hrSource, 749, 830)}

${extractLineRange(hrSource, 832, 1096)}

${extractLineRange(hrSource, 1098, 1341)}
`;

const existingMisc = fs.readFileSync('server/routes/miscRoutes.ts', 'utf8');
// Check what imports are needed - we'll add them at the top
const miscImportAdditions = `
import { auditEvents, auditTrail, timeEntryDiscrepancies as timeEntryDiscrepanciesMisc, autoReports, employeeComplianceRecords, customRules, ruleExecutionLogs, reportAttachments, documentSignatures, insertManagerAssignmentSchema, reportTemplates, reportSubmissions, clients, timeEntries as timeEntriesTable, shifts, employerRatings, employees as employeesMisc, workspaces as workspacesMisc, users as usersMisc, workspaceInvites } from "@shared/schema";
import { shiftChatroomWorkflowService } from "../services/shiftChatroomWorkflowService";
import { ObjectStorageService, objectStorageClient } from "../objectStorage";
import { randomUUID } from "crypto";
import { emailService as emailServiceMisc } from "../services/emailService";
import { getAllPtoBalances, calculatePtoAccrual, runWeeklyPtoAccrual } from "../services/ptoAccrual";
import { getReviewReminderSummary, getOverdueReviews, getUpcomingReviews } from "../services/performanceReviewReminders";
import { sendReportDeliveryEmail } from "../email";
`;

// This is complex - too many imports would conflict. Better to just leave the routes in the source files
// and only create the 5 missing files plus reviewRoutes additions.
// The remaining routes in hrInlineRoutes, governanceInlineRoutes, contentInlineRoutes stay there.

console.log('\n=== Summary ===');
console.log('Created: terminationRoutes.ts, leaderRoutes.ts, policyComplianceRoutes.ts, auditRoutes.ts, formRoutes.ts');
console.log('Updated: reviewRoutes.ts');
console.log('Note: Remaining misc routes stay in hrInlineRoutes.ts, governanceInlineRoutes.ts, contentInlineRoutes.ts');
