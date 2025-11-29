# ChatServerHub Integration Map

## Overview

ChatServerHub is the unified gateway for all chat room types in CoAIleague. This document maps which features currently use ChatServerHub and which still need integration.

---

## Room Types Supported

### 1. **Support Rooms** ✅
- **Table**: `support_rooms`
- **Description**: Customer support chatrooms with ticket tracking
- **Status**: Implemented
- **Features Using It**:
  - Ticket creation and management
  - Customer support lifecycle
  - Queue updates and position tracking
  - HelpAI bot integration

---

### 2. **Work Rooms** ✅
- **Table**: `chat_conversations` (conversation_type: 'shift_chat')
- **Description**: Team collaboration and shift-based work chat
- **Status**: Implemented (Requires completion)
- **Features Using It**:
  - Shift-based team chat
  - Real-time shift communication
  - Participant presence tracking
- **Features That Need Integration**:
  - [ ] AI suggestions for shift scheduling
  - [ ] Shift-specific notifications
  - [ ] Shift analytics/metrics

---

### 3. **Meeting Rooms** ✅
- **Table**: `chat_conversations` (conversation_type: 'open_chat' with meeting context)
- **Description**: Meeting and event discussion rooms
- **Status**: Implemented (Partial)
- **Features Using It**:
  - Meeting discussions
  - Event announcements
  - Team coordination
- **Features That Need Integration**:
  - [ ] Meeting recording/transcription
  - [ ] Meeting AI summarization
  - [ ] Attendee tracking and analytics

---

### 4. **Organization Rooms** ✅
- **Table**: `organization_chat_rooms`
- **Description**: Company-wide communication and announcements
- **Status**: Implemented
- **Features Using It**:
  - Organization-wide announcements
  - Company communications
  - Department-level discussions

---

## Connected Systems Integration Status

### ✅ AI Brain
**Status**: Integrated
- **Endpoint**: `/api/ai/chat`, `/api/ai/schedule`
- **Purpose**: Intelligent responses and escalation detection
- **Currently Wired**:
  - Support room AI escalation
  - Sentiment analysis
  - Auto-ticket suggestions
- **Needs Integration**:
  - [ ] Work room shift AI suggestions
  - [ ] Meeting room AI summarization
  - [ ] Organization room announcements AI

**Files Using**:
- `server/services/ChatServerHub.ts` - emitAIAction()
- `server/services/ai-brain/aiBrainService.ts`

---

### ✅ Notification System
**Status**: Integrated
- **Endpoint**: `/api/notifications`
- **Purpose**: Push alerts and user notifications
- **Currently Wired**:
  - Support ticket notifications
  - Message mentions
  - Escalation alerts
- **Needs Integration**:
  - [ ] Work room shift announcements
  - [ ] Meeting room event reminders
  - [ ] Organization-wide broadcast notifications

**Files Using**:
- `server/services/ChatServerHub.ts` - createChatNotifications()
- `server/services/notificationService.ts`

---

### ✅ Ticket System
**Status**: Integrated
- **Endpoint**: `/api/support/create-ticket`
- **Purpose**: Issue tracking and lifecycle management
- **Currently Wired**:
  - Support room ticket creation
  - Ticket assignment to staff
  - Ticket escalation
  - Ticket resolution
- **Needs Integration**:
  - [ ] Auto-ticket creation from work room issues
  - [ ] Meeting action item tickets
  - [ ] Organization-wide issue tracking

**Files Using**:
- `server/services/ChatServerHub.ts` - emitTicketCreated(), emitTicketAssigned()
- `server/routes/chat-rooms.ts`

---

### ✅ What's New Feed
**Status**: Integrated
- **Endpoint**: `/api/whats-new`
- **Purpose**: Platform-wide event announcements
- **Currently Wired**:
  - Ticket creation events
  - Ticket resolution events
  - Significant chat events
- **Needs Integration**:
  - [ ] Work room milestones
  - [ ] Meeting conclusions
  - [ ] Organization announcements

**Files Using**:
- `server/services/ChatServerHub.ts` - shouldPersistEvent()
- `server/services/platformEventBus.ts`

---

### ⚠️ Analytics Service
**Status**: Partially Integrated
- **Endpoint**: TBD
- **Purpose**: Chat metrics and usage tracking
- **Currently Wired**:
  - Basic event logging
- **Needs Implementation**:
  - [ ] Chat volume metrics
  - [ ] Room participation analytics
  - [ ] Response time tracking
  - [ ] Chat sentiment analytics
  - [ ] Feature usage statistics

**Files That Should Use It**:
- `server/services/ChatServerHub.ts` (new)
- `server/services/analyticsStats.ts` (enhancement needed)

---

## Event Flow Diagram

```
User Action in Any Room Type
          ↓
    ChatServerHub
    (Central Hub)
          ↓
    ┌─────┴─────┬──────────┬──────────┐
    ↓           ↓          ↓          ↓
AI Brain    Notifications Tickets  What's New
    ↓           ↓          ↓          ↓
Response   Push Alert   Track     Broadcast
Detection  Message      Issue     Announce
```

---

## Integration Checklist by Feature

### Support Features
- [x] Support room creation and management
- [x] Ticket creation from support chat
- [x] AI escalation detection
- [x] Staff notifications
- [x] Queue position updates
- [x] Conversation history tracking
- [ ] AI-powered FAQ search integration
- [ ] Sentiment analysis for support quality

### Work Features
- [x] Shift-based room creation
- [x] Real-time shift communication
- [x] Participant tracking
- [ ] AI shift optimization suggestions
- [ ] Shift performance metrics
- [ ] Team engagement analytics
- [ ] Shift handoff documentation

### Meeting Features
- [x] Meeting room creation
- [x] Event discussion tracking
- [ ] Meeting recording/playback links
- [ ] AI meeting summary generation
- [ ] Action item extraction
- [ ] Attendee engagement metrics
- [ ] Follow-up task creation

### Organization Features
- [x] Organization-wide rooms
- [x] Company announcements
- [x] Department communications
- [ ] Organization chart integration
- [ ] Leadership decision tracking
- [ ] Company policy updates via chat

---

## Performance Considerations

### Gateway Initialization
- **Heartbeat Interval**: 30 seconds
- **Room Load Limit**: 1000 support rooms, 2000 conversations per load
- **Stale Room Cleanup**: Remove if no participants for 5+ minutes

### Connection Limits
- **Rate Limiting**: 30 messages/min, 100 events/min
- **Concurrent Connections**: 10 per room type
- **Message Queue**: Async processing with error recovery

---

## API Endpoints Summary

### Room Management
- `GET /api/chat/rooms` - List all rooms
- `GET /api/chat/rooms/active` - Get active rooms
- `POST /api/chat/rooms` - Create room
- `GET /api/chat/rooms/{roomId}/status` - Room status
- `GET /api/chat/rooms/{roomId}/metrics` - Room metrics

### Gateway Health
- `GET /api/chat/gateway/health` - Health check
- `GET /api/chat/gateway/status` - Gateway status

### Event Broadcasting
- `POST /api/chat/events` - Publish event
- `WS /api/chat/events/subscribe` - Subscribe to events

---

## Migration Guide

### Adding a New Feature to ChatServerHub

1. **Define the event type** in `ChatEventType` union
2. **Add to CHAT_SERVER_HUB config** in `shared/platformConfig.ts`
3. **Create convenience method** for emitting the event
4. **Wire up subscribers** in the connected system
5. **Add to integration tests**

### Example: New Meeting Summary Feature

```typescript
// 1. Add event type
type ChatEventType = ... | 'meeting_summary_generated';

// 2. Add to config
CHAT_SERVER_HUB.events = {
  ...
  meetingSummaryGenerated: "meeting:summary_generated",
}

// 3. Create convenience method
async emitMeetingSummary(params: {
  conversationId: string;
  workspaceId: string;
  summary: string;
  actionItems: string[];
}) {
  await this.emit({
    type: 'meeting_summary_generated',
    title: 'Meeting Summary Generated',
    description: params.summary,
    metadata: {
      conversationId: params.conversationId,
      workspaceId: params.workspaceId,
      actionItems: params.actionItems,
    },
  });
}

// 4. Wire up in meeting service
chatServerHub.subscribe('meeting_summary_generated', async (event) => {
  // Create action items as tickets
  // Notify participants
  // Add to What's New
});
```

---

## Troubleshooting

### Gateway Not Initialized
- Check logs for initialization errors
- Verify database connection
- Ensure CHAT_SERVER_HUB.enabled is true

### Missing Rooms in Active List
- Check room status is 'active'
- Verify conversation has participants
- Check database queries are not hitting limits

### Events Not Being Propagated
- Verify subscriber is registered
- Check event type is in shouldNotify/shouldPersist lists
- Review connected system endpoints

---

## Future Enhancements

1. **Real-time Dashboard**: Live room activity monitoring
2. **Advanced Analytics**: ML-based chat analytics
3. **Cross-room Search**: Global message search across all room types
4. **Room Intelligence**: Auto-room suggestions based on team structure
5. **Integration Marketplace**: Third-party service integration gateway

