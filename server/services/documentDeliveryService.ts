import { db } from "../db";
import { employees, systemAuditLogs } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { WORKSPACE_ROLE_HIERARCHY } from "../rbac";

interface DeliveryRecipient {
  email: string;
  name: string;
  role: string;
  employeeId?: string;
  userId?: string;
}

interface DocumentDeliveryResult {
  success: boolean;
  recipientsResolved: DeliveryRecipient[];
  emailsSent: number;
  errors: string[];
  executionId: string;
}

type DocumentType =
  | 'disciplinary_report'
  | 'field_training_report'
  | 'promotion_form'
  | 'contract_proposal'
  | 'onboarding_packet'
  | 'termination_notice'
  | 'performance_review';

type RecipientRule = 'employee_only' | 'manager_and_above' | 'hr_and_owner' | 'direct_manager' | 'co_owner_and_above' | 'custom';

const DOCUMENT_ROUTING_RULES: Record<DocumentType, { recipients: RecipientRule; ccRoles: string[]; description: string }> = {
  disciplinary_report: {
    recipients: 'hr_and_owner',
    ccRoles: ['manager', 'department_manager'],
    description: 'Routed to HR/ownership with manager CC',
  },
  field_training_report: {
    recipients: 'direct_manager',
    ccRoles: ['supervisor'],
    description: 'Routed to direct manager with supervisor CC',
  },
  promotion_form: {
    recipients: 'co_owner_and_above',
    ccRoles: ['manager', 'department_manager'],
    description: 'Routed to org admin/owners for approval',
  },
  contract_proposal: {
    recipients: 'custom',
    ccRoles: [],
    description: 'Sent to specified client email',
  },
  onboarding_packet: {
    recipients: 'employee_only',
    ccRoles: ['manager'],
    description: 'Sent to new employee with manager CC',
  },
  termination_notice: {
    recipients: 'hr_and_owner',
    ccRoles: [],
    description: 'Routed to HR and ownership only',
  },
  performance_review: {
    recipients: 'direct_manager',
    ccRoles: ['co_owner'],
    description: 'Routed to direct manager with admin CC',
  },
};

export class DocumentDeliveryService {
  private executionId: string;

  constructor() {
    this.executionId = `doc-delivery-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`;
  }

  async resolveRecipientsByRole(
    workspaceId: string,
    rule: RecipientRule,
    subjectEmployeeId?: string,
    customEmail?: string
  ): Promise<{ primary: DeliveryRecipient[]; cc: DeliveryRecipient[] }> {
    const primary: DeliveryRecipient[] = [];
    const cc: DeliveryRecipient[] = [];

    if (rule === 'custom' && customEmail) {
      primary.push({ email: customEmail, name: 'Client', role: 'external' });
      return { primary, cc };
    }

    if (rule === 'employee_only' && subjectEmployeeId) {
      const [emp] = await db.select().from(employees)
        .where(and(eq(employees.id, subjectEmployeeId), eq(employees.workspaceId, workspaceId)));
      if (emp?.email) {
        primary.push({
          email: emp.email,
          name: `${emp.firstName || ''} ${emp.lastName || ''}`.trim(),
          role: emp.workspaceRole || 'staff',
          employeeId: emp.id,
        });
      }
      return { primary, cc };
    }

    const workspaceEmployees = await db.select().from(employees)
      .where(eq(employees.workspaceId, workspaceId));

    if (rule === 'direct_manager' && subjectEmployeeId) {
      const directManager = await this.resolveDirectManager(workspaceId, subjectEmployeeId, workspaceEmployees);
      if (directManager) {
        primary.push(directManager);
      } else {
        for (const emp of workspaceEmployees) {
          if (!emp.email || emp.id === subjectEmployeeId) continue;
          const role = emp.workspaceRole || '';
          if (role === 'manager' || role === 'department_manager' || role === 'dept_manager') {
            primary.push(this.toRecipient(emp));
            break;
          }
        }
      }
      return { primary, cc };
    }

    if (rule === 'hr_and_owner') {
      const HR_ROLES = new Set(['org_owner', 'co_owner']);
      for (const emp of workspaceEmployees) {
        if (!emp.email || emp.id === subjectEmployeeId) continue;
        const role = emp.workspaceRole || '';
        if (HR_ROLES.has(role)) {
          primary.push(this.toRecipient(emp));
        }
      }
      return { primary, cc };
    }

    const minLevel = this.getMinLevelForRule(rule);
    for (const emp of workspaceEmployees) {
      if (!emp.email || emp.id === subjectEmployeeId) continue;
      const level = WORKSPACE_ROLE_HIERARCHY[emp.workspaceRole || ''] || 0;
      if (level >= minLevel) {
        primary.push(this.toRecipient(emp));
      }
    }

    return { primary, cc };
  }

  private toRecipient(emp: { id: string; email: string | null; firstName: string | null; lastName: string | null; workspaceRole: string | null }): DeliveryRecipient {
    return {
      email: emp.email!,
      name: `${emp.firstName || ''} ${emp.lastName || ''}`.trim(),
      role: emp.workspaceRole || 'staff',
      employeeId: emp.id,
    };
  }

  private async resolveDirectManager(
    workspaceId: string,
    employeeId: string,
    workspaceEmployees: Array<{ id: string; email: string | null; firstName: string | null; lastName: string | null; workspaceRole: string | null }>
  ): Promise<DeliveryRecipient | null> {
    try {
      const { managerAssignments } = await import('@shared/schema');
      const [assignment] = await db.select().from(managerAssignments)
        .where(eq(managerAssignments.employeeId, employeeId));
      if (assignment?.managerId) {
        const manager = workspaceEmployees.find(e => e.id === assignment.managerId);
        if (manager?.email) return this.toRecipient(manager);
      }
    } catch {
    }
    return null;
  }

  private getMinLevelForRule(rule: RecipientRule): number {
    switch (rule) {
      case 'manager_and_above': return WORKSPACE_ROLE_HIERARCHY['manager'];
      case 'co_owner_and_above': return WORKSPACE_ROLE_HIERARCHY['co_owner'];
      default: return WORKSPACE_ROLE_HIERARCHY['manager'];
    }
  }

  private resolveCCRecipients(
    workspaceEmployees: Array<{ id: string; email: string | null; firstName: string | null; lastName: string | null; workspaceRole: string | null }>,
    ccRoles: string[],
    excludeIds: Set<string>
  ): DeliveryRecipient[] {
    const ccRecipients: DeliveryRecipient[] = [];
    for (const emp of workspaceEmployees) {
      if (!emp.email || excludeIds.has(emp.id)) continue;
      if (ccRoles.includes(emp.workspaceRole || '')) {
        ccRecipients.push({
          email: emp.email,
          name: `${emp.firstName || ''} ${emp.lastName || ''}`.trim(),
          role: emp.workspaceRole || 'staff',
          employeeId: emp.id,
        });
      }
    }
    return ccRecipients;
  }

  async sendDisciplinaryReport(
    workspaceId: string,
    params: {
      employeeId: string;
      employeeName: string;
      reportTitle: string;
      reportDate: string;
      severity: 'verbal_warning' | 'written_warning' | 'final_warning' | 'suspension' | 'termination';
      description: string;
      actionRequired?: string;
      issuedBy: string;
    }
  ): Promise<DocumentDeliveryResult> {
    const routing = DOCUMENT_ROUTING_RULES.disciplinary_report;
    const { primary } = await this.resolveRecipientsByRole(workspaceId, routing.recipients, params.employeeId);

    const allEmployees = await db.select().from(employees).where(eq(employees.workspaceId, workspaceId));
    const primaryIds = new Set(primary.map(r => r.employeeId).filter(Boolean) as string[]);
    const ccRecipients = this.resolveCCRecipients(allEmployees, routing.ccRoles, primaryIds);

    const allRecipients = [...primary, ...ccRecipients];
    const errors: string[] = [];
    let emailsSent = 0;

    const severityColors: Record<string, string> = {
      verbal_warning: '#f59e0b',
      written_warning: '#f97316',
      final_warning: '#ef4444',
      suspension: '#dc2626',
      termination: '#991b1b',
    };

    const severityLabels: Record<string, string> = {
      verbal_warning: 'Verbal Warning',
      written_warning: 'Written Warning',
      final_warning: 'Final Warning',
      suspension: 'Suspension',
      termination: 'Termination',
    };

    for (const recipient of allRecipients) {
      try {
        const { sendAutomationEmail } = await import('./emailService');
        await sendAutomationEmail({
          to: recipient.email,
          subject: `Disciplinary Report - ${params.employeeName} - ${severityLabels[params.severity]}`,
          html: this.buildDisciplinaryTemplate(params, recipient, severityColors[params.severity], severityLabels[params.severity]),
          category: 'disciplinary_report',
          workspaceId,
        });
        emailsSent++;
      } catch (err: any) {
        errors.push(`Failed to send to ${recipient.email}: ${(err instanceof Error ? err.message : String(err))}`);
      }
    }

    await this.logDelivery(workspaceId, 'disciplinary_report', params.employeeId, allRecipients, emailsSent, errors);

    return { success: errors.length === 0, recipientsResolved: allRecipients, emailsSent, errors, executionId: this.executionId };
  }

  async sendFieldTrainingReport(
    workspaceId: string,
    params: {
      traineeId: string;
      traineeName: string;
      reportTitle: string;
      trainingDate: string;
      score?: number;
      passed: boolean;
      observations: string;
      recommendations?: string;
      trainerId: string;
      trainerName: string;
    }
  ): Promise<DocumentDeliveryResult> {
    const routing = DOCUMENT_ROUTING_RULES.field_training_report;
    const { primary } = await this.resolveRecipientsByRole(workspaceId, routing.recipients, params.traineeId);

    const allEmployees = await db.select().from(employees).where(eq(employees.workspaceId, workspaceId));
    const primaryIds = new Set(primary.map(r => r.employeeId).filter(Boolean) as string[]);
    const ccRecipients = this.resolveCCRecipients(allEmployees, routing.ccRoles, primaryIds);

    const allRecipients = [...primary, ...ccRecipients];
    const errors: string[] = [];
    let emailsSent = 0;

    for (const recipient of allRecipients) {
      try {
        const { sendAutomationEmail } = await import('./emailService');
        await sendAutomationEmail({
          to: recipient.email,
          subject: `Field Training Report - ${params.traineeName} - ${params.passed ? 'PASSED' : 'NEEDS IMPROVEMENT'}`,
          html: this.buildTrainingReportTemplate(params, recipient),
          category: 'training_report',
          workspaceId,
        });
        emailsSent++;
      } catch (err: any) {
        errors.push(`Failed to send to ${recipient.email}: ${(err instanceof Error ? err.message : String(err))}`);
      }
    }

    await this.logDelivery(workspaceId, 'field_training_report', params.traineeId, allRecipients, emailsSent, errors);

    return { success: errors.length === 0, recipientsResolved: allRecipients, emailsSent, errors, executionId: this.executionId };
  }

  async sendPromotionForm(
    workspaceId: string,
    params: {
      employeeId: string;
      employeeName: string;
      currentRole: string;
      proposedRole: string;
      effectiveDate: string;
      justification: string;
      salaryChange?: string;
      recommendedBy: string;
    }
  ): Promise<DocumentDeliveryResult> {
    const routing = DOCUMENT_ROUTING_RULES.promotion_form;
    const { primary } = await this.resolveRecipientsByRole(workspaceId, routing.recipients, params.employeeId);

    const allEmployees = await db.select().from(employees).where(eq(employees.workspaceId, workspaceId));
    const primaryIds = new Set(primary.map(r => r.employeeId).filter(Boolean) as string[]);
    const ccRecipients = this.resolveCCRecipients(allEmployees, routing.ccRoles, primaryIds);

    const allRecipients = [...primary, ...ccRecipients];
    const errors: string[] = [];
    let emailsSent = 0;

    for (const recipient of allRecipients) {
      try {
        const { sendAutomationEmail } = await import('./emailService');
        await sendAutomationEmail({
          to: recipient.email,
          subject: `Promotion Approval Required - ${params.employeeName} (${params.currentRole} → ${params.proposedRole})`,
          html: this.buildPromotionTemplate(params, recipient),
          category: 'promotion_form',
          workspaceId,
        });
        emailsSent++;
      } catch (err: any) {
        errors.push(`Failed to send to ${recipient.email}: ${(err instanceof Error ? err.message : String(err))}`);
      }
    }

    await this.logDelivery(workspaceId, 'promotion_form', params.employeeId, allRecipients, emailsSent, errors);

    return { success: errors.length === 0, recipientsResolved: allRecipients, emailsSent, errors, executionId: this.executionId };
  }

  async sendContractProposal(
    workspaceId: string,
    params: {
      clientEmail: string;
      clientName: string;
      proposalTitle: string;
      proposalSummary: string;
      portalUrl: string;
      expiresAt: string;
      value?: string;
    }
  ): Promise<DocumentDeliveryResult> {
    const allRecipients: DeliveryRecipient[] = [
      { email: params.clientEmail, name: params.clientName, role: 'external' },
    ];
    const errors: string[] = [];
    let emailsSent = 0;

    try {
      const { sendAutomationEmail } = await import('./emailService');
      await sendAutomationEmail({
        to: params.clientEmail,
        subject: `Proposal: ${params.proposalTitle} - Ready for Review`,
        html: this.buildContractProposalTemplate(params),
        category: 'contract_proposal',
        workspaceId,
      });
      emailsSent++;
    } catch (err: any) {
      errors.push(`Failed to send proposal to ${params.clientEmail}: ${(err instanceof Error ? err.message : String(err))}`);
    }

    await this.logDelivery(workspaceId, 'contract_proposal', undefined, allRecipients, emailsSent, errors);

    return { success: errors.length === 0, recipientsResolved: allRecipients, emailsSent, errors, executionId: this.executionId };
  }

  async sendOnboardingPacket(
    workspaceId: string,
    params: {
      employeeId: string;
      employeeName: string;
      employeeEmail: string;
      startDate: string;
      position: string;
      managerName?: string;
      documentsIncluded: string[];
      portalUrl?: string;
    }
  ): Promise<DocumentDeliveryResult> {
    const routing = DOCUMENT_ROUTING_RULES.onboarding_packet;
    const allRecipients: DeliveryRecipient[] = [
      { email: params.employeeEmail, name: params.employeeName, role: 'new_hire', employeeId: params.employeeId },
    ];

    const allEmployees = await db.select().from(employees).where(eq(employees.workspaceId, workspaceId));
    const ccRecipients = this.resolveCCRecipients(allEmployees, routing.ccRoles, new Set([params.employeeId]));
    allRecipients.push(...ccRecipients);

    const errors: string[] = [];
    let emailsSent = 0;

    for (const recipient of allRecipients) {
      try {
        const isNewHire = recipient.employeeId === params.employeeId;
        const { sendAutomationEmail } = await import('./emailService');
        await sendAutomationEmail({
          to: recipient.email,
          subject: isNewHire
            ? `Welcome to the Team! Your Onboarding Package`
            : `New Hire Onboarding - ${params.employeeName} Starting ${params.startDate}`,
          html: isNewHire
            ? this.buildOnboardingNewHireTemplate(params)
            : this.buildOnboardingManagerTemplate(params, recipient),
          category: 'onboarding_packet',
          workspaceId,
        });
        emailsSent++;
      } catch (err: any) {
        errors.push(`Failed to send to ${recipient.email}: ${(err instanceof Error ? err.message : String(err))}`);
      }
    }

    await this.logDelivery(workspaceId, 'onboarding_packet', params.employeeId, allRecipients, emailsSent, errors);

    return { success: errors.length === 0, recipientsResolved: allRecipients, emailsSent, errors, executionId: this.executionId };
  }

  private buildDisciplinaryTemplate(
    params: { employeeName: string; reportTitle: string; reportDate: string; severity: string; description: string; actionRequired?: string; issuedBy: string },
    recipient: DeliveryRecipient,
    color: string,
    label: string
  ): string {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: ${color}; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0;">Disciplinary Report</h2>
          <p style="margin: 4px 0 0; opacity: 0.9;">${label}</p>
        </div>
        <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p>Hello ${recipient.name},</p>
          <p>A disciplinary report has been issued and requires your attention.</p>
          <div style="background: #f9fafb; padding: 16px; border-radius: 6px; margin: 16px 0;">
            <p style="margin: 4px 0;"><strong>Employee:</strong> ${params.employeeName}</p>
            <p style="margin: 4px 0;"><strong>Report:</strong> ${params.reportTitle}</p>
            <p style="margin: 4px 0;"><strong>Date:</strong> ${params.reportDate}</p>
            <p style="margin: 4px 0;"><strong>Severity:</strong> ${label}</p>
            <p style="margin: 4px 0;"><strong>Issued By:</strong> ${params.issuedBy}</p>
          </div>
          <p><strong>Description:</strong></p>
          <p style="color: #374151;">${params.description}</p>
          ${params.actionRequired ? `<div style="background: #fef3c7; padding: 12px; border-radius: 6px; border-left: 4px solid ${color};"><strong>Action Required:</strong> ${params.actionRequired}</div>` : ''}
          <p style="color: #6b7280; font-size: 12px; margin-top: 24px;">This is a confidential document delivered via CoAIleague Document Delivery.</p>
        </div>
      </div>
    `;
  }

  private buildTrainingReportTemplate(
    params: { traineeName: string; reportTitle: string; trainingDate: string; score?: number; passed: boolean; observations: string; recommendations?: string; trainerName: string },
    recipient: DeliveryRecipient
  ): string {
    const statusColor = params.passed ? '#16a34a' : '#f59e0b';
    const statusText = params.passed ? 'PASSED' : 'NEEDS IMPROVEMENT';
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1e40af; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0;">Field Training Report</h2>
        </div>
        <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p>Hello ${recipient.name},</p>
          <p>A field training evaluation has been completed.</p>
          <div style="background: #f9fafb; padding: 16px; border-radius: 6px; margin: 16px 0;">
            <p style="margin: 4px 0;"><strong>Trainee:</strong> ${params.traineeName}</p>
            <p style="margin: 4px 0;"><strong>Report:</strong> ${params.reportTitle}</p>
            <p style="margin: 4px 0;"><strong>Date:</strong> ${params.trainingDate}</p>
            <p style="margin: 4px 0;"><strong>Trainer:</strong> ${params.trainerName}</p>
            ${params.score !== undefined ? `<p style="margin: 4px 0;"><strong>Score:</strong> ${params.score}%</p>` : ''}
            <p style="margin: 4px 0;"><strong>Result:</strong> <span style="background: ${statusColor}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 13px;">${statusText}</span></p>
          </div>
          <p><strong>Observations:</strong></p>
          <p style="color: #374151;">${params.observations}</p>
          ${params.recommendations ? `<p><strong>Recommendations:</strong></p><p style="color: #374151;">${params.recommendations}</p>` : ''}
          <p style="color: #6b7280; font-size: 12px; margin-top: 24px;">This is an automated training report delivered via CoAIleague Document Delivery.</p>
        </div>
      </div>
    `;
  }

  private buildPromotionTemplate(
    params: { employeeName: string; currentRole: string; proposedRole: string; effectiveDate: string; justification: string; salaryChange?: string; recommendedBy: string },
    recipient: DeliveryRecipient
  ): string {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #7c3aed; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0;">Promotion Approval Request</h2>
        </div>
        <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p>Hello ${recipient.name},</p>
          <p>A promotion has been recommended and requires your approval.</p>
          <div style="background: #f9fafb; padding: 16px; border-radius: 6px; margin: 16px 0;">
            <p style="margin: 4px 0;"><strong>Employee:</strong> ${params.employeeName}</p>
            <p style="margin: 4px 0;"><strong>Current Role:</strong> ${params.currentRole}</p>
            <p style="margin: 4px 0;"><strong>Proposed Role:</strong> ${params.proposedRole}</p>
            <p style="margin: 4px 0;"><strong>Effective Date:</strong> ${params.effectiveDate}</p>
            <p style="margin: 4px 0;"><strong>Recommended By:</strong> ${params.recommendedBy}</p>
            ${params.salaryChange ? `<p style="margin: 4px 0;"><strong>Salary Change:</strong> ${params.salaryChange}</p>` : ''}
          </div>
          <p><strong>Justification:</strong></p>
          <p style="color: #374151;">${params.justification}</p>
          <p style="color: #6b7280; font-size: 12px; margin-top: 24px;">Please log in to CoAIleague to approve or decline this promotion request.</p>
        </div>
      </div>
    `;
  }

  private buildContractProposalTemplate(
    params: { clientName: string; proposalTitle: string; proposalSummary: string; portalUrl: string; expiresAt: string; value?: string }
  ): string {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #0f766e; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0;">Proposal Ready for Review</h2>
        </div>
        <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p>Hello ${params.clientName},</p>
          <p>A new proposal has been prepared for your review.</p>
          <div style="background: #f9fafb; padding: 16px; border-radius: 6px; margin: 16px 0;">
            <p style="margin: 4px 0;"><strong>Proposal:</strong> ${params.proposalTitle}</p>
            ${params.value ? `<p style="margin: 4px 0;"><strong>Estimated Value:</strong> $${params.value}</p>` : ''}
            <p style="margin: 4px 0;"><strong>Valid Until:</strong> ${params.expiresAt}</p>
          </div>
          <p>${params.proposalSummary}</p>
          <div style="text-align: center; margin: 24px 0;">
            <a href="${params.portalUrl}" style="background: #0f766e; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">
              Review Proposal
            </a>
          </div>
          <p style="color: #6b7280; font-size: 12px; margin-top: 24px;">This proposal link expires on ${params.expiresAt}. Please review before the deadline.</p>
        </div>
      </div>
    `;
  }

  private buildOnboardingNewHireTemplate(
    params: { employeeName: string; startDate: string; position: string; managerName?: string; documentsIncluded: string[]; portalUrl?: string }
  ): string {
    const docList = params.documentsIncluded.map(d => `<li style="margin: 4px 0;">${d}</li>`).join('');
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #2563eb; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0;">Welcome to the Team!</h2>
        </div>
        <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p>Hello ${params.employeeName},</p>
          <p>We are excited to have you join us! Your onboarding packet is ready.</p>
          <div style="background: #f9fafb; padding: 16px; border-radius: 6px; margin: 16px 0;">
            <p style="margin: 4px 0;"><strong>Position:</strong> ${params.position}</p>
            <p style="margin: 4px 0;"><strong>Start Date:</strong> ${params.startDate}</p>
            ${params.managerName ? `<p style="margin: 4px 0;"><strong>Manager:</strong> ${params.managerName}</p>` : ''}
          </div>
          <p><strong>Included Documents:</strong></p>
          <ul style="color: #374151;">${docList}</ul>
          ${params.portalUrl ? `
          <div style="text-align: center; margin: 24px 0;">
            <a href="${params.portalUrl}" style="background: #2563eb; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">
              Complete Onboarding
            </a>
          </div>` : ''}
          <p style="color: #6b7280; font-size: 12px; margin-top: 24px;">This is an automated message from CoAIleague Onboarding.</p>
        </div>
      </div>
    `;
  }

  private buildOnboardingManagerTemplate(
    params: { employeeName: string; startDate: string; position: string; documentsIncluded: string[] },
    recipient: DeliveryRecipient
  ): string {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #2563eb; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0;">New Hire Onboarding Notification</h2>
        </div>
        <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p>Hello ${recipient.name},</p>
          <p>A new team member is being onboarded and you have been notified as their manager.</p>
          <div style="background: #f9fafb; padding: 16px; border-radius: 6px; margin: 16px 0;">
            <p style="margin: 4px 0;"><strong>New Hire:</strong> ${params.employeeName}</p>
            <p style="margin: 4px 0;"><strong>Position:</strong> ${params.position}</p>
            <p style="margin: 4px 0;"><strong>Start Date:</strong> ${params.startDate}</p>
          </div>
          <p>Please ensure you are prepared to welcome and orient this new team member.</p>
          <p style="color: #6b7280; font-size: 12px; margin-top: 24px;">This is an automated notification from CoAIleague Onboarding.</p>
        </div>
      </div>
    `;
  }

  private async logDelivery(
    workspaceId: string,
    documentType: string,
    subjectEmployeeId: string | undefined,
    recipients: DeliveryRecipient[],
    emailsSent: number,
    errors: string[]
  ): Promise<void> {
    try {
      await db.insert(systemAuditLogs).values({
        userId: 'system',
        action: 'document_delivery',
        entityType: 'document',
        entityId: this.executionId,
        workspaceId,
        ipAddress: '0.0.0.0',
        metadata: { details: { documentType, workspaceId, subjectEmployeeId, recipientCount: recipients.length, emailsSent, errors: errors.length > 0 ? errors : undefined, recipients: recipients.map(r => ({ email: r.email, role: r.role })) } },
      });
    } catch {
    }
  }

  getRoutingRules(): typeof DOCUMENT_ROUTING_RULES {
    return DOCUMENT_ROUTING_RULES;
  }
}

export const documentDeliveryService = new DocumentDeliveryService();
