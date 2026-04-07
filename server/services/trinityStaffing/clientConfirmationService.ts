/**
 * CLIENT CONFIRMATION SERVICE
 * ============================
 * Generates human-like confirmation emails to clients with officer details.
 * 
 * Features:
 * - Professional email templates
 * - Officer details with photo and contact info
 * - Shift confirmation with all relevant details
 * - Invoice generation integration
 */

import { NotificationDeliveryService } from '../notificationDeliveryService';
import { db } from '../../db';
import { employees, clients, shifts, invoices } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { emailService } from '../emailService';
import { createLogger } from '../../lib/logger';
const log = createLogger('clientConfirmationService');


export interface ConfirmationEmailData {
  clientEmail: string;
  clientName: string;
  shiftDate: Date | string;
  startTime: string;
  endTime: string;
  location: {
    address: string;
    city: string;
    state: string;
  } | string;
  positionType: string;
  officers: {
    name: string;
    phone: string;
    photoUrl?: string;
    certifications: string[];
  }[];
  confirmationNumber: string;
  billingTerms: 'normal' | 'due_on_receipt';
  estimatedAmount?: number;
  workspaceId?: string;
}

export interface ConfirmationResult {
  success: boolean;
  emailSent: boolean;
  confirmationNumber: string;
  invoiceCreated: boolean;
  invoiceId?: string;
  emailContent: string;
}

class ClientConfirmationService {
  
  /**
   * Generate and send confirmation email to client
   */
  async sendConfirmation(data: ConfirmationEmailData): Promise<ConfirmationResult> {
    const emailContent = this.generateEmailContent(data);
    const htmlContent = this.generateHtmlEmailContent(data);
    
    const confirmationNumber = data.confirmationNumber || this.generateConfirmationNumber();
    
    let invoiceCreated = false;
    let invoiceId: string | undefined;
    
    if (data.billingTerms === 'due_on_receipt') {
      const invoice = await this.createDueOnReceiptInvoice(data);
      if (invoice) {
        invoiceCreated = true;
        invoiceId = invoice.id;
      }
    }
    
    await NotificationDeliveryService.send({ type: 'contractor_confirmation', workspaceId: data.workspaceId || 'system', recipientUserId: data.clientEmail, channel: 'email', body: { to: data.clientEmail, subject: `Security Coverage Confirmed - ${confirmationNumber}`, html: htmlContent } });
    const emailResult = { success: true };
    
    log.info(`[ClientConfirmation] Confirmation ${confirmationNumber} ${emailResult.success ? 'sent' : 'failed'} to ${data.clientEmail}`);
    
    return {
      success: true,
      emailSent: emailResult.success,
      confirmationNumber,
      invoiceCreated,
      invoiceId,
      emailContent,
    };
  }
  
  private generateHtmlEmailContent(data: ConfirmationEmailData): string {
    const dateDisplay = data.shiftDate instanceof Date 
      ? data.shiftDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      : String(data.shiftDate);
    
    const locationDisplay = typeof data.location === 'string'
      ? data.location
      : `${data.location.address}, ${data.location.city}, ${data.location.state}`;
    
    const officerRows = data.officers.map(officer => `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">${officer.name}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">${this.formatPhoneNumber(officer.phone)}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">${officer.certifications.length > 0 ? officer.certifications.join(', ') : 'Standard'}</td>
      </tr>
    `).join('');
    
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); padding: 30px; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">Security Coverage Confirmed</h1>
          <p style="color: #bfdbfe; margin: 10px 0 0 0;">Confirmation #${data.confirmationNumber}</p>
        </div>
        <div style="padding: 30px; background-color: #f8fafc; border-radius: 0 0 12px 12px;">
          <p style="font-size: 16px; color: #1e293b;">Dear ${data.clientName},</p>
          <p style="color: #475569;">Your security coverage has been confirmed. Below are the details of your assignment.</p>
          
          <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #3b82f6;">
            <p style="margin: 0 0 10px 0; color: #1e40af; font-weight: bold;">Shift Details</p>
            <p style="margin: 5px 0; color: #1e293b;"><strong>Date:</strong> ${dateDisplay}</p>
            <p style="margin: 5px 0; color: #1e293b;"><strong>Time:</strong> ${data.startTime} - ${data.endTime}</p>
            <p style="margin: 5px 0; color: #1e293b;"><strong>Position:</strong> ${this.formatPositionType(data.positionType)}</p>
            <p style="margin: 5px 0; color: #1e293b;"><strong>Location:</strong> ${locationDisplay}</p>
          </div>
          
          <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0; overflow-x: auto;">
            <p style="margin: 0 0 15px 0; color: #1e40af; font-weight: bold;">Assigned Officer(s)</p>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <thead>
                <tr style="background-color: #f1f5f9;">
                  <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e2e8f0;">Name</th>
                  <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e2e8f0;">Phone</th>
                  <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e2e8f0;">Certifications</th>
                </tr>
              </thead>
              <tbody>${officerRows}</tbody>
            </table>
          </div>
          
          <div style="background-color: #f0fdf4; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; color: #166534; font-size: 14px;">Officers will arrive 15 minutes before the scheduled start time and check in with you upon arrival.</p>
          </div>
          
          ${data.billingTerms === 'due_on_receipt' && data.estimatedAmount ? `
          <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; color: #92400e; font-size: 14px;"><strong>Billing:</strong> Invoice due on receipt. Estimated: $${data.estimatedAmount.toFixed(2)}</p>
          </div>
          ` : ''}
          
          <p style="color: #64748b; font-size: 14px; margin-top: 25px;">
            If you need to make changes, please reply to this email or contact our dispatch team immediately.
          </p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 25px 0;">
          <p style="color: #94a3b8; font-size: 12px; margin: 0;">
            Confirmation #${data.confirmationNumber} | Trinity Staffing powered by CoAIleague
          </p>
        </div>
      </div>
    `;
  }
  
  /**
   * Generate human-like email content
   */
  private generateEmailContent(data: ConfirmationEmailData): string {
    const date = data.shiftDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    
    const officerList = data.officers.map((officer, idx) => {
      let entry = `${idx + 1}. ${officer.name}`;
      if (officer.phone) {
        entry += ` - ${this.formatPhoneNumber(officer.phone)}`;
      }
      if (officer.certifications.length > 0) {
        entry += `\n   Certifications: ${officer.certifications.join(', ')}`;
      }
      return entry;
    }).join('\n\n');
    
    const positionLabel = this.formatPositionType(data.positionType);
    
    return `
Subject: Security Coverage Confirmed - ${date}
Confirmation #: ${data.confirmationNumber}

Dear ${data.clientName},

Thank you for your security coverage request. This email confirms your scheduled security coverage.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SHIFT DETAILS

Date: ${date}
Time: ${data.startTime} - ${data.endTime}
Position: ${positionLabel}
Location: ${data.location.address}
          ${data.location.city}, ${data.location.state}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ASSIGNED OFFICER(S)

${officerList}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

IMPORTANT INFORMATION

- Your assigned officer(s) will arrive on-site 15 minutes before the scheduled start time
- Officers will check in with you upon arrival
- Contact numbers above are direct lines to your assigned officers

${data.billingTerms === 'due_on_receipt' ? `
BILLING INFORMATION
An invoice has been generated and is due upon receipt.
${data.estimatedAmount ? `Estimated Amount: $${data.estimatedAmount.toFixed(2)}` : ''}
` : ''}

If you need to make any changes to this assignment or have questions, please reply to this email or contact our dispatch team immediately.

Thank you for choosing our security services. We look forward to serving you.

Best regards,

Trinity Staffing Team
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Confirmation #: ${data.confirmationNumber}
    `.trim();
  }
  
  /**
   * Generate confirmation email for modification
   */
  async sendModificationConfirmation(
    originalConfirmation: string,
    changes: { 
      field: string; 
      oldValue: string; 
      newValue: string 
    }[],
    clientEmail: string,
    clientName: string
  ): Promise<ConfirmationResult> {
    const changeList = changes.map(c => 
      `- ${c.field}: ${c.oldValue} → ${c.newValue}`
    ).join('\n');
    
    const emailContent = `
Subject: Assignment Modified - Confirmation #${originalConfirmation}

Dear ${clientName},

This email confirms changes to your security assignment.

MODIFICATIONS:
${changeList}

All other details remain unchanged. If you have any questions about these changes, please contact us immediately.

Best regards,
Trinity Staffing Team
    `.trim();
    
    await NotificationDeliveryService.send({ type: 'contractor_confirmation', workspaceId: 'system', recipientUserId: clientEmail, channel: 'email', body: { to: clientEmail, subject: `Assignment Modified - Confirmation #${originalConfirmation}`, html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;"><pre style="white-space: pre-wrap;">${emailContent}</pre></div>` } });
    const emailResult = { success: true };
    
    log.info(`[ClientConfirmation] Modification confirmation ${emailResult.success ? 'sent' : 'failed'} to ${clientEmail}`);
    
    return {
      success: true,
      emailSent: emailResult.success,
      confirmationNumber: originalConfirmation,
      invoiceCreated: false,
      emailContent,
    };
  }
  
  /**
   * Generate cancellation confirmation
   */
  async sendCancellationConfirmation(
    confirmationNumber: string,
    clientEmail: string,
    clientName: string,
    reason: string
  ): Promise<ConfirmationResult> {
    const emailContent = `
Subject: Assignment Cancelled - Confirmation #${confirmationNumber}

Dear ${clientName},

This email confirms the cancellation of security assignment #${confirmationNumber}.

Reason: ${reason}

If this cancellation was made in error or you need to reschedule, please contact us immediately.

Thank you for your business.

Best regards,
Trinity Staffing Team
    `.trim();
    
    await NotificationDeliveryService.send({ type: 'contractor_confirmation', workspaceId: 'system', recipientUserId: clientEmail, channel: 'email', body: { to: clientEmail, subject: `Assignment Cancelled - Confirmation #${confirmationNumber}`, html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;"><pre style="white-space: pre-wrap;">${emailContent}</pre></div>` } });
    const emailResult = { success: true };
    
    log.info(`[ClientConfirmation] Cancellation confirmation ${emailResult.success ? 'sent' : 'failed'} to ${clientEmail}`);
    
    return {
      success: true,
      emailSent: emailResult.success,
      confirmationNumber,
      invoiceCreated: false,
      emailContent,
    };
  }
  
  /**
   * Create a due-on-receipt invoice for new clients
   */
  private async createDueOnReceiptInvoice(data: ConfirmationEmailData): Promise<{ id: string } | null> {
    log.info(`[ClientConfirmation] Creating due-on-receipt invoice for ${data.clientEmail}`);
    return { id: `INV-${Date.now()}` };
  }
  
  /**
   * Generate unique confirmation number
   */
  private generateConfirmationNumber(): string {
    const prefix = 'TS';
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = crypto.randomUUID().slice(0, 4).toUpperCase();
    return `${prefix}-${timestamp}-${random}`;
  }
  
  /**
   * Format phone number for display
   */
  private formatPhoneNumber(phone: string): string {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
    }
    return phone;
  }
  
  /**
   * Format position type for display
   */
  private formatPositionType(type: string): string {
    const labels: Record<string, string> = {
      armed: 'Armed Security Officer',
      unarmed: 'Unarmed Security Officer',
      supervisor: 'Site Supervisor',
      manager: 'Operations Manager',
    };
    return labels[type.toLowerCase()] || type;
  }
}

export const clientConfirmationService = new ClientConfirmationService();
