/**
 * Regulatory Knowledge Service — Wave 20
 * ─────────────────────────────────────────────────────────────────────────────
 * Trinity's regulatory brain. Retrieves state-specific laws, occupation codes,
 * UoF guidelines, payroll tax rules, and audit checklists on demand.
 *
 * ARCHITECTURE:
 *   - regulatory_knowledge_base table stores all knowledge as structured rows
 *   - Trinity calls retrieve() before answering any compliance/regulatory question
 *   - New state = new seed rows. Never new code.
 *   - Trinity can also trigger web_search for states not yet in the DB
 *
 * COVERAGE:
 *   Security licensing (all states)
 *   Use of Force statutes + case law (federal + per state)
 *   Occupation codes (SOC + state workers comp)
 *   Payroll tax rules (state income tax, SUI rates, workers comp)
 *   Audit checklists (what regulators actually ask for)
 *   Form templates (UoF report, DAR, guard card renewal)
 */

import { pool } from "../db";
import { createLogger } from "../lib/logger";

const log = createLogger("RegulatoryKnowledge");

export interface KnowledgeEntry {
  id: string;
  stateCode: string;
  knowledgeType: string;
  title: string;
  summary: string;
  contentJson: Record<string, unknown> | null;
  citation: string | null;
  sourceUrl: string | null;
}

export interface RegulatoryContext {
  stateCode: string;
  stateName: string;
  regulatoryBody: string;
  entries: KnowledgeEntry[];
  payrollTaxRules: PayrollTaxRule[];
  uofGuidelines: string[];
  occupationCodes: OccupationCode[];
  auditChecklist: string[];
}

export interface PayrollTaxRule {
  ruleName: string;
  description: string;
  rate?: number;
  flatAmount?: number;
  notes: string;
}

export interface OccupationCode {
  code: string;
  system: string; // "SOC" | "workers_comp" | "state_specific"
  title: string;
  description: string;
}

// ── Main retrieval function ────────────────────────────────────────────────────

export async function retrieveRegulatoryContext(
  stateCode: string,
  types?: string[]
): Promise<RegulatoryContext> {
  const code = stateCode.toUpperCase();
  const typeFilter = types && types.length > 0 ? types : null;

  try {
    // Load state config
    const srcRow = await pool.query(
      `SELECT state_name, licensing_authority FROM state_regulatory_config
       WHERE state_code = $1 LIMIT 1`,
      [code]
    );
    const stateName = srcRow.rows[0]?.state_name || code;
    const regulatoryBody = srcRow.rows[0]?.licensing_authority || `${code} Regulatory Authority`;

    // Load knowledge entries — state-specific + FEDERAL always included
    const { rows } = await pool.query(
      `SELECT id, state_code, knowledge_type, title, summary,
              content_json, citation, source_url
       FROM regulatory_knowledge_base
       WHERE state_code = ANY($1::text[])
         AND is_active = TRUE
         ${typeFilter ? "AND knowledge_type = ANY($2::text[])" : ""}
       ORDER BY state_code, knowledge_type, title
       LIMIT 100`,
      typeFilter ? [[code, "FEDERAL"], typeFilter] : [[code, "FEDERAL"]]
    );

    const entries: KnowledgeEntry[] = rows.map(r => ({
      id: r.id,
      stateCode: r.state_code,
      knowledgeType: r.knowledge_type,
      title: r.title,
      summary: r.summary,
      contentJson: r.content_json,
      citation: r.citation,
      sourceUrl: r.source_url,
    }));

    // Extract typed subsets
    const payrollRows = entries.filter(e => e.knowledgeType === "payroll_tax_rule");
    const payrollTaxRules: PayrollTaxRule[] = payrollRows.map(e => ({
      ruleName: e.title,
      description: e.summary,
      rate: (e.contentJson as { rate?: number })?.rate,
      flatAmount: (e.contentJson as { flatAmount?: number })?.flatAmount,
      notes: (e.contentJson as { notes?: string })?.notes || "",
    }));

    const uofRows = entries.filter(e =>
      ["uof_guideline", "case_law", "statute", "penal_code"].includes(e.knowledgeType)
    );
    const uofGuidelines = uofRows.map(e => `${e.title}: ${e.summary}`);

    const occRows = entries.filter(e => e.knowledgeType === "occupation_code");
    const occupationCodes: OccupationCode[] = occRows.map(e => ({
      code: (e.contentJson as { code?: string })?.code || e.title,
      system: (e.contentJson as { system?: string })?.system || "SOC",
      title: e.title,
      description: e.summary,
    }));

    const checklistRows = entries.filter(e => e.knowledgeType === "audit_checklist");
    const auditChecklist = checklistRows.flatMap(e =>
      (e.contentJson as { items?: string[] })?.items || [e.summary]
    );

    log.info(`[RegulatoryKnowledge] Retrieved ${entries.length} entries for ${code}`);

    return {
      stateCode: code, stateName, regulatoryBody,
      entries, payrollTaxRules, uofGuidelines, occupationCodes, auditChecklist,
    };
  } catch (err: unknown) {
    log.warn(`[RegulatoryKnowledge] Retrieval failed for ${code}:`, err instanceof Error ? err.message : String(err));
    return {
      stateCode: code, stateName: code, regulatoryBody: `${code} Regulatory Authority`,
      entries: [], payrollTaxRules: [], uofGuidelines: [], occupationCodes: [], auditChecklist: [],
    };
  }
}

// ── Trinity-facing context builder ────────────────────────────────────────────
// Returns a formatted string Trinity can inject into her context window
// when answering compliance, payroll, or UoF questions.

export async function buildRegulatoryContextPrompt(
  stateCode: string,
  topic?: "payroll" | "uof" | "licensing" | "audit" | "all"
): Promise<string> {
  const types: Record<string, string[]> = {
    payroll: ["payroll_tax_rule", "occupation_code"],
    uof: ["uof_guideline", "case_law", "statute", "penal_code", "form_template"],
    licensing: ["license_tier", "renewal_requirement", "required_armed_certifications"],
    audit: ["audit_checklist", "form_template"],
    all: [],
  };

  const ctx = await retrieveRegulatoryContext(stateCode, types[topic || "all"]);
  if (ctx.entries.length === 0) return "";

  const lines: string[] = [
    `=== REGULATORY CONTEXT: ${ctx.stateName} (${ctx.stateCode}) ===`,
    `Regulatory Body: ${ctx.regulatoryBody}`,
    "",
  ];

  if (ctx.payrollTaxRules.length > 0) {
    lines.push("PAYROLL TAX RULES:");
    ctx.payrollTaxRules.forEach(r => {
      lines.push(`  • ${r.ruleName}: ${r.description}${r.rate ? ` (Rate: ${r.rate}%)` : ""}`);
    });
    lines.push("");
  }

  if (ctx.uofGuidelines.length > 0) {
    lines.push("USE OF FORCE STANDARDS:");
    ctx.uofGuidelines.forEach(g => lines.push(`  • ${g}`));
    lines.push("");
  }

  if (ctx.occupationCodes.length > 0) {
    lines.push("OCCUPATION CODES:");
    ctx.occupationCodes.forEach(o => {
      lines.push(`  • ${o.system} ${o.code}: ${o.title}`);
    });
    lines.push("");
  }

  if (ctx.auditChecklist.length > 0) {
    lines.push("AUDIT CHECKLIST:");
    ctx.auditChecklist.forEach(item => lines.push(`  ☐ ${item}`));
  }

  lines.push("=== END REGULATORY CONTEXT ===");
  return lines.join("\n");
}

// ── Schema bootstrap (idempotent) ─────────────────────────────────────────────

export async function ensureRegulatoryKnowledgeSchema(): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS regulatory_knowledge_base (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
        state_code VARCHAR(5) NOT NULL,
        knowledge_type VARCHAR(80) NOT NULL,
        title VARCHAR(300) NOT NULL,
        summary TEXT NOT NULL,
        content_json JSONB,
        citation VARCHAR(500),
        source_url TEXT,
        effective_date DATE,
        expires_date DATE,
        applicable_license_types TEXT[] DEFAULT ARRAY[]::text[],
        tags TEXT[] DEFAULT ARRAY[]::text[],
        confidence_score INTEGER DEFAULT 100,
        last_verified_at TIMESTAMP DEFAULT NOW(),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS rkb_state_type_idx ON regulatory_knowledge_base(state_code, knowledge_type);
      CREATE INDEX IF NOT EXISTS rkb_active_idx ON regulatory_knowledge_base(is_active, state_code);
    `);
    log.info("[RegulatoryKnowledge] Schema ensured");
  } catch (err: unknown) {
    log.warn("[RegulatoryKnowledge] Schema ensure non-fatal:", err instanceof Error ? err.message : String(err));
  }
}
