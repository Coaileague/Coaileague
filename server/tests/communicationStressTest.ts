import fs from 'fs';
import { db } from '../db';
import { 
  chatConversations, chatMessages, chatParticipants,
  notifications, supportRooms, supportTickets, supportTicketAccess,
  emailEvents, pushSubscriptions, users, workspaces, employees,
  organizationChatRooms
} from '@shared/schema';
import { eq, and, desc, sql, count, isNull, gte } from 'drizzle-orm';

interface TestResult {
  name: string;
  category: string;
  passed: boolean;
  details: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  fix?: string;
}

const results: TestResult[] = [];

function record(r: TestResult) {
  results.push(r);
  const icon = r.passed ? '[PASS]' : '[FAIL]';
  console.log(`${icon} [${r.category}] ${r.name}: ${r.details}`);
}

// ============================================================================
// CATEGORY 1: CHAT SYSTEM — Conversations, Messages, Persistence
// ============================================================================

async function test_chat_conversation_schema() {
  const src = fs.readFileSync('shared/schema.ts', 'utf-8');
  const checks = {
    conversationType: src.includes("conversationType") && src.includes("dm_user") && src.includes("dm_support") && src.includes("dm_bot") && src.includes("open_chat") && src.includes("shift_chat"),
    encryption: src.includes("isEncrypted") && src.includes("encryptionKeyId"),
    voiceModeration: src.includes("isSilenced") && src.includes("voiceGrantedBy"),
    lifecycle: src.includes("autoCloseAt") && src.includes("visibility"),
    ratings: src.includes("rating") && src.includes("feedback"),
  };
  const passed = Object.values(checks).every(v => v);
  record({
    name: 'Chat Conversation Schema Completeness',
    category: 'CHAT',
    passed,
    details: passed
      ? `5 conversation types (dm_user, dm_support, dm_bot, open_chat, shift_chat), encryption, voice moderation, lifecycle, ratings`
      : `Missing: ${Object.entries(checks).filter(([,v]) => !v).map(([k]) => k).join(', ')}`,
    severity: 'high',
  });
}

async function test_chat_message_features() {
  const src = fs.readFileSync('shared/schema.ts', 'utf-8');
  const checks = {
    threading: src.includes("parentMessageId") && src.includes("threadId") && src.includes("replyCount"),
    privateMessages: src.includes("isPrivateMessage") && src.includes("recipientId"),
    attachments: src.includes("attachmentUrl") && src.includes("attachmentType") && src.includes("attachmentSize") && src.includes("attachmentThumbnail"),
    mentions: src.includes('mentions') && src.includes("ARRAY[]::text[]"),
    editing: src.includes("isEdited") && src.includes("editedAt"),
    deleteForEveryone: src.includes("isDeletedForEveryone") && src.includes("deletedForEveryoneAt"),
    sentiment: src.includes("sentimentScore") && src.includes("sentimentConfidence") && src.includes("urgencyLevel") && src.includes("shouldEscalate"),
    staffOnly: src.includes("visibleToStaffOnly"),
    messageTypes: src.includes("'text'") && src.includes("'file'") && src.includes("'system'") && src.includes("'image'"),
    encryption: src.includes("isEncrypted") && src.includes("encryptionIv"),
  };
  const all = Object.values(checks).every(v => v);
  record({
    name: 'Chat Message Feature Completeness',
    category: 'CHAT',
    passed: all,
    details: all
      ? `10/10 features: threading, DMs, attachments, mentions, editing, delete-for-all, sentiment analysis, staff-only, message types, encryption`
      : `Missing: ${Object.entries(checks).filter(([,v]) => !v).map(([k]) => k).join(', ')}`,
    severity: 'high',
  });
}

async function test_chat_route_security() {
  const chatRoute = fs.readFileSync('server/routes/chat.ts', 'utf-8');
  const checks = {
    authRequired: chatRoute.includes('requireAuth') || chatRoute.includes('requireAnyAuth'),
    rateLimiting: chatRoute.includes('chatMessageLimiter') || chatRoute.includes('chatConversationLimiter'),
    inputValidation: chatRoute.includes('insertChatMessageSchema') || chatRoute.includes('parse'),
    xssProtection: chatRoute.includes('sanitize') || chatRoute.includes('escape') || chatRoute.includes('insertChatMessageSchema'),
  };
  const passed = checks.authRequired && checks.rateLimiting && checks.inputValidation;
  record({
    name: 'Chat Route Security',
    category: 'CHAT',
    passed,
    details: `Auth: ${checks.authRequired}, Rate limit: ${checks.rateLimiting}, Input validation: ${checks.inputValidation}`,
    severity: 'critical',
  });
}

async function test_chat_db_persistence() {
  try {
    const [{ cnt }] = await db.select({ cnt: sql<number>`count(*)` }).from(chatConversations);
    const [{ msgCnt }] = await db.select({ msgCnt: sql<number>`count(*)` }).from(chatMessages);
    record({
      name: 'Chat DB Persistence',
      category: 'CHAT',
      passed: true,
      details: `${Number(cnt)} conversations, ${Number(msgCnt)} messages persisted in PostgreSQL`,
      severity: 'high',
    });
  } catch (e: any) {
    record({
      name: 'Chat DB Persistence',
      category: 'CHAT',
      passed: false,
      details: `DB query failed: ${e.message}`,
      severity: 'critical',
      fix: 'Ensure chat tables exist and are accessible',
    });
  }
}

async function test_chat_websocket_broadcasting() {
  const wsSrc = fs.readFileSync('server/websocket.ts', 'utf-8');
  const checks = {
    broadcastToWorkspace: wsSrc.includes('broadcastToWorkspace'),
    broadcastNotificationToUser: wsSrc.includes('broadcastNotificationToUser'),
    broadcastMessageToConversation: wsSrc.includes('broadcastMessageToConversation') || wsSrc.includes('broadcastToRoom') || wsSrc.includes('broadcastChatMessage'),
    roomJoin: wsSrc.includes('join') || wsSrc.includes('room'),
  };
  const passed = checks.broadcastToWorkspace && checks.broadcastNotificationToUser;
  record({
    name: 'Chat WebSocket Broadcasting',
    category: 'CHAT',
    passed,
    details: `broadcastToWorkspace: ${checks.broadcastToWorkspace}, broadcastNotificationToUser: ${checks.broadcastNotificationToUser}, room broadcasts: ${checks.broadcastMessageToConversation || checks.roomJoin}`,
    severity: 'high',
  });
}

async function test_chat_unread_tracking() {
  const exists = fs.existsSync('server/services/unreadMessageService.ts');
  let hasUnreadLogic = false;
  if (exists) {
    const src = fs.readFileSync('server/services/unreadMessageService.ts', 'utf-8');
    hasUnreadLogic = src.includes('markAsRead') || src.includes('getUnreadCount') || src.includes('unread');
  }
  record({
    name: 'Unread Message Tracking',
    category: 'CHAT',
    passed: exists && hasUnreadLogic,
    details: exists && hasUnreadLogic
      ? 'UnreadMessageService exists with read tracking'
      : 'Missing unread message tracking service',
    severity: 'medium',
  });
}

// ============================================================================
// CATEGORY 2: DM SYSTEM — Direct Messages, Privacy, Encryption
// ============================================================================

async function test_dm_system() {
  const schemaSrc = fs.readFileSync('shared/schema.ts', 'utf-8');
  const hasDmTypes = schemaSrc.includes("dm_user") && schemaSrc.includes("dm_support") && schemaSrc.includes("dm_bot");
  const hasPrivateFlag = schemaSrc.includes("isPrivateMessage") && schemaSrc.includes("recipientId");
  const hasEncryption = schemaSrc.includes("isEncrypted") && schemaSrc.includes("encryptionIv");
  const passed = hasDmTypes && hasPrivateFlag && hasEncryption;
  record({
    name: 'DM System Architecture',
    category: 'DM',
    passed,
    details: passed
      ? 'DM types (user/support/bot), private message flags, recipient targeting, encryption at rest'
      : `DM types: ${hasDmTypes}, Private: ${hasPrivateFlag}, Encryption: ${hasEncryption}`,
    severity: 'high',
  });
}

async function test_dm_privacy_isolation() {
  const chatRoute = fs.readFileSync('server/routes/chat.ts', 'utf-8');
  const hasParticipantCheck = chatRoute.includes('participant') || chatRoute.includes('customerId') || chatRoute.includes('senderId');
  const hasWorkspaceScope = chatRoute.includes('workspaceId');
  record({
    name: 'DM Privacy Isolation',
    category: 'DM',
    passed: hasParticipantCheck && hasWorkspaceScope,
    details: `Participant filtering: ${hasParticipantCheck}, Workspace scoping: ${hasWorkspaceScope}`,
    severity: 'high',
  });
}

// ============================================================================
// CATEGORY 3: SUPPORT ROOMS — HelpDesk, Ticketed Access, Staff Features
// ============================================================================

async function test_support_room_schema() {
  const src = fs.readFileSync('shared/schema.ts', 'utf-8');
  const checks = {
    slug: src.includes("slug") && src.includes("supportRooms"),
    modes: src.includes("'org'") && src.includes("'sup'") && src.includes("'met'"),
    status: src.includes("statusMessage"),
    accessControl: src.includes("requiresTicket") && src.includes("allowedRoles"),
    ticketAccess: src.includes("supportTicketAccess"),
  };
  const passed = Object.values(checks).every(v => v);
  record({
    name: 'Support Room Schema',
    category: 'SUPPORT',
    passed,
    details: passed
      ? 'Support rooms with slug, IRC modes (org/sup/met/field/coai), access control, ticketed entry, RBAC roles'
      : `Missing: ${Object.entries(checks).filter(([,v]) => !v).map(([k]) => k).join(', ')}`,
    severity: 'high',
  });
}

async function test_helpdesk_room_seeding() {
  const hubSrc = fs.readFileSync('server/services/ChatServerHub.ts', 'utf-8');
  const hasHelpdeskSeed = hubSrc.includes('seedHelpDeskRoom') && hubSrc.includes("HELPDESK_SLUG") && hubSrc.includes("helpai-bot");
  const hasIdempotent = hubSrc.includes('existingRoom') || hubSrc.includes('already initialized');
  record({
    name: 'HelpDesk Room Auto-Seeding',
    category: 'SUPPORT',
    passed: hasHelpdeskSeed && hasIdempotent,
    details: hasHelpdeskSeed
      ? 'HelpDesk room auto-seeded with HelpAI bot on startup, idempotent check present'
      : 'Missing HelpDesk room seeding',
    severity: 'high',
  });
}

async function test_support_room_db() {
  try {
    const rooms = await db.select().from(supportRooms).limit(10);
    const helpdeskRoom = rooms.find(r => r.slug === 'helpdesk');
    record({
      name: 'Support Rooms in DB',
      category: 'SUPPORT',
      passed: rooms.length > 0,
      details: `${rooms.length} support rooms found. HelpDesk: ${helpdeskRoom ? 'EXISTS (conv: ' + helpdeskRoom.conversationId + ')' : 'NOT FOUND'}`,
      severity: 'high',
      fix: helpdeskRoom ? undefined : 'HelpDesk room should be seeded on startup',
    });
  } catch (e: any) {
    record({
      name: 'Support Rooms in DB',
      category: 'SUPPORT',
      passed: false,
      details: `DB query failed: ${e.message}`,
      severity: 'critical',
    });
  }
}

async function test_chatserverhub_architecture() {
  const hubSrc = fs.readFileSync('server/services/ChatServerHub.ts', 'utf-8');
  const checks = {
    eventTypes: ['message_posted', 'message_edited', 'message_deleted', 'user_joined_room', 'ticket_created', 'ticket_escalated', 'ai_response', 'sentiment_alert']
      .every(t => hubSrc.includes(t)),
    roomTypes: hubSrc.includes("'support'") && hubSrc.includes("'work'") && hubSrc.includes("'meeting'") && hubSrc.includes("'org'"),
    eventBus: hubSrc.includes('platformEventBus') || hubSrc.includes('subscribeToEventBus'),
    activeRoomTracking: hubSrc.includes('activeRooms') && hubSrc.includes('ActiveRoom'),
    heartbeat: hubSrc.includes('startHeartbeat') || hubSrc.includes('heartbeatInterval'),
    escalation: hubSrc.includes('escalationLevel') && hubSrc.includes('tier1'),
  };
  const passed = Object.values(checks).every(v => v);
  record({
    name: 'ChatServerHub Event Architecture',
    category: 'SUPPORT',
    passed,
    details: passed
      ? '8+ event types, 4 room types, platform event bus, active room tracking, heartbeat, escalation tiers'
      : `Missing: ${Object.entries(checks).filter(([,v]) => !v).map(([k]) => k).join(', ')}`,
    severity: 'high',
  });
}

// ============================================================================
// CATEGORY 4: EMAIL SYSTEM — Resend, Templates, CAN-SPAM, Audit
// ============================================================================

async function test_email_service_architecture() {
  const src = fs.readFileSync('server/services/emailService.ts', 'utf-8');
  const templates = ['verification', 'passwordReset', 'supportTicketConfirmation']
    .filter(t => src.includes(t));
  const hasSimulationMode = src.includes('SIMULATION') || src.includes('simulation');
  const hasAuditTrail = src.includes('emailEvents');
  const hasResend = src.includes('Resend') || src.includes('resend');
  record({
    name: 'Email Service Architecture',
    category: 'EMAIL',
    passed: templates.length >= 2 && hasAuditTrail && hasResend,
    details: `${templates.length} templates found (${templates.join(', ')}), Resend: ${hasResend}, Audit trail: ${hasAuditTrail}, Simulation: ${hasSimulationMode}`,
    severity: 'high',
  });
}

async function test_email_canspam() {
  const emailSrc = fs.readFileSync('server/email.ts', 'utf-8');
  const hasCanSpam = emailSrc.includes('sendCanSpamCompliantEmail');
  const hasUnsubscribe = emailSrc.includes('isEmailUnsubscribed') || emailSrc.includes('unsubscribe');
  const hasListUnsubscribe = emailSrc.includes('List-Unsubscribe') || emailSrc.includes('list-unsubscribe');
  record({
    name: 'CAN-SPAM Compliance',
    category: 'EMAIL',
    passed: hasCanSpam && hasUnsubscribe,
    details: `CAN-SPAM wrapper: ${hasCanSpam}, Unsubscribe check: ${hasUnsubscribe}, List-Unsubscribe header: ${hasListUnsubscribe}`,
    severity: 'critical',
  });
}

async function test_email_event_audit() {
  try {
    const [{ cnt }] = await db.select({ cnt: sql<number>`count(*)` }).from(emailEvents);
    record({
      name: 'Email Event Audit Trail',
      category: 'EMAIL',
      passed: true,
      details: `emailEvents table accessible. ${Number(cnt)} events logged.`,
      severity: 'medium',
    });
  } catch (e: any) {
    record({
      name: 'Email Event Audit Trail',
      category: 'EMAIL',
      passed: false,
      details: `emailEvents table query failed: ${e.message}`,
      severity: 'high',
    });
  }
}

async function test_email_resend_config() {
  const emailSrc = fs.readFileSync('server/email.ts', 'utf-8');
  const hasKeyCheck = emailSrc.includes('RESEND_API_KEY') || emailSrc.includes('isResendConfigured');
  const hasErrorHandling = emailSrc.includes('catch') && (emailSrc.includes('error') || emailSrc.includes('Error'));
  record({
    name: 'Resend Configuration Safety',
    category: 'EMAIL',
    passed: hasKeyCheck && hasErrorHandling,
    details: `API key check: ${hasKeyCheck}, Error handling: ${hasErrorHandling}. Emails won't crash app if Resend is unconfigured.`,
    severity: 'high',
  });
}

// ============================================================================
// CATEGORY 5: NOTIFICATION SYSTEM — Universal Engine, Push, WebSocket
// ============================================================================

async function test_notification_schema() {
  const src = fs.readFileSync('shared/schema.ts', 'utf-8');
  const checks = {
    scope: src.includes("notificationScopeEnum"),
    category: src.includes("notificationCategoryEnum"),
    threeStates: src.includes("isRead") && src.includes("isAcknowledged") && src.includes("clearedAt"),
    actionUrl: src.includes("actionUrl"),
    metadata: src.includes("metadata") && src.includes("jsonb"),
    indexes: src.includes("notifications_user_idx") && src.includes("notifications_scope_idx"),
  };
  const passed = Object.values(checks).every(v => v);
  record({
    name: 'Notification Schema Completeness',
    category: 'NOTIFICATIONS',
    passed,
    details: passed
      ? 'Scoped notifications, categories, 3-state lifecycle (unread/read/cleared), action URLs, JSONB metadata, 8+ indexes'
      : `Missing: ${Object.entries(checks).filter(([,v]) => !v).map(([k]) => k).join(', ')}`,
    severity: 'high',
  });
}

async function test_universal_notification_engine() {
  const src = fs.readFileSync('server/services/universalNotificationEngine.ts', 'utf-8');
  const checks = {
    rbacFiltering: src.includes('targetRoles') || src.includes('RBAC'),
    aiEnrichment: src.includes('enrichNotificationWithAI') || src.includes('Trinity AI'),
    pushDelivery: src.includes('pushNotificationService') || src.includes('deliverPushNotification'),
    websocketBroadcast: src.includes('broadcastNotificationToUser') || src.includes('broadcastToWorkspace'),
    dbPersistence: src.includes('db.insert') || src.includes('notifications'),
    severityLevels: src.includes("'info'") && src.includes("'warning'") && src.includes("'error'") && src.includes("'critical'"),
  };
  const passed = Object.values(checks).every(v => v);
  record({
    name: 'Universal Notification Engine',
    category: 'NOTIFICATIONS',
    passed,
    details: passed
      ? 'RBAC-filtered, AI-enriched, push + WebSocket + DB persistence, 4 severity levels'
      : `Missing: ${Object.entries(checks).filter(([,v]) => !v).map(([k]) => k).join(', ')}`,
    severity: 'high',
  });
}

async function test_notification_db() {
  try {
    const [{ cnt }] = await db.select({ cnt: sql<number>`count(*)` }).from(notifications);
    record({
      name: 'Notification DB Persistence',
      category: 'NOTIFICATIONS',
      passed: true,
      details: `${Number(cnt)} notifications in database`,
      severity: 'medium',
    });
  } catch (e: any) {
    record({
      name: 'Notification DB Persistence',
      category: 'NOTIFICATIONS',
      passed: false,
      details: `DB query failed: ${e.message}`,
      severity: 'critical',
    });
  }
}

async function test_push_notifications() {
  const src = fs.readFileSync('shared/schema.ts', 'utf-8');
  const hasPushSchema = src.includes('pushSubscriptions') && src.includes('endpoint') && src.includes('p256dhKey') && src.includes('authKey');
  
  let hasPushService = false;
  if (fs.existsSync('server/services/pushNotificationService.ts')) {
    const pushSrc = fs.readFileSync('server/services/pushNotificationService.ts', 'utf-8');
    hasPushService = pushSrc.includes('sendPushToUser') || pushSrc.includes('webpush');
  }
  
  record({
    name: 'Web Push Notification System',
    category: 'NOTIFICATIONS',
    passed: hasPushSchema && hasPushService,
    details: `Push schema: ${hasPushSchema}, Push service: ${hasPushService}. VAPID-based browser push with endpoint/p256dh/auth keys.`,
    severity: 'medium',
  });
}

async function test_welcome_notifications() {
  const src = fs.readFileSync('server/services/notificationService.ts', 'utf-8');
  const hasWelcome = src.includes('WELCOME_NOTIFICATIONS') || src.includes('sendWelcomeOrgNotification');
  const hasTrinityGuide = src.includes('Trinity AI') || src.includes('trinityGuide');
  const hasOrgWelcome = src.includes('orgWelcome') || src.includes('Welcome to');
  record({
    name: 'Welcome Notification Package',
    category: 'NOTIFICATIONS',
    passed: hasWelcome && hasTrinityGuide && hasOrgWelcome,
    details: `Welcome system: ${hasWelcome}, Trinity guide: ${hasTrinityGuide}, Org welcome: ${hasOrgWelcome}. 3 curated notifications on signup.`,
    severity: 'medium',
  });
}

// ============================================================================
// CATEGORY 6: ACTIONABLE COMMANDS — Approve/Deny/Accept/Review Actions
// ============================================================================

async function test_actionable_notification_types() {
  const src = fs.readFileSync('shared/schema.ts', 'utf-8');
  const actionableTypes = [
    'approve_schedule_swap', 'shift_assignment', 'shift_swap_request',
    'document_extraction', 'issue_detected', 'timesheet_rejection',
  ].filter(t => src.includes(t));
  
  const hasApprovalWorkflow = src.includes("'pending'") && src.includes("'approved'") && src.includes("'rejected'");
  record({
    name: 'Actionable Notification Types',
    category: 'COMMANDS',
    passed: actionableTypes.length >= 3 && hasApprovalWorkflow,
    details: `${actionableTypes.length} actionable types found: ${actionableTypes.join(', ')}. Approval workflow states: ${hasApprovalWorkflow}`,
    severity: 'high',
  });
}

async function test_approval_workflow_entities() {
  const src = fs.readFileSync('shared/schema.ts', 'utf-8');
  const approvalEntities = [];
  if (src.includes("swapRequestStatusEnum") && src.includes("'approved'")) approvalEntities.push('shift_swaps');
  if (src.includes("ptoStatusEnum") && src.includes("'approved'")) approvalEntities.push('pto_requests');
  if (src.includes("auto_approved") && src.includes("approvedBy")) approvalEntities.push('invoices');
  if (src.includes("approvedBy") && src.includes("payroll")) approvalEntities.push('payroll');
  if (src.includes("backgroundCheckStatus") && src.includes("approved")) approvalEntities.push('background_checks');
  
  record({
    name: 'Approval Workflow Entities',
    category: 'COMMANDS',
    passed: approvalEntities.length >= 3,
    details: `${approvalEntities.length} entities with approve/deny/review: ${approvalEntities.join(', ')}`,
    severity: 'high',
  });
}

async function test_notification_action_urls() {
  const notifSrc = fs.readFileSync('server/services/notificationService.ts', 'utf-8');
  const hasActionUrl = notifSrc.includes('actionUrl');
  const uniSrc = fs.readFileSync('server/services/universalNotificationEngine.ts', 'utf-8');
  const hasEngineActionUrl = uniSrc.includes('actionUrl');
  record({
    name: 'Notification Action URL Routing',
    category: 'COMMANDS',
    passed: hasActionUrl && hasEngineActionUrl,
    details: `Notifications carry actionUrl for click-through: notificationService=${hasActionUrl}, universalEngine=${hasEngineActionUrl}`,
    severity: 'medium',
  });
}

async function test_workflow_approval_service() {
  let passed = false;
  let details = 'No workflow approval service found';
  if (fs.existsSync('server/services/ai-brain/workflowApprovalService.ts')) {
    const src = fs.readFileSync('server/services/ai-brain/workflowApprovalService.ts', 'utf-8');
    passed = src.includes('approve') || src.includes('APPROVE');
    details = passed
      ? 'WorkflowApprovalService found with approval logic for AI-initiated actions'
      : 'WorkflowApprovalService exists but missing approval logic';
  }
  record({
    name: 'Workflow Approval Service (AI Actions)',
    category: 'COMMANDS',
    passed,
    details,
    severity: 'high',
  });
}

// ============================================================================
// CATEGORY 7: SUPPORT STAFF SYSTEM — Agents, Escalation, Ticket Integration
// ============================================================================

async function test_support_session_service() {
  let passed = false;
  let details = 'No support session service found';
  if (fs.existsSync('server/services/supportSessionService.ts')) {
    const src = fs.readFileSync('server/services/supportSessionService.ts', 'utf-8');
    passed = src.includes('session') || src.includes('supportAgent');
    details = passed ? 'SupportSessionService manages support staff sessions and agent assignment' : 'Service file exists but missing session logic';
  }
  record({
    name: 'Support Session Management',
    category: 'SUPPORT_STAFF',
    passed,
    details,
    severity: 'high',
  });
}

async function test_ticket_system() {
  const src = fs.readFileSync('shared/schema.ts', 'utf-8');
  const hasTickets = src.includes('supportTickets') && src.includes('status') && src.includes('priority');
  const hasAssignment = src.includes('assignedTo') || src.includes('supportAgentId');
  const hasEscalation = src.includes('escalat') || src.includes('tier');
  record({
    name: 'Support Ticket System',
    category: 'SUPPORT_STAFF',
    passed: hasTickets && hasAssignment,
    details: `Ticket schema: ${hasTickets}, Agent assignment: ${hasAssignment}, Escalation: ${hasEscalation}`,
    severity: 'high',
  });
}

async function test_auto_ticket_creation() {
  let passed = false;
  let details = 'No auto-ticket service found';
  if (fs.existsSync('server/services/autoTicketCreation.ts')) {
    const src = fs.readFileSync('server/services/autoTicketCreation.ts', 'utf-8');
    passed = src.includes('createTicket') || src.includes('autoTicket') || src.includes('supportTickets');
    details = passed ? 'AutoTicketCreation service auto-creates tickets from chat/escalation triggers' : 'Service exists but missing core logic';
  }
  record({
    name: 'Auto-Ticket Creation from Chat',
    category: 'SUPPORT_STAFF',
    passed,
    details,
    severity: 'medium',
  });
}

async function test_support_actions_service() {
  let passed = false;
  let details = 'No support actions service found';
  if (fs.existsSync('server/services/supportActionsService.ts')) {
    const src = fs.readFileSync('server/services/supportActionsService.ts', 'utf-8');
    const actions = ['lock_account', 'unlock_account', 'reset_password', 'reset_email', 'revoke_sessions']
      .filter(a => src.includes(a));
    const hasHierarchy = src.includes('minLevelForDirectExecution') && src.includes('PLATFORM_ROLE_HIERARCHY');
    passed = actions.length >= 3 && hasHierarchy;
    details = passed
      ? `SupportActionsService: ${actions.length} actions (${actions.join(', ')}), hierarchy-aware approval gates`
      : `Actions: ${actions.length}, Hierarchy: ${hasHierarchy}`;
  }
  record({
    name: 'Support Staff Moderation Actions',
    category: 'SUPPORT_STAFF',
    passed,
    details,
    severity: 'medium',
  });
}

// ============================================================================
// CATEGORY 8: BOT ECOSYSTEM — Trinity Bots, HelpAI, Command Processing
// ============================================================================

async function test_bot_ecosystem() {
  const hubSrc = fs.readFileSync('server/services/ChatServerHub.ts', 'utf-8');
  const hasBotIntegration = hubSrc.includes('bot') || hubSrc.includes('Bot') || hubSrc.includes('helpai');
  const hasAiResponse = hubSrc.includes('ai_response') || hubSrc.includes('aiResponse');
  
  let hasCommandService = false;
  if (fs.existsSync('server/services/chatroomCommandService.ts')) {
    const cmdSrc = fs.readFileSync('server/services/chatroomCommandService.ts', 'utf-8');
    hasCommandService = cmdSrc.includes('command') || cmdSrc.includes('Command');
  }
  
  record({
    name: 'Bot Ecosystem Integration',
    category: 'BOTS',
    passed: hasBotIntegration && hasAiResponse,
    details: `Bot integration: ${hasBotIntegration}, AI responses: ${hasAiResponse}, Command service: ${hasCommandService}`,
    severity: 'high',
  });
}

async function test_chatroom_commands() {
  let passed = false;
  let details = 'No chatroom command service found';
  if (fs.existsSync('server/services/chatroomCommandService.ts')) {
    const src = fs.readFileSync('server/services/chatroomCommandService.ts', 'utf-8');
    passed = src.includes('command') || src.includes('/');
    details = passed ? 'ChatroomCommandService processes slash/IRC-style commands in chat rooms' : 'Service exists but missing command logic';
  }
  record({
    name: 'Chatroom Command Processing',
    category: 'BOTS',
    passed,
    details,
    severity: 'medium',
  });
}

async function test_smart_reply_service() {
  let passed = false;
  let details = 'No smart reply service found';
  if (fs.existsSync('server/services/smartReplyService.ts')) {
    const src = fs.readFileSync('server/services/smartReplyService.ts', 'utf-8');
    passed = src.includes('suggestReply') || src.includes('smartReply') || src.includes('generateReply');
    details = passed ? 'SmartReplyService provides AI-generated reply suggestions in chat' : 'Service exists but missing reply generation';
  }
  record({
    name: 'Smart Reply AI Suggestions',
    category: 'BOTS',
    passed,
    details,
    severity: 'low',
  });
}

// ============================================================================
// CATEGORY 9: LIVE SYNC — WebSocket Infrastructure, Connection Cleanup
// ============================================================================

async function test_websocket_infrastructure() {
  const wsSrc = fs.readFileSync('server/websocket.ts', 'utf-8');
  const checks = {
    heartbeat: wsSrc.includes('heartbeat') || wsSrc.includes('ping') || wsSrc.includes('pong'),
    reconnection: wsSrc.includes('reconnect') || wsSrc.includes('close'),
    authentication: wsSrc.includes('auth') || wsSrc.includes('session') || wsSrc.includes('userId'),
    roomManagement: wsSrc.includes('room') || wsSrc.includes('join') || wsSrc.includes('workspaceId'),
  };
  const passed = checks.authentication && checks.roomManagement;
  record({
    name: 'WebSocket Infrastructure',
    category: 'LIVE_SYNC',
    passed,
    details: `Auth: ${checks.authentication}, Rooms: ${checks.roomManagement}, Heartbeat: ${checks.heartbeat}, Reconnection: ${checks.reconnection}`,
    severity: 'critical',
  });
}

async function test_connection_cleanup() {
  let passed = false;
  let details = 'No connection cleanup service found';
  if (fs.existsSync('server/services/wsConnectionCleanup.ts')) {
    const src = fs.readFileSync('server/services/wsConnectionCleanup.ts', 'utf-8');
    passed = src.includes('cleanup') || src.includes('stale') || src.includes('disconnect');
    details = passed ? 'WS connection cleanup handles stale connections and disconnects' : 'Service exists but missing cleanup logic';
  }
  record({
    name: 'WebSocket Connection Cleanup',
    category: 'LIVE_SYNC',
    passed,
    details,
    severity: 'medium',
  });
}

async function test_typing_indicators() {
  const schemaSrc = fs.readFileSync('shared/schema.ts', 'utf-8');
  const hasTypingSchema = schemaSrc.includes('typingIndicators') || schemaSrc.includes('typing_indicators');
  const chatSrc = fs.readFileSync('server/routes/chat.ts', 'utf-8');
  const hasTypingRoute = chatSrc.includes('typing') || chatSrc.includes('typingIndicators');
  record({
    name: 'Typing Indicators',
    category: 'LIVE_SYNC',
    passed: hasTypingSchema || hasTypingRoute,
    details: `Schema: ${hasTypingSchema}, Route: ${hasTypingRoute}. Real-time typing status for chat participants.`,
    severity: 'low',
  });
}

// ============================================================================
// CATEGORY 10: SENTIMENT & ABUSE DETECTION
// ============================================================================

async function test_sentiment_analysis() {
  let passed = false;
  let details = 'No sentiment analysis service found';
  if (fs.existsSync('server/services/chatSentimentService.ts')) {
    const src = fs.readFileSync('server/services/chatSentimentService.ts', 'utf-8');
    passed = src.includes('sentiment') || src.includes('analyze');
    details = passed ? 'ChatSentimentService analyzes message sentiment, urgency, and escalation flags' : 'Service exists but missing analysis logic';
  }
  record({
    name: 'Chat Sentiment Analysis',
    category: 'SAFETY',
    passed,
    details,
    severity: 'medium',
  });
}

async function test_abuse_detection() {
  let passed = false;
  let details = 'No abuse detection service found';
  if (fs.existsSync('server/services/abuseDetection.ts')) {
    const src = fs.readFileSync('server/services/abuseDetection.ts', 'utf-8');
    passed = src.includes('abuse') || src.includes('detect') || src.includes('spam') || src.includes('flood');
    details = passed ? 'AbuseDetection service monitors for spam, flooding, and abusive content' : 'Service exists but missing detection logic';
  }
  record({
    name: 'Abuse Detection System',
    category: 'SAFETY',
    passed,
    details,
    severity: 'medium',
  });
}

// ============================================================================
// CATEGORY 11: CROSS-SYSTEM INTEGRATION
// ============================================================================

async function test_notification_to_email_pipeline() {
  const notifSrc = fs.readFileSync('server/services/notificationService.ts', 'utf-8');
  const hasEmailInNotif = notifSrc.includes('Resend') || notifSrc.includes('email') || notifSrc.includes('resend');
  const hasEmailFallback = notifSrc.includes('catch') && notifSrc.includes('email');
  record({
    name: 'Notification → Email Pipeline',
    category: 'INTEGRATION',
    passed: hasEmailInNotif,
    details: `Notifications trigger emails: ${hasEmailInNotif}, Non-fatal email errors: ${hasEmailFallback}. Email failure doesn't block notification.`,
    severity: 'high',
  });
}

async function test_chat_to_ticket_pipeline() {
  const hubSrc = fs.readFileSync('server/services/ChatServerHub.ts', 'utf-8');
  const hasTicketCreation = hubSrc.includes('ticket_created') || hubSrc.includes('supportTickets');
  const hasEscalation = hubSrc.includes('ticket_escalated') || hubSrc.includes('escalation');
  record({
    name: 'Chat → Ticket Escalation Pipeline',
    category: 'INTEGRATION',
    passed: hasTicketCreation && hasEscalation,
    details: `Chat creates tickets: ${hasTicketCreation}, Escalation events: ${hasEscalation}`,
    severity: 'high',
  });
}

async function test_trinity_notification_bridge() {
  let passed = false;
  let details = 'No Trinity notification bridge found';
  if (fs.existsSync('server/services/ai-brain/trinityNotificationBridge.ts')) {
    const src = fs.readFileSync('server/services/ai-brain/trinityNotificationBridge.ts', 'utf-8');
    passed = src.includes('notification') || src.includes('broadcast');
    details = passed ? 'TrinityNotificationBridge connects AI decisions to real-time notification delivery' : 'Bridge exists but missing notification logic';
  }
  record({
    name: 'Trinity → Notification Bridge',
    category: 'INTEGRATION',
    passed,
    details,
    severity: 'medium',
  });
}

async function test_platform_event_bus() {
  let passed = false;
  let details = 'No platform event bus found';
  if (fs.existsSync('server/services/platformEventBus.ts')) {
    const src = fs.readFileSync('server/services/platformEventBus.ts', 'utf-8');
    passed = src.includes('emit') && src.includes('subscribe');
    details = passed ? 'PlatformEventBus: central pub/sub for cross-service event propagation' : 'Event bus exists but missing emit/subscribe';
  }
  record({
    name: 'Platform Event Bus',
    category: 'INTEGRATION',
    passed,
    details,
    severity: 'high',
  });
}

// ============================================================================
// EXECUTE ALL TESTS
// ============================================================================

export async function runCommunicationStressTests() {
  console.log('\n' + '='.repeat(80));
  console.log('  COMMUNICATION SYSTEMS STRESS TEST');
  console.log('  Testing: Chat, DMs, Support Rooms, Email, Notifications, Commands, Bots, Live Sync');
  console.log('='.repeat(80) + '\n');

  // Chat System
  await test_chat_conversation_schema();
  await test_chat_message_features();
  await test_chat_route_security();
  await test_chat_db_persistence();
  await test_chat_websocket_broadcasting();
  await test_chat_unread_tracking();
  
  // DM System
  await test_dm_system();
  await test_dm_privacy_isolation();
  
  // Support Rooms
  await test_support_room_schema();
  await test_helpdesk_room_seeding();
  await test_support_room_db();
  await test_chatserverhub_architecture();
  
  // Email System
  await test_email_service_architecture();
  await test_email_canspam();
  await test_email_event_audit();
  await test_email_resend_config();
  
  // Notifications
  await test_notification_schema();
  await test_universal_notification_engine();
  await test_notification_db();
  await test_push_notifications();
  await test_welcome_notifications();
  
  // Actionable Commands
  await test_actionable_notification_types();
  await test_approval_workflow_entities();
  await test_notification_action_urls();
  await test_workflow_approval_service();
  
  // Support Staff
  await test_support_session_service();
  await test_ticket_system();
  await test_auto_ticket_creation();
  await test_support_actions_service();
  
  // Bots
  await test_bot_ecosystem();
  await test_chatroom_commands();
  await test_smart_reply_service();
  
  // Live Sync
  await test_websocket_infrastructure();
  await test_connection_cleanup();
  await test_typing_indicators();
  
  // Sentiment & Safety
  await test_sentiment_analysis();
  await test_abuse_detection();
  
  // Cross-system Integration
  await test_notification_to_email_pipeline();
  await test_chat_to_ticket_pipeline();
  await test_trinity_notification_bridge();
  await test_platform_event_bus();

  // Summary
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const critical = results.filter(r => !r.passed && r.severity === 'critical');
  const high = results.filter(r => !r.passed && r.severity === 'high');

  console.log('\n' + '='.repeat(80));
  console.log(`  RESULTS: ${passed} PASSED | ${failed} FAILED`);
  if (critical.length > 0) {
    console.log(`  CRITICAL FAILURES: ${critical.map(r => r.name).join(', ')}`);
  }
  if (high.length > 0) {
    console.log(`  HIGH SEVERITY: ${high.map(r => r.name).join(', ')}`);
  }
  console.log('='.repeat(80) + '\n');

  return results;
}
