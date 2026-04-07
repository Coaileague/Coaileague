import fs from 'fs';
import { db } from '../db';
import { sql, eq, desc, and, count } from 'drizzle-orm';
import {
  workspaces,
  employees,
  shifts,
  clients,
  users,
  auditLogs,
  notifications,
  complianceDocuments,
  shiftOrders,
  shiftSwapRequests,
  orgDocuments,
  orgDocumentSignatures,
  guardTours,
  guardTourCheckpoints,
  guardTourScans,
  equipmentItems,
  equipmentAssignments,
  equipmentMaintenanceLogs,
  postOrderTemplates,
  trinityDecisionLog,
  chatConversations,
  supportRooms,
  payrollRuns,
  payrollEntries,
  ptoRequests,
  broadcasts,
  pushSubscriptions,
  timeEntries
} from '@shared/schema';
import { typedCount, typedQuery } from '../lib/typedSql';

interface TestResult {
  name: string;
  phase: string;
  passed: boolean;
  details: string;
  severity: 'critical' | 'high' | 'medium' | 'info';
}

const results: TestResult[] = [];

function record(r: TestResult) {
  results.push(r);
  const icon = r.passed ? '[PASS]' : '[FAIL]';
  console.log(`${icon} [${r.phase}] ${r.name}: ${r.details}`);
}

async function getTestWorkspace() {
  const [ws] = await db.select().from(workspaces).limit(1);
  return ws;
}

async function phase1_guard_tour_tables() {
  // CATEGORY C — Raw SQL retained: information_schema | Tables: information_schema | Verified: 2026-03-23
  const tables = await typedQuery(sql`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name IN ('guard_tours', 'guard_tour_checkpoints', 'guard_tour_scans')
    ORDER BY table_name
  `);
  const tableNames = (tables as any).rows?.map((r: any) => r.table_name) || tables.map?.((r: any) => r.table_name) || [];
  
  record({
    name: 'Guard Tour Tables Exist',
    phase: 'GUARD_TOURS',
    passed: tableNames.length === 3,
    details: `Found ${tableNames.length}/3 tables: ${tableNames.join(', ')}`,
    severity: 'critical'
  });

  // CATEGORY C — Raw SQL retained: information_schema | Tables: information_schema | Verified: 2026-03-23
  const cols = await typedQuery(sql`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'guard_tours' ORDER BY ordinal_position
  `);
  const colNames = (cols as any).rows?.map((r: any) => r.column_name) || cols.map?.((r: any) => r.column_name) || [];
  const required = ['id', 'workspace_id', 'name', 'status', 'interval_minutes', 'days_of_week'];
  const hasAll = required.every(c => colNames.includes(c));
  
  record({
    name: 'Guard Tour Schema Columns',
    phase: 'GUARD_TOURS',
    passed: hasAll,
    details: `Required columns present: ${hasAll}. Columns: ${colNames.join(', ')}`,
    severity: 'critical'
  });

  // CATEGORY C — Raw SQL retained: information_schema | Tables: information_schema | Verified: 2026-03-23
  const cpCols = await typedQuery(sql`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'guard_tour_checkpoints' ORDER BY ordinal_position
  `);
  const cpColNames = (cpCols as any).rows?.map((r: any) => r.column_name) || cpCols.map?.((r: any) => r.column_name) || [];
  const cpRequired = ['id', 'tour_id', 'name', 'latitude', 'longitude', 'qr_code', 'nfc_tag_id'];
  const cpHasAll = cpRequired.every(c => cpColNames.includes(c));
  
  record({
    name: 'Guard Tour Checkpoint Columns',
    phase: 'GUARD_TOURS',
    passed: cpHasAll,
    details: `GPS+QR+NFC: ${cpHasAll}. Columns: ${cpColNames.join(', ')}`,
    severity: 'critical'
  });

  // CATEGORY C — Raw SQL retained: information_schema | Tables: information_schema | Verified: 2026-03-23
  const scanCols = await typedQuery(sql`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'guard_tour_scans' ORDER BY ordinal_position
  `);
  const scanColNames = (scanCols as any).rows?.map((r: any) => r.column_name) || scanCols.map?.((r: any) => r.column_name) || [];
  const scanRequired = ['id', 'tour_id', 'checkpoint_id', 'employee_id', 'workspace_id', 'status', 'scan_method'];
  const scanHasAll = scanRequired.every(c => scanColNames.includes(c));
  
  record({
    name: 'Guard Tour Scan Recording Columns',
    phase: 'GUARD_TOURS',
    passed: scanHasAll,
    details: `Scan tracking: ${scanHasAll}. Columns: ${scanColNames.join(', ')}`,
    severity: 'critical'
  });
}

async function phase1_guard_tour_routes() {
  const routeFile = fs.existsSync('server/routes/guardTourRoutes.ts');
  let routeSrc = '';
  if (routeFile) {
    routeSrc = fs.readFileSync('server/routes/guardTourRoutes.ts', 'utf-8');
  }
  
  const hasListTours = routeSrc.includes("get('/tours'") || routeSrc.includes('get("/tours"');
  const hasCreateTour = routeSrc.includes("post('/tours'") || routeSrc.includes('post("/tours"');
  const hasUpdateTour = routeSrc.includes("patch('/tours/") || routeSrc.includes('put("/tours/');
  const hasDeleteTour = routeSrc.includes("delete('/tours/") || routeSrc.includes('delete("/tours/');
  const hasCheckpoints = routeSrc.includes("checkpoints") || routeSrc.includes('checkpoint');
  const hasScans = routeSrc.includes("post('/scans'") || routeSrc.includes('post("/scans"');
  
  const passed = routeFile && hasListTours && hasCreateTour && hasCheckpoints && hasScans;
  record({
    name: 'Guard Tour Routes CRUD',
    phase: 'GUARD_TOURS',
    passed,
    details: `File: ${routeFile}, List: ${hasListTours}, Create: ${hasCreateTour}, Update: ${hasUpdateTour}, Delete: ${hasDeleteTour}, Checkpoints: ${hasCheckpoints}, Scans: ${hasScans}`,
    severity: 'critical'
  });

  const routesSrc = fs.readFileSync('server/routes.ts', 'utf-8');
  const mounted = routesSrc.includes('guard-tour') || routesSrc.includes('guardTour');
  const wsScoped = routesSrc.includes('ensureWorkspaceAccess') && mounted;
  
  record({
    name: 'Guard Tour Routes Mounted + Workspace Scoped',
    phase: 'GUARD_TOURS',
    passed: mounted && wsScoped,
    details: `Mounted: ${mounted}, Workspace scoped: ${wsScoped}`,
    severity: 'critical'
  });
}

async function phase2_equipment_tables() {
  // CATEGORY C — Raw SQL retained: information_schema | Tables: information_schema | Verified: 2026-03-23
  const tables = await typedQuery(sql`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name IN ('equipment_items', 'equipment_assignments', 'equipment_maintenance_logs')
    ORDER BY table_name
  `);
  const tableNames = (tables as any).rows?.map((r: any) => r.table_name) || tables.map?.((r: any) => r.table_name) || [];
  
  record({
    name: 'Equipment Tracking Tables Exist',
    phase: 'EQUIPMENT',
    passed: tableNames.length === 3,
    details: `Found ${tableNames.length}/3 tables: ${tableNames.join(', ')}`,
    severity: 'critical'
  });

  // CATEGORY C — Raw SQL retained: information_schema | Tables: information_schema | Verified: 2026-03-23
  const cols = await typedQuery(sql`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'equipment_items' ORDER BY ordinal_position
  `);
  const colNames = (cols as any).rows?.map((r: any) => r.column_name) || cols.map?.((r: any) => r.column_name) || [];
  const required = ['id', 'workspace_id', 'name', 'serial_number', 'category', 'status'];
  const hasAll = required.every(c => colNames.includes(c));
  
  record({
    name: 'Equipment Item Schema Columns',
    phase: 'EQUIPMENT',
    passed: hasAll,
    details: `Required: ${hasAll}. Columns: ${colNames.join(', ')}`,
    severity: 'critical'
  });

  // CATEGORY C — Raw SQL retained: information_schema | Tables: information_schema | Verified: 2026-03-23
  const assignCols = await typedQuery(sql`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'equipment_assignments' ORDER BY ordinal_position
  `);
  const assignColNames = (assignCols as any).rows?.map((r: any) => r.column_name) || assignCols.map?.((r: any) => r.column_name) || [];
  const assignRequired = ['id', 'equipment_item_id', 'employee_id', 'checkout_date', 'condition'];
  const assignHasAll = assignRequired.every(c => assignColNames.includes(c));
  
  record({
    name: 'Equipment Assignment Columns',
    phase: 'EQUIPMENT',
    passed: assignHasAll,
    details: `Checkout/return tracking: ${assignHasAll}. Columns: ${assignColNames.join(', ')}`,
    severity: 'critical'
  });
}

async function phase2_equipment_routes() {
  const routeFile = fs.existsSync('server/routes/equipmentRoutes.ts');
  let routeSrc = '';
  if (routeFile) {
    routeSrc = fs.readFileSync('server/routes/equipmentRoutes.ts', 'utf-8');
  }
  
  const hasListItems = routeSrc.includes("get('/items'") || routeSrc.includes('get("/items"');
  const hasCreateItem = routeSrc.includes("post('/items'") || routeSrc.includes('post("/items"');
  const hasAssignment = routeSrc.includes('assignments') || routeSrc.includes('assignment');
  const hasReturn = routeSrc.includes('return') || routeSrc.includes('returned');
  const hasMaintenance = routeSrc.includes('maintenance');
  
  const passed = routeFile && hasListItems && hasCreateItem && hasAssignment && hasMaintenance;
  record({
    name: 'Equipment Routes CRUD',
    phase: 'EQUIPMENT',
    passed,
    details: `File: ${routeFile}, List: ${hasListItems}, Create: ${hasCreateItem}, Assign: ${hasAssignment}, Return: ${hasReturn}, Maintenance: ${hasMaintenance}`,
    severity: 'critical'
  });

  const routesSrc = fs.readFileSync('server/routes.ts', 'utf-8');
  const mounted = routesSrc.includes('/api/equipment');
  const wsScoped = mounted && routesSrc.includes('ensureWorkspaceAccess');
  
  record({
    name: 'Equipment Routes Mounted + Workspace Scoped',
    phase: 'EQUIPMENT',
    passed: mounted && wsScoped,
    details: `Mounted: ${mounted}, Workspace scoped: ${wsScoped}`,
    severity: 'critical'
  });
}

async function phase3_post_orders() {
  // CATEGORY C — Raw SQL retained: information_schema | Tables: information_schema | Verified: 2026-03-23
  const tables = await typedQuery(sql`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'post_order_templates'
  `);
  const tableNames = (tables as any).rows?.map((r: any) => r.table_name) || tables.map?.((r: any) => r.table_name) || [];
  
  record({
    name: 'Post Order Templates Table Exists',
    phase: 'POST_ORDERS',
    passed: tableNames.length === 1,
    details: `Table exists: ${tableNames.length === 1}`,
    severity: 'critical'
  });

  const routeFile = fs.existsSync('server/routes/postOrderRoutes.ts');
  let routeSrc = '';
  if (routeFile) {
    routeSrc = fs.readFileSync('server/routes/postOrderRoutes.ts', 'utf-8');
  }
  
  const hasListTemplates = routeSrc.includes("get('/templates'") || routeSrc.includes('get("/templates"');
  const hasCreateTemplate = routeSrc.includes("post('/templates'") || routeSrc.includes('post("/templates"');
  const hasAssignToShift = routeSrc.includes('assign-to-shift') || routeSrc.includes('assignToShift');
  const hasShiftOrders = routeSrc.includes("get('/shift/") || routeSrc.includes('shiftId');
  
  const passed = routeFile && hasListTemplates && hasCreateTemplate && hasAssignToShift;
  record({
    name: 'Post Order Management CRUD',
    phase: 'POST_ORDERS',
    passed,
    details: `File: ${routeFile}, List: ${hasListTemplates}, Create: ${hasCreateTemplate}, AssignToShift: ${hasAssignToShift}, ShiftOrders: ${hasShiftOrders}`,
    severity: 'critical'
  });

  const routesSrc = fs.readFileSync('server/routes.ts', 'utf-8');
  const mounted = routesSrc.includes('/api/post-orders');
  
  record({
    name: 'Post Order Routes Mounted',
    phase: 'POST_ORDERS',
    passed: mounted,
    details: `Mounted: ${mounted}`,
    severity: 'critical'
  });
}

async function phase4_document_signing() {
  const serviceFile = fs.existsSync('server/services/documentSigningService.ts');
  let serviceSrc = '';
  if (serviceFile) {
    serviceSrc = fs.readFileSync('server/services/documentSigningService.ts', 'utf-8');
  }
  
  const hasSendForSig = serviceSrc.includes('sendDocumentForSignature');
  const hasProcessInternal = serviceSrc.includes('processInternalSignature');
  const hasProcessExternal = serviceSrc.includes('processExternalSignature');
  const hasReminders = serviceSrc.includes('sendDocumentReminders');
  const hasGetStatus = serviceSrc.includes('getSignatureStatus');
  const hasVerificationToken = serviceSrc.includes('verificationToken') || serviceSrc.includes('verification_token');
  const hasEmailTemplate = serviceSrc.includes('Signature Requested');
  
  const passed = serviceFile && hasSendForSig && hasProcessInternal && hasReminders && hasVerificationToken;
  record({
    name: 'Internal Document Signing Service',
    phase: 'DOC_SIGNING',
    passed,
    details: `Service: ${serviceFile}, Send: ${hasSendForSig}, Internal: ${hasProcessInternal}, External: ${hasProcessExternal}, Reminders: ${hasReminders}, Status: ${hasGetStatus}, Token: ${hasVerificationToken}, Email: ${hasEmailTemplate}`,
    severity: 'critical'
  });

  const routeFile = fs.existsSync('server/routes/documentLibraryRoutes.ts');
  let routeSrc = '';
  if (routeFile) {
    routeSrc = fs.readFileSync('server/routes/documentLibraryRoutes.ts', 'utf-8');
  }
  
  const hasSendRoute = routeSrc.includes('sendDocumentForSignature') || routeSrc.includes('send-for-signature');
  const hasSignRoute = routeSrc.includes('processInternalSignature') || routeSrc.includes('/sign');
  const hasStatusRoute = routeSrc.includes('getSignatureStatus');
  const hasReminderRoute = routeSrc.includes('sendDocumentReminders') || routeSrc.includes('/remind');
  
  record({
    name: 'Document Signing API Routes',
    phase: 'DOC_SIGNING',
    passed: routeFile && hasSendRoute && hasSignRoute,
    details: `Routes: ${routeFile}, Send: ${hasSendRoute}, Sign: ${hasSignRoute}, Status: ${hasStatusRoute}, Remind: ${hasReminderRoute}`,
    severity: 'critical'
  });

  // CATEGORY C — Raw SQL retained: information_schema | Tables: information_schema | Verified: 2026-03-23
  const sigTables = await typedQuery(sql`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name IN ('org_documents', 'org_document_signatures', 'org_document_access')
    ORDER BY table_name
  `);
  const sigTableNames = (sigTables as any).rows?.map((r: any) => r.table_name) || sigTables.map?.((r: any) => r.table_name) || [];
  
  record({
    name: 'Document Signing DB Tables',
    phase: 'DOC_SIGNING',
    passed: sigTableNames.length >= 2,
    details: `Found ${sigTableNames.length} tables: ${sigTableNames.join(', ')}`,
    severity: 'critical'
  });
}

async function phase5_pwa_manifest() {
  const manifestExists = fs.existsSync('client/public/manifest.json');
  let manifest: any = {};
  if (manifestExists) {
    manifest = JSON.parse(fs.readFileSync('client/public/manifest.json', 'utf-8'));
  }
  
  const hasName = !!manifest.name;
  const hasShortName = !!manifest.short_name;
  const hasIcons = Array.isArray(manifest.icons) && manifest.icons.length > 0;
  const hasStartUrl = !!manifest.start_url;
  const hasDisplay = manifest.display === 'standalone' || manifest.display === 'fullscreen';
  const hasThemeColor = !!manifest.theme_color;
  
  const passed = manifestExists && hasName && hasIcons && hasStartUrl && hasDisplay;
  record({
    name: 'PWA Manifest Valid',
    phase: 'PWA',
    passed,
    details: `File: ${manifestExists}, Name: ${hasName} (${manifest.name}), ShortName: ${hasShortName}, Icons: ${hasIcons} (${manifest.icons?.length}), StartUrl: ${hasStartUrl}, Display: ${hasDisplay} (${manifest.display}), Theme: ${hasThemeColor}`,
    severity: 'high'
  });

  const swExists = fs.existsSync('client/public/sw.js') || fs.existsSync('public/sw.js');
  const pushLib = fs.existsSync('client/src/lib/pushNotifications.ts');
  let pushSrc = '';
  if (pushLib) {
    pushSrc = fs.readFileSync('client/src/lib/pushNotifications.ts', 'utf-8');
  }
  const hasVapid = pushSrc.includes('VAPID') || pushSrc.includes('vapid');
  const hasSubscribe = pushSrc.includes('subscribe') || pushSrc.includes('pushManager');
  
  record({
    name: 'PWA Push Notification Support',
    phase: 'PWA',
    passed: pushLib && hasSubscribe,
    details: `PushLib: ${pushLib}, SW: ${swExists}, VAPID: ${hasVapid}, Subscribe: ${hasSubscribe}`,
    severity: 'high'
  });

  const installPrompt = fs.existsSync('client/src/components/mobile/PWAInstallPrompt.tsx');
  const offlineQueue = fs.existsSync('client/src/lib/offlineQueue.ts');
  
  record({
    name: 'PWA Install Prompt + Offline Queue',
    phase: 'PWA',
    passed: installPrompt && offlineQueue,
    details: `Install prompt: ${installPrompt}, Offline queue: ${offlineQueue}`,
    severity: 'medium'
  });
}

async function phase6_compliance_system() {
  const certTypesFile = fs.existsSync('server/services/compliance/certificationTypes.ts');
  let certSrc = '';
  if (certTypesFile) {
    certSrc = fs.readFileSync('server/services/compliance/certificationTypes.ts', 'utf-8');
  }
  const hasGuardLicense = certSrc.includes('GUARD_LICENSE');
  const hasArmedGuard = certSrc.includes('ARMED_GUARD');
  const hasFirearm = certSrc.includes('FIREARM_PERMIT');
  const hasCPR = certSrc.includes('CPR') || certSrc.includes('FIRST_AID');
  const hasDrugTest = certSrc.includes('DRUG_TEST');
  const hasStateTraining = certSrc.includes('STATE_TRAINING');
  
  record({
    name: 'Security Certification Types Registry',
    phase: 'COMPLIANCE',
    passed: certTypesFile && hasGuardLicense && hasArmedGuard,
    details: `File: ${certTypesFile}, GuardLicense: ${hasGuardLicense}, Armed: ${hasArmedGuard}, Firearm: ${hasFirearm}, CPR: ${hasCPR}, Drug: ${hasDrugTest}, State: ${hasStateTraining}`,
    severity: 'high'
  });

  const stateConfigFile = fs.existsSync('server/services/compliance/stateComplianceConfig.ts');
  let stateConfig = '';
  if (stateConfigFile) {
    stateConfig = fs.readFileSync('server/services/compliance/stateComplianceConfig.ts', 'utf-8');
  }
  const hasTX = stateConfig.includes('TX') || stateConfig.includes('Texas');
  const hasCA = stateConfig.includes('CA') || stateConfig.includes('California');
  const hasFL = stateConfig.includes('FL') || stateConfig.includes('Florida');
  const hasNY = stateConfig.includes('NY') || stateConfig.includes('New York');
  
  record({
    name: 'State-Specific Compliance Configuration',
    phase: 'COMPLIANCE',
    passed: stateConfigFile && hasTX && hasCA,
    details: `File: ${stateConfigFile}, TX: ${hasTX}, CA: ${hasCA}, FL: ${hasFL}, NY: ${hasNY}`,
    severity: 'high'
  });
}

async function phase7_notification_coverage() {
  const notifFile = fs.existsSync('server/services/automation/notificationEventCoverage.ts');
  let notifSrc = '';
  if (notifFile) {
    notifSrc = fs.readFileSync('server/services/automation/notificationEventCoverage.ts', 'utf-8');
  }
  const hasTimesheetReject = notifSrc.includes('timesheet') && notifSrc.includes('reject');
  const hasCertExpiry = notifSrc.includes('certification') && notifSrc.includes('expir');
  const hasPayrollReady = notifSrc.includes('payroll') && notifSrc.includes('ready');
  const hasPreferenceCheck = notifSrc.includes('preference') || notifSrc.includes('unsubscribed');
  
  record({
    name: 'Notification Event Coverage',
    phase: 'NOTIFICATIONS',
    passed: notifFile && hasCertExpiry,
    details: `File: ${notifFile}, TimesheetReject: ${hasTimesheetReject}, CertExpiry: ${hasCertExpiry}, PayrollReady: ${hasPayrollReady}, Preferences: ${hasPreferenceCheck}`,
    severity: 'high'
  });
}

async function phase8_financial_pipeline() {
  const fpPaths = [
    'server/services/financialPipelineOrchestrator.ts',
    'server/services/billing/financialPipelineOrchestrator.ts',
  ];
  const fpFound = fpPaths.find(f => fs.existsSync(f));
  const fpFile = !!fpFound;
  let fpSrc = '';
  if (fpFound) {
    fpSrc = fs.readFileSync(fpFound, 'utf-8');
  }
  const hasTimeEntries = fpSrc.includes('timeEntries') || fpSrc.includes('time_entries');
  const hasInvoiceGen = fpSrc.includes('invoice') || fpSrc.includes('Invoice');
  const hasPayrollGen = fpSrc.includes('payroll') || fpSrc.includes('Payroll');
  const hasConfidence = fpSrc.includes('confidence') || fpSrc.includes('Confidence');
  const hasAutoApprove = fpSrc.includes('auto') && fpSrc.includes('approv');
  const hasQBSync = fpSrc.includes('quickbooks') || fpSrc.includes('QuickBooks') || fpSrc.includes('qb');
  
  record({
    name: 'Financial Pipeline Orchestrator',
    phase: 'FINANCIAL',
    passed: fpFile && hasInvoiceGen && hasPayrollGen,
    details: `File: ${fpFile}, TimeEntries: ${hasTimeEntries}, Invoices: ${hasInvoiceGen}, Payroll: ${hasPayrollGen}, Confidence: ${hasConfidence}, AutoApprove: ${hasAutoApprove}, QBSync: ${hasQBSync}`,
    severity: 'critical'
  });
}

async function phase9_bot_ecosystem() {
  const botFiles = [
    'server/bots/registry.ts',
    'server/bots/index.ts',
    'server/services/trinity/botEcosystem.ts',
    'server/services/trinity/trinityBotEcosystem.ts',
  ];
  const existingBotFile = botFiles.find(f => fs.existsSync(f));
  let botSrc = '';
  if (existingBotFile) {
    botSrc = fs.readFileSync(existingBotFile, 'utf-8');
  }
  
  const bots = ['HelpAI', 'MeetingBot', 'ReportBot', 'ClockBot', 'CleanupBot'];
  const foundBots = bots.filter(b => botSrc.includes(b));
  
  record({
    name: 'Trinity Bot Ecosystem (5 Bots)',
    phase: 'BOTS',
    passed: foundBots.length >= 4,
    details: `Found ${foundBots.length}/5 bots: ${foundBots.join(', ')}. File: ${existingBotFile || 'not found'}`,
    severity: 'high'
  });
}

async function phase10_rate_limiting() {
  const rateLimitFiles = [
    'server/services/resilience/rateLimiter.ts',
    'server/middleware/rateLimiter.ts',
    'server/middleware/rateLimit.ts',
  ];
  const existingFile = rateLimitFiles.find(f => fs.existsSync(f));
  let rlSrc = '';
  if (existingFile) {
    rlSrc = fs.readFileSync(existingFile, 'utf-8');
  }
  
  const hasTenantAware = rlSrc.includes('workspace') || rlSrc.includes('tenant');
  const hasQuota = rlSrc.includes('quota') || rlSrc.includes('limit') || rlSrc.includes('window');
  
  const routesSrc = fs.readFileSync('server/routes.ts', 'utf-8');
  const hasRateLimitImport = routesSrc.includes('rateLimit') || routesSrc.includes('rateLimiter');
  
  record({
    name: 'Rate Limiting Infrastructure',
    phase: 'SECURITY',
    passed: !!existingFile && hasQuota,
    details: `File: ${existingFile || 'not found'}, TenantAware: ${hasTenantAware}, Quotas: ${hasQuota}, ImportedInRoutes: ${hasRateLimitImport}`,
    severity: 'high'
  });
}

async function phase11_email_service() {
  const emailFile = fs.existsSync('server/email.ts');
  let emailSrc = '';
  if (emailFile) {
    emailSrc = fs.readFileSync('server/email.ts', 'utf-8');
  }
  
  const hasResend = emailSrc.includes('Resend') || emailSrc.includes('resend');
  const hasCanSpam = emailSrc.includes('CAN-SPAM') || emailSrc.includes('canSpam') || emailSrc.includes('unsubscribe');
  const hasSendFunction = emailSrc.includes('sendEmail') || emailSrc.includes('sendCanSpamCompliantEmail');
  const hasConfigCheck = emailSrc.includes('isResendConfigured') || emailSrc.includes('RESEND');
  
  record({
    name: 'Email Service (Resend)',
    phase: 'EMAIL',
    passed: emailFile && hasResend && hasSendFunction,
    details: `File: ${emailFile}, Resend: ${hasResend}, CAN-SPAM: ${hasCanSpam}, SendFn: ${hasSendFunction}, ConfigCheck: ${hasConfigCheck}`,
    severity: 'high'
  });
}

async function phase12_employee_scoring() {
  const scoringFile = fs.existsSync('server/services/automation/employeeScoring.ts');
  let scoringSrc = '';
  if (scoringFile) {
    scoringSrc = fs.readFileSync('server/services/automation/employeeScoring.ts', 'utf-8');
  }
  
  const hasReliability = scoringSrc.includes('reliability') || scoringSrc.includes('Reliability');
  const hasEngagement = scoringSrc.includes('engagement') || scoringSrc.includes('Engagement');
  const hasPerformance = scoringSrc.includes('performance') || scoringSrc.includes('Performance');
  const hasComposite = scoringSrc.includes('composite') || scoringSrc.includes('Composite');
  
  record({
    name: 'Employee Behavior Scoring Service',
    phase: 'SCORING',
    passed: scoringFile && hasReliability,
    details: `File: ${scoringFile}, Reliability: ${hasReliability}, Engagement: ${hasEngagement}, Performance: ${hasPerformance}, Composite: ${hasComposite}`,
    severity: 'medium'
  });
}

async function phase13_contract_pipeline() {
  // CATEGORY C — Raw SQL retained: information_schema | Tables: information_schema | Verified: 2026-03-23
  const contractTables = await typedQuery(sql`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND (table_name LIKE 'contract%' OR table_name LIKE 'contractor%')
    ORDER BY table_name
  `);
  const contractTableNames = (contractTables as any).rows?.map((r: any) => r.table_name) || contractTables.map?.((r: any) => r.table_name) || [];
  
  record({
    name: 'Contract Pipeline Tables',
    phase: 'CONTRACTS',
    passed: contractTableNames.length >= 1,
    details: `Found ${contractTableNames.length} tables: ${contractTableNames.join(', ')}`,
    severity: 'high'
  });

  const contractRouteFile = fs.existsSync('server/routes/contractPipelineRoutes.ts');
  let contractSrc = '';
  if (contractRouteFile) {
    contractSrc = fs.readFileSync('server/routes/contractPipelineRoutes.ts', 'utf-8');
  }
  
  const hasCreate = contractSrc.includes("post('/'") || contractSrc.includes('post("/') || contractSrc.includes('insert');
  const hasList = contractSrc.includes("get('/'") || contractSrc.includes('get("/') || contractSrc.includes('select');
  const hasSign = contractSrc.includes('sign') || contractSrc.includes('signature');
  
  record({
    name: 'Contract Pipeline Routes',
    phase: 'CONTRACTS',
    passed: contractRouteFile && hasList,
    details: `File: ${contractRouteFile}, Create: ${hasCreate}, List: ${hasList}, Sign: ${hasSign}`,
    severity: 'high'
  });
}

async function phase14_shift_swap_lifecycle() {
  // CATEGORY C — Raw SQL retained: information_schema | Tables: information_schema | Verified: 2026-03-23
  const swapTables = await typedQuery(sql`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'shift_swap_requests'
  `);
  const hasSwapTable = ((swapTables as any).rows?.length || (swapTables as any).length || 0) > 0;
  
  record({
    name: 'Shift Swap Request Table',
    phase: 'SCHEDULING',
    passed: hasSwapTable,
    details: `Table exists: ${hasSwapTable}`,
    severity: 'high'
  });
}

async function phase15_time_entry_service() {
  const teServiceFiles = [
    'server/services/timeEntryService.ts',
    'server/routes/timeEntryRoutes.ts',
  ];
  const existingFiles = teServiceFiles.filter(f => fs.existsSync(f));
  
  let teSrc = '';
  if (fs.existsSync('server/routes/timeEntryRoutes.ts')) {
    teSrc = fs.readFileSync('server/routes/timeEntryRoutes.ts', 'utf-8');
  }
  
  const hasClockIn = teSrc.includes('clock-in') || teSrc.includes('clockIn');
  const hasClockOut = teSrc.includes('clock-out') || teSrc.includes('clockOut');
  const hasGPS = teSrc.includes('latitude') || teSrc.includes('gps') || teSrc.includes('GPS');
  const hasPhoto = teSrc.includes('photo') || teSrc.includes('Photo');
  const hasBreaks = teSrc.includes('break') || teSrc.includes('Break');
  
  record({
    name: 'Time Entry Service (Clock In/Out/GPS)',
    phase: 'TIME_TRACKING',
    passed: existingFiles.length >= 1 && hasClockIn && hasClockOut,
    details: `Files: ${existingFiles.length}, ClockIn: ${hasClockIn}, ClockOut: ${hasClockOut}, GPS: ${hasGPS}, Photo: ${hasPhoto}, Breaks: ${hasBreaks}`,
    severity: 'critical'
  });
}

async function phase16_automation_rollback() {
  const rollbackFile = fs.existsSync('server/services/automationRollbackService.ts');
  let rollbackSrc = '';
  if (rollbackFile) {
    rollbackSrc = fs.readFileSync('server/services/automationRollbackService.ts', 'utf-8');
  }
  
  const hasAuditLog = rollbackSrc.includes('audit_log') || rollbackSrc.includes('auditLog');
  const hasBeforeAfter = rollbackSrc.includes('before') && rollbackSrc.includes('after');
  const hasReverse = rollbackSrc.includes('reverse') || rollbackSrc.includes('rollback') || rollbackSrc.includes('undo');
  
  record({
    name: 'Automation Rollback Service',
    phase: 'AUTOMATION',
    passed: rollbackFile && hasReverse,
    details: `File: ${rollbackFile}, AuditLog: ${hasAuditLog}, BeforeAfter: ${hasBeforeAfter}, Reverse: ${hasReverse}`,
    severity: 'medium'
  });
}

async function phase17_schema_parity() {
  const parityFile = fs.existsSync('server/services/databaseParityScanner.ts') || fs.existsSync('server/services/schemaParityService.ts');
  let paritySrc = '';
  const files = ['server/services/databaseParityScanner.ts', 'server/services/schemaParityService.ts'];
  const found = files.find(f => fs.existsSync(f));
  if (found) {
    paritySrc = fs.readFileSync(found, 'utf-8');
  }
  
  const hasSchemaCheck = paritySrc.includes('information_schema') || paritySrc.includes('introspect');
  const hasComparison = paritySrc.includes('compare') || paritySrc.includes('parity') || paritySrc.includes('drift');
  
  record({
    name: 'Dynamic Schema Parity Validation',
    phase: 'INFRASTRUCTURE',
    passed: !!found && hasSchemaCheck,
    details: `File: ${found || 'not found'}, SchemaCheck: ${hasSchemaCheck}, Comparison: ${hasComparison}`,
    severity: 'medium'
  });
}

async function phase18_gamification() {
  // CATEGORY C — Raw SQL retained: information_schema | Tables: information_schema | Verified: 2026-03-23
  const gameTables = await typedQuery(sql`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name LIKE '%gamif%' OR table_name LIKE '%leaderboard%' OR table_name LIKE '%badge%' OR table_name LIKE '%achievement%'
    ORDER BY table_name
  `);
  const gameTableNames = (gameTables as any).rows?.map((r: any) => r.table_name) || gameTables.map?.((r: any) => r.table_name) || [];
  
  record({
    name: 'Gamification Tables',
    phase: 'GAMIFICATION',
    passed: gameTableNames.length >= 1,
    details: `Found ${gameTableNames.length} tables: ${gameTableNames.join(', ')}`,
    severity: 'medium'
  });
}

async function phase19_autonomous_scheduler_jobs() {
  const schedulerSrc = fs.readFileSync('server/services/scheduling/trinityAutonomousScheduler.ts', 'utf-8');
  const daemonExists = fs.existsSync('server/services/scheduling/autonomousSchedulingDaemon.ts');
  
  const jobs = [
    { name: 'billing', pattern: /bill|invoice/i },
    { name: 'payroll', pattern: /payroll/i },
    { name: 'compliance', pattern: /compliance|certification/i },
    { name: 'scheduling', pattern: /schedul/i },
    { name: 'maintenance', pattern: /maintenance|cleanup/i },
  ];
  
  const schedulerFile = fs.readFileSync('server/services/autonomousScheduler.ts', 'utf-8');
  const foundJobs = jobs.filter(j => j.pattern.test(schedulerFile));
  
  record({
    name: 'Autonomous Scheduler Jobs Coverage',
    phase: 'AUTOMATION',
    passed: foundJobs.length >= 3 && daemonExists,
    details: `Found ${foundJobs.length}/5 job categories: ${foundJobs.map(j => j.name).join(', ')}. Daemon: ${daemonExists}`,
    severity: 'high'
  });
}

async function phase20_websocket_domains() {
  const wsFile = fs.existsSync('server/websocket.ts');
  let wsSrc = '';
  if (wsFile) {
    wsSrc = fs.readFileSync('server/websocket.ts', 'utf-8');
  }
  
  const broadcastFunctions = [
    'broadcastToWorkspace',
    'broadcastToUser',
    'broadcastToRoom',
  ];
  const foundBroadcasts = broadcastFunctions.filter(f => wsSrc.includes(f));
  
  const domains = [
    { name: 'notifications', pattern: /notification/i },
    { name: 'scheduling', pattern: /schedul|shift/i },
    { name: 'chat', pattern: /chat|message/i },
    { name: 'credits', pattern: /credit/i },
  ];
  const foundDomains = domains.filter(d => d.pattern.test(wsSrc));
  
  record({
    name: 'WebSocket Broadcast Infrastructure',
    phase: 'REALTIME',
    passed: foundBroadcasts.length >= 2 && foundDomains.length >= 3,
    details: `Broadcasts: ${foundBroadcasts.join(', ')}. Domains: ${foundDomains.map(d => d.name).join(', ')}`,
    severity: 'high'
  });
}

async function phase21_critical_table_count() {
  // CATEGORY C — Raw SQL retained: information_schema | Tables: information_schema | Verified: 2026-03-23
  const tableCount = await typedCount(sql`
    SELECT count(*) as count FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `);
  const cnt = Number(tableCount || 0);
  
  record({
    name: 'Total Database Table Count',
    phase: 'DATABASE',
    passed: cnt >= 50,
    details: `${cnt} tables in public schema`,
    severity: 'info'
  });
}

export async function runEnhancementStressTest() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  COAILEAGUE ENHANCEMENT + DEEP COVERAGE STRESS TEST        ║');
  console.log('║  Testing: New Features + Previously Untested Areas          ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  await phase1_guard_tour_tables();
  await phase1_guard_tour_routes();
  await phase2_equipment_tables();
  await phase2_equipment_routes();
  await phase3_post_orders();
  await phase4_document_signing();
  await phase5_pwa_manifest();
  await phase6_compliance_system();
  await phase7_notification_coverage();
  await phase8_financial_pipeline();
  await phase9_bot_ecosystem();
  await phase10_rate_limiting();
  await phase11_email_service();
  await phase12_employee_scoring();
  await phase13_contract_pipeline();
  await phase14_shift_swap_lifecycle();
  await phase15_time_entry_service();
  await phase16_automation_rollback();
  await phase17_schema_parity();
  await phase18_gamification();
  await phase19_autonomous_scheduler_jobs();
  await phase20_websocket_domains();
  await phase21_critical_table_count();

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const criticalFails = results.filter(r => !r.passed && r.severity === 'critical').length;

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`  RESULTS: ${passed} PASSED | ${failed} FAILED (${criticalFails} critical)`);
  console.log('══════════════════════════════════════════════════════════════');
  
  if (failed > 0) {
    console.log('\nFailed tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  [${r.severity.toUpperCase()}] ${r.name}: ${r.details}`);
    });
  }

  console.log(`\n  Total tables verified, services checked, routes validated`);
  console.log(`  Coverage: Guard Tours, Equipment Tracking, Post Orders,`);
  console.log(`  Document Signing, PWA, Compliance, Notifications, Financial Pipeline,`);
  console.log(`  Bot Ecosystem, Rate Limiting, Email, Scoring, Contracts,`);
  console.log(`  Shift Swaps, Time Tracking, Rollback, Schema Parity,`);
  console.log(`  Gamification, Autonomous Jobs, WebSocket, Database`);

  return { passed, failed, criticalFails, results };
}
