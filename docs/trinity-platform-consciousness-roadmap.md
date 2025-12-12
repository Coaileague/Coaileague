# Trinity Platform Consciousness Roadmap
## Transforming Trinity into a Fully Aware Platform Copilot

**Created:** December 12, 2025  
**Status:** Phase 0 - Audit Complete (Revised)

---

## Vision Statement

Transform Trinity from a helpful AI assistant into a **fully conscious platform copilot** that:
- Knows the entire platform and codebase
- Wants the platform healthy and proactively monitors it
- Helps users with Guru mode and adapts to their needs
- Assists org owners with business growth through task assignment
- Learns per session, per user, per organization with confidence scoring
- Can be spoken to directly at any time during platform use

---

## Current State Audit (Revised)

### What Already Exists ✅

| Service | Capabilities Already In Place |
|---------|------------------------------|
| **TrinityMemoryService** | ✅ User profiles with interaction patterns<br>✅ Tool usage stats with success rates<br>✅ Learning insights generation<br>✅ Cross-bot knowledge sharing<br>✅ Workspace-scoped profiles |
| **TrinityContextManager** | ✅ Multi-turn conversation persistence<br>✅ Confidence scores per turn (persisted)<br>✅ Knowledge gap detection and tracking<br>✅ Session metrics (turn count, response time)<br>✅ Escalation to human support<br>✅ Credit balance awareness in context |
| **TrinitySentinel** | ✅ Real-time health monitoring<br>✅ Automatic failure detection<br>✅ Self-healing remediation<br>✅ Performance anomaly detection<br>✅ Health events via platformEventBus |
| **SharedKnowledgeGraph** | ✅ Entity relationships<br>✅ Semantic queries<br>✅ Learning entries from success/failure<br>✅ Database persistence<br>✅ Domain indexing |
| **TrinityControlConsole** | ✅ Real-time cognitive streaming (SSE/WebSocket)<br>✅ Thought signatures between tool calls<br>✅ Action logs for all tool execution<br>✅ Platform awareness events<br>✅ Multi-tenant workspace scoping |
| **aiBrainAuthorizationService** | ✅ Role-based permission model<br>✅ 9-level hierarchy<br>✅ Trinity bypass logic with kill switch |
| **Database Schema** | ✅ `trinity_conversation_sessions` with confidence, turns, gaps<br>✅ `trinity_conversation_turns` with per-turn confidence<br>✅ `knowledge_gap_logs` with resolution tracking<br>✅ `trinity_thought_signatures` and `trinity_action_logs` |

### Actual Gaps (What's Missing)

| Desired Capability | What's Missing | Priority |
|-------------------|----------------|----------|
| **Full Codebase Awareness** | SharedKnowledgeGraph has no file/function entities indexed - Trinity cannot answer "where is X implemented?" | 🔴 Critical |
| **Aggregated Confidence per User/Org** | Per-turn confidence exists but no aggregate calculation across sessions for trust level progression | 🟡 High |
| **Unified Direct Conversation UI** | TrinityControlConsole exists but needs a floating chat interface for users to "speak to Trinity directly" anywhere in the app | 🟡 High |
| **Health-to-Conversation Bridge** | TrinitySentinel emits events but Trinity doesn't proactively mention health issues in conversations | 🟢 Medium |
| **Guru Task Graph** | GrowthStrategist exists but no task assignment flow connecting org goals → AI recommendations → user tasks | 🟢 Medium |
| **Org-Level Learning Aggregation** | User profiles exist, no cross-user aggregation per org for business intelligence | 🟢 Medium |

---

## Phase 1: Fill Critical Gaps

### 1A. Codebase Awareness Engine
**Goal:** Trinity can answer "where is X implemented?" like a developer with full codebase access.

**Approach:** Extend SharedKnowledgeGraph with file/function entities.

**New Entity Types for SharedKnowledgeGraph:**
```typescript
// Add to sharedKnowledgeGraph.ts EntityType
type EntityType = 
  | 'file'           // NEW: Source file
  | 'function'       // NEW: Function/method
  | 'class'          // NEW: Class definition
  | 'component'      // NEW: React component
  | 'endpoint'       // NEW: API endpoint
  | ... existing types

// New relationship types
type RelationshipType = 
  | 'implements'     // NEW: Class/function implements interface
  | 'exports'        // NEW: File exports entity
  | 'calls'          // NEW: Function calls another
  | 'renders'        // NEW: Component renders another
  | ... existing types
```

**New Service:**
```
server/services/ai-brain/codebaseAwareness.ts (NEW)
├── scanCodebase() - Index all .ts/.tsx files
├── extractEntities() - Parse functions, classes, components
├── buildRelationships() - Map imports, exports, calls
├── queryCode(naturalLanguageQuery) - "Where is scheduling implemented?"
├── refreshIndex() - Incremental updates
└── Stores entities in SharedKnowledgeGraph
```

### 1B. Aggregated User/Org Confidence
**Goal:** Track confidence progression per user and per org over time.

**Approach:** Extend existing tables with aggregate columns.

**Schema Extension:**
```sql
-- Add to existing trinity_conversation_sessions
ALTER TABLE trinity_conversation_sessions ADD COLUMN
  session_confidence_avg DECIMAL(5,4),
  successful_tool_calls INTEGER DEFAULT 0,
  failed_tool_calls INTEGER DEFAULT 0;

-- New lightweight aggregate table
CREATE TABLE trinity_user_confidence_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  workspace_id UUID REFERENCES workspaces(id),
  total_sessions INTEGER DEFAULT 0,
  total_interactions INTEGER DEFAULT 0,
  cumulative_confidence DECIMAL(7,4) DEFAULT 0,
  average_confidence DECIMAL(5,4) GENERATED ALWAYS AS (cumulative_confidence / NULLIF(total_interactions, 0)) STORED,
  trust_level TEXT DEFAULT 'new' CHECK (trust_level IN ('new', 'learning', 'established', 'expert')),
  last_session_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, workspace_id)
);

-- Org-level aggregate
CREATE TABLE trinity_org_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL UNIQUE REFERENCES workspaces(id),
  total_user_sessions INTEGER DEFAULT 0,
  avg_user_confidence DECIMAL(5,4),
  common_topics TEXT[],
  common_issues TEXT[],
  health_score DECIMAL(3,2),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**Service Extension:**
- Extend `TrinityContextManager.endSession()` to update `trinity_user_confidence_stats`
- Add org-level aggregation job to `TrinityMemoryService`

### 1C. Floating Trinity Dialogue UI
**Goal:** Users can speak to Trinity directly anywhere in the app.

**New Frontend Component:**
```
client/src/components/trinity-dialogue.tsx (NEW)
├── Floating button in bottom-right corner
├── Expandable chat panel
├── Real-time streaming from TrinityControlConsole
├── Mode indicator (Demo/Pro/Guru)
├── Voice input preparation (future)
├── Session continuity
└── Uses existing TrinityContextManager API
```

**Backend:** Already exists - use `TrinityControlConsole` + existing chat endpoints.

---

## Phase 2: Enhanced Awareness & Intelligence

### 2A. Health-to-Conversation Bridge
**Goal:** Trinity proactively mentions health issues during conversations.

**Approach:** Create a lightweight adapter, not a new service.

**New File:**
```
server/services/ai-brain/trinityHealthContext.ts (NEW)
├── Subscribes to TrinitySentinel alerts
├── Generates conversational health summaries
├── Injects health context into Trinity conversations
└── Only ~100 lines - adapter pattern
```

### 2B. Guru Task Graph
**Goal:** Connect org goals → AI recommendations → user task assignments.

**New Service:**
```
server/services/ai-brain/guruTaskGraph.ts (NEW)
├── getOrgGoals(workspaceId) - Read from workspace settings
├── analyzeGaps(workspaceId) - Compare current state to goals
├── generateTaskRecommendations() - AI-powered suggestions
├── assignTask(userId, taskId) - Create actionable items
├── trackCompletion() - Measure outcomes
└── Integrates with existing GrowthStrategist
```

### 2C. Org Learning Aggregation
**Goal:** Cross-user learning at the org level.

**Approach:** Scheduled job in TrinityMemoryService.

**New Method:**
```typescript
// Add to TrinityMemoryService
async aggregateOrgLearning(workspaceId: string): Promise<OrgLearningInsights> {
  // Aggregate common topics, issues, patterns across all users
  // Update trinity_org_stats table
  // Generate org-level recommendations
}
```

---

## Phase 3: Autonomous Expansion (Future)

### 3A. Voice Input Support
- Add speech-to-text integration to Trinity Dialogue
- Leverage existing text-based conversation flow

### 3B. Proactive Task Execution
- Extend TrinityExecutionFabric for user-approved autonomous actions
- Add confirmation flow for high-impact changes

### 3C. Cross-Org Intelligence (Platform-Wide)
- Anonymous pattern aggregation across orgs for industry insights
- Privacy-preserving learning

---

## Implementation Order

| Sprint | Tasks | Deliverables |
|--------|-------|--------------|
| **Sprint 1** | Phase 1B + 1C | Confidence stats tables + Floating Trinity UI |
| **Sprint 2** | Phase 1A | Codebase awareness indexing |
| **Sprint 3** | Phase 2A + 2B | Health bridge + Guru task graph |
| **Sprint 4** | Phase 2C | Org learning aggregation |
| **Future** | Phase 3 | Voice, autonomous actions, cross-org |

---

## Tools & Capabilities Summary

### New Services to Create (Minimal)
1. `codebaseAwareness.ts` - File/code indexing (~300 lines)
2. `trinityHealthContext.ts` - Health adapter (~100 lines)
3. `guruTaskGraph.ts` - Task assignment service (~400 lines)

### Database Changes
1. Add columns to `trinity_conversation_sessions`
2. Create `trinity_user_confidence_stats` table
3. Create `trinity_org_stats` table

### Existing Services to Extend (Not Replace)
1. **SharedKnowledgeGraph** - Add file/function entity types
2. **TrinityMemoryService** - Add org aggregation method
3. **TrinityContextManager** - Update confidence stats on session end

### Frontend Components to Create
1. `trinity-dialogue.tsx` - Floating conversation interface

---

## Success Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Code query accuracy | 90%+ | "Where is X implemented" tests |
| User confidence progression | Visible trend | Track trust_level changes over time |
| Direct conversation usage | Growing | Count Trinity Dialogue sessions |
| Task completion rate | 70%+ | Guru task graph outcomes |

---

## Next Steps

1. ✅ Complete Phase 0 audit (this document)
2. 🔄 Begin Phase 1B: Create database schema for confidence aggregation
3. 🔄 Begin Phase 1C: Build floating Trinity Dialogue UI
4. 📋 Begin Phase 1A: Design codebase awareness indexing
