# API Gaps Quick Reference
**Generated:** November 29, 2025  
**Overall Completion:** 80% (73/91 endpoints implemented)

---

## 🔴 CRITICAL MISSING ENDPOINTS (Implement Immediately)

### Chat System - 3 gaps
```
❌ PUT/PATCH /api/chat/rooms/:roomId
   └─ Update room name, description, autoCloseAt, etc.
   └─ Impact: Can't modify rooms after creation
   └─ Effort: 2-3 hours | Priority: CRITICAL

❌ DELETE /api/chat/rooms/:roomId  
   └─ Delete room permanently
   └─ Impact: Can't remove rooms
   └─ Effort: 2-3 hours | Priority: HIGH

❌ PATCH /api/chat/message/:id/edit
   DELETE /api/chat/message/:id
   └─ Edit/delete individual messages
   └─ Impact: No message editing/deletion support
   └─ Effort: 4-5 hours | Priority: HIGH
```

### Notifications - 2 gaps
```
❌ GET /api/notifications/preferences
   PATCH /api/notifications/preferences
   └─ Get/update user notification preferences
   └─ Impact: Users can't customize notifications
   └─ Effort: 3-4 hours | Priority: CRITICAL

❌ POST /api/notifications/subscribe
   POST /api/notifications/unsubscribe
   └─ Manage notification subscriptions
   └─ Impact: No subscription management
   └─ Effort: 2-3 hours | Priority: HIGH
```

### Tickets - 1 gap
```
❌ DELETE /api/support/tickets/:id
   └─ Delete support ticket
   └─ Impact: Can't remove tickets
   └─ Effort: 2 hours | Priority: MEDIUM
```

---

## 🟡 MEDIUM PRIORITY GAPS

### AI System - 3 gaps
```
❌ GET /api/ai/responses
   └─ Get AI response history
   └─ Impact: Can't view past AI responses
   └─ Effort: 3-4 hours | Priority: MEDIUM

❌ POST /api/ai/responses/:id/feedback
   └─ Submit feedback on AI response
   └─ Impact: No AI model feedback loop
   └─ Effort: 2-3 hours | Priority: MEDIUM

❌ GET /api/ai/suggestions
   └─ Get AI-generated suggestions
   └─ Impact: Suggestions scattered across endpoints
   └─ Effort: 3-4 hours | Priority: MEDIUM
```

### Rooms - 2 gaps
```
❌ PATCH /api/chat/rooms/:roomId/settings
   └─ Update room settings (privacy, retention, etc.)
   └─ Impact: Can't change room settings
   └─ Effort: 3-4 hours | Priority: MEDIUM

❌ GET /api/chat/rooms/:roomId/stats
   └─ Get room statistics
   └─ Impact: No room analytics
   └─ Effort: 2-3 hours | Priority: LOW
```

### Tickets - 1 gap
```
❌ PATCH /api/support/tickets/:id/status
   └─ Explicit status update endpoint
   └─ Impact: Status updates via general PATCH only
   └─ Effort: 1-2 hours | Priority: MEDIUM
```

---

## 🟢 LOW PRIORITY GAPS

### Chat - 1 gap
```
❌ GET /api/chat/history/:roomId
   └─ Shorthand for conversation history
   └─ Impact: Use /api/chat/conversations/:id/messages instead
   └─ Effort: Optional | Priority: LOW
```

### AI - 1 gap
```
❌ GET /api/ai/models
   └─ List available AI models
   └─ Impact: Models hardcoded in system
   └─ Effort: Optional | Priority: LOW
```

### Rooms - 1 gap
```
❌ DELETE /api/chat/rooms/:roomId (permanent deletion)
❌ POST /api/chat/rooms/:roomId/archive (soft delete)
   └─ Room deletion/archival
   └─ Impact: Use close endpoint instead
   └─ Effort: Optional | Priority: LOW
```

---

## IMPLEMENTATION ROADMAP

### Phase 1: Quick Wins (Week 1 - 12-15 hours)
1. **PATCH /api/chat/rooms/:roomId** (2-3 hrs) - Core room updates
2. **GET/PATCH /api/notifications/preferences** (3-4 hrs) - User preferences  
3. **PATCH /api/chat/message/:id/edit** (2-3 hrs) - Message editing
4. **DELETE /api/support/tickets/:id** (2 hrs) - Ticket deletion
5. **POST/POST /api/notifications/subscribe/unsubscribe** (2-3 hrs) - Subscriptions

### Phase 2: Important Features (Week 2-3 - 12-14 hours)
1. **DELETE /api/chat/message/:id** (2-3 hrs) - Message deletion
2. **GET /api/ai/responses** (3-4 hrs) - Response history
3. **POST /api/ai/responses/:id/feedback** (2-3 hrs) - AI feedback
4. **PATCH /api/support/tickets/:id/status** (1-2 hrs) - Status endpoint
5. **PATCH /api/chat/rooms/:roomId/settings** (3-4 hrs) - Room settings

### Phase 3: Polish (Week 4+ - 8-10 hours)
1. **GET /api/ai/suggestions** (3-4 hrs) - Unified suggestions
2. **GET /api/chat/rooms/:roomId/stats** (2-3 hrs) - Room analytics
3. **DELETE /api/chat/rooms/:roomId** (2 hrs) - Room deletion
4. **GET /api/ai/models** (1 hr) - Model enumeration

---

## FEATURE COMPLETION BY SYSTEM

### Chat System
```
✅ Room creation/joining (100%)
✅ Conversation management (100%)
✅ Message sending (100%)
❌ Message editing/deletion (0%)
❌ Room updates (0%)
❌ Room deletion (0%)
─────────────────────
Overall: 67% complete
```

### Ticket System
```
✅ CRUD operations (100%)
✅ Escalation management (100%)
❌ Deletion (0%)
❌ Explicit status endpoint (0%)
─────────────────────
Overall: 83% complete
```

### AI System
```
✅ Brain system (100%)
✅ Status endpoints (100%)
✅ Gemini integration (100%)
❌ Response history (0%)
❌ Response feedback (0%)
❌ Suggestions (0%)
─────────────────────
Overall: 60% complete
```

### Room Management
```
✅ List/Create/Join (100%)
✅ Participant management (100%)
❌ Room updates (0%)
❌ Settings management (0%)
❌ Deletion (0%)
─────────────────────
Overall: 60% complete
```

### Notifications
```
✅ Get/Mark read/Delete (100%)
❌ Preferences (0%)
❌ Subscriptions (0%)
─────────────────────
Overall: 50% complete
```

### What's New
```
✅ All endpoints (100%)
─────────────────────
Overall: 100% complete ✓
```

---

## WHICH FEATURES NEED THESE ENDPOINTS

### Critical for MVP
- ✅ What's New system - **Complete**
- ✅ Basic chat - **Mostly complete** (missing message editing)
- ✅ Support tickets - **Mostly complete** (missing deletion)
- ❌ Full notification control - **Incomplete** (missing preferences/subscriptions)

### Important for Full Release
- ⚠️ Advanced chat features - **Partially complete** (missing room updates, message editing)
- ⚠️ AI feedback loop - **Incomplete** (no feedback endpoint)
- ⚠️ Room customization - **Incomplete** (no settings endpoint)

### Nice-to-Have
- 🟢 Message deletion - Would improve user experience
- 🟢 Room analytics - Would help managers
- 🟢 AI suggestions aggregation - Would simplify UI

---

## WORKAROUNDS FOR MISSING ENDPOINTS

### Until `/api/chat/rooms/:roomId` (update) exists:
- Use general PATCH for metadata updates (works but not explicit)
- Or: Re-create room and invite participants again (not ideal)

### Until `/api/chat/message/:id/edit` exists:
- Delete old message, send new one
- Or: Accept message as-is and chat about corrections

### Until `/api/notifications/preferences` exists:
- Store preferences client-side in localStorage
- Or: Add preference UI but don't persist server-side

### Until `/api/ai/responses` exists:
- Fetch responses from individual endpoints (gemini, etc.)
- Or: Query audit logs for AI actions

---

## TESTING CHECKLIST

Before deploying missing endpoints:

- [ ] New endpoint returns appropriate status codes (201 for POST, 200 for GET, etc.)
- [ ] RBAC checks in place (requireAuth, requireManager, etc.)
- [ ] Rate limiting applied (chatMessageLimiter, mutationLimiter, readLimiter)
- [ ] Audit logging for sensitive operations
- [ ] Input validation with Zod schemas
- [ ] Error messages are user-friendly
- [ ] Affected frontend components tested
- [ ] Database migrations run if schema changes needed
- [ ] Performance tested with realistic data volumes

---

## FILES TO MODIFY

### Backend Implementation
- [ ] `server/routes.ts` - Main routes file (add new endpoints)
- [ ] `server/routes/chat-rooms.ts` - Chat room operations
- [ ] `server/routes/*.ts` - Respective domain route files
- [ ] `server/storage.ts` - Storage interface if needed
- [ ] `shared/schema.ts` - Zod schemas for validation

### Frontend Updates  
- [ ] `client/src/config/apiEndpoints.ts` - Add new endpoints to config
- [ ] Components using affected features - Update to use new endpoints
- [ ] React Query hooks - Update queries/mutations

---

## SUMMARY STATS

| Metric | Value |
|--------|-------|
| Total Endpoints Audited | 91 |
| Implemented | 73 (80%) |
| Missing | 18 (20%) |
| Critical Gaps | 7 |
| Medium Gaps | 6 |
| Low Gaps | 5 |
| Estimated Implementation Time | ~65-75 hours |
| Highest Priority System | Notifications (50% complete) |
| Lowest Priority System | What's New (100% complete ✓) |

---

## NEXT STEPS

1. **Review** this report with the team
2. **Prioritize** implementation based on business needs
3. **Assign** gaps to developers for implementation
4. **Track** progress on Phase 1 endpoints
5. **Test** new endpoints against checklist
6. **Update** frontend to use new endpoints
7. **Monitor** production deployment

