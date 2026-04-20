/**
 * TRINITY LEGAL RESEARCH SERVICE
 * ==============================
 *
 * Trinity can research laws she does not already know by visiting authoritative
 * government (.gov) and state-legislature websites, extracting the relevant
 * statute via Gemini, and persisting it to `regulatory_rules` with a proper
 * citation. When she doesn't know something, she looks it up — and remembers.
 *
 * DESIGN PRINCIPLES
 *   - Only official government / legislature sources. No third-party aggregators
 *     (except Justia's state-codes mirror, which is commonly linked by .gov sites).
 *   - No raw page content is stored — only Gemini-validated extractions.
 *   - Every call is non-blocking from the chat path. Failures are logged, never thrown.
 *   - An annual cron re-verifies stale rules (see autonomousScheduler).
 */

import { db } from '../../db';
import { regulatoryRules } from '@shared/schema';
import { and, eq } from 'drizzle-orm';
import { createLogger } from '../../lib/logger';

const log = createLogger('trinityLegalResearch');

/**
 * Authoritative source URLs keyed by state + category slug. Categories in the
 * slug (before the first underscore) map to `regulatory_rules.category`.
 */
const AUTHORITATIVE_SOURCES: Record<string, Record<string, string>> = {
  TX: {
    occupations_ch1702: 'https://statutes.capitol.texas.gov/Docs/OC/htm/OC.1702.htm',
    penal_ch9:          'https://statutes.capitol.texas.gov/Docs/PE/htm/PE.9.htm',
    penal_ch30:         'https://statutes.capitol.texas.gov/Docs/PE/htm/PE.30.htm',
    penal_ch31:         'https://statutes.capitol.texas.gov/Docs/PE/htm/PE.31.htm',
    labor_ch61:         'https://statutes.capitol.texas.gov/Docs/LA/htm/LA.61.htm',
    labor_ch62:         'https://statutes.capitol.texas.gov/Docs/LA/htm/LA.62.htm',
    labor_ch21:         'https://statutes.capitol.texas.gov/Docs/LA/htm/LA.21.htm',
    licensing_psb:      'https://www.dps.texas.gov/section/private-security',
  },
  federal: {
    flsa:    'https://www.dol.gov/agencies/whd/flsa',
    fcra:    'https://www.ftc.gov/legal-library/browse/statutes/fair-credit-reporting-act',
    ada:     'https://www.ada.gov/resources/ada-requirements/',
    title7:  'https://www.eeoc.gov/statutes/title-vii-civil-rights-act-1964',
    nlra:    'https://www.nlrb.gov/guidance/key-reference-materials/national-labor-relations-act',
    i9:      'https://www.uscis.gov/i-9-central',
  },
  CA: { statutes: 'https://leginfo.legislature.ca.gov/faces/codes.xhtml' },
  FL: { statutes: 'https://www.leg.state.fl.us/statutes/' },
  GA: { statutes: 'https://law.justia.com/codes/georgia/' },
  IL: { statutes: 'https://www.ilga.gov/legislation/ilcs/ilcs.asp' },
};

/**
 * Domain allowlist. Fetching is denied for any URL not matching one of these
 * substrings, guarding against prompt-injection attempts that feed Trinity
 * a malicious "source" URL.
 */
const ALLOWED_DOMAINS = [
  'statutes.capitol.texas.gov', 'www.sos.state.tx.us',
  'www.dps.texas.gov', 'www.dol.gov', 'www.eeoc.gov',
  'www.ftc.gov', 'www.ada.gov', 'www.nlrb.gov', 'www.uscis.gov',
  'leginfo.legislature.ca.gov', 'www.leg.state.fl.us',
  'law.justia.com/codes', 'www.ilga.gov',
];

export interface LegalResearchResult {
  found: boolean;
  citation?: string;
  sourceUrl?: string;
  summary?: string;
}

class TrinityLegalResearchService {

  private isAllowedSource(url: string): boolean {
    return ALLOWED_DOMAINS.some(d => url.includes(d));
  }

  private async fetchPage(url: string): Promise<string | null> {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'CoAIleague Legal Research Bot (compliance@coaileague.com)',
        },
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) return null;
      const html = await res.text();
      // Strip HTML tags and collapse whitespace so Gemini sees readable text.
      return html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .substring(0, 12_000);
    } catch (err) {
      log.warn(`[LegalResearch] fetch failed for ${url}:`, err instanceof Error ? err.message : err);
      return null;
    }
  }

  private async extractStatute(
    question: string,
    content: string,
    state: string,
  ): Promise<{
    statuteNumber: string;
    text: string;
    summary: string;
    citation: string;
  } | null> {
    try {
      const { unifiedGeminiClient } = await import('./unifiedGeminiClient');
      const resp = await unifiedGeminiClient.generate({
        featureKey: 'trinity_legal_research',
        systemPrompt:
          'You are a legal research assistant. You extract statutes from government source text and return strictly-valid JSON. If nothing directly relevant, return the literal word "null" (no quotes, no JSON) and nothing else.',
        userMessage:
          `Question: "${question}"\nState/Scope: ${state}\n\n` +
          `From the following official legal source text, extract the statute MOST directly relevant to the question.\n\n` +
          `TEXT:\n${content}\n\n` +
          `Return ONLY valid JSON matching exactly this shape:\n` +
          `{"statuteNumber":"e.g. Tex. Occ. Code §1702.301","text":"exact statutory text (max 400 chars)","summary":"plain-English explanation (2-3 sentences)","citation":"full formal legal citation"}\n` +
          `If nothing directly relevant exists in the text, return: null`,
        temperature: 0.05,
        maxTokens: 600,
      });
      const cleaned = resp.text.replace(/```json|```/g, '').trim();
      if (cleaned === 'null' || cleaned === '') return null;
      const parsed = JSON.parse(cleaned);
      if (!parsed?.statuteNumber || !parsed?.text) return null;
      return parsed;
    } catch (err) {
      log.warn('[LegalResearch] extraction failed (non-fatal):', err instanceof Error ? err.message : err);
      return null;
    }
  }

  /**
   * Research a specific legal question for a given state + category.
   * Idempotent: if a matching rule already exists, it is refreshed in place.
   */
  async researchAndLearn(params: {
    question: string;
    state: string;
    category: string;
    workspaceId: string;
  }): Promise<LegalResearchResult> {
    const { question, state, category } = params;

    const sourceMap = AUTHORITATIVE_SOURCES[state] ?? {};
    const categoryKey = Object.keys(sourceMap).find(k => k.startsWith(category) || k.includes(category));
    const url = categoryKey ? sourceMap[categoryKey] : null;

    if (!url || !this.isAllowedSource(url)) {
      return { found: false };
    }

    const content = await this.fetchPage(url);
    if (!content) return { found: false };

    const extracted = await this.extractStatute(question, content, state);
    if (!extracted) return { found: false };

    try {
      // Look up existing rule by (state, rule_name) — no unique constraint in the
      // schema, so we update-or-insert manually rather than onConflictDoUpdate.
      const existing = await db
        .select({ id: regulatoryRules.id })
        .from(regulatoryRules)
        .where(and(
          eq(regulatoryRules.state, state),
          eq(regulatoryRules.ruleName, extracted.statuteNumber),
        ))
        .limit(1);

      const lastVerified = new Date().toISOString().substring(0, 10); // `date` column

      if (existing.length > 0) {
        await db.update(regulatoryRules)
          .set({
            ruleText: extracted.text,
            plainEnglishSummary: extracted.summary,
            statuteReference: extracted.citation,
            lastVerified,
          })
          .where(eq(regulatoryRules.id, existing[0].id));
      } else {
        await db.insert(regulatoryRules).values({
          state,
          category,
          ruleName: extracted.statuteNumber,
          ruleText: extracted.text,
          plainEnglishSummary: extracted.summary,
          statuteReference: extracted.citation,
          lastVerified,
          severity: 'informational',
          appliesTo: 'both',
        });
      }
    } catch (err) {
      log.warn('[LegalResearch] persist failed (non-fatal):', err instanceof Error ? err.message : err);
      // We still consider the research "found" — the extraction succeeded even
      // if persistence failed. The caller can still return the citation.
    }

    log.info(`[LegalResearch] Learned/refreshed: ${extracted.citation}`);
    return {
      found: true,
      citation: extracted.citation,
      sourceUrl: url,
      summary: extracted.summary,
    };
  }

  /**
   * Bootstrap every authoritative source for a state the org just expanded
   * into. Called when `workspaces.operatingStates` gains a new entry.
   * Also bootstraps federal law, which every workspace needs.
   */
  async bootstrapStateKnowledge(state: string, workspaceId: string): Promise<void> {
    const stateSources = AUTHORITATIVE_SOURCES[state] ?? {};
    for (const [key] of Object.entries(stateSources)) {
      const [category] = key.split('_');
      await this.researchAndLearn({
        question: `Core requirements for ${key.replace(/_/g, ' ')}`,
        state,
        category,
        workspaceId,
      }).catch(err => log.warn(`[LegalResearch] Bootstrap ${state}:${key} failed:`, err?.message));
    }

    for (const [key] of Object.entries(AUTHORITATIVE_SOURCES.federal ?? {})) {
      await this.researchAndLearn({
        question: `Federal ${key} requirements for security companies`,
        state: 'federal',
        category: key,
        workspaceId,
      }).catch(err => log.warn(`[LegalResearch] Bootstrap federal:${key} failed:`, err?.message));
    }

    log.info(`[LegalResearch] Bootstrapped ${state} + federal for workspace ${workspaceId}`);
  }
}

export const trinityLegalResearch = new TrinityLegalResearchService();
