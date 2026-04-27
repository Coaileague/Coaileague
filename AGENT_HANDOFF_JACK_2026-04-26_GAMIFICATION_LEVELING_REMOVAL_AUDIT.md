# Jack/GPT Handoff — Gamification Leveling Removal Audit

Branch: `refactor/service-layer`
Date: 2026-04-26

## Bryan clarification

Bryan clarified:

```text
Employee recognition is OK.
Only the game leveling / XP / points / streak / leaderboard layer needs to go.
```

So do **not** delete employee recognition. Remove the legacy game mechanics.

## Current branch context

Latest refactor/service-layer commit observed before this audit:

```text
fbca48f6fa0259546ea17f1011d07ac2d1f8842f
refactor: finance/docs/recruitment/hiring/support service cleanup — -2,000L
```

Claude reported Phase 2 total:

```text
~13,712L removed
```

## Key distinction

### Preserve recognition

Recognition is mounted separately in workforce routes:

```text
/api/recognition -> server/routes/recognitionRoutes.ts
```

`recognitionRoutes.ts` uses recognition tables and workflow:

```text
recognition_awards
recognition_nominations
```

Routes include:

```text
GET   /api/recognition/awards
POST  /api/recognition/nominations
PATCH /api/recognition/nominations/:id/approve
PATCH /api/recognition/nominations/:id/reject
GET   /api/recognition/wall
GET   /api/recognition/officer/:officerId
GET   /api/recognition/pending
GET   /api/recognition/milestones
```

These are OK to keep.

### Remove gamification leveling/game layer

Gamification is mounted separately:

```text
/api/gamification/enhanced -> server/routes/gamificationRoutes.ts
```

This is the legacy game/XP surface. `server/routes/gamificationRoutes.ts` exposes:

```text
GET  /api/gamification/enhanced/stats
GET  /api/gamification/enhanced/leaderboard
POST /api/gamification/enhanced/award-points
```

The route computes/returns:

```text
points
level
streak
rank
badges
recentAchievements
leaderboard
```

Connector search found no active frontend caller evidence for `/api/gamification/enhanced`.

## Files Jack inspected

```text
server/routes/domains/workforce.ts
server/routes/gamificationRoutes.ts
server/routes/recognitionRoutes.ts
server/services/gamification/gamificationService.ts
server/services/gamification/gamificationEvents.ts
server/services/gamification/eventTracker.ts
server/services/gamification/aiBrainNotifier.ts
server/services/gamification/whatsNewIntegration.ts
```

## Game-layer files to remove if local checks pass

### Route file

```text
server/routes/gamificationRoutes.ts
```

Also remove from `server/routes/domains/workforce.ts`:

```ts
import gamificationEnhancedRoutes from "../gamificationRoutes";
app.use("/api/gamification/enhanced", requireAuth, ensureWorkspaceAccess, gamificationEnhancedRoutes);
```

### Service files

```text
server/services/gamification/gamificationService.ts
server/services/gamification/gamificationEvents.ts
server/services/gamification/eventTracker.ts
server/services/gamification/aiBrainNotifier.ts
server/services/gamification/whatsNewIntegration.ts
```

These implement:

```text
employeePoints
pointsTransactions
leaderboardCache
XP points
levels
streaks
badges/achievements as game mechanics
AI Brain gamification milestone notifications
What's New gamification achievement announcements
```

## Keep files/routes

```text
server/routes/recognitionRoutes.ts
```

Do not delete recognition tables or routes:

```text
recognition_awards
recognition_nominations
```

## Schema / DB caution

Do **not** delete shared schema tables in this batch unless Claude has full migration coverage.

Likely old game tables:

```text
achievements
employeeAchievements
employeePoints
pointsTransactions
leaderboardCache
```

Safer first pass:

1. remove route mount and service files
2. leave schema/table definitions alone
3. build + boot
4. later migration/schema cleanup only after proving no runtime references

## Local verification commands for Claude

Run before deletion:

```bash
rg "/api/gamification/enhanced|api/gamification/enhanced" client server shared scripts tests
rg "gamificationRoutes|gamificationEnhancedRoutes" server client shared scripts tests
rg "gamificationService|GamificationService|gamificationEvents|emitGamificationEvent|GamificationEventTracker|AiBrainNotifier|WhatsNewGamificationBridge" server client shared scripts tests
rg "employeePoints|pointsTransactions|leaderboardCache|employeeAchievements|achievements" server client shared --glob '*.{ts,tsx}'
rg "/api/recognition|recognitionRoutes|recognition_awards|recognition_nominations" server client shared scripts tests
```

Expected safe outcome:

- `/api/gamification/enhanced` only appears in workforce mount / route file
- gamification services only reference each other or dead initialization hooks
- recognition route remains active and separate

## Recommended deletion batch

If local `rg` confirms no real non-gamification callers:

```bash
git rm server/routes/gamificationRoutes.ts
git rm server/services/gamification/gamificationService.ts
git rm server/services/gamification/gamificationEvents.ts
git rm server/services/gamification/eventTracker.ts
git rm server/services/gamification/aiBrainNotifier.ts
git rm server/services/gamification/whatsNewIntegration.ts
```

Then edit `server/routes/domains/workforce.ts` to remove:

```text
gamificationRoutes import
/api/gamification/enhanced mount
```

Also remove any startup/bootstrap calls if local `rg` finds them:

```text
GamificationEventTracker.initializeEventListeners()
AiBrainNotifier.initializeListeners()
WhatsNewGamificationBridge.initializeListeners()
```

## Required validation

After edits:

```bash
node build.mjs
rg "require\(" server/ --glob "*.ts" | grep -v "node_modules|.d.ts|//|build.mjs" || true
python3 <improved router-prefix scanner from AGENT_HANDOFF.md>
rg "<<<<<<<|=======|>>>>>>>" .
```

Because this removes a route mount and service files, run real DB boot before merge:

```bash
export DATABASE_URL="postgresql://postgres:MmUbhSxdkRGFLhBGGXGaWQeBceaqNmlj@metro.proxy.rlwy.net:40051/railway"
export SESSION_SECRET="coaileague-dev-test-session-secret-32chars"
node dist/index.js > /tmp/boot_test.txt 2>&1 &
sleep 18
curl -s http://localhost:5000/api/workspace/health
rg "ReferenceError|is not defined|CRITICAL.*Failed" /tmp/boot_test.txt
```

Expected:

```text
/api/workspace/health returns Unauthorized / 401
no ReferenceError / is not defined / CRITICAL failed lines
```

## User intent summary

The product should keep employee recognition/culture-building but remove video-game-style mechanics that add complexity and serve no purpose:

```text
REMOVE: XP, points, levels, streaks, leaderboard, badges-as-game-loop
KEEP: officer recognition, awards, commendations, nominations, milestones
```
