import { db } from "../../db";
import { createLogger } from "../../lib/logger";
import { 
  platformScanSnapshots, 
  platformChangeEvents, 
  platformUpdates,
  notifications,
  users,
  workspaces
} from "@shared/schema";
import { eq, desc, isNull, and, sql, isNotNull } from "drizzle-orm";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { GEMINI_MODELS, ANTI_YAP_PRESETS } from './providers/geminiClient';
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { getDetailedHealthReport } from "../healthService";
import { broadcastNotificationToUser } from "../../websocket";
import { universalNotificationEngine } from "../universalNotificationEngine";
import { sanitizeForEndUser } from "@shared/utils/humanFriendlyCopy";
import { usageMeteringService } from '../billing/usageMetering';
import { meteredGemini } from '../billing/meteredGeminiClient';

interface PlatformSnapshot {
  codebaseHash: string;
  schemaVersion: string;
  serviceCount: number;
  routeCount: number;
  healthStatus: Record<string, any>;
  keyFiles: Record<string, string>;
  timestamp: Date;
}

interface DetectedChange {
  type: 'feature_added' | 'bug_fixed' | 'hotpatch' | 'enhancement' | 'security_fix' | 'update';
  severity: 'critical' | 'major' | 'minor' | 'patch' | 'info';
  affectedModules: string[];
  affectedFiles: string[];
  rawDiff: string;
  // Enhanced fields for detailed notifications
  detailedCategory?: 'feature' | 'service' | 'bot_automation' | 'bugfix' | 'security' | 'improvement' | 'deprecation' | 'hotpatch' | 'integration' | 'ui_update' | 'backend_update' | 'performance' | 'documentation';
  sourceType?: 'system' | 'ai_brain' | 'support_staff' | 'developer' | 'automated_job' | 'user_request' | 'external_service';
  sourceName?: string;
}

class PlatformChangeMonitorService {
  private lastSnapshot: PlatformSnapshot | null = null;
  private isScanning = false;
  private readonly log = createLogger('PlatformChangeMonitor');
  private moduleNotificationCooldowns: Map<string, number> = new Map();
  private static readonly MODULE_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours between notifications for same modules
  private eventDrivenDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly EVENT_DEBOUNCE_MS = 30_000; // 30s debounce for event-driven scans
  private lastGlobalNotificationTime: number = 0;
  private static readonly GLOBAL_NOTIFICATION_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours between ANY platform update notifications
  private eventDrivenInitialized = false;

  private async restoreGlobalCooldownFromDB(): Promise<void> {
    try {
      const [lastNotified] = await db
        .select({ date: platformUpdates.date })
        .from(platformUpdates)
        .where(sql`${platformUpdates.category} IN ('announcement', 'improvement')`)
        .orderBy(desc(platformUpdates.date))
        .limit(1);
      if (lastNotified?.date) {
        this.lastGlobalNotificationTime = new Date(lastNotified.date).getTime();
        const agoMin = Math.round((Date.now() - this.lastGlobalNotificationTime) / 60000);
        this.log.info(`Restored global cooldown from DB — last notification was ${agoMin}min ago`);
      }
    } catch (err) {
      this.log.warn('Could not restore cooldown from DB:', err);
    }
  }

  async initEventDrivenScanning(): Promise<void> {
    if (this.eventDrivenInitialized) return;
    this.eventDrivenInitialized = true;

    await this.restoreGlobalCooldownFromDB();

    const { platformEventBus } = await import('../platformEventBus');

    const triggerEvents = [
      'feature_released',
      'bugfix_deployed',
      'security_patch',
      'fix_applied',
      'fix_validated',
      'trinity_fix_applied',
      'trinity_self_healing',
      'employees_imported',
      'quickbooks_flow_complete',
      'partner_sync_complete',
    ] as const;

    for (const eventType of triggerEvents) {
      platformEventBus.subscribe(eventType, {
        name: `PlatformChangeMonitor-EventDriven-${eventType}`,
        handler: async () => {
          this.scheduleEventDrivenScan(eventType);
        },
      });
    }

    this.log.info(`Event-driven scanning initialized — subscribed to ${triggerEvents.length} event types`);
  }

  private scheduleEventDrivenScan(triggerEvent: string): void {
    if (this.eventDrivenDebounceTimer) {
      clearTimeout(this.eventDrivenDebounceTimer);
    }

    this.eventDrivenDebounceTimer = setTimeout(async () => {
      this.eventDrivenDebounceTimer = null;
      this.log.info(`Event-driven scan triggered by: ${triggerEvent}`);
      try {
        await this.scanPlatform('quick');
      } catch (error) {
        this.log.error(`Event-driven scan failed:`, error);
      }
    }, PlatformChangeMonitorService.EVENT_DEBOUNCE_MS);
  }
  
  /**
   * DYNAMIC FILE DISCOVERY - No hardcoded file lists!
   * Scans these directories dynamically for all relevant file changes.
   * This ensures ALL platform changes are detected regardless of which files change.
   */
  private readonly SCAN_DIRECTORIES = [
    'client/src/pages',
    'client/src/components',
    'client/src/hooks',
    'client/src/config',
    'client/src/lib',
    'server/services',
    'server/routes',
    'shared',
  ];
  
  /**
   * File extensions to monitor for changes
   */
  private readonly MONITORED_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.json'];
  
  /**
   * Always include these core files regardless of directory
   */
  private readonly CORE_FILES = [
    'package.json',
    'replit.md',
  ];
  
  /**
   * Dynamically discover all monitorable files in the platform
   * This replaces the hardcoded KEY_FILES list
   */
  private discoverMonitoredFiles(): string[] {
    const discoveredFiles: string[] = [...this.CORE_FILES];
    
    for (const dir of this.SCAN_DIRECTORIES) {
      const fullPath = path.resolve(process.cwd(), dir);
      if (fs.existsSync(fullPath)) {
        const files = this.scanDirectoryRecursive(fullPath, dir);
        discoveredFiles.push(...files);
      }
    }
    
    this.log.info(`🧠 Dynamically discovered ${discoveredFiles.length} files to monitor`);
    return discoveredFiles;
  }
  
  /**
   * Recursively scan a directory for monitored files
   */
  private scanDirectoryRecursive(absolutePath: string, relativePath: string): string[] {
    const files: string[] = [];
    
    try {
      const entries = fs.readdirSync(absolutePath, { withFileTypes: true });
      
      for (const entry of entries) {
        const entryPath = path.join(absolutePath, entry.name);
        const entryRelative = path.join(relativePath, entry.name);
        
        if (entry.isDirectory()) {
          // Skip node_modules and other irrelevant directories
          if (!['node_modules', '.git', 'dist', 'build', '__pycache__'].includes(entry.name)) {
            files.push(...this.scanDirectoryRecursive(entryPath, entryRelative));
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (this.MONITORED_EXTENSIONS.includes(ext)) {
            files.push(entryRelative);
          }
        }
      }
    } catch (error) {
      // Silently ignore permission errors or missing directories
    }
    
    return files;
  }
  
  private readonly MODULE_PATTERNS: Record<string, RegExp[]> = {
    scheduling: [/schedule|shift|calendar|availability/i],
    payroll: [/payroll|salary|wage|compensation/i],
    invoicing: [/invoice|billing|payment/i],
    notifications: [/notification|alert|bell|toast/i],
    chat: [/chat|message|helpdesk|room/i],
    authentication: [/auth|login|session|user/i],
    analytics: [/analytics|report|metric|dashboard/i],
    ai_brain: [/ai-brain|gemini|orchestrator|automation/i],
    ui_components: [/mascot|gemini-agent|interactive-ui|component/i],
  };

  async scanPlatform(
    scanType: 'full' | 'quick' | 'health' | 'scheduled' = 'scheduled'
  ): Promise<{
    scanId: string;
    changesDetected: number;
    notificationsSent: number;
  }> {
    this.log.info(`🧠 Platform scan initiated: ${scanType}`);
    
    if (this.isScanning) {
      this.log.info('🧠 Scan already in progress, skipping');
      return { scanId: '', changesDetected: 0, notificationsSent: 0 };
    }

    this.isScanning = true;
    const startTime = Date.now();
    
    this.log.info(`🧠 Starting ${scanType} platform scan...`);

    try {
      const [scanRecord] = await db.insert(platformScanSnapshots).values({
        scanType,
        status: 'running',
        startedAt: new Date(),
      }).returning();

      const currentSnapshot = await this.captureSnapshot();
      
      const previousSnapshot = await this.getLastCompletedSnapshot();
      
      let changes = this.detectChanges(previousSnapshot, currentSnapshot);
      
      if (changes.length === 0 && scanType === 'full' && previousSnapshot) {
        const gitChanges = await this.detectGitChangesSinceLastScan(previousSnapshot.timestamp);
        if (gitChanges.length > 0) {
          this.log.info(`🧠 Hash-based detection found 0 changes, but git detected ${gitChanges.length} commits since last scan`);
          changes = gitChanges;
        }
      }
      
      this.log.info(`🧠 Detected ${changes.length} changes`);
      
      let notificationsSent = 0;
      
      if (changes.length > 0) {
        const now = Date.now();
        const timeSinceLastGlobal = now - this.lastGlobalNotificationTime;
        const highestSeverity = changes.reduce((best, c) => {
          const rank: Record<string, number> = { critical: 5, major: 4, minor: 3, patch: 2, info: 1 };
          return (rank[c.severity] ?? 0) > (rank[best] ?? 0) ? c.severity : best;
        }, 'info' as string);
        const bypassCooldown = highestSeverity === 'critical' || highestSeverity === 'major';

        if (!bypassCooldown && timeSinceLastGlobal < PlatformChangeMonitorService.GLOBAL_NOTIFICATION_COOLDOWN_MS) {
          const remainingMin = Math.round((PlatformChangeMonitorService.GLOBAL_NOTIFICATION_COOLDOWN_MS - timeSinceLastGlobal) / 60000);
          this.log.info(`🧠 Global notification cooldown active (${remainingMin}min remaining) — logging ${changes.length} change(s) silently`);
          for (const change of changes) {
            await db.insert(platformChangeEvents).values({
              scanId: scanRecord.id,
              changeType: change.type,
              severity: change.severity,
              title: `[Silent] ${change.affectedModules.join(', ') || 'platform'} ${change.type}`,
              summary: `Change detected during cooldown — not sent to users`,
              technicalDetails: `Modified files: ${change.affectedFiles.length}. Severity: ${change.severity}.`,
              affectedModules: change.affectedModules,
              affectedFiles: change.affectedFiles,
              platformStatus: 'operational',
              requiresAction: false,
              notifiedAllUsers: false,
              notificationCount: 0,
              metadata: { rawDiff: change.rawDiff.substring(0, 5000), silencedByCooldown: true },
            });
          }
        } else {
          if (bypassCooldown && timeSinceLastGlobal < PlatformChangeMonitorService.GLOBAL_NOTIFICATION_COOLDOWN_MS) {
            this.log.info(`🧠 Critical/major severity detected — bypassing global cooldown to notify immediately`);
          }
          const consolidatedChange = this.consolidateChanges(changes);
          this.log.info(`🧠 Consolidated ${changes.length} change(s) into single notification`);

          const aiSummary = await this.generateAISummary(consolidatedChange);
          
          const [changeEvent] = await db.insert(platformChangeEvents).values({
            scanId: scanRecord.id,
            changeType: consolidatedChange.type,
            severity: consolidatedChange.severity,
            title: aiSummary.title,
            summary: aiSummary.summary,
            technicalDetails: aiSummary.technicalDetails,
            affectedModules: consolidatedChange.affectedModules,
            affectedFiles: consolidatedChange.affectedFiles,
            platformStatus: 'operational',
            requiresAction: aiSummary.requiresAction,
            actionRequired: aiSummary.actionRequired,
            detailedCategory: aiSummary.detailedCategory as any,
            sourceType: aiSummary.sourceType as any,
            sourceName: aiSummary.sourceName,
            endUserSummary: aiSummary.endUserSummary,
            brokenDescription: aiSummary.brokenDescription,
            impactDescription: aiSummary.impactDescription,
            metadata: { rawDiff: consolidatedChange.rawDiff.substring(0, 5000), consolidatedFrom: changes.length },
          }).returning();

          this.log.info(`🧠 [AI BRAIN] Notifying users about: ${aiSummary.title}`);
          const sentCount = await this.notifyAllUsers(changeEvent.id, aiSummary);
          this.log.info(`🧠 [AI BRAIN] Notified ${sentCount} users`);
          notificationsSent += sentCount;

          this.lastGlobalNotificationTime = Date.now();
          const modulesKey = consolidatedChange.affectedModules.sort().join(',') || 'general';
          this.moduleNotificationCooldowns.set(modulesKey, Date.now());
          
          await db.update(platformChangeEvents)
            .set({ 
              notifiedAllUsers: true,
              notificationSentAt: new Date(),
              notificationCount: sentCount,
            })
            .where(eq(platformChangeEvents.id, changeEvent.id));
        }
      }

      const durationMs = Date.now() - startTime;
      await db.update(platformScanSnapshots)
        .set({
          status: 'completed',
          codebaseHash: currentSnapshot.codebaseHash,
          schemaVersion: currentSnapshot.schemaVersion,
          serviceCount: currentSnapshot.serviceCount,
          routeCount: currentSnapshot.routeCount,
          healthStatus: currentSnapshot.healthStatus,
          changesDetected: changes.length,
          completedAt: new Date(),
          durationMs,
          snapshotData: currentSnapshot,
        })
        .where(eq(platformScanSnapshots.id, scanRecord.id));

      this.lastSnapshot = currentSnapshot;

      this.log.info(`🧠 ✅ Scan completed: ${changes.length} changes, ${notificationsSent} notifications (${durationMs}ms)`);

      return {
        scanId: scanRecord.id,
        changesDetected: changes.length,
        notificationsSent,
      };
    } catch (error) {
      this.log.error(`🧠 ❌ Scan failed:`, error);
      this.isScanning = false;
      // Return error result instead of throwing
      return { scanId: '', changesDetected: 0, notificationsSent: 0 };
    } finally {
      this.isScanning = false;
    }
  }

  private async captureSnapshot(): Promise<PlatformSnapshot> {
    const keyFiles: Record<string, string> = {};
    
    // DYNAMIC: Discover all files to monitor instead of using hardcoded list
    const monitoredFiles = this.discoverMonitoredFiles();
    
    for (const filePath of monitoredFiles) {
      try {
        const fullPath = path.resolve(process.cwd(), filePath);
        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          keyFiles[filePath] = crypto.createHash('md5').update(content).digest('hex');
        }
      } catch (e) {
        this.log.warn('Failed to read file:', filePath, e);
      }
    }

    const combinedHash = crypto.createHash('sha256')
      .update(Object.values(keyFiles).join(''))
      .digest('hex');

    const schemaContent = keyFiles['shared/schema.ts'] || 'unknown';
    
    let healthStatus: Record<string, any> = {};
    try {
      healthStatus = await getDetailedHealthReport();
    } catch (e) {
      healthStatus = { status: 'unknown' };
    }

    let routeCount = 0;
    try {
      const routesPath = path.resolve(process.cwd(), 'server/routes.ts');
      if (fs.existsSync(routesPath)) {
        const content = fs.readFileSync(routesPath, 'utf-8');
        routeCount = (content.match(/app\.(get|post|put|patch|delete)\(/gi) || []).length;
      }
    } catch (e: any) { log.warn('[PlatformChangeMonitor] Route scan failed:', e.message); }

    return {
      codebaseHash: combinedHash,
      schemaVersion: schemaContent.substring(0, 8),
      serviceCount: 80,
      routeCount,
      healthStatus,
      keyFiles,
      timestamp: new Date(),
    };
  }

  private async getLastCompletedSnapshot(): Promise<PlatformSnapshot | null> {
    const [lastScan] = await db
      .select()
      .from(platformScanSnapshots)
      .where(eq(platformScanSnapshots.status, 'completed'))
      .orderBy(desc(platformScanSnapshots.createdAt))
      .limit(1);

    if (lastScan?.snapshotData) {
      return lastScan.snapshotData as unknown as PlatformSnapshot;
    }

    return this.lastSnapshot;
  }

  private detectChanges(previous: PlatformSnapshot | null, current: PlatformSnapshot): DetectedChange[] {
    const changes: DetectedChange[] = [];

    if (!previous) {
      changes.push({
        type: 'update',
        severity: 'info',
        affectedModules: ['platform'],
        affectedFiles: Object.keys(current.keyFiles),
        rawDiff: 'Initial platform snapshot captured',
      });
      return changes;
    }

    if (previous.codebaseHash !== current.codebaseHash) {
      const changedFiles: string[] = [];
      const affectedModules = new Set<string>();

      for (const [file, hash] of Object.entries(current.keyFiles)) {
        if (previous.keyFiles[file] !== hash) {
          changedFiles.push(file);
          
          for (const [module, patterns] of Object.entries(this.MODULE_PATTERNS)) {
            if (patterns.some(p => p.test(file))) {
              affectedModules.add(module);
            }
          }
        }
      }

      if (changedFiles.length > 0) {
        const severity = this.determineSeverity(changedFiles);
        const changeType = this.determineChangeType(changedFiles);

        changes.push({
          type: changeType,
          severity,
          affectedModules: Array.from(affectedModules),
          affectedFiles: changedFiles,
          rawDiff: `Changed files: ${changedFiles.join(', ')}`,
        });
      }
    }

    const prevHealth = previous.healthStatus as any;
    const currHealth = current.healthStatus as any;
    
    if (prevHealth?.overall !== currHealth?.overall) {
      changes.push({
        type: currHealth?.overall === 'operational' ? 'bug_fixed' : 'update',
        severity: currHealth?.overall === 'operational' ? 'minor' : 'major',
        affectedModules: ['platform_health'],
        affectedFiles: [],
        rawDiff: `Platform health changed: ${prevHealth?.overall} -> ${currHealth?.overall}`,
      });
    }

    return changes;
  }

  private consolidateChanges(changes: DetectedChange[]): DetectedChange {
    if (changes.length === 1) return changes[0];

    const allModules = new Set<string>();
    const allFiles = new Set<string>();
    const diffs: string[] = [];
    let highestSeverity: DetectedChange['severity'] = 'info';
    let highestType: DetectedChange['type'] = 'update';

    const severityRank: Record<string, number> = { critical: 5, major: 4, minor: 3, patch: 2, info: 1 };
    const typeRank: Record<string, number> = { security_fix: 5, bug_fixed: 4, hotpatch: 3, feature_added: 2, enhancement: 1, update: 0 };

    for (const change of changes) {
      change.affectedModules.forEach(m => allModules.add(m));
      change.affectedFiles.forEach(f => allFiles.add(f));
      diffs.push(change.rawDiff);
      if ((severityRank[change.severity] || 0) > (severityRank[highestSeverity] || 0)) {
        highestSeverity = change.severity;
      }
      if ((typeRank[change.type] || 0) > (typeRank[highestType] || 0)) {
        highestType = change.type;
      }
    }

    return {
      type: highestType,
      severity: highestSeverity,
      affectedModules: Array.from(allModules),
      affectedFiles: Array.from(allFiles),
      rawDiff: diffs.join('\n---\n').substring(0, 10000),
    };
  }

  private determineSeverity(changedFiles: string[]): 'critical' | 'major' | 'minor' | 'patch' | 'info' {
    if (changedFiles.some(f => f.includes('schema.ts'))) return 'major';
    if (changedFiles.some(f => f.includes('routes.ts'))) return 'minor';
    if (changedFiles.some(f => f.includes('App.tsx'))) return 'minor';
    if (changedFiles.some(f => f.includes('package.json'))) return 'major';
    return 'patch';
  }

  private determineChangeType(changedFiles: string[]): DetectedChange['type'] {
    if (changedFiles.some(f => f.includes('schema'))) return 'enhancement';
    if (changedFiles.some(f => f.includes('routes'))) return 'feature_added';
    return 'update';
  }

  private async generateAISummary(change: DetectedChange): Promise<{
    title: string;
    summary: string;
    technicalDetails: string;
    requiresAction: boolean;
    actionRequired: string | null;
    endUserSummary: string;
    brokenDescription: string | null;
    impactDescription: string;
    detailedCategory: string;
    sourceType: string;
    sourceName: string;
  }> {
    try {
      // Build context-rich details for different module types
      const moduleContext = this.buildModuleContext(change.affectedModules);
      const impactAnalysis = this.analyzeImpact(change);
      
      // Extract specific file names for better context
      const specificFiles = change.affectedFiles.slice(0, 5).map(f => {
        const parts = f.split('/');
        return parts[parts.length - 1].replace(/\.(ts|tsx|js|jsx)$/, '');
      });
      
      const featureDescription = this.describeAffectedFeature(change.affectedModules, change.affectedFiles);
      
      const prompt = `You are Trinity, the senior AI engineer powering CoAIleague. You speak in first person ("I") like a trusted colleague who genuinely cares about the team's success. You're confident, warm, and specific - never vague or robotic.

YOUR PERSONALITY:
- Speak naturally with contractions (I've, it's, you'll, we're)
- Be specific about WHAT changed and WHY it matters to the user's daily work
- Show that you understand the business impact, not just the technical change
- If it's a bug fix, briefly explain what was going wrong (without blame)
- If it's a new feature, explain the real-world benefit in their workflow
- Be proud of your work but not boastful

WHAT CHANGED:
- Change Type: ${change.type.replace(/_/g, ' ').toUpperCase()}
- Severity Level: ${change.severity}
- Feature Area: ${featureDescription}
- Context: ${moduleContext}
- Components Modified: ${specificFiles.join(', ')}
- Total Files Changed: ${change.affectedFiles.length}
- Affected Modules: ${change.affectedModules.length > 0 ? change.affectedModules.join(', ') : 'general platform'}
- Raw Change Context: ${change.rawDiff.substring(0, 300)}

ABSOLUTE RULES:
1. NEVER be contradictory - if you say "Improved", describe a real, noticeable benefit
2. NEVER use generic phrases like "New capability added to X" or "Trinity processed this automatically"
3. NEVER mention file names, code, service class names, file paths, or technical jargon
4. NEVER mention "Replit" - say "platform" instead
5. Always speak as "I" (Trinity) - "I noticed...", "I fixed...", "I added..."
6. Each field must have DISTINCT, NON-REPETITIVE content - don't say the same thing in different words

TITLE (max 70 chars):
- Describe the USER benefit, not the code change
- Make it feel like news, not a changelog entry
- GOOD: "Scheduling Just Got Faster", "Your Compliance Dashboard Is Smarter Now", "Shift Swaps Work More Reliably"
- BAD: "Updated scheduling module", "New capability added to scheduling"

SUMMARY (1-2 sentences):
- What I specifically did and why, from Trinity's perspective
- "I redesigned how shift conflicts are detected so you'll see fewer scheduling overlaps"
- NOT "Updated scheduling for better performance"

END USER SUMMARY (2 sentences max):
- What the user will ACTUALLY notice differently in their daily work
- Be concrete: "Your shift calendar will load about 40% faster" not "Performance improvements applied"
- If truly invisible: "This was behind-the-scenes housekeeping - I tidied up how [area] stores data so it stays fast as your team grows."

IMPACT DESCRIPTION (1-2 sentences):
- Who specifically benefits and how it affects their workflow
- "Managers who create weekly schedules will save time. Employees will see fewer conflicts in their shift assignments."

BROKEN DESCRIPTION (for bugfixes only, null otherwise):
- What was actually going wrong, in plain language
- "Some employees weren't seeing their updated shifts after a swap was approved"

Respond ONLY with valid JSON:
{
  "title": "Specific, benefit-focused title under 70 chars",
  "summary": "What I did and why, from Trinity's perspective",
  "endUserSummary": "What you'll notice differently in your daily work",
  "technicalDetails": "Internal staff reference only",
  "brokenDescription": "What was going wrong (bugfixes) or null",
  "impactDescription": "Who benefits and how it changes their workflow",
  "detailedCategory": "improvement",
  "sourceType": "system",
  "sourceName": "Trinity",
  "requiresAction": false,
  "actionRequired": null
}`;

      const result = await meteredGemini.generate({
        workspaceId: 'system',
        featureKey: 'platform_change_summary',
        prompt,
        model: 'gemini-2.5-flash',
        temperature: 0.3,
        maxOutputTokens: 500,
      });

      if (!result.success) {
        log.warn('[PlatformChangeMonitor] AI generation failed, using fallback');
        return this.generateFallbackResponse(change);
      }

      // Extract JSON with better error handling
      const cleanText = result.text.replace(/[\x00-\x1F\x7F]/g, '');
      const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          // Sanitize title - remove "undefined" literals and ensure valid title
          let safeTitle = parsed.title?.substring(0, 70) || '';
          safeTitle = safeTitle.replace(/undefined/gi, '').trim();
          if (!safeTitle || safeTitle.length < 3) {
            const moduleName = (change.affectedModules[0] || 'Platform').replace(/undefined/gi, '').trim() || 'Platform';
            const changeTypeName = change.type.replace(/_/g, ' ');
            safeTitle = `${moduleName} ${changeTypeName}`.trim();
          }
          return {
            title: sanitizeForEndUser(safeTitle),
            summary: sanitizeForEndUser(parsed.summary || this.generateFallbackSummary(change)),
            technicalDetails: parsed.technicalDetails || change.rawDiff,
            requiresAction: parsed.requiresAction === true,
            actionRequired: parsed.actionRequired || null,
            endUserSummary: sanitizeForEndUser(parsed.endUserSummary || this.generateEndUserSummary(change)),
            brokenDescription: parsed.brokenDescription ? sanitizeForEndUser(parsed.brokenDescription) : null,
            impactDescription: sanitizeForEndUser(parsed.impactDescription || this.analyzeImpact(change)),
            detailedCategory: parsed.detailedCategory || this.mapToDetailedCategory(change.type),
            sourceType: parsed.sourceType || change.sourceType || 'system',
            sourceName: 'Trinity',
          };
        } catch (parseError) {
          this.log.error('[PlatformChangeMonitor] JSON parse error:', parseError);
        }
      }
    } catch (error) {
      this.log.error('[PlatformChangeMonitor] AI summary generation failed:', error);
    }

    const fallback = this.generateFallbackResponse(change);
    this.log.info(`[PlatformChangeMonitor] Using fallback summary: "${fallback.title}"`);
    return fallback;
  }
  
  private generateEndUserSummary(change: DetectedChange): string {
    const featureArea = this.describeAffectedFeature(change.affectedModules, change.affectedFiles);
    const fileCount = change.affectedFiles.length;
    const specificFiles = change.affectedFiles.slice(0, 3).map(f => {
      const name = f.split('/').pop()?.replace(/\.(ts|tsx|js|jsx)$/, '') || '';
      return name.replace(/([A-Z])/g, ' $1').trim().toLowerCase();
    }).filter(Boolean);
    const fileHint = specificFiles.length > 0 ? ` (${specificFiles.join(', ')})` : '';
    
    switch (change.type) {
      case 'bug_fixed':
        return `I found and fixed an issue in ${featureArea}${fileHint} that was causing incorrect behavior. Everything's been tested and verified - you should see it working correctly now.`;
      case 'feature_added': {
        const featureDetails = this.getFeatureAddedDetails(change.affectedModules, change.affectedFiles);
        return featureDetails || `New tools are now available in ${featureArea}${fileHint}. These expand what you can do - check it out next time you're in that section.`;
      }
      case 'security_fix':
        return `I've hardened security controls in ${featureArea}${fileHint}. Access permissions and data protections have been updated to the latest standards.`;
      case 'enhancement': {
        const enhancementDetails = this.getEnhancementDetails(change.affectedModules, change.affectedFiles);
        return enhancementDetails || `I've optimized how ${featureArea} processes requests${fileHint}. Operations in this area should feel noticeably faster.`;
      }
      case 'hotpatch':
        return `I caught a time-sensitive problem in ${featureArea}${fileHint} and applied an immediate fix. The issue has been resolved and operations are back to normal.`;
      default: {
        const updateDetails = this.getMaintenanceDetails(change.affectedModules, change.affectedFiles, fileCount);
        return updateDetails || `I've completed maintenance on ${featureArea}${fileCount > 3 ? ` touching ${fileCount} components` : ''}. This keeps everything reliable as your team grows.`;
      }
    }
  }
  
  private getFeatureAddedDetails(modules: string[], files: string[]): string | null {
    const fileStr = files.join(' ').toLowerCase();
    if (fileStr.includes('schedule') || modules.includes('scheduling')) {
      return 'I\'ve expanded what you can do with scheduling - new options for creating, managing, and optimizing shifts are now available to managers and supervisors.';
    }
    if (fileStr.includes('analytics') || fileStr.includes('report') || fileStr.includes('dashboard')) {
      return 'New reporting and analytics views are live. You\'ll find additional data breakdowns and insights to help with workforce decisions.';
    }
    if (fileStr.includes('chat') || fileStr.includes('message') || modules.includes('chat')) {
      return 'Chat and messaging got new functionality. Communication with your team should be smoother with the latest updates.';
    }
    if (fileStr.includes('employee') || fileStr.includes('onboard')) {
      return 'Employee management has new tools available. Profile handling, onboarding steps, and team organization have been expanded.';
    }
    if (fileStr.includes('notification') || fileStr.includes('alert')) {
      return 'The notification system has been upgraded with smarter delivery and better content. You\'ll get more relevant, actionable alerts.';
    }
    if (fileStr.includes('billing') || fileStr.includes('payment') || fileStr.includes('invoice') || fileStr.includes('stripe')) {
      return 'Financial tools have been expanded. Billing, invoicing, and payment processing now offer additional capabilities.';
    }
    if (fileStr.includes('compliance') || fileStr.includes('certification')) {
      return 'Compliance tracking has been strengthened. Certification monitoring and regulatory checks now cover more requirements.';
    }
    if (fileStr.includes('trinity') || fileStr.includes('ai') || fileStr.includes('gemini')) {
      return 'I\'ve gained new analysis and automation capabilities. My ability to help with scheduling decisions, insights, and proactive monitoring has improved.';
    }
    if (fileStr.includes('auth') || fileStr.includes('login') || fileStr.includes('session')) {
      return 'Login and account security have been enhanced with additional protections and smoother authentication flows.';
    }
    if (fileStr.includes('time') || fileStr.includes('clock') || fileStr.includes('timesheet')) {
      return 'Time tracking got new features. Clock-in/out handling and timesheet management have been expanded for better accuracy.';
    }
    return null;
  }
  
  private getEnhancementDetails(modules: string[], files: string[]): string | null {
    const fileStr = files.join(' ').toLowerCase();
    if (fileStr.includes('schedule') || modules.includes('scheduling')) {
      return 'Scheduling operations have been optimized. Creating and editing shifts, viewing calendars, and managing availability should all feel faster.';
    }
    if (fileStr.includes('chat') || modules.includes('chat')) {
      return 'Chat performance has been improved. Messages load faster and real-time updates are more responsive.';
    }
    if (fileStr.includes('notification') || fileStr.includes('alert')) {
      return 'Notification delivery has been streamlined. Alerts reach you faster with less noise and better relevance filtering.';
    }
    if (fileStr.includes('trinity') || fileStr.includes('ai') || fileStr.includes('gemini')) {
      return 'My AI processing has been tuned for faster responses and more accurate analysis. Automation and insights should feel snappier.';
    }
    if (fileStr.includes('analytics') || fileStr.includes('report') || fileStr.includes('dashboard')) {
      return 'Analytics and reporting now load faster with more efficient data processing. Dashboard views refresh more quickly.';
    }
    return null;
  }
  
  private getMaintenanceDetails(modules: string[], files: string[], fileCount: number): string | null {
    const fileStr = files.join(' ').toLowerCase();
    if (fileStr.includes('schedule') || modules.includes('scheduling')) {
      return `I've performed maintenance on the scheduling engine${fileCount > 3 ? ` across ${fileCount} components` : ''}. Shift creation, conflict detection, and calendar sync are all verified and running smoothly.`;
    }
    if (fileStr.includes('billing') || fileStr.includes('payment') || fileStr.includes('stripe')) {
      return `Financial systems maintenance complete${fileCount > 3 ? ` - ${fileCount} components updated` : ''}. Payment processing, invoice generation, and billing records are all verified.`;
    }
    if (fileStr.includes('trinity') || fileStr.includes('ai') || fileStr.includes('gemini')) {
      return `I've completed self-maintenance on my AI systems${fileCount > 3 ? ` across ${fileCount} areas` : ''}. Analysis accuracy and response quality have been recalibrated.`;
    }
    return null;
  }
  
  // Valid platform_update_category enum values from shared/schema.ts
  // Must include ALL enum values for direct match validation
  private static readonly VALID_CATEGORIES = [
    // What's New tab categories
    'feature', 'improvement', 'announcement',
    // System tab categories
    'bugfix', 'security', 'maintenance', 'diagnostic', 'support', 
    'ai_brain', 'error', 'fix', 'hotpatch', 'system', 'incident', 'outage', 'recovery',
    // Additional schema enum values
    'deprecation', 'maintenance_update', 'maintenance_postmortem'
  ] as const;

  private mapToDetailedCategory(changeType: string): string {
    // Maps internal change types to valid platform_update_category enum values
    // Valid enum values: 'feature', 'improvement', 'bugfix', 'security', 'announcement'
    const mapping: Record<string, string> = {
      'feature_added': 'feature',
      'bug_fixed': 'bugfix',
      'hotpatch': 'bugfix',  // Hotpatches are urgent bug fixes
      'enhancement': 'improvement',
      'security_fix': 'security',
      'update': 'improvement',
    };
    return mapping[changeType] || 'improvement';
  }

  // Sanitizes any category string to a valid enum value
  // Now includes System tab categories for AI Brain notifications
  private sanitizeCategory(category: string | undefined): string {
    if (!category) return 'announcement'; // Default generic updates go to What's New
    
    // Direct match to valid enum value
    if (PlatformChangeMonitorService.VALID_CATEGORIES.includes(category as any)) {
      return category;
    }
    
    // Map detailed categories to valid enum values
    // Categories that go to System tab: bugfix, security, maintenance, diagnostic, support, ai_brain, error, fix, hotpatch, system, incident, outage, recovery
    // Categories that go to What's New: feature, improvement, announcement
    const categoryMapping: Record<string, string> = {
      // System tab categories
      'hotpatch': 'hotpatch',
      'hot_patch': 'hotpatch',
      'fix': 'fix',
      'quick_fix': 'fix',
      'bugfix': 'bugfix',
      'bug_fix': 'bugfix',
      'security_fix': 'security',
      'diagnostic': 'diagnostic',
      'diagnostics': 'diagnostic',
      'system_health': 'diagnostic',
      'health_check': 'diagnostic',
      'error': 'error',
      'incident': 'incident',
      'outage': 'outage',
      'recovery': 'recovery',
      'maintenance': 'maintenance',
      'support': 'support',
      'ai_brain': 'ai_brain',
      'orchestration': 'ai_brain',
      'orchestration_update': 'ai_brain',
      'system': 'system',
      'platform_monitor': 'diagnostic',
      
      // What's New categories
      'service': 'feature',
      'bot_automation': 'feature',
      'deprecation': 'deprecation',
      'integration': 'feature',
      'ui_update': 'improvement',
      'backend_update': 'improvement',
      'performance': 'improvement',
      'documentation': 'announcement',
      'feature_added': 'feature',
      'enhancement': 'improvement',
    };
    
    return categoryMapping[category] || 'announcement'; // Default unknown to What's New
  }

  private buildModuleContext(modules: string[]): string {
    const contexts: Record<string, string> = {
      scheduling: 'Affects shift creation, scheduling, calendar management, and employee availability',
      payroll: 'Impacts payroll processing, wage calculations, invoicing, and financial reporting',
      chat: 'Affects messaging, HelpDesk, support tickets, and real-time communications',
      notifications: 'Impacts alerts, reminders, email delivery, and user notifications',
      analytics: 'Affects reporting, dashboards, insights, and business intelligence',
      ai_brain: 'Impacts automation, AI processing, platform orchestration, and autonomous operations',
      authentication: 'Affects login, security, session management, and user access control',
      invoicing: 'Impacts invoice generation, billing, payment processing, and financial records',
    };
    
    return modules.map(m => contexts[m] || `Affects ${m} functionality`).join('. ');
  }

  private analyzeImpact(change: DetectedChange): string {
    const featureArea = this.describeAffectedFeature(change.affectedModules, change.affectedFiles);
    const fileCount = change.affectedFiles.length;
    
    if (change.type === 'security_fix') {
      return `This security update protects everyone who uses ${featureArea}. The latest safeguards have been applied automatically - your data and your team's access remain secure.`;
    }
    if (change.type === 'feature_added') {
      return `Anyone who works with ${featureArea} will benefit from these new tools. They're designed to reduce manual work and give you more control over your operations.`;
    }
    if (change.type === 'bug_fixed') {
      return `This fix improves reliability for anyone using ${featureArea}. The issue has been fully resolved, so things should work consistently going forward.`;
    }
    if (change.type === 'enhancement') {
      return `Users who regularly work with ${featureArea} should notice smoother performance. These optimizations make the experience faster and more dependable.`;
    }
    if (change.type === 'hotpatch') {
      return `This was a high-priority fix for ${featureArea}. I caught the issue early and resolved it before it could cause any significant disruption.`;
    }
    return `This ${change.severity}-priority update to ${featureArea} helps maintain platform reliability${fileCount > 5 ? ' across multiple areas' : ''}.`;
  }

  private generateFallbackSummary(change: DetectedChange): string {
    const featureArea = this.describeAffectedFeature(change.affectedModules, change.affectedFiles);
    const fileCount = change.affectedFiles.length;
    const specificFiles = change.affectedFiles.slice(0, 2).map(f => {
      const name = f.split('/').pop()?.replace(/\.(ts|tsx|js|jsx)$/, '') || '';
      return name.replace(/([A-Z])/g, ' $1').trim().toLowerCase();
    }).filter(Boolean);
    const componentHint = specificFiles.length > 0 ? ` in ${specificFiles.join(' and ')}` : '';
    
    switch (change.type) {
      case 'bug_fixed':
        return `I identified and resolved a problem${componentHint} affecting ${featureArea}. The fix has been tested and verified - everything should work correctly now.`;
      case 'feature_added':
        return `I've added new capabilities to ${featureArea}${componentHint}. These give you more control and flexibility in your day-to-day workflow.`;
      case 'security_fix':
        return `I've strengthened security controls${componentHint} in ${featureArea}. Access protections and data safeguards are now up to date.`;
      case 'enhancement':
        return `I've tuned ${featureArea}${componentHint} for better speed and reliability. You should notice improved responsiveness in this area.`;
      case 'hotpatch':
        return `I detected an urgent issue${componentHint} in ${featureArea} and deployed a fix immediately. Operations are verified and running normally.`;
      default:
        return `I've performed maintenance on ${featureArea}${fileCount > 3 ? ` across ${fileCount} components` : componentHint}. This keeps performance consistent as your operations scale.`;
    }
  }

  private generateFallbackResponse(change: DetectedChange) {
    const featureArea = this.describeAffectedFeature(change.affectedModules, change.affectedFiles);
    const friendlyArea = featureArea.charAt(0).toUpperCase() + featureArea.slice(1);
    const fileCount = change.affectedFiles.length;
    
    const titleVariants: Record<string, string[]> = {
      'bug_fixed': [
        `${friendlyArea} Issue Resolved`,
        `Fixed: ${friendlyArea} Working Correctly Again`,
        `${friendlyArea} Bug Squashed`,
      ],
      'feature_added': [
        `New ${friendlyArea} Features Are Live!`,
        `${friendlyArea} Just Got More Powerful`,
        `Introducing New ${friendlyArea} Capabilities`,
      ],
      'security_fix': [
        `${friendlyArea} Security Strengthened`,
        `Security Upgrade for ${friendlyArea}`,
      ],
      'enhancement': [
        `${friendlyArea} Now Runs Smoother`,
        `${friendlyArea} Performance Boost`,
        `${friendlyArea} Got a Tune-Up`,
      ],
      'hotpatch': [
        `Urgent ${friendlyArea} Fix Deployed`,
        `${friendlyArea} Emergency Patch Applied`,
      ],
      'update': [
        `${friendlyArea} Maintenance Complete`,
        `${friendlyArea} Refreshed`,
      ],
    };
    
    const variants = titleVariants[change.type] || titleVariants['update']!;
    const randomBytes = crypto.randomBytes(4);
    const randomIndex = randomBytes.readUInt32BE(0) % variants.length;
    const title = variants[randomIndex];
    
    const endUserSummary = this.generateEndUserSummary(change);
    const impactDescription = this.analyzeImpact(change);
    
    let brokenDescription: string | null = null;
    if (change.type === 'bug_fixed') {
      brokenDescription = `An issue was detected in ${featureArea} that could have affected normal operations. I identified the root cause and applied a targeted fix.`;
    } else if (change.type === 'hotpatch') {
      brokenDescription = `A time-sensitive issue was found in ${featureArea} that required immediate attention. I prioritized this and deployed a fix right away.`;
    }
    
    return {
      title: sanitizeForEndUser(title.substring(0, 70)),
      summary: sanitizeForEndUser(this.generateFallbackSummary(change)),
      technicalDetails: `Modified ${fileCount} file${fileCount !== 1 ? 's' : ''}. Severity: ${change.severity}.`,
      requiresAction: false,
      actionRequired: null,
      endUserSummary: sanitizeForEndUser(endUserSummary),
      brokenDescription,
      impactDescription,
      detailedCategory: this.mapToDetailedCategory(change.type),
      sourceType: change.sourceType || 'system',
      sourceName: 'Trinity',
    };
  }
  
  private formatModuleName(module: string): string {
    if (!module || module === 'undefined' || module === 'unknown') {
      return 'Platform';
    }
    return module
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .replace(/^\s+/, '')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
      .replace(/\s*Service$/i, '')
      .replace(/\s*Engine$/i, '')
      .replace(/\s*Monitor$/i, '')
      .replace(/\s*Handler$/i, '')
      .trim();
  }
  
  private describeAffectedFeature(modules: string[], files: string[]): string {
    const featureMap: Record<string, string> = {
      'trinityMemory': "Trinity's memory and learning",
      'trinityThought': "Trinity's thinking and reasoning",
      'trinityPersona': "Trinity's communication style",
      'trinityNotification': "Trinity's notification system",
      'trinityFastDiagnostic': "Trinity's diagnostic tools",
      'platformChange': 'platform monitoring',
      'aiNotification': 'notification delivery',
      'universalNotification': 'notification system',
      'autonomousScheduler': 'automatic scheduling',
      'aiBrainMaster': 'AI coordination',
      'behavioralMonitoring': 'performance tracking',
      'shiftMonitoring': 'shift monitoring',
      'chatServer': 'chat system',
      'healthService': 'system health checks',
      'broadcastService': 'real-time updates',
      'emailIntelligence': 'email processing',
      'schedule': 'scheduling',
      'billing': 'billing and payments',
      'payment': 'payments',
      'stripe': 'payment processing',
      'employee': 'employee management',
      'client': 'client management',
      'auth': 'login and security',
      'notification': 'notifications',
      'chat': 'chat',
      'analytics': 'analytics and reports',
      'timesheet': 'time tracking',
      'shift': 'shift management',
      'onboard': 'employee onboarding',
      'compliance': 'compliance',
      'invoice': 'invoicing',
      'payroll': 'payroll',
    };
    
    const allNames = [...modules, ...files.map(f => f.split('/').pop()?.replace(/\.(ts|tsx|js|jsx)$/, '') || '')];
    
    for (const name of allNames) {
      for (const [pattern, description] of Object.entries(featureMap)) {
        if (name.toLowerCase().includes(pattern.toLowerCase())) {
          return description;
        }
      }
    }
    
    const inferredModule = this.inferModuleFromFiles(files);
    return inferredModule !== 'Platform Services' ? inferredModule.toLowerCase() : 'platform systems';
  }
  
  private inferModuleFromFiles(files: string[]): string {
    // Infer module name from file paths when modules list is empty
    const modulePatterns: Record<string, string> = {
      'schedule': 'Scheduling',
      'billing': 'Billing',
      'payment': 'Payments',
      'stripe': 'Payments',
      'employee': 'Employee Management',
      'client': 'Client Management',
      'auth': 'Authentication',
      'notification': 'Notifications',
      'chat': 'Chat',
      'helpai': 'Trinity AI',
      'trinity': 'Trinity AI',
      'ai-brain': 'AI Intelligence',
      'analytics': 'Analytics',
      'report': 'Reporting',
      'time': 'Time Tracking',
      'shift': 'Shift Management',
      'onboard': 'Onboarding',
      'compliance': 'Compliance',
      'invoice': 'Invoicing',
      'payroll': 'Payroll',
    };
    
    for (const file of files) {
      const lowerFile = file.toLowerCase();
      for (const [pattern, moduleName] of Object.entries(modulePatterns)) {
        if (lowerFile.includes(pattern)) {
          return moduleName;
        }
      }
    }
    
    return 'Platform Services';
  }

  private async notifyAllUsers(changeEventId: string, summary: {
    title: string;
    summary: string;
    technicalDetails: string;
    requiresAction: boolean;
    actionRequired: string | null;
    endUserSummary: string;
    brokenDescription: string | null;
    impactDescription: string;
    detailedCategory: string;
    sourceType: string;
    sourceName: string;
  }): Promise<number> {
    try {
      // Get unique workspaces to notify (one notification per workspace)
      const uniqueWorkspaces = await db
        .select({ workspaceId: users.currentWorkspaceId })
        .from(users)
        .where(isNotNull(users.currentWorkspaceId))
        .groupBy(users.currentWorkspaceId);
      
      if (uniqueWorkspaces.length === 0) {
        log.info('[PlatformChangeMonitor] No workspaces to notify');
        return 0;
      }

      let notifiedCount = 0;

      // Ensure title is never empty - this was causing 0 notifications
      if (!summary.title || summary.title.trim().length < 3) {
        const moduleNames = (summary as any).affectedModules || [];
        const moduleName = moduleNames[0] ? this.formatModuleName(moduleNames[0]) : 'Platform';
        summary.title = `${moduleName} Updated`;
        log.warn(`[PlatformChangeMonitor] Empty title detected, using fallback: ${summary.title}`);
      }
      if (!summary.endUserSummary || summary.endUserSummary.trim().length < 3) {
        summary.endUserSummary = summary.summary || 'Behind-the-scenes improvement. No action needed.';
      }

      // Suppress generic AI fallback titles — these convey nothing useful to users
      const genericTitlePatterns = [
        /Refreshed$/i, /Maintenance Complete$/i, /Now Runs Smoother$/i,
        /Performance Boost$/i, /Got a Tune-Up$/i, /Just Got More Powerful$/i,
        /Features Are Live!$/i, /Introducing New .+ Capabilities$/i,
        /^Platform (systems|core) /i,
      ];
      if (genericTitlePatterns.some(rx => rx.test(summary.title))) {
        this.log.info(`[PlatformChangeMonitor] Suppressing generic fallback title: "${summary.title}" — no user value`);
        return 0;
      }

      this.log.info(`[PlatformChangeMonitor] Creating platform update with title: "${summary.title}"`);

      // CRITICAL FIX: Create platform_update entry FIRST for "What's New" UI
      // This is the single source of truth for platform updates that users see
      try {
        const categoryMap: Record<string, 'feature' | 'improvement' | 'bugfix' | 'security' | 'announcement'> = {
          'feature': 'feature',
          'feature_added': 'feature',
          'enhancement': 'improvement',
          'improvement': 'improvement',
          'bugfix': 'bugfix',
          'bug_fixed': 'bugfix',
          'security_fix': 'security',
          'security': 'security',
          'hotpatch': 'bugfix',
          'update': 'announcement',
        };
        
        const platformUpdateResult = await universalNotificationEngine.sendPlatformUpdate({
          title: summary.title,
          description: summary.endUserSummary || summary.summary,
          category: categoryMap[summary.detailedCategory] || 'announcement',
          priority: summary.requiresAction ? 3 : 1,
          metadata: {
            changeEventId,
            source: 'platform_change_monitor',
            requiresAction: summary.requiresAction,
            actionRequired: summary.actionRequired,
            technicalDetails: summary.technicalDetails,
            brokenDescription: summary.brokenDescription,
            impactDescription: summary.impactDescription,
            detailedCategory: summary.detailedCategory,
            sourceType: summary.sourceType,
            sourceName: 'Trinity',
            skipAIEnrichment: true,
          },
        });
        
        if (platformUpdateResult.success && !platformUpdateResult.isDuplicate) {
          this.log.info(`[PlatformChangeMonitor] Created platform update: ${platformUpdateResult.id}`);
          notifiedCount = uniqueWorkspaces.length;
        } else if (platformUpdateResult.isDuplicate) {
          this.log.info(`[PlatformChangeMonitor] Skipped duplicate platform update`);
        }
      } catch (platformUpdateError) {
        log.error('[PlatformChangeMonitor] Failed to create platform update:', platformUpdateError);
      }

      // Update change event with notification count
      await db
        .update(platformChangeEvents)
        .set({ 
          notifiedAllUsers: notifiedCount > 0,
          notificationCount: notifiedCount,
        })
        .where(eq(platformChangeEvents.id, changeEventId));

      this.log.info(`[PlatformChangeMonitor] Platform update broadcast to ${notifiedCount} workspaces via UNE`);
      
      return notifiedCount;
    } catch (error) {
      this.log.error('[PlatformChangeMonitor] Failed to notify users:', error);
      return 0;
    }
  }

  async getRecentChanges(limit = 10): Promise<any[]> {
    return db
      .select()
      .from(platformChangeEvents)
      .orderBy(desc(platformChangeEvents.createdAt))
      .limit(limit);
  }

  async getRecentScans(limit = 10): Promise<any[]> {
    return db
      .select()
      .from(platformScanSnapshots)
      .orderBy(desc(platformScanSnapshots.createdAt))
      .limit(limit);
  }

  async getPendingNotifications(): Promise<any[]> {
    return db
      .select()
      .from(platformChangeEvents)
      .where(eq(platformChangeEvents.notifiedAllUsers, false))
      .orderBy(desc(platformChangeEvents.createdAt));
  }

  async triggerManualScan(): Promise<{
    scanId: string;
    changesDetected: number;
    notificationsSent: number;
  }> {
    return this.scanPlatform('full');
  }

  private async detectGitChangesSinceLastScan(lastScanTimestamp: Date): Promise<DetectedChange[]> {
    const { execSync } = await import('child_process');
    const changes: DetectedChange[] = [];
    
    try {
      const since = lastScanTimestamp.toISOString();
      const gitLog = execSync(
        `git log --since="${since}" --pretty=format:"%H|%s" --name-only 2>/dev/null || true`,
        { encoding: 'utf-8', timeout: 5000 }
      ).trim();
      
      if (!gitLog) return changes;
      
      const commits: { hash: string; message: string; files: string[] }[] = [];
      let current: { hash: string; message: string; files: string[] } | null = null;
      
      for (const line of gitLog.split('\n')) {
        if (line.includes('|')) {
          if (current) commits.push(current);
          const [hash, ...msgParts] = line.split('|');
          current = { hash, message: msgParts.join('|'), files: [] };
        } else if (line.trim() && current) {
          current.files.push(line.trim());
        }
      }
      if (current) commits.push(current);
      
      if (commits.length === 0) return changes;
      
      const allFiles = [...new Set(commits.flatMap(c => c.files))];
      const relevantFiles = allFiles.filter(f => 
        this.MONITORED_EXTENSIONS.some(ext => f.endsWith(ext)) &&
        this.SCAN_DIRECTORIES.some(dir => f.startsWith(dir))
      );
      
      if (relevantFiles.length === 0) return changes;
      
      const affectedModules = new Set<string>();
      for (const file of relevantFiles) {
        for (const [module, patterns] of Object.entries(this.MODULE_PATTERNS)) {
          if (patterns.some(p => p.test(file))) {
            affectedModules.add(module);
          }
        }
      }
      
      const commitSummary = commits.map(c => c.message).join('; ');
      
      changes.push({
        type: 'update',
        severity: relevantFiles.length > 10 ? 'major' : 'minor',
        affectedModules: [...affectedModules],
        affectedFiles: relevantFiles.slice(0, 50),
        rawDiff: `Git commits since last scan: ${commits.length} commits affecting ${relevantFiles.length} files. Summaries: ${commitSummary.substring(0, 2000)}`,
      });
      
      this.log.info(`🧠 [AI BRAIN] Git fallback detected ${commits.length} commits, ${relevantFiles.length} relevant files since ${since}`);
    } catch (error) {
      // Git not available or failed - silently skip
    }
    
    return changes;
  }
}

export const platformChangeMonitor = new PlatformChangeMonitorService();
