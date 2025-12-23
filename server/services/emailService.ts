/**
 * CENTRALIZED EMAIL SERVICE
 * 
 * Unifies all email notifications across CoAIleague with:
 * - Persistent audit trail (emailEvents table)
 * - Queue-compatible error handling
 * - Notification category abstraction
 * - Resend integration with proper error handling
 */

import { db } from "../db";
import { emailEvents } from "@shared/schema";
import { eq } from "drizzle-orm";
// Reuse existing Resend client from email.ts (no duplication!)
import { getUncachableResendClient, isResendConfigured } from "../email";

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
    subject: 'Verify Your CoAIleague Account',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Verify Your Email Address</h2>
        <p>Hello ${data.firstName},</p>
        <p>Thank you for signing up for CoAIleague! Please verify your email address to activate your account.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${data.verificationUrl}" 
             style="background-color: #2563eb; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">
            Verify Email Address
          </a>
        </div>
        <p style="color: #6b7280; font-size: 14px;">This link will expire in 24 hours.</p>
        <p style="color: #6b7280; font-size: 12px; margin-top: 30px;">
          If you did not create an account, please ignore this email.<br>
          This is an automated message from CoAIleague.
        </p>
      </div>
    `
  }),

  passwordReset: (data: {
    firstName: string;
    resetUrl: string;
  }) => ({
    subject: 'Reset Your CoAIleague Password',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Password Reset Request</h2>
        <p>Hello ${data.firstName},</p>
        <p>We received a request to reset your password for your CoAIleague account.</p>
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
          This is an automated message from CoAIleague.
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
        <p>Thank you for contacting CoAIleague support. Your ticket has been received and assigned a tracking number.</p>
        <div style="background-color: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #16a34a;">
          <p style="margin: 5px 0;"><strong>Ticket Number:</strong> ${data.ticketNumber}</p>
          <p style="margin: 5px 0;"><strong>Subject:</strong> ${data.subject}</p>
          <p style="margin: 15px 0 5px 0;">Please save this ticket number for your records. You can use it to access Live Chat support or check the status of your request.</p>
        </div>
        <p>Our support team will review your request and respond as soon as possible.</p>
        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
          This is an automated confirmation from CoAIleague Support.
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
        <p>Please log in to your CoAIleague portal to view the full report details.</p>
        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
          This is an automated message from CoAIleague ReportOS.
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
    subject: `Your CoAIleague Account - Temporary Password`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Welcome to ${data.workspaceName}</h2>
        <p>Hello ${data.firstName},</p>
        <p>Your CoAIleague account has been created. Use the credentials below to log in for the first time:</p>
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 5px 0;"><strong>Email:</strong> ${data.email}</p>
          <p style="margin: 5px 0;"><strong>Temporary Password:</strong> <code style="background-color: #fff; padding: 2px 6px; border-radius: 4px; font-family: monospace;">${data.tempPassword}</code></p>
        </div>
        <div style="background-color: #fff7ed; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
          <p style="margin: 0; color: #f59e0b; font-weight: bold;">Important:</p>
          <p style="margin: 5px 0 0 0; font-size: 14px;">You will be required to change this password upon your first login for security purposes.</p>
        </div>
        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
          This is an automated message from CoAIleague.
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
          This is an automated notification from CoAIleague.
        </p>
      </div>
    `
  }),

  clientWelcome: (data: {
    clientName: string;
    companyName: string;
    workspaceName: string;
    portalUrl: string;
  }) => ({
    subject: `Welcome to ${data.workspaceName} - Client Portal Access`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Welcome to ${data.workspaceName}!</h2>
        <p>Hello ${data.clientName},</p>
        <p>Thank you for choosing to work with us! Your client account has been set up and you now have access to our client portal.</p>
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 5px 0;"><strong>Organization:</strong> ${data.companyName}</p>
          <p style="margin: 5px 0;"><strong>Service Provider:</strong> ${data.workspaceName}</p>
        </div>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${data.portalUrl}" 
             style="background-color: #2563eb; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">
            Access Client Portal
          </a>
        </div>
        <p>Through the portal, you can:</p>
        <ul style="color: #4b5563;">
          <li>View and approve timesheets</li>
          <li>Access invoices and payment history</li>
          <li>Review reports and analytics</li>
          <li>Communicate with your service team</li>
        </ul>
        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
          If you have any questions, please don't hesitate to reach out to your account manager.<br>
          This is an automated message from CoAIleague.
        </p>
      </div>
    `
  }),

  newMemberWelcome: (data: {
    firstName: string;
    onboardingUrl: string;
  }) => ({
    subject: 'Welcome to CoAIleague - Your Workforce Intelligence Platform',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="text-align: center; padding: 30px 0; background: linear-gradient(135deg, #2563eb 0%, #7c3aed 100%); border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to CoAIleague!</h1>
          <p style="color: #e0e7ff; margin: 10px 0 0 0;">AI-Powered Workforce Intelligence</p>
        </div>
        <div style="padding: 30px; background-color: #f9fafb; border-radius: 0 0 8px 8px;">
          <p style="font-size: 16px;">Hello ${data.firstName},</p>
          <p>Welcome to CoAIleague! We're excited to have you join our platform. Your account is now active and ready for you to explore.</p>
          
          <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 25px 0; border: 1px solid #e5e7eb;">
            <h3 style="color: #1f2937; margin: 0 0 15px 0;">Meet Trinity - Your AI Assistant</h3>
            <p style="margin: 0; color: #4b5563;">Look for the twin-star mascot in the corner of your screen. Trinity is your intelligent guide who will help you navigate the platform, answer questions, and provide personalized recommendations.</p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${data.onboardingUrl}" 
               style="background-color: #2563eb; color: white; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block; font-size: 16px;">
              Start Your Onboarding
            </a>
          </div>
          
          <p style="color: #6b7280; font-size: 14px; margin-top: 30px; text-align: center;">
            Need help? Chat with Trinity or contact our support team anytime.<br>
            This is an automated welcome from CoAIleague.
          </p>
        </div>
      </div>
    `
  }),

  employeeInvitation: (data: {
    firstName: string;
    inviterName: string;
    workspaceName: string;
    roleName: string;
    joinUrl: string;
    expiresIn: string;
  }) => ({
    subject: `You're Invited to Join ${data.workspaceName} on CoAIleague`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">You've Been Invited!</h2>
        <p>Hello ${data.firstName},</p>
        <p><strong>${data.inviterName}</strong> has invited you to join <strong>${data.workspaceName}</strong> on CoAIleague as a <strong>${data.roleName}</strong>.</p>
        
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 5px 0;"><strong>Organization:</strong> ${data.workspaceName}</p>
          <p style="margin: 5px 0;"><strong>Your Role:</strong> ${data.roleName}</p>
          <p style="margin: 5px 0;"><strong>Invited By:</strong> ${data.inviterName}</p>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${data.joinUrl}" 
             style="background-color: #16a34a; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">
            Accept Invitation & Join
          </a>
        </div>
        
        <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
          <p style="margin: 0; font-size: 14px; color: #92400e;">
            <strong>Note:</strong> This invitation expires in ${data.expiresIn}. Please accept before it expires.
          </p>
        </div>
        
        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
          If you did not expect this invitation or have questions, please contact ${data.inviterName} directly.<br>
          This is an automated invitation from CoAIleague.
        </p>
      </div>
    `
  }),

  supportRoleBriefing: (data: {
    firstName: string;
    roleName: string;
    dashboardUrl: string;
    capabilities: string[];
  }) => ({
    subject: `Your CoAIleague Support Role: ${data.roleName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #7c3aed; padding: 20px; border-radius: 8px 8px 0 0;">
          <h2 style="color: white; margin: 0;">Support Team Role Assignment</h2>
        </div>
        <div style="padding: 25px; background-color: #faf5ff; border-radius: 0 0 8px 8px;">
          <p>Hello ${data.firstName},</p>
          <p>You have been assigned the <strong>${data.roleName}</strong> role in the CoAIleague support system. This gives you access to platform-wide support tools and capabilities.</p>
          
          <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e9d5ff;">
            <h3 style="color: #7c3aed; margin: 0 0 15px 0;">Your Capabilities:</h3>
            <ul style="margin: 0; padding-left: 20px; color: #4b5563;">
              ${data.capabilities.map(cap => `<li style="margin: 8px 0;">${cap}</li>`).join('')}
            </ul>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${data.dashboardUrl}" 
               style="background-color: #7c3aed; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">
              Access Support Dashboard
            </a>
          </div>
          
          <div style="background-color: #f3e8ff; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; font-size: 14px; color: #6b21a8;">
              <strong>Tip:</strong> Use HelpAI chat to get AI-powered assistance with support tickets and user inquiries.
            </p>
          </div>
          
          <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
            This is an automated notification from CoAIleague Platform Administration.
          </p>
        </div>
      </div>
    `
  }),

  onboardingComplete: (data: {
    firstName: string;
    workspaceName: string;
    dashboardUrl: string;
    completedTasks: number;
  }) => ({
    subject: `Onboarding Complete - Welcome to ${data.workspaceName}!`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="text-align: center; padding: 30px 0; background: linear-gradient(135deg, #16a34a 0%, #22c55e 100%); border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 32px;">Congratulations!</h1>
          <p style="color: #dcfce7; margin: 10px 0 0 0; font-size: 18px;">You've completed your onboarding</p>
        </div>
        <div style="padding: 30px; background-color: #f0fdf4; border-radius: 0 0 8px 8px;">
          <p style="font-size: 16px;">Hello ${data.firstName},</p>
          <p>You've successfully completed all ${data.completedTasks} onboarding tasks for <strong>${data.workspaceName}</strong>. You're now ready to use all the features of CoAIleague!</p>
          
          <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 25px 0; border: 1px solid #bbf7d0; text-align: center;">
            <p style="font-size: 48px; margin: 0;">&#127881;</p>
            <h3 style="color: #15803d; margin: 10px 0;">All Set!</h3>
            <p style="margin: 0; color: #4b5563;">Your account is fully configured and ready to go.</p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${data.dashboardUrl}" 
               style="background-color: #16a34a; color: white; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block; font-size: 16px;">
              Go to Dashboard
            </a>
          </div>
          
          <p style="color: #6b7280; font-size: 14px; margin-top: 30px; text-align: center;">
            Need help? Trinity is always available to assist you.<br>
            This is an automated message from CoAIleague.
          </p>
        </div>
      </div>
    `
  }),

  /**
   * ORGANIZATION INVITATION TEMPLATE
   * Premium template for inviting new organizations to join CoAIleague
   * Includes Trinity AI assistant introduction and data migration options
   */
  organizationInvitation: (data: {
    recipientName: string;
    recipientEmail: string;
    inviterName: string;
    inviterCompany?: string;
    organizationName: string;
    welcomeUrl: string;
    inviteToken: string;
    expiresIn: string;
    migrationFeatures: string[];
  }) => ({
    subject: `You're Invited to Join CoAIleague - AI-Powered Workforce Intelligence`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9fafb;">
        <!-- Header with gradient -->
        <div style="text-align: center; padding: 40px 30px; background: linear-gradient(135deg, #2563eb 0%, #7c3aed 50%, #ec4899 100%); border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 32px; font-weight: 700;">Welcome to CoAIleague</h1>
          <p style="color: #e0e7ff; margin: 15px 0 0 0; font-size: 18px;">AI-Powered Workforce Intelligence Platform</p>
          <div style="margin-top: 20px;">
            <span style="background: rgba(255,255,255,0.2); color: white; padding: 8px 16px; border-radius: 20px; font-size: 14px;">
              Powered by Gemini 3 Pro AI Brain
            </span>
          </div>
        </div>
        
        <!-- Main content -->
        <div style="padding: 40px 30px; background-color: white;">
          <p style="font-size: 18px; color: #1f2937;">Hello ${data.recipientName},</p>
          
          <p style="font-size: 16px; color: #4b5563; line-height: 1.6;">
            <strong>${data.inviterName}</strong>${data.inviterCompany ? ` from <strong>${data.inviterCompany}</strong>` : ''} 
            has invited you to set up <strong>${data.organizationName}</strong> on CoAIleague, 
            the next-generation workforce management platform powered by AI.
          </p>
          
          <!-- Trinity Introduction Box -->
          <div style="background: linear-gradient(135deg, #f0f9ff 0%, #f5f3ff 100%); padding: 25px; border-radius: 12px; margin: 30px 0; border: 1px solid #c7d2fe;">
            <div style="display: flex; align-items: center; margin-bottom: 15px;">
              <div style="font-size: 36px; margin-right: 15px;">&#11088;&#11088;</div>
              <div>
                <h3 style="color: #4338ca; margin: 0; font-size: 20px;">Meet Trinity - Your AI Assistant</h3>
                <p style="color: #6366f1; margin: 5px 0 0 0; font-size: 14px;">Powered by Gemini 3 Pro</p>
              </div>
            </div>
            <p style="color: #4b5563; margin: 0; font-size: 15px; line-height: 1.5;">
              Trinity is your dedicated AI assistant that operates exclusively within your organization. 
              Trinity will guide you through setup, answer questions, and help optimize your workforce operations 
              with intelligent recommendations.
            </p>
          </div>
          
          <!-- CTA Button -->
          <div style="text-align: center; margin: 40px 0;">
            <a href="${data.welcomeUrl}?token=${data.inviteToken}" 
               style="background: linear-gradient(135deg, #2563eb 0%, #7c3aed 100%); color: white; padding: 18px 48px; text-decoration: none; border-radius: 10px; font-weight: 700; display: inline-block; font-size: 18px; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4);">
              Start Your Organization Setup
            </a>
          </div>
          
          <!-- What's included section -->
          <div style="background-color: #f9fafb; padding: 25px; border-radius: 12px; margin: 30px 0;">
            <h3 style="color: #1f2937; margin: 0 0 20px 0; font-size: 18px;">What You Can Migrate & Set Up:</h3>
            <ul style="margin: 0; padding: 0; list-style: none;">
              ${data.migrationFeatures.map(feature => `
                <li style="padding: 10px 0; border-bottom: 1px solid #e5e7eb; color: #4b5563; font-size: 15px;">
                  <span style="color: #16a34a; margin-right: 10px;">&#10003;</span> ${feature}
                </li>
              `).join('')}
            </ul>
          </div>
          
          <!-- Automation unlock teaser -->
          <div style="background: linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%); padding: 20px; border-radius: 10px; margin: 25px 0; border-left: 4px solid #16a34a;">
            <h4 style="color: #15803d; margin: 0 0 10px 0;">Unlock AI Automation</h4>
            <p style="color: #166534; margin: 0; font-size: 14px; line-height: 1.5;">
              Complete your setup and gamification challenges to unlock powerful AI automation features 
              including smart scheduling, payroll auto-calculation, and compliance monitoring.
            </p>
          </div>
          
          <!-- Expiration notice -->
          <div style="background-color: #fef3c7; padding: 15px 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #f59e0b;">
            <p style="margin: 0; font-size: 14px; color: #92400e;">
              <strong>Note:</strong> This invitation expires in <strong>${data.expiresIn}</strong>. Please accept before it expires.
            </p>
          </div>
        </div>
        
        <!-- Footer -->
        <div style="padding: 25px 30px; background-color: #f3f4f6; border-radius: 0 0 8px 8px; text-align: center;">
          <p style="color: #6b7280; font-size: 14px; margin: 0 0 10px 0;">
            Questions? Chat with Trinity once you sign up, or contact ${data.inviterName} directly.
          </p>
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">
            This invitation was sent to ${data.recipientEmail} by CoAIleague Platform.<br>
            If you did not expect this invitation, you can safely ignore this email.
          </p>
        </div>
      </div>
    `
  }),

  assistedOnboardingHandoff: (data: {
    recipientName: string;
    workspaceName: string;
    handoffUrl: string;
    expiresAt: string;
    supportTeamNote?: string;
  }) => ({
    subject: `Your ${data.workspaceName} Organization is Ready - CoAIleague`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9fafb;">
        <!-- Header with gradient -->
        <div style="text-align: center; padding: 40px 30px; background: linear-gradient(135deg, #16a34a 0%, #2563eb 100%); border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700;">Your Organization is Ready!</h1>
          <p style="color: #e0e7ff; margin: 15px 0 0 0; font-size: 16px;">Our support team has set everything up for you</p>
        </div>
        
        <!-- Main content -->
        <div style="padding: 40px 30px; background-color: white;">
          <p style="font-size: 18px; color: #1f2937;">Hello ${data.recipientName},</p>
          
          <p style="font-size: 16px; color: #4b5563; line-height: 1.6;">
            Great news! Our support team has finished setting up <strong>${data.workspaceName}</strong> on CoAIleague for you. 
            Your organization is fully configured and ready for you to take ownership.
          </p>
          
          <!-- What's been done box -->
          <div style="background: linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%); padding: 25px; border-radius: 12px; margin: 30px 0; border: 1px solid #86efac;">
            <h3 style="color: #15803d; margin: 0 0 15px 0; font-size: 18px;">What We've Set Up For You:</h3>
            <ul style="margin: 0; padding: 0 0 0 20px; color: #166534; font-size: 15px; line-height: 1.8;">
              <li>Your organization account with all basic settings</li>
              <li>Industry-specific configuration and templates</li>
              <li>AI-extracted data from your documents (if provided)</li>
              <li>Trinity AI assistant ready to help you</li>
            </ul>
          </div>
          
          ${data.supportTeamNote ? `
          <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #6b7280;">
            <p style="margin: 0; font-size: 14px; color: #4b5563;">
              <strong>Note from Support:</strong> ${data.supportTeamNote}
            </p>
          </div>
          ` : ''}
          
          <!-- CTA Button -->
          <div style="text-align: center; margin: 40px 0;">
            <a href="${data.handoffUrl}" 
               style="background: linear-gradient(135deg, #16a34a 0%, #22c55e 100%); color: white; padding: 18px 48px; text-decoration: none; border-radius: 10px; font-weight: 700; display: inline-block; font-size: 18px; box-shadow: 0 4px 14px rgba(22, 163, 74, 0.4);">
              Claim Your Organization
            </a>
          </div>
          
          <!-- Security notice -->
          <div style="background-color: #fef3c7; padding: 15px 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #f59e0b;">
            <p style="margin: 0; font-size: 14px; color: #92400e;">
              <strong>Security Notice:</strong> This link expires on <strong>${data.expiresAt}</strong>. 
              After claiming your organization, you'll become the owner with full administrative access.
            </p>
          </div>
          
          <!-- What happens next -->
          <div style="background-color: #f9fafb; padding: 25px; border-radius: 12px; margin: 30px 0;">
            <h3 style="color: #1f2937; margin: 0 0 15px 0; font-size: 16px;">What Happens Next?</h3>
            <ol style="margin: 0; padding: 0 0 0 20px; color: #4b5563; font-size: 14px; line-height: 1.8;">
              <li>Click the button above to claim your organization</li>
              <li>Sign in or create your CoAIleague account</li>
              <li>Review your organization settings and make any adjustments</li>
              <li>Start using CoAIleague to manage your workforce!</li>
            </ol>
          </div>
        </div>
        
        <!-- Footer -->
        <div style="padding: 25px 30px; background-color: #f3f4f6; border-radius: 0 0 8px 8px; text-align: center;">
          <p style="color: #6b7280; font-size: 14px; margin: 0 0 10px 0;">
            Questions? Reply to this email or chat with Trinity once you're logged in.
          </p>
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">
            This email was sent by CoAIleague Support Team.<br>
            If you did not request this organization setup, please contact support immediately.
          </p>
        </div>
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

interface EmailRetryJob {
  id: string;
  eventId: string;
  recipientEmail: string;
  subject: string;
  html: string;
  emailType: string;
  workspaceId?: string;
  userId?: string;
  retryCount: number;
  nextRetryAt: Date;
  createdAt: Date;
}

export class EmailService {
  private retryQueue: Map<string, EmailRetryJob> = new Map();
  private retryCheckInterval: NodeJS.Timeout | null = null;
  
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
   * Calculate next retry time with exponential backoff
   * Retry attempt 1: 30 seconds, 2: 5 mins, 3: 30 mins, 4: 2 hours, 5: 24 hours
   */
  private getNextRetryTime(retryCount: number): Date {
    const backoffMs = [
      30 * 1000,        // Attempt 1: 30 seconds
      5 * 60 * 1000,    // Attempt 2: 5 minutes
      30 * 60 * 1000,   // Attempt 3: 30 minutes
      2 * 60 * 60 * 1000, // Attempt 4: 2 hours
      24 * 60 * 60 * 1000, // Attempt 5: 24 hours
    ];
    
    const delayMs = backoffMs[Math.min(retryCount, backoffMs.length - 1)];
    return new Date(Date.now() + delayMs);
  }

  /**
   * Add email to retry queue
   */
  private addToRetryQueue(
    eventId: string,
    to: string,
    subject: string,
    html: string,
    emailType: string,
    workspaceId?: string,
    userId?: string,
    retryCount: number = 0
  ): void {
    const retryJobId = `${eventId}-retry-${retryCount}`;
    const job: EmailRetryJob = {
      id: retryJobId,
      eventId,
      recipientEmail: to,
      subject,
      html,
      emailType,
      workspaceId,
      userId,
      retryCount,
      nextRetryAt: this.getNextRetryTime(retryCount),
      createdAt: new Date(),
    };
    
    this.retryQueue.set(retryJobId, job);
    console.log(`[EmailService] Added to retry queue: ${emailType} to ${to} (retry ${retryCount + 1}/5)`);
  }

  /**
   * Process retry queue - check for jobs that should be retried
   */
  private async processRetryQueue(): Promise<void> {
    const now = new Date();
    const jobsToRetry = Array.from(this.retryQueue.values()).filter(job => job.nextRetryAt <= now);
    
    if (jobsToRetry.length === 0) return;
    
    console.log(`[EmailService] Processing ${jobsToRetry.length} retry jobs...`);
    
    for (const job of jobsToRetry) {
      if (job.retryCount >= 5) {
        // Max retries exceeded - mark as permanently failed
        await this.updateEmailEvent(
          job.eventId,
          'failed',
          undefined,
          `Failed after 5 retry attempts`
        );
        this.retryQueue.delete(job.id);
        console.warn(`[EmailService] Max retries exceeded: ${job.emailType} to ${job.recipientEmail}`);
        continue;
      }
      
      // Attempt to resend
      try {
        const { client, fromEmail } = await getUncachableResendClient();
        const result = await client.emails.send({
          from: fromEmail,
          to: job.recipientEmail,
          subject: job.subject,
          html: job.html,
        });
        
        // Success - update log and remove from queue
        await this.updateEmailEvent(job.eventId, 'sent', result.data?.id);
        this.retryQueue.delete(job.id);
        console.log(`[EmailService] Retry successful: ${job.emailType} to ${job.recipientEmail}`);
      } catch (error: any) {
        // Schedule next retry
        job.retryCount++;
        job.nextRetryAt = this.getNextRetryTime(job.retryCount);
        console.warn(`[EmailService] Retry failed: ${job.emailType} to ${job.recipientEmail}, next attempt: ${job.nextRetryAt}`);
      }
    }
  }

  /**
   * Initialize retry queue processor
   */
  startRetryProcessor(): void {
    if (this.retryCheckInterval) return;
    
    // Check retry queue every 60 seconds
    this.retryCheckInterval = setInterval(() => {
      this.processRetryQueue().catch(error => {
        console.error('[EmailService] Error processing retry queue:', error);
      });
    }, 60 * 1000);
    
    console.log('[EmailService] Email retry processor started (checks every 60s)');
  }

  /**
   * Stop retry queue processor
   */
  stopRetryProcessor(): void {
    if (this.retryCheckInterval) {
      clearInterval(this.retryCheckInterval);
      this.retryCheckInterval = null;
      console.log('[EmailService] Email retry processor stopped');
    }
  }

  /**
   * Send email via Resend with audit logging and automatic retry on failure
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
      
      // Log initial failure
      await this.updateEmailEvent(eventId, 'failed', undefined, errorMessage);
      
      // Add to retry queue for automatic retry
      this.addToRetryQueue(eventId, to, subject, html, emailType, workspaceId, userId, 0);

      console.error(`[EmailService] Email failed (will retry): ${emailType} to ${to}`, errorMessage);

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
      workspaceName: workspaceName || 'CoAIleague',
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
      workspaceName: workspaceName || 'CoAIleague',
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

  /**
   * Send client welcome email
   * Sent when a new client is created with portal access
   */
  async sendClientWelcomeEmail(
    workspaceId: string,
    clientId: string,
    email: string,
    clientName: string,
    companyName: string,
    workspaceName: string,
  ): Promise<EmailResult> {
    const portalUrl = `${getAppBaseUrl()}/client-portal`;
    
    const template = emailTemplates.clientWelcome({
      clientName,
      companyName: companyName || 'Your Organization',
      workspaceName: workspaceName || 'Our Team',
      portalUrl,
    });

    return this.sendEmail(
      email,
      template.subject,
      template.html,
      'client_welcome',
      workspaceId,
      undefined
    );
  }

  /**
   * Send new member welcome email
   * Sent when a user first signs up for the platform
   */
  async sendNewMemberWelcome(
    userId: string,
    email: string,
    firstName: string
  ): Promise<EmailResult> {
    const onboardingUrl = `${getAppBaseUrl()}/onboarding`;
    
    const template = emailTemplates.newMemberWelcome({
      firstName: firstName || 'there',
      onboardingUrl,
    });

    return this.sendEmail(
      email,
      template.subject,
      template.html,
      'new_member_welcome',
      undefined,
      userId
    );
  }

  /**
   * Send employee invitation email
   * Sent when an employee is invited to join a workspace
   */
  async sendEmployeeInvitation(
    workspaceId: string,
    email: string,
    inviteToken: string,
    data: {
      firstName: string;
      inviterName: string;
      workspaceName: string;
      roleName: string;
      expiresInDays?: number;
    }
  ): Promise<EmailResult> {
    const joinUrl = `${getAppBaseUrl()}/accept-invite?token=${inviteToken}`;
    
    const template = emailTemplates.employeeInvitation({
      firstName: data.firstName || 'there',
      inviterName: data.inviterName,
      workspaceName: data.workspaceName,
      roleName: data.roleName || 'Team Member',
      joinUrl,
      expiresIn: `${data.expiresInDays || 7} days`,
    });

    return this.sendEmail(
      email,
      template.subject,
      template.html,
      'employee_invitation',
      workspaceId
    );
  }

  /**
   * Send support role briefing email
   * Sent when a user is assigned a platform support role
   */
  async sendSupportRoleBriefing(
    userId: string,
    email: string,
    firstName: string,
    roleName: string,
    capabilities: string[]
  ): Promise<EmailResult> {
    const dashboardUrl = `${getAppBaseUrl()}/platform-admin`;
    
    const template = emailTemplates.supportRoleBriefing({
      firstName: firstName || 'Support Team Member',
      roleName,
      dashboardUrl,
      capabilities,
    });

    return this.sendEmail(
      email,
      template.subject,
      template.html,
      'support_role_briefing',
      undefined,
      userId
    );
  }

  /**
   * Send onboarding completion celebration email
   * Sent when a user completes all onboarding tasks
   */
  async sendOnboardingComplete(
    workspaceId: string,
    userId: string,
    email: string,
    firstName: string,
    workspaceName: string,
    completedTasks: number
  ): Promise<EmailResult> {
    const dashboardUrl = `${getAppBaseUrl()}/dashboard`;
    
    const template = emailTemplates.onboardingComplete({
      firstName: firstName || 'there',
      workspaceName: workspaceName || 'Your Organization',
      dashboardUrl,
      completedTasks,
    });

    return this.sendEmail(
      email,
      template.subject,
      template.html,
      'onboarding_complete',
      workspaceId,
      userId
    );
  }

  /**
   * Send organization invitation email
   * Premium template for inviting new organizations with Trinity AI introduction
   */
  async sendOrganizationInvitation(params: {
    recipientEmail: string;
    recipientName: string;
    inviterName: string;
    inviterCompany?: string;
    organizationName: string;
    inviteToken: string;
    expiresInDays?: number;
    workspaceId?: string;
  }): Promise<EmailResult> {
    const welcomeUrl = `${getAppBaseUrl()}/welcome`;
    
    const migrationFeatures = [
      'Employee roster from PDF, Excel, or CSV files',
      'Team structures and departments',
      'Existing schedules and shift patterns',
      'Manual data entry with AI-assisted validation',
      'Gamification achievements and leaderboards',
      'AI automation unlocked progressively',
    ];
    
    const template = emailTemplates.organizationInvitation({
      recipientName: params.recipientName || 'there',
      recipientEmail: params.recipientEmail,
      inviterName: params.inviterName,
      inviterCompany: params.inviterCompany,
      organizationName: params.organizationName || 'Your Organization',
      welcomeUrl,
      inviteToken: params.inviteToken,
      expiresIn: `${params.expiresInDays || 7} days`,
      migrationFeatures,
    });

    return this.sendEmail(
      params.recipientEmail,
      template.subject,
      template.html,
      'organization_invitation',
      params.workspaceId
    );
  }

  /**
   * Send assisted onboarding handoff email
   * Sent when support staff has completed setting up an organization for a user
   */
  async sendAssistedOnboardingHandoff(params: {
    toEmail: string;
    toName: string;
    workspaceName: string;
    handoffToken: string;
    expiresAt: Date;
    supportNote?: string;
  }): Promise<EmailResult> {
    const handoffUrl = `${getAppBaseUrl()}/accept-handoff?token=${params.handoffToken}`;
    
    const template = emailTemplates.assistedOnboardingHandoff({
      recipientName: params.toName || 'there',
      workspaceName: params.workspaceName,
      handoffUrl,
      expiresAt: params.expiresAt.toLocaleDateString('en-US', { 
        weekday: 'long',
        year: 'numeric',
        month: 'long', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      supportTeamNote: params.supportNote,
    });

    return this.sendEmail(
      params.toEmail,
      template.subject,
      template.html,
      'assisted_onboarding_handoff'
    );
  }
}

// Export singleton instance
export const emailService = new EmailService();

/**
 * Helper function for sending assisted onboarding handoff emails
 * Used by AssistedOnboardingService
 */
export async function sendAssistedOnboardingHandoff(params: {
  toEmail: string;
  toName: string;
  workspaceName: string;
  handoffToken: string;
  expiresAt: Date;
  supportNote?: string;
}): Promise<{ success: boolean; error?: string }> {
  return emailService.sendAssistedOnboardingHandoff(params);
}

/**
 * Automation email templates
 */
const automationEmailTemplates = {
  approval_required: (data: {
    firstName: string;
    domain: string;
    actionType: string;
    affectedRecords: number;
    approvalUrl: string;
  }) => ({
    subject: `Action Required: ${data.domain.charAt(0).toUpperCase() + data.domain.slice(1)} Automation Needs Approval`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #f59e0b; padding: 20px; border-radius: 8px 8px 0 0;">
          <h2 style="color: white; margin: 0;">Automation Approval Required</h2>
        </div>
        <div style="padding: 25px; background-color: #fffbeb; border-radius: 0 0 8px 8px;">
          <p>Hello ${data.firstName},</p>
          <p>A <strong>${data.domain}</strong> automation action requires your approval before it can proceed.</p>
          
          <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #fcd34d;">
            <h3 style="color: #92400e; margin: 0 0 15px 0;">Action Details:</h3>
            <p style="margin: 5px 0;"><strong>Type:</strong> ${data.actionType}</p>
            <p style="margin: 5px 0;"><strong>Affected Records:</strong> ${data.affectedRecords}</p>
            <p style="margin: 5px 0;"><strong>Domain:</strong> ${data.domain.charAt(0).toUpperCase() + data.domain.slice(1)}</p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${data.approvalUrl}" 
               style="background-color: #16a34a; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block; margin-right: 10px;">
              Approve Action
            </a>
          </div>
          
          <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
            This automation was flagged for human review as part of CoAIleague's 99% automation / 1% oversight governance model.<br>
            This is an automated notification from CoAIleague Platform.
          </p>
        </div>
      </div>
    `
  }),

  hotpatch_scheduled: (data: {
    firstName: string;
    patchTitle: string;
    scheduledTime: string;
    affectedComponents: string[];
  }) => ({
    subject: `Scheduled Hotpatch: ${data.patchTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #7c3aed; padding: 20px; border-radius: 8px 8px 0 0;">
          <h2 style="color: white; margin: 0;">Hotpatch Scheduled</h2>
        </div>
        <div style="padding: 25px; background-color: #faf5ff; border-radius: 0 0 8px 8px;">
          <p>Hello ${data.firstName},</p>
          <p>A hotpatch has been scheduled for the CoAIleague platform.</p>
          
          <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e9d5ff;">
            <h3 style="color: #7c3aed; margin: 0 0 15px 0;">Patch Details:</h3>
            <p style="margin: 5px 0;"><strong>Title:</strong> ${data.patchTitle}</p>
            <p style="margin: 5px 0;"><strong>Scheduled Time:</strong> ${data.scheduledTime}</p>
            <p style="margin: 5px 0;"><strong>Affected Components:</strong></p>
            <ul style="margin: 5px 0; padding-left: 20px;">
              ${data.affectedComponents.map(c => `<li>${c}</li>`).join('')}
            </ul>
          </div>
          
          <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
            This patch is scheduled during the maintenance window (2:00 AM - 5:00 AM UTC).<br>
            This is an automated notification from CoAIleague Platform.
          </p>
        </div>
      </div>
    `
  }),
};

/**
 * Send automation-related emails
 * Used by Trinity Orchestration Governance service
 */
export async function sendAutomationEmail(params: {
  to: string;
  type: 'approval_required' | 'hotpatch_scheduled';
  data: any;
}): Promise<{ success: boolean; error?: string }> {
  const template = automationEmailTemplates[params.type];
  if (!template) {
    return { success: false, error: `Unknown automation email type: ${params.type}` };
  }

  const { subject, html } = template(params.data);
  return emailService.sendEmail(params.to, subject, html, `automation_${params.type}`);
}
