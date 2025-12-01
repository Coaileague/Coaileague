import { db } from "../../db";
import { 
  platformScanSnapshots, 
  platformChangeEvents, 
  platformUpdates,
  notifications,
  users
} from "@shared/schema";
import { eq, desc, isNull, and, sql } from "drizzle-orm";
import { GoogleGenerativeAI } from "@google/generative-ai";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { platformEventBus } from "../platformEventBus";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

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
}

class PlatformChangeMonitorService {
  private lastSnapshot: PlatformSnapshot | null = null;
  private isScanning = false;
  
  private readonly KEY_FILES = [
    'shared/schema.ts',
    'server/routes.ts',
    'client/src/App.tsx',
    'package.json',
    'replit.md'
  ];
  
  private readonly MODULE_PATTERNS: Record<string, RegExp[]> = {
    scheduling: [/schedule|shift|calendar|availability/i],
    payroll: [/payroll|salary|wage|compensation/i],
    invoicing: [/invoice|billing|payment/i],
    notifications: [/notification|alert|bell|toast/i],
    chat: [/chat|message|helpdesk|room/i],
    authentication: [/auth|login|session|user/i],
    analytics: [/analytics|report|metric|dashboard/i],
    ai_brain: [/ai-brain|gemini|orchestrator|automation/i],
  };

  async scanPlatform(scanType: 'full' | 'quick' | 'health' | 'scheduled' = 'scheduled'): Promise<{
    scanId: string;
    changesDetected: number;
    notificationsSent: number;
  }> {
    if (this.isScanning) {
      console.log('[PlatformChangeMonitor] Scan already in progress, skipping');
      return { scanId: '', changesDetected: 0, notificationsSent: 0 };
    }

    this.isScanning = true;
    const startTime = Date.now();
    
    console.log(`[PlatformChangeMonitor] Starting ${scanType} platform scan...`);

    try {
      const [scanRecord] = await db.insert(platformScanSnapshots).values({
        scanType,
        status: 'running',
        startedAt: new Date(),
      }).returning();

      const currentSnapshot = await this.captureSnapshot();
      
      const previousSnapshot = await this.getLastCompletedSnapshot();
      
      const changes = this.detectChanges(previousSnapshot, currentSnapshot);
      
      let notificationsSent = 0;
      
      if (changes.length > 0) {
        for (const change of changes) {
          const aiSummary = await this.generateAISummary(change);
          
          const [changeEvent] = await db.insert(platformChangeEvents).values({
            scanId: scanRecord.id,
            changeType: change.type,
            severity: change.severity,
            title: aiSummary.title,
            summary: aiSummary.summary,
            technicalDetails: aiSummary.technicalDetails,
            affectedModules: change.affectedModules,
            affectedFiles: change.affectedFiles,
            platformStatus: 'operational',
            requiresAction: aiSummary.requiresAction,
            actionRequired: aiSummary.actionRequired,
            metadata: { rawDiff: change.rawDiff.substring(0, 5000) },
          }).returning();

          const sentCount = await this.notifyAllUsers(changeEvent.id, aiSummary);
          notificationsSent += sentCount;
          
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

      console.log(`[PlatformChangeMonitor] Scan completed: ${changes.length} changes detected, ${notificationsSent} notifications sent (${durationMs}ms)`);

      return {
        scanId: scanRecord.id,
        changesDetected: changes.length,
        notificationsSent,
      };
    } catch (error) {
      console.error('[PlatformChangeMonitor] Scan failed:', error);
      throw error;
    } finally {
      this.isScanning = false;
    }
  }

  private async captureSnapshot(): Promise<PlatformSnapshot> {
    const keyFiles: Record<string, string> = {};
    
    for (const filePath of this.KEY_FILES) {
      try {
        const fullPath = path.resolve(process.cwd(), filePath);
        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          keyFiles[filePath] = crypto.createHash('md5').update(content).digest('hex');
        }
      } catch (e) {
      }
    }

    const combinedHash = crypto.createHash('sha256')
      .update(Object.values(keyFiles).join(''))
      .digest('hex');

    const schemaContent = keyFiles['shared/schema.ts'] || 'unknown';
    
    let healthStatus: Record<string, any> = {};
    try {
      const healthModule = await import('../healthService');
      if (healthModule.healthService) {
        healthStatus = await healthModule.healthService.getHealthSummary();
      }
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
    } catch (e) {}

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
  }> {
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
      
      const prompt = `You are the AI Brain for CoAIleague, a workforce management platform.
      
A platform change has been detected. Summarize it for end users in a friendly, professional way.

Change Details:
- Type: ${change.type}
- Severity: ${change.severity}
- Affected Modules: ${change.affectedModules.join(', ') || 'general platform'}
- Affected Files: ${change.affectedFiles.join(', ')}
- Raw Info: ${change.rawDiff}

Respond in JSON format:
{
  "title": "Brief title (max 60 chars, no technical jargon)",
  "summary": "User-friendly summary of what changed and how it helps them (2-3 sentences)",
  "technicalDetails": "Technical summary for support staff",
  "requiresAction": false,
  "actionRequired": null
}

Keep the tone positive and professional. Focus on user benefits.`;

      const result = await model.generateContent(prompt);
      const text = result.response.text();
      
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          title: parsed.title || 'Platform Update',
          summary: parsed.summary || 'The platform has been updated with improvements.',
          technicalDetails: parsed.technicalDetails || change.rawDiff,
          requiresAction: parsed.requiresAction || false,
          actionRequired: parsed.actionRequired || null,
        };
      }
    } catch (error) {
      console.error('[PlatformChangeMonitor] AI summary generation failed:', error);
    }

    return {
      title: `Platform ${change.type.replace('_', ' ')}`,
      summary: `The platform has received a ${change.severity} update affecting ${change.affectedModules.join(', ') || 'core functionality'}.`,
      technicalDetails: change.rawDiff,
      requiresAction: false,
      actionRequired: null,
    };
  }

  private async notifyAllUsers(changeEventId: string, summary: {
    title: string;
    summary: string;
    technicalDetails: string;
    requiresAction: boolean;
    actionRequired: string | null;
  }): Promise<number> {
    try {
      const allUsers = await db.select({ id: users.id }).from(users);
      
      if (allUsers.length === 0) {
        console.log('[PlatformChangeMonitor] No users to notify');
        return 0;
      }

      const notificationValues = allUsers.map(user => ({
        userId: user.id,
        type: 'platform_update' as const,
        message: summary.summary,
        title: summary.title,
        data: {
          changeEventId,
          requiresAction: summary.requiresAction,
          actionRequired: summary.actionRequired,
        },
      }));

      await db.insert(notifications).values(notificationValues);

      platformEventBus.emit('platform:change:detected', {
        title: summary.title,
        summary: summary.summary,
        changeEventId,
        notifiedCount: allUsers.length,
      });

      console.log(`[PlatformChangeMonitor] Notified ${allUsers.length} users about platform change`);
      
      return allUsers.length;
    } catch (error) {
      console.error('[PlatformChangeMonitor] Failed to notify users:', error);
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
}

export const platformChangeMonitor = new PlatformChangeMonitorService();
