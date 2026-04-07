/**
 * TRINITY DISCIPLINARY PATTERN ANALYZER
 * ========================================
 * Monitors for behavioral patterns and performs deep contextual analysis
 * before surfacing any suggestion to humans.
 *
 * CRITICAL RULE: Trinity NEVER accuses. She identifies patterns,
 * investigates context, presents evidence, suggests — never concludes.
 * All suggestions go to the appropriate human tier. Trinity documents.
 * Humans decide.
 *
 * Pattern types:
 *  - Tardiness: 3+ late clock-ins in 30 days
 *  - Calloff pattern: 3+ calloffs in 60 days
 *  - Report delinquency: 2+ missed/late DARs in 30 days
 *  - Client complaint: any verified legitimate complaint → full 5W1H
 */

import { pool } from '../../db';
import { createNotification } from '../notificationService';
import { typedPool } from '../../lib/typedSql';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityDisciplinaryAnalyzer');

export interface DisciplinaryPattern {
  patternType: 'tardiness' | 'calloff_pattern' | 'report_delinquency' | 'client_complaint';
  employeeId: string;
  workspaceId: string;
  employeeName: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  instances: any[];
  investigation: Record<string, string>;
  suggestion: string;
  suggestedAction: string;
  routeTo: 'supervisor' | 'manager' | 'owner';
  fiveW1H?: Record<string, string>;
}

class TrinityDisciplinaryAnalyzer {

  /** Weekly scan — runs in dream state */
  async scanWorkspace(workspaceId: string): Promise<DisciplinaryPattern[]> {
    const patterns: DisciplinaryPattern[] = [];

    const [tardiness, calloffs, reports] = await Promise.all([
      this.detectTardinessPatterns(workspaceId),
      this.detectCalloffPatterns(workspaceId),
      this.detectReportDelinquency(workspaceId)
    ]);

    patterns.push(...tardiness, ...calloffs, ...reports);
    return patterns;
  }

  /** TARDINESS: 3+ late clock-ins in 30 days */
  private async detectTardinessPatterns(workspaceId: string): Promise<DisciplinaryPattern[]> {
    // CATEGORY C — Raw SQL retained: GROUP BY | Tables: te, time_entries, shifts, employees | Verified: 2026-03-23
    const { rows } = await typedPool(`
      SELECT
        te.employee_id,
        e.first_name || ' ' || e.last_name AS employee_name,
        COUNT(*) AS late_count,
        ARRAY_AGG(te.clock_in ORDER BY te.clock_in) AS late_instances,
        ARRAY_AGG(s.start_time ORDER BY te.clock_in) AS scheduled_times,
        ARRAY_AGG(EXTRACT(DOW FROM te.clock_in)::int ORDER BY te.clock_in) AS days_of_week,
        ARRAY_AGG(s.site_id ORDER BY te.clock_in) AS sites
      FROM time_entries te
      JOIN shifts s ON s.id = te.shift_id
      JOIN employees e ON e.id = te.employee_id
      WHERE te.workspace_id = $1
        AND te.clock_in > s.start_time + INTERVAL '5 minutes'
        AND te.clock_in >= NOW() - INTERVAL '30 days'
      GROUP BY te.employee_id, e.first_name, e.last_name
      HAVING COUNT(*) >= 3
    `, [workspaceId]);

    return rows.map(r => {
      const dowPattern = this.detectDayOfWeekPattern(r.days_of_week || []);
      const sitePattern = this.detectSitePattern(r.sites || []);
      return {
        patternType: 'tardiness' as const,
        employeeId: r.employee_id,
        workspaceId,
        employeeName: r.employee_name,
        severity: r.late_count >= 6 ? 'medium' : 'low',
        instances: r.late_instances || [],
        investigation: {
          lateCount: String(r.late_count),
          dayOfWeekPattern: dowPattern || 'No clear pattern',
          sitePattern: sitePattern || 'Multiple sites',
          recommendation: 'Supervisor check-in to understand root cause before any formal action'
        },
        suggestion: `PATTERN FLAGGED — NOT A CONCLUSION\nOfficer: ${r.employee_name}\nPattern: ${r.late_count} late clock-ins in the last 30 days\nContext: ${dowPattern ? `Appears more frequent on ${dowPattern}` : 'No clear day-of-week pattern'}. ${sitePattern ? `Concentrated at specific site.` : ''}\n\nSuggested first step: Supervisor check-in to understand if there is a reason before any formal action.`,
        suggestedAction: 'Schedule supervisor check-in',
        routeTo: 'supervisor'
      } as DisciplinaryPattern;
    });
  }

  /** CALLOFFS: 3+ calloffs in 60 days */
  private async detectCalloffPatterns(workspaceId: string): Promise<DisciplinaryPattern[]> {
    // CATEGORY C — Raw SQL retained: GROUP BY | Tables: s, shifts, employees | Verified: 2026-03-23
    const { rows } = await typedPool(`
      SELECT
        s.employee_id,
        e.first_name || ' ' || e.last_name AS employee_name,
        COUNT(*) AS calloff_count,
        ARRAY_AGG(s.start_time ORDER BY s.start_time) AS calloff_dates,
        ARRAY_AGG(EXTRACT(DOW FROM s.start_time)::int ORDER BY s.start_time) AS days_of_week
      FROM shifts s
      JOIN employees e ON e.id = s.employee_id
      WHERE s.workspace_id = $1
        AND s.status IN ('cancelled', 'calloff', 'no_show')
        AND s.start_time >= NOW() - INTERVAL '60 days'
        AND e.is_active = true
      GROUP BY s.employee_id, e.first_name, e.last_name
      HAVING COUNT(*) >= 3
    `, [workspaceId]);

    return rows.map(r => {
      const dowPattern = this.detectDayOfWeekPattern(r.days_of_week || []);
      return {
        patternType: 'calloff_pattern' as const,
        employeeId: r.employee_id,
        workspaceId,
        employeeName: r.employee_name,
        severity: r.calloff_count >= 5 ? 'medium' : 'low',
        instances: r.calloff_dates || [],
        investigation: {
          calloffCount: String(r.calloff_count),
          dayOfWeekPattern: dowPattern || 'No clear pattern',
          welfareCheckNeeded: 'YES — always check welfare before disciplinary consideration',
          recommendation: 'Begin with a welfare check. Is this officer okay? Health issue, childcare, transportation? Do not flag formally until welfare check complete.'
        },
        suggestion: `PATTERN FLAGGED — WELFARE FIRST\nOfficer: ${r.employee_name}\nPattern: ${r.calloff_count} calloffs in the last 60 days\n${dowPattern ? `Pattern: ${dowPattern}` : ''}\n\nFirst action is ALWAYS a welfare check — is this officer okay? — before any disciplinary consideration.`,
        suggestedAction: 'Conduct welfare check before any formal action',
        routeTo: 'supervisor'
      } as DisciplinaryPattern;
    });
  }

  /** REPORT DELINQUENCY: 2+ missed/late DARs in 30 days */
  private async detectReportDelinquency(workspaceId: string): Promise<DisciplinaryPattern[]> {
    // CATEGORY C — Raw SQL retained: GROUP BY | Tables: shifts, employees, daily_activity_reports | Verified: 2026-03-23
    const { rows } = await typedPool(`
      SELECT
        s.employee_id,
        e.first_name || ' ' || e.last_name AS employee_name,
        COUNT(*) AS shifts_without_report,
        ARRAY_AGG(s.start_time ORDER BY s.start_time) AS shift_dates,
        ARRAY_AGG(s.site_id ORDER BY s.start_time) AS sites
      FROM shifts s
      JOIN employees e ON e.id = s.employee_id
      LEFT JOIN daily_activity_reports dar
        ON dar.employee_id = s.employee_id
        AND dar.created_at BETWEEN s.start_time AND s.end_time + INTERVAL '2 hours'
      WHERE s.workspace_id = $1
        AND s.status = 'completed'
        AND s.start_time >= NOW() - INTERVAL '30 days'
        AND e.is_active = true
        AND dar.id IS NULL
      GROUP BY s.employee_id, e.first_name, e.last_name
      HAVING COUNT(*) >= 2
    `, [workspaceId]).catch(() => ({ rows: [] }));

    return rows.map(r => ({
      patternType: 'report_delinquency' as const,
      employeeId: r.employee_id,
      workspaceId,
      employeeName: r.employee_name,
      severity: 'low' as const,
      instances: r.shift_dates || [],
      investigation: {
        missedReports: String(r.shifts_without_report),
        possibleCause: 'Connectivity issues at site? Complex shift? Training gap?',
        recommendation: 'Training and support first — not discipline. Check if site connectivity is an issue.'
      },
      suggestion: `REPORT DELINQUENCY FLAGGED\nOfficer: ${r.employee_name}\nMissed ${r.shifts_without_report} report(s) in the last 30 days.\n\nInvestigated context: Consider whether site connectivity or shift complexity may be contributing. First suggestion: training and support — not discipline.`,
      suggestedAction: 'Schedule report training session',
      routeTo: 'supervisor' as const
    }));
  }

  /** CLIENT COMPLAINT: Full 5W1H deep think — runs immediately on any verified complaint */
  async analyzeClientComplaint(
    workspaceId: string,
    employeeId: string,
    complaintData: {
      complaintId?: string;
      allegation: string;
      clientName: string;
      siteId?: string;
      incidentDate?: string;
    }
  ): Promise<DisciplinaryPattern> {

    const [empData, history, incidentContext, priorComplaints] = await Promise.all([
      this.getEmployeeContext(workspaceId, employeeId),
      this.getEmployeeHistory(workspaceId, employeeId),
      this.getIncidentContext(workspaceId, employeeId, complaintData.siteId, complaintData.incidentDate),
      this.getPriorComplaints(workspaceId, employeeId)
    ]);

    const fiveW1H: Record<string, string> = {
      WHO: `${empData?.firstName} ${empData?.lastName} (ID: ${employeeId}). Identity confirmed via employee record. Complaint is about this officer specifically.`,
      WHAT: `Alleged behavior: "${complaintData.allegation}". ${this.identifyPolicyViolation(complaintData.allegation)}`,
      WHEN: `Incident date: ${complaintData.incidentDate || 'Not specified'}. Cross-referenced with clock records: ${incidentContext.wasOnSite ? 'Officer was on site at that time per clock records.' : 'Clock records do not confirm officer was on site — verify assignment.'}`,
      WHERE: `Client: ${complaintData.clientName}. Site: ${incidentContext.siteName || complaintData.siteId || 'Unknown'}. Supervisor on duty: ${incidentContext.supervisorName || 'Not identified'}.`,
      WHY: `Context: ${priorComplaints > 0 ? `This officer has ${priorComplaints} prior complaint(s) on record.` : 'No prior complaints on record — this is a first incident.'} ${incidentContext.priorSiteIssues ? 'There are prior reported issues at this site that may be relevant.' : 'No prior issues documented at this site.'} Tenure: ${history.tenureMonths} months.`,
      HOW: this.determineDisciplinaryApproach(priorComplaints, complaintData.allegation, history)
    };

    const routeTo = priorComplaints > 1 || this.isSeriousAllegation(complaintData.allegation) ? 'owner' :
                    priorComplaints === 1 ? 'manager' : 'supervisor';

    const severity = this.isSeriousAllegation(complaintData.allegation) ? 'critical' :
                     priorComplaints > 0 ? 'high' : 'medium';

    const suggestion = this.buildComplaintSuggestion(fiveW1H, empData, routeTo, priorComplaints, severity);

    return {
      patternType: 'client_complaint',
      employeeId,
      workspaceId,
      employeeName: `${empData?.firstName} ${empData?.lastName}`,
      severity,
      instances: [complaintData],
      investigation: fiveW1H,
      fiveW1H,
      suggestion,
      suggestedAction: routeTo === 'supervisor' ? 'Supervisor counseling session' :
                       routeTo === 'manager' ? 'Manager review meeting' : 'Owner escalation — immediate',
      routeTo
    };
  }

  private determineDisciplinaryApproach(priorComplaints: number, allegation: string, history: any): string {
    if (this.isSeriousAllegation(allegation)) {
      return 'Serious allegation — escalate to owner immediately. Do not handle at supervisor level. Document everything.';
    }
    if (priorComplaints === 0) {
      return `First complaint, tenure ${history.tenureMonths} months. Recommended approach: Supervisor counseling session with documentation. Focus on understanding what happened before any formal action.`;
    }
    if (priorComplaints === 1) {
      return 'Second complaint. Manager review required. Consider site reassignment if pattern is site-specific. Formal counseling with written documentation.';
    }
    return 'Pattern of complaints. Owner escalation. Consider assignment review and formal progressive discipline process.';
  }

  private buildComplaintSuggestion(fiveW1H: Record<string, string>, emp: any, routeTo: string, priorComplaints: number, severity: string): string {
    return `CLIENT COMPLAINT — 5W1H ANALYSIS COMPLETE\n\nOfficer: ${emp?.firstName} ${emp?.lastName}\nSeverity: ${severity.toUpperCase()}\nRoute to: ${routeTo.toUpperCase()}\n\n${Object.entries(fiveW1H).map(([k, v]) => `${k}: ${v}`).join('\n\n')}\n\nTrinity's assessment: ${priorComplaints === 0 ? 'First incident. Approach with a conversation, not a conclusion.' : 'Pattern emerging. Formal process recommended.'}`;
  }

  private isSeriousAllegation(allegation: string): boolean {
    const serious = ['assault', 'harassment', 'theft', 'violence', 'threatening', 'discriminat', 'weapon', 'drunk', 'intoxicat'];
    return serious.some(s => allegation.toLowerCase().includes(s));
  }

  private identifyPolicyViolation(allegation: string): string {
    if (allegation.toLowerCase().includes('late')) return 'Potential punctuality policy concern.';
    if (allegation.toLowerCase().includes('rude') || allegation.toLowerCase().includes('unprofessional')) return 'Potential professional conduct policy concern.';
    if (allegation.toLowerCase().includes('absent') || allegation.toLowerCase().includes('abandoned')) return 'Potential post abandonment concern.';
    return 'Policy classification pending review.';
  }

  private detectDayOfWeekPattern(days: number[]): string | null {
    if (!days.length) return null;
    const counts: Record<number, number> = {};
    for (const d of days) counts[d] = (counts[d] || 0) + 1;
    const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dominant = Object.entries(counts).sort((a, b) => Number(b[1]) - Number(a[1]))[0];
    if (dominant && Number(dominant[1]) >= Math.ceil(days.length * 0.5)) {
      return names[Number(dominant[0])];
    }
    return null;
  }

  private detectSitePattern(sites: string[]): string | null {
    if (!sites.length) return null;
    const counts: Record<string, number> = {};
    for (const s of sites) if (s) counts[s] = (counts[s] || 0) + 1;
    const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (dominant && dominant[1] >= Math.ceil(sites.length * 0.6)) return `Concentrated at site ${dominant[0]}`;
    return null;
  }

  private async getEmployeeContext(workspaceId: string, employeeId: string) {
    // CATEGORY C — Raw SQL retained: position | Tables: employees | Verified: 2026-03-23
    const { rows } = await typedPool(`
      SELECT first_name, last_name, hire_date, performance_score, position
      FROM employees WHERE id = $1 AND workspace_id = $2
    `, [employeeId, workspaceId]);
    return rows[0] || null;
  }

  private async getEmployeeHistory(workspaceId: string, employeeId: string) {
    // CATEGORY C — Raw SQL retained: simple primary-key lookup with pool (no ORM path here) | Tables: employees | Verified: 2026-03-24
    const { rows } = await typedPool(`
      SELECT hire_date FROM employees WHERE id = $1
    `, [employeeId]);
    const hireDate = rows[0]?.hire_date ? new Date(rows[0].hire_date) : new Date();
    const tenureMonths = Math.floor((Date.now() - hireDate.getTime()) / (1000 * 60 * 60 * 24 * 30));
    return { tenureMonths };
  }

  private async getIncidentContext(workspaceId: string, employeeId: string, siteId?: string, incidentDate?: string) {
    const context: any = { wasOnSite: false, siteName: null, supervisorName: null, priorSiteIssues: false };
    if (incidentDate && siteId) {
      // CATEGORY C — Raw SQL retained: LIMIT | Tables: time_entries, shifts | Verified: 2026-03-23
      const { rows } = await typedPool(`
        SELECT te.id FROM time_entries te
        JOIN shifts s ON s.id = te.shift_id
        WHERE te.employee_id = $1 AND s.site_id = $2
          AND te.clock_in::date = $3::date
        LIMIT 1
      `, [employeeId, siteId, incidentDate]).catch(() => ({ rows: [] }));
      context.wasOnSite = rows.length > 0;
    }
    return context;
  }

  private async getPriorComplaints(workspaceId: string, employeeId: string): Promise<number> {
    // CATEGORY C — Raw SQL retained: COUNT( | Tables: milestone_tracker | Verified: 2026-03-23
    const { rows } = await typedPool(`
      SELECT COUNT(*) AS cnt FROM milestone_tracker
      WHERE workspace_id = $1 AND employee_id = $2
        AND milestone_type = 'client_complaint_verified'
    `, [workspaceId, employeeId]).catch(() => ({ rows: [{ cnt: 0 }] }));
    return Number(rows[0]?.cnt) || 0;
  }

  /** Surface a disciplinary suggestion to the appropriate human tier */
  async surfaceSuggestion(pattern: DisciplinaryPattern): Promise<void> {
    // CATEGORY C — Raw SQL retained: ORDER BY | Tables: workspace_members | Verified: 2026-03-23
    const { rows: target } = await typedPool(`
      SELECT user_id FROM workspace_members
      WHERE workspace_id = $1 AND role = $2
      ORDER BY created_at ASC LIMIT 1
    `, [pattern.workspaceId, pattern.routeTo === 'owner' ? 'org_owner' : pattern.routeTo === 'manager' ? 'org_manager' : 'supervisor']);

    const targetUserId = target[0]?.user_id;
    if (targetUserId) {
      await createNotification({
        workspaceId: pattern.workspaceId,
        userId: targetUserId,
        type: 'disciplinary_pattern',
        title: `Pattern Flagged: ${pattern.employeeName}`,
        message: pattern.suggestion.slice(0, 500),
        priority: pattern.severity === 'critical' ? 'urgent' : pattern.severity === 'high' ? 'high' : 'normal'
      } as any).catch(() => null);
    }
  }
}

export const trinityDisciplinaryAnalyzer = new TrinityDisciplinaryAnalyzer();
log.info('[TrinityDisciplinaryAnalyzer] Initialized — pattern detection with 5W1H deep think ready');
