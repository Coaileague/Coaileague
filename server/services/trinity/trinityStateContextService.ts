/**
 * Trinity State Context Service
 * ==============================
 * The central "state awareness" hub for all Trinity operations.
 * Every action, pipeline, workflow, or orchestration that has state-specific
 * implications calls this service FIRST to get the correct regulatory,
 * tax, liability, and legal context for the operating state.
 *
 * Key responsibilities:
 * - Resolve workspace operating state from primaryOperatingState field
 * - Provide state-specific regulatory context for AI prompt injection
 * - Surface penal code guidance for field incidents
 * - Provide civil liability guidance for risk management
 * - Flag state-specific tax, payroll, and document requirements
 * - Identify which state IDs and licenses to scan
 */

import { db } from '../../db';
import { workspaces } from '@shared/schema';
import { eq } from 'drizzle-orm';
import {
  getStateConfig,
  getStateConfigStatic,
  StateRegulatoryConfig,
  PenalCodeScenario,
  CivilLiabilityGuidance,
} from '../compliance/stateRegulatoryKnowledgeBase';

export interface StateAwareContext {
  stateCode: string;
  stateName: string;
  regulatoryBody: string;
  portalUrl: string;
  licenseTypes: StateRegulatoryConfig['licenseTypes'];
  keyStatutes: StateRegulatoryConfig['keyStatutes'];
  hardBlockRules: StateRegulatoryConfig['hardBlockRules'];
  penalCodeScenarios: PenalCodeScenario[];
  civilLiabilityGuidance: CivilLiabilityGuidance[];
  licenseApplicationProcess?: string;
  topsPortalNotes?: string;
  taxContext: StateTaxContext;
  documentRequirements: StateDocumentRequirements;
  licenseExpiryCheckMonths: number;
  fallbackToManualVerification: boolean;
}

export interface StateTaxContext {
  stateCode: string;
  hasStateincomeTax: boolean;
  hasStateSalesTax: boolean;
  standardW4Required: boolean;
  stateW4Required: boolean;
  stateW4FormName?: string;
  i9Required: boolean;
  employeeWithholdingNotes: string;
  contractorTaxNotes: string;
  payrollTaxNotes: string;
  invoiceSalesTaxNotes: string;
}

export interface StateDocumentRequirements {
  w4Required: boolean;
  w9Required: boolean;
  i9Required: boolean;
  stateSpecificForms: { formName: string; purpose: string; who: 'employee' | 'contractor' | 'both' }[];
  idAcceptedTypes: string[];
  licenseExpiryTrackingRequired: boolean;
  backgroundCheckRequired: boolean;
  fingerprintRequired: boolean;
}

// ── State-level tax awareness (supplements payrollAutomation.ts brackets) ──
const STATE_TAX_CONTEXT: Record<string, StateTaxContext> = {
  TX: {
    stateCode: 'TX',
    hasStateincomeTax: false,
    hasStateSalesTax: true,
    standardW4Required: true,
    stateW4Required: false,
    i9Required: true,
    employeeWithholdingNotes: 'Texas has NO state income tax. Only federal withholding applies for employees. Federal W-4 is sufficient.',
    contractorTaxNotes: 'Contractors receive 1099-NEC. No state income tax withholding. Federal 1099 threshold: $600/year. Texas has no additional contractor state tax.',
    payrollTaxNotes: 'Texas has no state income tax. Employers pay FUTA (0.6% net after FUTA credit) and SUTA (Texas TWC — 2.7% for new employers). No SDI. Workers Comp highly recommended (not required by state for most employers).',
    invoiceSalesTaxNotes: 'Texas state sales tax: 6.25%. Local jurisdictions add up to 2% more (max 8.25% combined). Security services are generally NOT subject to Texas sales tax per Tax Code § 151.0035, but some ancillary services may be. Verify per engagement.',
  },
  CA: {
    stateCode: 'CA',
    hasStateincomeTax: true,
    hasStateSalesTax: true,
    standardW4Required: true,
    stateW4Required: true,
    stateW4FormName: 'Form DE 4 (California Employee Withholding Allowance Certificate)',
    i9Required: true,
    employeeWithholdingNotes: 'California requires BOTH federal W-4 AND California Form DE 4. SDI (State Disability Insurance) withheld from employee wages at EDD-set rate. California income tax up to 13.3%.',
    contractorTaxNotes: 'Contractors with 1099 income must pay California estimated taxes quarterly. Backup withholding of 7% may apply for California payments to contractors if no California ID provided.',
    payrollTaxNotes: 'California payroll taxes: PIT (withholding), SDI (employee-paid), UI (employer-paid), ETT (employer training tax). Very complex — use EDD e-Services for Business portal.',
    invoiceSalesTaxNotes: 'California state sales tax: 7.25% base. Security services are generally exempt from California sales tax. Verify with CDTFA for specific service types.',
  },
  FL: {
    stateCode: 'FL',
    hasStateincomeTax: false,
    hasStateSalesTax: true,
    standardW4Required: true,
    stateW4Required: false,
    i9Required: true,
    employeeWithholdingNotes: 'Florida has NO state income tax. Only federal withholding applies. Federal W-4 is sufficient.',
    contractorTaxNotes: 'No Florida state income tax for contractors. 1099-NEC for federal. Reemployment tax (FUTA equivalent at state level) applies to employers.',
    payrollTaxNotes: 'Florida has no state income tax. Employers pay Florida Reemployment Tax (state unemployment — 2.7% new employer rate) through CONNECT portal.',
    invoiceSalesTaxNotes: 'Florida state sales tax: 6%. Security services: many security-related services are NOT subject to Florida sales tax. Verify with FDOR for specific security service types.',
  },
  NY: {
    stateCode: 'NY',
    hasStateincomeTax: true,
    hasStateSalesTax: true,
    standardW4Required: true,
    stateW4Required: true,
    stateW4FormName: 'Form IT-2104 (Employee Withholding Allowance Certificate)',
    i9Required: true,
    employeeWithholdingNotes: 'New York requires Form IT-2104 for state withholding in addition to federal W-4. NYC employees may also need IT-2104 or NYC withholding forms. NY income tax up to 10.9% for high earners.',
    contractorTaxNotes: 'NY contractors must pay estimated state taxes quarterly. 1099-NEC required at $600 threshold.',
    payrollTaxNotes: 'New York payroll: withholding PIT, unemployment (NY DOL), disability insurance (mandatory DBL), paid family leave (NY PFL). Very comprehensive — use NYSBOE/DOL portals.',
    invoiceSalesTaxNotes: 'New York state sales tax: 4%. Local adds 4.5% (NYC) or varying county rates. Security services: generally exempt from NY sales tax. Verify with NYSDTF.',
  },
  IL: {
    stateCode: 'IL',
    hasStateincomeTax: true,
    hasStateSalesTax: true,
    standardW4Required: true,
    stateW4Required: false,
    i9Required: true,
    employeeWithholdingNotes: 'Illinois uses the federal W-4 for state withholding allowances. Flat state income tax of 4.95% applies to all employees.',
    contractorTaxNotes: 'Illinois contractors: 1099-NEC federal. Illinois flat 4.95% income tax on pass-through income. Estimated quarterly payments required.',
    payrollTaxNotes: 'Illinois payroll: state income tax withholding (4.95% flat), unemployment (IDES — 3.175% new employer), no SDI.',
    invoiceSalesTaxNotes: 'Illinois state sales tax: 6.25%. Security services: generally not taxable in Illinois. Verify with IDOR.',
  },
  WA: {
    stateCode: 'WA',
    hasStateincomeTax: false,
    hasStateSalesTax: true,
    standardW4Required: true,
    stateW4Required: false,
    i9Required: true,
    employeeWithholdingNotes: 'Washington has NO state income tax. Federal W-4 only. Washington Cares Fund (0.58% of wages) withheld for long-term care insurance.',
    contractorTaxNotes: 'No Washington state income tax for contractors. B&O (Business & Occupation) tax may apply to security company at 1.5% of gross revenue.',
    payrollTaxNotes: 'Washington: no state income tax. Paid Family and Medical Leave (PFML) premium split employer/employee. L&I (workers comp) mandatory and significant in WA.',
    invoiceSalesTaxNotes: 'Washington state sales tax: 6.5% plus local. Security services: generally subject to B&O tax on service provider, not typically sales taxed to client.',
  },
  DEFAULT: {
    stateCode: 'DEFAULT',
    hasStateincomeTax: true,
    hasStateSalesTax: true,
    standardW4Required: true,
    stateW4Required: false,
    i9Required: true,
    employeeWithholdingNotes: 'Federal W-4 required. Check state-specific withholding requirements with your state\'s department of revenue.',
    contractorTaxNotes: 'Federal 1099-NEC for payments over $600. Check state-specific contractor tax requirements.',
    payrollTaxNotes: 'Federal payroll taxes always apply. Check state unemployment, disability insurance, and other state-specific payroll tax requirements.',
    invoiceSalesTaxNotes: 'Check state-specific sales tax rates and applicability to security services.',
  },
};

// ── State document requirements ──
const STATE_DOCUMENT_REQUIREMENTS: Record<string, StateDocumentRequirements> = {
  TX: {
    w4Required: true,
    w9Required: true,
    i9Required: true,
    stateSpecificForms: [
      { formName: 'Texas DPS Background Authorization', purpose: 'Required for TOPS license application — authorizes DPS background check', who: 'employee' },
      { formName: 'TOPS Training Certificate Upload', purpose: 'Pre-assignment and annual training certificate must be uploaded to TOPS portal', who: 'employee' },
      { formName: 'Firearms Qualification Certificate', purpose: 'Required for Level III — annual DPS qualification course completion', who: 'employee' },
    ],
    idAcceptedTypes: ['Texas Driver License', 'Texas ID Card', 'US Passport', 'Passport Card', 'Permanent Resident Card (Green Card)', 'Employment Authorization Document'],
    licenseExpiryTrackingRequired: true,
    backgroundCheckRequired: true,
    fingerprintRequired: true,
  },
  CA: {
    w4Required: true,
    w9Required: true,
    i9Required: true,
    stateSpecificForms: [
      { formName: 'California Form DE 4', purpose: 'California Employee Withholding Allowance Certificate — state income tax withholding', who: 'employee' },
      { formName: 'BSIS Guard Card Application', purpose: 'California Guard Card application through BSIS portal', who: 'employee' },
    ],
    idAcceptedTypes: ['California Driver License', 'California ID Card', 'US Passport', 'Passport Card', 'Permanent Resident Card'],
    licenseExpiryTrackingRequired: true,
    backgroundCheckRequired: true,
    fingerprintRequired: true,
  },
  NY: {
    w4Required: true,
    w9Required: true,
    i9Required: true,
    stateSpecificForms: [
      { formName: 'New York Form IT-2104', purpose: 'Employee Withholding Allowance Certificate for New York state income tax', who: 'employee' },
      { formName: 'DCJS Security Guard Registration', purpose: 'New York DCJS security guard registration form', who: 'employee' },
    ],
    idAcceptedTypes: ['New York Driver License', 'New York ID Card', 'US Passport', 'Permanent Resident Card'],
    licenseExpiryTrackingRequired: true,
    backgroundCheckRequired: true,
    fingerprintRequired: false,
  },
  DEFAULT: {
    w4Required: true,
    w9Required: true,
    i9Required: true,
    stateSpecificForms: [],
    idAcceptedTypes: ['State Driver License', 'State ID Card', 'US Passport', 'Passport Card', 'Permanent Resident Card', 'Employment Authorization Document'],
    licenseExpiryTrackingRequired: true,
    backgroundCheckRequired: true,
    fingerprintRequired: false,
  },
};

class TrinityStateContextService {
  private cache = new Map<string, { context: StateAwareContext; fetchedAt: number }>();
  private readonly CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

  async getWorkspaceOperatingState(workspaceId: string): Promise<string> {
    const [ws] = await db.select({ primaryOperatingState: workspaces.primaryOperatingState })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    return ws?.primaryOperatingState || 'TX'; // Default to Texas (primary launch state)
  }

  async getStateAwareContext(workspaceId: string): Promise<StateAwareContext> {
    const cacheKey = workspaceId;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < this.CACHE_TTL_MS) {
      return cached.context;
    }

    const stateCode = await this.getWorkspaceOperatingState(workspaceId);
    const context = await this.buildContextForState(stateCode);

    this.cache.set(cacheKey, { context, fetchedAt: Date.now() });
    return context;
  }

  async buildContextForState(stateCode: string): Promise<StateAwareContext> {
    const config = await getStateConfig(stateCode) || getStateConfigStatic('TX')!;
    const taxCtx = STATE_TAX_CONTEXT[stateCode] || { ...STATE_TAX_CONTEXT.DEFAULT!, stateCode };
    const docReqs = STATE_DOCUMENT_REQUIREMENTS[stateCode] || { ...STATE_DOCUMENT_REQUIREMENTS.DEFAULT! };

    return {
      stateCode: config.stateCode,
      stateName: config.stateName,
      regulatoryBody: config.regulatoryBody,
      portalUrl: config.portalUrl,
      licenseTypes: config.licenseTypes,
      keyStatutes: config.keyStatutes,
      hardBlockRules: config.hardBlockRules,
      penalCodeScenarios: config.penalCodeScenarios,
      civilLiabilityGuidance: config.civilLiabilityGuidance,
      licenseApplicationProcess: config.licenseApplicationProcess,
      topsPortalNotes: config.topsPortalNotes,
      taxContext: taxCtx,
      documentRequirements: docReqs,
      licenseExpiryCheckMonths: config.licenseRenewalPeriodMonths,
      fallbackToManualVerification: config.fallbackToManualVerification,
    };
  }

  getPenalCodeGuidance(stateCode: string, scenario: string): PenalCodeScenario | null {
    const config = getStateConfigStatic(stateCode);
    if (!config) return null;

    const scenarioLower = scenario.toLowerCase();
    return config.penalCodeScenarios.find(s =>
      s.scenario.toLowerCase().includes(scenarioLower) ||
      scenarioLower.includes(s.scenario.toLowerCase().split('—')[0].trim().toLowerCase())
    ) || config.penalCodeScenarios[0] || null;
  }

  getCivilLiabilityGuidance(stateCode: string, scenario: string): CivilLiabilityGuidance | null {
    const config = getStateConfigStatic(stateCode);
    if (!config) return null;

    const scenarioLower = scenario.toLowerCase();
    return config.civilLiabilityGuidance.find(g =>
      g.scenario.toLowerCase().includes(scenarioLower) ||
      scenarioLower.includes(g.scenario.toLowerCase().split('—')[0].trim().toLowerCase())
    ) || config.civilLiabilityGuidance.find(g => g.riskLevel === 'critical') || null;
  }

  async buildStatePromptInjection(workspaceId: string): Promise<string> {
    const ctx = await this.getStateAwareContext(workspaceId);

    const licenseList = ctx.licenseTypes
      .map(l => `  • ${l.code}: ${l.name}${l.armedAllowed ? ' [ARMED AUTHORIZED]' : ' [UNARMED ONLY]'}${l.trainingHoursRequired ? ` — ${l.trainingHoursRequired}hr training req.` : ''}`)
      .join('\n');

    const hardBlocks = ctx.hardBlockRules
      .map(r => `  ⛔ ${r.rule.toUpperCase()}: ${r.description} [${r.citation}]`)
      .join('\n');

    const penalHighlights = ctx.penalCodeScenarios.slice(0, 3)
      .map(s => `  • ${s.scenario} [${s.citation}]: ${s.approvedLanguage}`)
      .join('\n');

    const liabilityHighlights = ctx.civilLiabilityGuidance
      .filter(g => g.riskLevel === 'critical')
      .slice(0, 2)
      .map(g => `  ⚠ ${g.scenario}: ${g.prohibitedLanguage}`)
      .join('\n');

    return `
═══ STATE REGULATORY CONTEXT: ${ctx.stateName.toUpperCase()} (${ctx.stateCode}) ═══
Regulatory Body: ${ctx.regulatoryBody}
Portal: ${ctx.portalUrl}
${ctx.topsPortalNotes ? `\nTOPS Portal: ${ctx.topsPortalNotes}` : ''}

LICENSE TYPES RECOGNIZED IN ${ctx.stateCode}:
${licenseList}

HARD BLOCK RULES (any violation = immediate officer removal from post):
${hardBlocks}

TAX CONTEXT FOR ${ctx.stateCode}:
• State Income Tax: ${ctx.taxContext.hasStateincomeTax ? 'YES' : 'NO — Federal Only'}
• State W-4: ${ctx.taxContext.stateW4Required ? `YES — ${ctx.taxContext.stateW4FormName}` : 'No state W-4 required (use federal W-4)'}
• Employee Notes: ${ctx.taxContext.employeeWithholdingNotes}
• Contractor Notes: ${ctx.taxContext.contractorTaxNotes}
• Sales Tax Notes: ${ctx.taxContext.invoiceSalesTaxNotes}

CRITICAL PENAL CODE GUIDANCE FOR ${ctx.stateCode} SECURITY OFFICERS:
${penalHighlights || '  • Consult state-specific penal code for jurisdiction. Always call law enforcement for criminal matters.'}

CIVIL LIABILITY — PROHIBITED LANGUAGE (never say these):
${liabilityHighlights || '  • Never guarantee personal safety. Never promise crime prevention outcomes.'}

CORE OFFICER LANGUAGE RULE: Officers OBSERVE, DETER by presence, REPORT, and RESPOND according to post orders. They do NOT guarantee safety or assume duty beyond their defined scope.
${ctx.fallbackToManualVerification ? '\n⚠ MANUAL VERIFICATION REQUIRED: This state requires manual license verification. Do not rely solely on automated checks.' : ''}
═══════════════════════════════════════════════════════════
`.trim();
  }

  async getStateTaxSummaryForInvoice(workspaceId: string, clientStateCode?: string): Promise<{
    stateCode: string;
    salesTaxApplicable: boolean;
    salesTaxRate: number;
    salesTaxNotes: string;
    invoiceLineItemLabel: string;
  }> {
    const effectiveState = clientStateCode || await this.getWorkspaceOperatingState(workspaceId);
    const taxCtx = STATE_TAX_CONTEXT[effectiveState] || STATE_TAX_CONTEXT.DEFAULT!;

    const SECURITY_SERVICE_EXEMPT_STATES = ['TX', 'CA', 'FL', 'NY', 'IL', 'WA', 'OR'];
    const salesTaxApplicable = taxCtx.hasStateSalesTax && !SECURITY_SERVICE_EXEMPT_STATES.includes(effectiveState);

    const TAX_RATES: Record<string, number> = {
      TX: 0.0825, CA: 0.0725, FL: 0.06, NY: 0.08, IL: 0.0625,
      WA: 0.065, OR: 0.0, NV: 0.0685, CO: 0.029, NC: 0.0475,
      VA: 0.053, GA: 0.04, AZ: 0.056, MI: 0.06, OH: 0.0575,
      PA: 0.06, TN: 0.07, MO: 0.04225, MA: 0.0625, MD: 0.06,
      NJ: 0.06625, DEFAULT: 0.05,
    };

    const rate = TAX_RATES[effectiveState] || TAX_RATES.DEFAULT!;

    return {
      stateCode: effectiveState,
      salesTaxApplicable,
      salesTaxRate: salesTaxApplicable ? rate : 0,
      salesTaxNotes: taxCtx.invoiceSalesTaxNotes,
      invoiceLineItemLabel: salesTaxApplicable ? `${effectiveState} Sales Tax (${(rate * 100).toFixed(2)}%)` : 'Sales Tax N/A — Security services exempt',
    };
  }

  getDocumentRequirements(stateCode: string): StateDocumentRequirements {
    return STATE_DOCUMENT_REQUIREMENTS[stateCode] || { ...STATE_DOCUMENT_REQUIREMENTS.DEFAULT! };
  }

  invalidateCacheForWorkspace(workspaceId: string): void {
    this.cache.delete(workspaceId);
  }

  getAllSupportedStateCodes(): string[] {
    return (STATE_REGULATORY_KNOWLEDGE as StateRegulatoryConfig[]).map(s => s.stateCode);
  }
}

export const trinityStateContext = new TrinityStateContextService();
