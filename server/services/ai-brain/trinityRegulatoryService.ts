import { db } from '../../db';
import { eq, sql } from 'drizzle-orm';
import { typedQuery } from '../../lib/typedSql';
import { regulatoryUpdates, regulatoryRules } from '@shared/schema';

import { createLogger } from '../../lib/logger';
const log = createLogger('trinityRegulatoryService');

export interface RegulatoryRule {
  id: string;
  state: string;
  category: string;
  ruleName: string;
  ruleText: string;
  plainEnglishSummary: string | null;
  statuteReference: string;
  effectiveDate: string | null;
  reviewDate: string | null;
  lastVerified: string | null;
  severity: 'informational' | 'warning' | 'blocking';
  appliesTo: 'armed' | 'unarmed' | 'company' | 'both';
}

export interface ComplianceCheckResult {
  ruleId: string;
  ruleName: string;
  statuteReference: string;
  status: 'pass' | 'fail' | 'warning' | 'not_applicable';
  finding: string;
  citation: string;
}

export interface RegulatoryUpdate {
  ruleId: string;
  changedAt: Date;
  oldText: string | null;
  newText: string;
  changedBy: string | null;
  changeReason: string | null;
}

class TrinityRegulatoryService {
  async getRulesForState(state: string, category?: string): Promise<RegulatoryRule[]> {
    const stateFilter = state.toUpperCase();

    // FIX: Replace sql.raw() string-substitution (SQL injection) with properly
    // parameterised Drizzle sql`` tagged templates. The previous implementation
    // built a query string with $1/$2 placeholders and then replaced them via
    // JavaScript string interpolation, completely bypassing parameterisation.
    const result = category
      // CATEGORY C — Raw SQL retained: ORDER BY | Tables: regulatory_rules | Verified: 2026-03-23
      ? await typedQuery(sql`
          SELECT id, state, category, rule_name, rule_text, plain_english_summary,
                 statute_reference, effective_date::text, review_date::text,
                 last_verified::text, severity, applies_to
          FROM regulatory_rules
          WHERE (state = ${stateFilter} OR state = 'US')
            AND category = ${category}
          ORDER BY severity DESC, state ASC, category ASC
        `)
      // CATEGORY C — Raw SQL retained: ORDER BY | Tables: regulatory_rules | Verified: 2026-03-23
      : await typedQuery(sql`
          SELECT id, state, category, rule_name, rule_text, plain_english_summary,
                 statute_reference, effective_date::text, review_date::text,
                 last_verified::text, severity, applies_to
          FROM regulatory_rules
          WHERE (state = ${stateFilter} OR state = 'US')
          ORDER BY severity DESC, state ASC, category ASC
        `);

    return (result as any[]).map(r => ({
      id: r.id,
      state: r.state,
      category: r.category,
      ruleName: r.rule_name,
      ruleText: r.rule_text,
      plainEnglishSummary: r.plain_english_summary,
      statuteReference: r.statute_reference,
      effectiveDate: r.effective_date,
      reviewDate: r.review_date,
      lastVerified: r.last_verified,
      severity: r.severity,
      appliesTo: r.applies_to,
    }));
  }

  async checkComplianceAgainstRules(
    employeeData: {
      state?: string;
      licenseLevel?: 'armed' | 'unarmed';
      licenseExpiry?: Date;
      trainingHours?: number;
      backgroundCheckDate?: Date;
    },
    state: string
  ): Promise<ComplianceCheckResult[]> {
    const rules = await this.getRulesForState(state, 'licensing');
    const results: ComplianceCheckResult[] = [];
    const now = new Date();

    for (const rule of rules) {
      if (rule.appliesTo !== 'both' &&
          rule.appliesTo !== 'company' &&
          rule.appliesTo !== employeeData.licenseLevel) {
        results.push({
          ruleId: rule.id,
          ruleName: rule.ruleName,
          statuteReference: rule.statuteReference,
          status: 'not_applicable',
          finding: `Rule applies to ${rule.appliesTo} officers only`,
          citation: this.formatCitation(rule),
        });
        continue;
      }

      if (rule.ruleName.includes('Renewal') || rule.ruleName.includes('Expir')) {
        if (!employeeData.licenseExpiry) {
          results.push({
            ruleId: rule.id, ruleName: rule.ruleName,
            statuteReference: rule.statuteReference,
            status: 'warning',
            finding: 'License expiry date not recorded — cannot verify renewal compliance.',
            citation: this.formatCitation(rule),
          });
        } else {
          const daysUntilExpiry = Math.floor(
            (employeeData.licenseExpiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          );
          if (daysUntilExpiry < 0) {
            results.push({
              ruleId: rule.id, ruleName: rule.ruleName,
              statuteReference: rule.statuteReference,
              status: 'fail',
              finding: `License EXPIRED ${Math.abs(daysUntilExpiry)} days ago. Officer cannot legally work. Immediate action required.`,
              citation: this.formatCitation(rule),
            });
          } else if (daysUntilExpiry <= 30) {
            results.push({
              ruleId: rule.id, ruleName: rule.ruleName,
              statuteReference: rule.statuteReference,
              status: 'warning',
              finding: `License expires in ${daysUntilExpiry} days. Renewal urgently needed.`,
              citation: this.formatCitation(rule),
            });
          } else if (daysUntilExpiry <= 90) {
            results.push({
              ruleId: rule.id, ruleName: rule.ruleName,
              statuteReference: rule.statuteReference,
              status: 'warning',
              finding: `License expires in ${daysUntilExpiry} days. Schedule renewal within 30 days.`,
              citation: this.formatCitation(rule),
            });
          } else {
            results.push({
              ruleId: rule.id, ruleName: rule.ruleName,
              statuteReference: rule.statuteReference,
              status: 'pass',
              finding: `License valid for ${daysUntilExpiry} more days.`,
              citation: this.formatCitation(rule),
            });
          }
        }
      } else {
        results.push({
          ruleId: rule.id, ruleName: rule.ruleName,
          statuteReference: rule.statuteReference,
          status: 'pass',
          finding: `Rule acknowledged: ${rule.plainEnglishSummary || rule.ruleText.substring(0, 120)}`,
          citation: this.formatCitation(rule),
        });
      }
    }

    return results;
  }

  async getUpcomingRuleReviews(daysAhead: number = 90): Promise<RegulatoryRule[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() + daysAhead);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];
    const todayStr = new Date().toISOString().split('T')[0];

    // CATEGORY C — Raw SQL retained: IS NOT NULL | Tables: regulatory_rules | Verified: 2026-03-23
    const result = await typedQuery(sql`
      SELECT id, state, category, rule_name, rule_text, plain_english_summary,
             statute_reference, effective_date::text, review_date::text,
             last_verified::text, severity, applies_to
      FROM regulatory_rules
      WHERE review_date IS NOT NULL
        AND review_date <= ${cutoffStr}
        AND review_date >= ${todayStr}
      ORDER BY review_date ASC
    `);

    return (result as any[]).map(r => ({
      id: r.id,
      state: r.state,
      category: r.category,
      ruleName: r.rule_name,
      ruleText: r.rule_text,
      plainEnglishSummary: r.plain_english_summary,
      statuteReference: r.statute_reference,
      effectiveDate: r.effective_date,
      reviewDate: r.review_date,
      lastVerified: r.last_verified,
      severity: r.severity,
      appliesTo: r.applies_to,
    }));
  }

  async citedRule(ruleId: string): Promise<string> {
    // CATEGORY C — Raw SQL retained: AI brain engine regulatory rule lookup with multi-column SELECT | Tables: regulatory_rules | Verified: 2026-03-23
    const result = await typedQuery(sql`
      SELECT rule_name, statute_reference, plain_english_summary, state, severity
      FROM regulatory_rules WHERE id = ${ruleId}
    `);

    if (!(result as any[]).length) return `[Rule ${ruleId} not found]`;
    const r = (result as any[])[0] as any;
    const stateLabel = r.state === 'US' ? 'Federal Law' : `${r.state} State Law`;
    return `[${stateLabel}] ${r.rule_name} — ${r.statute_reference}${
      r.plain_english_summary ? ` | Plain English: ${r.plain_english_summary}` : ''
    }`;
  }

  formatCitation(rule: RegulatoryRule): string {
    const stateLabel = rule.state === 'US' ? 'Federal' : rule.state;
    return `${stateLabel}: ${rule.statuteReference}`;
  }

  async recordUpdate(
    ruleId: string, newText: string,
    changedBy: string, changeReason: string
  ): Promise<void> {
    // CATEGORY C — Raw SQL retained: AI brain engine regulatory rule text lookup | Tables: regulatory_rules | Verified: 2026-03-23
    const existing = await typedQuery(sql`
      SELECT rule_text FROM regulatory_rules WHERE id = ${ruleId}
    `);
    const oldText = (existing as any[]).length ? ((existing as any[])[0] as any).rule_text : null;

    await db.insert(regulatoryUpdates).values({
      ruleId: ruleId,
      oldText: oldText,
      newText: newText,
      changedBy: changedBy,
      changeReason: changeReason,
    });

    await db.update(regulatoryRules).set({
      ruleText: newText,
      lastVerified: sql`CURRENT_DATE`,
    }).where(eq(regulatoryRules.id, ruleId));
  }

  async getRulesForMorningBriefing(): Promise<{
    expiringSoon: RegulatoryRule[];
    summary: string;
  }> {
    const expiringSoon = await this.getUpcomingRuleReviews(90);

    if (expiringSoon.length === 0) {
      return {
        expiringSoon: [],
        summary: 'All regulatory rules are current. No review dates approaching within 90 days.',
      };
    }

    const critical = expiringSoon.filter(r => r.severity === 'blocking');
    const warnings = expiringSoon.filter(r => r.severity === 'warning');

    let summary = `REGULATORY REVIEW ALERT: ${expiringSoon.length} rule(s) need re-verification within 90 days.`;
    if (critical.length) {
      summary += ` CRITICAL: ${critical.map(r => `${r.ruleName} (${r.statuteReference})`).join(', ')} — these blocking rules need immediate review.`;
    }
    if (warnings.length) {
      summary += ` Also: ${warnings.length} warning-level rules approaching review date.`;
    }

    // === THALAMUS WIRING — Phase A Regulatory KB ===
    // Emit COMPLIANCE_SIGNAL for blocking regulatory rules approaching review
    if (critical.length > 0) {
      try {
        const { trinityThalamus } = await import('./trinityThalamusService');
        await trinityThalamus.process(
          {
            event: 'regulatory_review',
            type: 'compliance_signal',
            summary,
            blockingRules: critical.map(r => r.ruleName),
            states: [...new Set(critical.map(r => r.state))],
          },
          'regulatory_kb',
          undefined,
          undefined,
          // @ts-expect-error — TS migration: fix in refactoring sprint
          'PLATFORM',
        ).catch(() => null);
      } catch {
        // Non-fatal — regulatory data must always flow
      }
    }

    return { expiringSoon, summary };
  }

  async getSystemPromptRegulatoryContext(state: string = 'TX'): Promise<string> {
    const rules = await this.getRulesForState(state);
    const federal = await this.getRulesForState('US');
    const allRules = [...rules.filter(r => r.state === state), ...federal];
    const blocking = allRules.filter(r => r.severity === 'blocking');

    return `REGULATORY KNOWLEDGE BASE — ${state} + FEDERAL (${allRules.length} verified rules):
CRITICAL INSTRUCTION: Before making ANY compliance recommendation, cite the specific statute from the rules below.
Never say "you should comply with state law" without citing the exact statute reference.

BLOCKING RULES (non-negotiable legal requirements):
${blocking.map(r => `• ${r.ruleName}: ${r.plainEnglishSummary || r.ruleText.substring(0, 150)} [${r.statuteReference}]`).join('\n')}

When citing a rule, always format as: "Per [statute reference] — [plain English summary]"
Example: "Per Texas Occupations Code § 1702.165 — Armed officers must pass an annual 50-round qualification course with a minimum score of 70%."`;
  }
}

export const trinityRegulatoryService = new TrinityRegulatoryService();
