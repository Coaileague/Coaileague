/**
 * SPS Onboarding PDF Service
 * Generates an 11-page legally-binding onboarding packet using pdfkit.
 * Pages: title + 10 form pages
 * Uploads to GCS at gs://bucket/objects/sps-forms/{workspaceId}/...
 * Returns a 1-year signed URL.
 */
import PDFDocument from 'pdfkit';
import { randomUUID } from 'crypto';
import { createLogger } from '../../lib/logger';
const log = createLogger('SpsFormsPdfService');

const C = {
  navy: '#0f2a4a',
  navyMid: '#1e3a5f',
  gold: '#c9a227',
  white: '#ffffff',
  gray: '#6b7280',
  grayLight: '#e5e7eb',
  black: '#111827',
};

interface PdfOptions {
  session: { id: string; workspaceId: string; currentStep: number; completedSteps: any };
  workspaceId: string;
  forms: {
    f1: any; f2: any; f3: any; f4: any; f5: any;
    f6: any; f7: any; f8: any; f9: any; f10: any;
  };
  companyName?: string;
  licenseNumber?: string;
}

export async function generateSpsOnboardingPdf(opts: PdfOptions): Promise<string> {
  const { session, workspaceId, forms } = opts;
  const { f1, f2, f3, f4, f5, f6, f7, f8, f9, f10 } = forms;

  // Resolve workspace branding
  let companyName = opts.companyName || 'Security Services';
  let licenseNumber = opts.licenseNumber || '';
  try {
    const { db } = await import('../../db');
    const { workspaces } = await import('@shared/schema');
    const { eq } = await import('drizzle-orm');
    const [ws] = await db.select({ name: workspaces.name, licenseNumber: (workspaces as any).licenseNumber })
      .from(workspaces).where(eq(workspaces.id, workspaceId));
    if (ws?.name) companyName = ws.name;
    if (ws?.licenseNumber) licenseNumber = ws.licenseNumber;
  } catch { /* non-fatal */ }

  const employeeName = f1?.fullLegalName || 'Employee';
  const completedAt = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ size: 'LETTER', margins: { top: 72, bottom: 72, left: 72, right: 72 } });

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', async () => {
      const buffer = Buffer.concat(chunks);
      try {
        const { uploadFileToObjectStorage, objectStorageClient } = await import('../../objectStorage');
        const objectPath = `objects/sps-forms/${workspaceId}/onboarding-${session.id}-${randomUUID()}.pdf`;
        await uploadFileToObjectStorage({
          objectPath, buffer, workspaceId, storageCategory: 'documents',
          metadata: { contentType: 'application/pdf' },
        });

        const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
        if (!bucketId) { resolve(objectPath); return; }
        const pathParts = objectPath.startsWith('/') ? objectPath.slice(1).split('/') : objectPath.split('/');
        const objectName = pathParts.slice(1).join('/');
        const [signedUrl] = await objectStorageClient.bucket(bucketId).file(objectName).getSignedUrl({
          action: 'read',
          expires: Date.now() + 365 * 24 * 60 * 60 * 1000,
        });
        resolve(signedUrl);
      } catch (err) {
        log.warn(`PDF upload failed: ${(err as Error).message}`);
        resolve(''); // non-fatal: return empty string
      }
    });

    // ── Helper functions ──────────────────────────────────────────────────────
    const addPageHeader = (title: string, pageNum: number) => {
      doc.rect(0, 0, doc.page.width, 56).fill(C.navy);
      doc.fillColor(C.white).font('Helvetica-Bold').fontSize(14)
        .text(companyName, 72, 18, { width: doc.page.width - 200 });
      doc.fillColor(C.gold).font('Helvetica').fontSize(9)
        .text(licenseNumber ? `PSB License: ${licenseNumber}` : '', 72, 36);
      doc.fillColor(C.white).font('Helvetica-Bold').fontSize(11)
        .text(title, doc.page.width - 250, 22, { width: 178, align: 'right' });
      doc.fillColor(C.gray).fontSize(8)
        .text(`Page ${pageNum} of 11`, doc.page.width - 130, 42, { align: 'right' });
      doc.fillColor(C.black).font('Helvetica').fontSize(10);
      doc.y = 80;
    };

    const field = (label: string, value: string | null | undefined) => {
      const val = value ?? '—';
      doc.font('Helvetica-Bold').fontSize(8).fillColor(C.gray).text(label.toUpperCase(), { continued: false });
      doc.font('Helvetica').fontSize(10).fillColor(C.black).text(val);
      doc.moveDown(0.4);
    };

    const sectionTitle = (title: string) => {
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').fontSize(11).fillColor(C.navy).text(title);
      doc.moveTo(72, doc.y).lineTo(doc.page.width - 72, doc.y).stroke(C.grayLight);
      doc.moveDown(0.5);
      doc.font('Helvetica').fontSize(10).fillColor(C.black);
    };

    const checkField = (label: string, checked: boolean | null | undefined) => {
      doc.font('Helvetica').fontSize(10).fillColor(C.black)
        .text(`${checked ? '[✓]' : '[ ]'}  ${label}`);
      doc.moveDown(0.3);
    };

    const sigField = (label: string, sig: string | null | undefined) => {
      doc.font('Helvetica-Bold').fontSize(8).fillColor(C.gray).text(label.toUpperCase());
      doc.font('Helvetica-Oblique').fontSize(10).fillColor(C.navyMid)
        .text(sig ? `[Signed: ${sig.slice(0, 20)}...]` : '[Not signed]');
      doc.moveDown(0.4);
    };

    // ── PAGE 1: Title Page ────────────────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, doc.page.height).fill(C.navy);
    doc.rect(0, doc.page.height - 120, doc.page.width, 120).fill(C.gold);

    doc.fillColor(C.white).font('Helvetica-Bold').fontSize(28)
      .text(companyName, 72, 140, { align: 'center' });
    doc.fillColor(C.gold).font('Helvetica').fontSize(14)
      .text('Employee Onboarding Packet', 72, 186, { align: 'center' });
    if (licenseNumber) {
      doc.fillColor(C.white).fontSize(11)
        .text(`PSB License: ${licenseNumber}`, 72, 214, { align: 'center' });
    }

    doc.rect(180, 280, doc.page.width - 360, 200).fill(C.navyMid).stroke(C.gold);
    doc.fillColor(C.white).font('Helvetica-Bold').fontSize(13).text('Employee', 200, 300);
    doc.fillColor(C.gold).font('Helvetica').fontSize(17).text(employeeName, 200, 320);
    doc.fillColor(C.white).fontSize(10)
      .text(`Position: ${f1?.position || '—'}`, 200, 350)
      .text(`Hire Date: ${f1?.hireDate || '—'}`, 200, 367)
      .text(`Completed: ${completedAt}`, 200, 384);

    doc.fillColor(C.navy).font('Helvetica-Bold').fontSize(11)
      .text('CONFIDENTIAL — FOR AUTHORIZED USE ONLY', 72, doc.page.height - 100, { align: 'center' });

    // ── PAGE 2: Step 1 — Personal Info / Checklist ────────────────────────────
    doc.addPage();
    addPageHeader('Step 1 — Personal Information', 2);
    sectionTitle('Employee Information');
    field('Full Legal Name', f1?.fullLegalName);
    field('Date of Birth', f1?.dateOfBirth);
    field('Hire Date', f1?.hireDate);
    field('Position / Title', f1?.position);
    field('Work Address', f1?.workAddress);
    field('Phone', f1?.phone);

    // ── PAGE 3: Step 2 — Offer Letter ─────────────────────────────────────────
    doc.addPage();
    addPageHeader('Step 2 — Offer Letter', 3);
    sectionTitle('Employment Offer Details');
    field('Position Offered', f2?.positionOffered);
    field('Start Date', f2?.startDate);
    field('Hourly Rate / Salary', f2?.salaryHourlyRate ? `$${f2.salaryHourlyRate}` : null);
    doc.moveDown(0.5);
    sectionTitle('Signatures');
    sigField('Employee Signature', f2?.employeeSignature);
    field('Employee Signed At', f2?.employeeSignedAt ? new Date(f2.employeeSignedAt).toLocaleDateString() : null);
    sigField('Employer Signature', f2?.employerSignature);
    field('Employer Signed At', f2?.employerSignedAt ? new Date(f2.employerSignedAt).toLocaleDateString() : null);

    // ── PAGE 4: Step 3 — W-4 ─────────────────────────────────────────────────
    doc.addPage();
    addPageHeader('Step 3 — Federal W-4 Withholding', 4);
    sectionTitle('Tax Withholding Information');
    field('SSN (masked)', f3?.ssnMasked);
    field('Filing Status', f3?.filingStatus);
    checkField('Multiple Jobs / Spouse Works', f3?.multipleJobs);
    field('Dependents Amount', f3?.dependentsAmount ? `$${f3.dependentsAmount}` : null);
    field('Other Income', f3?.otherIncome ? `$${f3.otherIncome}` : null);
    field('Extra Withholding', f3?.extraWithholding ? `$${f3.extraWithholding}` : null);
    sigField('Employee Signature', f3?.employeeSignature);

    // ── PAGE 5: Step 4 — I-9 ─────────────────────────────────────────────────
    doc.addPage();
    addPageHeader('Step 4 — I-9 Employment Eligibility', 5);
    sectionTitle('Employee Information');
    field('Email', f4?.email);
    field('Phone', f4?.phone);
    field('Citizenship Status', f4?.citizenshipStatus);
    sectionTitle('Identity Document');
    field('Document Type', f4?.documentType);
    field('Document Number', f4?.documentNumber);
    field('Document Expiry', f4?.documentExpiry);
    sectionTitle('Signatures');
    sigField('Employee Signature', f4?.employeeSignature);
    sigField('Employer/Authorized Rep Signature', f4?.employerSignature);

    // ── PAGE 6: Step 5 — Direct Deposit ──────────────────────────────────────
    doc.addPage();
    addPageHeader('Step 5 — Direct Deposit Authorization', 6);
    sectionTitle('Bank Account Information');
    field('Bank Name', f5?.bankName);
    field('Routing Number', f5?.routingNumber);
    field('Account Number (masked)', f5?.accountNumberMasked);
    field('Account Type', f5?.accountType);
    field('Voided Check on File', f5?.voidedCheckImageUrl ? 'Yes — on file' : 'Not provided');
    sigField('Employee Signature', f5?.employeeSignature);

    // ── PAGE 7: Step 6 — Handbook Acknowledgment ──────────────────────────────
    doc.addPage();
    addPageHeader('Step 6 — Employee Handbook Acknowledgment', 7);
    sectionTitle('Acknowledgments');
    checkField('I have received and read the Employee Handbook', f6?.ack1);
    checkField('I understand the policies and procedures outlined in the Handbook', f6?.ack2);
    checkField('I understand that the Handbook is not a contract of employment', f6?.ack3);
    checkField('I agree to comply with all company policies', f6?.ack4);
    checkField('I understand that policies may be updated and I am responsible for staying current', f6?.ack5);
    sigField('Employee Signature', f6?.employeeSignature);

    // ── PAGE 8: Step 7 — At-Will Agreement ───────────────────────────────────
    doc.addPage();
    addPageHeader('Step 7 — At-Will Employment Agreement', 8);
    sectionTitle('At-Will Employment');
    doc.font('Helvetica').fontSize(10).fillColor(C.black)
      .text(
        'This acknowledges that employment with the company is at-will, meaning either the employee ' +
        'or the employer may terminate the employment relationship at any time, with or without cause, ' +
        'and with or without notice, subject to applicable law.',
        { width: doc.page.width - 144 }
      );
    doc.moveDown(1);
    sectionTitle('Signatures');
    sigField('Employee Signature', f7?.employeeSignature);
    field('Employee Signed At', f7?.employeeSignedAt ? new Date(f7.employeeSignedAt).toLocaleDateString() : null);
    sigField('Employer Signature', f7?.employerSignature);
    field('Employer Signed At', f7?.employerSignedAt ? new Date(f7.employerSignedAt).toLocaleDateString() : null);

    // ── PAGE 9: Step 8 — Uniform Policy ──────────────────────────────────────
    doc.addPage();
    addPageHeader('Step 8 — Uniform & Equipment Policy', 9);
    sectionTitle('Uniform Information');
    field('Shirt Size', f8?.uniformShirtSize);
    field('Pants Size', f8?.uniformPantsSize);
    sectionTitle('Uniform Deduction Acknowledgments');
    checkField('I understand that uniforms not returned may result in a payroll deduction', f8?.deductionAck1);
    checkField('I understand the uniform deduction policy and agree to its terms', f8?.deductionAck2);
    sigField('Employee Signature', f8?.employeeSignature);

    // ── PAGE 10: Step 9 — Security Policy ────────────────────────────────────
    doc.addPage();
    addPageHeader('Step 9 — Security & Conduct Policy', 10);
    sectionTitle('Policy Acknowledgments');
    checkField('I understand and agree to the Code of Conduct', f9?.ack1);
    checkField('I understand the consequences of policy violations', f9?.ack2);
    checkField('I agree to maintain confidentiality of client information', f9?.ack3);
    sigField('Employee Signature', f9?.employeeSignature);

    // ── PAGE 11: Step 10 — Credentials ───────────────────────────────────────
    doc.addPage();
    addPageHeader('Step 10 — Credential Documents', 11);
    sectionTitle('Uploaded Credentials');
    field("Driver's License (Front)", f10?.driversLicenseFrontUrl ? 'On file' : 'Not provided');
    field("Driver's License (Back)", f10?.driversLicenseBackUrl ? 'On file' : 'Not provided');
    field('Guard Card (Front)', f10?.guardCardFrontUrl ? 'On file' : 'Not provided');
    field('Guard Card (Back)', f10?.guardCardBackUrl ? 'On file' : 'Not provided');
    field('Social Security Card (Front)', f10?.ssnFrontUrl ? 'On file' : 'Not provided');
    doc.moveDown(1);
    doc.font('Helvetica').fontSize(9).fillColor(C.gray)
      .text(`Generated: ${new Date().toISOString()} | Session: ${session.id}`, { align: 'center' });

    doc.end();
  });
}
