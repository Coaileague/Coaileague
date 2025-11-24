/**
 * CENTRALIZED EMAIL SERVICE
 * 
 * Unifies all email notifications across AutoForce™ with:
 * - Persistent audit trail (emailEvents table)
 * - Queue-compatible error handling
 * - Notification category abstraction
 * - Resend integration with proper error handling
 */

import { db } from "../db";
import { emailEvents } from "@shared/schema";
import { eq } from "drizzle-orm";
// Reuse existing Resend client from email.ts (no duplication!)
import { getUncachableResendClient } from "../email";

// ============================================================================
// BASE URL UTILITY
// ============================================================================

/**
 * Get application base URL for email links
 * Priority: APP_BASE_URL > REPLIT_DOMAINS > REPL construction > localhost
 */
function getAppBaseUrl(): string {
  // Priority 1: Explicit APP_BASE_URL environment variable
  if (process.env.APP_BASE_URL) {
    return process.env.APP_BASE_URL;
  }
  
  // Priority 2: Replit domains (production deployment)
  if (process.env.REPLIT_DOMAINS) {
    const domains = process.env.REPLIT_DOMAINS.split(',');
    return `https://${domains[0]}`;
  }
  
  // Priority 3: Construct from REPL environment (development)
  if (process.env.REPL_SLUG && process.env.REPL_OWNER) {
    return `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
  }
  
  // Fallback: localhost (local development)
  return 'http://localhost:5000';
}

// ============================================================================
// EMAIL TEMPLATES
// ============================================================================

const emailTemplates = {
  verification: (data: {
    firstName: string;
    verificationUrl: string;
  }) => ({
    subject: 'Verify Your AutoForce™ Account',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Verify Your Email Address</h2>
        <p>Hello ${data.firstName},</p>
        <p>Thank you for signing up for AutoForce™! Please verify your email address to activate your account.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${data.verificationUrl}" 
             style="background-color: #2563eb; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">
            Verify Email Address
          </a>
        </div>
        <p style="color: #6b7280; font-size: 14px;">This link will expire in 24 hours.</p>
        <p style="color: #6b7280; font-size: 12px; margin-top: 30px;">
          If you did not create an account, please ignore this email.<br>
          This is an automated message from AutoForce™.
        </p>
      </div>
    `
  }),

  passwordReset: (data: {
    firstName: string;
    resetUrl: string;
  }) => ({
    subject: 'Reset Your AutoForce™ Password',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Password Reset Request</h2>
        <p>Hello ${data.firstName},</p>
        <p>We received a request to reset your password for your AutoForce™ account.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${data.resetUrl}" 
             style="background-color: #2563eb; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">
            Reset Password
          </a>
        </div>
        <p style="color: #6b7280; font-size: 14px;">This link will expire in 1 hour.</p>
        <div style="background-color: #fef2f2; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626;">
          <p style="margin: 0; color: #dc2626; font-weight: bold;">Security Notice:</p>
          <p style="margin: 5px 0 0 0; font-size: 14px;">If you did not request this password reset, please ignore this email and your password will remain unchanged.</p>
        </div>
        <p style="color: #6b7280; font-size: 12px; margin-top: 30px;">
          This is an automated message from AutoForce™.
        </p>
      </div>
    `
  }),

  supportTicketConfirmation: (data: {
    name: string;
    ticketNumber: string;
    subject: string;
  }) => ({
    subject: `Support Ticket Created - ${data.ticketNumber}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #16a34a;">Support Ticket Received</h2>
        <p>Hello ${data.name},</p>
        <p>Thank you for contacting AutoForce™ support. Your ticket has been received and assigned a tracking number.</p>
        <div style="background-color: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #16a34a;">
          <p style="margin: 5px 0;"><strong>Ticket Number:</strong> ${data.ticketNumber}</p>
          <p style="margin: 5px 0;"><strong>Subject:</strong> ${data.subject}</p>
          <p style="margin: 15px 0 5px 0;">Please save this ticket number for your records. You can use it to access Live Chat support or check the status of your request.</p>
        </div>
        <p>Our support team will review your request and respond as soon as possible.</p>
        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
          This is an automated confirmation from AutoForce™ Support.
        </p>
      </div>
    `
  }),

  reportDelivery: (data: {
    clientName: string;
    reportNumber: string;
    reportTitle: string;
  }) => ({
    subject: `Report Delivered - ${data.reportNumber}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Report Ready for Review</h2>
        <p>Hello ${data.clientName},</p>
        <p>A new report has been completed and is ready for your review.</p>
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 5px 0;"><strong>Report Number:</strong> ${data.reportNumber}</p>
          <p style="margin: 5px 0;"><strong>Title:</strong> ${data.reportTitle}</p>
        </div>
        <p>Please log in to your AutoForce™ portal to view the full report details.</p>
        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
          This is an automated message from AutoForce™ ReportOS.
        </p>
      </div>
    `
  }),

  employeeTemporaryPassword: (data: {
    firstName: string;
    email: string;
    tempPassword: string;
    workspaceName: string;
  }) => ({
    subject: `Your AutoForce™ Account - Temporary Password`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Welcome to ${data.workspaceName}</h2>
        <p>Hello ${data.firstName},</p>
        <p>Your AutoForce™ account has been created. Use the credentials below to log in for the first time:</p>
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 5px 0;"><strong>Email:</strong> ${data.email}</p>
          <p style="margin: 5px 0;"><strong>Temporary Password:</strong> <code style="background-color: #fff; padding: 2px 6px; border-radius: 4px; font-family: monospace;">${data.tempPassword}</code></p>
        </div>
        <div style="background-color: #fff7ed; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
          <p style="margin: 0; color: #f59e0b; font-weight: bold;">Important:</p>
          <p style="margin: 5px 0 0 0; font-size: 14px;">You will be required to change this password upon your first login for security purposes.</p>
        </div>
        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
          This is an automated message from AutoForce™.
        </p>
      </div>
    `
  }),

  managerOnboardingNotification: (data: {
    managerName: string;
    employeeName: string;
    workspaceName: string;
  }) => ({
    subject: `New Employee Onboarding - ${data.employeeName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">New Employee Onboarding</h2>
        <p>Hello ${data.managerName},</p>
        <p>A new employee has been added to your team and is ready for onboarding.</p>
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 5px 0;"><strong>Employee:</strong> ${data.employeeName}</p>
          <p style="margin: 5px 0;"><strong>Workspace:</strong> ${data.workspaceName}</p>
        </div>
        <p>Please ensure all onboarding tasks are completed and the employee has access to necessary systems.</p>
        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
          This is an automated notification from AutoForce™.
        </p>
      </div>
    `
  }),
};

// ============================================================================
// EMAIL SERVICE CLASS
// ============================================================================

interface EmailResult {
  success: boolean;
  resendId?: string;
  error?: string;
}

export class EmailService {
  
  /**
   * Log email event to database
   */
  private async logEmailEvent(
    emailType: string,
    recipientEmail: string,
    status: 'pending' | 'sent' | 'failed',
    workspaceId?: string,
    userId?: string,
    resendId?: string,
    errorMessage?: string
  ): Promise<string> {
    try {
      const [event] = await db.insert(emailEvents).values({
        workspaceId: workspaceId || null,
        userId: userId || null,
        emailType,
        recipientEmail,
        status,
        resendId: resendId || null,
        errorMessage: errorMessage || null,
        sentAt: status === 'sent' ? new Date() : null,
      }).returning();
      
      return event.id;
    } catch (error: any) {
      console.error('[EmailService] Failed to log email event:', error.message);
      throw error;
    }
  }

  /**
   * Update email event status
   */
  private async updateEmailEvent(
    eventId: string,
    status: 'sent' | 'failed',
    resendId?: string,
    errorMessage?: string
  ): Promise<void> {
    try {
      await db.update(emailEvents)
        .set({
          status,
          resendId: resendId || null,
          errorMessage: errorMessage || null,
          sentAt: status === 'sent' ? new Date() : null,
        })
        .where(eq(emailEvents.id, eventId));
    } catch (error: any) {
      console.error('[EmailService] Failed to update email event:', error.message);
    }
  }

  /**
   * Send email via Resend with audit logging
   */
  private async sendEmail(
    to: string,
    subject: string,
    html: string,
    emailType: string,
    workspaceId?: string,
    userId?: string
  ): Promise<EmailResult> {
    // Create pending log entry
    const eventId = await this.logEmailEvent(
      emailType,
      to,
      'pending',
      workspaceId,
      userId
    );

    try {
      // Get Resend client
      const { client, fromEmail } = await getUncachableResendClient();

      // Send email
      const result = await client.emails.send({
        from: fromEmail,
        to,
        subject,
        html,
      });

      // Update log with success
      await this.updateEmailEvent(eventId, 'sent', result.data?.id);

      console.log(`[EmailService] Email sent successfully: ${emailType} to ${to} (Resend ID: ${result.data?.id})`);

      return {
        success: true,
        resendId: result.data?.id,
      };
    } catch (error: any) {
      const errorMessage = error.message || 'Unknown error';
      
      // Update log with failure
      await this.updateEmailEvent(eventId, 'failed', undefined, errorMessage);

      console.error(`[EmailService] Email failed: ${emailType} to ${to}`, errorMessage);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  // ============================================================================
  // PUBLIC EMAIL METHODS
  // ============================================================================

  /**
   * Send verification email to new user
   * Priority #1
   */
  async sendVerificationEmail(
    userId: string,
    email: string,
    verificationToken: string,
    firstName?: string
  ): Promise<EmailResult> {
    const verificationUrl = `${getAppBaseUrl()}/verify-email?token=${verificationToken}`;
    
    const template = emailTemplates.verification({
      firstName: firstName || 'User',
      verificationUrl,
    });

    return this.sendEmail(
      email,
      template.subject,
      template.html,
      'verification',
      undefined,
      userId
    );
  }

  /**
   * Send password reset email
   * Priority #2
   */
  async sendPasswordResetEmail(
    userId: string,
    email: string,
    resetToken: string,
    firstName?: string
  ): Promise<EmailResult> {
    const resetUrl = `${getAppBaseUrl()}/reset-password?token=${resetToken}`;
    
    const template = emailTemplates.passwordReset({
      firstName: firstName || 'User',
      resetUrl,
    });

    return this.sendEmail(
      email,
      template.subject,
      template.html,
      'password_reset',
      undefined,
      userId
    );
  }

  /**
   * Send support ticket confirmation email
   */
  async sendSupportTicketConfirmation(
    workspaceId: string,
    ticketId: string,
    userEmail: string,
    ticketNumber: string,
    subject: string,
    userName?: string
  ): Promise<EmailResult> {
    const template = emailTemplates.supportTicketConfirmation({
      name: userName || 'User',
      ticketNumber,
      subject,
    });

    return this.sendEmail(
      userEmail,
      template.subject,
      template.html,
      'support_ticket',
      workspaceId
    );
  }

  /**
   * Send report delivery email to client
   */
  async sendReportDelivery(
    workspaceId: string,
    clientEmail: string,
    reportData: {
      reportNumber: string;
      reportTitle: string;
      clientName: string;
    }
  ): Promise<EmailResult> {
    const template = emailTemplates.reportDelivery({
      clientName: reportData.clientName,
      reportNumber: reportData.reportNumber,
      reportTitle: reportData.reportTitle,
    });

    return this.sendEmail(
      clientEmail,
      template.subject,
      template.html,
      'report_delivery',
      workspaceId
    );
  }

  /**
   * Send temporary password to new employee
   */
  async sendEmployeeTemporaryPassword(
    workspaceId: string,
    employeeId: string,
    email: string,
    tempPassword: string,
    firstName?: string,
    workspaceName?: string
  ): Promise<EmailResult> {
    const template = emailTemplates.employeeTemporaryPassword({
      firstName: firstName || 'Employee',
      email,
      tempPassword,
      workspaceName: workspaceName || 'AutoForce™',
    });

    return this.sendEmail(
      email,
      template.subject,
      template.html,
      'employee_temp_password',
      workspaceId
    );
  }

  /**
   * Send manager notification for new employee onboarding
   */
  async sendManagerOnboardingNotification(
    workspaceId: string,
    managerId: string,
    managerEmail: string,
    employeeName: string,
    managerName?: string,
    workspaceName?: string
  ): Promise<EmailResult> {
    const template = emailTemplates.managerOnboardingNotification({
      managerName: managerName || 'Manager',
      employeeName,
      workspaceName: workspaceName || 'AutoForce™',
    });

    return this.sendEmail(
      managerEmail,
      template.subject,
      template.html,
      'manager_onboarding',
      workspaceId,
      managerId
    );
  }
  /**
   * Send custom email (for rule engine and automation workflows)
   * Public method for external use
   */
  async sendCustomEmail(
    to: string,
    subject: string,
    html: string,
    emailType?: string,
    workspaceId?: string,
    userId?: string
  ): Promise<EmailResult> {
    return this.sendEmail(
      to,
      subject,
      html,
      emailType || 'custom_email',
      workspaceId,
      userId
    );
  }
}

// Export singleton instance
export const emailService = new EmailService();
