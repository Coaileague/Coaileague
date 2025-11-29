# AI Brain & ChatServerHub Integration Audit

**Completed**: November 29, 2025  
**Status**: INTEGRATION PARTIALLY IMPLEMENTED - ISSUES FOUND

---

## Executive Summary

The AI Brain and ChatServerHub integration is **partially implemented** with bidirectional communication in place, but **critical room-routing gaps** prevent AI responses from being delivered to the correct chatrooms. The infrastructure exists but implementation is incomplete.

---

## 1. Does ChatServerHub Call aiBrainService?

### Answer: **NO** ❌

ChatServerHub does **NOT** call aiBrainService directly. Instead:
- ChatServerHub receives events from the platform event bus
- ChatServerHub handles routing, broadcasting, and notifications
- aiBrainService is invoked independently via API routes (see `server/ai-brain-routes.ts`)

### Architecture Pattern:
```
API Routes / HelpAI Bot Service
    ↓
AIBrainService.enqueueJob()
    ↓ (job completes)
ChatServerHub.emitAIBrainResponse()
    ↓
Platform Event Bus
    ↓
WebSocket Broadcaster → Correct Room
```

**Verdict**: Correct separation of concerns. ChatServerHub doesn't need to call aiBrainService directly.

---

## 2. Does aiBrainService Emit Events Back Through ChatServerHub?

### Answer: **PARTIAL** ⚠️

**Finding**: aiBrainService DOES emit events, but **implementation is incomplete**.

### Current Implementation

**File**: `server/services/ai-brain/aiBrainService.ts` (line 231)

```typescript
// Job completion triggers AI event emission
ChatServerHub.emitAIBrainResponse({
  jobId: job.id,
  workspaceId: job.workspaceId || undefined,
  userId: job.userId || undefined,
  skill: job.skill,
  status: finalStatus,
  confidenceScore,
  requiresApproval,
  executionTimeMs: executionTime,
}).catch((err: Error) => console.error('[AI Brain] Failed to emit event:', err));
```

### Issues Found:

1. **Missing conversationId**: Events don't include `conversationId`, breaking room-scoped routing
2. **Bypasses ChatServerHub.emit()**: `emitAIBrainResponse()` publishes directly to `platformEventBus` instead of using `ChatServerHub.emit()`
3. **Single emission point**: Only one place in the entire service emits events (line 231)
4. **No escalation/suggestion events**: Only handles general "response" completion, missing specific event types

### What Should Happen:

When a skill like `helpos_support` completes:
1. Include `conversationId` in job metadata
2. Call `ChatServerHub.emit()` with appropriate event type (ai_response, ai_escalation, ai_suggestion)
3. Include `conversationId` in metadata for room routing
4. Let ChatServerHub handle WebSocket broadcasting to the correct room

---

## 3. Are AI Events Properly Mapped?

### Answer: **YES** ✅

**File**: `server/services/ChatServerHub.ts` (lines 298-303)

```typescript
case 'ai_response':
  return 'ai_brain_action';
case 'ai_escalation':
  return 'ai_escalation';
case 'ai_suggestion':
  return 'ai_suggestion';
```

### Mappings Verified:

| Chat Event Type | Platform Event Type | Category | Should Notify | Should Persist |
|---|---|---|---|---|
| `ai_response` | `ai_brain_action` | feature | ❌ NO | ❌ NO |
| `ai_escalation` | `ai_escalation` | feature | ✅ YES | ✅ YES |
| `ai_suggestion` | `ai_suggestion` | feature | ❌ NO | ❌ NO |

**Verdict**: Mappings are correct and comprehensive.

---

## 4. Does ChatServerHub Have Method to Route AI Responses to Correct Rooms?

### Answer: **YES, BUT BROKEN** ⚠️

### Infrastructure in Place:

**File**: `server/services/ChatServerHub.ts`

1. **Room routing method**: `broadcastChatEvent()` (line 197)
   ```typescript
   private broadcastChatEvent(event: ChatEvent): void {
     if (!this.wsBroadcaster) return;
     const broadcastPayload = {
       type: 'chat_event',
       conversationId: event.metadata.conversationId, // KEY FIELD
       ...
     };
     this.wsBroadcaster(broadcastPayload);
   }
   ```

2. **WebSocket broadcaster registered**: `server/websocket.ts`
   ```typescript
   ChatServerHub.setWebSocketBroadcaster((event) => {
     const { conversationId, workspaceId, userId, payload } = event;
     
     if (conversationId) {
       const clients = conversationClients.get(conversationId);
       if (clients) {
         // Broadcast to all clients in this conversation
         clients.forEach((client) => {
           client.send(eventPayload);
         });
       }
     }
   });
   ```

3. **Convenience method**: `emitAIAction()` (line 530)
   ```typescript
   async emitAIAction(params: {
     conversationId: string;
     actionType: 'response' | 'escalation' | 'suggestion';
     ...
   }): Promise<void>
   ```

### The Problem:

**aiBrainService DOESN'T USE ANY OF THESE METHODS**

It calls `emitAIBrainResponse()` instead, which:
- Publishes directly to `platformEventBus` 
- Doesn't include `conversationId` in metadata
- Bypasses room-scoped broadcasting
- Results in no WebSocket message to the correct chatroom

### Missing Integration:

When `helpos_support` skill completes with a chat response, it should:
1. Extract `conversationId` from job metadata
2. Call `ChatServerHub.emitAIAction()` instead of `emitAIBrainResponse()`
3. Pass the AI response text and appropriate action type
4. Let ChatServerHub handle routing to the conversation clients

---

## Critical Issues Identified

### Issue #1: No Conversation Context in AI Jobs
**Severity**: HIGH

AI Brain jobs don't track which conversation they're serving. When a skill completes, there's no way to know which chatroom to send the response to.

**Current**: Skills receive generic `workspaceId` and `userId` only  
**Required**: Skills need `conversationId` or `sessionId` in their input context

### Issue #2: Direct platformEventBus Publication
**Severity**: HIGH

`emitAIBrainResponse()` bypasses `ChatServerHub.emit()` and publishes directly to the event bus.

**Current**:
```typescript
async emitAIBrainResponse(params: { jobId, workspaceId, userId, skill, ... }) {
  await platformEventBus.publish({ ... }); // WRONG: bypasses room routing
}
```

**Required**: Use `ChatServerHub.emit()` with proper metadata

### Issue #3: Missing Event Types for Context-Aware Events
**Severity**: MEDIUM

Some AI actions should be emitted as specific event types (escalation, suggestion) but there's no code path to do so.

**Example**: When helpos_support detects escalation need, it should emit `ai_escalation` event, not generic `ai_brain_action`

### Issue #4: No Error/Timeout Handling
**Severity**: MEDIUM

If an AI skill fails or times out, no negative event is emitted to the chatroom.

**Missing**: 
- `ai_error` event type
- Error messaging back to conversation
- Escalation trigger on timeout

---

## Event Flow Analysis

### Current (Broken) Flow:
```
User Message in Chat
    ↓
HelpAI Bot detects support question
    ↓
AIBrainService.enqueueJob({ skill: 'helpos_support', input: message })
    ↓
[AI Processing]
    ↓
ChatServerHub.emitAIBrainResponse({ jobId, workspaceId, userId, ... })
    ⚠️ MISSING: conversationId
    ↓
platformEventBus.publish({ type: 'ai_brain_action', metadata: { jobId, ... } })
    ↓
WebSocket Broadcaster checks conversationId (undefined)
    ↓
NO MESSAGE SENT TO CHATROOM ❌
```

### Required (Fixed) Flow:
```
User Message in Chat
    ↓
HelpAI Bot detects support question
    ↓
AIBrainService.enqueueJob({
  skill: 'helpos_support',
  input: { message, ... },
  conversationContext: { conversationId, sessionId, ... } ← NEW
})
    ↓
[AI Processing]
    ↓
ChatServerHub.emitAIAction({
  conversationId: job.conversationContext.conversationId, ← KEY
  actionType: 'response' | 'escalation',
  ...
})
    ↓
ChatServerHub.emit() → broadcastChatEvent()
    ↓
WebSocket Broadcaster routes by conversationId
    ↓
✅ Message delivered to correct chatroom
```

---

## Recommendations

### Priority 1: Fix Room Routing (CRITICAL)

1. **Extend EnqueueJobRequest interface** to include conversation context:
   ```typescript
   export interface EnqueueJobRequest {
     conversationContext?: {
       conversationId?: string;
       sessionId?: string;
       roomSlug?: string;
     };
     // ... existing fields
   }
   ```

2. **Update aiBrainService to track conversation context**:
   - Store conversation context with job
   - Include it in job metadata for retrieval

3. **Replace emitAIBrainResponse() with proper event emission**:
   - For general jobs: keep `emitAIBrainResponse()` for approval flow
   - For chat-related jobs: call `ChatServerHub.emitAIAction()` with conversationId
   - Let ChatServerHub handle room routing

### Priority 2: Add Missing Event Types

1. Add `ai_error` and `ai_timeout` event types to ChatEventType
2. Map them in `mapToPlatformEventType()` and `mapToCategory()`
3. Emit on job failure

### Priority 3: Enhance Job Input Interfaces

Define specific input interfaces for each skill type:
- `HelpAISupportInput` with message context
- `ScheduleOSInput` with constraints
- etc.

### Priority 4: Add Bidirectional Feedback

Implement feedback loop from ChatServerHub back to aiBrainService:
- User reactions to AI responses
- Escalation acceptance/rejection
- FAQ upvoting for learning

---

## Integration Checklist

- [x] ChatEventType includes ai_response, ai_escalation, ai_suggestion
- [x] mapToPlatformEventType handles AI event types
- [x] mapToCategory assigns AI events to 'feature' category
- [x] shouldPersistEvent includes ai_escalation
- [x] shouldNotify includes ai_escalation
- [x] getNotificationType maps AI events to ai_action_completed
- [x] ChatServerHub has emitAIAction convenience method
- [x] WebSocket broadcaster handles conversationId routing
- [x] Platform event bus integration verified
- [ ] **aiBrainService includes conversationId in job metadata** ← MISSING
- [ ] **aiBrainService calls ChatServerHub.emitAIAction()** ← MISSING
- [ ] **Error/timeout events emitted on job failure** ← MISSING
- [ ] **Skills receive conversation context** ← MISSING

---

## Code Examples

### Example 1: Proper AI Response Routing

```typescript
// In aiBrainService.executeJob() after job completes
if (job.conversationContext?.conversationId) {
  // Chat-scoped job - route response through ChatServerHub
  const eventType = requiresApproval ? 'ai_escalation' 
                  : determinedEventType ? 'ai_suggestion'
                  : 'ai_response';
  
  await ChatServerHub.emitAIAction({
    conversationId: job.conversationContext.conversationId,
    workspaceId: job.workspaceId,
    actionType: eventType === 'ai_escalation' ? 'escalation'
              : eventType === 'ai_suggestion' ? 'suggestion'
              : 'response',
    title: `AI ${eventType.replace(/_/g, ' ').toUpperCase()}`,
    description: output?.response || output?.summary || 'AI processing complete',
    ticketNumber: job.conversationContext.ticketNumber,
  });
} else {
  // Workspace-scoped job - use approval flow
  await ChatServerHub.emitAIBrainResponse({
    jobId: job.id,
    workspaceId: job.workspaceId,
    userId: job.userId,
    skill: job.skill,
    status: finalStatus,
    confidenceScore,
    requiresApproval,
    executionTimeMs: executionTime,
  });
}
```

### Example 2: Passing Conversation Context

```typescript
// In helpAIBotService or chat routes
await aiBrainService.enqueueJob({
  workspaceId: workspace.id,
  userId: user.id,
  conversationContext: {
    conversationId: conversation.id,
    sessionId: session.id,
    roomSlug: conversation.roomSlug,
    ticketNumber: ticket?.number,
  },
  skill: 'helpos_support',
  input: {
    message: userMessage,
    conversationHistory: history,
  },
  priority: 'high',
});
```

---

## Conclusion

**Overall Integration Status**: ⚠️ **PARTIAL (60% Complete)**

The ChatServerHub and aiBrainService integration has the right architecture in place, but critical implementation gaps prevent AI responses from reaching chatrooms:

1. ✅ Event types defined and mapped
2. ✅ WebSocket routing infrastructure in place
3. ✅ Notification and persistence logic ready
4. ❌ AI jobs don't track conversations
5. ❌ Event emission bypasses room routing
6. ❌ Missing error/timeout handling

**Estimated Fix Effort**: 2-4 hours  
**Risk Level**: Medium (non-breaking for non-chat AI features)

The fixes are localized to aiBrainService and will not impact existing chat functionality, as they add new code paths rather than modifying existing ones.

