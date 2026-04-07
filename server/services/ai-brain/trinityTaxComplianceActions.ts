import { helpaiOrchestrator, type ActionHandler, type ActionRequest, type ActionResult } from '../helpai/platformActionHub';
import {
  getTaxRules,
  getAvailableTaxYears,
  runTaxComplianceAudit,
  getSUTAInfo,
  TAX_REGISTRY_VERSION,
  TAX_REGISTRY_EFFECTIVE_YEAR,
  TAX_REGISTRY_LAST_VERIFIED,
  type TaxComplianceReport,
} from '../tax/taxRulesRegistry';
import { calculatePayrollTaxes } from '../billing/payrollTaxService';
import { createLogger } from '../../lib/logger';
import { PLATFORM } from '../../config/platformConfig';
const log = createLogger('trinityTaxComplianceActions');

function mkTaxAction(actionId: string, fn: (params: any) => Promise<any>): ActionHandler {
  return {
    actionId,
    name: actionId,
    category: 'compliance' as any,
    description: `Trinity tax compliance: ${actionId}`,
    inputSchema: { type: 'object' as const, properties: {} },
    handler: async (req: ActionRequest): Promise<ActionResult> => {
      try {
        const data = await fn(req.params || {});
        return { success: true, data };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Unknown error' };
      }
    }
  };
}

export function registerTaxComplianceActions() {

  helpaiOrchestrator.registerAction(mkTaxAction('tax.audit_compliance', async (_params) => {
    const report = runTaxComplianceAudit();
    const summary = buildAuditSummary(report);
    return {
      report,
      summary,
      actionRequired: report.isStale || report.recommendations.length > 0,
    };
  }));

  helpaiOrchestrator.registerAction(mkTaxAction('tax.get_registry_status', async (_params) => {
    const rules = getTaxRules();
    const availableYears = getAvailableTaxYears();
    return {
      version: TAX_REGISTRY_VERSION,
      effectiveYear: TAX_REGISTRY_EFFECTIVE_YEAR,
      lastVerified: TAX_REGISTRY_LAST_VERIFIED,
      availableYears,
      source: rules.source,
      ficaSummary: {
        ssRate: `${(rules.fica.ssRate * 100).toFixed(1)}%`,
        medicareRate: `${(rules.fica.medicareRate * 100).toFixed(2)}%`,
        ssWageBase: `$${rules.fica.ssWageBase.toLocaleString()}`,
        additionalMedicareRate: `${(rules.fica.additionalMedicareRate * 100).toFixed(1)}%`,
      },
      futaSummary: {
        netRate: `${(rules.futa.netRate * 100).toFixed(1)}%`,
        wageBase: `$${rules.futa.wageBase.toLocaleString()}`,
        creditReductionStates: rules.creditReductionStates,
      },
      statesCovered: Object.keys(rules.stateTaxRules).length,
      localitiesCovered: Object.keys(rules.localTaxRules).length,
      sutaStatesCovered: rules.sutaDefaults.length,
    };
  }));

  helpaiOrchestrator.registerAction(mkTaxAction('tax.get_state_details', async (params) => {
    const { stateCode } = params;
    if (!stateCode) return { error: 'stateCode required (e.g., CA, TX, NY)' };
    
    const code = stateCode.toUpperCase();
    const rules = getTaxRules();
    const stateRule = rules.stateTaxRules[code];
    
    if (!stateRule) return { error: `No tax rules found for state ${code}` };
    
    const sutaInfo = getSUTAInfo(code);
    const reciprocity = rules.reciprocalAgreements[code] || [];
    const localTaxes = Object.entries(rules.localTaxRules)
      .filter(([, rule]) => rule.state === code)
      .map(([key, rule]) => ({ code: key, name: rule.name, rate: `${(rule.rate * 100).toFixed(3)}%`, type: rule.type }));
    
    return {
      state: code,
      taxYear: rules.year,
      incomeTax: {
        type: stateRule.type,
        rate: stateRule.rate ? `${(stateRule.rate * 100).toFixed(2)}%` : undefined,
        brackets: stateRule.brackets?.map(b => ({
          upTo: b.limit === Infinity ? 'Infinity' : `$${b.limit.toLocaleString()}`,
          rate: `${(b.rate * 100).toFixed(2)}%`,
        })),
        notes: stateRule.notes,
      },
      unemployment: sutaInfo ? {
        newEmployerRate: `${(sutaInfo.newEmployerRate * 100).toFixed(2)}%`,
        wageBase: `$${sutaInfo.wageBase.toLocaleString()}`,
      } : null,
      reciprocalAgreements: reciprocity.length > 0 ? reciprocity : 'None',
      localTaxes: localTaxes.length > 0 ? localTaxes : 'None',
    };
  }));

  helpaiOrchestrator.registerAction(mkTaxAction('tax.calculate_sample_withholding', async (params) => {
    const {
      grossWage = 2500,
      state = 'TX',
      payPeriod = 'biweekly',
      filingStatus = 'single',
      allowances = 0,
    } = params;
    
    const result = calculatePayrollTaxes({
      grossWage,
      state,
      payPeriod,
      filingStatus,
      allowances,
    });
    
    return {
      input: { grossWage, state, payPeriod, filingStatus, allowances },
      result: {
        federalWithholding: result.federalWithholding,
        stateWithholding: result.stateWithholding,
        socialSecurity: result.socialSecurity,
        medicare: result.medicare,
        totalDeductions: result.totalDeductions,
        netWage: result.netWage,
        effectiveTaxRate: `${result.effectiveTaxRate}%`,
        taxRegistryVersion: result.taxRegistryVersion,
        taxYear: result.taxYear,
      },
    };
  }));

  helpaiOrchestrator.registerAction(mkTaxAction('tax.verify_annual_rates', async (_params) => {
    const rules = getTaxRules();
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    
    const verificationChecklist = [
      {
        item: 'Federal Income Tax Brackets (IRS Pub 15-T)',
        status: rules.year >= currentYear ? 'CURRENT' : 'STALE',
        value: `${Object.keys(rules.federalBrackets).length} filing statuses loaded`,
        source: 'IRS Publication 15-T',
        nextAction: rules.year < currentYear ? 'Update federal brackets to current year' : 'Verified',
      },
      {
        item: 'Social Security Wage Base (SSA)',
        status: rules.year >= currentYear ? 'CURRENT' : 'STALE',
        value: `$${rules.fica.ssWageBase.toLocaleString()}`,
        source: 'Social Security Administration',
        nextAction: rules.year < currentYear ? 'Check SSA announcement for new wage base' : 'Verified',
      },
      {
        item: 'Standard Deductions',
        status: rules.year >= currentYear ? 'CURRENT' : 'STALE',
        value: `Single: $${rules.standardDeductions.single.toLocaleString()}, MFJ: $${rules.standardDeductions.married_jointly.toLocaleString()}`,
        source: 'IRS Revenue Procedure',
        nextAction: rules.year < currentYear ? 'Update to new inflation-adjusted values' : 'Verified',
      },
      {
        item: 'State Income Tax Rates',
        status: Object.keys(rules.stateTaxRules).length >= 51 ? 'COMPLETE' : 'INCOMPLETE',
        value: `${Object.keys(rules.stateTaxRules).length} states/territories covered`,
        source: 'State Department of Revenue publications',
        nextAction: Object.keys(rules.stateTaxRules).length < 51 ? 'Add missing state rules' : 'Verified',
      },
      {
        item: 'FUTA Rate and Wage Base',
        status: 'CURRENT',
        value: `${(rules.futa.netRate * 100).toFixed(1)}% net on $${rules.futa.wageBase.toLocaleString()}`,
        source: 'IRS Form 940 Instructions',
        nextAction: 'Verify credit reduction states annually',
      },
      {
        item: 'SUTA New Employer Rates',
        status: rules.sutaDefaults.length >= 51 ? 'COMPLETE' : 'INCOMPLETE',
        value: `${rules.sutaDefaults.length} states covered`,
        source: 'State unemployment agency publications',
        nextAction: rules.sutaDefaults.length < 51 ? 'Add missing SUTA defaults' : 'Verify experience rates with employers',
      },
      {
        item: 'Reciprocal Tax Agreements',
        status: 'CURRENT',
        value: `${Object.keys(rules.reciprocalAgreements).length} states with agreements`,
        source: 'State DOR reciprocity lists',
        nextAction: 'Verify no new agreements or terminations',
      },
      {
        item: 'Local/City Tax Rates',
        status: Object.keys(rules.localTaxRules).length > 20 ? 'GOOD' : 'NEEDS_EXPANSION',
        value: `${Object.keys(rules.localTaxRules).length} localities covered`,
        source: 'City/county tax authority publications',
        nextAction: 'Expand coverage for security guard deployment cities',
      },
    ];
    
    const overallStatus = verificationChecklist.every(c => 
      c.status === 'CURRENT' || c.status === 'COMPLETE' || c.status === 'GOOD'
    ) ? 'ALL_VERIFIED' : 'ACTION_REQUIRED';
    
    const decemberWarning = currentMonth === 12 
      ? `December ${currentYear}: Begin preparing ${currentYear + 1} tax tables. IRS typically publishes Pub 15-T by mid-December.`
      : currentMonth === 1 
        ? `January ${currentYear}: Verify all ${currentYear} rates are loaded and active before first payroll run.`
        : null;

    return {
      registryVersion: TAX_REGISTRY_VERSION,
      effectiveYear: TAX_REGISTRY_EFFECTIVE_YEAR,
      lastVerified: TAX_REGISTRY_LAST_VERIFIED,
      currentDate: now.toISOString().split('T')[0],
      overallStatus,
      decemberWarning,
      checklist: verificationChecklist,
      w4GuidanceStatus: 'ACTIVE',
      w9GuidanceStatus: 'ACTIVE',
      w4Notes: 'W-4 guided completion collects: filing status, multiple jobs, dependents amount, other income, extra withholding. Data stored in employee_payroll_info.',
      w9Notes: 'W-9 path activated for 1099 contractors during onboarding. Collects tax classification and TIN.',
    };
  }));

  helpaiOrchestrator.registerAction(mkTaxAction('tax.get_w4_guidance', async (params) => {
    const { filingStatus = 'single', multipleJobs = false, dependentsAmount = 0, otherIncome = 0 } = params;
    
    const rules = getTaxRules();
    const standardDeduction = rules.standardDeductions[filingStatus as keyof typeof rules.standardDeductions] || rules.standardDeductions.single;
    
    return {
      formYear: rules.year,
      guidance: {
        step1: {
          title: 'Personal Information',
          instructions: 'Enter name, address, SSN. Select filing status.',
          filingStatusSelected: filingStatus,
        },
        step2: {
          title: 'Multiple Jobs or Spouse Works',
          applicable: multipleJobs,
          instructions: multipleJobs 
            ? 'Use the IRS Tax Withholding Estimator at www.irs.gov/W4App for most accurate withholding when multiple jobs apply.'
            : 'Skip this step if only one job and spouse does not work.',
        },
        step3: {
          title: 'Claim Dependents',
          amount: dependentsAmount,
          instructions: 'Multiply qualifying children under 17 by $2,000. Multiply other dependents by $500. Enter total.',
        },
        step4: {
          title: 'Other Adjustments',
          otherIncome,
          instructions: 'Enter other income not from jobs (interest, dividends, retirement). Enter deductions if exceeding standard deduction.',
          standardDeduction: `$${standardDeduction.toLocaleString()} (${filingStatus} for ${rules.year})`,
        },
        step5: {
          title: 'Sign and Date',
          instructions: 'Electronic signature captured during onboarding. Employee must sign under penalties of perjury.',
        },
      },
      platformDisclaimer: `${PLATFORM.name} provides guided W-4 completion as middleware only. Employees should consult a tax professional for complex situations. ${PLATFORM.name} is not a CPA, tax preparer, or financial advisor.`,
    };
  }));

  helpaiOrchestrator.registerAction(mkTaxAction('tax.get_w9_guidance', async (_params) => {
    const rules = getTaxRules();
    
    return {
      formYear: rules.year,
      applicableTo: '1099-NEC independent contractors',
      guidance: {
        line1: { title: 'Name', instructions: 'Enter legal name as shown on tax return.' },
        line2: { title: 'Business Name', instructions: 'Enter business name/DBA if different from Line 1. Optional for sole proprietors.' },
        line3: { 
          title: 'Federal Tax Classification',
          options: [
            'Individual/sole proprietor or single-member LLC',
            'C Corporation',
            'S Corporation',
            'Partnership',
            'Trust/estate',
            'LLC (with tax classification)',
          ],
          instructions: 'Select the classification that applies. Most security guard contractors are Individual/sole proprietor.',
        },
        line4: { title: 'Exemptions', instructions: 'Generally not applicable for individual contractors. Leave blank unless exempt.' },
        line5: { title: 'Address', instructions: 'Enter street address for 1099-NEC mailing.' },
        line6: { title: 'City, State, ZIP', instructions: 'Complete mailing address.' },
        partI: { 
          title: 'Taxpayer Identification Number (TIN)',
          instructions: 'Enter SSN or EIN. SSN for individuals, EIN for business entities. System collects last 4 digits for display, full number encrypted at rest.',
        },
        partII: {
          title: 'Certification',
          instructions: 'Electronic signature certifies: (1) TIN is correct, (2) Not subject to backup withholding, (3) US person, (4) FATCA codes are correct.',
        },
      },
      backupWithholdingRate: '24%',
      backupWithholdingNote: 'If contractor fails to provide TIN or IRS notifies of incorrect TIN, backup withholding at 24% must be applied.',
      filingDeadline: `1099-NEC must be filed with IRS and furnished to contractor by January 31, ${rules.year + 1}`,
      platformDisclaimer: `${PLATFORM.name} provides guided W-9 collection as middleware only. Organizations should consult a tax professional for complex contractor classifications.`,
    };
  }));

  helpaiOrchestrator.registerAction(mkTaxAction('tax.multi_state_summary', async (params) => {
    const { states } = params;
    const stateList = states || ['TX', 'CA', 'FL', 'NY'];
    const rules = getTaxRules();
    
    const summary = stateList.map((code: string) => {
      const sc = code.toUpperCase();
      const rule = rules.stateTaxRules[sc];
      const suta = getSUTAInfo(sc);
      const reciprocity = rules.reciprocalAgreements[sc] || [];
      const locals = Object.entries(rules.localTaxRules)
        .filter(([, r]) => r.state === sc)
        .map(([key, r]) => `${r.name} (${(r.rate * 100).toFixed(2)}%)`);
      
      return {
        state: sc,
        incomeTaxType: rule?.type || 'unknown',
        topRate: rule?.type === 'flat' ? `${((rule.rate || 0) * 100).toFixed(2)}%` 
          : rule?.type === 'progressive' ? `${((rule.brackets?.[rule.brackets.length - 1]?.rate || 0) * 100).toFixed(2)}%`
          : '0%',
        sutaNewEmployerRate: suta ? `${(suta.newEmployerRate * 100).toFixed(2)}%` : 'N/A',
        sutaWageBase: suta ? `$${suta.wageBase.toLocaleString()}` : 'N/A',
        reciprocalStates: reciprocity.length > 0 ? reciprocity : 'None',
        localTaxes: locals.length > 0 ? locals : 'None',
        notes: rule?.notes || '',
      };
    });
    
    return {
      taxYear: rules.year,
      registryVersion: TAX_REGISTRY_VERSION,
      states: summary,
    };
  }));

  log.info(`[TrinityTaxCompliance] Registered 8 tax compliance actions (registry v${TAX_REGISTRY_VERSION}, year ${TAX_REGISTRY_EFFECTIVE_YEAR})`);
}

function buildAuditSummary(report: TaxComplianceReport): string {
  const lines: string[] = [];
  lines.push(`Tax Compliance Audit - Registry v${report.registryVersion} (Year ${report.effectiveYear})`);
  lines.push(`Last Verified: ${report.lastVerified} | Current Date: ${report.currentDate}`);
  lines.push('');
  
  if (report.isStale) {
    lines.push(`WARNING: ${report.staleReason}`);
    lines.push('');
  }
  
  lines.push(`Federal: ${report.federalStatus.filingStatusCount} filing statuses, SS wage base $${report.federalStatus.ssWageBase.toLocaleString()}`);
  lines.push(`States: ${report.stateStatus.totalStates} total (${report.stateStatus.noTaxStates} no-tax, ${report.stateStatus.flatRateStates} flat, ${report.stateStatus.progressiveStates} progressive)`);
  lines.push(`Local: ${report.localStatus.totalLocalities} localities across ${report.localStatus.statesCovered.length} states`);
  lines.push(`FICA: SS ${(report.ficaStatus.ssRate * 100).toFixed(1)}% / Medicare ${(report.ficaStatus.medicareRate * 100).toFixed(2)}%`);
  lines.push(`FUTA: ${(report.futaStatus.netRate * 100).toFixed(1)}% net on $${report.futaStatus.wageBase.toLocaleString()}`);
  lines.push(`SUTA: ${report.sutaStatus.statesCovered} states covered`);
  lines.push(`Reciprocity: ${report.reciprocityStatus.statesWithAgreements} states, ${report.reciprocityStatus.totalAgreements} total agreements`);
  
  if (report.recommendations.length > 0) {
    lines.push('');
    lines.push('Recommendations:');
    report.recommendations.forEach(r => lines.push(`  - ${r}`));
  }
  
  return lines.join('\n');
}
