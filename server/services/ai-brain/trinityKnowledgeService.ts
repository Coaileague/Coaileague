/**
 * TRINITY KNOWLEDGE SERVICE
 * =========================
 * Manages Trinity's static industry knowledge base and per-org learned knowledge.
 *
 * Three knowledge sources:
 *  1. STATIC — Pre-loaded modules: TX Ch.1702, multi-state licensing, use of force,
 *              tax tables, pricing economics, labor law. Same across all orgs.
 *  2. ORG-SPECIFIC — Learned from each org's uploads and operations.
 *  3. REAL-TIME — Live events (handled by event bus, not stored here).
 */

import { db } from '../../db';
import { trinityKnowledgeBase } from '@shared/schema';
import { eq, and, or, ilike, isNull, not, sql } from 'drizzle-orm';
import { createLogger } from '../../lib/logger';

const log = createLogger('TrinityKnowledgeService');

// ============================================================================
// TYPES
// ============================================================================

export interface KnowledgeQueryResult {
  moduleKey: string;
  title: string;
  category: string;
  content: string;
  scope: string;
  stateCode: string | null;
  relevanceHint?: string;
}

// ============================================================================
// STATIC KNOWLEDGE MODULES
// Full content from the Trinity Intelligence Architecture spec
// ============================================================================

const STATIC_MODULES = [
  // ────────────────────────────────────────────────────────────
  // TEXAS SECURITY REGULATIONS — Chapter 1702
  // ────────────────────────────────────────────────────────────
  {
    moduleKey: 'texas_security_1702',
    scope: 'state',
    stateCode: 'TX',
    title: 'Texas Security Regulations — Chapter 1702 (Private Security Act)',
    category: 'regulation',
    source: 'Texas Occupations Code Chapter 1702; Texas Administrative Code Title 37, Part 1, Chapter 35',
    effectiveDate: '2024-01-01',
    content: `# Texas Security Regulations — Chapter 1702

## Governing Authority
- Texas Occupations Code Chapter 1702 — Private Security Act
- Administered by: Texas Department of Public Safety (DPS), Private Security Bureau (PSB)
- Texas Administrative Code Title 37, Part 1, Chapter 35

## License Types & Requirements

### Company License
- Required for any company providing security services in Texas
- Application through PSB; background check on principals
- Minimum liability insurance required
- Designated security manager must be licensed

### Individual Security Personnel Licenses

**Level II — Unarmed Security Officer**
- Minimum 6 hours PSB-approved classroom training
- Pass written exam
- Background check (no felony convictions, certain misdemeanors disqualifying)
- No firearm carry authorized
- Pocket card issued; must be carried on duty

**Level III — Armed Security Officer (Commissioned)**
- All Level II requirements
- PLUS 30 hours additional training (marksmanship, legal authority, use of force)
- Firearms proficiency qualification (pass/fail range test)
- Authorized to carry firearm on duty
- Must qualify semi-annually (firearm proficiency)

**Level IV — Personal Protection Officer (PPO)**
- All Level III requirements
- PLUS 15 hours PPO-specific training
- Threat assessment, executive protection protocols
- Authorized for close-protection assignments

### Continuing Education
- Level II: 4 hours annually
- Level III/IV: 6 hours annually (must include use-of-force update)

## Training Curriculum Requirements (PSB-Approved)
- Legal powers and limitations of security officers
- Emergency response procedures
- Report writing
- Interpersonal communications and professional conduct
- Prohibited conduct

## Supervision Requirements
- Licensed company must supervise all personnel
- Commissioned officers must be supervised by Level IV or designated manager
- Supervision ratios vary by site type

## Record Keeping Obligations
- Maintain training records for all employees
- Keep copies of pocket cards on file
- Log incidents within 24 hours
- Retain records minimum 3 years

## Penalties for Non-Compliance
- Operating without license: Class A misdemeanor → felony for repeat offense
- Individual violations: License suspension/revocation
- Unlicensed personnel on duty: Company license jeopardy

## Pocket Card Requirements
- Card issued by PSB, must be renewed annually
- Must be carried during all security duties
- Must be displayed upon request of law enforcement

## Related Statutes
- Texas Penal Code Chapter 9 — Justification / Use of Force
  - § 9.31 Self-defense
  - § 9.32 Deadly force in defense of person
  - § 9.41–9.43 Protection of property
- Government Code Chapter 411 — CHL/LTC interactions
- Chapter 1701 — Law enforcement jurisdiction boundaries
- Chapter 1703 — Private investigators (overlap areas)

## Trinity Use Cases
- Employee certification compliance checking
- Generating compliance reports
- Building training requirements per employee
- Flagging expiring licenses/certifications
- Onboarding documentation checklists
- RFP response regulatory compliance sections
- Answering "Ask Trinity" regulatory questions`,
  },

  // ────────────────────────────────────────────────────────────
  // MULTI-STATE SECURITY LICENSING
  // ────────────────────────────────────────────────────────────
  {
    moduleKey: 'multistate_security_licensing',
    scope: 'global',
    stateCode: null,
    title: 'Multi-State Security Licensing Overview',
    category: 'licensing',
    source: 'State licensing boards; ASIS International; National Council of Investigation & Security Services',
    effectiveDate: '2025-01-01',
    content: `# Multi-State Security Licensing Overview

## State-by-State Licensing Requirements

| State | Governing Body | License Types | Training Requirement | Key Notes |
|-------|---------------|---------------|---------------------|-----------|
| **Texas** | PSB (DPS) | Lvl II, III, IV, PPO | 6hr (unarmed), 30hr (armed) | Base reference state |
| **California** | BSIS (DCA) | Guard Card, Firearm Permit, PPO | 40hr Guard Card, 8hr OJT | Exposed firearm permit separate; highest training requirement |
| **Florida** | DOACS Div of Licensing | D License (unarmed), G License (armed) | 40hr Class D, 28hr Class G | Statewide preemption; no local licensing |
| **New York** | DOS (Dept of State) | Unarmed Guard, Armed Guard | 47hr unarmed, 8hr OJT annual | NYC requires separate registration |
| **Illinois** | IDFPR | PERC card | 20hr basic, 20hr firearm | Firearm owners ID (FOID) required separately |
| **Arizona** | DPS | Guard, Armed Guard | Minimal (AZ has light requirements) | No training hours mandated for unarmed |
| **Georgia** | GPSB | Guard, Armed Guard | 24hr basic, 8hr annual refresher | Background check through GBI |
| **Nevada** | SED | Security Guard | 16hr classroom, OJT | Background check; PILB oversight |
| **Colorado** | DORA | Security Guard | No state training requirement | Local jurisdiction may require |
| **Washington** | Dept of Licensing | Security Guard | 8hr pre-assignment, ongoing | Agency license + individual registration |

## License Reciprocity
- No universal reciprocity between states
- Some states accept training from other states on case-by-case basis
- Multi-state operators must obtain separate licenses in each operating state
- Always verify current requirements — these change frequently

## Employee Transfer Checklist (State Change)
When an employee transfers from TX to CA:
1. Obtain California Guard Card (40hr training if not previously completed)
2. If armed: obtain CA Firearms Permit (separate from Guard Card)
3. Ensure background check current (CA has own standards)
4. Update records in both states' systems
5. Employee cannot work until CA license issued

## Trinity Use Cases
- Org expanding to new state: What licenses are needed?
- Employee transferring between states: What additional certs required?
- Compliance dashboard: Are we legal in every state we operate?
- RFP responses: Demonstrating multi-state licensing capability
- Contract proposals: Pricing that accounts for state-specific compliance costs`,
  },

  // ────────────────────────────────────────────────────────────
  // USE OF FORCE DOCTRINE
  // ────────────────────────────────────────────────────────────
  {
    moduleKey: 'use_of_force_security',
    scope: 'global',
    stateCode: null,
    title: 'Use of Force Doctrine — Security Industry',
    category: 'use_of_force',
    source: 'Texas Penal Code; ASIS International UoF Guidelines; TABC Regulations',
    effectiveDate: '2024-01-01',
    content: `# Use of Force Doctrine — Security Industry

## Use of Force Continuum (Security-Specific)

1. **Professional Presence** — Uniform, posture, confident demeanor. Deters most incidents.
2. **Verbal Commands** — Clear, direct communication. De-escalation first priority.
3. **Soft Hand Control** — Escort holds, guided compliance. Touch only as last resort.
4. **Hard Hand Control** — Restraint techniques. ONLY if authorized by contract AND licensing (Level II minimum).
5. **Intermediate Weapons** — OC spray, baton. ONLY if licensed (Level III) AND authorized by contract AND site post orders.
6. **Deadly Force** — Firearm discharge. ONLY Level III/IV commissioned officers. ONLY per Penal Code Chapter 9.

## Key Legal Principles

### Security Officers Are NOT Law Enforcement
- No arrest authority beyond citizen's arrest (state law varies)
- Cannot trespass persons without property owner direction
- Cannot search persons without consent (unless licensed PE state statutes apply)
- Must immediately call law enforcement for criminal matters

### Citizen's Arrest (Texas)
- Texas Code of Criminal Procedure Art. 14.01
- Any person may arrest another for felony committed in their presence
- Must immediately deliver to law enforcement
- High legal liability — train officers to call 911 instead when possible

### Duty to Retreat vs Stand Your Ground
- Texas: "Castle Doctrine" — no duty to retreat when lawfully present
- California: Duty to retreat if possible before using force
- Florida: Stand Your Ground — no duty to retreat anywhere you have right to be
- Always know which state's law governs the site

### Liability Structure
- Company vicariously liable for officer actions in course of employment
- Individual officer personally liable if acting outside scope/authority
- Excessive force claims: both company AND individual face exposure
- Document everything — incident reports are legal protection

## Incident Documentation Requirements
After ANY use of force (all levels above Level 2):
1. Written incident report within 2 hours
2. Supervisor notification immediately
3. If weapons drawn: notify management immediately + document
4. If force applied: notify law enforcement + document
5. Preserve any video footage immediately
6. Do NOT discuss with client without supervisor present

## TABC-Specific Rules (Texas Alcoholic Beverage Commission)
### 51% Establishments (Bars, Clubs, Venues)
- Security cannot be employed by the establishment in dual role (security + bartender/server)
- Must be employed by licensed security company (your company)
- Cannot consume alcohol while on duty at any time

### Intoxicated Person Procedures
- May detain briefly to prevent harm to self or others (common law authority)
- Call 911 if person unable to care for themselves
- Document all interactions with intoxicated persons
- Never use physical force to prevent an intoxicated person from leaving — liability exposure

### ID Verification Authority
- No authority to confiscate IDs (law enforcement only)
- Can deny entry based on ID verification
- Document refusals when possible

### Ejection Procedures
- Must use minimum necessary force
- Never throw, push, or use force that could cause injury during ejection
- Call police if person refuses to leave peacefully
- Document every ejection with time, reason, officer name

## Trinity Use Cases
- Training compliance verification (do officers know force continuum?)
- Incident report review: Was force appropriate per doctrine?
- Post orders generation: Site-specific force authorization levels
- Contract proposals: Specifying authorized force levels per site type
- Legal risk assessment on incident reports
- Flagging incidents that may need legal counsel review`,
  },

  // ────────────────────────────────────────────────────────────
  // TAX KNOWLEDGE BY STATE
  // ────────────────────────────────────────────────────────────
  {
    moduleKey: 'state_tax_security',
    scope: 'global',
    stateCode: null,
    title: 'Tax Knowledge for Security Companies — Federal & State',
    category: 'tax',
    source: 'IRS Publication 15; State Department of Revenue; Texas Tax Code; FICA/FUTA statutes',
    effectiveDate: '2025-01-01',
    expirationDate: '2025-12-31',
    content: `# Tax Knowledge for Security Companies

## Federal Payroll Taxes (All States)

| Tax | Employer Rate | Employee Rate | Wage Base |
|-----|--------------|---------------|-----------|
| Social Security | 6.2% | 6.2% | $168,600 (2025) |
| Medicare | 1.45% | 1.45% | No cap |
| Medicare Add'l | 0% | 0.9% | >$200K employee |
| FUTA | 6.0% (effectively 0.6% after state credit) | None | $7,000 |

## State Payroll Taxes

### Texas
- **State income tax:** NONE
- **SUTA (Unemployment):** 0.31%–6.31% on first $9,000/employee
  - New employer rate: 2.7% (year 1)
  - Rate set by experience after year 2
- **Workers Compensation:** NOT state-run; private insurance required
  - Armed security (NCCI Code 7380): $8–$15 per $100 payroll
  - Unarmed security (NCCI Code 7382): $3–$7 per $100 payroll
  - PPO / Executive protection (NCCI Code 7720): $12–$20 per $100 payroll
  - Experience modifier (EMR) adjusts final rate

### California
- **State income tax:** 1%–13.3% (progressive brackets)
- **SDI (State Disability Insurance):** 1.1% on first $153,164
- **SUTA:** 1.5%–6.2% on first $7,000
- **ETT (Employment Training Tax):** 0.1% on first $7,000

### Florida
- **State income tax:** NONE
- **SUTA:** 0.1%–5.4% on first $7,000 (varies by experience)

### New York
- **State income tax:** 4%–10.9%
- **NYC additional tax:** 3.078%–3.876% (if operating in NYC)
- **SDI:** 0.511% up to $0.14/day
- **PFL (Paid Family Leave):** 0.455%

### Illinois
- **State income tax:** 4.95% (flat)
- **SUTA:** 0.725%–7.625% on first $13,590

## Service Tax on Security Services

| State | Security Services Taxable? | Rate | Notes |
|-------|--------------------------|------|-------|
| Texas | **YES** | 6.25% + up to 2% local = max 8.25% | Texas Tax Code; government contracts may be exempt |
| California | No | N/A | Services vs tangible goods distinction |
| Florida | **YES** | 6% + up to 1.5% local | |
| New York | **YES** | 4% + up to 4.875% local | |
| Illinois | No | N/A | |
| Georgia | No | N/A | |
| Arizona | No | N/A | |

**IMPORTANT:** Always charge applicable sales tax on Texas invoices. Failure to collect is still YOUR liability.

## 1099 Contractor Rules
- Security companies frequently misclassify employees as 1099 contractors
- IRS test (20-factor + ABC test in CA): Control, investment, integration
- If officer follows your rules, uses your equipment, wears your uniform → W-2 employee
- IRS enforcement increasing in security industry; back-payroll taxes + penalties apply
- California AB5 applies strict "ABC test" — nearly impossible to use 1099 for security work in CA

## Trinity Use Cases
- Calculating payroll: Correct withholdings per state
- Generating invoices: Add service tax where required by state
- Estimating labor costs for proposals: Total burden rate
- P&L calculations: True cost per employee including all taxes + insurance
- Multi-state operations: Flag different rules per operating state
- Financial forecasting: Tax burden projections
- Pricing recommendations: Account for full tax burden`,
  },

  // ────────────────────────────────────────────────────────────
  // PRICING ECONOMICS
  // ────────────────────────────────────────────────────────────
  {
    moduleKey: 'security_pricing_economics',
    scope: 'global',
    stateCode: null,
    title: 'Security Industry Pricing Economics & Burden Rate',
    category: 'pricing',
    source: 'ASIS International; NASCO; Industry compensation surveys 2025-2026',
    effectiveDate: '2025-01-01',
    content: `# Security Industry Pricing Economics

## Industry Standard Billing Rates (2025-2026)

| Category | Bill Rate Range | Typical Pay Rate | Target Margin |
|----------|----------------|------------------|---------------|
| Unarmed Guard (standing) | $22–$35/hr | $14–$20/hr | 35–45% |
| Unarmed Guard (patrol) | $25–$40/hr | $15–$22/hr | 35–45% |
| Armed Guard (standing) | $30–$50/hr | $18–$28/hr | 35–45% |
| Armed Guard (patrol) | $35–$55/hr | $20–$30/hr | 35–45% |
| PPO / Executive Protection | $50–$150/hr | $28–$60/hr | 40–55% |
| Event Security (unarmed) | $28–$45/hr | $16–$24/hr | 35–50% |
| Event Security (armed) | $40–$65/hr | $22–$35/hr | 35–50% |
| Loss Prevention | $25–$38/hr | $15–$22/hr | 35–45% |
| Mobile Patrol | $35–$55/visit | $18–$25/hr | 40–50% |
| Alarm Response | $45–$85/response | $18–$25/hr | 50–65% |
| Fire Watch | $28–$45/hr | $15–$22/hr | 35–45% |

## True Cost Per Employee (Burden Rate) — Example at $20/hr base

| Cost Component | Rate | Per Hour |
|---------------|------|---------|
| Base hourly rate | — | $20.00 |
| Employer Social Security | 6.2% | $1.24 |
| Employer Medicare | 1.45% | $0.29 |
| FUTA | ~0.6% on first $7K | ~$0.04 |
| SUTA | ~2.7% on first $9K | ~$0.07 |
| Workers Comp (unarmed, TX avg) | ~$5/$100 payroll | $1.00 |
| General Liability Insurance | ~3% of payroll | $0.60 |
| Uniform/Equipment (amortized) | — | $0.25 |
| Admin overhead | ~8% | $1.60 |
| **TRUE COST PER HOUR** | | **$25.09** |

## Burden Rate Formula

\`\`\`
burdenRate = baseRate × (1 + ss_employer + medicare_employer + futa_rate + suta_rate + wc_rate + gl_rate + overhead_pct)
\`\`\`

## Bill Rate Formula (to hit target margin)

\`\`\`
billRate = burdenRate / (1 - targetMargin)

Example at 50% target margin:
billRate = $25.09 / (1 - 0.50) = $50.18/hr
\`\`\`

## Profit Margin Benchmarks

| Margin | Assessment |
|--------|-----------|
| < 15% | Critical — below sustainable floor |
| 15–25% | Low — vulnerable to any cost increase |
| 25–35% | Acceptable — industry average range |
| 35–45% | Healthy — best-in-class operations |
| > 45% | Excellent — premium service or specialty |

## Pricing Strategy Principles

### Rate Increase Letter Best Practices (Trinity-Guided)
1. Lead with value delivered (hours served, incidents handled, problems prevented)
2. Show market context (inflation, insurance rate increases, minimum wage changes)
3. Frame as partnership ("maintain service quality")
4. Present the number AFTER the value case is built
5. Offer flexibility (phased increase, longer contract lock-in)
6. Never apologize for the increase — frame as investment in quality

### When to Flag a Client for Rate Review
- Margin < 20% for 2+ consecutive months
- Insurance or workers comp rates increase mid-contract
- State minimum wage increase exceeds 3%
- Client scope expansion (more hours, armed requirement) without rate renegotiation
- Contract renewal approaching (90-day window is optimal)

### Market Rate Signals
- Below market: Risk of client assuming lower quality
- Above market: Risk of losing bid to competitor
- Sweet spot: 10–15% premium over market (justified by track record + service level)

## Trinity Use Cases
- Generating proposals: Use burden rate formula with org's actual costs
- Rate increase recommendations: When margin drops below 25%
- Client profitability analysis: Real margin vs perceived margin
- New contract pricing: Position correctly in market
- Annual rate review: CPI adjustment + insurance cost changes`,
  },

  // ────────────────────────────────────────────────────────────
  // LABOR LAW — FEDERAL & KEY STATES
  // ────────────────────────────────────────────────────────────
  {
    moduleKey: 'labor_law_security',
    scope: 'global',
    stateCode: null,
    title: 'Labor Law for Security Companies — Overtime, Breaks, Minimum Wage',
    category: 'labor_law',
    source: 'FLSA; Texas Labor Code; California Labor Code; OSHA',
    effectiveDate: '2025-01-01',
    content: `# Labor Law for Security Companies

## Federal (FLSA — Fair Labor Standards Act)

### Overtime
- Federal threshold: 40 hours per week
- Overtime rate: 1.5× regular rate
- No daily overtime requirement at federal level
- 7th consecutive day: No premium required federally

### Minimum Wage
- Federal minimum: $7.25/hr (as of 2025)
- State minimums often higher (always use whichever is greater)

### Tip Credit
- Security officers generally NOT tip-eligible; full minimum wage applies

### Exempt vs Non-Exempt
- Security officers: Almost universally NON-EXEMPT (hourly, overtime eligible)
- Exception: True supervisors/managers may qualify for executive exemption (test: job duties, salary $684+/week)

## State-Specific Rules

### Texas
- Minimum wage: $7.25/hr (follows federal)
- Overtime: Follows FLSA (40hr/week threshold)
- Breaks: No state requirement for meal/rest breaks (but FLSA regulates short breaks < 20 min as paid)
- Workers Comp: Not required by law (but recommended and required by most clients)

### California
- Minimum wage: $20/hr for fast food; $18/hr general (2025) — always check current rate
- **Daily overtime:** >8 hours in a day = 1.5×; >12 hours = 2×
- **Weekly overtime:** >40 hours = 1.5×; 7th consecutive day = 1.5× first 8hr, then 2×
- Meal breaks: 30-min unpaid break required if >5 hours worked; second break if >10 hours
- Rest breaks: 10-min paid break per 4 hours worked
- Split shift premium: If hours are split with unpaid gap > 1 hour

### Florida
- Minimum wage: $13/hr (2025, increasing annually to $15/hr)
- Overtime: Follows FLSA (40hr/week only)
- Breaks: No state requirement for adults

### New York
- Minimum wage: $16.50/hr in NYC/Long Island/Westchester (2025); $15.50 remainder of state
- Overtime: Follows FLSA (40hr/week)
- Spread of Hours: Extra 1-hour pay if workday spread > 10 hours

## Security-Specific Labor Issues

### On-Call & Stand-By Time
- If employee is restricted to employer premises or must remain available: PAID time
- If employee is free to engage in personal activities: potentially unpaid
- Security patrol officers: Time waiting for call = paid (restricted availability)

### Travel Time
- Travel between job sites during a shift: PAID
- Travel to first site at start of day: Generally unpaid (commute)
- If required to check in at office before site: Time at office onward = paid

### Uniform Policy
- If uniform is required AND employer controls its washing: Time changing at work = paid
- If uniform worn to/from work: Generally not paid

## Trinity Use Cases
- Payroll calculation: Apply correct OT rules per state
- Schedule creation: Flag when employee will hit OT threshold
- Break compliance alerts: Remind managers when breaks are required
- Employee classification review: Flag potential misclassification
- Proposal pricing: Include OT buffer in cost estimates`,
  },
];

// ============================================================================
// TRINITY KNOWLEDGE SERVICE CLASS
// ============================================================================

class TrinityKnowledgeService {
  private static instance: TrinityKnowledgeService;
  private seeded = false;

  static getInstance(): TrinityKnowledgeService {
    if (!TrinityKnowledgeService.instance) {
      TrinityKnowledgeService.instance = new TrinityKnowledgeService();
    }
    return TrinityKnowledgeService.instance;
  }

  /**
   * Seed static knowledge modules on startup (idempotent — uses ON CONFLICT DO NOTHING).
   */
  async seedStaticKnowledge(): Promise<void> {
    if (this.seeded) return;

    let seeded = 0;
    let skipped = 0;

    for (const mod of STATIC_MODULES) {
      try {
        // Converted to Drizzle ORM: ON CONFLICT → onConflictDoNothing
        await db.insert(trinityKnowledgeBase).values({
          scope: mod.scope,
          stateCode: mod.stateCode ?? null,
          moduleKey: mod.moduleKey,
          title: mod.title,
          category: mod.category,
          content: mod.content,
          source: (mod as any).source ?? null,
          effectiveDate: (mod as any).effectiveDate ?? null,
          expirationDate: (mod as any).expirationDate ?? null,
          isActive: true,
          createdAt: sql`now()`,
          updatedAt: sql`now()`,
        }).onConflictDoNothing({ target: trinityKnowledgeBase.moduleKey });
        seeded++;
      } catch (err: unknown) {
        if ((err instanceof Error ? err.message : String(err))?.includes('unique') || err.code === '23505') {
          skipped++;
        } else {
          // OBSERVABILITY (Phase 1 Domain 1): surface the full PostgreSQL
          // error context so the 6 modules that were silently failing at
          // boot become visible. Previously this swallowed message-only
          // which made it impossible to tell if the root cause was a
          // missing column, a NOT NULL violation, a foreign-key failure,
          // or something else entirely.
          log.error(
            `[TrinityKnowledge] Failed to seed module ${mod.moduleKey}`,
            {
              message: err instanceof Error ? err.message : String(err),
              code: err?.code,
              detail: err?.detail,
              column: err?.column,
              constraint: err?.constraint,
              table: err?.table,
              schema: err?.schema,
              where: err?.where,
              routine: err?.routine,
              stack: err?.stack?.split('\n').slice(0, 6).join(' | '),
            }
          );
        }
      }
    }

    this.seeded = true;
    log.info(`[TrinityKnowledge] Static knowledge seeded: ${seeded} inserted, ${skipped} already existed (${STATIC_MODULES.length} total modules)`);
  }

  /**
   * Query the static knowledge base. Returns relevant modules for a given query.
   * Used by Trinity's context building before generating a response.
   */
  async queryStaticKnowledge(opts: {
    query: string;
    category?: string;
    stateCode?: string;
    limit?: number;
  }): Promise<KnowledgeQueryResult[]> {
    const { query, category, stateCode, limit = 3 } = opts;
    const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);

    const rows = await db
      .select({
        moduleKey: trinityKnowledgeBase.moduleKey,
        title: trinityKnowledgeBase.title,
        category: trinityKnowledgeBase.category,
        content: trinityKnowledgeBase.content,
        scope: trinityKnowledgeBase.scope,
        stateCode: trinityKnowledgeBase.stateCode,
      })
      .from(trinityKnowledgeBase)
      .where(
        and(
          eq(trinityKnowledgeBase.isActive, true),
          ...(category ? [eq(trinityKnowledgeBase.category, category)] : []),
          ...(stateCode
            ? [or(isNull(trinityKnowledgeBase.stateCode), eq(trinityKnowledgeBase.stateCode, stateCode))]
            : [])
        )
      )
      .limit(20);

    // Simple relevance scoring: count keyword matches in title + content
    const scored = rows.map(row => {
      const combined = `${row.title} ${row.category} ${row.content}`.toLowerCase();
      const score = terms.reduce((acc, term) => {
        const count = (combined.match(new RegExp(term, 'g')) || []).length;
        return acc + count;
      }, 0);
      return { ...row, score };
    });

    return scored
      .filter(r => r.score > 0 || terms.length === 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ score: _score, ...r }) => r);
  }

  /**
   * Build a knowledge context string for injection into Trinity's system prompt.
   * Call this when building context for a user query.
   */
  async buildKnowledgeContext(query: string, workspaceId: string, stateCode?: string): Promise<string> {
    const [staticModules, orgKnowledge] = await Promise.all([
      this.queryStaticKnowledge({ query, stateCode, limit: 3 }),
      this.queryOrgKnowledge(workspaceId, query, 3),
    ]);

    if (staticModules.length === 0 && orgKnowledge.length === 0) return '';

    const parts: string[] = ['## Trinity Knowledge Context\n'];

    if (staticModules.length > 0) {
      parts.push('### Industry Knowledge');
      for (const mod of staticModules) {
        // Include first 800 chars of content to avoid context bloat
        const preview = mod.content.length > 800 ? mod.content.slice(0, 800) + '\n...[full module available]' : mod.content;
        parts.push(`**${mod.title}** (${mod.category})\n${preview}`);
      }
    }

    if (orgKnowledge.length > 0) {
      parts.push('\n### Org-Specific Knowledge');
      for (const entry of orgKnowledge) {
        parts.push(`**${entry.title}** (${entry.knowledge_type})\n${entry.summary}`);
      }
    }

    return parts.join('\n\n');
  }

  /**
   * Query org-specific knowledge for a workspace.
   */
  async queryOrgKnowledge(workspaceId: string, query?: string, limit = 5): Promise<any[]> {
    const rows = await db
      .select()
      .from(trinityKnowledgeBase)
      .where(
        and(
          eq(trinityKnowledgeBase.workspaceId, workspaceId),
          eq(trinityKnowledgeBase.scope, 'workspace'),
          eq(trinityKnowledgeBase.isActive, true)
        )
      )
      .orderBy(sql`created_at DESC`)
      .limit(query ? 20 : limit);

    if (!query || rows.length === 0) return rows.slice(0, limit);

    const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    return rows
      .map(row => {
        const combined = `${row.title} ${row.content} ${row.category}`.toLowerCase();
        const score = terms.reduce((acc, t) => acc + (combined.includes(t) ? 1 : 0), 0);
        return { ...row, _score: score };
      })
      .sort((a, b) => b._score - a._score)
      .slice(0, limit)
      .map(({ _score: _, ...r }) => r);
  }

  /**
   * Add a piece of learned knowledge for a specific org.
   */
  async addOrgKnowledge(opts: {
    workspaceId: string;
    knowledgeType: string;
    title: string;
    summary: string;
    knowledgeData: Record<string, unknown>;
    sourceDocumentId?: string;
    confidenceScore?: number;
    expiresAt?: Date;
  }): Promise<string> {
    const [row] = await db
      .insert(trinityKnowledgeBase)
      .values({
        workspaceId: opts.workspaceId,
        scope: 'workspace',
        category: opts.knowledgeType,
        title: opts.title,
        content: opts.summary,
        expirationDate: opts.expiresAt,
        isActive: true,
      })
      .returning({ id: trinityKnowledgeBase.id });
    return row.id;
  }

  /**
   * List all static knowledge modules (for admin UI).
   */
  async listStaticModules() {
    return db
      .select({
        id: trinityKnowledgeBase.id,
        moduleKey: trinityKnowledgeBase.moduleKey,
        title: trinityKnowledgeBase.title,
        category: trinityKnowledgeBase.category,
        scope: trinityKnowledgeBase.scope,
        stateCode: trinityKnowledgeBase.stateCode,
        version: trinityKnowledgeBase.version,
        isActive: trinityKnowledgeBase.isActive,
        lastVerifiedAt: trinityKnowledgeBase.lastVerifiedAt,
        createdAt: trinityKnowledgeBase.createdAt,
      })
      .from(trinityKnowledgeBase)
      .orderBy(trinityKnowledgeBase.category, trinityKnowledgeBase.title);
  }

  /**
   * Get full content of a specific knowledge module.
   */
  async getModuleContent(moduleKey: string) {
    const [row] = await db
      .select()
      .from(trinityKnowledgeBase)
      .where(eq(trinityKnowledgeBase.moduleKey, moduleKey))
      .limit(1);
    return row ?? null;
  }
}

export const trinityKnowledgeService = TrinityKnowledgeService.getInstance();
