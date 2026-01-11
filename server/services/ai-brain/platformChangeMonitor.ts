import { db } from "../../db";
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
// publishPlatformUpdate removed - was causing DUPLICATE notifications
import { getDetailedHealthReport } from "../healthService";
import { broadcastNotificationToUser } from "../../websocket";

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
  // Enhanced fields for detailed notifications
  detailedCategory?: 'feature' | 'service' | 'bot_automation' | 'bugfix' | 'security' | 'improvement' | 'deprecation' | 'hotpatch' | 'integration' | 'ui_update' | 'backend_update' | 'performance' | 'documentation';
  sourceType?: 'system' | 'ai_brain' | 'support_staff' | 'developer' | 'automated_job' | 'user_request' | 'external_service';
  sourceName?: string;
}

class PlatformChangeMonitorService {
  private lastSnapshot: PlatformSnapshot | null = null;
  private isScanning = false;
  
  private readonly KEY_FILES = [
    'shared/schema.ts',
    'server/routes.ts',
    'client/src/App.tsx',
    'client/src/components/coai-twin-mascot.tsx',
    'client/src/hooks/use-mascot-position.ts',
    'client/src/hooks/use-mascot-mode.ts',
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
    ui_components: [/mascot|gemini-agent|interactive-ui|component/i],
  };

  async scanPlatform(scanType: 'full' | 'quick' | 'health' | 'scheduled' = 'scheduled'): Promise<{
    scanId: string;
    changesDetected: number;
    notificationsSent: number;
  }> {
    console.log(`🧠 [AI BRAIN] Platform scan initiated: ${scanType}`);
    
    if (this.isScanning) {
      console.log('🧠 [AI BRAIN] Scan already in progress, skipping');
      return { scanId: '', changesDetected: 0, notificationsSent: 0 };
    }

    this.isScanning = true;
    const startTime = Date.now();
    
    console.log(`🧠 [AI BRAIN] Starting ${scanType} platform scan...`);

    try {
      const [scanRecord] = await db.insert(platformScanSnapshots).values({
        scanType,
        status: 'running',
        startedAt: new Date(),
      }).returning();

      const currentSnapshot = await this.captureSnapshot();
      
      const previousSnapshot = await this.getLastCompletedSnapshot();
      
      const changes = this.detectChanges(previousSnapshot, currentSnapshot);
      console.log(`🧠 [AI BRAIN] Detected ${changes.length} changes`);
      
      let notificationsSent = 0;
      
      if (changes.length > 0) {
        console.log(`🧠 [AI BRAIN] Processing ${changes.length} detected changes...`);
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
            // Enhanced fields for detailed notifications
            detailedCategory: aiSummary.detailedCategory as any,
            sourceType: aiSummary.sourceType as any,
            sourceName: aiSummary.sourceName,
            endUserSummary: aiSummary.endUserSummary,
            brokenDescription: aiSummary.brokenDescription,
            impactDescription: aiSummary.impactDescription,
            metadata: { rawDiff: change.rawDiff.substring(0, 5000) },
          }).returning();

          console.log(`🧠 [AI BRAIN] Notifying users about: ${aiSummary.title}`);
          const sentCount = await this.notifyAllUsers(changeEvent.id, aiSummary);
          console.log(`🧠 [AI BRAIN] Notified ${sentCount} users`);
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

      console.log(`🧠 [AI BRAIN] ✅ Scan completed: ${changes.length} changes, ${notificationsSent} notifications (${durationMs}ms)`);

      return {
        scanId: scanRecord.id,
        changesDetected: changes.length,
        notificationsSent,
      };
    } catch (error) {
      console.error(`🧠 [AI BRAIN] ❌ Scan failed:`, error);
      this.isScanning = false;
      // Return error result instead of throwing
      return { scanId: '', changesDetected: 0, notificationsSent: 0 };
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
    endUserSummary: string;
    brokenDescription: string | null;
    impactDescription: string;
    detailedCategory: string;
    sourceType: string;
    sourceName: string;
  }> {
    try {
      const model = genAI.getGenerativeModel({ 
        model: GEMINI_MODELS.DIAGNOSTICS,
        generationConfig: {
          maxOutputTokens: ANTI_YAP_PRESETS.diagnostics.maxTokens,
          temperature: ANTI_YAP_PRESETS.diagnostics.temperature,
        }
      });
      
      // Build context-rich details for different module types
      const moduleContext = this.buildModuleContext(change.affectedModules);
      const impactAnalysis = this.analyzeImpact(change);
      
      const prompt = `You are Trinity, the senior AI engineer for CoAIleague. You communicate like a friendly, experienced developer - casual but competent.

CRITICAL VOICE RULES - You are NOT a corporate PR department:
- Use contractions (we've, I've, it's, you'll)
- Use casual transitions ("Just shipped...", "Fixed a hiccup...", "Heads up...")
- Be direct and human - like a senior engineer updating the team
- NEVER say "We are pleased to announce" or "This update ensures" or "We have fine-tuned"
- NEVER use formal corporate language

Change Analysis:
- Change Type: ${change.type.replace(/_/g, ' ').toUpperCase()}
- Severity Level: ${change.severity}
- Affected Systems: ${change.affectedModules.join(', ') || 'Platform core'}
- Modified Components: ${change.affectedFiles.join(', ')}
- Impact Analysis: ${impactAnalysis}
- Module Context: ${moduleContext}

TITLE REQUIREMENTS (max 70 chars):
- Specific about WHAT changed
- Include the module if applicable
- NEVER mention "Replit" - use "Platform Config" instead
- Examples: "Schedule loading got faster", "Fixed that login hiccup", "New calendar sync is live"

SUMMARY (for technical staff - Trinity's voice):
- 2-3 sentences, casual but informative
- Start with action words: "Just shipped...", "Fixed...", "Upgraded..."
- Explain what changed and why it matters
- Example: "Just shipped a performance boost for the scheduler. Should load about 40% faster now, especially on mobile."

END USER SUMMARY (for regular users - Trinity's friendly voice):
- 2 sentences max, plain English
- Focus on the benefit
- Example: "Your schedule loads faster now. No action needed on your end."

CATEGORIZATION:
- detailedCategory: feature|bugfix|security|improvement|hotpatch|performance
- sourceType: system|ai_brain|developer|automated_job
- sourceName: ALWAYS "Trinity"

Respond ONLY with valid JSON:
{
  "title": "Short specific title",
  "summary": "Trinity-voice summary for tech staff",
  "endUserSummary": "Friendly summary for regular users",
  "technicalDetails": "Technical changes made",
  "brokenDescription": "What was broken (for bugfixes) or null",
  "impactDescription": "Who/what is affected",
  "detailedCategory": "improvement",
  "sourceType": "system",
  "sourceName": "Trinity",
  "requiresAction": false,
  "actionRequired": null
}`;

      const result = await model.generateContent(prompt);
      const text = result.response.text();
      
      // Extract JSON with better error handling
      const cleanText = text.replace(/[\x00-\x1F\x7F]/g, '');
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
            title: safeTitle,
            summary: parsed.summary || this.generateFallbackSummary(change),
            technicalDetails: parsed.technicalDetails || change.rawDiff,
            requiresAction: parsed.requiresAction === true,
            actionRequired: parsed.actionRequired || null,
            endUserSummary: parsed.endUserSummary || this.generateEndUserSummary(change),
            brokenDescription: parsed.brokenDescription || null,
            impactDescription: parsed.impactDescription || this.analyzeImpact(change),
            detailedCategory: parsed.detailedCategory || this.mapToDetailedCategory(change.type),
            sourceType: parsed.sourceType || change.sourceType || 'system',
            sourceName: 'Trinity',
          };
        } catch (parseError) {
          console.error('[PlatformChangeMonitor] JSON parse error:', parseError);
        }
      }
    } catch (error) {
      console.error('[PlatformChangeMonitor] AI summary generation failed:', error);
    }

    return this.generateFallbackResponse(change);
  }
  
  private generateEndUserSummary(change: DetectedChange): string {
    const moduleList = change.affectedModules.join(', ') || 'the platform';
    switch (change.type) {
      case 'bug_fixed':
        return `Fixed a hiccup in ${moduleList}. Should be running smooth now.`;
      case 'feature_added':
        return `Just shipped something new for ${moduleList}! Worth checking out.`;
      case 'security_fix':
        return `Tightened up security - your data stays safe. Nothing you need to do.`;
      case 'enhancement':
        return `Boosted ${moduleList} - faster and better than before.`;
      default:
        return `Quick update to ${moduleList}. Making things run smoother.`;
    }
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
    if (change.type === 'security_fix') {
      return 'Security-critical. All users affected. No user action required - automatic deployment.';
    }
    if (change.type === 'feature_added') {
      return 'New capability available. Enhances workflow efficiency and user experience.';
    }
    if (change.type === 'bug_fixed') {
      return 'Resolution to reported issue. Improves platform stability and reliability.';
    }
    if (change.type === 'enhancement') {
      return 'Performance or usability improvement. Makes existing features more efficient.';
    }
    return `${change.severity} priority update to platform systems.`;
  }

  private generateFallbackSummary(change: DetectedChange): string {
    const moduleList = change.affectedModules.join(', ') || 'platform core';
    
    switch (change.type) {
      case 'bug_fixed':
        return `Fixed a hiccup in ${moduleList}. Should be running smooth now - no action needed on your end.`;
      case 'feature_added':
        return `Just shipped something new for ${moduleList}! Worth checking out when you get a chance.`;
      case 'security_fix':
        return `Tightened up security on ${moduleList}. Your data stays safe - nothing you need to do.`;
      case 'enhancement':
        return `Boosted ${moduleList} - faster and more reliable than before.`;
      default:
        return `Quick update to ${moduleList}. Making things run smoother.`;
    }
  }

  private generateFallbackResponse(change: DetectedChange) {
    // Generate a clear, human-readable title based on what actually changed
    const moduleNames = change.affectedModules.filter(m => m && m !== 'undefined' && m !== 'unknown');
    const primaryModule = moduleNames[0] || this.inferModuleFromFiles(change.affectedFiles);
    
    // Create specific, action-oriented titles based on change type
    let title = '';
    switch (change.type) {
      case 'bug_fixed':
        title = `${this.formatModuleName(primaryModule)} Issue Resolved`;
        break;
      case 'feature_added':
        title = `New ${this.formatModuleName(primaryModule)} Feature Available`;
        break;
      case 'security_fix':
        title = `Security Enhancement for ${this.formatModuleName(primaryModule)}`;
        break;
      case 'enhancement':
        title = `${this.formatModuleName(primaryModule)} Performance Boost`;
        break;
      case 'hotpatch':
        title = `Quick Fix Applied to ${this.formatModuleName(primaryModule)}`;
        break;
      default:
        title = `${this.formatModuleName(primaryModule)} Improvement Released`;
    }
    
    return {
      title: title.substring(0, 70),
      summary: this.generateFallbackSummary(change),
      technicalDetails: `Modified: ${change.affectedFiles.slice(0, 5).join(', ')}${change.affectedFiles.length > 5 ? ` and ${change.affectedFiles.length - 5} more files` : ''}. Severity: ${change.severity}.`,
      requiresAction: false,
      actionRequired: null,
      endUserSummary: this.generateEndUserSummary(change),
      brokenDescription: change.type === 'bug_fixed' ? 'A workflow issue was identified and corrected by our team.' : null,
      impactDescription: this.analyzeImpact(change),
      detailedCategory: this.mapToDetailedCategory(change.type),
      sourceType: change.sourceType || 'system',
      sourceName: 'Trinity',
    };
  }
  
  private formatModuleName(module: string): string {
    if (!module || module === 'undefined' || module === 'unknown') {
      return 'Platform';
    }
    // Convert camelCase/snake_case to Title Case
    return module
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .replace(/^\s+/, '')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
      .trim();
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
      const allUsers = await db
        .select({ 
          id: users.id, 
          workspaceId: users.currentWorkspaceId 
        })
        .from(users)
        .where(isNotNull(users.currentWorkspaceId));
      
      if (allUsers.length === 0) {
        console.log('[PlatformChangeMonitor] No users with workspaces to notify');
        // REMOVED: publishPlatformUpdate was causing duplicate notifications
        // Trinity is the exclusive writer - no fallback needed
        return 0;
      }

      const notificationValues = allUsers
        .filter(user => user.workspaceId)
        .map(user => ({
          userId: user.id,
          workspaceId: user.workspaceId!,
          type: 'system' as const,
          message: summary.endUserSummary || summary.summary,
          title: summary.title,
          metadata: {
            changeEventId,
            requiresAction: summary.requiresAction,
            actionRequired: summary.actionRequired,
            // Enhanced fields for detailed display
            endUserSummary: summary.endUserSummary,
            technicalSummary: summary.summary,
            technicalDetails: summary.technicalDetails,
            brokenDescription: summary.brokenDescription,
            impactDescription: summary.impactDescription,
            detailedCategory: summary.detailedCategory,
            sourceType: summary.sourceType,
            sourceName: 'Trinity', // CRITICAL: Trinity is the single AI orchestrator for all user-facing communications
            timestamp: new Date().toISOString(),
          },
        }));

      if (notificationValues.length > 0) {
        const createdNotifications = await db.insert(notifications).values(notificationValues).returning();
        
        await db
          .update(platformChangeEvents)
          .set({ 
            notifiedAllUsers: true,
            notificationCount: notificationValues.length,
          })
          .where(eq(platformChangeEvents.id, changeEventId));

        // CRITICAL: Broadcast notifications to all connected WebSocket clients
        // This ensures real-time delivery to users watching the notification bell
        for (const notification of createdNotifications) {
          if (notification.workspaceId) {
            broadcastNotificationToUser(
              notification.workspaceId,
              notification.userId,
              notification
            );
          }
        }
      }

      // REMOVED: publishPlatformUpdate was causing DUPLICATE notifications
      // The db.insert above already creates user notifications
      // publishPlatformUpdate creates ANOTHER notification in platformUpdates table
      // Trinity is the exclusive writer - no UNS fallback needed here

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
}

export const platformChangeMonitor = new PlatformChangeMonitorService();
