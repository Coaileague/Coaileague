CREATE TABLE "agent_availability" (
	"user_id" varchar PRIMARY KEY NOT NULL,
	"status" varchar(20) DEFAULT 'offline' NOT NULL,
	"max_concurrent_chats" integer DEFAULT 5,
	"current_chat_count" integer DEFAULT 0,
	"last_activity" timestamp,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "chat_connections" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"session_id" varchar(255) NOT NULL,
	"connected_at" timestamp DEFAULT now(),
	"disconnected_at" timestamp,
	"ip_address" varchar(45),
	"user_agent" text,
	"disconnect_reason" varchar(50),
	CONSTRAINT "chat_connections_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "chat_uploads" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" varchar NOT NULL,
	"uploader_id" varchar NOT NULL,
	"uploader_name" varchar NOT NULL,
	"conversation_id" varchar,
	"message_id" varchar,
	"filename" varchar NOT NULL,
	"original_filename" varchar NOT NULL,
	"mime_type" varchar NOT NULL,
	"file_size" integer NOT NULL,
	"storage_url" varchar NOT NULL,
	"thumbnail_url" varchar,
	"is_scanned" boolean DEFAULT false,
	"scan_status" varchar DEFAULT 'pending',
	"scan_result" text,
	"expires_at" timestamp,
	"is_deleted" boolean DEFAULT false,
	"deleted_at" timestamp,
	"deleted_by" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "room_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" varchar NOT NULL,
	"conversation_id" varchar NOT NULL,
	"actor_id" varchar,
	"actor_name" varchar NOT NULL,
	"actor_role" varchar NOT NULL,
	"event_type" varchar NOT NULL,
	"event_payload" jsonb,
	"description" text,
	"ip_address" varchar,
	"user_agent" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "room_voice_sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" varchar NOT NULL,
	"conversation_id" varchar NOT NULL,
	"session_id" varchar NOT NULL,
	"status" varchar DEFAULT 'active' NOT NULL,
	"participants" jsonb DEFAULT '[]' NOT NULL,
	"active_participant_count" integer DEFAULT 0,
	"started_by" varchar NOT NULL,
	"started_by_name" varchar NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_by" varchar,
	"ended_by_name" varchar,
	"ended_at" timestamp,
	"is_recorded" boolean DEFAULT false,
	"recording_url" varchar,
	"recording_consent" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "room_voice_sessions_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "routing_rules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" varchar,
	"keyword" varchar(255) NOT NULL,
	"department" varchar(100),
	"priority" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "satisfaction_surveys" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" varchar,
	"user_id" varchar,
	"agent_id" varchar,
	"rating" integer NOT NULL,
	"feedback" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "satisfaction_surveys_ticket_id_unique" UNIQUE("ticket_id"),
	CONSTRAINT "rating_valid" CHECK ("satisfaction_surveys"."rating" BETWEEN 1 AND 5)
);
--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "auto_close_at" timestamp;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "visibility" varchar DEFAULT 'workspace';--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "helpdesk_ticket_id" varchar;--> statement-breakpoint
ALTER TABLE "agent_availability" ADD CONSTRAINT "agent_availability_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_connections" ADD CONSTRAINT "chat_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_uploads" ADD CONSTRAINT "chat_uploads_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_uploads" ADD CONSTRAINT "chat_uploads_uploader_id_users_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_uploads" ADD CONSTRAINT "chat_uploads_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_uploads" ADD CONSTRAINT "chat_uploads_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_uploads" ADD CONSTRAINT "chat_uploads_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_events" ADD CONSTRAINT "room_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_events" ADD CONSTRAINT "room_events_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_events" ADD CONSTRAINT "room_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_voice_sessions" ADD CONSTRAINT "room_voice_sessions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_voice_sessions" ADD CONSTRAINT "room_voice_sessions_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_voice_sessions" ADD CONSTRAINT "room_voice_sessions_started_by_users_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_voice_sessions" ADD CONSTRAINT "room_voice_sessions_ended_by_users_id_fk" FOREIGN KEY ("ended_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_rules" ADD CONSTRAINT "routing_rules_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "satisfaction_surveys" ADD CONSTRAINT "satisfaction_surveys_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "satisfaction_surveys" ADD CONSTRAINT "satisfaction_surveys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "satisfaction_surveys" ADD CONSTRAINT "satisfaction_surveys_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_availability_status_idx" ON "agent_availability" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "chat_connections_user_connected_idx" ON "chat_connections" USING btree ("user_id","connected_at");--> statement-breakpoint
CREATE INDEX "chat_uploads_conversation_idx" ON "chat_uploads" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "chat_uploads_uploader_idx" ON "chat_uploads" USING btree ("uploader_id");--> statement-breakpoint
CREATE INDEX "chat_uploads_workspace_idx" ON "chat_uploads" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_uploads_storage_unique" ON "chat_uploads" USING btree ("workspace_id","storage_url");--> statement-breakpoint
CREATE INDEX "room_events_conversation_created_idx" ON "room_events" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "room_events_actor_idx" ON "room_events" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "room_events_type_idx" ON "room_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "room_events_workspace_idx" ON "room_events" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "room_voice_sessions_conversation_idx" ON "room_voice_sessions" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "room_voice_sessions_status_idx" ON "room_voice_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "room_voice_sessions_workspace_idx" ON "room_voice_sessions" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "routing_rules_keyword_idx" ON "routing_rules" USING btree ("keyword");--> statement-breakpoint
CREATE INDEX "routing_rules_department_idx" ON "routing_rules" USING btree ("department");--> statement-breakpoint
CREATE INDEX "routing_rules_priority_idx" ON "routing_rules" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "satisfaction_surveys_ticket_idx" ON "satisfaction_surveys" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "satisfaction_surveys_agent_date_idx" ON "satisfaction_surveys" USING btree ("agent_id","created_at");--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_helpdesk_ticket_id_support_tickets_id_fk" FOREIGN KEY ("helpdesk_ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_messages_conversation_created_idx" ON "chat_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_messages_sender_idx" ON "chat_messages" USING btree ("sender_id");--> statement-breakpoint
CREATE INDEX "chat_messages_unread_idx" ON "chat_messages" USING btree ("is_read","created_at");--> statement-breakpoint
CREATE INDEX "chat_messages_recipient_idx" ON "chat_messages" USING btree ("recipient_id");--> statement-breakpoint
CREATE INDEX "support_tickets_status_idx" ON "support_tickets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "support_tickets_priority_idx" ON "support_tickets" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "support_tickets_workspace_created_idx" ON "support_tickets" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "support_tickets_assigned_idx" ON "support_tickets" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "support_tickets_platform_assigned_idx" ON "support_tickets" USING btree ("platform_assigned_to");