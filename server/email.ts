// Email notification service using Resend
import { Resend } from 'resend';

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=resend',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || (!connectionSettings.settings.api_key)) {
    throw new Error('Resend not connected');
  }
  return {apiKey: connectionSettings.settings.api_key, fromEmail: connectionSettings.settings.from_email};
}

// WARNING: Never cache this client.
// Access tokens expire, so a new client must be created each time.
export async function getUncachableResendClient() {
  const { apiKey, fromEmail } = await getCredentials();
  return {
    client: new Resend(apiKey),
    fromEmail: fromEmail
  };
}

// Email Templates
export const emailTemplates = {
  shiftAssignment: (data: {
    employeeName: string;
    shiftTitle: string;
    startTime: string;
    endTime: string;
    clientName?: string;
  }) => ({
    subject: `New Shift Assignment: ${data.shiftTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">New Shift Assignment</h2>
        <p>Hello ${data.employeeName},</p>
        <p>You have been assigned to a new shift:</p>
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 5px 0;"><strong>Shift:</strong> ${data.shiftTitle}</p>
          <p style="margin: 5px 0;"><strong>Start:</strong> ${data.startTime}</p>
          <p style="margin: 5px 0;"><strong>End:</strong> ${data.endTime}</p>
          ${data.clientName ? `<p style="margin: 5px 0;"><strong>Client:</strong> ${data.clientName}</p>` : ''}
        </div>
        <p>Please make sure you're available for this shift.</p>
        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
          This is an automated message from ShiftSync.
        </p>
      </div>
    `
  }),

  shiftReminder: (data: {
    employeeName: string;
    shiftTitle: string;
    startTime: string;
    clientName?: string;
  }) => ({
    subject: `Shift Reminder: ${data.shiftTitle} starts in 1 hour`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #ea580c;">Shift Reminder</h2>
        <p>Hello ${data.employeeName},</p>
        <p>This is a reminder that your shift starts in 1 hour:</p>
        <div style="background-color: #fff7ed; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ea580c;">
          <p style="margin: 5px 0;"><strong>Shift:</strong> ${data.shiftTitle}</p>
          <p style="margin: 5px 0;"><strong>Starts at:</strong> ${data.startTime}</p>
          ${data.clientName ? `<p style="margin: 5px 0;"><strong>Client:</strong> ${data.clientName}</p>` : ''}
        </div>
        <p>Please prepare to clock in on time.</p>
        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
          This is an automated message from ShiftSync.
        </p>
      </div>
    `
  }),

  invoiceGenerated: (data: {
    clientName: string;
    invoiceNumber: string;
    total: string;
    dueDate: string;
  }) => ({
    subject: `Invoice ${data.invoiceNumber} - ${data.clientName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">New Invoice Generated</h2>
        <p>Hello,</p>
        <p>A new invoice has been generated:</p>
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 5px 0;"><strong>Invoice Number:</strong> ${data.invoiceNumber}</p>
          <p style="margin: 5px 0;"><strong>Client:</strong> ${data.clientName}</p>
          <p style="margin: 5px 0;"><strong>Amount:</strong> $${data.total}</p>
          <p style="margin: 5px 0;"><strong>Due Date:</strong> ${data.dueDate}</p>
        </div>
        <p>Please review the invoice in your dashboard.</p>
        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
          This is an automated message from AutoForce™.
        </p>
      </div>
    `
  }),

  invoiceOverdueReminder: (data: {
    clientName: string;
    invoiceNumber: string;
    total: string;
    dueDate: string;
    daysOverdue: number;
    paymentUrl: string;
  }) => ({
    subject: `Payment Reminder: Invoice ${data.invoiceNumber} is ${data.daysOverdue} Days Overdue`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">Payment Reminder</h2>
        <p>Dear ${data.clientName},</p>
        <p>This is a reminder that your invoice is now <strong style="color: #dc2626;">${data.daysOverdue} days overdue</strong>.</p>
        <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626;">
          <p style="margin: 5px 0;"><strong>Invoice Number:</strong> ${data.invoiceNumber}</p>
          <p style="margin: 5px 0;"><strong>Amount Due:</strong> <span style="color: #dc2626; font-size: 18px; font-weight: bold;">$${data.total}</span></p>
          <p style="margin: 5px 0;"><strong>Original Due Date:</strong> ${data.dueDate}</p>
          <p style="margin: 5px 0;"><strong>Days Overdue:</strong> ${data.daysOverdue}</p>
        </div>
        ${data.daysOverdue >= 30 ? `
          <div style="background-color: #fef2f2; padding: 15px; border-radius: 8px; margin: 20px 0; border: 2px solid #dc2626;">
            <p style="margin: 0; color: #dc2626; font-weight: bold;">URGENT: This account requires immediate attention</p>
          </div>
        ` : ''}
        <p><strong>Please remit payment as soon as possible to avoid service interruption.</strong></p>
        <div style="margin: 30px 0;">
          <a href="${data.paymentUrl}" 
             style="display: inline-block; background-color: #dc2626; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
            Pay Invoice Now
          </a>
        </div>
        <p style="font-size: 14px; color: #6b7280;">
          If you have already submitted payment, please disregard this notice. If you have questions about this invoice, please contact us immediately.
        </p>
        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
          This is an automated reminder from AutoForce™ Billing.
        </p>
      </div>
    `
  }),

  employeeOnboarding: (data: {
    employeeName: string;
    workspaceName: string;
    role?: string;
  }) => ({
    subject: `Welcome to ${data.workspaceName}!`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #16a34a;">Welcome to the Team!</h2>
        <p>Hello ${data.employeeName},</p>
        <p>Welcome to ${data.workspaceName}! We're excited to have you on board.</p>
        <div style="background-color: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #16a34a;">
          ${data.role ? `<p style="margin: 5px 0;"><strong>Your Role:</strong> ${data.role}</p>` : ''}
          <p style="margin: 15px 0 5px 0;">You'll soon receive your shift assignments and can start tracking your time through our platform.</p>
        </div>
        <p>If you have any questions, please don't hesitate to reach out to your manager.</p>
        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
          This is an automated message from ShiftSync.
        </p>
      </div>
    `
  }),
  
  onboardingInvite: (data: {
    employeeName: string;
    workspaceName: string;
    onboardingUrl: string;
    expiresIn: string;
  }) => ({
    subject: `Complete Your Onboarding for ${data.workspaceName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">You're Invited to Join ${data.workspaceName}</h2>
        <p>Hello ${data.employeeName},</p>
        <p>You have been invited to join ${data.workspaceName}. To complete your onboarding, please click the button below:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${data.onboardingUrl}" style="background-color: #2563eb; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">
            Complete Onboarding
          </a>
        </div>
        <p style="color: #6b7280; font-size: 14px;">This link will expire in ${data.expiresIn}.</p>
        <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2563eb;">
          <p style="margin: 5px 0; font-weight: 600;">What to expect:</p>
          <ul style="margin: 10px 0; padding-left: 20px; line-height: 1.6;">
            <li>Complete personal information</li>
            <li>Submit tax classification (W-4 or W-9)</li>
            <li>Upload required documents (ID, certifications)</li>
            <li>Set work availability for scheduling</li>
            <li>Sign necessary agreements</li>
          </ul>
        </div>
        <p style="color: #6b7280; font-size: 12px; margin-top: 30px;">
          If you did not expect this invitation, please ignore this email.<br>
          This is an automated message from WorkforceOS.
        </p>
      </div>
    `
  }),

  ptoApproved: (data: {
    employeeName: string;
    startDate: string;
    endDate: string;
    ptoType: string;
    days: number;
  }) => ({
    subject: `PTO Request Approved - ${data.ptoType}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #16a34a;">PTO Request Approved</h2>
        <p>Hello ${data.employeeName},</p>
        <p>Your PTO request has been approved!</p>
        <div style="background-color: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #16a34a;">
          <p style="margin: 5px 0;"><strong>Type:</strong> ${data.ptoType}</p>
          <p style="margin: 5px 0;"><strong>Start Date:</strong> ${data.startDate}</p>
          <p style="margin: 5px 0;"><strong>End Date:</strong> ${data.endDate}</p>
          <p style="margin: 5px 0;"><strong>Total Days:</strong> ${data.days}</p>
        </div>
        <p>Enjoy your time off!</p>
        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
          This is an automated message from WorkforceOS.
        </p>
      </div>
    `
  }),

  ptoDenied: (data: {
    employeeName: string;
    startDate: string;
    endDate: string;
    ptoType: string;
    denialReason?: string;
  }) => ({
    subject: `PTO Request Denied - ${data.ptoType}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">PTO Request Denied</h2>
        <p>Hello ${data.employeeName},</p>
        <p>Unfortunately, your PTO request has been denied.</p>
        <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626;">
          <p style="margin: 5px 0;"><strong>Type:</strong> ${data.ptoType}</p>
          <p style="margin: 5px 0;"><strong>Requested Dates:</strong> ${data.startDate} to ${data.endDate}</p>
          ${data.denialReason ? `<p style="margin: 5px 0;"><strong>Reason:</strong> ${data.denialReason}</p>` : ''}
        </div>
        <p>Please contact your manager if you have questions about this decision.</p>
        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
          This is an automated message from AutoForce™.
        </p>
      </div>
    `
  }),

  shiftActionApproved: (data: {
    employeeName: string;
    actionType: string;
    shiftTitle: string;
    shiftDate: string;
  }) => ({
    subject: `Shift ${data.actionType} Request Approved`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #16a34a;">Shift Request Approved</h2>
        <p>Hello ${data.employeeName},</p>
        <p>Your shift ${data.actionType.toLowerCase()} request has been approved!</p>
        <div style="background-color: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #16a34a;">
          <p style="margin: 5px 0;"><strong>Action:</strong> ${data.actionType}</p>
          <p style="margin: 5px 0;"><strong>Shift:</strong> ${data.shiftTitle}</p>
          <p style="margin: 5px 0;"><strong>Date:</strong> ${data.shiftDate}</p>
        </div>
        <p>The schedule has been updated accordingly.</p>
        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
          This is an automated message from AutoForce™.
        </p>
      </div>
    `
  }),

  shiftActionDenied: (data: {
    employeeName: string;
    actionType: string;
    shiftTitle: string;
    shiftDate: string;
    denialReason?: string;
  }) => ({
    subject: `Shift ${data.actionType} Request Denied`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">Shift Request Denied</h2>
        <p>Hello ${data.employeeName},</p>
        <p>Your shift ${data.actionType.toLowerCase()} request has been denied.</p>
        <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626;">
          <p style="margin: 5px 0;"><strong>Action:</strong> ${data.actionType}</p>
          <p style="margin: 5px 0;"><strong>Shift:</strong> ${data.shiftTitle}</p>
          <p style="margin: 5px 0;"><strong>Date:</strong> ${data.shiftDate}</p>
          ${data.denialReason ? `<p style="margin: 5px 0;"><strong>Reason:</strong> ${data.denialReason}</p>` : ''}
        </div>
        <p>Please contact your manager if you have questions about this decision.</p>
        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
          This is an automated message from AutoForce™.
        </p>
      </div>
    `
  }),

  timesheetEditApproved: (data: {
    employeeName: string;
    timeEntryDate: string;
    changes: string;
  }) => ({
    subject: `Timesheet Edit Request Approved`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #16a34a;">Timesheet Edit Approved</h2>
        <p>Hello ${data.employeeName},</p>
        <p>Your timesheet edit request has been approved and applied.</p>
        <div style="background-color: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #16a34a;">
          <p style="margin: 5px 0;"><strong>Date:</strong> ${data.timeEntryDate}</p>
          <p style="margin: 5px 0;"><strong>Changes:</strong> ${data.changes}</p>
        </div>
        <p>Your timesheet has been updated with the approved changes.</p>
        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
          This is an automated message from AutoForce™.
        </p>
      </div>
    `
  }),

  timesheetEditDenied: (data: {
    employeeName: string;
    timeEntryDate: string;
    changes: string;
    denialReason?: string;
  }) => ({
    subject: `Timesheet Edit Request Denied`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">Timesheet Edit Denied</h2>
        <p>Hello ${data.employeeName},</p>
        <p>Your timesheet edit request has been denied.</p>
        <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626;">
          <p style="margin: 5px 0;"><strong>Date:</strong> ${data.timeEntryDate}</p>
          <p style="margin: 5px 0;"><strong>Requested Changes:</strong> ${data.changes}</p>
          ${data.denialReason ? `<p style="margin: 5px 0;"><strong>Reason:</strong> ${data.denialReason}</p>` : ''}
        </div>
        <p>Please contact your manager if you have questions about this decision.</p>
        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
          This is an automated message from AutoForce™.
        </p>
      </div>
    `
  }),

  performanceReview: (data: {
    employeeName: string;
    reviewType: string;
    reviewDate: string;
    reviewerName: string;
  }) => ({
    subject: `Performance Review Scheduled - ${data.reviewType}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #6366f1;">Performance Review Scheduled</h2>
        <p>Hello ${data.employeeName},</p>
        <p>A performance review has been scheduled for you.</p>
        <div style="background-color: #eef2ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #6366f1;">
          <p style="margin: 5px 0;"><strong>Review Type:</strong> ${data.reviewType}</p>
          <p style="margin: 5px 0;"><strong>Date:</strong> ${data.reviewDate}</p>
          <p style="margin: 5px 0;"><strong>Reviewer:</strong> ${data.reviewerName}</p>
        </div>
        <p>Please prepare for the review and be ready to discuss your accomplishments, challenges, and goals.</p>
        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
          This is an automated message from WorkforceOS.
        </p>
      </div>
    `
  }),

  benefitEnrollment: (data: {
    employeeName: string;
    benefitType: string;
    startDate: string;
    monthlyContribution?: string;
  }) => ({
    subject: `Benefit Enrollment Confirmation - ${data.benefitType}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #16a34a;">Benefit Enrollment Confirmed</h2>
        <p>Hello ${data.employeeName},</p>
        <p>Your benefit enrollment has been processed successfully.</p>
        <div style="background-color: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #16a34a;">
          <p style="margin: 5px 0;"><strong>Benefit Type:</strong> ${data.benefitType}</p>
          <p style="margin: 5px 0;"><strong>Start Date:</strong> ${data.startDate}</p>
          ${data.monthlyContribution ? `<p style="margin: 5px 0;"><strong>Monthly Contribution:</strong> $${data.monthlyContribution}</p>` : ''}
        </div>
        <p>You will receive additional documentation about your benefits coverage shortly.</p>
        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
          This is an automated message from WorkforceOS.
        </p>
      </div>
    `
  }),

  terminationNotice: (data: {
    employeeName: string;
    terminationDate: string;
    terminationType: string;
    hrContactEmail: string;
  }) => ({
    subject: `Important: Offboarding Information`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #6366f1;">Offboarding Information</h2>
        <p>Hello ${data.employeeName},</p>
        <p>This email contains important information regarding your departure from the company.</p>
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #6366f1;">
          <p style="margin: 5px 0;"><strong>Departure Type:</strong> ${data.terminationType}</p>
          <p style="margin: 5px 0;"><strong>Last Day:</strong> ${data.terminationDate}</p>
        </div>
        <div style="background-color: #fffbeb; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
          <p style="margin: 5px 0; font-weight: 600;">Next Steps:</p>
          <ul style="margin: 10px 0; padding-left: 20px; line-height: 1.6;">
            <li>Exit interview will be scheduled</li>
            <li>Return all company property</li>
            <li>Complete final paperwork</li>
            <li>Review final paycheck details</li>
          </ul>
        </div>
        <p>If you have any questions, please contact HR at <a href="mailto:${data.hrContactEmail}">${data.hrContactEmail}</a></p>
        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
          This is an automated message from WorkforceOS.
        </p>
      </div>
    `
  }),

  reportDelivery: (data: {
    clientName: string;
    reportNumber: string;
    reportName: string;
    submittedBy: string;
    submittedDate: string;
    reportData: Record<string, any>;
    attachmentCount?: number;
  }) => ({
    subject: `Report Delivery: ${data.reportName} [${data.reportNumber}]`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); padding: 30px; border-radius: 8px 8px 0 0;">
          <h2 style="color: white; margin: 0;">Report Delivered</h2>
        </div>
        <div style="background-color: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p>Hello ${data.clientName},</p>
          <p>A new report has been completed and delivered to you.</p>
          
          <div style="background-color: #eef2ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #6366f1;">
            <p style="margin: 5px 0;"><strong>Report Name:</strong> ${data.reportName}</p>
            <p style="margin: 5px 0;"><strong>Tracking ID:</strong> <span style="font-family: monospace; background-color: #ddd6fe; padding: 2px 6px; border-radius: 4px;">${data.reportNumber}</span></p>
            <p style="margin: 5px 0;"><strong>Submitted By:</strong> ${data.submittedBy}</p>
            <p style="margin: 5px 0;"><strong>Submitted Date:</strong> ${data.submittedDate}</p>
            ${data.attachmentCount ? `<p style="margin: 5px 0;"><strong>Attachments:</strong> ${data.attachmentCount} photo(s)</p>` : ''}
          </div>

          <h3 style="color: #6366f1; margin-top: 30px;">Report Details</h3>
          <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
            ${Object.entries(data.reportData)
              .map(([key, value]) => `
                <p style="margin: 8px 0;">
                  <strong style="color: #374151;">${key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}:</strong> 
                  <span style="color: #6b7280;">${value || 'N/A'}</span>
                </p>
              `)
              .join('')}
          </div>

          <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
            Please retain this tracking ID (<strong>${data.reportNumber}</strong>) for your records.
          </p>
          
          <p style="color: #6b7280; font-size: 12px; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
            This is an automated report delivery from WorkforceOS.
          </p>
        </div>
      </div>
    `
  }),

  // Dispute Resolution Notifications
  reviewDeleted: (data: {
    recipientName: string;
    reviewType: string;
    deletedBy: string;
    explanation: string;
  }) => ({
    subject: `Performance Review Removed - Action Taken`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">Performance Review Removed</h2>
        <p>Hello ${data.recipientName},</p>
        <p>A performance review has been removed from your record by platform support.</p>
        <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626;">
          <p style="margin: 5px 0;"><strong>Review Type:</strong> ${data.reviewType}</p>
          <p style="margin: 5px 0;"><strong>Removed By:</strong> ${data.deletedBy}</p>
        </div>
        <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 5px 0; font-weight: 600;">Explanation:</p>
          <p style="margin: 10px 0; line-height: 1.6;">${data.explanation}</p>
        </div>
        <p>If you have questions about this action, please contact platform support.</p>
        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
          This is an automated message from WorkforceOS Support.
        </p>
      </div>
    `
  }),

  reviewEdited: (data: {
    recipientName: string;
    reviewType: string;
    editedBy: string;
    changesDescription: string;
    explanation: string;
  }) => ({
    subject: `Performance Review Updated - Action Taken`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #ea580c;">Performance Review Updated</h2>
        <p>Hello ${data.recipientName},</p>
        <p>A performance review in your record has been updated by platform support.</p>
        <div style="background-color: #fff7ed; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ea580c;">
          <p style="margin: 5px 0;"><strong>Review Type:</strong> ${data.reviewType}</p>
          <p style="margin: 5px 0;"><strong>Updated By:</strong> ${data.editedBy}</p>
          <p style="margin: 5px 0;"><strong>Changes:</strong> ${data.changesDescription}</p>
        </div>
        <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 5px 0; font-weight: 600;">Explanation:</p>
          <p style="margin: 10px 0; line-height: 1.6;">${data.explanation}</p>
        </div>
        <p>If you have questions about this action, please contact platform support.</p>
        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
          This is an automated message from WorkforceOS Support.
        </p>
      </div>
    `
  }),

  ratingDeleted: (data: {
    workspaceName: string;
    deletedBy: string;
    explanation: string;
  }) => ({
    subject: `Employer Rating Removed - Action Taken`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">Employer Rating Removed</h2>
        <p>Hello ${data.workspaceName} Team,</p>
        <p>An employer rating for your organization has been removed by platform support.</p>
        <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626;">
          <p style="margin: 5px 0;"><strong>Removed By:</strong> ${data.deletedBy}</p>
        </div>
        <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 5px 0; font-weight: 600;">Explanation:</p>
          <p style="margin: 10px 0; line-height: 1.6;">${data.explanation}</p>
        </div>
        <p>This action was taken to ensure rating integrity and prevent spam or abuse.</p>
        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
          This is an automated message from WorkforceOS Support.
        </p>
      </div>
    `
  }),

  writeUpDeleted: (data: {
    recipientName: string;
    reportType: string;
    deletedBy: string;
    explanation: string;
  }) => ({
    subject: `Disciplinary Report Removed - Action Taken`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #16a34a;">Disciplinary Report Removed</h2>
        <p>Hello ${data.recipientName},</p>
        <p>A disciplinary report has been removed from your record by platform support.</p>
        <div style="background-color: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #16a34a;">
          <p style="margin: 5px 0;"><strong>Report Type:</strong> ${data.reportType}</p>
          <p style="margin: 5px 0;"><strong>Removed By:</strong> ${data.deletedBy}</p>
        </div>
        <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 5px 0; font-weight: 600;">Explanation:</p>
          <p style="margin: 10px 0; line-height: 1.6;">${data.explanation}</p>
        </div>
        <p>Your record has been updated to reflect this change.</p>
        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
          This is an automated message from WorkforceOS Support.
        </p>
      </div>
    `
  })
};

// Email sending functions
export async function sendShiftAssignmentEmail(
  to: string,
  data: Parameters<typeof emailTemplates.shiftAssignment>[0]
) {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const template = emailTemplates.shiftAssignment(data);
    
    const result = await client.emails.send({
      from: fromEmail,
      to: [to],
      subject: template.subject,
      html: template.html,
    });

    return { success: true, data: result };
  } catch (error) {
    console.error('Error sending shift assignment email:', error);
    return { success: false, error };
  }
}

export async function sendShiftReminderEmail(
  to: string,
  data: Parameters<typeof emailTemplates.shiftReminder>[0]
) {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const template = emailTemplates.shiftReminder(data);
    
    const result = await client.emails.send({
      from: fromEmail,
      to: [to],
      subject: template.subject,
      html: template.html,
    });

    return { success: true, data: result };
  } catch (error) {
    console.error('Error sending shift reminder email:', error);
    return { success: false, error };
  }
}

export async function sendInvoiceGeneratedEmail(
  to: string,
  data: Parameters<typeof emailTemplates.invoiceGenerated>[0]
) {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const template = emailTemplates.invoiceGenerated(data);
    
    const result = await client.emails.send({
      from: fromEmail,
      to: [to],
      subject: template.subject,
      html: template.html,
    });

    return { success: true, data: result };
  } catch (error) {
    console.error('Error sending invoice email:', error);
    return { success: false, error };
  }
}

export async function sendInvoiceOverdueReminderEmail(
  to: string,
  data: Parameters<typeof emailTemplates.invoiceOverdueReminder>[0]
) {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const template = emailTemplates.invoiceOverdueReminder(data);
    
    const result = await client.emails.send({
      from: fromEmail,
      to: [to],
      subject: template.subject,
      html: template.html,
    });

    return { success: true, data: result };
  } catch (error) {
    console.error('Error sending overdue invoice reminder:', error);
    return { success: false, error };
  }
}

export async function sendEmployeeOnboardingEmail(
  to: string,
  data: Parameters<typeof emailTemplates.employeeOnboarding>[0]
) {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const template = emailTemplates.employeeOnboarding(data);
    
    const result = await client.emails.send({
      from: fromEmail,
      to: [to],
      subject: template.subject,
      html: template.html,
    });

    return { success: true, data: result };
  } catch (error) {
    console.error('Error sending onboarding email:', error);
    return { success: false, error };
  }
}

export async function sendOnboardingInviteEmail(
  to: string,
  data: Parameters<typeof emailTemplates.onboardingInvite>[0]
) {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const template = emailTemplates.onboardingInvite(data);
    
    const result = await client.emails.send({
      from: fromEmail,
      to: [to],
      subject: template.subject,
      html: template.html,
    });

    return { success: true, data: result };
  } catch (error) {
    console.error('Error sending onboarding invite email:', error);
    return { success: false, error };
  }
}

export async function sendPTOApprovedEmail(
  to: string,
  data: Parameters<typeof emailTemplates.ptoApproved>[0]
) {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const template = emailTemplates.ptoApproved(data);
    
    const result = await client.emails.send({
      from: fromEmail,
      to: [to],
      subject: template.subject,
      html: template.html,
    });

    return { success: true, data: result };
  } catch (error) {
    console.error('Error sending PTO approved email:', error);
    return { success: false, error };
  }
}

export async function sendPTODeniedEmail(
  to: string,
  data: Parameters<typeof emailTemplates.ptoDenied>[0]
) {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const template = emailTemplates.ptoDenied(data);
    
    const result = await client.emails.send({
      from: fromEmail,
      to: [to],
      subject: template.subject,
      html: template.html,
    });

    return { success: true, data: result };
  } catch (error) {
    console.error('Error sending PTO denied email:', error);
    return { success: false, error };
  }
}

export async function sendPerformanceReviewEmail(
  to: string,
  data: Parameters<typeof emailTemplates.performanceReview>[0]
) {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const template = emailTemplates.performanceReview(data);
    
    const result = await client.emails.send({
      from: fromEmail,
      to: [to],
      subject: template.subject,
      html: template.html,
    });

    return { success: true, data: result };
  } catch (error) {
    console.error('Error sending performance review email:', error);
    return { success: false, error };
  }
}

export async function sendBenefitEnrollmentEmail(
  to: string,
  data: Parameters<typeof emailTemplates.benefitEnrollment>[0]
) {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const template = emailTemplates.benefitEnrollment(data);
    
    const result = await client.emails.send({
      from: fromEmail,
      to: [to],
      subject: template.subject,
      html: template.html,
    });

    return { success: true, data: result };
  } catch (error) {
    console.error('Error sending benefit enrollment email:', error);
    return { success: false, error };
  }
}

export async function sendTerminationNoticeEmail(
  to: string,
  data: Parameters<typeof emailTemplates.terminationNotice>[0]
) {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const template = emailTemplates.terminationNotice(data);
    
    const result = await client.emails.send({
      from: fromEmail,
      to: [to],
      subject: template.subject,
      html: template.html,
    });

    return { success: true, data: result };
  } catch (error) {
    console.error('Error sending termination notice email:', error);
    return { success: false, error };
  }
}

export async function sendReportDeliveryEmail(
  to: string,
  data: Parameters<typeof emailTemplates.reportDelivery>[0]
) {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const template = emailTemplates.reportDelivery(data);
    
    const result = await client.emails.send({
      from: fromEmail,
      to: [to],
      subject: template.subject,
      html: template.html,
    });

    return { success: true, data: result };
  } catch (error) {
    console.error('Error sending report delivery email:', error);
    return { success: false, error };
  }
}

// Dispute Resolution Email Functions
export async function sendReviewDeletedEmail(
  to: string,
  data: Parameters<typeof emailTemplates.reviewDeleted>[0]
) {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const template = emailTemplates.reviewDeleted(data);
    
    const result = await client.emails.send({
      from: fromEmail,
      to: [to],
      subject: template.subject,
      html: template.html,
    });

    return { success: true, data: result };
  } catch (error) {
    console.error('Error sending review deleted email:', error);
    return { success: false, error };
  }
}

export async function sendReviewEditedEmail(
  to: string,
  data: Parameters<typeof emailTemplates.reviewEdited>[0]
) {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const template = emailTemplates.reviewEdited(data);
    
    const result = await client.emails.send({
      from: fromEmail,
      to: [to],
      subject: template.subject,
      html: template.html,
    });

    return { success: true, data: result };
  } catch (error) {
    console.error('Error sending review edited email:', error);
    return { success: false, error };
  }
}

export async function sendRatingDeletedEmail(
  to: string,
  data: Parameters<typeof emailTemplates.ratingDeleted>[0]
) {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const template = emailTemplates.ratingDeleted(data);
    
    const result = await client.emails.send({
      from: fromEmail,
      to: [to],
      subject: template.subject,
      html: template.html,
    });

    return { success: true, data: result };
  } catch (error) {
    console.error('Error sending rating deleted email:', error);
    return { success: false, error };
  }
}

export async function sendWriteUpDeletedEmail(
  to: string,
  data: Parameters<typeof emailTemplates.writeUpDeleted>[0]
) {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const template = emailTemplates.writeUpDeleted(data);
    
    const result = await client.emails.send({
      from: fromEmail,
      to: [to],
      subject: template.subject,
      html: template.html,
    });

    return { success: true, data: result };
  } catch (error) {
    console.error('Error sending write-up deleted email:', error);
    return { success: false, error };
  }
}

// Shift Action Notification Emails
export async function sendShiftActionApprovedEmail(
  to: string,
  data: Parameters<typeof emailTemplates.shiftActionApproved>[0]
) {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const template = emailTemplates.shiftActionApproved(data);
    
    const result = await client.emails.send({
      from: fromEmail,
      to: [to],
      subject: template.subject,
      html: template.html,
    });

    return { success: true, data: result };
  } catch (error) {
    console.error('Error sending shift action approved email:', error);
    return { success: false, error };
  }
}

export async function sendShiftActionDeniedEmail(
  to: string,
  data: Parameters<typeof emailTemplates.shiftActionDenied>[0]
) {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const template = emailTemplates.shiftActionDenied(data);
    
    const result = await client.emails.send({
      from: fromEmail,
      to: [to],
      subject: template.subject,
      html: template.html,
    });

    return { success: true, data: result };
  } catch (error) {
    console.error('Error sending shift action denied email:', error);
    return { success: false, error };
  }
}

// Timesheet Edit Request Notification Emails
export async function sendTimesheetEditApprovedEmail(
  to: string,
  data: Parameters<typeof emailTemplates.timesheetEditApproved>[0]
) {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const template = emailTemplates.timesheetEditApproved(data);
    
    const result = await client.emails.send({
      from: fromEmail,
      to: [to],
      subject: template.subject,
      html: template.html,
    });

    return { success: true, data: result };
  } catch (error) {
    console.error('Error sending timesheet edit approved email:', error);
    return { success: false, error };
  }
}

export async function sendTimesheetEditDeniedEmail(
  to: string,
  data: Parameters<typeof emailTemplates.timesheetEditDenied>[0]
) {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const template = emailTemplates.timesheetEditDenied(data);
    
    const result = await client.emails.send({
      from: fromEmail,
      to: [to],
      subject: template.subject,
      html: template.html,
    });

    return { success: true, data: result };
  } catch (error) {
    console.error('Error sending timesheet edit denied email:', error);
    return { success: false, error };
  }
}
