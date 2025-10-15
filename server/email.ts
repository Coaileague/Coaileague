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
async function getUncachableResendClient() {
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
          This is an automated message from ShiftSync.
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
          This is an automated message from WorkforceOS.
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
