-- Migration: Add conversationId and sessionId tracking to AI Brain Jobs
-- Date: 2025-11-29
-- Purpose: Add conversation context for proper AI response routing to chatrooms

ALTER TABLE ai_brain_jobs ADD COLUMN conversation_id varchar;
ALTER TABLE ai_brain_jobs ADD COLUMN session_id varchar;

-- Add indexes for conversation-based queries and lookups
CREATE INDEX ai_brain_jobs_conversation_idx ON ai_brain_jobs(conversation_id);
CREATE INDEX ai_brain_jobs_session_idx ON ai_brain_jobs(session_id);
