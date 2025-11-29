# ChatServerHub Gateway Architecture

## Executive Summary

**ChatServerHub** is CoAIleague's unified gateway for all chat room types. It serves as the central orchestration layer connecting support rooms, work rooms, meeting rooms, and organization rooms to AI Brain, notification systems, ticket tracking, and platform analytics.

---

## System Architecture

### High-Level Overview

```
┌──────────────────────────────────────────────────────────────┐
│                     CHAT APPLICATIONS                         │
│  (Support Portal, Work Teams, Meeting Rooms, Organization)    │
└────────┬───────┬──────────┬────────────────────────────────┘
         │       │          │
    ┌────▼───────▼──────────▼─────┐
    │    ChatServerHub Gateway     │
    │  (Unified Event Orchestrator) │
    └────┬───────┬──────────┬────┬─┘
         │       │          │    │
    ┌────▼──┐ ┌──▼────┐ ┌──▼──┐ └────┐
    │ AI    │ │ Notif │ │Ticket│ │What'│
    │Brain  │ │ication│ │System│ │ New │
    └───────┘ └───────┘ └──────┘ └─────┘
         │       │          │       │
    ┌────▼───────▼──────────▼───────▼──┐
    │   Platform Event Bus (Async)      │
    └───────────────────────────────────┘
```

---

## Core Components

### 1. ChatServerHub Class

The central orchestrator managing all room types and event flows.

#### Key Responsibilities:
- **Gateway Initialization**: Load all active rooms on startup
- **Event Emission**: Route events to all connected systems
- **Room Tracking**: Maintain active room list and metrics
- **WebSocket Broadcasting**: Push real-time updates to clients
- **Subscriber Management**: Handle internal event subscriptions

#### Key Methods:

```typescript
// Gateway Lifecycle
async initializeGateway(): Promise<void>
async shutdownGateway(): Promise<void>

// Room Tracking
getAllActiveRooms(): ActiveRoom[]
getActiveRoomsByType(type): ActiveRoom[]
getActiveRoomsByWorkspace(workspaceId): ActiveRoom[]
getGatewayStats(): GatewayStats

// Event Emission
async emit(event: ChatEvent): Promise<void>
subscribe(eventType, handler): void

// WebSocket Integration
setWebSocketBroadcaster(broadcaster): void
```

---

### 2. Room Types

Each room type maps to one or more database tables:

#### Support Rooms
```typescript
Table: support_rooms
Ref: chatConversations (1:1)
Status Field: status
Active Filter: status = 'active'
Linked Tickets: supportTickets

Features:
- Customer support with ticket tracking
- Queue management
- AI escalation detection
- HelpAI bot integration
```

#### Work Rooms
```typescript
Table: chatConversations
Filter: conversation_type = 'shift_chat'
Status: status = 'active'
Related: shifts (via shiftId)

Features:
- Shift-based team collaboration
- Real-time communication
- Participant presence tracking
- Shift handoff documentation
```

#### Meeting Rooms
```typescript
Table: chatConversations
Filter: conversation_type = 'open_chat' + meeting_context
Status: status = 'active'

Features:
- Meeting discussions
- Event announcements
- Team coordination
- Action item tracking (future)
```

#### Organization Rooms
```typescript
Table: organization_chat_rooms
Status Field: status
Active Filter: status = 'active'
Scope: workspace or platform-wide

Features:
- Company announcements
- Department communications
- Leadership decision tracking
- Policy distribution
```

---

### 3. Connected Systems

Each connected system receives events relevant to its domain:

#### AI Brain
- **Receives**: Message posted, user escalation signals
- **Produces**: AI response, escalation recommendation, suggestion
- **Purpose**: Intelligent response generation and routing
- **Integration Point**: `emitAIAction()`

#### Notification System
- **Receives**: All significant chat events
- **Produces**: Push notifications, email alerts
- **Purpose**: User notifications for important events
- **Integration Point**: `createChatNotifications()`

#### Ticket System
- **Receives**: Ticket lifecycle events
- **Produces**: Ticket records, assignments, status changes
- **Purpose**: Issue tracking and management
- **Integration Point**: `emitTicketCreated()`, `emitTicketAssigned()`

#### What's New Feed
- **Receives**: Significant platform events
- **Produces**: Feed entries, announcements
- **Purpose**: Platform-wide event broadcasting
- **Integration Point**: Platform Event Bus

#### Analytics Service
- **Receives**: All chat events
- **Produces**: Metrics, dashboards, reports
- **Purpose**: Usage tracking and insights
- **Integration Point**: Event logging (future enhancement)

---

## Event Flow Model

### Message Posted Event Flow

```
1. User posts message in chat
   └─→ Message stored in chatMessages table
   └─→ ChatMessage event emitted to gateway

2. ChatServerHub receives event
   └─→ Validate event
   └─→ Emit to platform event bus
   └─→ Notify WebSocket broadcaster
   └─→ Call subscriber handlers

3. Parallel Processing
   ├─→ AI Brain: Analyze sentiment, generate response
   ├─→ Notifications: Check mention, notify users
   ├─→ Analytics: Log message metrics
   └─→ What's New: Check if significant event

4. Response Events
   ├─→ AI responds: emitAIResponse()
   ├─→ Mention alert: createChatNotifications()
   └─→ Update feed: publishToWhatsNew()
```

### Ticket Created Event Flow

```
1. Support room ticket creation triggered
   └─→ Ticket record created in supportTickets
   └─→ emitTicketCreated() called on gateway

2. ChatServerHub processes ticket_created event
   └─→ Create notification for staff
   └─→ Publish to What's New
   └─→ Notify all subscribers
   └─→ Update gateway metrics

3. Downstream Handlers
   ├─→ Notification Service: Push staff alert
   ├─→ Analytics: Record ticket creation event
   └─→ AI Brain: Analyze ticket for routing
```

---

## Gateway Initialization Process

### Startup Sequence

```
Server Startup
    ↓
ChatServerHub Constructor
    ├─→ Subscribe to Event Bus
    └─→ Log initialization
    ↓
initializeGateway() called (usually in server main)
    ├─→ Check if already initialized
    ├─→ Load Support Rooms (limit 1000)
    │   └─→ Query support_rooms WHERE status='active'
    │   └─→ Get participant counts
    ├─→ Load Organization Rooms (limit 1000)
    │   └─→ Query organization_chat_rooms WHERE status='active'
    │   └─→ Get participant counts
    ├─→ Load Work & Meeting Rooms (limit 2000)
    │   └─→ Query chat_conversations WHERE status='active'
    │   └─→ Filter by conversation_type
    │   └─→ Get participant counts
    ├─→ Start Heartbeat Timer (every 30 seconds)
    │   └─→ Update participant counts
    │   └─→ Remove stale rooms (0 participants, 5+ min old)
    └─→ Set gatewayInitialized = true
    ↓
Ready to Route Events
```

### Data Structures

```typescript
// Active Room Tracking
Map<conversationId, ActiveRoom>

interface ActiveRoom {
  id: string;                    // Room ID in source table
  type: 'support'|'work'|'meeting'|'org';
  conversationId: string;        // Always normalized to conversation ID
  workspaceId: string;
  subject: string;               // Room name/subject
  participantCount: number;      // Real-time participant count
  status: string;                // active/closed/archived
  createdAt: Date;               // Room creation timestamp
  lastActivity: Date;            // Last update from heartbeat
}

// Gateway Statistics
interface GatewayStats {
  totalRooms: number;
  roomsByType: {
    support: number;
    work: number;
    meeting: number;
    org: number;
  };
  totalParticipants: number;
  isInitialized: boolean;
  version: string;
}
```

---

## Configuration Reference

All configuration is centralized in `shared/platformConfig.ts`:

```typescript
CHAT_SERVER_HUB = {
  name: "ChatServerHub",
  version: "1.0.0",
  enabled: true,
  heartbeatIntervalMs: 30000,
  
  roomTypes: {
    support: { enabled: true, ... },
    work: { enabled: true, ... },
    meeting: { enabled: true, ... },
    org: { enabled: true, ... },
  },
  
  connectedSystems: {
    airbrain: { enabled: true, ... },
    notifications: { enabled: true, ... },
    tickets: { enabled: true, ... },
    whatsnew: { enabled: true, ... },
    analytics: { enabled: true, ... },
  },
  
  endpoints: { ... },
  events: { ... },
  rateLimits: { ... },
  timeouts: { ... },
}
```

---

## Event Types

### Chat Events
- `message_posted` - New message in room
- `message_edited` - Message edited
- `message_deleted` - Message removed
- `user_joined_room` - Participant joined
- `user_left_room` - Participant left
- `user_kicked` - User removed by moderator
- `user_silenced` - User prevented from posting
- `user_banned` - User permanently banned
- `room_status_changed` - Room opened/closed

### Ticket Events
- `ticket_created` - New support ticket
- `ticket_assigned` - Ticket assigned to staff
- `ticket_escalated` - Ticket escalated to higher tier
- `ticket_resolved` - Ticket marked resolved
- `ticket_closed` - Ticket closed permanently

### AI Events
- `ai_response` - AI generated a response
- `ai_escalation` - AI escalated to human
- `ai_suggestion` - AI provided suggestion

### Queue Events
- `queue_update` - Queue position changed
- `room_status_changed` - Room status updated

### Moderation Events
- `user_kicked` - User was kicked from room
- `user_silenced` - User was silenced
- `user_banned` - User was banned

### Room Lifecycle
- `room_created` - New room created
- `room_closed` - Room closed
- `staff_joined` - Support agent joined

---

## Performance Characteristics

### Latency
- **Event Emission**: < 10ms (in-memory publish)
- **Database Query**: 50-200ms (room loading)
- **Event Processing**: < 100ms (async handling)
- **Heartbeat Cycle**: 30 seconds

### Scalability
- **Support Rooms**: 1,000 limit (configurable)
- **Conversations**: 2,000 limit (configurable)
- **Concurrent Events**: 100 per minute (rate limited)
- **Active Rooms**: Limited by available memory
- **Participants**: Scales horizontally

### Resource Usage
- **Memory**: ~500KB per 1,000 active rooms
- **Database Connections**: 1 shared connection pool
- **Network**: Event publishing via Platform Event Bus

---

## Security Model

### Access Control
- Room access enforced at application layer
- Gateway validates conversationId exists
- WebSocket messages validated before broadcast

### Data Privacy
- Sensitive metadata filtered before broadcasting
- Encryption keys stored separately
- Conversation content never logged to gateway

### Rate Limiting
- 30 messages/minute per room
- 100 events/minute per workspace
- 20 room creations/minute per workspace

---

## Integration Guide

### Adding a Feature to ChatServerHub

1. **Define Event Type**
   ```typescript
   type ChatEventType = ... | 'your_event_name';
   ```

2. **Add Configuration**
   ```typescript
   CHAT_SERVER_HUB.events.yourEvent = "your:event_name";
   ```

3. **Create Emit Method**
   ```typescript
   async emitYourEvent(params: {...}): Promise<void> {
     await this.emit({
       type: 'your_event_name',
       title: "Your Event",
       description: "...",
       metadata: { ... },
     });
   }
   ```

4. **Wire Subscribers**
   ```typescript
   ChatServerHub.subscribe('your_event_name', async (event) => {
     // Handle event
   });
   ```

5. **Update Routing Logic**
   - Add to `mapToPlatformEventType()`
   - Add to `mapToCategory()`
   - Add to `shouldPersistEvent()`
   - Add to `shouldNotify()`

---

## Troubleshooting Guide

### Issue: Gateway Not Initializing
**Symptoms**: No active rooms loaded, initialization timeout
**Solution**:
1. Check database connection
2. Verify room tables have 'active' status records
3. Check logs for SQL errors
4. Verify CHAT_SERVER_HUB.enabled = true

### Issue: Events Not Propagating
**Symptoms**: Events emitted but not reaching subscribers
**Solution**:
1. Verify subscriber is registered
2. Check event type in shouldNotify/shouldPersist
3. Verify platform event bus is working
4. Check rate limits not exceeded

### Issue: Missing Rooms
**Symptoms**: Some rooms not appearing in active list
**Solution**:
1. Check room status is 'active'
2. Verify conversation has participants
3. Check query limits not exceeded
4. Verify room type is enabled

### Issue: High Memory Usage
**Symptoms**: Memory grows over time
**Solution**:
1. Check heartbeat cleanup logic
2. Verify stale rooms being removed
3. Monitor active room count
4. Consider increasing heartbeat frequency

---

## Future Roadmap

### Phase 2: Advanced Features
- [ ] Room recommendation engine
- [ ] Cross-room search
- [ ] Advanced analytics dashboard
- [ ] ML-based chat categorization

### Phase 3: Enterprise
- [ ] Multi-region gateway deployment
- [ ] Advanced compliance tracking
- [ ] Custom workflow integration
- [ ] Third-party service marketplace

### Phase 4: AI Integration
- [ ] Real-time meeting transcription
- [ ] Automatic meeting summarization
- [ ] Sentiment-based routing
- [ ] Predictive escalation

---

## API Reference

### Gateway Health Endpoints

```typescript
// Check gateway status
GET /api/chat/gateway/health
→ { status: "healthy", version: "1.0.0" }

// Get detailed stats
GET /api/chat/gateway/status
→ {
  totalRooms: 42,
  roomsByType: { support: 10, work: 20, meeting: 10, org: 2 },
  totalParticipants: 156,
  isInitialized: true,
  version: "1.0.0"
}
```

### Room Query Endpoints

```typescript
// Get all active rooms
GET /api/chat/rooms/active
→ ActiveRoom[]

// Get rooms by type
GET /api/chat/rooms/active?type=support
→ ActiveRoom[] (filtered by type)

// Get workspace rooms
GET /api/chat/rooms/active?workspace={id}
→ ActiveRoom[] (filtered by workspace)
```

---

## Deployment Checklist

- [ ] CHAT_SERVER_HUB.enabled = true in config
- [ ] initializeChatServerHub() called in server startup
- [ ] WebSocket broadcaster registered
- [ ] Event subscribers configured
- [ ] Database connection verified
- [ ] Rate limits configured appropriately
- [ ] Heartbeat interval tuned for environment
- [ ] Monitoring/alerting configured
- [ ] Load testing completed
- [ ] Disaster recovery plan documented

---

## References

- **Configuration**: `shared/platformConfig.ts` (CHAT_SERVER_HUB object)
- **Implementation**: `server/services/ChatServerHub.ts`
- **Integration Map**: `docs/CHATSERVERHUB_INTEGRATION_MAP.md`
- **Event Bus**: `server/services/platformEventBus.ts`
- **Related Schemas**: `shared/schema.ts` (chatConversations, supportRooms, etc.)

