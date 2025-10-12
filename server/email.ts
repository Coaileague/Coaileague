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
