// ═══════════════════════════════════════════════════════════════
// Domain 9 of 15: Communications
// ═══════════════════════════════════════════════════════════════
// THE LAW: No new tables without Bryan's explicit approval. Zero DROP TABLE ever.
// Tables: 52

import { pgTable, varchar, text, integer, boolean, timestamp, jsonb, decimal, time, doublePrecision, index, uniqueIndex, primaryKey, unique, foreignKey, serial } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';
import {
  digestFrequencyEnum,
  emailFolderTypeEnum,
  emailPriorityEnum,
  internalEmailStatusEnum,
  notificationCategoryEnum,
  notificationScopeEnum,
  notificationTypeEnum,
  roomMemberRoleEnum,
  roomStatusEnum,
  shiftReminderTimingEnum,
} from '../../enums';

export const userMascotPreferences = pgTable("user_mascot_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique(),
  
  // Position preferences
  positionX: integer("position_x").default(0),
  positionY: integer("position_y").default(0),
  
  // Display settings
  isEnabled: boolean("is_enabled").default(true),
  isMinimized: boolean("is_minimized").default(false),
  preferredSize: varchar("preferred_size").default('default'), // 'small', 'default', 'large'
  
  // Behavior settings
  roamingEnabled: boolean("roaming_enabled").default(true),
  reactToActions: boolean("react_to_actions").default(true),
  showThoughts: boolean("show_thoughts").default(true),
  soundEnabled: boolean("sound_enabled").default(false),
  
  // Personalization
  nickname: varchar("nickname"), // User's custom name for the mascot
  favoriteEmotes: text("favorite_emotes").array().default(sql`ARRAY[]::text[]`),
  dislikedEmotes: text("disliked_emotes").array().default(sql`ARRAY[]::text[]`),
  
  // Interaction history summary
  totalInteractions: integer("total_interactions").default(0),
  totalDrags: integer("total_drags").default(0),
  totalTaps: integer("total_taps").default(0),
  lastInteractionAt: timestamp("last_interaction_at"),
  
  // Custom thoughts from AI
  customThoughts: text("custom_thoughts").array().default(sql`ARRAY[]::text[]`),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const chatConversations = pgTable("chat_conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),

  // Participants
  customerId: varchar("customer_id"),
  customerName: varchar("customer_name"),
  customerEmail: varchar("customer_email"),

  supportAgentId: varchar("support_agent_id"),
  supportAgentName: varchar("support_agent_name"),

  // Conversation metadata
  subject: varchar("subject"),
  status: varchar("status").notNull().default("active"), // 'active', 'resolved', 'closed'
  priority: varchar("priority").default("normal"), // 'low', 'normal', 'high', 'urgent'
  
  // Support ticket link (for automated ticket closure)
  associatedTicketId: varchar("associated_ticket_id"),
  
  conversationType: varchar("conversation_type").notNull().default("open_chat"), 
  // Types: 'dm_user' (user-to-user), 'dm_support' (support-to-user), 'dm_bot' (bot-to-user), 'dm_group' (group DM), 'open_chat' (Communications/monitored), 'shift_chat' (temporary shift chatroom)
  
  parentOrgId: varchar("parent_org_id"),
  allowedOrgIds: text("allowed_org_ids").array().default(sql`ARRAY[]::text[]`),
  isMutedForEndUsers: boolean("is_muted_for_end_users").default(false),
  mutedAt: timestamp("muted_at"),
  mutedBy: varchar("muted_by"),
  muteReason: varchar("mute_reason"),
  
  // Shift-specific chatroom (auto-created on clock-in, auto-closed on clock-out)
  shiftId: varchar("shift_id"),
  timeEntryId: varchar("time_entry_id"),
  
  // Workroom lifecycle management (Communications Platform Workroom Upgrade)
  autoCloseAt: timestamp("auto_close_at"), // Automatic room closure timestamp (shift end, etc.)
  visibility: varchar("visibility").default("workspace"), // 'workspace', 'public', 'private'
  helpdeskTicketId: varchar("helpdesk_ticket_id"), // Link to support ticket for helpdesk DMs
  
  // Encryption metadata for private DMs
  isEncrypted: boolean("is_encrypted").default(false), // True if messages are encrypted at rest
  encryptionKeyId: varchar("encryption_key_id"), // Reference to encryption key for this conversation

  // Voice/Silence permissions (IRC-style moderation)
  isSilenced: boolean("is_silenced").default(true), // Users start silenced until support grants voice
  voiceGrantedBy: varchar("voice_granted_by"),
  voiceGrantedAt: timestamp("voice_granted_at"),

  // Ratings (post-conversation)
  rating: integer("rating"), // 1-5 stars
  feedback: text("feedback"),

  // Session tracking
  lastMessageAt: timestamp("last_message_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
  closedAt: timestamp("closed_at"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("chat_conversations_workspace_status_idx").on(table.workspaceId, table.status),
]);

export const chatMessages = pgTable("chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  conversationId: varchar("conversation_id").notNull(),

  // Message details
  senderId: varchar("sender_id"),
  senderName: varchar("sender_name").notNull(),
  senderType: varchar("sender_type").notNull(), // 'customer', 'support', 'system', 'bot'

  // Content
  message: text("message").notNull(), // Plain text for open chat, encrypted for private DMs
  messageType: varchar("message_type").default("text"), // 'text', 'file', 'system', 'image', 'video', 'audio', 'voice'
  isSystemMessage: boolean("is_system_message").default(false), // For breach notifications and system announcements (shown in gray)
  
  // Encryption metadata
  isEncrypted: boolean("is_encrypted").default(false), // True if message content is encrypted
  encryptionIv: varchar("encryption_iv"), // Initialization vector for encryption

  // Private messages (DMs/Whispers)
  isPrivateMessage: boolean("is_private_message").default(false), // True for private/whispered messages
  recipientId: varchar("recipient_id"), // For direct messages to specific user

  // Threading support (Slack/Discord-style)
  parentMessageId: varchar("parent_message_id"), // References parent message if this is a reply
  threadId: varchar("thread_id"), // Groups messages in same thread
  replyCount: integer("reply_count").default(0), // Number of replies to this message

  // File attachments (enhanced)
  attachmentUrl: varchar("attachment_url"),
  attachmentName: varchar("attachment_name"),
  attachmentType: varchar("attachment_type"), // 'image', 'pdf', 'document', 'video'
  attachmentSize: integer("attachment_size"), // File size in bytes
  attachmentThumbnail: varchar("attachment_thumbnail"), // Thumbnail URL for images/videos

  // Rich text formatting
  isFormatted: boolean("is_formatted").default(false), // True if contains markdown/HTML
  formattedContent: text("formatted_content"), // Rendered HTML content

  // Mentions
  mentions: text("mentions").array().default(sql`ARRAY[]::text[]`), // Array of user IDs mentioned in message
  
  // Staff-only visibility (for internal announcements)
  visibleToStaffOnly: boolean("visible_to_staff_only").default(false),

  // Status
  isRead: boolean("is_read").default(false),
  readAt: timestamp("read_at"),
  isEdited: boolean("is_edited").default(false),
  editedAt: timestamp("edited_at"),
  isDeletedForEveryone: boolean("is_deleted_for_everyone").default(false),
  deletedForEveryoneAt: timestamp("deleted_for_everyone_at"),
  deletedForEveryoneBy: varchar("deleted_for_everyone_by"),
  deletedForUserIds: text("deleted_for_user_ids").array().default(sql`ARRAY[]::text[]`),
  isNonRespondable: boolean("is_non_respondable").default(false),

  // Sentiment Analysis (AI-driven emotional/urgency detection)
  sentiment: varchar("sentiment"), // 'positive', 'neutral', 'negative', 'urgent'
  sentimentScore: decimal("sentiment_score", { precision: 5, scale: 2 }), // -100 to +100 (negative to positive)
  sentimentConfidence: decimal("sentiment_confidence", { precision: 5, scale: 2 }), // 0-100 (confidence level)
  urgencyLevel: integer("urgency_level"), // 1-5 (1=low, 5=critical)
  shouldEscalate: boolean("should_escalate").default(false), // Flag for urgent/negative messages
  sentimentAnalyzedAt: timestamp("sentiment_analyzed_at"), // When sentiment was analyzed

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  // Existing indexes
  index("chat_messages_conversation_idx").on(table.conversationId),
  index("chat_messages_thread_idx").on(table.threadId),
  index("chat_messages_parent_idx").on(table.parentMessageId),
  
  // New performance indexes for chat enhancements
  index("chat_messages_conversation_created_idx").on(table.conversationId, table.createdAt), // Chronological retrieval
  index("chat_messages_sender_idx").on(table.senderId), // User message history
  index("chat_messages_unread_idx").on(table.isRead, table.createdAt), // Unread message queries
  index("chat_messages_recipient_idx").on(table.recipientId), // DM recipient lookups
  
  // Sentiment analysis indexes
  index("chat_messages_sentiment_idx").on(table.sentiment), // Query by sentiment
  index("chat_messages_should_escalate_idx").on(table.shouldEscalate), // Query urgent messages
]);

export const messageReactions = pgTable("message_reactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  messageId: varchar("message_id").notNull(),
  userId: varchar("user_id").notNull(),
  emoji: varchar("emoji", { length: 50 }).notNull(), // Unicode emoji or custom emoji code
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  reactionType: varchar("reaction_type"),
}, (table) => ({
  messageUserIdx: index("message_reactions_message_user_idx").on(table.messageId, table.userId),
  uniqueReaction: uniqueIndex("message_reactions_unique").on(table.messageId, table.userId, table.emoji),
}));

export const messageReadReceipts = pgTable("message_read_receipts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  messageId: varchar("message_id").notNull(),
  userId: varchar("user_id").notNull(),
  readAt: timestamp("read_at").defaultNow(),
}, (table) => ({
  messageUserIdx: uniqueIndex("message_read_receipts_unique").on(table.messageId, table.userId),
}));

export const chatMacros = pgTable("chat_macros", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  
  // Macro details
  title: varchar("title").notNull(),
  content: text("content").notNull(),
  shortcut: varchar("shortcut"), // e.g., "/welcome", "/refund"
  category: varchar("category").notNull(), // 'greeting', 'closing', 'technical', 'billing'
  
  // Metadata
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("chat_macros_workspace_idx").on(table.workspaceId),
  index("chat_macros_category_idx").on(table.category),
  uniqueIndex("chat_macros_shortcut_unique").on(table.workspaceId, table.shortcut),
]);

export const typingIndicators = pgTable("typing_indicators", {
  conversationId: varchar("conversation_id").notNull(),
  workspaceId: varchar("workspace_id"),
  userId: varchar("user_id").notNull(),
  userName: varchar("user_name").notNull(),
  startedAt: timestamp("started_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  id: varchar("id").default(sql`gen_random_uuid()`),
}, (table) => ({
  pk: primaryKey({ columns: [table.conversationId, table.userId] }),
  conversationIdx: index("typing_indicators_conversation_idx").on(table.conversationId),
}));

export const chatUploads = pgTable("chat_uploads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  
  // Uploader details
  uploaderId: varchar("uploader_id").notNull(),
  uploaderName: varchar("uploader_name").notNull(),
  
  // Link to conversation and message
  conversationId: varchar("conversation_id"),
  messageId: varchar("message_id"),
  
  // File metadata
  filename: varchar("filename").notNull(), // Sanitized storage filename
  originalFilename: varchar("original_filename").notNull(), // User's original filename
  mimeType: varchar("mime_type").notNull(),
  fileSize: integer("file_size").notNull(), // Bytes
  storageUrl: varchar("storage_url").notNull(), // Object storage path or URL
  thumbnailUrl: varchar("thumbnail_url"), // For images/videos
  
  // Security scanning
  isScanned: boolean("is_scanned").default(false),
  scanStatus: varchar("scan_status").default("pending"), // 'pending', 'clean', 'infected', 'error'
  scanResult: text("scan_result"), // Scan details or error message
  
  // Retention policy
  expiresAt: timestamp("expires_at"), // Auto-delete timestamp
  isDeleted: boolean("is_deleted").default(false),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  isPublic: boolean("is_public").default(false),
}, (table) => [
  index("chat_uploads_conversation_idx").on(table.conversationId),
  index("chat_uploads_uploader_idx").on(table.uploaderId),
  index("chat_uploads_workspace_idx").on(table.workspaceId),
  uniqueIndex("chat_uploads_storage_unique").on(table.workspaceId, table.storageUrl),
]);

export const roomEvents = pgTable("room_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  conversationId: varchar("conversation_id").notNull(),
  
  // Actor details
  actorId: varchar("actor_id"),
  actorName: varchar("actor_name").notNull(),
  actorRole: varchar("actor_role").notNull(), // User's role at time of action
  
  // Event details
  eventType: varchar("event_type").notNull(),
  // Types: 'room_created', 'room_closed', 'room_archived', 'user_joined', 'user_left', 
  //        'user_muted', 'user_unmuted', 'user_kicked', 'voice_granted', 'voice_revoked',
  //        'file_uploaded', 'message_deleted', 'voice_session_started', 'voice_session_ended'
  
  eventPayload: jsonb("event_payload"), // Additional structured data
  description: text("description"), // Human-readable event description
  
  // Context
  ipAddress: varchar("ip_address"),
  userAgent: text("user_agent"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("room_events_conversation_created_idx").on(table.conversationId, table.createdAt), // Chronological replay
  index("room_events_actor_idx").on(table.actorId),
  index("room_events_type_idx").on(table.eventType),
  index("room_events_workspace_idx").on(table.workspaceId),
]);

export const dmAuditRequests = pgTable("dm_audit_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  
  // Investigation details
  conversationId: varchar("conversation_id").notNull(),
  investigationReason: text("investigation_reason").notNull(), // Legal/compliance reason for access
  caseNumber: varchar("case_number"), // Optional case/ticket reference
  
  // Request details
  requestedBy: varchar("requested_by").notNull(),
  requestedByName: varchar("requested_by_name").notNull(),
  requestedByEmail: varchar("requested_by_email").notNull(),
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
  
  // Approval workflow
  status: varchar("status").notNull().default("pending"), // 'pending', 'approved', 'denied'
  approvedBy: varchar("approved_by"),
  approvedByName: varchar("approved_by_name"),
  approvedAt: timestamp("approved_at"),
  deniedReason: text("denied_reason"),
  
  // Access control
  expiresAt: timestamp("expires_at"), // When access expires
  isActive: boolean("is_active").default(true),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const dmAccessLogs = pgTable("dm_access_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // What was accessed
  conversationId: varchar("conversation_id").notNull(),
  auditRequestId: varchar("audit_request_id"),
  
  // Who accessed
  accessedBy: varchar("accessed_by").notNull(),
  accessedByName: varchar("accessed_by_name").notNull(),
  accessedByEmail: varchar("accessed_by_email").notNull(),
  accessedByRole: varchar("accessed_by_role").notNull(), // 'owner', 'admin', 'compliance_officer'
  
  // When and why
  accessedAt: timestamp("accessed_at").defaultNow().notNull(),
  accessReason: text("access_reason").notNull(), // Copy of investigation reason
  
  // Context
  ipAddress: varchar("ip_address"),
  userAgent: varchar("user_agent"),
  
  // Metadata
  messagesViewed: integer("messages_viewed").default(0), // Count of messages decrypted
  filesAccessed: integer("files_accessed").default(0), // Count of files accessed
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  workspaceId: varchar("workspace_id"),
});

export const conversationEncryptionKeys = pgTable("conversation_encryption_keys", {
  id: varchar("id").primaryKey(), // Key ID (UUID)
  conversationId: varchar("conversation_id").notNull().unique(),
  workspaceId: varchar("workspace_id").notNull(),
  
  // Encrypted key material (wrapped with master key in production)
  keyMaterial: text("key_material").notNull(), // Base64-encoded encryption key
  algorithm: varchar("algorithm").notNull().default("aes-256-gcm"),
  
  // Key metadata
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at"),
  
  // Key rotation support
  isActive: boolean("is_active").default(true),
  rotatedAt: timestamp("rotated_at"),
  replacedBy: varchar("replaced_by"),

  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
});

export const chatParticipants = pgTable("chat_participants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull(),
  workspaceId: varchar("workspace_id").notNull(),
  
  // Participant info
  participantId: varchar("participant_id").notNull(), // Employee or manager
  participantName: varchar("participant_name").notNull(),
  participantEmail: varchar("participant_email"),
  participantRole: varchar("participant_role").notNull().default("member"), // 'owner', 'admin', 'member', 'guest'
  
  // Permissions
  canSendMessages: boolean("can_send_messages").default(true),
  canViewHistory: boolean("can_view_history").default(true),
  canInviteOthers: boolean("can_invite_others").default(false),
  
  // Invitation details
  invitedBy: varchar("invited_by"),
  invitedAt: timestamp("invited_at").defaultNow(),
  joinedAt: timestamp("joined_at"),
  leftAt: timestamp("left_at"),
  
  // UI state (for multi-bubble chat interface)
  isMinimized: boolean("is_minimized").default(false), // Is chat minimized to a bubble?
  bubblePosition: integer("bubble_position"), // Order in bubble tray
  lastReadAt: timestamp("last_read_at"), // Last message read timestamp
  isMuted: boolean("is_muted").default(false), // Has muted notifications?
  
  // Status
  isActive: boolean("is_active").default(true),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const blockedContacts = pgTable("blocked_contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  blockerId: varchar("blocker_id").notNull(),
  blockedUserId: varchar("blocked_user_id").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow(),

  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
}, (table) => [
  uniqueIndex("blocked_contacts_unique").on(table.blockerId, table.blockedUserId),
  index("blocked_contacts_blocker_idx").on(table.blockerId),
  index("blocked_contacts_blocked_idx").on(table.blockedUserId),
  index("blocked_contacts_workspace_idx").on(table.workspaceId),
]);

export const conversationUserState = pgTable("conversation_user_state", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull(),
  userId: varchar("user_id").notNull(),
  workspaceId: varchar("workspace_id").notNull(),
  isHidden: boolean("is_hidden").default(false),
  hasLeft: boolean("has_left").default(false),
  isArchived: boolean("is_archived").default(false),
  isPinned: boolean("is_pinned").default(false),
  isMuted: boolean("is_muted").default(false),
  lastReadMessageId: varchar("last_read_message_id"),
  lastReadAt: timestamp("last_read_at"),
  hiddenAt: timestamp("hidden_at"),
  leftAt: timestamp("left_at"),
  archivedAt: timestamp("archived_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("conversation_user_state_unique").on(table.conversationId, table.userId),
  index("conversation_user_state_user_idx").on(table.userId),
  index("conversation_user_state_conversation_idx").on(table.conversationId),
  index("conversation_user_state_workspace_idx").on(table.workspaceId),
]);

export const messageDeletedFor = pgTable("message_deleted_for", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  messageId: varchar("message_id").notNull(),
  userId: varchar("user_id").notNull(),
  deletedAt: timestamp("deleted_at").defaultNow(),
}, (table) => [
  uniqueIndex("message_deleted_for_unique").on(table.messageId, table.userId),
  index("message_deleted_for_message_idx").on(table.messageId),
  index("message_deleted_for_user_idx").on(table.userId),
]);

export const emailTemplates = pgTable("email_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),

  // Template metadata
  name: varchar("name").notNull(),
  targetIndustry: varchar("target_industry"), // 'security', 'healthcare', 'cleaning', etc. (null = general)
  category: varchar("category").notNull(), // 'cold_outreach', 'follow_up', 'demo_invitation', 'proposal', 'nurture'

  // Email content
  subject: varchar("subject").notNull(),
  bodyTemplate: text("body_template").notNull(), // Supports {{variables}} for personalization

  // AI personalization
  useAI: boolean("use_ai").default(true), // Use OpenAI to personalize
  aiPrompt: text("ai_prompt"), // Instructions for AI personalization

  // Status
  isActive: boolean("is_active").default(true),

  // Performance metrics
  timesSent: integer("times_sent").default(0),
  openRate: decimal("open_rate", { precision: 5, scale: 2 }),
  responseRate: decimal("response_rate", { precision: 5, scale: 2 }),

  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const emailSends = pgTable("email_sends", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // Relationships
  campaignId: varchar("campaign_id"),
  leadId: varchar("lead_id").notNull(),
  templateId: varchar("template_id").notNull(),

  // Email details
  toEmail: varchar("to_email").notNull(),
  subject: varchar("subject").notNull(),
  bodyHtml: text("body_html").notNull(),
  bodyText: text("body_text"),

  // Delivery status
  status: varchar("status").default("pending"), // 'pending', 'sent', 'delivered', 'opened', 'clicked', 'replied', 'bounced', 'failed'

  // Tracking
  sentAt: timestamp("sent_at"),
  deliveredAt: timestamp("delivered_at"),
  openedAt: timestamp("opened_at"),
  clickedAt: timestamp("clicked_at"),
  repliedAt: timestamp("replied_at"),

  // External IDs (from email service provider)
  externalId: varchar("external_id"), // Resend message ID
  errorMessage: text("error_message"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  workspaceId: varchar("workspace_id"),
});

export const emailSequences = pgTable("email_sequences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // Sequence details
  name: varchar("name").notNull(),
  description: text("description"),

  // Steps configuration
  steps: jsonb("steps").notNull(), // Array of {delay_days, template_id, subject, body}

  // Targeting
  targetIndustry: varchar("target_industry"),

  // Throttling
  dailySendLimit: integer("daily_send_limit").default(100),
  sendWindow: jsonb("send_window"), // {start_hour: 9, end_hour: 17}

  // Status
  status: varchar("status").default("active"), // 'active', 'paused', 'archived'

  // Performance
  totalEnrolled: integer("total_enrolled").default(0),
  totalCompleted: integer("total_completed").default(0),

  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  workspaceId: varchar("workspace_id"),
});

export const sequenceSends = pgTable("sequence_sends", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // Relationships
  sequenceId: varchar("sequence_id").notNull(),
  leadId: varchar("lead_id"),
  dealId: varchar("deal_id"),

  // Step tracking
  currentStep: integer("current_step").default(1),
  totalSteps: integer("total_steps").notNull(),

  // Status
  status: varchar("status").default("active"), // 'active', 'completed', 'paused', 'replied', 'unsubscribed'

  // Email tracking
  lastSentAt: timestamp("last_sent_at"),
  nextSendAt: timestamp("next_send_at"),

  // Engagement
  replied: boolean("replied").default(false),
  repliedAt: timestamp("replied_at"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  workspaceId: varchar("workspace_id"),
});

export const motdMessages = pgTable("motd_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),

  // Content
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),

  // Display settings
  isActive: boolean("is_active").default(true),
  requiresAcknowledgment: boolean("requires_acknowledgment").default(true),
  displayOrder: integer("display_order").default(0), // For multiple MOTD priority

  // Styling
  backgroundColor: varchar("background_color").default("#1e3a8a"), // Navy blue default
  textColor: varchar("text_color").default("#ffffff"), // White text default
  iconName: varchar("icon_name").default("bell"), // Lucide icon name

  // Scheduling (optional)
  startsAt: timestamp("starts_at"),
  endsAt: timestamp("ends_at"),

  // Staff info
  createdBy: varchar("created_by"),
  updatedBy: varchar("updated_by"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const motdAcknowledgment = pgTable("motd_acknowledgment", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  motdId: varchar("motd_id").notNull(),
  userId: varchar("user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("motd_acknowledgment_motd_user_idx").on(table.motdId, table.userId),
  uniqueIndex("motd_acknowledgment_unique_idx").on(table.motdId, table.userId),
]);

export const chatAgreementAcceptances = pgTable("chat_agreement_acceptances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // User/Ticket tracking
  userId: varchar("user_id"),
  ticketId: varchar("ticket_id"),
  sessionId: varchar("session_id"), // Browser session tracking

  // Agreement details
  agreementVersion: varchar("agreement_version").notNull().default("1.0"), // Track version changes
  fullName: varchar("full_name"), // Typed signature name (optional)
  agreedToTerms: boolean("agreed_to_terms").notNull().default(false),

  // Evidence tracking (compliance vault)
  ipAddress: varchar("ip_address"), // User's IP at time of acceptance
  userAgent: text("user_agent"), // Browser/device info
  acceptedAt: timestamp("accepted_at").defaultNow(),

  // Chat context
  roomSlug: varchar("room_slug").notNull(), // 'helpdesk', 'emergency', etc.
  platformRole: varchar("platform_role"), // User's role at time of acceptance

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const organizationChatRooms = pgTable("organization_chat_rooms", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  
  // Room identification
  roomName: varchar("room_name").notNull(), // "Customer Support", "Main Office", etc.
  roomSlug: varchar("room_slug").notNull(), // URL-friendly: "customer-support", "main-office"
  description: text("description"),
  
  // Room status
  status: roomStatusEnum("status").default("active"),
  suspendedReason: text("suspended_reason"),
  suspendedAt: timestamp("suspended_at"),
  suspendedBy: varchar("suspended_by"), // Support staff who suspended
  
  // Associated chat conversation (links to existing chat system)
  conversationId: varchar("conversation_id"),
  
  // Onboarding status
  isOnboarded: boolean("is_onboarded").default(false),
  onboardedAt: timestamp("onboarded_at"),
  onboardedBy: varchar("onboarded_by"),
  
  // Settings
  allowGuests: boolean("allow_guests").default(true), // Allow end customers
  requireApproval: boolean("require_approval").default(false), // Require approval to join
  maxMembers: integer("max_members").default(100),
  
  // Metadata
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceIdx: index("org_chat_rooms_workspace_idx").on(table.workspaceId),
  statusIdx: index("org_chat_rooms_status_idx").on(table.status),
  slugIdx: uniqueIndex("org_chat_rooms_slug_idx").on(table.workspaceId, table.roomSlug),
}));

export const organizationChatChannels = pgTable("organization_chat_channels", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  roomId: varchar("room_id").notNull(),
  workspaceId: varchar("workspace_id").notNull(),
  
  // Channel identification
  channelName: varchar("channel_name").notNull(), // "Weekly Meetings", "IT Department", etc.
  channelSlug: varchar("channel_slug").notNull(), // "weekly-meetings", "it-department"
  description: text("description"),
  channelType: varchar("channel_type").default("general"), // "general", "meeting", "department", "project"
  
  // Associated chat conversation
  conversationId: varchar("conversation_id"),
  
  // Settings
  isPrivate: boolean("is_private").default(false), // Private channels require invitation
  allowGuests: boolean("allow_guests").default(false), // Override room setting
  
  // Metadata
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  roomIdx: index("org_chat_channels_room_idx").on(table.roomId),
  workspaceIdx: index("org_chat_channels_workspace_idx").on(table.workspaceId),
  slugIdx: uniqueIndex("org_chat_channels_slug_idx").on(table.roomId, table.channelSlug),
}));

export const organizationRoomMembers = pgTable("organization_room_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  roomId: varchar("room_id").notNull(),
  userId: varchar("user_id").notNull(),
  workspaceId: varchar("workspace_id").notNull(),
  
  // Role and permissions
  role: roomMemberRoleEnum("role").default("member"),
  canInvite: boolean("can_invite").default(false),
  canManage: boolean("can_manage").default(false), // Can edit room settings
  
  // Join tracking
  joinedAt: timestamp("joined_at").defaultNow(),
  lastActiveAt: timestamp("last_active_at"),
  
  // Approval workflow
  isApproved: boolean("is_approved").default(true), // Auto-approved unless room requires approval
  approvedBy: varchar("approved_by"),
  approvedAt: timestamp("approved_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  roomIdx: index("org_room_members_room_idx").on(table.roomId),
  userIdx: index("org_room_members_user_idx").on(table.userId),
  workspaceIdx: index("org_room_members_workspace_idx").on(table.workspaceId),
  uniqueMember: uniqueIndex("org_room_members_unique_idx").on(table.roomId, table.userId),
}));

export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Scope determines routing and validation rules
  scope: notificationScopeEnum("scope").notNull().default('workspace'),
  
  // Category for filtering (system, chat, whats_new, alerts, activity)
  category: notificationCategoryEnum("category").default('activity'),
  
  // workspaceId is nullable for user-scoped and global notifications
  workspaceId: varchar("workspace_id"),
  userId: varchar("user_id").notNull(),
  
  // Notification content
  type: notificationTypeEnum("type").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  
  // Status - three states: unread, read (acknowledged), cleared (dismissed permanently)
  isRead: boolean("is_read").default(false),
  readAt: timestamp("read_at"),
  isAcknowledged: boolean("is_acknowledged").default(false),
  acknowledgedAt: timestamp("acknowledged_at"),
  clearedAt: timestamp("cleared_at"), // When null = visible; when set = permanently dismissed
  
  // Navigation
  actionUrl: varchar("action_url", { length: 500 }), // Where to go when clicked
  
  // Related entities (for tracking what triggered the notification)
  relatedEntityType: varchar("related_entity_type", { length: 100 }), // e.g., 'shift', 'employee', 'document'
  relatedEntityId: varchar("related_entity_id"), // ID of the related entity
  
  // For What's New / Platform Updates - links to change event
  changeEventId: varchar("change_event_id"), // Reference to platform change/patch
  
  // Metadata
  metadata: jsonb("metadata"), // Additional data (shift details, document name, AI summary, etc.)
  
  // Audit
  createdBy: varchar("created_by"), // Who triggered this notification
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userIdx: index("notifications_user_idx").on(table.userId),
  workspaceIdx: index("notifications_workspace_idx").on(table.workspaceId),
  scopeIdx: index("notifications_scope_idx").on(table.scope),
  categoryIdx: index("notifications_category_idx").on(table.category),
  isReadIdx: index("notifications_is_read_idx").on(table.isRead),
  createdAtIdx: index("notifications_created_at_idx").on(table.createdAt),
  typeIdx: index("notifications_type_idx").on(table.type),
  clearedAtIdx: index("notifications_cleared_at_idx").on(table.clearedAt),
  userScopeIdx: index("notifications_user_scope_idx").on(table.userId, table.scope),
  userCategoryClearedIdx: index("notifications_user_category_cleared_idx").on(table.userId, table.category, table.isRead, table.clearedAt),
  notificationsUserIsReadIdx: index("notifications_user_is_read_idx").on(table.userId, table.isRead),
}));


export const pushSubscriptions = pgTable("push_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  userId: varchar("user_id").notNull(),
  
  endpoint: text("endpoint").notNull(),
  p256dhKey: text("p256dh_key").notNull(),
  authKey: text("auth_key").notNull(),
  
  isActive: boolean("is_active").default(true).notNull(),
  userAgent: text("user_agent"),
  platform: varchar("platform", { length: 50 }),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userIdx: index("push_subscriptions_user_idx").on(table.userId),
  endpointIdx: index("push_subscriptions_endpoint_idx").on(table.endpoint),
  activeIdx: index("push_subscriptions_active_idx").on(table.isActive),
}));

export const userNotificationPreferences = pgTable("user_notification_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique(),
  workspaceId: varchar("workspace_id").notNull(),
  
  // Digest settings
  digestFrequency: digestFrequencyEnum("digest_frequency").notNull().default('realtime'),
  enableAiSummarization: boolean("enable_ai_summarization").default(true), // Use Gemini to summarize
  
  // Notification type filters (which types to include in digests)
  enabledTypes: jsonb("enabled_types").$type<string[]>().default(sql`'[]'::jsonb`), // Empty = all types
  
  // Delivery channel preferences
  preferEmail: boolean("prefer_email").default(false), // Also send digest via email
  enableEmail: boolean("enable_email").default(true), // Enable email notifications
  enableSms: boolean("enable_sms").default(false), // Enable SMS notifications (requires Twilio)
  enablePush: boolean("enable_push").default(true), // Enable push/in-app notifications
  
  // SMS configuration
  smsPhoneNumber: varchar("sms_phone_number"), // User's phone number for SMS
  smsVerified: boolean("sms_verified").default(false), // Whether phone is verified
  smsOptOut: boolean("sms_opt_out").default(false), // User opted out of SMS
  
  // Shift reminder settings
  enableShiftReminders: boolean("enable_shift_reminders").default(true), // Enable shift reminders
  shiftReminderTiming: shiftReminderTimingEnum("shift_reminder_timing").default('1hour'), // When to send reminder
  shiftReminderCustomMinutes: integer("shift_reminder_custom_minutes"), // Custom minutes if timing='custom'
  shiftReminderChannels: jsonb("shift_reminder_channels").$type<string[]>().default(sql`'["push", "email"]'::jsonb`), // Channels: push, email, sms
  
  // Schedule change notifications
  enableScheduleChangeNotifications: boolean("enable_schedule_change_notifications").default(true),
  scheduleChangeChannels: jsonb("schedule_change_channels").$type<string[]>().default(sql`'["push", "email"]'::jsonb`),
  
  // Approval notifications
  enableApprovalNotifications: boolean("enable_approval_notifications").default(true),
  approvalNotificationChannels: jsonb("approval_notification_channels").$type<string[]>().default(sql`'["push", "email"]'::jsonb`),
  
  // Quiet hours
  quietHoursStart: integer("quiet_hours_start"), // 0-23 hour (null = disabled)
  quietHoursEnd: integer("quiet_hours_end"), // 0-23 hour
  
  // AI optimization
  aiOptimizedTiming: boolean("ai_optimized_timing").default(false), // Let AI learn best reminder times
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  notificationType: varchar("notification_type"),
  enabled: boolean("enabled").default(true),
  deliveryMethod: varchar("delivery_method"),
}, (table) => ({
  userWorkspaceIdx: index("user_notification_preferences_user_workspace_idx").on(table.userId, table.workspaceId),
}));

export const chatConnections = pgTable("chat_connections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  sessionId: varchar("session_id", { length: 255 }).notNull().unique(),
  workspaceId: varchar("workspace_id").notNull().default('system'),

  // Connection lifecycle
  connectedAt: timestamp("connected_at").defaultNow(),
  disconnectedAt: timestamp("disconnected_at"),

  // Client info
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),

  // Disconnect tracking
  disconnectReason: varchar("disconnect_reason", { length: 50 }),

  updatedAt: timestamp("updated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userConnectedIdx: index("chat_connections_user_connected_idx").on(table.userId, table.connectedAt),
  workspaceIdx: index("idx_chat_connections_workspace_id").on(table.workspaceId),
}));

export const emailEvents = pgTable("email_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  userId: varchar("user_id"),
  emailType: varchar("email_type").notNull(), // 'verification', 'password_reset', 'support_ticket', 'report_delivery', etc.
  recipientEmail: varchar("recipient_email").notNull(),
  status: varchar("status").notNull(), // 'pending', 'sent', 'failed', 'bounced'
  resendId: varchar("resend_id"), // Resend message ID for tracking
  errorMessage: text("error_message"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("email_events_workspace_idx").on(table.workspaceId),
  index("email_events_user_idx").on(table.userId),
  index("email_events_type_idx").on(table.emailType),
  index("email_events_status_idx").on(table.status),
  index("email_events_created_idx").on(table.createdAt),
]);

export const emailUnsubscribes = pgTable("email_unsubscribes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email", { length: 255 }).notNull(),
  workspaceId: varchar("workspace_id"),

  // Unsubscribe categories (granular opt-out)
  unsubscribeAll: boolean("unsubscribe_all").default(false), // Global opt-out
  unsubscribeMarketing: boolean("unsubscribe_marketing").default(false),
  unsubscribeNotifications: boolean("unsubscribe_notifications").default(false),
  unsubscribeDigests: boolean("unsubscribe_digests").default(false),

  // Token for one-click unsubscribe (RFC 8058)
  unsubscribeToken: varchar("unsubscribe_token", { length: 64 }).notNull(),

  // Audit trail
  unsubscribedAt: timestamp("unsubscribed_at").defaultNow(),
  unsubscribeSource: varchar("unsubscribe_source", { length: 50 }).default('email_link'), // 'email_link', 'preferences', 'api', 'manual'
  unsubscribeReason: text("unsubscribe_reason"),
  ipAddress: varchar("ip_address", { length: 45 }), // IPv4 or IPv6
  userAgent: text("user_agent"),

  // Resubscribe tracking
  resubscribedAt: timestamp("resubscribed_at"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("email_unsubscribes_email_idx").on(table.email),
  index("email_unsubscribes_workspace_idx").on(table.workspaceId),
  index("email_unsubscribes_token_idx").on(table.unsubscribeToken),
  uniqueIndex("email_unsubscribes_email_workspace_idx").on(table.email, table.workspaceId),
]);

export const internalMailboxes = pgTable("internal_mailboxes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  workspaceId: varchar("workspace_id"),
  
  // Virtual email address (e.g., john.doe@coaileague.internal)
  emailAddress: varchar("email_address").notNull().unique(),
  displayName: varchar("display_name"), // "John Doe" or "Support Team"
  
  // Mailbox type
  mailboxType: varchar("mailbox_type").notNull().default('personal'), // personal, shared, system, department
  
  // Settings
  autoReply: boolean("auto_reply").default(false),
  autoReplyMessage: text("auto_reply_message"),
  signature: text("signature"),
  
  // Statistics
  unreadCount: integer("unread_count").default(0),
  totalMessages: integer("total_messages").default(0),
  
  // Status
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("internal_mailboxes_user_idx").on(table.userId),
  index("internal_mailboxes_workspace_idx").on(table.workspaceId),
  index("internal_mailboxes_email_idx").on(table.emailAddress),
]);

export const internalEmailFolders = pgTable("internal_email_folders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  mailboxId: varchar("mailbox_id").notNull(),
  
  name: varchar("name").notNull(),
  folderType: emailFolderTypeEnum("folder_type").notNull().default('custom'),
  color: varchar("color"), // Hex color for UI
  icon: varchar("icon"), // Icon name for UI
  
  // Hierarchy
  parentFolderId: varchar("parent_folder_id"),
  sortOrder: integer("sort_order").default(0),
  
  // Statistics
  messageCount: integer("message_count").default(0),
  unreadCount: integer("unread_count").default(0),
  
  isSystem: boolean("is_system").default(false), // System folders can't be deleted
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("internal_email_folders_mailbox_idx").on(table.mailboxId),
  index("internal_email_folders_type_idx").on(table.folderType),
]);

export const internalEmails = pgTable("internal_emails", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  
  // Sender
  fromMailboxId: varchar("from_mailbox_id"),
  fromAddress: varchar("from_address").notNull(), // Can be internal or external
  fromName: varchar("from_name"),
  
  // Recipients (stored as JSON arrays for multiple recipients)
  toAddresses: text("to_addresses").notNull(), // JSON array of email addresses
  ccAddresses: text("cc_addresses"), // JSON array
  bccAddresses: text("bcc_addresses"), // JSON array
  
  // Email content
  subject: varchar("subject", { length: 500 }),
  bodyText: text("body_text"), // Plain text version
  bodyHtml: text("body_html"), // HTML version
  
  // Threading
  threadId: varchar("thread_id"), // For conversation threading
  inReplyTo: varchar("in_reply_to"), // Reference to parent email ID
  
  // Metadata
  priority: emailPriorityEnum("priority").default('normal'),
  isInternal: boolean("is_internal").default(true), // true = internal, false = external via Resend
  
  // External email tracking (when sent via Resend)
  externalId: varchar("external_id"), // Resend message ID
  externalStatus: varchar("external_status"), // Resend delivery status
  
  // Attachments (stored as JSON array of file references)
  attachments: text("attachments"), // JSON array of {fileName, fileUrl, fileSize, mimeType}
  
  // Trinity AI Enhancement
  aiSummary: text("ai_summary"),
  aiCategory: varchar("ai_category", { length: 50 }),
  aiPriority: integer("ai_priority"),
  aiSentiment: varchar("ai_sentiment", { length: 20 }),
  aiActionItems: text("ai_action_items"), // JSON array of action items
  enhancedByTrinity: boolean("enhanced_by_trinity").default(false),
  
  // Timestamps
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  folderData: jsonb("folder_data").default('{}'),
}, (table) => [
  index("internal_emails_from_idx").on(table.fromMailboxId),
  index("internal_emails_thread_idx").on(table.threadId),
  index("internal_emails_sent_idx").on(table.sentAt),
  index("internal_emails_created_idx").on(table.createdAt),
  index("internal_emails_ai_priority_idx").on(table.aiPriority),
  index("internal_emails_enhanced_idx").on(table.enhancedByTrinity),
  foreignKey({
    columns: [table.inReplyTo],
    foreignColumns: [table.id],
    name: "internal_emails_reply_fk",
  }).onDelete('set null'),
]);

export const internalEmailRecipients = pgTable("internal_email_recipients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  emailId: varchar("email_id").notNull(),
  mailboxId: varchar("mailbox_id").notNull(),
  
  // Recipient type
  recipientType: varchar("recipient_type").notNull().default('to'), // to, cc, bcc
  
  // Folder location
  folderId: varchar("folder_id"),
  
  // Status
  status: internalEmailStatusEnum("status").notNull().default('delivered'),
  isRead: boolean("is_read").default(false),
  isStarred: boolean("is_starred").default(false),
  isImportant: boolean("is_important").default(false),
  
  // Timestamps
  readAt: timestamp("read_at"),
  archivedAt: timestamp("archived_at"),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("internal_email_recipients_email_idx").on(table.emailId),
  index("internal_email_recipients_mailbox_idx").on(table.mailboxId),
  index("internal_email_recipients_folder_idx").on(table.folderId),
  index("internal_email_recipients_status_idx").on(table.status),
  index("internal_email_recipients_unread_idx").on(table.isRead),
]);

export const roomAnalytics = pgTable("room_analytics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  
  // Room identification
  roomType: varchar("room_type").notNull(), // 'support', 'work', 'meeting', 'org'
  conversationId: varchar("conversation_id").notNull(), // Reference to chatConversations.id
  roomName: varchar("room_name"), // Display name of the room
  
  // Message metrics
  totalMessages: integer("total_messages").default(0), // Cumulative message count
  messageCountToday: integer("message_count_today").default(0), // Messages posted today
  messageCountThisWeek: integer("message_count_this_week").default(0), // Messages this week
  
  // Participant activity
  totalParticipants: integer("total_participants").default(0), // Unique users who ever participated
  activeParticipantsNow: integer("active_participants_now").default(0), // Currently in room
  newParticipantsToday: integer("new_participants_today").default(0), // Joined today
  
  // Support metrics (for support rooms)
  ticketsCreated: integer("tickets_created").default(0), // Total support tickets
  ticketsResolved: integer("tickets_resolved").default(0), // Resolved tickets
  avgResolutionTimeHours: doublePrecision("avg_resolution_time_hours"), // Average time to resolve
  unresovledTickets: integer("unresolved_tickets").default(0), // Currently unresolved
  
  // AI metrics
  aiEscalationCount: integer("ai_escalation_count").default(0), // Times AI escalated to human
  aiEscalationRate: doublePrecision("ai_escalation_rate").default(0), // Percentage of interactions escalated
  aiResponseCount: integer("ai_response_count").default(0), // Times AI provided response
  
  // Sentiment analysis
  sentimentPositive: integer("sentiment_positive").default(0), // Positive sentiment messages
  sentimentNeutral: integer("sentiment_neutral").default(0), // Neutral sentiment messages
  sentimentNegative: integer("sentiment_negative").default(0), // Negative sentiment messages
  averageSentimentScore: doublePrecision("average_sentiment_score"), // -1 to 1 scale
  
  // Room status
  status: varchar("status").notNull(), // 'active', 'archived', 'closed'
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  roomId: varchar("room_id"),
  periodStart: timestamp("period_start").default(sql`now()`),
  periodEnd: timestamp("period_end").default(sql`now()`),
  uniqueParticipants: integer("unique_participants").default(0),
  participantCountToday: integer("participant_count_today").default(0),
  peakConcurrentUsers: integer("peak_concurrent_users").default(0),
  activeSessions: integer("active_sessions").default(0),
  averageSessionDuration: integer("average_session_duration").default(0),
  averageResponseTime: integer("average_response_time").default(0),
  avgResponseTimeMs: integer("avg_response_time_ms").default(0),
  avgWaitTimeMs: integer("avg_wait_time_ms").default(0),
  firstResponseTimeAvg: integer("first_response_time_avg").default(0),
  // @ts-expect-error — TS migration: fix in refactoring sprint
  resolutionRate: decimal("resolution_rate").default(0),
  // @ts-expect-error — TS migration: fix in refactoring sprint
  escalationRate: decimal("escalation_rate").default(0),
  satisfactionScore: decimal("satisfaction_score"),
  staffMessages: integer("staff_messages").default(0),
  userMessages: integer("user_messages").default(0),
  systemMessages: integer("system_messages").default(0),
  aiMessages: integer("ai_messages").default(0),
  sentimentVeryNegative: integer("sentiment_very_negative").default(0),
  ticketsEscalated: integer("tickets_escalated").default(0),
  busiestHour: integer("busiest_hour"),
  quietestHour: integer("quietest_hour"),
  lastActivityAt: timestamp("last_activity_at").default(sql`now()`),
  totalIssuesResolved: integer("total_issues_resolved").default(0),
  totalEscalations: integer("total_escalations").default(0),
  staffOnline: integer("staff_online").default(0),
}, (table) => [
  index("room_analytics_workspace_idx").on(table.workspaceId),
  index("room_analytics_conversation_idx").on(table.conversationId),
  index("room_analytics_type_idx").on(table.roomType),
  index("room_analytics_status_idx").on(table.status),
  index("room_analytics_updated_idx").on(table.updatedAt),
  uniqueIndex("room_analytics_conversation_unique").on(table.conversationId, table.workspaceId),
]);

export const roomAnalyticsTimeseries = pgTable("room_analytics_timeseries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  conversationId: varchar("conversation_id").notNull(),
  period: varchar("period").notNull(),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  messageCount: integer("message_count").default(0),
  participantCount: integer("participant_count").default(0),
  newParticipants: integer("new_participants").default(0),
  ticketsCreated: integer("tickets_created").default(0),
  ticketsResolved: integer("tickets_resolved").default(0),
  avgResolutionTimeHours: doublePrecision("avg_resolution_time_hours"),
  aiResponses: integer("ai_responses").default(0),
  aiEscalations: integer("ai_escalations").default(0),
  sentimentPositive: integer("sentiment_positive").default(0),
  sentimentNeutral: integer("sentiment_neutral").default(0),
  sentimentNegative: integer("sentiment_negative").default(0),
  averageSentimentScore: doublePrecision("average_sentiment_score"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("room_analytics_ts_workspace_idx").on(table.workspaceId),
  index("room_analytics_ts_conversation_idx").on(table.conversationId),
  index("room_analytics_ts_period_idx").on(table.period),
  index("room_analytics_ts_period_start_idx").on(table.periodStart),
  index("room_analytics_ts_conversation_period_idx").on(table.conversationId, table.period, table.periodStart),
]);

export const mascotMotionProfiles = pgTable("mascot_motion_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  
  // Profile identification
  name: varchar("name", { length: 100 }).notNull().unique(),
  description: text("description"),
  
  // Motion pattern configuration (JSONB)
  patternType: text("pattern_type").notNull(), // 'TRIAD_SYNCHRONIZED' | etc
  starMotion: jsonb("star_motion").notNull(), // Per-star motion params
  /*
    starMotion: {
      co: { angularVelocity: 0.02, orbitRadius: 0.6, phaseOffset: 0, noiseAmp: 0 },
      ai: { angularVelocity: 0.02, orbitRadius: 0.6, phaseOffset: 2.094, noiseAmp: 0 },
      nx: { angularVelocity: 0.02, orbitRadius: 0.6, phaseOffset: 4.188, noiseAmp: 0 }
    }
  */
  
  // Physics adjustments
  physicsOverrides: jsonb("physics_overrides"), // Spring/dampen overrides
  /*
    physicsOverrides: {
      springStrength: 0.065,
      dampening: 0.88,
      repulsionStrength: 2.2
    }
  */
  
  // Randomness configuration
  randomSeed: integer("random_seed"),
  noiseConfig: jsonb("noise_config"), // Perlin/simplex noise params
  
  // Easing and timing
  easingCurve: varchar("easing_curve", { length: 50 }).default('easeInOutCubic'),
  cycleDuration: integer("cycle_duration_ms").default(5000), // Full cycle time
  
  // Metadata
  isDefault: boolean("is_default").default(false),
  isActive: boolean("is_active").default(true),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("motion_profile_name_idx").on(table.name),
  index("motion_profile_active_idx").on(table.isActive),
]);

export const holidayMascotDecor = pgTable("holiday_mascot_decor", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Holiday identification
  holidayKey: varchar("holiday_key", { length: 50 }).notNull(), // 'christmas', 'halloween', etc
  holidayName: varchar("holiday_name", { length: 100 }).notNull(),
  
  // Motion profile link
  motionProfileId: varchar("motion_profile_id"),
  
  // Per-star decorations (JSONB)
  starDecorations: jsonb("star_decorations").notNull(),
  /*
    starDecorations: {
      co: { 
        attachments: ['led_wrap', 'santa_hat'],
        glowPalette: ['#ff0000', '#00ff00', '#ffffff'],
        ledCount: 8, 
        ledSpacing: 0.15,
        ledSpeed: 0.5
      },
      ai: { attachments: ['led_wrap', 'ornament'], ... },
      nx: { attachments: ['led_wrap', 'star_topper'], ... }
    }
  */
  
  // Global decoration settings
  globalGlowIntensity: doublePrecision("global_glow_intensity").default(1.0),
  particleEffects: jsonb("particle_effects"), // Sparkles, snow, etc
  ambientColors: text("ambient_colors").array(), // Holiday color palette
  
  // Priority for multiple active holidays
  priority: integer("priority").default(0),
  
  // Date range for automatic activation
  startMonth: integer("start_month"),
  startDay: integer("start_day"),
  endMonth: integer("end_month"),
  endDay: integer("end_day"),
  
  isActive: boolean("is_active").default(true),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  eventType: varchar("event_type"),
  eventData: jsonb("event_data"),
}, (table) => [
  uniqueIndex("holiday_decor_key_idx").on(table.holidayKey),
  index("holiday_decor_active_idx").on(table.isActive),
  index("holiday_decor_priority_idx").on(table.priority),
]);

export const holidayMascotHistory = pgTable("holiday_mascot_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Reference to what was activated
  holidayDecorId: varchar("holiday_decor_id"),
  motionProfileId: varchar("motion_profile_id"),
  
  // Action tracking
  action: varchar("action", { length: 50 }).notNull(), // 'activate', 'deactivate', 'switch', 'modify'
  triggeredBy: varchar("triggered_by", { length: 50 }).notNull(), // 'ai_brain', 'orchestrator', 'manual', 'schedule'
  
  // Snapshot of directive at time of activation
  directiveSnapshot: jsonb("directive_snapshot").notNull(),
  /*
    directiveSnapshot: {
      motionPattern: 'TRIAD_SYNCHRONIZED',
      decorations: { ... },
      timestamp: '2025-12-02T...'
    }
  */
  
  // AI Brain metadata
  aiBrainSessionId: varchar("ai_brain_session_id"),
  reasoning: text("reasoning"), // AI's explanation for the choice
  
  // Duration tracking
  activatedAt: timestamp("activated_at").defaultNow(),
  deactivatedAt: timestamp("deactivated_at"),
  
  // Analytics
  userReactions: jsonb("user_reactions"), // Aggregated user feedback
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("holiday_history_decor_idx").on(table.holidayDecorId),
  index("holiday_history_profile_idx").on(table.motionProfileId),
  index("holiday_history_action_idx").on(table.action),
  index("holiday_history_activated_idx").on(table.activatedAt),
]);

export const externalEmailsSent = pgTable("external_emails_sent", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  sentBy: varchar("sent_by"),
  
  fromEmail: varchar("from_email").notNull(),
  toEmail: varchar("to_email").notNull(),
  ccEmails: text("cc_emails").array(),
  bccEmails: text("bcc_emails").array(),
  
  subject: varchar("subject").notNull(),
  bodyHtml: text("body_html").notNull(),
  bodyText: text("body_text"),
  
  // Context - what triggered this email
  emailType: varchar("email_type", { length: 50 }), // 'manual', 'lead_followup', 'proposal', 'contract', 'signature_request', 'invoice'
  relatedEntityType: varchar("related_entity_type", { length: 50 }), // 'lead', 'client', 'employee', 'document'
  relatedEntityId: varchar("related_entity_id"),
  
  // Trinity enhancement
  enhancedByTrinity: boolean("enhanced_by_trinity").default(false),
  originalBody: text("original_body"), // Before Trinity enhancement
  
  // Delivery tracking
  status: varchar("status", { length: 30 }).default("pending"), // 'pending', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed'
  externalMessageId: varchar("external_message_id"), // From email provider (Resend)
  errorMessage: text("error_message"),
  
  sentAt: timestamp("sent_at"),
  deliveredAt: timestamp("delivered_at"),
  openedAt: timestamp("opened_at"),
  
  // Scheduling
  scheduledFor: timestamp("scheduled_for"),
  isDraft: boolean("is_draft").default(false),
  
  // Attachments (stored as JSON array of file references)
  attachments: text("attachments"), // JSON array of {name, url, size, type}
  
  createdAt: timestamp("created_at").defaultNow().notNull(),

  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
}, (table) => [
  index("external_emails_workspace_idx").on(table.workspaceId),
  index("external_emails_sent_by_idx").on(table.sentBy),
  index("external_emails_status_idx").on(table.status),
  index("external_emails_type_idx").on(table.emailType),
  index("external_emails_created_idx").on(table.createdAt),
]);

export const emailDrafts = pgTable("email_drafts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  userId: varchar("user_id").notNull(),
  
  toEmail: varchar("to_email"),
  ccEmails: text("cc_emails").array(),
  subject: varchar("subject"),
  bodyHtml: text("body_html"),
  
  relatedEntityType: varchar("related_entity_type", { length: 50 }),
  relatedEntityId: varchar("related_entity_id"),
  
  lastAutoSavedAt: timestamp("last_auto_saved_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow().notNull(),

  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
}, (table) => [
  index("email_drafts_workspace_idx").on(table.workspaceId),
  index("email_drafts_user_idx").on(table.userId),
]);

export const contractorCommunications = pgTable("contractor_communications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  contractorId: varchar("contractor_id"),
  stagedShiftId: varchar("staged_shift_id"),
  
  // Communication details
  communicationType: varchar("communication_type", { length: 30 }).default('email'),
  subject: varchar("subject", { length: 500 }),
  body: text("body"),
  
  // Recipient
  recipientEmail: varchar("recipient_email", { length: 255 }),
  recipientName: varchar("recipient_name", { length: 150 }),
  
  // Content
  employeeInfo: jsonb("employee_info").$type<{
    name: string;
    phone: string;
    qualifications: string[];
  }>(),
  shiftDetails: jsonb("shift_details").$type<Record<string, any>>(),
  
  // AI generation
  aiGenerated: boolean("ai_generated").default(false),
  templateUsed: varchar("template_used", { length: 100 }),
  
  // Delivery status
  status: varchar("status", { length: 30 }).default('pending'),
  sentAt: timestamp("sent_at"),
  deliveredAt: timestamp("delivered_at"),
  failureReason: text("failure_reason"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("contractor_comms_workspace_idx").on(table.workspaceId),
  index("contractor_comms_contractor_idx").on(table.contractorId),
  index("contractor_comms_shift_idx").on(table.stagedShiftId),
]);

export const inboundEmails = pgTable("inbound_emails", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  
  // Email details
  messageId: varchar("message_id", { length: 255 }).unique(),
  fromEmail: varchar("from_email", { length: 255 }).notNull(),
  fromName: varchar("from_name", { length: 200 }),
  toEmail: varchar("to_email", { length: 255 }),
  subject: text("subject"),
  bodyText: text("body_text"),
  bodyHtml: text("body_html"),
  
  // Attachments
  hasAttachments: boolean("has_attachments").default(false),
  attachmentCount: integer("attachment_count").default(0),
  
  // Classification
  isShiftRequest: boolean("is_shift_request"),
  classificationConfidence: decimal("classification_confidence", { precision: 5, scale: 4 }),
  classificationReason: text("classification_reason"),
  
  // Processing
  status: varchar("status", { length: 30 }).default('received'),
  processedAt: timestamp("processed_at"),
  extractedShiftsCount: integer("extracted_shifts_count").default(0),
  
  // Routing
  routedToHumanAt: timestamp("routed_to_human_at"),
  humanReviewedAt: timestamp("human_reviewed_at"),
  
  receivedAt: timestamp("received_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("inbound_emails_workspace_idx").on(table.workspaceId),
  index("inbound_emails_from_idx").on(table.fromEmail),
  index("inbound_emails_status_idx").on(table.status),
  index("inbound_emails_received_idx").on(table.receivedAt),
]);

// ─────────────────────────────────────────────────────────────────────────────
// inbound_email_log
// Purpose-built audit table for the four-pipeline inbound email system
// (calloffs@, incidents@, docs@, support@). Separate from inbound_emails which
// serves contractor shift-extraction. Every inbound email — regardless of outcome —
// is logged here before any downstream action is taken.
// ─────────────────────────────────────────────────────────────────────────────
export const inboundEmailLog = pgTable("inbound_email_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // Workspace resolved after sender match; null if sender unknown
  workspaceId: varchar("workspace_id"),

  // Idempotency — Resend occasionally delivers twice; message_id is the dedup key
  messageId: varchar("message_id", { length: 255 }).unique(),

  // Email envelope
  fromEmail: varchar("from_email", { length: 255 }).notNull(),
  fromName: varchar("from_name", { length: 200 }),
  toEmail: varchar("to_email", { length: 255 }).notNull(),
  subject: text("subject"),
  bodyPreview: varchar("body_preview", { length: 500 }),
  bodyFull: text("body_full"),

  // Attachments
  hasAttachments: boolean("has_attachments").default(false),
  attachmentCount: integer("attachment_count").default(0),
  attachmentMeta: jsonb("attachment_meta").$type<Array<{
    filename: string; contentType: string; size?: number; url?: string;
  }>>().default(sql`'[]'::jsonb`),

  // Routing — which pipeline handled this email
  category: varchar("category", { length: 30 }),
  // 'calloff' | 'incident' | 'docs' | 'support' | 'unknown'

  // Sender identity resolution
  identifiedSenderId: varchar("identified_sender_id"),
  identifiedSenderType: varchar("identified_sender_type", { length: 20 }),
  // 'employee' | 'client' | 'unknown'
  unverifiedSender: boolean("unverified_sender").default(false),

  // Processing outcome
  processingStatus: varchar("processing_status", { length: 30 }).default('received'),
  // 'received' | 'processing' | 'processed' | 'failed' | 'needs_review' | 'duplicate'
  trinityActionTaken: varchar("trinity_action_taken", { length: 100 }),
  trinityConfidence: decimal("trinity_confidence", { precision: 5, scale: 4 }),

  // Downstream record created by this email
  downstreamRecordId: varchar("downstream_record_id"),
  downstreamRecordType: varchar("downstream_record_type", { length: 50 }),
  // 'shift_coverage_request' | 'incident_report' | 'document_vault' | 'support_ticket'

  // Review flags
  needsReview: boolean("needs_review").default(false),
  reviewReason: text("review_reason"),

  // Failure capture
  failureReason: text("failure_reason"),

  // AI-extracted structured fields from the email body (populated after Trinity processing)
  extractedFields: jsonb("extracted_fields").$type<Record<string, unknown>>(),

  // Raw payload preserved for debugging and reprocessing
  rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>(),

  receivedAt: timestamp("received_at").defaultNow(),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("iel_workspace_idx").on(table.workspaceId),
  index("iel_category_idx").on(table.category),
  index("iel_status_idx").on(table.processingStatus),
  index("iel_from_idx").on(table.fromEmail),
  index("iel_received_idx").on(table.receivedAt),
  index("iel_needs_review_idx").on(table.needsReview),
]);

export const insertInboundEmailLogSchema = createInsertSchema(inboundEmailLog).omit({
  id: true, createdAt: true, receivedAt: true,
});
export type InboundEmailLog = typeof inboundEmailLog.$inferSelect;
export type InsertInboundEmailLog = typeof insertInboundEmailLogSchema._type;

export const channelBridges = pgTable("channel_bridges", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  channelType: varchar("channel_type", { length: 20 }).notNull(),
  displayName: varchar("display_name", { length: 255 }).notNull(),
  providerConfig: jsonb("provider_config").$type<Record<string, any>>().default(sql`'{}'::jsonb`),
  webhookUrl: text("webhook_url"),
  webhookSecret: varchar("webhook_secret", { length: 64 }),
  phoneNumber: varchar("phone_number", { length: 20 }),
  emailAddress: varchar("email_address", { length: 255 }),
  status: varchar("status", { length: 20 }).notNull().default("inactive"),
  lastActivityAt: timestamp("last_activity_at"),
  messageCount: integer("message_count").notNull().default(0),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("channel_bridges_workspace_idx").on(table.workspaceId),
  index("channel_bridges_type_idx").on(table.channelType),
  index("channel_bridges_status_idx").on(table.status),
]);

export const bridgeConversations = pgTable("bridge_conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bridgeId: varchar("bridge_id").notNull(),
  workspaceId: varchar("workspace_id").notNull(),
  conversationId: varchar("conversation_id"),
  channelType: varchar("channel_type", { length: 20 }).notNull(),
  externalIdentifier: varchar("external_identifier", { length: 255 }).notNull(),
  externalDisplayName: varchar("external_display_name", { length: 255 }),
  resolvedUserId: varchar("resolved_user_id"),
  resolvedEmployeeId: varchar("resolved_employee_id"),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  lastMessageAt: timestamp("last_message_at"),
  messageCount: integer("message_count").notNull().default(0),
  metadata: jsonb("metadata").$type<Record<string, any>>().default(sql`'{}'::jsonb`),
  updatedAt: timestamp("updated_at").defaultNow(),

  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
}, (table) => [
  index("bridge_conversations_bridge_idx").on(table.bridgeId),
  index("bridge_conversations_workspace_idx").on(table.workspaceId),
  index("bridge_conversations_external_idx").on(table.externalIdentifier),
  index("bridge_conversations_channel_idx").on(table.channelType),
]);

export const bridgeMessages = pgTable("bridge_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bridgeConversationId: varchar("bridge_conversation_id").notNull(),
  workspaceId: varchar("workspace_id").notNull(),
  chatMessageId: varchar("chat_message_id"),
  direction: varchar("direction", { length: 10 }).notNull(),
  channelType: varchar("channel_type", { length: 20 }).notNull(),
  externalMessageId: varchar("external_message_id"),
  senderIdentity: varchar("sender_identity", { length: 255 }),
  messageContent: text("message_content"),
  messageType: varchar("message_type", { length: 20 }).notNull().default("text"),
  attachmentUrl: text("attachment_url"),
  deliveryStatus: varchar("delivery_status", { length: 20 }).notNull().default("pending"),
  providerResponse: jsonb("provider_response").$type<Record<string, any>>(),
  creditsCost: integer("credits_cost").default(0),
  updatedAt: timestamp("updated_at").defaultNow(),

  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
}, (table) => [
  index("bridge_messages_conversation_idx").on(table.bridgeConversationId),
  index("bridge_messages_workspace_idx").on(table.workspaceId),
  index("bridge_messages_direction_idx").on(table.direction),
  index("bridge_messages_delivery_idx").on(table.deliveryStatus),
  index("bridge_messages_channel_idx").on(table.channelType),
]);

// ─── Recovered unmapped tables ─────────────────────────────────────────────

export const trinityEmailConversations = pgTable("trinity_email_conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  referenceNumber: varchar("reference_number", { length: 50 }).notNull(),
  threadId: varchar("thread_id", { length: 255 }),
  clientEmail: varchar("client_email", { length: 255 }).notNull(),
  clientName: varchar("client_name", { length: 150 }),
  conversationType: varchar("conversation_type", { length: 30 }).notNull().default('staffing_inquiry'),
  totalCreditsUsed: integer("total_credits_used").default(0),
  messageCount: integer("message_count").default(0),
  complaintId: varchar("complaint_id"),
  escalatedToHuman: boolean("escalated_to_human").default(false),
  escalatedAt: timestamp("escalated_at"),
  status: varchar("status", { length: 20 }).notNull().default('active'),
  lastActivityAt: timestamp("last_activity_at").defaultNow(),

  recordingData: jsonb("recording_data"),
}, (table) => [
  index("idx_trinity_email_workspace").on(table.workspaceId),
  index("idx_trinity_email_ref").on(table.referenceNumber),
  index("idx_trinity_email_client").on(table.clientEmail),
  index("idx_trinity_email_status").on(table.status),
]);

export const broadcasts = pgTable("broadcasts", {
  id: varchar("id").primaryKey(),
  workspaceId: varchar("workspace_id"),
  createdBy: varchar("created_by"),
  createdByType: varchar("created_by_type", { length: 20 }),
  type: varchar("type", { length: 30 }),
  priority: varchar("priority", { length: 20 }).default('normal'),
  title: varchar("title", { length: 255 }),
  message: text("message"),
  richContent: jsonb("rich_content"),
  targetType: varchar("target_type", { length: 30 }),
  targetConfig: jsonb("target_config"),
  actionType: varchar("action_type", { length: 30 }),
  actionConfig: jsonb("action_config"),
  passDownData: jsonb("pass_down_data"),
  scheduledFor: timestamp("scheduled_for"),
  expiresAt: timestamp("expires_at"),
  isActive: boolean("is_active").default(true),
  isDraft: boolean("is_draft").default(false),
  trinityExecutionId: varchar("trinity_execution_id"),
  aiGenerated: boolean("ai_generated").default(false),
  aiSummary: text("ai_summary"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  feedbackData: jsonb("feedback_data"),
  recipientData: jsonb("recipient_data"),
});

export const broadcastRecipients = pgTable("broadcast_recipients", {
  id: varchar("id").primaryKey(),
  broadcastId: varchar("broadcast_id"),
  employeeId: varchar("employee_id"),
  userId: varchar("user_id"),
  deliveredAt: timestamp("delivered_at"),
  readAt: timestamp("read_at"),
  acknowledgedAt: timestamp("acknowledged_at"),
  dismissedAt: timestamp("dismissed_at"),
  actionTakenAt: timestamp("action_taken_at"),
  responseData: jsonb("response_data"),
  notificationId: varchar("notification_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const broadcastFeedback = pgTable("broadcast_feedback", {
  id: varchar("id").primaryKey(),
  broadcastId: varchar("broadcast_id"),
  employeeId: varchar("employee_id"),
  workspaceId: varchar("workspace_id"),
  feedbackType: varchar("feedback_type"),
  subject: varchar("subject"),
  content: text("content"),
  category: varchar("category"),
  allowFollowup: boolean("allow_followup").default(true),
  contactMethod: varchar("contact_method"),
  aiSummary: text("ai_summary"),
  aiSentiment: varchar("ai_sentiment"),
  aiPriorityScore: integer("ai_priority_score"),
  aiCategories: jsonb("ai_categories"),
  aiActionItems: jsonb("ai_action_items"),
  status: varchar("status"),
  reviewedBy: varchar("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  resolutionNotes: text("resolution_notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const trackedNotifications = pgTable("tracked_notifications", {
  id: varchar("id").primaryKey(),
  workspaceId: varchar("workspace_id").notNull(),
  notificationData: jsonb("notification_data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("tn_workspace_idx").on(table.workspaceId),
  index("tn_id_idx").on(table.id),
]);

export const insertTrackedNotificationSchema = createInsertSchema(trackedNotifications).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertTrackedNotification = z.infer<typeof insertTrackedNotificationSchema>;
export type TrackedNotification = typeof trackedNotifications.$inferSelect;

export const mascotSessions = pgTable("mascot_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  userId: varchar("user_id"),
  sessionKey: varchar("session_key", { length: 100 }).notNull(),
  startedAt: timestamp("started_at").defaultNow(),
  endedAt: timestamp("ended_at"),
  isActive: boolean("is_active").default(true),
  motionProfile: varchar("motion_profile", { length: 50 }),
  positionX: integer("position_x"),
  positionY: integer("position_y"),
  contextSnapshot: jsonb("context_snapshot"),
  totalInteractions: integer("total_interactions").default(0),
  totalThoughts: integer("total_thoughts").default(0),
  totalAdvice: integer("total_advice").default(0),
  totalTasksGenerated: integer("total_tasks_generated").default(0),
  userAgent: text("user_agent"),
  screenWidth: integer("screen_width"),
  screenHeight: integer("screen_height"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  lastInteractionAt: timestamp("last_interaction_at"),
}, (table) => [
  index("mascot_sessions_workspace_idx").on(table.workspaceId),
  index("mascot_sessions_user_idx").on(table.userId),
  index("mascot_sessions_active_idx").on(table.isActive),
  index("mascot_sessions_key_idx").on(table.sessionKey),
  index("mascot_sessions_started_idx").on(table.startedAt),
]);

export const insertMascotSessionSchema = createInsertSchema(mascotSessions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertMascotSession = z.infer<typeof insertMascotSessionSchema>;
export type MascotSession = typeof mascotSessions.$inferSelect;

export const mascotInteractions = pgTable("mascot_interactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull(),
  workspaceId: varchar("workspace_id").notNull(),
  userId: varchar("user_id"),
  source: varchar("source", { length: 50 }).notNull(),
  interactionType: varchar("interaction_type", { length: 50 }).notNull(),
  payload: jsonb("payload"),
  aiResponse: text("ai_response"),
  aiResponseType: varchar("ai_response_type", { length: 50 }),
  aiTokensUsed: integer("ai_tokens_used"),
  mascotPositionX: integer("mascot_position_x"),
  mascotPositionY: integer("mascot_position_y"),
  processingTimeMs: integer("processing_time_ms"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  triggerEvent: varchar("trigger_event"),
  animationPlayed: varchar("animation_played"),
  messageShown: text("message_shown"),
  userResponse: varchar("user_response"),
  durationMs: integer("duration_ms"),
  metadata: jsonb("metadata"),
}, (table) => [
  index("mascot_interactions_session_idx").on(table.sessionId),
  index("mascot_interactions_workspace_idx").on(table.workspaceId),
  index("mascot_interactions_user_idx").on(table.userId),
  index("mascot_interactions_source_idx").on(table.source),
  index("mascot_interactions_type_idx").on(table.interactionType),
  index("mascot_interactions_created_idx").on(table.createdAt),
]);

export const insertMascotInteractionSchema = createInsertSchema(mascotInteractions).omit({
  id: true,
  createdAt: true,
});
export type InsertMascotInteraction = z.infer<typeof insertMascotInteractionSchema>;
export type MascotInteraction = typeof mascotInteractions.$inferSelect;

export const mascotTasks = pgTable("mascot_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull(),
  workspaceId: varchar("workspace_id").notNull(),
  userId: varchar("user_id"),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 50 }),
  priority: varchar("priority", { length: 20 }).default('medium'),
  status: varchar("status", { length: 20 }).default('pending'),
  completedAt: timestamp("completed_at"),
  generatedFromInteractionId: varchar("generated_from_interaction_id"),
  aiReasoning: text("ai_reasoning"),
  actionUrl: text("action_url"),
  actionLabel: varchar("action_label", { length: 50 }),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  taskType: varchar("task_type"),
  taskName: varchar("task_name"),
  taskStatus: varchar("task_status"),
  context: jsonb("context"),
  result: jsonb("result"),
  startedAt: timestamp("started_at"),
}, (table) => [
  index("mascot_tasks_session_idx").on(table.sessionId),
  index("mascot_tasks_workspace_idx").on(table.workspaceId),
  index("mascot_tasks_user_idx").on(table.userId),
  index("mascot_tasks_status_idx").on(table.status),
  index("mascot_tasks_priority_idx").on(table.priority),
]);

export const insertMascotTaskSchema = createInsertSchema(mascotTasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertMascotTask = z.infer<typeof insertMascotTaskSchema>;
export type MascotTask = typeof mascotTasks.$inferSelect;

// ── resend_webhook_events ──────────────────────────────────────────────────
// Dedup log for inbound Resend email webhook events. Written by
// server/routes/resendWebhooks.ts to prevent double-processing of events.
export const resendWebhookEvents = pgTable("resend_webhook_events", {
  id: serial("id").primaryKey(),
  messageId: varchar("message_id", { length: 255 }),
  eventType: varchar("event_type", { length: 100 }),
  processedAt: timestamp("processed_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("resend_webhook_events_message_idx").on(table.messageId),
  index("resend_webhook_events_event_type_idx").on(table.eventType),
]);

// ─────────────────────────────────────────────────────────────────────────────
// email_deliveries
// Tracks all outbound email sends with delivery/open/click tracking.
// ─────────────────────────────────────────────────────────────────────────────
export const emailDeliveries = pgTable("email_deliveries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  messageId: varchar("message_id").unique(),
  provider: varchar("provider").notNull().default("resend"),
  toEmail: varchar("to_email").notNull(),
  fromEmail: varchar("from_email"),
  subject: varchar("subject"),
  templateId: varchar("template_id"),
  status: varchar("status").notNull().default("sent"), // sent, delivered, opened, clicked, bounced, failed
  sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow(),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  openedAt: timestamp("opened_at", { withTimezone: true }),
  clickedAt: timestamp("clicked_at", { withTimezone: true }),
  bouncedAt: timestamp("bounced_at", { withTimezone: true }),
  failedAt: timestamp("failed_at", { withTimezone: true }),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("idx_email_deliveries_workspace").on(table.workspaceId),
  index("idx_email_deliveries_to_email").on(table.toEmail),
  index("idx_email_deliveries_sent_at").on(table.sentAt),
]);
export type EmailDelivery = typeof emailDeliveries.$inferSelect;
export const insertEmailDeliverySchema = createInsertSchema(emailDeliveries).omit({ id: true, createdAt: true });
export type InsertEmailDelivery = z.infer<typeof insertEmailDeliverySchema>;

// ─── GROUP 5 PHASE 35C: DOCCHAT BOT COMMANDS ────────────────────────────────
export const chatBotCommands = pgTable("chat_bot_commands", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  commandPrefix: varchar("command_prefix").notNull(), // /schedule, /calloff, /incident, /roster, /help, /trinity
  commandType: varchar("command_type").notNull(), // built_in | custom
  handler: varchar("handler"), // internal handler name
  description: text("description"),
  minRole: varchar("min_role").default("staff"), // staff|supervisor|manager|owner
  isEnabled: boolean("is_enabled").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("chat_bot_commands_workspace_idx").on(table.workspaceId),
  index("chat_bot_commands_prefix_idx").on(table.commandPrefix),
]);
export type ChatBotCommand = typeof chatBotCommands.$inferSelect;

export * from './extended';
