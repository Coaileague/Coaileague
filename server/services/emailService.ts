/**
 * CENTRALIZED EMAIL SERVICE
 * 
 * Unifies all email notifications across ${PLATFORM.name} with:
 * - Persistent audit trail (emailEvents table)
 * - Queue-compatible error handling
 * - Notification category abstraction
 * - Resend integration with proper error handling
 * - SIMULATION MODE for testing (logs instead of sending)
 */

import { db } from "../db";
import { emailEvents } from "@shared/schema";
import { eq } from "drizzle-orm";
// Reuse existing Resend client from email.ts (no duplication!)
// CAN-SPAM: Use sendCanSpamCompliantEmail for all outgoing emails
import { getUncachableResendClient, isResendConfigured, sendCanSpamCompliantEmail, isEmailUnsubscribed } from "./emailCore";
import { FEATURES, PLATFORM } from "@shared/platformConfig";
import { automationOrchestration } from "./orchestration/automationOrchestration";
import { getAppBaseUrl } from "../utils/getAppBaseUrl";
import { isProduction } from "../lib/isProduction";

import { createLogger } from '../lib/logger';
const log = createLogger('emailService');

// ============================================================================
// EMAIL TEMPLATES
// ============================================================================
import {
    emailLayout, emailHeader, emailFooter,
    greeting, para, infoCard, alertBox, stepList, checkList,
    ctaButton, divider, sectionHeading, passwordResetSteps, B,
  } from './emailTemplateBase';

  const emailTemplates = {
    /**
     * ACCOUNT VERIFICATION
     */
    verification: (data: { firstName: string; verificationUrl: string }) => ({
      subject: `Verify Your ${PLATFORM.name} Account`,
      html: emailLayout({
        preheader: `Please verify your email address to activate your ${PLATFORM.name} account.`,
        header: emailHeader({ title: 'Verify Your Email', subtitle: 'One quick step to activate your account', badge: 'Account Security', theme: 'blue' }),
        body:
          greeting(data.firstName || 'there') +
          para(`Thank you for signing up for ${PLATFORM.name}! To activate your account, please verify your email address.`) +
          '<table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:28px 0;"><tr><td align="center">' +
          ctaButton({ text: 'Verify Email Address', url: data.verificationUrl }) +
          '</td></tr></table>' +
          alertBox({ type: 'info', title: 'Link expires in 24 hours', body: 'For security, this link is only valid for 24 hours. If it expires, you can request a new one from the login page.' }) +
          para(`If you did not create a ${PLATFORM.name} account, you can safely ignore this email.`, { muted: true, small: true }),
      }),
    }),

    /**
     * PASSWORD RESET
     */
    passwordReset: (data: { firstName: string; resetUrl: string }) => ({
      subject: `Reset Your ${PLATFORM.name} Password`,
      html: emailLayout({
        preheader: 'We received a request to reset your password. Click below to create a new one.',
        header: emailHeader({ title: 'Password Reset Request', subtitle: 'Secure link to set a new password', badge: 'Security', theme: 'blue' }),
        body:
          greeting(data.firstName || 'there') +
          para(`We received a request to reset the password for your ${PLATFORM.name} account. Follow the steps below to set a new password.`) +
          passwordResetSteps() +
          '<table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:28px 0;"><tr><td align="center">' +
          ctaButton({ text: 'Reset My Password', url: data.resetUrl }) +
          '</td></tr></table>' +
          alertBox({ type: 'danger', title: 'Did not request this?', body: 'If you did not request a password reset, your account may be at risk. Please sign in and change your password immediately, or contact support.' }) +
          para('This link will expire in <strong>1 hour</strong> for your security.', { muted: true, small: true }),
      }),
    }),

    /**
     * SUPPORT TICKET CONFIRMATION
     */
    supportTicketConfirmation: (data: { name: string; ticketNumber: string; subject: string }) => ({
      subject: `Support Ticket Created — ${data.ticketNumber}`,
      html: emailLayout({
        preheader: `Your support request ${data.ticketNumber} has been received.`,
        header: emailHeader({ title: 'Support Request Received', subtitle: 'Your ticket has been logged', badge: 'Support', theme: 'purple' }),
        body:
          greeting(data.name || 'there') +
          para(`Thank you for contacting ${PLATFORM.name} Support. Your request has been received and our team will respond as soon as possible.`) +
          infoCard({
            title: 'Ticket Details',
            rows: [
              { label: 'Ticket Number', value: data.ticketNumber, highlight: true },
              { label: 'Subject', value: data.subject },
              { label: 'Status', value: 'Open — Awaiting Review' },
            ],
          }) +
          alertBox({ type: 'info', title: 'Save your ticket number', body: `Reference <strong>${data.ticketNumber}</strong> when following up. You can check status via Live Chat in the platform.` }) +
          para('Our support team typically responds within 1 business day.', { muted: true }),
      }),
    }),

    /**
     * SIMPLE REPORT DELIVERY
     */
    reportDelivery: (data: { clientName: string; reportNumber: string; reportTitle: string }) => ({
      subject: `Report Ready — ${data.reportNumber}`,
      html: emailLayout({
        preheader: `Your report "${data.reportTitle}" is ready for review.`,
        header: emailHeader({ title: 'Report Ready for Review', subtitle: 'A new report has been completed', badge: 'Reports', theme: 'blue' }),
        body:
          greeting(data.clientName || 'there') +
          para('A new report has been completed and is ready for your review in the portal.') +
          infoCard({
            rows: [
              { label: 'Report Number', value: data.reportNumber, highlight: true },
              { label: 'Title', value: data.reportTitle },
            ],
          }) +
          para(`Please log in to your ${PLATFORM.name} portal to view the full report and download a copy.`, { muted: true }),
      }),
    }),

    /**
     * EMPLOYEE TEMPORARY PASSWORD
     */
    employeeTemporaryPassword: (data: {
      firstName: string;
      email: string;
      tempPassword: string;
      workspaceName: string;
    }) => ({
      subject: `Your ${PLATFORM.name} Account — Login Credentials`,
      html: emailLayout({
        preheader: `Welcome to ${data.workspaceName || PLATFORM.name}! Your temporary login credentials are inside.`,
        header: emailHeader({ title: `Welcome to ${data.workspaceName || PLATFORM.name}`, subtitle: 'Your account has been created', badge: 'Account Created', theme: 'blue' }),
        body:
          greeting(data.firstName || 'there') +
          para(`Your ${PLATFORM.name} account has been created for <strong>${data.workspaceName || 'your organization'}</strong>. Use the credentials below to sign in for the first time.`) +
          infoCard({
            title: 'Your Login Credentials',
            rows: [
              { label: 'Email', value: data.email },
              { label: 'Temporary Password', value: data.tempPassword, highlight: true },
            ],
          }) +
          alertBox({ type: 'warning', title: 'You must change your password on first login', body: 'For your security, you will be required to set a new permanent password immediately after your first sign-in.' }) +
          stepList([
            { title: `Open the ${PLATFORM.name} login page` },
            { title: 'Enter your email and the temporary password above' },
            { title: 'Follow the prompts to create a new secure password' },
            { title: 'Sign in with your new password going forward' },
          ]) +
          para('If you did not expect this email, contact your manager or support immediately.', { muted: true, small: true }),
      }),
    }),

    /**
     * MANAGER ONBOARDING NOTIFICATION
     */
    managerOnboardingNotification: (data: {
      managerName: string;
      employeeName: string;
      workspaceName: string;
    }) => ({
      subject: `New Employee Added — ${data.employeeName || 'New Hire'}`,
      html: emailLayout({
        preheader: `${data.employeeName || 'A new employee'} has been added to your team and is ready for onboarding.`,
        header: emailHeader({ title: 'New Employee Onboarding', subtitle: 'Action may be required from you', badge: 'HR Notification', theme: 'blue' }),
        body:
          greeting(data.managerName || 'there') +
          para(`A new employee has been added to your team on ${PLATFORM.name} and is ready to begin onboarding.`) +
          infoCard({
            rows: [
              { label: 'Employee', value: data.employeeName || 'New Hire', highlight: true },
              { label: 'Workspace', value: data.workspaceName || 'Your Workspace' },
              { label: 'Status', value: 'Onboarding Pending' },
            ],
          }) +
          checkList([
            'Ensure the employee has received their login credentials',
            'Assign the employee to their first shift',
            'Review any outstanding onboarding documents',
            'Confirm system access is properly configured',
          ]) +
          para(`Log in to your ${PLATFORM.name} dashboard to complete any pending onboarding tasks.`, { muted: true }),
      }),
    }),

    /**
     * CLIENT WELCOME
     */
    clientWelcome: (data: {
      clientName: string;
      companyName: string;
      workspaceName: string;
      portalUrl: string;
    }) => ({
      subject: `Welcome to ${data.workspaceName || PLATFORM.name} — Client Portal Access`,
      html: emailLayout({
        preheader: `Your client portal is ready. Access invoices, reports, and communicate with your team.`,
        header: emailHeader({ title: `Welcome, ${data.clientName || 'there'}!`, subtitle: `Your client account with ${data.workspaceName || 'our team'} is ready`, badge: 'Client Portal', theme: 'blue' }),
        body:
          greeting(data.clientName || 'there') +
          para(`Thank you for working with <strong>${data.workspaceName || 'our team'}</strong>! Your client account has been set up and your portal is ready.`) +
          infoCard({
            rows: [
              { label: 'Organization', value: data.companyName || 'Your Organization' },
              { label: 'Service Provider', value: data.workspaceName || PLATFORM.name },
              { label: 'Portal Status', value: 'Active', highlight: true },
            ],
          }) +
          sectionHeading('Through your portal you can:') +
          checkList([
            'View and approve timesheets in real time',
            'Access invoices and full payment history',
            'Review operational reports and analytics',
            'Communicate directly with your service team',
            'Request changes, file complaints, and manage your engagement',
          ]) +
          '<table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:28px 0;"><tr><td align="center">' +
          ctaButton({ text: 'Access Your Client Portal', url: data.portalUrl }) +
          '</td></tr></table>' +
          para('Questions? Use the Help Chat inside your portal.', { muted: true, small: true }),
      }),
    }),

    /**
     * NEW MEMBER WELCOME
     */
    newMemberWelcome: (data: { firstName: string; onboardingUrl: string }) => ({
      subject: `Welcome to ${PLATFORM.name} — Your Workforce Intelligence Platform`,
      html: emailLayout({
        preheader: 'Your account is ready. Start your onboarding and meet Trinity, your AI assistant.',
        header: emailHeader({ title: `Welcome, ${data.firstName || 'there'}!`, subtitle: 'Your account is active and ready to explore', badge: 'Platform Access', theme: 'blue' }),
        body:
          greeting(data.firstName || 'there') +
          para(`Welcome to ${PLATFORM.name}! Your account is now active. We are excited to have you on the platform.`) +
          alertBox({
            type: 'purple',
            title: 'Meet Trinity — Your AI Co-Pilot',
            body: 'Look for the <strong>&#9670; icon</strong> in the corner of your screen. Trinity is your AI assistant — ready to help you navigate, answer questions, and surface insights about your workforce. All AI-generated outputs should be reviewed by your team before acting on them.',
          }) +
          sectionHeading('What you can do next:') +
          checkList([
            'Complete your onboarding profile',
            'Review your assigned workspace and role',
            'Explore your dashboard and analytics',
            'Ask Trinity anything — it knows your organization',
          ]) +
          '<table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:28px 0;"><tr><td align="center">' +
          ctaButton({ text: 'Start Your Onboarding', url: data.onboardingUrl }) +
          '</td></tr></table>' +
          para('Need help? Chat with Trinity or reach out to support — we are here for you.', { muted: true, small: true }),
      }),
    }),

    /**
     * EMPLOYEE INVITATION
     */
    employeeInvitation: (data: {
      firstName: string;
      inviterName: string;
      workspaceName: string;
      roleName: string;
      joinUrl: string;
      expiresIn: string;
    }) => ({
      subject: `You're Invited to Join ${data.workspaceName || PLATFORM.name}`,
      html: emailLayout({
        preheader: `${data.inviterName || 'Someone'} has invited you to join ${data.workspaceName || 'their team'} as a ${data.roleName || 'member'}.`,
        header: emailHeader({ title: 'You Have Been Invited!', subtitle: `Join ${data.workspaceName || PLATFORM.name}`, badge: 'Team Invitation', theme: 'blue' }),
        body:
          greeting(data.firstName || 'there') +
          para(`<strong>${data.inviterName || 'A manager'}</strong> has invited you to join <strong>${data.workspaceName || 'their team'}</strong> on ${PLATFORM.name} as a <strong>${data.roleName || 'member'}</strong>.`) +
          infoCard({
            rows: [
              { label: 'Organization', value: data.workspaceName || 'Your Workspace', highlight: true },
              { label: 'Your Role', value: data.roleName || 'Member' },
              { label: 'Invited By', value: data.inviterName || 'Manager' },
            ],
          }) +
          '<table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:28px 0;"><tr><td align="center">' +
          ctaButton({ text: 'Accept Invitation &amp; Join', url: data.joinUrl, style: 'success' }) +
          '</td></tr></table>' +
          alertBox({ type: 'warning', title: `Invitation expires in ${data.expiresIn || '24 hours'}`, body: 'If the link expires, ask the person who invited you to send a new one.' }) +
          para(`If you did not expect this invitation, contact <strong>${data.inviterName || 'your manager'}</strong> directly.`, { muted: true, small: true }),
      }),
    }),

    /**
     * SUPPORT ROLE BRIEFING
     */
    supportRoleBriefing: (data: {
      firstName: string;
      roleName: string;
      dashboardUrl: string;
      capabilities: string[];
    }) => ({
      subject: `Your ${PLATFORM.name} Support Role: ${data.roleName || 'Support Agent'}`,
      html: emailLayout({
        preheader: `You have been assigned the ${data.roleName || 'Support'} role. Your support tools are ready.`,
        header: emailHeader({ title: 'Support Role Assignment', subtitle: `You have been granted ${data.roleName || 'Support'} access`, badge: 'Platform Staff', theme: 'purple' }),
        body:
          greeting(data.firstName || 'there') +
          para(`You have been assigned the <strong>${data.roleName || 'Support'}</strong> role in the ${PLATFORM.name} support system, giving you access to platform-wide support tools.`) +
          sectionHeading('Your Capabilities:') +
          checkList(data.capabilities, '#7c3aed') +
          '<table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:28px 0;"><tr><td align="center">' +
          ctaButton({ text: 'Access Support Dashboard', url: data.dashboardUrl, style: 'purple' }) +
          '</td></tr></table>' +
          alertBox({ type: 'purple', title: 'Pro Tip', body: 'Use the HelpAI chat interface for AI-powered assistance with support tickets, user inquiries, and platform diagnostics.' }) +
          para(`This is an automated notification from ${PLATFORM.name} Platform Administration.`, { muted: true, small: true }),
      }),
    }),

    /**
     * ONBOARDING COMPLETE
     */
    onboardingComplete: (data: {
      firstName: string;
      workspaceName: string;
      dashboardUrl: string;
      completedTasks: number;
    }) => ({
      subject: `Onboarding Complete — Welcome to ${data.workspaceName || PLATFORM.name}!`,
      html: emailLayout({
        preheader: `You have completed all onboarding tasks for ${data.workspaceName || 'your workspace'}. Your account is fully configured.`,
        header: emailHeader({ title: 'Onboarding Complete!', subtitle: `You are fully set up on ${data.workspaceName || 'your workspace'}`, badge: 'All Steps Done', theme: 'green' }),
        body:
          greeting(data.firstName || 'there') +
          para(`Congratulations! You have successfully completed all <strong>${data.completedTasks || 0} onboarding tasks</strong> for <strong>${data.workspaceName || 'your workspace'}</strong>. Your account is fully configured.`) +
          alertBox({ type: 'success', title: 'Account fully activated', body: 'All required information has been submitted and your profile is complete. You have full access to the platform.' }) +
          sectionHeading('You are ready to:') +
          checkList([
            'View and manage your upcoming shifts',
            'Track your time entries and pay records',
            'Access company communications and announcements',
            'Chat with Trinity for instant answers',
          ]) +
          '<table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:28px 0;"><tr><td align="center">' +
          ctaButton({ text: 'Go to Your Dashboard', url: data.dashboardUrl, style: 'success' }) +
          '</td></tr></table>' +
          para('Need help? Click the Trinity icon in the corner of your screen or contact support.', { muted: true, small: true }),
      }),
    }),

    /**
     * ORGANIZATION INVITATION
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
      subject: `You're Invited to Join ${PLATFORM.name} — AI-Powered Workforce Intelligence`,
      html: emailLayout({
        preheader: `${data.inviterName || 'Someone'} has invited ${data.organizationName || 'your team'} to ${PLATFORM.name}. Set up your organization today.`,
        header: emailHeader({ title: `Welcome to ${PLATFORM.name}`, subtitle: 'AI-Powered Workforce Intelligence Platform', badge: 'Organization Invitation', theme: 'blue' }),
        body:
          greeting(data.recipientName || 'there') +
          para(`<strong>${data.inviterName || 'A manager'}</strong>${data.inviterCompany ? ' from <strong>' + data.inviterCompany + '</strong>' : ''} has invited you to set up <strong>${data.organizationName || 'your organization'}</strong> on ${PLATFORM.name} — the next-generation workforce management platform powered by AI.`) +
          alertBox({
            type: 'purple',
            title: "Meet Trinity — Your Organization's AI Brain",
            body: "Trinity is your AI co-pilot. Once you set up, Trinity will assist with configuration, answer operational questions, and surface recommendations for your team to review and act on.",
          }) +
          sectionHeading('What you can migrate and set up:') +
          checkList(data.migrationFeatures) +
          alertBox({ type: 'success', title: 'Unlock AI Automation', body: 'Complete your setup to unlock intelligent scheduling, payroll auto-calculation, compliance monitoring, and Trinity AI capabilities.' }) +
          '<table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:28px 0;"><tr><td align="center">' +
          ctaButton({ text: 'Start Your Organization Setup', url: `${data.welcomeUrl}?token=${data.inviteToken}` }) +
          '</td></tr></table>' +
          alertBox({ type: 'warning', title: `Invitation expires in ${data.expiresIn || '24 hours'}`, body: 'After accepting, you will become the organization owner with full administrative access.' }) +
          para(`This invitation was sent to ${data.recipientEmail}. If you did not expect this, safely ignore this email.`, { muted: true, small: true }),
      }),
    }),

    /**
     * PUBLIC LEAD WELCOME
     */
    publicLeadWelcome: (data: {
      contactName: string;
      companyName: string;
      scheduleDemoUrl: string;
      roiSummary?: { estimatedSavings: number; guardCount: number };
    }) => ({
      subject: `Welcome ${data.companyName || 'to ' + PLATFORM.name} — See How ${PLATFORM.name} Transforms Operations`,
      html: emailLayout({
        preheader: `Thank you for your interest. See how ${PLATFORM.name} can transform your security operations.`,
        header: emailHeader({ title: 'Thank You for Your Interest!', subtitle: `Let us show you what ${PLATFORM.name} can do`, badge: 'Demo Request', theme: 'blue' }),
        body:
          greeting(data.contactName || 'there') +
          para(`Thank you for exploring how ${PLATFORM.name} can help <strong>${data.companyName || 'your organization'}</strong>. We are excited to show you how our AI-powered platform can streamline your workforce.`) +
          (data.roiSummary
            ? alertBox({ type: 'success', title: `Estimated Annual Savings for ${data.roiSummary.guardCount} employees`, body: `<span style="font-size:24px;font-weight:800;color:#15803d;">$${data.roiSummary.estimatedSavings.toLocaleString()}</span>` })
            : '') +
          sectionHeading(`What ${PLATFORM.name} can do for you:`) +
          checkList([
            'AI-optimized scheduling that reduces overtime by up to 23%',
            'Automated time tracking with GPS and biometric verification',
            'Real-time labor cost monitoring and profit margin alerts',
            'Compliance automation for 50-state requirements',
            'Trinity AI assistant for instant workforce insights',
          ]) +
          '<table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:28px 0;"><tr><td align="center">' +
          ctaButton({ text: 'Schedule Your Demo', url: data.scheduleDemoUrl }) +
          '</td></tr></table>' +
          para('Or reply to this email with questions — we are here to help.', { muted: true, small: true }),
      }),
    }),

    /**
     * INBOUND OPPORTUNITY NOTIFICATION
     */
    inboundOpportunityNotification: (data: {
      managerName: string;
      contractorName: string;
      shiftCount: number;
      shiftDetails: string;
      reviewUrl: string;
    }) => ({
      subject: `New Shift Opportunity: ${data.contractorName || 'New Request'} — ${data.shiftCount || 0} shift(s) detected`,
      html: emailLayout({
        preheader: `Trinity detected a new staffing opportunity from ${data.contractorName || 'a contractor'}. Review and staff now.`,
        header: emailHeader({ title: 'New Shift Opportunity', subtitle: 'Trinity has identified a new staffing request', badge: 'AI Detected', theme: 'orange' }),
        body:
          greeting(data.managerName || 'there') +
          para(`Trinity has automatically detected a new shift request from <strong>${data.contractorName || 'a contractor'}</strong> requiring your attention.`) +
          infoCard({
            title: 'Opportunity Details',
            rows: [
              { label: 'Source', value: data.contractorName || 'Contractor', highlight: true },
              { label: 'Shifts Detected', value: String(data.shiftCount || 0) },
            ],
          }) +
          alertBox({ type: 'warning', title: 'Shift Details', body: `<pre style="margin:0;font-size:13px;white-space:pre-wrap;font-family:inherit;">${data.shiftDetails || 'No details available'}</pre>` }) +
          '<table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:28px 0;"><tr><td align="center">' +
          ctaButton({ text: 'Review &amp; Staff This Shift', url: data.reviewUrl, style: 'warning' }) +
          '</td></tr></table>' +
          para('Trinity is ready to suggest qualified employees for this shift once you open it.', { muted: true, small: true }),
      }),
    }),

    /**
     * SHIFT OFFER NOTIFICATION
     */
    shiftOfferNotification: (data: {
      employeeName: string;
      clientName: string;
      location: string;
      shiftDate: string;
      startTime: string;
      endTime: string;
      payRate?: string;
      matchRank: number;
      matchScore: number;
      matchReasons: string[];
      respondUrl: string;
      expiresIn: string;
    }) => ({
      subject: `New Shift Offer: ${data.clientName} on ${data.shiftDate}`,
      html: emailLayout({
        preheader: `You have been selected as a top match for a shift at ${data.clientName} on ${data.shiftDate}.`,
        header: emailHeader({ title: 'New Shift Offer', subtitle: 'You have been selected for this shift', badge: `Match #${data.matchRank}`, theme: 'green' }),
        body:
          greeting(data.employeeName) +
          para('Based on your qualifications and availability, you have been selected as a top match for an upcoming shift.') +
          infoCard({
            title: 'Shift Details',
            rows: [
              { label: 'Client', value: data.clientName, highlight: true },
              { label: 'Location', value: data.location },
              { label: 'Date', value: data.shiftDate },
              { label: 'Time', value: `${data.startTime} — ${data.endTime}` },
              ...(data.payRate ? [{ label: 'Pay Rate', value: `$${data.payRate}/hr`, highlight: true }] : []),
            ],
          }) +
          infoCard({
            title: `Why You Were Selected (Score: ${Math.round(data.matchScore * 100)}%)`,
            rows: data.matchReasons.map(r => ({ label: '&#10003;', value: r })),
          }) +
          '<table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:28px 0;"><tr><td align="center">' +
          ctaButton({ text: 'Accept This Shift', url: data.respondUrl, style: 'success' }) +
          '</td></tr></table>' +
          alertBox({ type: 'warning', title: `Offer expires in ${data.expiresIn}`, body: 'Please respond as soon as possible. If you cannot make it, click the link above to decline so we can offer it to another officer.' }),
      }),
    }),

    /**
     * ASSISTED ONBOARDING HANDOFF
     */
    assistedOnboardingHandoff: (data: {
      recipientName: string;
      workspaceName: string;
      handoffUrl: string;
      expiresAt: string;
      supportTeamNote?: string;
    }) => ({
      subject: `Your ${data.workspaceName} Organization is Ready — ${PLATFORM.name}`,
      html: emailLayout({
        preheader: `Our support team has finished setting up ${data.workspaceName}. Claim your organization now.`,
        header: emailHeader({ title: 'Your Organization is Ready!', subtitle: 'Our team has completed your setup', badge: 'Assisted Onboarding', theme: 'green' }),
        body:
          greeting(data.recipientName) +
          para(`Our support team has finished setting up <strong>${data.workspaceName}</strong> on ${PLATFORM.name}. Your organization is fully configured and ready for you to take ownership.`) +
          alertBox({ type: 'success', title: 'What we set up for you', body: '&bull; Organization account with all basic settings<br>&bull; Industry-specific configuration and templates<br>&bull; AI-extracted data from your documents<br>&bull; Trinity AI calibrated to your organization' }) +
          (data.supportTeamNote ? alertBox({ type: 'info', title: 'Note from Support', body: data.supportTeamNote }) : '') +
          '<table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:28px 0;"><tr><td align="center">' +
          ctaButton({ text: 'Claim Your Organization', url: data.handoffUrl, style: 'success' }) +
          '</td></tr></table>' +
          stepList([
            { title: 'Click the button above to claim your organization' },
            { title: `Sign in or create your ${PLATFORM.name} account` },
            { title: 'Review your organization settings and adjust as needed' },
            { title: `Start using ${PLATFORM.name} to manage your workforce!` },
          ]) +
          alertBox({ type: 'warning', title: `Link expires on ${data.expiresAt}`, body: 'After claiming, you become the owner with full administrative access. This link can only be used once.' }),
      }),
    }),

    // ─── NEW TEMPLATES ────────────────────────────────────────────────────────

    /**
     * ACCOUNT DEACTIVATION
     */
    accountDeactivation: (data: {
      firstName: string;
      reason?: string;
      contactEmail: string;
      reactivateUrl?: string;
    }) => ({
      subject: `Your ${PLATFORM.name} Account Has Been Deactivated`,
      html: emailLayout({
        preheader: 'Your account has been deactivated. Contact support if you believe this is an error.',
        header: emailHeader({ title: 'Account Deactivated', subtitle: 'Access to your account has been suspended', badge: 'Account Notice', theme: 'dark' }),
        body:
          greeting(data.firstName) +
          para(`Your ${PLATFORM.name} account has been deactivated. You will not be able to sign in until the account is reactivated.`) +
          (data.reason ? infoCard({ rows: [{ label: 'Reason', value: data.reason }] }) : '') +
          alertBox({ type: 'info', title: 'Think this is a mistake?', body: `Contact your administrator or support at <strong>${data.contactEmail}</strong> to request reactivation.` }) +
          para('Your data is retained for 90 days after deactivation. Contact us if you need to export your records.', { muted: true, small: true }),
      }),
    }),

    /**
     * SUBSCRIPTION WELCOME
     */
    subscriptionWelcome: (data: {
      firstName: string;
      planName: string;
      workspaceName: string;
      billingCycleEnd: string;
      dashboardUrl: string;
    }) => ({
      subject: `Subscription Activated — Welcome to ${data.planName}`,
      html: emailLayout({
        preheader: `Your ${data.planName} subscription for ${data.workspaceName} is now active.`,
        header: emailHeader({ title: 'Subscription Activated!', subtitle: `${data.planName} is now active for ${data.workspaceName}`, badge: 'Billing', theme: 'blue' }),
        body:
          greeting(data.firstName) +
          para(`Your <strong>${data.planName}</strong> subscription for <strong>${data.workspaceName}</strong> is now active. All premium features are unlocked and ready to use.`) +
          infoCard({
            title: 'Subscription Details',
            rows: [
              { label: 'Plan', value: data.planName, highlight: true },
              { label: 'Organization', value: data.workspaceName },
              { label: 'Next Billing Date', value: data.billingCycleEnd },
            ],
          }) +
          alertBox({ type: 'success', title: 'All premium features are unlocked', body: 'You now have full access to AI automation, advanced reporting, unlimited employees, and priority support.' }) +
          '<table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:28px 0;"><tr><td align="center">' +
          ctaButton({ text: 'Go to Dashboard', url: data.dashboardUrl, style: 'success' }) +
          '</td></tr></table>' +
          para('Your subscription renews automatically. Manage billing settings from your account dashboard anytime.', { muted: true, small: true }),
      }),
    }),

    /**
     * SUBSCRIPTION CANCELLATION
     */
    subscriptionCancellation: (data: {
      firstName: string;
      planName: string;
      workspaceName: string;
      accessUntil: string;
      resubscribeUrl: string;
    }) => ({
      subject: `Subscription Cancelled — ${data.workspaceName}`,
      html: emailLayout({
        preheader: `Your ${data.planName} subscription has been cancelled. Access continues until ${data.accessUntil}.`,
        header: emailHeader({ title: 'Subscription Cancelled', subtitle: 'Your subscription has been cancelled', badge: 'Billing Notice', theme: 'dark' }),
        body:
          greeting(data.firstName) +
          para(`Your <strong>${data.planName}</strong> subscription for <strong>${data.workspaceName}</strong> has been cancelled as requested.`) +
          infoCard({
            rows: [
              { label: 'Plan', value: data.planName },
              { label: 'Organization', value: data.workspaceName },
              { label: 'Access Until', value: data.accessUntil, highlight: true },
            ],
          }) +
          alertBox({ type: 'warning', title: `Your data and access remain until ${data.accessUntil}`, body: 'After this date, your account will be downgraded to the free tier. Your data will be retained for 90 days.' }) +
          para('We are sorry to see you go. If there was anything we could have done better, please reply to this email.') +
          '<table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:28px 0;"><tr><td align="center">' +
          ctaButton({ text: 'Reactivate Subscription', url: data.resubscribeUrl, style: 'dark' }) +
          '</td></tr></table>' +
          para('Changed your mind? Reactivate anytime before your access ends to continue without interruption.', { muted: true, small: true }),
      }),
    }),

    /**
     * PAYMENT FAILED
     */
    paymentFailed: (data: {
      firstName: string;
      planName: string;
      workspaceName: string;
      amountDue: string;
      nextAttempt?: string;
      updateBillingUrl: string;
    }) => ({
      subject: `Action Required: Payment Failed for ${data.workspaceName}`,
      html: emailLayout({
        preheader: `Your payment for ${data.planName} could not be processed. Update billing details now.`,
        header: emailHeader({ title: 'Payment Failed', subtitle: 'Action required to maintain your subscription', badge: 'Billing Alert', theme: 'red' }),
        body:
          greeting(data.firstName) +
          para('We were unable to process your subscription payment. Please update your billing information to avoid any interruption to your service.') +
          infoCard({
            rows: [
              { label: 'Plan', value: data.planName },
              { label: 'Organization', value: data.workspaceName },
              { label: 'Amount Due', value: `$${data.amountDue}`, highlight: true },
              ...(data.nextAttempt ? [{ label: 'Next Retry', value: data.nextAttempt }] : []),
            ],
          }) +
          alertBox({ type: 'danger', title: 'Avoid service interruption', body: 'Update your payment method now to prevent your subscription from being suspended. We will automatically retry the charge after your billing is updated.' }) +
          '<table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:28px 0;"><tr><td align="center">' +
          ctaButton({ text: 'Update Payment Method', url: data.updateBillingUrl, style: 'danger' }) +
          '</td></tr></table>' +
          para('Common causes: expired card, insufficient funds, or bank blocking the charge. Contact your bank if the problem persists.', { muted: true, small: true }),
      }),
    }),

    /**
     * MAINTENANCE NOTIFICATION
     */
    maintenanceNotification: (data: {
      firstName: string;
      maintenanceWindow: string;
      duration: string;
      affectedServices: string[];
      maintenanceType: 'scheduled' | 'emergency';
    }) => ({
      subject: `${data.maintenanceType === 'emergency' ? 'Emergency' : 'Scheduled'} Maintenance — ${PLATFORM.name}`,
      html: emailLayout({
        preheader: `${PLATFORM.name} will be undergoing ${data.maintenanceType} maintenance on ${data.maintenanceWindow}.`,
        header: emailHeader({
          title: data.maintenanceType === 'emergency' ? 'Emergency Maintenance' : 'Scheduled Maintenance',
          subtitle: 'Platform services will be temporarily unavailable',
          badge: data.maintenanceType === 'emergency' ? 'Urgent Notice' : 'Planned Maintenance',
          theme: data.maintenanceType === 'emergency' ? 'orange' : 'dark',
        }),
        body:
          greeting(data.firstName) +
          para(`${PLATFORM.name} will be undergoing <strong>${data.maintenanceType} maintenance</strong>. During this window, some services may be temporarily unavailable.`) +
          infoCard({
            title: 'Maintenance Details',
            rows: [
              { label: 'Date &amp; Time', value: data.maintenanceWindow, highlight: true },
              { label: 'Estimated Duration', value: data.duration },
              { label: 'Type', value: data.maintenanceType === 'emergency' ? 'Emergency — Unplanned' : 'Scheduled — Planned' },
            ],
          }) +
          sectionHeading('Services affected:') +
          checkList(data.affectedServices, '#d97706') +
          alertBox({ type: 'info', title: 'What to do', body: 'Save any open work before the maintenance window begins. All data is preserved automatically. Normal operations will resume once maintenance is complete.' }) +
          para('We apologize for any inconvenience. Our team works hard to minimize downtime.', { muted: true, small: true }),
      }),
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
      log.error('[EmailService] Failed to log email event:', (error instanceof Error ? error.message : String(error)));
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
      log.error('[EmailService] Failed to update email event:', (error instanceof Error ? error.message : String(error)));
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
    log.info(`[EmailService] Added to retry queue: ${emailType} to ${to} (retry ${retryCount + 1}/5)`);
  }

  /**
   * Process retry queue - check for jobs that should be retried
   */
  private async processRetryQueue(): Promise<void> {
    const now = new Date();
    const jobsToRetry = Array.from(this.retryQueue.values()).filter(job => job.nextRetryAt <= now);
    
    if (jobsToRetry.length === 0) return;
    
    log.info(`[EmailService] Processing ${jobsToRetry.length} retry jobs...`);
    
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
        log.warn(`[EmailService] Max retries exceeded: ${job.emailType} to ${job.recipientEmail}`);
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
        log.info(`[EmailService] Retry successful: ${job.emailType} to ${job.recipientEmail}`);
      } catch (error: any) {
        // Schedule next retry
        job.retryCount++;
        job.nextRetryAt = this.getNextRetryTime(job.retryCount);
        log.warn(`[EmailService] Retry failed: ${job.emailType} to ${job.recipientEmail}, next attempt: ${job.nextRetryAt}`);
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
        log.error('[EmailService] Error processing retry queue:', error);
      });
    }, 60 * 1000);
    
    log.info('[EmailService] Email retry processor started (checks every 60s)');
  }

  /**
   * Stop retry queue processor
   */
  stopRetryProcessor(): void {
    if (this.retryCheckInterval) {
      clearInterval(this.retryCheckInterval);
      this.retryCheckInterval = null;
      log.info('[EmailService] Email retry processor stopped');
    }
  }

  async send(params: { to: string; subject: string; html: string; workspaceId?: string }): Promise<EmailResult> {
    return this._deliver(params.to, params.subject, params.html, 'generic', params.workspaceId);
  }

  async sendTemplatedEmail(
    to: string,
    templateName: string,
    data: Record<string, any>,
    workspaceId?: string
  ): Promise<EmailResult> {
    const subject = data.subject || `${PLATFORM.name}: ${templateName.replace(/_/g, ' ')}`;
    const html = Object.entries(data)
      .filter(([k]) => k !== 'subject')
      .map(([k, v]) => `<p><strong>${k}:</strong> ${v}</p>`)
      .join('');
    return this._deliver(to, subject, `<div>${html}</div>`, templateName, workspaceId);
  }

  /**
   * Send email via Resend with audit logging, automatic retry, and 7-step orchestration
   * SIMULATION MODE: If emailSimulationMode is enabled, logs email instead of sending
   * CAN-SPAM COMPLIANT: Uses sendCanSpamCompliantEmail for List-Unsubscribe headers
   */
  private async _deliver(
    to: string,
    subject: string,
    html: string,
    emailType: string,
    workspaceId?: string,
    userId?: string
  ): Promise<EmailResult> {
    const isSimulation = !isProduction() && (FEATURES.emailSimulationMode || process.env.EMAIL_SIMULATION_MODE === 'true');

    const result = await automationOrchestration.executeAutomation(
      {
        domain: 'automation',
        automationName: `email-${emailType}`,
        automationType: 'email_delivery',
        workspaceId,
        userId,
        triggeredBy: 'system',
        payload: { to, emailType, subject: subject.substring(0, 50) },
        billable: true,
        creditCost: 1,
      },
      async (ctx) => {
        if (isSimulation) {
          log.info('═'.repeat(60));
          log.info('[EMAIL SIMULATION] Would send email:');
          log.info(`   Type: ${emailType}`);
          log.info(`   To: ${to}`);
          log.info(`   Subject: ${subject}`);
          log.info(`   WorkspaceId: ${workspaceId || 'N/A'}`);
          log.info(`   UserId: ${userId || 'N/A'}`);
          log.info(`   OrchestrationId: ${ctx.orchestrationId}`);
          log.info('   HTML Preview (first 200 chars):');
          log.info(`   ${html.replace(/<[^>]*>/g, ' ').substring(0, 200)}...`);
          log.info('═'.repeat(60));

          await this.logEmailEvent(
            emailType,
            to,
            'sent',
            workspaceId,
            userId,
            `SIMULATED-${Date.now()}`
          );

          return { success: true, resendId: `SIMULATED-${Date.now()}` };
        }

        const eventId = await this.logEmailEvent(
          emailType,
          to,
          'pending',
          workspaceId,
          userId
        );

        const sendResult = await sendCanSpamCompliantEmail({
          to,
          subject,
          html,
          emailType,
          workspaceId,
        });

        if (sendResult.skipped) {
          await this.updateEmailEvent(eventId, 'failed', undefined, sendResult.reason);
          log.info(`[EmailService] Email skipped (unsubscribed): ${emailType} to ${to}`);
          return { success: false, error: sendResult.reason };
        }

        if (sendResult.success) {
          await this.updateEmailEvent(eventId, 'sent', sendResult.data?.data?.id);
          log.info(`[EmailService] Email sent successfully: ${emailType} to ${to}`);
          return { success: true, resendId: sendResult.data?.data?.id };
        }

        const errorMessage = sendResult.error?.message || 'Unknown error';
        await this.updateEmailEvent(eventId, 'failed', undefined, errorMessage);
        this.addToRetryQueue(eventId, to, subject, html, emailType, workspaceId, userId, 0);
        log.error(`[EmailService] Email failed (will retry): ${emailType} to ${to}`, errorMessage);
        return { success: false, error: errorMessage };
      },
      {
        validate: async (ctx) => {
          if (!to || !to.includes('@')) {
            return { valid: false, errors: ['Invalid email address'] };
          }
          if (!subject || subject.trim().length === 0) {
            return { valid: false, errors: ['Email subject is required'] };
          }
          return { valid: true };
        },
      }
    );

    if (result.success && result.data) {
      return result.data as EmailResult;
    }

    return {
      success: false,
      error: result.error || 'Email orchestration failed',
    };
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

    return this._deliver(
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

    return this._deliver(
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

    return this._deliver(
      userEmail,
      template.subject,
      template.html,
      'support_ticket',
      workspaceId
    );
  }

  // ============================================================================
  // BUILD METHODS — return {to, subject, html} for use with NotificationDeliveryService
  // These let callers pre-render the email payload and route it through NDS for retry.
  // ============================================================================

  buildSupportTicketConfirmation(
    userEmail: string, ticketNumber: string, subject: string, userName?: string
  ): { to: string; subject: string; html: string } {
    const template = emailTemplates.supportTicketConfirmation({ name: userName || 'User', ticketNumber, subject });
    return { to: userEmail, subject: template.subject, html: template.html };
  }

  buildReportDelivery(
    clientEmail: string,
    reportData: { reportNumber: string; reportTitle: string; clientName: string }
  ): { to: string; subject: string; html: string } {
    const template = emailTemplates.reportDelivery({
      clientName: reportData.clientName,
      reportNumber: reportData.reportNumber,
      reportTitle: reportData.reportTitle,
    });
    return { to: clientEmail, subject: template.subject, html: template.html };
  }

  buildClientWelcomeEmail(
    email: string, clientName: string, companyName: string, workspaceName: string
  ): { to: string; subject: string; html: string } {
    const portalUrl = `${getAppBaseUrl()}/client-portal`;
    const template = emailTemplates.clientWelcome({
      clientName,
      companyName: companyName || 'Your Organization',
      workspaceName: workspaceName || 'Our Team',
      portalUrl,
    });
    return { to: email, subject: template.subject, html: template.html };
  }

  buildPublicLeadWelcome(params: {
    email: string; contactName: string; companyName: string;
    roiData?: { estimatedAnnualSavings: number; numberOfGuards: number };
  }): { to: string; subject: string; html: string } {
    const scheduleDemoUrl = `${getAppBaseUrl()}/schedule-demo`;
    const template = emailTemplates.publicLeadWelcome({
      contactName: params.contactName || 'there',
      companyName: params.companyName || 'your company',
      scheduleDemoUrl,
      roiSummary: params.roiData ? {
        estimatedSavings: params.roiData.estimatedAnnualSavings,
        guardCount: params.roiData.numberOfGuards,
      } : undefined,
    });
    return { to: params.email, subject: template.subject, html: template.html };
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

    return this._deliver(
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
      workspaceName: workspaceName || PLATFORM.name,
    });

    return this._deliver(
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
      workspaceName: workspaceName || PLATFORM.name,
    });

    return this._deliver(
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
    return this._deliver(
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

    return this._deliver(
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

    return this._deliver(
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

    return this._deliver(
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

    return this._deliver(
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

    return this._deliver(
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

    return this._deliver(
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

    return this._deliver(
      params.toEmail,
      template.subject,
      template.html,
      'assisted_onboarding_handoff'
    );
  }

  /**
   * Send welcome email to public lead
   * Sent when a lead is captured from landing pages (ROI calculator, contact forms)
   */
  async sendPublicLeadWelcome(params: {
    email: string;
    contactName: string;
    companyName: string;
    roiData?: {
      estimatedAnnualSavings: number;
      numberOfGuards: number;
    };
  }): Promise<EmailResult> {
    const scheduleDemoUrl = `${getAppBaseUrl()}/schedule-demo`;
    
    const template = emailTemplates.publicLeadWelcome({
      contactName: params.contactName || 'there',
      companyName: params.companyName || 'your company',
      scheduleDemoUrl,
      roiSummary: params.roiData ? {
        estimatedSavings: params.roiData.estimatedAnnualSavings,
        guardCount: params.roiData.numberOfGuards,
      } : undefined,
    });

    return this._deliver(
      params.email,
      template.subject,
      template.html,
      'public_lead_welcome'
    );
  }

  /**
   * Send inbound opportunity notification to managers
   * Sent when Trinity detects a shift opportunity from inbound emails
   */
  async sendInboundOpportunityNotification(params: {
    workspaceId: string;
    managerEmail: string;
    managerName: string;
    contractorName: string;
    shiftCount: number;
    shiftDetails: string;
    stagedShiftId?: string;
  }): Promise<EmailResult> {
    const reviewUrl = params.stagedShiftId 
      ? `${getAppBaseUrl()}/schedule/staged/${params.stagedShiftId}`
      : `${getAppBaseUrl()}/schedule/staged`;
    
    const template = emailTemplates.inboundOpportunityNotification({
      managerName: params.managerName || 'Manager',
      contractorName: params.contractorName || 'Unknown Contractor',
      shiftCount: params.shiftCount || 1,
      shiftDetails: params.shiftDetails || 'See dashboard for details',
      reviewUrl,
    });

    const { NotificationDeliveryService: NDS1 } = await import('./notificationDeliveryService');
    await NDS1.send({ type: 'inbound_opportunity_notification', workspaceId: params.workspaceId || 'system', recipientUserId: params.managerEmail, channel: 'email', body: { to: params.managerEmail, subject: template.subject, html: template.html } });
    return { success: true };
  }

  /**
   * Send shift offer notification to an employee
   * Sent when the AI staffing system selects an employee as a candidate for a shift
   */
  async sendShiftOfferNotification(params: {
    workspaceId: string;
    employeeId: string;
    employeeEmail: string;
    employeeName: string;
    shiftData: {
      clientName: string;
      location: string;
      shiftDate: string;
      startTime: string;
      endTime: string;
      payRate?: string;
    };
    matchData: {
      rank: number;
      score: number;
      reasons: string[];
    };
    offerId: string;
    expiresAt: Date;
  }): Promise<EmailResult> {
    const respondUrl = `${getAppBaseUrl()}/shift-offers/${params.offerId}/respond`;

    // Calculate time until expiration
    const now = new Date();
    const diffMs = params.expiresAt.getTime() - now.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const expiresIn = diffHours > 0
      ? `${diffHours} hour${diffHours !== 1 ? 's' : ''}`
      : `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''}`;

    const template = emailTemplates.shiftOfferNotification({
      employeeName: params.employeeName || 'Team Member',
      clientName: params.shiftData.clientName || 'Client',
      location: params.shiftData.location || 'See details in app',
      shiftDate: params.shiftData.shiftDate || 'TBD',
      startTime: params.shiftData.startTime || 'TBD',
      endTime: params.shiftData.endTime || 'TBD',
      payRate: params.shiftData.payRate,
      matchRank: params.matchData.rank,
      matchScore: params.matchData.score,
      matchReasons: params.matchData.reasons.length > 0
        ? params.matchData.reasons
        : ['Strong profile match'],
      respondUrl,
      expiresIn,
    });

    const { NotificationDeliveryService: NDS2 } = await import('./notificationDeliveryService');
    await NDS2.send({ type: 'shift_offer_notification', workspaceId: params.workspaceId || 'system', recipientUserId: params.employeeId || params.employeeEmail, channel: 'email', body: { to: params.employeeEmail, subject: template.subject, html: template.html } });
    return { success: true };
  }

  // ==========================================================================
  // STAFFING REQUEST LIFECYCLE EMAILS
  // ==========================================================================

  /**
   * Send acknowledgment email when a staffing request is received
   * This confirms to the sender that their request is being processed
   */
  async sendStaffingRequestAcknowledgment(params: {
    workspaceId: string;
    senderEmail: string;
    senderName?: string;
    referenceNumber: string;
    originalSubject: string;
    workspaceName: string;
    extractedShiftCount?: number;
    estimatedResponseTime?: string;
  }): Promise<EmailResult> {
    const trackingUrl = `${getAppBaseUrl()}/request-status/${params.referenceNumber}`;

    const shiftInfo = params.extractedShiftCount && params.extractedShiftCount > 0
      ? `We've identified <strong>${params.extractedShiftCount} shift${params.extractedShiftCount > 1 ? 's' : ''}</strong> in your request.`
      : 'Our team is reviewing your request details.';

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 30px; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">Request Received</h1>
          <p style="color: #bfdbfe; margin: 10px 0 0 0;">We're on it!</p>
        </div>

        <div style="padding: 30px; background-color: #f8fafc; border-radius: 0 0 12px 12px;">
          <p style="font-size: 16px; color: #1e293b;">Hello ${params.senderName || 'there'},</p>

          <p style="color: #475569;">Thank you for your staffing request. <strong>${params.workspaceName}</strong> has received your message and is actively working on it.</p>

          <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #3b82f6;">
            <p style="margin: 0 0 10px 0; color: #64748b; font-size: 14px;">REFERENCE NUMBER</p>
            <p style="margin: 0; font-size: 24px; font-weight: bold; color: #1e293b; font-family: monospace;">${params.referenceNumber}</p>
          </div>

          <div style="background-color: #eff6ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0 0 10px 0; color: #1e40af; font-weight: bold;">📋 Request Details</p>
            <p style="margin: 5px 0; color: #1e293b;"><strong>Subject:</strong> ${params.originalSubject}</p>
            <p style="margin: 5px 0; color: #1e293b;">${shiftInfo}</p>
          </div>

          <div style="background-color: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0 0 10px 0; color: #166534; font-weight: bold;">⏱️ What Happens Next</p>
            <ol style="margin: 0; padding-left: 20px; color: #166534;">
              <li style="margin-bottom: 8px;">Our team reviews your requirements</li>
              <li style="margin-bottom: 8px;">We match qualified personnel to your needs</li>
              <li style="margin-bottom: 8px;">You'll receive confirmation with staffing details</li>
            </ol>
            <p style="margin: 15px 0 0 0; color: #166534;"><strong>Expected response:</strong> ${params.estimatedResponseTime || 'Within 2 hours during business hours'}</p>
          </div>

          <p style="color: #64748b; font-size: 14px; margin-top: 25px;">
            Questions? Reply to this email or contact us directly. Please include your reference number <strong>${params.referenceNumber}</strong> in any correspondence.
          </p>

          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 25px 0;">

          <p style="color: #94a3b8; font-size: 12px; margin: 0;">
            This is an automated confirmation from ${params.workspaceName} powered by ${PLATFORM.name}.
          </p>
        </div>
      </div>
    `;

    return this._deliver(
      params.senderEmail,
      `✅ Request Received - ${params.referenceNumber}`,
      html,
      'staffing_acknowledgment',
      params.workspaceId
    );
  }

  /**
   * Send confirmation when a staffing request has been successfully fulfilled
   */
  async sendStaffingRequestFulfilled(params: {
    workspaceId: string;
    senderEmail: string;
    senderName?: string;
    referenceNumber: string;
    workspaceName: string;
    assignedStaff: Array<{
      name: string;
      role?: string;
      shiftDate: string;
      shiftTime: string;
      location: string;
    }>;
    specialInstructions?: string;
    contactPhone?: string;
    contactEmail?: string;
  }): Promise<EmailResult> {
    const staffList = params.assignedStaff.map(staff => `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">${staff.name}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">${staff.role || 'Staff'}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">${staff.shiftDate}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">${staff.shiftTime}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">${staff.location}</td>
      </tr>
    `).join('');

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); padding: 30px; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">✓ Request Fulfilled!</h1>
          <p style="color: #bbf7d0; margin: 10px 0 0 0;">Your staffing has been confirmed</p>
        </div>

        <div style="padding: 30px; background-color: #f8fafc; border-radius: 0 0 12px 12px;">
          <p style="font-size: 16px; color: #1e293b;">Hello ${params.senderName || 'there'},</p>

          <p style="color: #475569;">Great news! Your staffing request <strong>${params.referenceNumber}</strong> has been successfully fulfilled by <strong>${params.workspaceName}</strong>.</p>

          <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 25px 0; overflow-x: auto;">
            <p style="margin: 0 0 15px 0; color: #1e40af; font-weight: bold;">👥 Assigned Personnel</p>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <thead>
                <tr style="background-color: #f1f5f9;">
                  <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e2e8f0;">Name</th>
                  <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e2e8f0;">Role</th>
                  <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e2e8f0;">Date</th>
                  <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e2e8f0;">Time</th>
                  <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e2e8f0;">Location</th>
                </tr>
              </thead>
              <tbody>
                ${staffList}
              </tbody>
            </table>
          </div>

          ${params.specialInstructions ? `
          <div style="background-color: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0 0 10px 0; color: #92400e; font-weight: bold;">📝 Special Instructions</p>
            <p style="margin: 0; color: #78350f;">${params.specialInstructions}</p>
          </div>
          ` : ''}

          <div style="background-color: #eff6ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0 0 10px 0; color: #1e40af; font-weight: bold;">📞 Contact Information</p>
            ${params.contactPhone ? `<p style="margin: 5px 0; color: #1e293b;"><strong>Phone:</strong> ${params.contactPhone}</p>` : ''}
            ${params.contactEmail ? `<p style="margin: 5px 0; color: #1e293b;"><strong>Email:</strong> ${params.contactEmail}</p>` : ''}
          </div>

          <p style="color: #64748b; font-size: 14px; margin-top: 25px;">
            Thank you for choosing ${params.workspaceName}. We appreciate your business!
          </p>

          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 25px 0;">

          <p style="color: #94a3b8; font-size: 12px; margin: 0;">
            Reference: ${params.referenceNumber} | Powered by ${PLATFORM.name}
          </p>
        </div>
      </div>
    `;

    return this._deliver(
      params.senderEmail,
      `✓ Staffing Confirmed - ${params.referenceNumber}`,
      html,
      'staffing_fulfilled',
      params.workspaceId
    );
  }

  /**
   * Send notification when a staffing request could not be fulfilled
   */
  async sendStaffingRequestUnfulfilled(params: {
    workspaceId: string;
    senderEmail: string;
    senderName?: string;
    referenceNumber: string;
    workspaceName: string;
    reason: string;
    suggestedAlternatives?: string[];
    canRetry?: boolean;
    contactPhone?: string;
    contactEmail?: string;
  }): Promise<EmailResult> {
    const alternativesList = params.suggestedAlternatives && params.suggestedAlternatives.length > 0
      ? `
        <div style="background-color: #eff6ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0 0 10px 0; color: #1e40af; font-weight: bold;">💡 Suggested Alternatives</p>
          <ul style="margin: 0; padding-left: 20px; color: #1e293b;">
            ${params.suggestedAlternatives.map(alt => `<li style="margin-bottom: 8px;">${alt}</li>`).join('')}
          </ul>
        </div>
      ` : '';

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); padding: 30px; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">Unable to Fulfill Request</h1>
          <p style="color: #fed7aa; margin: 10px 0 0 0;">We wanted to let you know</p>
        </div>

        <div style="padding: 30px; background-color: #f8fafc; border-radius: 0 0 12px 12px;">
          <p style="font-size: 16px; color: #1e293b;">Hello ${params.senderName || 'there'},</p>

          <p style="color: #475569;">We regret to inform you that <strong>${params.workspaceName}</strong> was unable to fulfill your staffing request <strong>${params.referenceNumber}</strong> at this time.</p>

          <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #ef4444;">
            <p style="margin: 0 0 10px 0; color: #991b1b; font-weight: bold;">Reason</p>
            <p style="margin: 0; color: #7f1d1d;">${params.reason}</p>
          </div>

          ${alternativesList}

          ${params.canRetry ? `
          <div style="background-color: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; color: #166534;">
              <strong>Want to try again?</strong> You can submit a new request with adjusted requirements, or contact us to discuss alternatives.
            </p>
          </div>
          ` : ''}

          <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e2e8f0;">
            <p style="margin: 0 0 10px 0; color: #1e293b; font-weight: bold;">📞 Let's Talk</p>
            <p style="margin: 0; color: #475569;">We'd love to help find a solution. Contact us:</p>
            ${params.contactPhone ? `<p style="margin: 10px 0 0 0; color: #1e293b;"><strong>Phone:</strong> ${params.contactPhone}</p>` : ''}
            ${params.contactEmail ? `<p style="margin: 5px 0 0 0; color: #1e293b;"><strong>Email:</strong> ${params.contactEmail}</p>` : ''}
          </div>

          <p style="color: #64748b; font-size: 14px; margin-top: 25px;">
            We appreciate your understanding and hope to serve you in the future.
          </p>

          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 25px 0;">

          <p style="color: #94a3b8; font-size: 12px; margin: 0;">
            Reference: ${params.referenceNumber} | ${params.workspaceName} powered by ${PLATFORM.name}
          </p>
        </div>
      </div>
    `;

    return this._deliver(
      params.senderEmail,
      `Update on Your Request - ${params.referenceNumber}`,
      html,
      'staffing_unfulfilled',
      params.workspaceId
    );
  }

  /**
   * Send real-time staffing workflow status update to email sender
   * Called at each step of the 7-step orchestration process
   */
  async sendStaffingStatusUpdate(params: {
    workspaceId: string;
    senderEmail: string;
    senderName?: string;
    referenceNumber: string;
    workspaceName: string;
    currentStep: 'received' | 'classifying' | 'extracting' | 'matching' | 'assigning' | 'confirming' | 'completed';
    stepNumber: number;
    totalSteps: number;
    stepDetails?: string;
    tempCode?: string;
    statusPortalUrl?: string;
    extractedInfo?: {
      location?: string;
      date?: string;
      time?: string;
      positionType?: string;
      guardsNeeded?: number;
    };
  }): Promise<EmailResult> {
    const stepLabels: Record<string, { label: string; icon: string; color: string }> = {
      received: { label: 'Request Received', icon: '📥', color: '#3b82f6' },
      classifying: { label: 'Analyzing Request', icon: '🔍', color: '#8b5cf6' },
      extracting: { label: 'Extracting Details', icon: '📋', color: '#f59e0b' },
      matching: { label: 'Finding Available Staff', icon: '👥', color: '#06b6d4' },
      assigning: { label: 'Assigning Personnel', icon: '✅', color: '#22c55e' },
      confirming: { label: 'Sending Confirmation', icon: '📧', color: '#10b981' },
      completed: { label: 'Staffing Complete', icon: '🎉', color: '#22c55e' },
    };

    const step = stepLabels[params.currentStep] || { label: params.currentStep, icon: '⏳', color: '#6b7280' };
    const progressPercent = Math.round((params.stepNumber / params.totalSteps) * 100);

    const extractedInfoHtml = params.extractedInfo ? `
      <div style="background-color: #f0fdf4; padding: 15px; border-radius: 8px; margin: 15px 0;">
        <p style="margin: 0 0 10px 0; color: #166534; font-weight: bold; font-size: 14px;">📋 Details Identified</p>
        ${params.extractedInfo.location ? `<p style="margin: 4px 0; color: #166534; font-size: 13px;"><strong>Location:</strong> ${params.extractedInfo.location}</p>` : ''}
        ${params.extractedInfo.date ? `<p style="margin: 4px 0; color: #166534; font-size: 13px;"><strong>Date:</strong> ${params.extractedInfo.date}</p>` : ''}
        ${params.extractedInfo.time ? `<p style="margin: 4px 0; color: #166534; font-size: 13px;"><strong>Time:</strong> ${params.extractedInfo.time}</p>` : ''}
        ${params.extractedInfo.positionType ? `<p style="margin: 4px 0; color: #166534; font-size: 13px;"><strong>Position:</strong> ${params.extractedInfo.positionType}</p>` : ''}
        ${params.extractedInfo.guardsNeeded ? `<p style="margin: 4px 0; color: #166534; font-size: 13px;"><strong>Guards Needed:</strong> ${params.extractedInfo.guardsNeeded}</p>` : ''}
      </div>
    ` : '';

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: ${step.color}; padding: 20px; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 20px;">${step.icon} ${step.label}</h1>
          <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0 0; font-size: 14px;">Request ${params.referenceNumber}</p>
        </div>

        <div style="padding: 25px; background-color: #f8fafc; border-radius: 0 0 12px 12px;">
          <p style="font-size: 15px; color: #1e293b; margin: 0 0 15px 0;">Hello ${params.senderName || 'there'},</p>

          <div style="background-color: white; padding: 15px; border-radius: 8px; margin: 15px 0; border: 1px solid #e2e8f0;">
            <p style="margin: 0 0 10px 0; color: #64748b; font-size: 12px; text-transform: uppercase;">Progress</p>
            <div style="background-color: #e2e8f0; border-radius: 999px; height: 8px; overflow: hidden;">
              <div style="background: linear-gradient(90deg, ${step.color}, ${step.color}dd); width: ${progressPercent}%; height: 100%; border-radius: 999px;"></div>
            </div>
            <p style="margin: 8px 0 0 0; color: #1e293b; font-size: 14px;"><strong>Step ${params.stepNumber} of ${params.totalSteps}:</strong> ${step.label}</p>
          </div>

          ${params.stepDetails ? `<p style="color: #475569; font-size: 14px; margin: 15px 0;">${params.stepDetails}</p>` : ''}

          ${extractedInfoHtml}

          ${params.tempCode && params.statusPortalUrl ? `
          <div style="background-color: #eff6ff; padding: 15px; border-radius: 8px; margin: 15px 0; border: 1px solid #bfdbfe;">
            <p style="margin: 0 0 8px 0; color: #1e40af; font-weight: bold; font-size: 14px;">Your Access Code</p>
            <p style="margin: 0 0 8px 0; color: #1e40af; font-size: 20px; font-family: monospace; letter-spacing: 2px;"><strong>${params.tempCode}</strong></p>
            <p style="margin: 0 0 10px 0; color: #3b82f6; font-size: 13px;">Use this code to check your request status anytime:</p>
            <a href="${params.statusPortalUrl}" style="display: inline-block; background-color: #2563eb; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: bold;">View Status Portal</a>
          </div>
          ` : ''}

          <p style="color: #94a3b8; font-size: 12px; margin: 20px 0 0 0;">
            ${params.workspaceName} powered by ${PLATFORM.name} | You'll receive another update when the next step completes.
          </p>
        </div>
      </div>
    `;

    const _subject = `${step.icon} Step ${params.stepNumber}/${params.totalSteps}: ${step.label} - ${params.referenceNumber}`;
    const { NotificationDeliveryService } = await import('./notificationDeliveryService');
    await NotificationDeliveryService.send({ type: 'staffing_status_update', workspaceId: params.workspaceId || 'system', recipientUserId: params.senderEmail, channel: 'email', body: { to: params.senderEmail, subject: _subject, html } });
    return { success: true };
  }

  /**
   * Send comprehensive staffing completion summary with who/what/where/why/how
   * This is the final email sent when staffing is fully complete
   */
  async sendStaffingCompletionSummary(params: {
    workspaceId: string;
    senderEmail: string;
    senderName?: string;
    referenceNumber: string;
    workspaceName: string;
    confirmationNumber: string;
    summary: {
      who: {
        assignedStaff: Array<{ name: string; phone?: string; role?: string }>;
        totalStaffCount: number;
      };
      what: {
        positionType: string;
        specialRequirements?: string[];
        dressCode?: string;
      };
      where: {
        location: string;
        address?: string;
        pocName?: string;
        pocPhone?: string;
      };
      when: {
        date: string;
        startTime: string;
        endTime: string;
        duration?: string;
      };
      why: {
        requestSource: string;
        clientName?: string;
        eventType?: string;
      };
      how: {
        billingTerms: string;
        rateInfo?: string;
        paymentInstructions?: string;
        invoiceWillFollow?: boolean;
      };
    };
    nextSteps?: string[];
    specialInstructions?: string;
  }): Promise<EmailResult> {
    const { summary } = params;

    const staffListHtml = summary.who.assignedStaff.map(staff => `
      <tr>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 14px;">${staff.name}</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 14px;">${staff.role || 'Security Officer'}</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 14px;">${staff.phone || 'On file'}</td>
      </tr>
    `).join('');

    const requirementsHtml = summary.what.specialRequirements && summary.what.specialRequirements.length > 0
      ? `<p style="margin: 5px 0; color: #1e293b; font-size: 14px;"><strong>Requirements:</strong> ${summary.what.specialRequirements.join(', ')}</p>`
      : '';

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 26px;">🎉 Staffing Complete!</h1>
          <p style="color: #bbf7d0; margin: 10px 0 0 0; font-size: 16px;">Your request has been fully processed</p>
          <div style="background: rgba(255,255,255,0.2); display: inline-block; padding: 8px 20px; border-radius: 6px; margin-top: 15px;">
            <p style="margin: 0; color: white; font-size: 14px;">Confirmation: <strong style="font-family: monospace; font-size: 16px;">${params.confirmationNumber}</strong></p>
          </div>
        </div>

        <div style="padding: 30px; background-color: #f8fafc; border-radius: 0 0 12px 12px;">
          <p style="font-size: 16px; color: #1e293b; margin: 0 0 25px 0;">Hello ${params.senderName || 'there'},</p>

          <p style="color: #475569; margin-bottom: 25px;">Great news! <strong>${params.workspaceName}</strong> has successfully staffed your request. Here's a complete summary:</p>

          <!-- WHO Section -->
          <div style="background-color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #3b82f6;">
            <h3 style="margin: 0 0 15px 0; color: #1e40af; font-size: 16px;">👥 WHO - Assigned Personnel (${summary.who.totalStaffCount})</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="background-color: #f1f5f9;">
                  <th style="padding: 10px 12px; text-align: left; font-size: 13px; color: #64748b;">Name</th>
                  <th style="padding: 10px 12px; text-align: left; font-size: 13px; color: #64748b;">Role</th>
                  <th style="padding: 10px 12px; text-align: left; font-size: 13px; color: #64748b;">Contact</th>
                </tr>
              </thead>
              <tbody>
                ${staffListHtml}
              </tbody>
            </table>
          </div>

          <!-- WHAT Section -->
          <div style="background-color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #8b5cf6;">
            <h3 style="margin: 0 0 15px 0; color: #6d28d9; font-size: 16px;">📋 WHAT - Assignment Details</h3>
            <p style="margin: 5px 0; color: #1e293b; font-size: 14px;"><strong>Position:</strong> ${summary.what.positionType}</p>
            ${summary.what.dressCode ? `<p style="margin: 5px 0; color: #1e293b; font-size: 14px;"><strong>Dress Code:</strong> ${summary.what.dressCode}</p>` : ''}
            ${requirementsHtml}
          </div>

          <!-- WHERE Section -->
          <div style="background-color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #f59e0b;">
            <h3 style="margin: 0 0 15px 0; color: #d97706; font-size: 16px;">📍 WHERE - Location</h3>
            <p style="margin: 5px 0; color: #1e293b; font-size: 14px;"><strong>Site:</strong> ${summary.where.location}</p>
            ${summary.where.address ? `<p style="margin: 5px 0; color: #1e293b; font-size: 14px;"><strong>Address:</strong> ${summary.where.address}</p>` : ''}
            ${summary.where.pocName ? `<p style="margin: 5px 0; color: #1e293b; font-size: 14px;"><strong>Site Contact:</strong> ${summary.where.pocName}${summary.where.pocPhone ? ` - ${summary.where.pocPhone}` : ''}</p>` : ''}
          </div>

          <!-- WHEN Section -->
          <div style="background-color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #06b6d4;">
            <h3 style="margin: 0 0 15px 0; color: #0891b2; font-size: 16px;">🕐 WHEN - Schedule</h3>
            <p style="margin: 5px 0; color: #1e293b; font-size: 14px;"><strong>Date:</strong> ${summary.when.date}</p>
            <p style="margin: 5px 0; color: #1e293b; font-size: 14px;"><strong>Time:</strong> ${summary.when.startTime} - ${summary.when.endTime}</p>
            ${summary.when.duration ? `<p style="margin: 5px 0; color: #1e293b; font-size: 14px;"><strong>Duration:</strong> ${summary.when.duration}</p>` : ''}
          </div>

          <!-- WHY Section -->
          <div style="background-color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #ec4899;">
            <h3 style="margin: 0 0 15px 0; color: #db2777; font-size: 16px;">📝 WHY - Request Origin</h3>
            <p style="margin: 5px 0; color: #1e293b; font-size: 14px;"><strong>Source:</strong> ${summary.why.requestSource}</p>
            ${summary.why.clientName ? `<p style="margin: 5px 0; color: #1e293b; font-size: 14px;"><strong>Client:</strong> ${summary.why.clientName}</p>` : ''}
            ${summary.why.eventType ? `<p style="margin: 5px 0; color: #1e293b; font-size: 14px;"><strong>Event Type:</strong> ${summary.why.eventType}</p>` : ''}
          </div>

          <!-- HOW Section -->
          <div style="background-color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #22c55e;">
            <h3 style="margin: 0 0 15px 0; color: #16a34a; font-size: 16px;">💰 HOW - Billing & Payment</h3>
            <p style="margin: 5px 0; color: #1e293b; font-size: 14px;"><strong>Terms:</strong> ${summary.how.billingTerms}</p>
            ${summary.how.rateInfo ? `<p style="margin: 5px 0; color: #1e293b; font-size: 14px;"><strong>Rate:</strong> ${summary.how.rateInfo}</p>` : ''}
            ${summary.how.invoiceWillFollow ? `<p style="margin: 10px 0 0 0; color: #166534; font-size: 13px; font-style: italic;">📧 An invoice will be sent separately.</p>` : ''}
          </div>

          ${params.specialInstructions ? `
          <div style="background-color: #fef3c7; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h3 style="margin: 0 0 10px 0; color: #92400e; font-size: 16px;">⚠️ Special Instructions</h3>
            <p style="margin: 0; color: #78350f; font-size: 14px;">${params.specialInstructions}</p>
          </div>
          ` : ''}

          ${params.nextSteps && params.nextSteps.length > 0 ? `
          <div style="background-color: #eff6ff; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h3 style="margin: 0 0 15px 0; color: #1e40af; font-size: 16px;">✅ Next Steps</h3>
            <ol style="margin: 0; padding-left: 20px; color: #1e293b;">
              ${params.nextSteps.map(step => `<li style="margin-bottom: 8px; font-size: 14px;">${step}</li>`).join('')}
            </ol>
          </div>
          ` : ''}

          <div style="text-align: center; margin: 25px 0;">
            <p style="color: #475569; font-size: 14px;">Questions or need changes? Reply to this email or call us directly.</p>
          </div>

          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 25px 0;">

          <div style="text-align: center;">
            <p style="color: #94a3b8; font-size: 12px; margin: 0;">
              Reference: ${params.referenceNumber} | Confirmation: ${params.confirmationNumber}
            </p>
            <p style="color: #94a3b8; font-size: 12px; margin: 5px 0 0 0;">
              ${params.workspaceName} powered by ${PLATFORM.name}
            </p>
          </div>
        </div>
      </div>
    `;

    return this._deliver(
      params.senderEmail,
      `🎉 Staffing Complete! Confirmation ${params.confirmationNumber} - ${params.referenceNumber}`,
      html,
      'staffing_completion_summary',
      params.workspaceId
    );
  }

  /**
   * Trinity's first-response email to a staffing request — org-branded greeting
   * Sent immediately when inbound email arrives, before pipeline processing
   */
  async sendStaffingInitialGreeting(params: {
    workspaceId: string;
    senderEmail: string;
    senderName?: string;
    workspaceName: string;
    licenseNumber?: string;
    referenceNumber: string;
    orgEmail: string;
  }): Promise<EmailResult> {
    const name = params.senderName || 'there';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">${params.workspaceName}</h1>
          ${params.licenseNumber ? `<p style="color: #bfdbfe; margin: 8px 0 0 0; font-size: 13px;">License: ${params.licenseNumber}</p>` : ''}
          <p style="color: #93c5fd; margin: 10px 0 0 0; font-size: 14px;">Staffing Request Received</p>
        </div>
        <div style="padding: 30px; background-color: #f8fafc; border-radius: 0 0 12px 12px;">
          <p style="font-size: 16px; color: #1e293b; margin: 0 0 15px 0;">Hello ${name},</p>
          <p style="color: #475569; font-size: 14px; margin: 0 0 20px 0;">
            Thank you for reaching out to <strong>${params.workspaceName}</strong>. I'm Trinity, your AI staffing coordinator. I've received your request and I'm here to help find the right personnel for your needs.
          </p>

          <div style="background-color: white; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 20px;">
            <p style="color: #1e40af; font-weight: bold; font-size: 14px; margin: 0 0 12px 0;">To process your request, please provide the following details:</p>
            <ol style="color: #475569; font-size: 14px; padding-left: 20px; margin: 0; line-height: 1.8;">
              <li><strong>Client/Company Name</strong> — who we'll be billing</li>
              <li><strong>Site Address</strong> — full address where officer(s) will report</li>
              <li><strong>Description of Duties</strong> — what the officer will be responsible for</li>
              <li><strong>Date(s)</strong> — start date and any recurring schedule</li>
              <li><strong>Hours</strong> — shift start time and end time (e.g., 6 PM – 6 AM)</li>
              <li><strong>Number of Officers Needed</strong> — per shift/per day</li>
              <li><strong>Any Special Requirements</strong> — armed/unarmed, certifications, dress code, etc.</li>
            </ol>
          </div>

          <div style="background-color: #eff6ff; padding: 15px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #bfdbfe;">
            <p style="margin: 0; color: #1e40af; font-size: 13px;">
              <strong>Reference Number: ${params.referenceNumber}</strong><br>
              Keep this number handy — you can use it to check on your request status anytime.
            </p>
          </div>

          <p style="color: #475569; font-size: 14px; margin: 0 0 5px 0;">Once I have these details, I will:</p>
          <ul style="color: #475569; font-size: 14px; padding-left: 20px; margin: 0 0 20px 0; line-height: 1.8;">
            <li>Create your shift immediately</li>
            <li>Search our roster for qualified, available officers in your area</li>
            <li>Contact candidates and fill your position(s)</li>
            <li>Send you a complete staffing confirmation with assigned officer details</li>
          </ul>

          <p style="color: #64748b; font-size: 13px; margin: 0;">
            Simply reply to this email with the details above, or if you already included them in your original message, we're already processing it — you'll receive an update shortly.
          </p>

          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 25px 0;">
          <p style="color: #94a3b8; font-size: 12px; margin: 0; text-align: center;">
            ${params.workspaceName} | Powered by ${PLATFORM.name} | Ref: ${params.referenceNumber}
          </p>
        </div>
      </div>
    `;

    return this._deliver(
      params.senderEmail,
      `Staffing Request Received — ${params.workspaceName} [Ref: ${params.referenceNumber}]`,
      html,
      'staffing_initial_greeting',
      params.workspaceId
    );
  }

  /**
   * Officer shift offer — sends job details to an officer candidate
   * Officers only see their own pay rate, never the client billing rate
   */
  async sendOfficerShiftOffer(params: {
    workspaceId: string;
    officerEmail: string;
    officerFirstName: string;
    workspaceName: string;
    offerId: string;
    referenceNumber: string;
    shiftDetails: {
      location: string;
      address?: string;
      date: string;
      startTime: string;
      endTime: string;
      positionType: string;
      specialRequirements?: string[];
      dressCode?: string;
    };
    officerPayRate?: number;
    replyEmail: string;
  }): Promise<EmailResult> {
    const reqStr = params.shiftDetails.specialRequirements?.length
      ? `<p style="margin:5px 0;font-size:14px;color:#1e293b;"><strong>Requirements:</strong> ${params.shiftDetails.specialRequirements.join(', ')}</p>`
      : '';
    const dressStr = params.shiftDetails.dressCode
      ? `<p style="margin:5px 0;font-size:14px;color:#1e293b;"><strong>Dress Code:</strong> ${params.shiftDetails.dressCode}</p>`
      : '';
    const payStr = params.officerPayRate
      ? `<p style="margin:5px 0;font-size:14px;color:#1e293b;"><strong>Your Pay Rate:</strong> $${params.officerPayRate.toFixed(2)}/hr</p>`
      : '';

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #1e3a5f 0%, #0891b2 100%); padding: 25px; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 22px;">Shift Offer — ${params.workspaceName}</h1>
          <p style="color: #bae6fd; margin: 8px 0 0 0; font-size: 14px;">A position is available for you</p>
        </div>
        <div style="padding: 30px; background-color: #f8fafc; border-radius: 0 0 12px 12px;">
          <p style="font-size: 15px; color: #1e293b; margin: 0 0 15px 0;">Hello ${params.officerFirstName},</p>
          <p style="color: #475569; font-size: 14px; margin: 0 0 20px 0;">
            You've been selected as a candidate for an upcoming assignment. Here are the details:
          </p>

          <div style="background-color: white; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 20px;">
            <h3 style="color: #1e40af; margin: 0 0 15px 0; font-size: 16px;">Assignment Details</h3>
            <p style="margin:5px 0;font-size:14px;color:#1e293b;"><strong>Position:</strong> ${params.shiftDetails.positionType}</p>
            <p style="margin:5px 0;font-size:14px;color:#1e293b;"><strong>Location:</strong> ${params.shiftDetails.location}</p>
            ${params.shiftDetails.address ? `<p style="margin:5px 0;font-size:14px;color:#475569;">${params.shiftDetails.address}</p>` : ''}
            <p style="margin:5px 0;font-size:14px;color:#1e293b;"><strong>Date:</strong> ${params.shiftDetails.date}</p>
            <p style="margin:5px 0;font-size:14px;color:#1e293b;"><strong>Hours:</strong> ${params.shiftDetails.startTime} – ${params.shiftDetails.endTime}</p>
            ${payStr}
            ${reqStr}
            ${dressStr}
          </div>

          <div style="background-color: #ecfdf5; padding: 20px; border-radius: 8px; border: 1px solid #bbf7d0; margin-bottom: 20px;">
            <h3 style="color: #065f46; margin: 0 0 12px 0; font-size: 15px;">To Accept This Assignment</h3>
            <p style="color: #047857; font-size: 14px; margin: 0 0 10px 0;">
              Reply to this email with:
            </p>
            <div style="background-color: white; padding: 12px 16px; border-radius: 6px; border: 1px solid #a7f3d0; font-family: monospace; font-size: 15px; color: #065f46; letter-spacing: 0.5px;">
              YES [Your Full Name] [Your Phone Number]
            </div>
            <p style="color: #6b7280; font-size: 12px; margin: 10px 0 0 0;">
              Example: YES John Smith 713-555-1234
            </p>
          </div>

          <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; border: 1px solid #fcd34d; margin-bottom: 20px;">
            <p style="color: #92400e; font-size: 13px; margin: 0;">
              <strong>Important:</strong> Offers are filled on a first-come, first-served basis. Reply promptly to secure your spot. If you cannot accept, no reply is needed.
            </p>
          </div>

          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
          <p style="color: #94a3b8; font-size: 12px; margin: 0; text-align: center;">
            ${params.workspaceName} | Offer ID: ${params.offerId} | Ref: ${params.referenceNumber}
          </p>
        </div>
      </div>
    `;

    return this._deliver(
      params.officerEmail,
      `Shift Offer — ${params.shiftDetails.positionType} on ${params.shiftDetails.date} | ${params.workspaceName}`,
      html,
      'officer_shift_offer',
      params.workspaceId
    );
  }

  /**
   * Internal summary email sent to org owner + managers when staffing completes
   */
  async sendStaffingCompletionOrgSummary(params: {
    workspaceId: string;
    recipients: string[];
    workspaceName: string;
    referenceNumber: string;
    confirmationNumber: string;
    clientName: string;
    clientEmail: string;
    clientPhone?: string;
    shiftDetails: {
      location: string;
      date: string;
      startTime: string;
      endTime: string;
      positionType: string;
      guardsNeeded: number;
    };
    assignedOfficers: Array<{ name: string; phone?: string; role?: string }>;
    billingRate?: number;
    officerPayRate?: number;
    nextActions: string[];
  }): Promise<EmailResult[]> {
    const officerRows = params.assignedOfficers.map(o => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:14px;">${o.name}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:14px;">${o.role || 'Security Officer'}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:14px;">${o.phone || 'On file'}</td>
      </tr>
    `).join('');

    const rateSection = (params.billingRate || params.officerPayRate) ? `
      <div style="background-color:white;padding:20px;border-radius:8px;border:1px solid #e2e8f0;margin-bottom:20px;">
        <h3 style="color:#1e293b;margin:0 0 12px 0;font-size:15px;">Financial Summary</h3>
        ${params.billingRate ? `<p style="margin:5px 0;font-size:14px;color:#1e293b;"><strong>Client Bill Rate:</strong> $${params.billingRate.toFixed(2)}/hr</p>` : ''}
        ${params.officerPayRate ? `<p style="margin:5px 0;font-size:14px;color:#1e293b;"><strong>Officer Pay Rate:</strong> $${params.officerPayRate.toFixed(2)}/hr</p>` : ''}
        ${params.billingRate && params.officerPayRate ? `<p style="margin:5px 0;font-size:14px;color:#16a34a;"><strong>Gross Margin:</strong> $${(params.billingRate - params.officerPayRate).toFixed(2)}/hr per officer</p>` : ''}
      </div>
    ` : '';

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #1e3a5f 0%, #1e40af 100%); padding: 25px; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 22px;">Staffing Complete — Internal Summary</h1>
          <p style="color: #bfdbfe; margin: 8px 0 0 0; font-size: 14px;">${params.workspaceName} | ${params.referenceNumber}</p>
        </div>
        <div style="padding: 30px; background-color: #f8fafc; border-radius: 0 0 12px 12px;">
          <div style="background-color: #ecfdf5; padding: 15px; border-radius: 8px; margin-bottom: 25px; border: 1px solid #bbf7d0;">
            <p style="margin:0;color:#065f46;font-size:14px;font-weight:bold;">
              Shift staffed successfully — Confirmation: ${params.confirmationNumber}
            </p>
          </div>

          <div style="background-color:white;padding:20px;border-radius:8px;border:1px solid #e2e8f0;margin-bottom:20px;">
            <h3 style="color:#1e293b;margin:0 0 12px 0;font-size:15px;">Client Information</h3>
            <p style="margin:5px 0;font-size:14px;color:#1e293b;"><strong>Client:</strong> ${params.clientName}</p>
            <p style="margin:5px 0;font-size:14px;color:#1e293b;"><strong>Email:</strong> ${params.clientEmail}</p>
            ${params.clientPhone ? `<p style="margin:5px 0;font-size:14px;color:#1e293b;"><strong>Phone:</strong> ${params.clientPhone}</p>` : ''}
          </div>

          <div style="background-color:white;padding:20px;border-radius:8px;border:1px solid #e2e8f0;margin-bottom:20px;">
            <h3 style="color:#1e293b;margin:0 0 12px 0;font-size:15px;">Shift Details</h3>
            <p style="margin:5px 0;font-size:14px;color:#1e293b;"><strong>Position:</strong> ${params.shiftDetails.positionType}</p>
            <p style="margin:5px 0;font-size:14px;color:#1e293b;"><strong>Location:</strong> ${params.shiftDetails.location}</p>
            <p style="margin:5px 0;font-size:14px;color:#1e293b;"><strong>Date:</strong> ${params.shiftDetails.date}</p>
            <p style="margin:5px 0;font-size:14px;color:#1e293b;"><strong>Hours:</strong> ${params.shiftDetails.startTime} – ${params.shiftDetails.endTime}</p>
            <p style="margin:5px 0;font-size:14px;color:#1e293b;"><strong>Officers Filled:</strong> ${params.assignedOfficers.length} of ${params.shiftDetails.guardsNeeded}</p>
          </div>

          <div style="background-color:white;padding:20px;border-radius:8px;border:1px solid #e2e8f0;margin-bottom:20px;">
            <h3 style="color:#1e293b;margin:0 0 12px 0;font-size:15px;">Assigned Officers</h3>
            <table style="width:100%;border-collapse:collapse;">
              <thead>
                <tr style="background-color:#f1f5f9;">
                  <th style="padding:10px 12px;text-align:left;font-size:13px;color:#64748b;">Name</th>
                  <th style="padding:10px 12px;text-align:left;font-size:13px;color:#64748b;">Role</th>
                  <th style="padding:10px 12px;text-align:left;font-size:13px;color:#64748b;">Phone</th>
                </tr>
              </thead>
              <tbody>${officerRows}</tbody>
            </table>
          </div>

          ${rateSection}

          ${params.nextActions.length > 0 ? `
          <div style="background-color:#eff6ff;padding:20px;border-radius:8px;border:1px solid #bfdbfe;margin-bottom:20px;">
            <h3 style="color:#1e40af;margin:0 0 12px 0;font-size:15px;">Recommended Next Actions</h3>
            <ol style="color:#1e40af;font-size:14px;padding-left:20px;margin:0;line-height:1.8;">
              ${params.nextActions.map(a => `<li>${a}</li>`).join('')}
            </ol>
          </div>
          ` : ''}

          <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;">
          <p style="color:#94a3b8;font-size:12px;margin:0;text-align:center;">
            ${params.workspaceName} Internal Summary | Ref: ${params.referenceNumber} | Confirmation: ${params.confirmationNumber}
          </p>
        </div>
      </div>
    `;

    const results: EmailResult[] = [];
    for (const recipient of params.recipients) {
      try {
        const r = await this._deliver(
          recipient,
          `[Internal] Staffing Complete — ${params.clientName} | ${params.confirmationNumber}`,
          html,
          'staffing_org_summary',
          params.workspaceId
        );
        results.push(r);
      } catch (err: any) {
        results.push({ success: false, error: (err instanceof Error ? err.message : String(err)) });
      }
    }
    return results;
  }

  async sendClientPortalInvitation(params: {
    workspaceId: string;
    clientEmail: string;
    clientName?: string;
    workspaceName: string;
    portalUrl: string;
    signupUrl: string;
    tempCode: string;
    shiftsFilled: number;
  }): Promise<EmailResult> {
    const greeting = params.clientName ? `Dear ${params.clientName}` : 'Hello';

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #059669; padding: 20px; border-radius: 8px 8px 0 0;">
          <h2 style="color: white; margin: 0; font-size: 20px;">Your Client Portal is Ready</h2>
          <p style="color: #d1fae5; margin: 5px 0 0 0; font-size: 14px;">${params.workspaceName}</p>
        </div>
        <div style="padding: 25px; background-color: #f0fdf4; border: 1px solid #bbf7d0; border-top: none; border-radius: 0 0 8px 8px;">
          <p style="color: #166534; font-size: 15px;">${greeting},</p>
          <p style="color: #166534; font-size: 14px;">
            Thank you for trusting us with your staffing needs! We've successfully filled 
            <strong>${params.shiftsFilled} shift${params.shiftsFilled !== 1 ? 's' : ''}</strong> for your organization.
          </p>
          
          <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #bbf7d0;">
            <h3 style="color: #059669; margin: 0 0 10px 0; font-size: 16px;">What You Can Do with Your Portal</h3>
            <ul style="color: #166534; font-size: 13px; padding-left: 20px; margin: 0;">
              <li style="margin: 5px 0;">View real-time status of all your staffing requests</li>
              <li style="margin: 5px 0;">Submit new staffing requests directly</li>
              <li style="margin: 5px 0;">Review assigned personnel details</li>
              <li style="margin: 5px 0;">Access invoices and billing history</li>
              <li style="margin: 5px 0;">Communicate directly with the staffing team</li>
            </ul>
          </div>

          <div style="text-align: center; margin: 25px 0;">
            <a href="${params.signupUrl}" style="background-color: #059669; color: white; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 15px; display: inline-block;">
              Create Your Account
            </a>
          </div>

          <p style="color: #6b7280; font-size: 13px; text-align: center;">
            Or view your current request status anytime:<br>
            <a href="${params.portalUrl}" style="color: #059669;">${params.portalUrl}</a>
          </p>

          <div style="background-color: #ecfdf5; padding: 12px; border-radius: 6px; margin-top: 15px;">
            <p style="color: #6b7280; font-size: 12px; margin: 0;">
              Your access code: <strong>${params.tempCode}</strong><br>
              This code provides temporary access. Create a full account for permanent access.
            </p>
          </div>
          
          <div style="border-top: 1px solid #d1fae5; margin-top: 20px; padding-top: 15px;">
            <p style="color: #94a3b8; font-size: 12px; margin: 0; text-align: center;">
              ${params.workspaceName} powered by ${PLATFORM.name}
            </p>
          </div>
        </div>
      </div>
    `;

    const { NotificationDeliveryService: NDS3 } = await import('./notificationDeliveryService');
    await NDS3.send({ type: 'client_portal_invitation', workspaceId: params.workspaceId || 'system', recipientUserId: params.clientEmail, channel: 'email', body: { to: params.clientEmail, subject: `Your Client Portal is Ready - ${params.workspaceName}`, html } });
    return { success: true };
  }

  /**
   * STAFFING REQUEST DROPPED — Friendly drop notification for losing orgs
   * Sent to the client on behalf of a competing provider that lost the race.
   * Never mentions the winner company — just states the request can no longer be fulfilled.
   */
  async sendStaffingRequestDropped(params: {
    workspaceId: string;
    workspaceName: string;
    clientEmail: string;
    clientName?: string;
    shiftDescription?: string;
    referenceNumber?: string;
  }): Promise<EmailResult> {
    const name = params.clientName || 'there';
    const refLine = params.referenceNumber ? `<p style="color:#64748b;font-size:13px;margin:8px 0 0 0;">Reference: ${params.referenceNumber}</p>` : '';
    const shiftLine = params.shiftDescription ? `
      <div style="background-color:#f1f5f9;padding:15px;border-radius:8px;margin-bottom:20px;border:1px solid #e2e8f0;">
        <p style="margin:0;font-size:13px;color:#475569;font-style:italic;">${params.shiftDescription}</p>
      </div>
    ` : '';

    const html = `
      <table width="100%" cellpadding="0" cellspacing="0" style="font-family:Arial,sans-serif;background-color:#e8edf2;">
        <tr><td align="center" style="padding:8px 6px;">
        <div style="max-width:600px;width:100%;margin:0 auto;">
        <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%); padding: 28px 20px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 22px;">${params.workspaceName}</h1>
          <p style="color: #93c5fd; margin: 8px 0 0 0; font-size: 14px;">Staffing Request Update</p>
        </div>
        <div style="padding: 24px 16px; background-color: #f8fafc; border-radius: 0 0 12px 12px;">
          <p style="font-size: 16px; color: #1e293b; margin: 0 0 16px 0;">Hello ${name},</p>

          ${shiftLine}

          <p style="color: #475569; font-size: 14px; line-height: 1.7; margin: 0 0 20px 0;">
            Thank you for reaching out to <strong>${params.workspaceName}</strong> regarding your staffing need. After a thorough review, we are unable to fulfill this particular request at this time.
          </p>

          <p style="color: #475569; font-size: 14px; line-height: 1.7; margin: 0 0 20px 0;">
            We sincerely apologize for any inconvenience this may cause. We encourage you to reach back out for future staffing needs — we would be glad to assist when availability aligns with your requirements.
          </p>

          <div style="background-color: #eff6ff; padding: 18px; border-radius: 8px; border: 1px solid #bfdbfe; margin-bottom: 25px;">
            <p style="margin: 0; color: #1e40af; font-size: 14px; font-weight: 600;">Need immediate assistance?</p>
            <p style="margin: 8px 0 0 0; color: #3b82f6; font-size: 13px;">
              Reply to this email or contact us directly — we will do our best to connect you with the right resources.
            </p>
          </div>

          <p style="color: #475569; font-size: 14px; line-height: 1.7; margin: 0 0 20px 0;">
            We appreciate your trust in the ${PLATFORM.name} network and hope to serve you in the future.
          </p>

          <p style="color: #1e293b; font-size: 14px; margin: 0;">Warm regards,</p>
          <p style="color: #1e293b; font-size: 14px; margin: 4px 0 0 0; font-weight: 600;">The ${params.workspaceName} Team</p>
          <p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0; font-style: italic;">Powered by ${PLATFORM.name}</p>
          ${refLine}

          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 25px 0;">
          <p style="color: #94a3b8; font-size: 11px; margin: 0; text-align: center;">
            ${params.workspaceName} | Staffing Request Update | ${PLATFORM.name} Platform
          </p>
        </div>
        </div>
        </td></tr>
      </table>
    `;

    return this._deliver(
      params.clientEmail,
      `Staffing Request Update — ${params.workspaceName}`,
      html,
      'staffing_request_dropped',
      params.workspaceId
    );
  }

  /**
   * TRINITY AI GREETING — AI-written initial response to staffing request
   * Uses the exact content Trinity generates: intro, job summary, scoring explanation,
   * portal preview, case manager mention. Signed: Trinity.
   */
  async sendTrinityAIGreeting(params: {
    workspaceId: string;
    senderEmail: string;
    senderName?: string;
    workspaceName: string;
    licenseNumber?: string;
    referenceNumber: string;
    orgEmail: string;
    jobSummary: string;       // AI-generated summary of the request
    portalUrl?: string;
  }): Promise<EmailResult> {
    const recipientName = params.senderName || 'there';
    const licLine = params.licenseNumber
      ? `<p style="color: #bfdbfe; margin: 6px 0 0 0; font-size: 13px;">License No. ${params.licenseNumber}</p>`
      : '';

    const html = `
      <table width="100%" cellpadding="0" cellspacing="0" style="font-family:Arial,sans-serif;background-color:#e8edf2;">
        <tr><td align="center" style="padding:8px 6px;">
        <div style="max-width:640px;width:100%;margin:0 auto;">
        <div style="background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #1e40af 100%); padding: 28px 20px; border-radius: 12px 12px 0 0; text-align: center;">
          <p style="color: #93c5fd; margin: 0 0 6px 0; font-size: 13px; letter-spacing: 2px; text-transform: uppercase;">${PLATFORM.name} Staffing Network</p>
          <h1 style="color: white; margin: 0; font-size: 26px; font-weight: 700;">${params.workspaceName}</h1>
          ${licLine}
          <p style="color: #7dd3fc; margin: 12px 0 0 0; font-size: 14px;">Staffing Request Received</p>
        </div>

        <div style="padding: 24px 16px; background-color: #f8fafc; border-radius: 0 0 12px 12px;">

          <p style="font-size: 16px; color: #1e293b; margin: 0 0 18px 0;">Hello ${recipientName},</p>

          <p style="color: #334155; font-size: 14px; line-height: 1.8; margin: 0 0 20px 0;">
            Greetings. My name is <strong>Trinity</strong>, I am the staffing coordinator system for all ${PLATFORM.name} security providers.
            I have received your request to staff the following assignment:
          </p>

          <!-- AI-Generated Job Summary -->
          <div style="background-color: white; padding: 22px; border-radius: 10px; border: 1px solid #e2e8f0; margin-bottom: 24px; border-left: 4px solid #2563eb;">
            <p style="color: #1e40af; font-size: 12px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; margin: 0 0 12px 0;">Assignment Summary</p>
            <div style="color: #334155; font-size: 14px; line-height: 1.8; white-space: pre-line;">${params.jobSummary}</div>
            <p style="color: #94a3b8; font-size: 12px; margin: 14px 0 0 0;">Reference Number: <strong style="color:#1e40af;">${params.referenceNumber}</strong></p>
          </div>

          <p style="color: #334155; font-size: 14px; line-height: 1.8; margin: 0 0 20px 0;">
            I will attempt to staff this with qualified, vetted security officers. All ${PLATFORM.name} providers operate under the same standardized officer ranking structure — the <strong>Officer Readiness Score</strong> — which evaluates each officer on:
          </p>

          <!-- Scoring Structure -->
          <div style="background-color: white; padding: 20px; border-radius: 10px; border: 1px solid #e2e8f0; margin-bottom: 24px;">
            <p style="color: #1e293b; font-size: 14px; font-weight: 700; margin: 0 0 14px 0;">Officer Readiness Score Criteria</p>
            <table style="width:100%;border-collapse:collapse;">
              <tr style="background-color:#f1f5f9;">
                <td style="padding:10px 14px;font-size:13px;color:#334155;font-weight:600;border-radius:6px 0 0 0;">Attendance &amp; Reliability</td>
                <td style="padding:10px 14px;font-size:13px;color:#64748b;">Shift completion rate, punctuality, and no-call history</td>
              </tr>
              <tr>
                <td style="padding:10px 14px;font-size:13px;color:#334155;font-weight:600;">Field Behavior</td>
                <td style="padding:10px 14px;font-size:13px;color:#64748b;">On-site conduct, incident reports, and professionalism</td>
              </tr>
              <tr style="background-color:#f1f5f9;">
                <td style="padding:10px 14px;font-size:13px;color:#334155;font-weight:600;">Years of Experience</td>
                <td style="padding:10px 14px;font-size:13px;color:#64748b;">Verified security industry tenure</td>
              </tr>
              <tr>
                <td style="padding:10px 14px;font-size:13px;color:#334155;font-weight:600;">Certifications &amp; Training</td>
                <td style="padding:10px 14px;font-size:13px;color:#64748b;">State licenses, armed/unarmed credentials, first aid, specialized training</td>
              </tr>
              <tr style="background-color:#f1f5f9;">
                <td style="padding:10px 14px;font-size:13px;color:#334155;font-weight:600;border-radius:0 0 0 6px;">Client &amp; Supervisor Scores</td>
                <td style="padding:10px 14px;font-size:13px;color:#64748b;">Feedback from past assignments and direct supervisor evaluations</td>
              </tr>
            </table>
            <p style="color:#64748b;font-size:12px;margin:12px 0 0 0;font-style:italic;">
              Rest assured — every officer selected for your assignment will be properly vetted within this scoring structure.
            </p>
          </div>

          <!-- What Happens Next -->
          <div style="background-color: #eff6ff; padding: 20px; border-radius: 10px; border: 1px solid #bfdbfe; margin-bottom: 24px;">
            <p style="color: #1e40af; font-size: 14px; font-weight: 700; margin: 0 0 12px 0;">What Happens Next</p>
            <p style="color: #334155; font-size: 14px; line-height: 1.7; margin: 0 0 10px 0;">
              If <strong>${params.workspaceName}</strong> is able to fulfill your request, you will receive a second email from me with:
            </p>
            <ul style="color: #334155; font-size: 14px; padding-left: 20px; margin: 0 0 12px 0; line-height: 1.8;">
              <li>A confirmation of your assignment number</li>
              <li>A summary of your request sent to both you and the provider</li>
              <li>Access to your dedicated <strong>Client Portal</strong> assigned to ${params.workspaceName}</li>
            </ul>
            <p style="color: #334155; font-size: 14px; line-height: 1.7; margin: 0;">
              Inside the portal, you can <strong>contact the provider, send feedback, file complaints, request new staff, replace staff, change schedules, and review all contracts and documents</strong> related to your engagement — via our integrated Help Chat and email system. This eliminates midnight phone calls or the need to dial anyone. This process is automated and resolves issues instantly.
            </p>
          </div>

          <!-- Case Manager -->
          <div style="background-color: #f0fdf4; padding: 18px; border-radius: 10px; border: 1px solid #bbf7d0; margin-bottom: 28px;">
            <p style="color: #065f46; font-size: 14px; margin: 0; line-height: 1.7;">
              A <strong>dedicated case manager</strong> will be assigned to you by ${params.workspaceName} and will reach out to you directly with their contact information once staffing is confirmed.
            </p>
          </div>

          <!-- Sign Off -->
          <p style="color: #334155; font-size: 14px; line-height: 1.7; margin: 0 0 20px 0;">
            As I stated — thank you for trusting ${PLATFORM.name} to staff your needs. I will be in touch shortly.
          </p>

          <p style="color: #1e293b; font-size: 14px; margin: 0;">Sincerely,</p>
          <p style="color: #1e40af; font-size: 18px; font-weight: 700; margin: 6px 0 2px 0; font-style: italic;">Trinity</p>
          <p style="color: #64748b; font-size: 12px; margin: 0;">AI Staffing Coordinator — ${PLATFORM.name} Network</p>
          <p style="color: #94a3b8; font-size: 12px; margin: 4px 0 0 0;">Reply to this email or contact: ${params.orgEmail}</p>

          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 28px 0 20px 0;">
          <p style="color: #94a3b8; font-size: 11px; margin: 0; text-align: center;">
            ${params.workspaceName} | ${PLATFORM.name} Staffing Network | Ref: ${params.referenceNumber}
          </p>
        </div>
        </div>
        </td></tr>
      </table>
    `;

    return this._deliver(
      params.senderEmail,
      `Staffing Request Received — ${params.workspaceName} [Ref: ${params.referenceNumber}]`,
      html,
      'trinity_ai_greeting',
      params.workspaceId
    );
  }

  /**
   * STAFFING ONBOARDING INVITATION — Email 2 sent after shift is staffed
   * Officers confirmed + document pipeline checklist for client onboarding.
   * Triggers: contract signing, DL upload, post orders, provider W9/COI,
   *           guard credentials auto-pulled from document safe.
   */
  async sendStaffingOnboardingInvitation(params: {
    workspaceId: string;
    clientEmail: string;
    clientName?: string;
    workspaceName: string;
    referenceNumber: string;
    confirmationNumber: string;
    portalUrl: string;
    signupUrl: string;
    shiftDetails: {
      location: string;
      date: string;
      startTime: string;
      endTime: string;
      positionType: string;
    };
    assignedOfficers: Array<{ name: string; role?: string; credentialStatus?: string }>;
    nextSteps: {
      contractReady: boolean;
      dlUploadRequired: boolean;
      postOrdersRequired: boolean;
      providerDocsReady: boolean;
    };
  }): Promise<EmailResult> {
    const recipientName = params.clientName || 'there';
    const officerList = params.assignedOfficers.map((o, i) => `
      <tr style="${i % 2 === 0 ? 'background-color:#f8fafc;' : ''}">
        <td style="padding:10px 14px;font-size:14px;color:#1e293b;font-weight:600;">${o.name}</td>
        <td style="padding:10px 14px;font-size:13px;color:#64748b;">${o.role || 'Security Officer'}</td>
        <td style="padding:10px 14px;font-size:13px;">
          <span style="background-color:#dcfce7;color:#065f46;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">
            ${o.credentialStatus || 'Verified'}
          </span>
        </td>
      </tr>
    `).join('');

    const html = `
      <table width="100%" cellpadding="0" cellspacing="0" style="font-family:Arial,sans-serif;background-color:#e8edf2;">
        <tr><td align="center" style="padding:8px 6px;">
        <div style="max-width:640px;width:100%;margin:0 auto;">
        <div style="background: linear-gradient(135deg, #065f46 0%, #047857 50%, #16a34a 100%); padding: 28px 20px; border-radius: 12px 12px 0 0; text-align: center;">
          <p style="color: #a7f3d0; margin: 0 0 6px 0; font-size: 13px; letter-spacing: 2px; text-transform: uppercase;">Assignment Confirmed</p>
          <h1 style="color: white; margin: 0; font-size: 26px; font-weight: 700;">${params.workspaceName}</h1>
          <p style="color: #6ee7b7; margin: 10px 0 0 0; font-size: 14px;">Your staffing request has been fulfilled</p>
        </div>

        <div style="padding: 24px 16px; background-color: #f8fafc; border-radius: 0 0 12px 12px;">

          <p style="font-size: 16px; color: #1e293b; margin: 0 0 18px 0;">Hello ${recipientName},</p>

          <div style="background-color: #ecfdf5; padding: 18px; border-radius: 10px; border: 1px solid #bbf7d0; margin-bottom: 26px;">
            <p style="margin: 0 0 6px 0; color: #065f46; font-size: 15px; font-weight: 700;">
              Your assignment is now staffed.
            </p>
            <p style="margin: 0; color: #047857; font-size: 13px;">
              Confirmation: <strong>${params.confirmationNumber}</strong> &nbsp;|&nbsp; Reference: <strong>${params.referenceNumber}</strong>
            </p>
          </div>

          <p style="color: #334155; font-size: 14px; line-height: 1.8; margin: 0 0 20px 0;">
            The following officers have been selected, vetted through the ${PLATFORM.name} Officer Readiness Score, and have agreed to your assignment:
          </p>

          <!-- Officer Roster -->
          <div style="background-color: white; border-radius: 10px; border: 1px solid #e2e8f0; margin-bottom: 26px; overflow: hidden;">
            <div style="background-color: #1e3a5f; padding: 12px 16px;">
              <p style="color: white; font-size: 14px; font-weight: 700; margin: 0;">Assigned Officers</p>
            </div>
            <table style="width:100%;border-collapse:collapse;">
              <tr style="background-color:#f1f5f9;">
                <th style="padding:10px 14px;font-size:12px;color:#64748b;text-align:left;font-weight:600;">Officer Name</th>
                <th style="padding:10px 14px;font-size:12px;color:#64748b;text-align:left;font-weight:600;">Role</th>
                <th style="padding:10px 14px;font-size:12px;color:#64748b;text-align:left;font-weight:600;">Credential Status</th>
              </tr>
              ${officerList}
            </table>
          </div>

          <!-- Shift Details -->
          <div style="background-color: white; padding: 20px; border-radius: 10px; border: 1px solid #e2e8f0; margin-bottom: 26px;">
            <p style="color: #1e293b; font-size: 14px; font-weight: 700; margin: 0 0 14px 0;">Assignment Details</p>
            <p style="margin:6px 0;font-size:14px;color:#334155;"><strong>Position:</strong> ${params.shiftDetails.positionType}</p>
            <p style="margin:6px 0;font-size:14px;color:#334155;"><strong>Location:</strong> ${params.shiftDetails.location}</p>
            <p style="margin:6px 0;font-size:14px;color:#334155;"><strong>Date:</strong> ${params.shiftDetails.date}</p>
            <p style="margin:6px 0;font-size:14px;color:#334155;"><strong>Hours:</strong> ${params.shiftDetails.startTime} – ${params.shiftDetails.endTime}</p>
          </div>

          <!-- Client Portal CTA -->
          <div style="background-color: #1e3a5f; padding: 26px; border-radius: 12px; margin-bottom: 26px; text-align: center;">
            <p style="color: #93c5fd; font-size: 13px; margin: 0 0 8px 0; letter-spacing: 1px; text-transform: uppercase;">Next Step</p>
            <p style="color: white; font-size: 18px; font-weight: 700; margin: 0 0 12px 0;">Access Your Client Portal</p>
            <p style="color: #bfdbfe; font-size: 13px; line-height: 1.6; margin: 0 0 20px 0;">
              Your dedicated portal is ready. Complete your onboarding in minutes — everything is organized and waiting for you.
            </p>
            <a href="${params.portalUrl}" style="background-color: #2563eb; color: white; padding: 14px 36px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 15px; display: inline-block;">
              Open Client Portal
            </a>
            <p style="color: #93c5fd; font-size: 11px; margin: 16px 0 0 0;">
              Or copy this link: ${params.portalUrl}
            </p>
          </div>

          <!-- Onboarding Checklist -->
          <p style="color: #1e293b; font-size: 15px; font-weight: 700; margin: 0 0 16px 0;">Your Onboarding Checklist</p>
          <p style="color: #475569; font-size: 13px; margin: 0 0 16px 0;">Complete these steps inside the portal. Everything is guided and takes only a few minutes.</p>

          <div style="background-color: white; border-radius: 10px; border: 1px solid #e2e8f0; margin-bottom: 26px; overflow: hidden;">

            <!-- Step 1: Contract -->
            <div style="padding: 18px 20px; border-bottom: 1px solid #f1f5f9;">
              <div style="display:flex;align-items:flex-start;gap:14px;">
                <div style="background-color:#dbeafe;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                  <span style="color:#1e40af;font-size:13px;font-weight:700;">1</span>
                </div>
                <div>
                  <p style="margin:0 0 4px 0;font-size:14px;font-weight:700;color:#1e293b;">Sign the Security Services Agreement</p>
                  <p style="margin:0;font-size:13px;color:#64748b;line-height:1.6;">
                    ${params.workspaceName} has prepared a Security Services Agreement outlining all terms of the engagement. You (or your authorized representative) must sign digitally. This document is for your protection as well as the provider's.
                  </p>
                </div>
              </div>
            </div>

            <!-- Step 2: ID Upload -->
            <div style="padding: 18px 20px; border-bottom: 1px solid #f1f5f9; background-color:#fafafa;">
              <div style="display:flex;align-items:flex-start;gap:14px;">
                <div style="background-color:#dbeafe;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                  <span style="color:#1e40af;font-size:13px;font-weight:700;">2</span>
                </div>
                <div>
                  <p style="margin:0 0 4px 0;font-size:14px;font-weight:700;color:#1e293b;">Upload Government-Issued ID</p>
                  <p style="margin:0;font-size:13px;color:#64748b;line-height:1.6;">
                    A front-facing copy of your driver's license or government ID is required from the signing representative. This is kept securely for identity verification and billing accountability purposes only.
                  </p>
                </div>
              </div>
            </div>

            <!-- Step 3: Post Orders -->
            <div style="padding: 18px 20px; border-bottom: 1px solid #f1f5f9;">
              <div style="display:flex;align-items:flex-start;gap:14px;">
                <div style="background-color:#dbeafe;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                  <span style="color:#1e40af;font-size:13px;font-weight:700;">3</span>
                </div>
                <div>
                  <p style="margin:0 0 4px 0;font-size:14px;font-weight:700;color:#1e293b;">Set Up Post Orders</p>
                  <p style="margin:0;font-size:13px;color:#64748b;line-height:1.6;">
                    Post Orders are the specific instructions your assigned officers will follow on-site. Describe access points, protocols, what to report, dress code specifics, and any site-specific procedures. These are automatically distributed to your officers and their supervisors.
                  </p>
                </div>
              </div>
            </div>

            <!-- Step 4: Provider Docs (auto-fetched) -->
            <div style="padding: 18px 20px; background-color:#fafafa;">
              <div style="display:flex;align-items:flex-start;gap:14px;">
                <div style="background-color:#dcfce7;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                  <span style="color:#065f46;font-size:13px;font-weight:700;">✓</span>
                </div>
                <div>
                  <p style="margin:0 0 4px 0;font-size:14px;font-weight:700;color:#1e293b;">Provider Documents — Auto-Prepared by Trinity</p>
                  <p style="margin:0;font-size:13px;color:#64748b;line-height:1.6;">
                    The following documents are automatically gathered and included in your portal by Trinity, with no action required on your part:
                  </p>
                  <ul style="margin:8px 0 0 0;padding-left:18px;color:#64748b;font-size:13px;line-height:1.8;">
                    <li><strong>Signed W-9</strong> — Provider tax form</li>
                    <li><strong>Certificate of Security Insurance (COI)</strong> — Proof of liability coverage</li>
                    <li><strong>Company Operating License</strong> — State security company certificate</li>
                    <li><strong>Officer License Copies</strong> — Front-facing credential copy for each assigned officer, pulled from the ${PLATFORM.name} Document Safe</li>
                  </ul>
                </div>
              </div>
            </div>

          </div>

          <!-- Footer sign-off -->
          <p style="color: #334155; font-size: 14px; line-height: 1.8; margin: 0 0 20px 0;">
            All of this is organized, automated, and waiting for you in the portal. There is nothing to print, fax, or mail. If you have any questions at any step, the Help Chat in your portal connects you directly to your provider.
          </p>

          <p style="color: #1e293b; font-size: 14px; margin: 0;">Sincerely,</p>
          <p style="color: #1e40af; font-size: 18px; font-weight: 700; margin: 6px 0 2px 0; font-style: italic;">Trinity</p>
          <p style="color: #64748b; font-size: 12px; margin: 0;">AI Staffing Coordinator — ${PLATFORM.name} Network</p>

          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 28px 0 20px 0;">
          <p style="color: #94a3b8; font-size: 11px; margin: 0; text-align: center;">
            ${params.workspaceName} | Confirmation: ${params.confirmationNumber} | ${PLATFORM.name} Platform
          </p>
        </div>
        </div>
        </td></tr>
      </table>
    `;

    const { NotificationDeliveryService: NDS4 } = await import('./notificationDeliveryService');
    await NDS4.send({ type: 'staffing_onboarding_invitation', workspaceId: params.workspaceId || 'system', recipientUserId: params.clientEmail, channel: 'email', body: { to: params.clientEmail, subject: `Your Assignment is Staffed — ${params.workspaceName} [${params.confirmationNumber}]`, html } });
    return { success: true };
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
  return emailService.sendAssistedOnboardingHandoff(params); // infra
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
    html: emailLayout({
      preheader: `A ${data.domain} automation action requires your approval before it can proceed.`,
      header: emailHeader({ title: 'Automation Approval Required', subtitle: 'Human review required before this action runs', badge: 'Governance', theme: 'orange' }),
      body:
        greeting(data.firstName) +
        para(`A <strong>${data.domain}</strong> automation action requires your approval. This is part of ${PLATFORM.name}'s 99% automation / 1% oversight governance model.`) +
        infoCard({
          title: 'Action Details',
          rows: [
            { label: 'Action Type', value: data.actionType, highlight: true },
            { label: 'Domain', value: `${data.domain.charAt(0).toUpperCase() + data.domain.slice(1)}` },
            { label: 'Affected Records', value: String(data.affectedRecords) },
          ],
        }) +
        '<table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:28px 0;"><tr><td align="center">' +
        ctaButton({ text: 'Review &amp; Approve', url: data.approvalUrl, style: 'success' }) +
        '</td></tr></table>' +
        alertBox({ type: 'warning', title: 'Action required', body: 'This automation is paused awaiting your review. Please approve or deny within 24 hours to avoid workflow delays.' }),
    }),
  }),

  hotpatch_scheduled: (data: {
    firstName: string;
    patchTitle: string;
    scheduledTime: string;
    affectedComponents: string[];
  }) => ({
    subject: `Hotpatch Scheduled: ${data.patchTitle}`,
    html: emailLayout({
      preheader: `A platform hotpatch has been scheduled for ${data.scheduledTime}.`,
      header: emailHeader({ title: 'Hotpatch Scheduled', subtitle: 'A platform update is scheduled', badge: 'System Update', theme: 'purple' }),
      body:
        greeting(data.firstName) +
        para(`A hotpatch has been scheduled for the ${PLATFORM.name} platform. This update will be applied automatically during the maintenance window.`) +
        infoCard({
          title: 'Patch Details',
          rows: [
            { label: 'Title', value: data.patchTitle, highlight: true },
            { label: 'Scheduled Time', value: data.scheduledTime },
          ],
        }) +
        sectionHeading('Affected components:') +
        checkList(data.affectedComponents, '#7c3aed') +
        alertBox({ type: 'info', title: 'Minimal impact expected', body: 'This patch is scheduled during the maintenance window (2:00 AM \u2013 5:00 AM UTC). Most users will not notice any interruption.' }),
    }),
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
  return emailService.sendCustomEmail(params.to, subject, html, `automation_${params.type}`); // infra
}
