/**
 * Onboarding / invitation email templates: manager notifications, client
 * welcome, employee invites, support role briefings, organization
 * invitations, public lead welcome, assisted handoff. Split from emailService.ts.
 */
import {
  emailLayout, emailHeader, greeting, para, infoCard, alertBox,
  stepList, checkList, ctaButton, sectionHeading,
} from '../../emailTemplateBase';
import { PLATFORM } from '@shared/platformConfig';

export const onboardingEmailTemplates = {
  managerOnboardingNotification: (data: {
    managerName: string;
    employeeName: string;
    workspaceName: string;
    employeeProfileUrl?: string;
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
        (data.employeeProfileUrl ? ctaButton({ text: 'View Employee Profile', url: data.employeeProfileUrl }) : '') +
        checkList([
          'Ensure the employee has received their login credentials',
          'Assign the employee to their first shift',
          'Review any outstanding onboarding documents',
          'Confirm system access is properly configured',
        ]) +
        para(`Log in to your ${PLATFORM.name} dashboard to complete any pending onboarding tasks.`, { muted: true }),
    }),
  }),

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
};
