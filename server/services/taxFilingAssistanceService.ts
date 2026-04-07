import { db } from '../db';
import {
  employees,
  workspaces,
  employeeTaxForms,
} from '@shared/schema';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { typedQuery } from '../lib/typedSql';

export interface StateFilingPortal {
  state: string;
  stateName: string;
  portalUrl: string;
  portalName: string;
  filingMethod: 'electronic' | 'paper' | 'both';
  notes?: string;
}

export interface FilingDeadline {
  formType: '941' | '940' | 'w2' | '1099';
  description: string;
  deadline: string;
  quarter?: number;
  year: number;
  status: 'upcoming' | 'due_soon' | 'overdue' | 'completed';
  daysUntilDue: number;
  filingInstructions: string;
  irsPortalUrl: string;
}

export interface FilingGuide {
  formType: string;
  formTitle: string;
  description: string;
  steps: string[];
  irsPortalUrl: string;
  statePortals: StateFilingPortal[];
  estimatedTime: string;
  requiredDocuments: string[];
  penalty: string;
}

const IRS_EFILE_PORTALS = {
  '941': {
    url: 'https://www.irs.gov/e-file-providers/e-file-for-business-and-self-employed-taxpayers',
    title: 'IRS e-file for Employment Tax Returns',
    alternateUrl: 'https://www.irs.gov/filing/e-file-options',
  },
  '940': {
    url: 'https://www.irs.gov/e-file-providers/e-file-for-business-and-self-employed-taxpayers',
    title: 'IRS e-file for FUTA Returns',
    alternateUrl: 'https://www.irs.gov/filing/e-file-options',
  },
  'w2': {
    url: 'https://www.ssa.gov/employer/bso/bsowelcome.htm',
    title: 'Social Security Administration Business Services Online (BSO)',
    alternateUrl: 'https://www.ssa.gov/employer/',
  },
  '1099': {
    url: 'https://www.irs.gov/filing/e-file-forms-1099-with-iris',
    title: 'IRS Information Returns Intake System (IRIS)',
    alternateUrl: 'https://www.irs.gov/filing/e-file-forms-1099',
  },
};

const STATE_FILING_PORTALS: StateFilingPortal[] = [
  { state: 'AL', stateName: 'Alabama', portalUrl: 'https://myalabamataxes.alabama.gov/', portalName: 'My Alabama Taxes', filingMethod: 'electronic' },
  { state: 'AK', stateName: 'Alaska', portalUrl: 'https://www.labor.alaska.gov/employer/', portalName: 'Alaska Employer Services', filingMethod: 'both', notes: 'No state income tax' },
  { state: 'AZ', stateName: 'Arizona', portalUrl: 'https://azdor.gov/e-services', portalName: 'AZTaxes.gov', filingMethod: 'electronic' },
  { state: 'AR', stateName: 'Arkansas', portalUrl: 'https://www.dfa.arkansas.gov/income-tax', portalName: 'Arkansas Taxpayer Access Point', filingMethod: 'electronic' },
  { state: 'CA', stateName: 'California', portalUrl: 'https://edd.ca.gov/en/payroll_taxes/', portalName: 'CA EDD e-Services', filingMethod: 'electronic', notes: 'Quarterly DE 9/DE 9C required' },
  { state: 'CO', stateName: 'Colorado', portalUrl: 'https://tax.colorado.gov/', portalName: 'Colorado Revenue Online', filingMethod: 'electronic' },
  { state: 'CT', stateName: 'Connecticut', portalUrl: 'https://portal.ct.gov/DRS', portalName: 'CT DRS myconneCT', filingMethod: 'electronic' },
  { state: 'DE', stateName: 'Delaware', portalUrl: 'https://revenue.delaware.gov/', portalName: 'Delaware Division of Revenue', filingMethod: 'both' },
  { state: 'FL', stateName: 'Florida', portalUrl: 'https://floridarevenue.com/', portalName: 'Florida Revenue', filingMethod: 'electronic', notes: 'No state income tax — reemployment tax only' },
  { state: 'GA', stateName: 'Georgia', portalUrl: 'https://gtc.dor.ga.gov/', portalName: 'Georgia Tax Center', filingMethod: 'electronic' },
  { state: 'HI', stateName: 'Hawaii', portalUrl: 'https://hitax.hawaii.gov/', portalName: 'Hawaii Tax Online', filingMethod: 'electronic' },
  { state: 'ID', stateName: 'Idaho', portalUrl: 'https://tax.idaho.gov/', portalName: 'Idaho Tax Commission', filingMethod: 'electronic' },
  { state: 'IL', stateName: 'Illinois', portalUrl: 'https://mytax.illinois.gov/', portalName: 'MyTax Illinois', filingMethod: 'electronic' },
  { state: 'IN', stateName: 'Indiana', portalUrl: 'https://intime.dor.in.gov/', portalName: 'Indiana INTIME', filingMethod: 'electronic' },
  { state: 'IA', stateName: 'Iowa', portalUrl: 'https://tax.iowa.gov/', portalName: 'Iowa eFile & Pay', filingMethod: 'electronic' },
  { state: 'KS', stateName: 'Kansas', portalUrl: 'https://www.ksrevenue.gov/', portalName: 'Kansas WebTax', filingMethod: 'electronic' },
  { state: 'KY', stateName: 'Kentucky', portalUrl: 'https://revenue.ky.gov/', portalName: 'Kentucky eFile', filingMethod: 'electronic' },
  { state: 'LA', stateName: 'Louisiana', portalUrl: 'https://latap.revenue.louisiana.gov/', portalName: 'Louisiana File Online', filingMethod: 'electronic' },
  { state: 'ME', stateName: 'Maine', portalUrl: 'https://portal.maine.gov/tax/', portalName: 'Maine Revenue Services', filingMethod: 'electronic' },
  { state: 'MD', stateName: 'Maryland', portalUrl: 'https://interactive.marylandtaxes.gov/', portalName: 'Maryland bFile', filingMethod: 'electronic' },
  { state: 'MA', stateName: 'Massachusetts', portalUrl: 'https://mtc.dor.state.ma.us/', portalName: 'MassTaxConnect', filingMethod: 'electronic' },
  { state: 'MI', stateName: 'Michigan', portalUrl: 'https://mto.treasury.michigan.gov/', portalName: 'Michigan Treasury Online', filingMethod: 'electronic' },
  { state: 'MN', stateName: 'Minnesota', portalUrl: 'https://www.revenue.state.mn.us/', portalName: 'Minnesota e-Services', filingMethod: 'electronic' },
  { state: 'MS', stateName: 'Mississippi', portalUrl: 'https://tap.dor.ms.gov/', portalName: 'Mississippi TAP', filingMethod: 'electronic' },
  { state: 'MO', stateName: 'Missouri', portalUrl: 'https://mytax.mo.gov/', portalName: 'Missouri MyTax', filingMethod: 'electronic' },
  { state: 'MT', stateName: 'Montana', portalUrl: 'https://tap.dor.mt.gov/', portalName: 'Montana TransAction Portal', filingMethod: 'electronic' },
  { state: 'NE', stateName: 'Nebraska', portalUrl: 'https://revenue.nebraska.gov/', portalName: 'Nebraska e-Pay', filingMethod: 'electronic' },
  { state: 'NV', stateName: 'Nevada', portalUrl: 'https://ui.nv.gov/', portalName: 'Nevada DETR', filingMethod: 'electronic', notes: 'No state income tax' },
  { state: 'NH', stateName: 'New Hampshire', portalUrl: 'https://www.revenue.nh.gov/', portalName: 'NH DRA', filingMethod: 'both', notes: 'No state income tax on wages' },
  { state: 'NJ', stateName: 'New Jersey', portalUrl: 'https://www.njportal.com/DOR/BusinessRegistration', portalName: 'NJ Online Filing', filingMethod: 'electronic' },
  { state: 'NM', stateName: 'New Mexico', portalUrl: 'https://tap.tax.newmexico.gov/', portalName: 'New Mexico TAP', filingMethod: 'electronic' },
  { state: 'NY', stateName: 'New York', portalUrl: 'https://www.tax.ny.gov/', portalName: 'NY Online Services', filingMethod: 'electronic', notes: 'Quarterly NYS-45 required' },
  { state: 'NC', stateName: 'North Carolina', portalUrl: 'https://eservices.dor.nc.gov/', portalName: 'NC eBusiness Center', filingMethod: 'electronic' },
  { state: 'ND', stateName: 'North Dakota', portalUrl: 'https://apps.nd.gov/tax/', portalName: 'ND Tax Portal', filingMethod: 'electronic' },
  { state: 'OH', stateName: 'Ohio', portalUrl: 'https://oh-gateway.com/', portalName: 'Ohio Gateway', filingMethod: 'electronic' },
  { state: 'OK', stateName: 'Oklahoma', portalUrl: 'https://oktap.tax.ok.gov/', portalName: 'Oklahoma TAP', filingMethod: 'electronic' },
  { state: 'OR', stateName: 'Oregon', portalUrl: 'https://revenueonline.dor.oregon.gov/', portalName: 'Oregon Revenue Online', filingMethod: 'electronic' },
  { state: 'PA', stateName: 'Pennsylvania', portalUrl: 'https://mypath.pa.gov/', portalName: 'PA myPATH', filingMethod: 'electronic' },
  { state: 'RI', stateName: 'Rhode Island', portalUrl: 'https://www.ri.gov/taxation/', portalName: 'RI Division of Taxation', filingMethod: 'electronic' },
  { state: 'SC', stateName: 'South Carolina', portalUrl: 'https://mydorway.dor.sc.gov/', portalName: 'SC MyDORWAY', filingMethod: 'electronic' },
  { state: 'SD', stateName: 'South Dakota', portalUrl: 'https://dor.sd.gov/', portalName: 'SD DOR', filingMethod: 'both', notes: 'No state income tax' },
  { state: 'TN', stateName: 'Tennessee', portalUrl: 'https://tntap.tn.gov/', portalName: 'Tennessee TNTAP', filingMethod: 'electronic', notes: 'No state income tax on wages' },
  { state: 'TX', stateName: 'Texas', portalUrl: 'https://comptroller.texas.gov/', portalName: 'Texas Comptroller', filingMethod: 'electronic', notes: 'No state income tax — franchise tax only' },
  { state: 'UT', stateName: 'Utah', portalUrl: 'https://tap.tax.utah.gov/', portalName: 'Utah TAP', filingMethod: 'electronic' },
  { state: 'VT', stateName: 'Vermont', portalUrl: 'https://myvtax.vermont.gov/', portalName: 'myVTax', filingMethod: 'electronic' },
  { state: 'VA', stateName: 'Virginia', portalUrl: 'https://www.tax.virginia.gov/', portalName: 'Virginia iFile', filingMethod: 'electronic' },
  { state: 'WA', stateName: 'Washington', portalUrl: 'https://dor.wa.gov/', portalName: 'Washington MyDOR', filingMethod: 'electronic', notes: 'No state income tax' },
  { state: 'WV', stateName: 'West Virginia', portalUrl: 'https://tax.wv.gov/', portalName: 'WV MyTaxes', filingMethod: 'electronic' },
  { state: 'WI', stateName: 'Wisconsin', portalUrl: 'https://www.revenue.wi.gov/', portalName: 'Wisconsin My Tax Account', filingMethod: 'electronic' },
  { state: 'WY', stateName: 'Wyoming', portalUrl: 'https://excise.wyo.gov/', portalName: 'Wyoming DWS', filingMethod: 'both', notes: 'No state income tax' },
  { state: 'DC', stateName: 'District of Columbia', portalUrl: 'https://mytax.dc.gov/', portalName: 'DC MyTax', filingMethod: 'electronic' },
];

export class TaxFilingAssistanceService {
  getFilingDeadlines(year: number): FilingDeadline[] {
    const now = new Date();
    const deadlines: FilingDeadline[] = [];

    const q941Deadlines = [
      { quarter: 1, deadline: `${year}-04-30`, months: 'Jan-Mar' },
      { quarter: 2, deadline: `${year}-07-31`, months: 'Apr-Jun' },
      { quarter: 3, deadline: `${year}-10-31`, months: 'Jul-Sep' },
      { quarter: 4, deadline: `${year + 1}-01-31`, months: 'Oct-Dec' },
    ];

    for (const q of q941Deadlines) {
      const deadlineDate = new Date(q.deadline);
      const daysUntilDue = Math.ceil((deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      let status: FilingDeadline['status'] = 'upcoming';
      if (daysUntilDue < 0) status = 'overdue';
      else if (daysUntilDue <= 14) status = 'due_soon';

      deadlines.push({
        formType: '941',
        description: `Form 941 — Q${q.quarter} ${year} (${q.months})`,
        deadline: q.deadline,
        quarter: q.quarter,
        year,
        status,
        daysUntilDue,
        filingInstructions: `File Form 941 for Q${q.quarter} ${year}. Report federal income tax withheld, employer and employee Social Security and Medicare taxes. Due ${q.deadline}.`,
        irsPortalUrl: IRS_EFILE_PORTALS['941'].url,
      });
    }

    const futaDeadline = `${year + 1}-01-31`;
    const futaDate = new Date(futaDeadline);
    const futaDays = Math.ceil((futaDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    deadlines.push({
      formType: '940',
      description: `Form 940 — Annual FUTA Return ${year}`,
      deadline: futaDeadline,
      year,
      status: futaDays < 0 ? 'overdue' : futaDays <= 14 ? 'due_soon' : 'upcoming',
      daysUntilDue: futaDays,
      filingInstructions: `File Form 940 for tax year ${year}. Report employer FUTA tax liability. Due ${futaDeadline}.`,
      irsPortalUrl: IRS_EFILE_PORTALS['940'].url,
    });

    const w2Deadline = `${year + 1}-01-31`;
    const w2Date = new Date(w2Deadline);
    const w2Days = Math.ceil((w2Date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    deadlines.push({
      formType: 'w2',
      description: `W-2 Distribution — Tax Year ${year}`,
      deadline: w2Deadline,
      year,
      status: w2Days < 0 ? 'overdue' : w2Days <= 14 ? 'due_soon' : 'upcoming',
      daysUntilDue: w2Days,
      filingInstructions: `Distribute W-2 forms to all employees and file Copy A with the SSA. Due ${w2Deadline} to employees, ${year + 1}-02-28 to SSA (${year + 1}-03-31 if filing electronically).`,
      irsPortalUrl: IRS_EFILE_PORTALS['w2'].url,
    });

    const nec1099Deadline = `${year + 1}-01-31`;
    const nec1099Date = new Date(nec1099Deadline);
    const nec1099Days = Math.ceil((nec1099Date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    deadlines.push({
      formType: '1099',
      description: `1099-NEC Distribution — Tax Year ${year}`,
      deadline: nec1099Deadline,
      year,
      status: nec1099Days < 0 ? 'overdue' : nec1099Days <= 14 ? 'due_soon' : 'upcoming',
      daysUntilDue: nec1099Days,
      filingInstructions: `Distribute 1099-NEC forms to all contractors paid $600+ and file with the IRS. Due ${nec1099Deadline}.`,
      irsPortalUrl: IRS_EFILE_PORTALS['1099'].url,
    });

    return deadlines.sort((a, b) => a.daysUntilDue - b.daysUntilDue);
  }

  getFilingGuide(formType: '941' | '940' | 'w2' | '1099', state?: string): FilingGuide {
    const statePortals = state
      ? STATE_FILING_PORTALS.filter(p => p.state === state.toUpperCase())
      : STATE_FILING_PORTALS;

    switch (formType) {
      case '941':
        return {
          formType: '941',
          formTitle: "Form 941 — Employer's Quarterly Federal Tax Return",
          description: 'Report income taxes, Social Security tax, and Medicare tax withheld from employee paychecks, plus the employer portion of Social Security and Medicare taxes.',
          steps: [
            '1. Generate Form 941 in CoAIleague (Tax Center > Generate 941)',
            '2. Review all line items — verify wages, tips, and tax withholding totals match your payroll records',
            '3. Download the completed PDF from CoAIleague',
            '4. Go to the IRS e-file portal for employment taxes (link below)',
            '5. Create or sign in to your IRS e-file account',
            '6. Select "Form 941" and the appropriate quarter',
            '7. Enter the values from your CoAIleague-generated 941 into the IRS e-file form',
            '8. Review, sign electronically with your IRS PIN, and submit',
            '9. Save the confirmation number in CoAIleague (Tax Center > Mark as Filed)',
            '10. If balance due, make payment via EFTPS (Electronic Federal Tax Payment System)',
          ],
          irsPortalUrl: IRS_EFILE_PORTALS['941'].url,
          statePortals,
          estimatedTime: '15-30 minutes',
          requiredDocuments: ['Employer EIN', 'Quarterly payroll summary', 'Previous 941 (for comparison)', 'EFTPS PIN (for payment)'],
          penalty: 'Late filing: 5% of unpaid tax per month (max 25%). Late payment: 0.5% per month. Both compound.',
        };

      case '940':
        return {
          formType: '940',
          formTitle: "Form 940 — Employer's Annual Federal Unemployment (FUTA) Tax Return",
          description: 'Report annual FUTA tax. Only employers pay FUTA tax — it is not deducted from employee wages.',
          steps: [
            '1. Generate Form 940 in CoAIleague (Tax Center > Generate 940)',
            '2. Review taxable FUTA wages ($7,000 cap per employee) and state unemployment credit',
            '3. Download the completed PDF',
            '4. Go to the IRS e-file portal (link below)',
            '5. File Form 940 electronically or mail it to the IRS (electronic recommended)',
            '6. If FUTA tax exceeds $500 in any quarter, deposit quarterly via EFTPS',
            '7. Pay any remaining balance due with the return',
            '8. Mark as filed in CoAIleague',
          ],
          irsPortalUrl: IRS_EFILE_PORTALS['940'].url,
          statePortals,
          estimatedTime: '15-20 minutes',
          requiredDocuments: ['Employer EIN', 'Annual payroll totals', 'State unemployment contributions', 'EFTPS PIN'],
          penalty: 'Late filing: 5% per month (max 25%). Late deposit: up to 15% of undeposited amount.',
        };

      case 'w2':
        return {
          formType: 'w2',
          formTitle: 'Form W-2 — Wage and Tax Statement',
          description: 'Annual statement of wages paid and taxes withheld for each W-2 employee.',
          steps: [
            '1. Generate W-2s for all employees in CoAIleague (Tax Center > Generate W-2s)',
            '2. Review each W-2 — verify wages, federal/state tax withheld, SS/Medicare match payroll records',
            '3. Distribute Copy B and Copy C to each employee (via CoAIleague employee portal or print/mail)',
            '4. File Copy A with the Social Security Administration (SSA)',
            '5. Go to SSA Business Services Online (BSO) at the link below',
            '6. Create or sign in to your BSO account',
            '7. Upload W-2 data electronically (required if 10+ W-2s)',
            '8. File state copies with your state tax agency (use state portal links below)',
            '9. Keep Copy D for your records (4 years minimum)',
          ],
          irsPortalUrl: IRS_EFILE_PORTALS['w2'].url,
          statePortals,
          estimatedTime: '30-60 minutes (depends on employee count)',
          requiredDocuments: ['Employer EIN', 'Employee SSNs (on file)', 'Annual payroll records', 'BSO account credentials'],
          penalty: '$60-$310 per W-2 for late filing (depends on how late). Intentional disregard: $630 per form.',
        };

      case '1099':
        return {
          formType: '1099',
          formTitle: 'Form 1099-NEC — Nonemployee Compensation',
          description: 'Report payments of $600 or more to independent contractors and other nonemployees.',
          steps: [
            '1. Generate 1099-NECs for all contractors in CoAIleague (Tax Center > Generate 1099s)',
            '2. Review each 1099 — verify Box 1 (nonemployee compensation) matches total payments',
            '3. Distribute Copy B to each contractor (via CoAIleague portal or mail)',
            '4. File Copy A with the IRS using the Information Returns Intake System (IRIS)',
            '5. Go to IRS IRIS at the link below',
            '6. Create or sign in to your IRIS account',
            '7. Upload 1099-NEC data electronically',
            '8. File state copies with applicable state tax agencies',
            '9. Keep copies for your records (4 years minimum)',
          ],
          irsPortalUrl: IRS_EFILE_PORTALS['1099'].url,
          statePortals,
          estimatedTime: '20-40 minutes',
          requiredDocuments: ['Payer EIN', 'Contractor TINs (W-9 on file)', 'Annual payment records per contractor'],
          penalty: '$60-$310 per 1099 for late filing. Intentional disregard: $630 per form.',
        };
    }
  }

  getStatePortals(state?: string): StateFilingPortal[] {
    if (state) {
      return STATE_FILING_PORTALS.filter(p => p.state === state.toUpperCase());
    }
    return STATE_FILING_PORTALS;
  }

  getIRSPortals() {
    return IRS_EFILE_PORTALS;
  }

  async getEmployeeTaxForms(
    employeeId: string,
    workspaceId: string,
    taxYear?: number
  ): Promise<any[]> {
    try {
      const yearClause = taxYear ? eq(employeeTaxForms.taxYear, taxYear) : undefined;
      // Converted to Drizzle ORM: IN subquery → inArray()
      const resultRows = await db.select({
        id: employeeTaxForms.id,
        employeeId: employeeTaxForms.employeeId,
        workspaceId: employeeTaxForms.workspaceId,
        formType: employeeTaxForms.formType,
        taxYear: employeeTaxForms.taxYear,
        wages: employeeTaxForms.wages,
        federalTaxWithheld: employeeTaxForms.federalTaxWithheld,
        stateTaxWithheld: employeeTaxForms.stateTaxWithheld,
        socialSecurityWages: employeeTaxForms.socialSecurityWages,
        socialSecurityTaxWithheld: employeeTaxForms.socialSecurityTaxWithheld,
        medicareWages: employeeTaxForms.medicareWages,
        medicareTaxWithheld: employeeTaxForms.medicareTaxWithheld,
        generatedAt: employeeTaxForms.generatedAt,
        isActive: employeeTaxForms.isActive,
      })
        .from(employeeTaxForms)
        .where(and(
          eq(employeeTaxForms.employeeId, employeeId),
          eq(employeeTaxForms.workspaceId, workspaceId),
          inArray(employeeTaxForms.formType, ['w2', '1099']),
          yearClause
        ))
        .orderBy(desc(employeeTaxForms.taxYear), desc(employeeTaxForms.generatedAt));

      return resultRows ?? [];
    } catch {
      return [];
    }
  }

  async getMyTaxFormsForUser(
    userId: string,
    taxYear?: number
  ): Promise<{
    employee: typeof employees.$inferSelect | null;
    forms: any[];
  }> {
    const empRecords = await db
      .select()
      .from(employees)
      .where(eq(employees.userId, userId));

    if (!empRecords || empRecords.length === 0) {
      return { employee: null, forms: [] };
    }

    const employee = empRecords[0];
    const forms = await this.getEmployeeTaxForms(employee.id, employee.workspaceId, taxYear);

    return { employee, forms };
  }
}

export const taxFilingAssistanceService = new TaxFilingAssistanceService();
