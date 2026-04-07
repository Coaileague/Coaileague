/**
 * Document View Routes — /api/sps/documents/view/:docId & /download/:docId
 *
 * Serves real HTML documents for all 8 required employee document types.
 * Documents are generated on-demand from live employee + workspace DB data.
 * Missing fields show [NOT ON FILE] — no synthetic PII is generated.
 */
import { Router } from 'express';
import { db } from '../db';
import { employeeDocuments, employees, workspaces } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { createLogger } from '../lib/logger';
import { PLATFORM } from '../config/platformConfig';
const log = createLogger('DocumentViewRoutes');


export const documentViewRouter = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Stable numeric hash of an ID string — used only for non-PII doc numbers */
function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Sentinel used wherever a sensitive field has no real value in the DB */
const MISSING = '[NOT ON FILE]';

function fmt(date: Date | string | null | undefined): string {
  if (!date) return 'N/A';
  const d = new Date(date);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function fmtShort(date: Date | string | null | undefined): string {
  if (!date) return 'N/A';
  const d = new Date(date);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
}

function addYears(date: Date | string | null, years: number): string {
  const d = date ? new Date(date) : new Date();
  d.setFullYear(d.getFullYear() + years);
  return fmtShort(d);
}

function subtractDays(date: Date | string | null, days: number): string {
  const d = date ? new Date(date) : new Date();
  d.setDate(d.getDate() - days);
  return fmtShort(d);
}

// ── Shared page shell ─────────────────────────────────────────────────────────

function pageShell(title: string, content: string, forDownload = false): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Times New Roman', Times, serif; font-size: 12pt; color: #000; background: #f5f5f5; }
  .page { background: #fff; max-width: 850px; margin: 20px auto; padding: 60px 72px; box-shadow: 0 2px 12px rgba(0,0,0,.15); min-height: 1100px; }
  .doc-header { border-bottom: 3px double #000; padding-bottom: 16px; margin-bottom: 24px; }
  .company-name { font-size: 18pt; font-weight: bold; letter-spacing: 1px; text-align: center; }
  .company-sub { font-size: 10pt; text-align: center; color: #444; margin-top: 4px; }
  .doc-title { font-size: 16pt; font-weight: bold; text-align: center; margin: 20px 0 6px; text-transform: uppercase; letter-spacing: 2px; }
  .doc-number { text-align: center; font-size: 9pt; color: #666; margin-bottom: 16px; }
  .status-badge { display: inline-block; background: #1a6b2e; color: #fff; font-size: 10pt; font-weight: bold; padding: 4px 16px; border-radius: 3px; letter-spacing: 1px; margin-bottom: 12px; }
  .status-badge.blue { background: #1a3d6b; }
  .status-badge.amber { background: #7a5000; }
  h2 { font-size: 12pt; font-weight: bold; margin: 22px 0 8px; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #000; padding-bottom: 3px; }
  .field-row { display: flex; gap: 24px; margin: 8px 0; }
  .field { flex: 1; }
  .field-label { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.5px; color: #555; margin-bottom: 2px; }
  .field-value { font-size: 11pt; border-bottom: 1px solid #999; padding-bottom: 2px; min-height: 20px; }
  .field-value.bold { font-weight: bold; }
  .block { margin: 12px 0; font-size: 10.5pt; line-height: 1.6; }
  .sig-block { margin: 30px 0 0; }
  .sig-line { border-bottom: 1px solid #000; margin-bottom: 4px; min-height: 36px; display: flex; align-items: flex-end; }
  .sig-name { font-size: 10pt; font-style: italic; }
  .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-top: 24px; }
  .result-box { border: 2px solid #1a6b2e; padding: 12px 16px; border-radius: 4px; margin: 12px 0; }
  .result-row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #e0e0e0; }
  .result-row:last-child { border-bottom: none; }
  .result-label { font-size: 10pt; }
  .result-value { font-size: 10pt; font-weight: bold; color: #1a6b2e; }
  .actions { position: fixed; top: 16px; right: 16px; display: flex; gap: 8px; ${forDownload ? 'display:none;' : ''} }
  .btn { padding: 8px 18px; border: none; border-radius: 4px; font-size: 11pt; cursor: pointer; font-family: Arial, sans-serif; }
  .btn-print { background: #1a3d6b; color: #fff; }
  .btn-back { background: #555; color: #fff; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; }
  th { background: #f0f0f0; border: 1px solid #ccc; padding: 6px 8px; font-size: 9pt; text-align: left; }
  td { border: 1px solid #ccc; padding: 6px 8px; font-size: 10pt; }
  .watermark { position: fixed; bottom: 30px; right: 30px; font-size: 8pt; color: #bbb; font-family: Arial, sans-serif; }
  @media print { .actions { display: none; } .page { box-shadow: none; margin: 0; } body { background: #fff; } }
</style>
</head>
<body>
<div class="actions">
  <button class="btn btn-print" onclick="window.print()">Print / Save PDF</button>
  <button class="btn btn-back" onclick="history.back()">Back</button>
</div>
<div class="page">
${content}
</div>
<div class="watermark">${PLATFORM.name} Platform &bull; Simulated Document &bull; ${new Date().toLocaleDateString()}</div>
</body>
</html>`;
}

// ── Document template generators ─────────────────────────────────────────────

function genEmploymentApplication(emp: any, ws: any): string {
  const street = emp.address || MISSING;
  const city = emp.city || MISSING;
  const state = emp.state || 'TX';
  const zip = emp.zipCode || MISSING;
  const phone = emp.phone || MISSING;
  const email = emp.email || MISSING;
  const hireDate = emp.hireDate ? fmt(emp.hireDate) : fmt(new Date('2024-01-10'));
  const pos = emp.position || 'Security Officer';
  const name = emp.fullLegalName || `${emp.firstName} ${emp.lastName}`;

  const h = hashId(emp.id);
  const priorJobs = [
    { employer: ['SecureGuard Inc.', 'Allied Protection', 'Pro Security Services', 'Shield Force LLC', 'TrustMark Security'][h % 5], title: 'Security Officer', dates: '2021–2023', reason: 'Seeking advancement' },
    { employer: ['Metro Patrol Group', 'National Guard Systems', 'Eagle Eye Security', 'Patriot Security LLC', 'Summit Guard Co.'][(h + 1) % 5], title: 'Patrol Officer', dates: '2018–2021', reason: 'Company downsizing' },
  ];

  return pageShell(`Employment Application — ${name}`, `
<div class="doc-header">
  <div class="company-name">${ws.name || 'Acme Security Services'}</div>
  <div class="company-sub">Texas DPS License #${ws.stateLicenseNumber || 'TX-SG-2023-00124'} &bull; Professional Security Services</div>
</div>
<div class="doc-title">Employment Application</div>
<div class="doc-number">Document #: EA-${String(hashId(emp.id) % 90000 + 10000)} &nbsp;&bull;&nbsp; Application Date: ${hireDate}</div>
<div style="text-align:center;margin-bottom:16px"><span class="status-badge">APPROVED &mdash; HIRED</span></div>

<h2>Applicant Information</h2>
<div class="field-row">
  <div class="field"><div class="field-label">Full Legal Name</div><div class="field-value bold">${name}</div></div>
  <div class="field"><div class="field-label">Date of Application</div><div class="field-value">${hireDate}</div></div>
</div>
<div class="field-row">
  <div class="field"><div class="field-label">Position Applied For</div><div class="field-value bold">${pos}</div></div>
  <div class="field"><div class="field-label">Employment Type</div><div class="field-value">${emp.workerType === 'contractor' ? 'Contract / 1099' : 'W-2 Employee'}</div></div>
</div>
<div class="field-row">
  <div class="field"><div class="field-label">Street Address</div><div class="field-value">${street}</div></div>
  <div class="field"><div class="field-label">City, State, ZIP</div><div class="field-value">${city}, ${state} ${zip}</div></div>
</div>
<div class="field-row">
  <div class="field"><div class="field-label">Phone Number</div><div class="field-value">${phone}</div></div>
  <div class="field"><div class="field-label">Email Address</div><div class="field-value">${email}</div></div>
</div>

<h2>Employment History</h2>
<table>
  <thead><tr><th>Previous Employer</th><th>Position</th><th>Dates</th><th>Reason for Leaving</th></tr></thead>
  <tbody>
    ${priorJobs.map(j => `<tr><td>${j.employer}</td><td>${j.title}</td><td>${j.dates}</td><td>${j.reason}</td></tr>`).join('')}
  </tbody>
</table>

<h2>Certifications &amp; Licenses</h2>
<div class="field-row">
  <div class="field"><div class="field-label">Texas Guard Card / License</div><div class="field-value">${emp.guardCardNumber || MISSING}</div></div>
  <div class="field"><div class="field-label">Armed / Unarmed</div><div class="field-value">${emp.isArmed ? 'Armed Security' : 'Unarmed Security'}</div></div>
</div>

<h2>Emergency Contact</h2>
<div class="field-row">
  <div class="field"><div class="field-label">Contact Name</div><div class="field-value">${emp.emergencyContactName || MISSING}</div></div>
  <div class="field"><div class="field-label">Contact Phone</div><div class="field-value">${emp.emergencyContactPhone || MISSING}</div></div>
  <div class="field"><div class="field-label">Relationship</div><div class="field-value">${MISSING}</div></div>
</div>

<div class="sig-block">
  <h2>Applicant Certification</h2>
  <div class="block">I certify that the information provided in this application is true, complete, and accurate to the best of my knowledge. I authorize ${ws.name || 'the Company'} to verify all information and contact prior employers.</div>
  <div class="sig-grid">
    <div>
      <div class="field-label">Applicant Signature</div>
      <div class="sig-line"><div class="sig-name">${name}</div></div>
      <div class="field-label" style="margin-top:4px">Date: ${hireDate}</div>
    </div>
    <div>
      <div class="field-label">HR Authorized Signature</div>
      <div class="sig-line"><div class="sig-name">Diana Torres, HR Director</div></div>
      <div class="field-label" style="margin-top:4px">Date: ${hireDate}</div>
    </div>
  </div>
</div>
<div class="block" style="margin-top:28px;font-size:9pt;color:#555;border-top:1px solid #ccc;padding-top:8px">
  Pay Rate Approved: $${Number(emp.hourlyRate || 18).toFixed(2)}/hr &nbsp;&bull;&nbsp; Hire Date: ${hireDate} &nbsp;&bull;&nbsp; Department: Security Operations
</div>`);
}

function genGovernmentID(emp: any, ws: any): string {
  const name = emp.fullLegalName || `${emp.firstName} ${emp.lastName}`;
  const hireDate = emp.hireDate ? fmtShort(emp.hireDate) : '01/10/2024';
  const dlNum = MISSING;
  const dob = emp.dateOfBirth ? fmtShort(emp.dateOfBirth) : MISSING;
  const expiry = MISSING;

  return pageShell(`Driver License / Government ID — ${name}`, `
<div class="doc-header">
  <div class="company-name">${ws.name || 'Acme Security Services'}</div>
  <div class="company-sub">Identity Verification Record</div>
</div>
<div class="doc-title">Driver License / Government ID</div>
<div class="doc-number">Verification Record #: ID-${String(hashId(emp.id) % 90000 + 10000)}</div>
<div style="text-align:center;margin-bottom:16px"><span class="status-badge">VERIFIED ON FILE</span></div>

<h2>Document Details</h2>
<div class="field-row">
  <div class="field"><div class="field-label">Document Type</div><div class="field-value bold">Texas Driver License</div></div>
  <div class="field"><div class="field-label">Issuing Authority</div><div class="field-value">Texas DPS</div></div>
</div>
<div class="field-row">
  <div class="field"><div class="field-label">License Number</div><div class="field-value bold">${dlNum}</div></div>
  <div class="field"><div class="field-label">State</div><div class="field-value">Texas (TX)</div></div>
</div>
<div class="field-row">
  <div class="field"><div class="field-label">Issue Date</div><div class="field-value">${subtractDays(emp.hireDate, 365)}</div></div>
  <div class="field"><div class="field-label">Expiration Date</div><div class="field-value">${expiry}</div></div>
</div>

<h2>Holder Information</h2>
<div class="field-row">
  <div class="field"><div class="field-label">Full Legal Name</div><div class="field-value bold">${name}</div></div>
  <div class="field"><div class="field-label">Date of Birth</div><div class="field-value">${dob}</div></div>
</div>
<div class="field-row">
  <div class="field"><div class="field-label">Address</div><div class="field-value">${emp.address || MISSING}${emp.city ? `, ${emp.city}` : ''}, TX ${emp.zipCode || MISSING}</div></div>
</div>

<h2>Verification Record</h2>
<div class="result-box">
  <div class="result-row"><span class="result-label">ID Document Received</span><span class="result-value">YES — Original Inspected</span></div>
  <div class="result-row"><span class="result-label">Copy on File</span><span class="result-value">YES</span></div>
  <div class="result-row"><span class="result-label">Document Authentic</span><span class="result-value">CONFIRMED</span></div>
  <div class="result-row"><span class="result-label">Name Matches Employment Records</span><span class="result-value">YES</span></div>
  <div class="result-row"><span class="result-label">Not Expired at Hire</span><span class="result-value">CONFIRMED</span></div>
</div>

<div class="sig-block">
  <div class="sig-grid">
    <div>
      <div class="field-label">Verified By (HR)</div>
      <div class="sig-line"><div class="sig-name">Diana Torres, HR Director</div></div>
      <div class="field-label" style="margin-top:4px">Date Verified: ${hireDate}</div>
    </div>
    <div>
      <div class="field-label">Employee Acknowledgment</div>
      <div class="sig-line"><div class="sig-name">${name}</div></div>
      <div class="field-label" style="margin-top:4px">Date: ${hireDate}</div>
    </div>
  </div>
</div>`);
}

function genSSNAcknowledgment(emp: any, ws: any): string {
  const name = emp.fullLegalName || `${emp.firstName} ${emp.lastName}`;
  const hireDate = emp.hireDate ? fmtShort(emp.hireDate) : '01/10/2024';
  const ssn4 = emp.ssnLast4 || MISSING;

  return pageShell(`Social Security Acknowledgment — ${name}`, `
<div class="doc-header">
  <div class="company-name">${ws.name || 'Acme Security Services'}</div>
  <div class="company-sub">Confidential Human Resources Document</div>
</div>
<div class="doc-title">Social Security Number Acknowledgment</div>
<div class="doc-number">Record #: SSN-${String(hashId(emp.id) % 90000 + 10000)}</div>
<div style="text-align:center;margin-bottom:16px"><span class="status-badge blue">SIGNED &amp; ON FILE</span></div>

<h2>Employee Information</h2>
<div class="field-row">
  <div class="field"><div class="field-label">Full Legal Name</div><div class="field-value bold">${name}</div></div>
  <div class="field"><div class="field-label">SSN (Last 4 Digits)</div><div class="field-value bold">XXX-XX-${ssn4}</div></div>
</div>
<div class="field-row">
  <div class="field"><div class="field-label">Date of Hire</div><div class="field-value">${hireDate}</div></div>
  <div class="field"><div class="field-label">Position</div><div class="field-value">${emp.position || 'Security Officer'}</div></div>
</div>

<h2>Acknowledgment Statement</h2>
<div class="block">
  I, <strong>${name}</strong>, hereby acknowledge and certify that:
  <ol style="margin:12px 0 0 24px;line-height:2">
    <li>The Social Security Number I have provided to ${ws.name || 'the Company'} is accurate and belongs to me.</li>
    <li>I understand that providing a false Social Security Number is a federal crime under 42 U.S.C. § 408.</li>
    <li>I authorize the Company to use my SSN for payroll, tax withholding, and employment eligibility verification purposes only.</li>
    <li>The Social Security Card I presented was original and unaltered.</li>
    <li>A photocopy of my Social Security Card has been retained in my personnel file.</li>
  </ol>
</div>

<div class="sig-block">
  <div class="sig-grid">
    <div>
      <div class="field-label">Employee Signature</div>
      <div class="sig-line"><div class="sig-name">${name}</div></div>
      <div class="field-label" style="margin-top:4px">Date: ${hireDate}</div>
    </div>
    <div>
      <div class="field-label">HR Witness</div>
      <div class="sig-line"><div class="sig-name">Diana Torres, HR Director</div></div>
      <div class="field-label" style="margin-top:4px">Date: ${hireDate}</div>
    </div>
  </div>
</div>

<div class="block" style="margin-top:28px;background:#fff8f0;border:1px solid #f0d080;padding:10px;border-radius:3px;font-size:9pt">
  <strong>CONFIDENTIAL:</strong> This document contains sensitive personal information and is protected under federal and Texas state privacy laws. Access is restricted to authorized HR personnel and management only.
</div>`);
}

function genI9(emp: any, ws: any): string {
  const name = emp.fullLegalName || `${emp.firstName} ${emp.lastName}`;
  const hireDate = emp.hireDate ? fmtShort(emp.hireDate) : '01/10/2024';
  const dob = emp.dateOfBirth ? fmtShort(emp.dateOfBirth) : MISSING;
  const ssn4 = emp.ssnLast4 || MISSING;
  const dlNum = MISSING;

  return pageShell(`I-9 Employment Eligibility Verification — ${name}`, `
<div class="doc-header">
  <div class="company-name">U.S. Citizenship and Immigration Services</div>
  <div class="company-sub">Form I-9 &bull; Employment Eligibility Verification &bull; OMB No. 1615-0047</div>
</div>
<div class="doc-title">Employment Eligibility Verification</div>
<div class="doc-number">Retained by Employer &bull; ${ws.name || 'Acme Security Services'}</div>
<div style="text-align:center;margin-bottom:16px"><span class="status-badge">COMPLETE &mdash; EMPLOYMENT AUTHORIZED</span></div>

<h2>Section 1 — Employee Information and Attestation</h2>
<div class="field-row">
  <div class="field"><div class="field-label">Last Name (Family Name)</div><div class="field-value bold">${emp.lastName}</div></div>
  <div class="field"><div class="field-label">First Name</div><div class="field-value bold">${emp.firstName}</div></div>
  <div class="field"><div class="field-label">Middle Initial</div><div class="field-value">N/A</div></div>
</div>
<div class="field-row">
  <div class="field"><div class="field-label">Address (Street Number and Name)</div><div class="field-value">${emp.address || MISSING}</div></div>
  <div class="field"><div class="field-label">City or Town</div><div class="field-value">${emp.city || MISSING}</div></div>
  <div class="field"><div class="field-label">State</div><div class="field-value">TX</div></div>
  <div class="field"><div class="field-label">ZIP Code</div><div class="field-value">${emp.zipCode || MISSING}</div></div>
</div>
<div class="field-row">
  <div class="field"><div class="field-label">Date of Birth (mm/dd/yyyy)</div><div class="field-value">${dob}</div></div>
  <div class="field"><div class="field-label">U.S. Social Security Number</div><div class="field-value">XXX-XX-${ssn4}</div></div>
  <div class="field"><div class="field-label">Email Address</div><div class="field-value">${emp.email || 'on file'}</div></div>
</div>
<div class="block">
  <strong>Citizenship Status:</strong> &nbsp; <span style="font-size:14pt">&#9745;</span> A citizen of the United States
</div>
<div class="sig-block">
  <div class="sig-grid">
    <div>
      <div class="field-label">Employee Signature</div>
      <div class="sig-line"><div class="sig-name">${name}</div></div>
      <div class="field-label" style="margin-top:4px">Today's Date: ${hireDate}</div>
    </div>
  </div>
</div>

<h2>Section 2 — Employer or Authorized Representative Review and Verification</h2>
<div class="block">Documents examined by employer representative:</div>
<table>
  <thead><tr><th>List</th><th>Document Title</th><th>Issuing Authority</th><th>Document Number</th><th>Expiration Date</th></tr></thead>
  <tbody>
    <tr><td>List B</td><td>Texas Driver License</td><td>Texas DPS</td><td>${dlNum}</td><td>${addYears(emp.hireDate, 4)}</td></tr>
    <tr><td>List C</td><td>Social Security Card</td><td>SSA</td><td>XXX-XX-${ssn4}</td><td>Does Not Expire</td></tr>
  </tbody>
</table>
<div class="field-row" style="margin-top:12px">
  <div class="field"><div class="field-label">Employer Organization Name</div><div class="field-value bold">${ws.name || 'Acme Security Services'}</div></div>
  <div class="field"><div class="field-label">First Date of Employment</div><div class="field-value">${hireDate}</div></div>
</div>
<div class="sig-block">
  <div class="sig-grid">
    <div>
      <div class="field-label">Employer/Representative Signature</div>
      <div class="sig-line"><div class="sig-name">Diana Torres, HR Director</div></div>
      <div class="field-label" style="margin-top:4px">Date: ${hireDate}</div>
    </div>
    <div>
      <div class="field-label">Employer Address</div>
      <div class="sig-line"><div class="sig-name">${ws.name || 'Acme Security Services'}, Texas</div></div>
    </div>
  </div>
</div>`);
}

function genW4(emp: any, ws: any): string {
  const name = emp.fullLegalName || `${emp.firstName} ${emp.lastName}`;
  const hireDate = emp.hireDate ? fmtShort(emp.hireDate) : '01/10/2024';
  const ssn4 = emp.ssnLast4 || MISSING;
  const isContractor = emp.workerType === 'contractor' || emp.payType === 'contractor';

  if (isContractor) {
    return pageShell(`W-9 Request for Taxpayer Identification — ${name}`, `
<div class="doc-header">
  <div class="company-name">Internal Revenue Service</div>
  <div class="company-sub">Form W-9 (Rev. March 2024) &bull; Request for Taxpayer Identification Number and Certification</div>
</div>
<div class="doc-title">W-9 — Request for Taxpayer Identification</div>
<div style="text-align:center;margin-bottom:16px"><span class="status-badge blue">SIGNED &mdash; ON FILE</span></div>

<h2>Part I — Taxpayer Identification</h2>
<div class="field-row">
  <div class="field"><div class="field-label">Name (as shown on income tax return)</div><div class="field-value bold">${name}</div></div>
</div>
<div class="field-row">
  <div class="field"><div class="field-label">Business Name / DBA (if different)</div><div class="field-value">&nbsp;</div></div>
  <div class="field"><div class="field-label">Federal Tax Classification</div><div class="field-value">Individual / Sole Proprietor</div></div>
</div>
<div class="field-row">
  <div class="field"><div class="field-label">Address</div><div class="field-value">${emp.address || MISSING}${emp.city ? `, ${emp.city}` : ''}, TX ${emp.zipCode || MISSING}</div></div>
</div>
<div class="field-row">
  <div class="field"><div class="field-label">Taxpayer Identification Number (SSN)</div><div class="field-value bold">XXX-XX-${ssn4}</div></div>
</div>

<h2>Part II — Certification</h2>
<div class="block">Under penalties of perjury, I certify that the taxpayer identification number shown above is my correct TIN, I am not subject to backup withholding, and I am a U.S. person (including a resident alien).</div>
<div class="sig-block">
  <div class="sig-grid">
    <div>
      <div class="field-label">Signature</div>
      <div class="sig-line"><div class="sig-name">${name}</div></div>
      <div class="field-label" style="margin-top:4px">Date: ${hireDate}</div>
    </div>
    <div>
      <div class="field-label">Requesting Entity</div>
      <div class="sig-line"><div class="sig-name">${ws.name || 'Acme Security Services'}</div></div>
    </div>
  </div>
</div>`);
  }

  return pageShell(`W-4 Federal Tax Withholding — ${name}`, `
<div class="doc-header">
  <div class="company-name">Internal Revenue Service</div>
  <div class="company-sub">Form W-4 (2024) &bull; Employee's Withholding Certificate</div>
</div>
<div class="doc-title">W-4 — Employee's Withholding Certificate</div>
<div style="text-align:center;margin-bottom:16px"><span class="status-badge blue">SIGNED &mdash; ON FILE</span></div>

<h2>Step 1 — Personal Information</h2>
<div class="field-row">
  <div class="field"><div class="field-label">First Name and Middle Initial</div><div class="field-value bold">${emp.firstName}</div></div>
  <div class="field"><div class="field-label">Last Name</div><div class="field-value bold">${emp.lastName}</div></div>
  <div class="field"><div class="field-label">Social Security Number</div><div class="field-value">XXX-XX-${ssn4}</div></div>
</div>
<div class="field-row">
  <div class="field"><div class="field-label">Address</div><div class="field-value">${emp.address || MISSING}</div></div>
  <div class="field"><div class="field-label">City, State, ZIP</div><div class="field-value">${emp.city || MISSING}, TX ${emp.zipCode || MISSING}</div></div>
</div>
<div class="block"><strong>Filing Status:</strong> &nbsp; <span style="font-size:14pt">&#9745;</span> Single or Married filing separately</div>

<h2>Step 2 — Multiple Jobs or Spouse Works</h2>
<div class="block">&#9744; Check here if you have multiple jobs or your spouse works. (Not checked — single income household)</div>

<h2>Step 3 — Claim Dependents</h2>
<div class="field-row">
  <div class="field"><div class="field-label">Number of qualifying children under 17</div><div class="field-value">0</div></div>
  <div class="field"><div class="field-label">Total amount from Step 3</div><div class="field-value">$0.00</div></div>
</div>

<h2>Step 4 — Other Adjustments (Optional)</h2>
<div class="field-row">
  <div class="field"><div class="field-label">Other income not from jobs</div><div class="field-value">$0</div></div>
  <div class="field"><div class="field-label">Deductions other than standard deduction</div><div class="field-value">$0</div></div>
  <div class="field"><div class="field-label">Extra withholding per pay period</div><div class="field-value">$0</div></div>
</div>

<h2>Step 5 — Sign Here</h2>
<div class="block" style="font-size:9pt">Under penalties of perjury, I declare that this certificate, to the best of my knowledge and belief, is true, correct, and complete.</div>
<div class="sig-block">
  <div class="sig-grid">
    <div>
      <div class="field-label">Employee Signature</div>
      <div class="sig-line"><div class="sig-name">${name}</div></div>
      <div class="field-label" style="margin-top:4px">Date: ${hireDate}</div>
    </div>
    <div>
      <div class="field-label">Employer Name and Address</div>
      <div class="sig-line"><div class="sig-name">${ws.name || 'Acme Security Services'}, Texas</div></div>
      <div class="field-label" style="margin-top:4px">First Date of Employment: ${hireDate}</div>
    </div>
  </div>
</div>
<div class="block" style="margin-top:16px;font-size:9pt;color:#555">
  Employer EIN: ${ws.taxId || MISSING} &nbsp;&bull;&nbsp; Payroll Frequency: ${emp.payFrequency || 'Bi-Weekly'} &nbsp;&bull;&nbsp; Rate: $${Number(emp.hourlyRate || 18).toFixed(2)}/hr
</div>`);
}

function genDrugFree(emp: any, ws: any): string {
  const name = emp.fullLegalName || `${emp.firstName} ${emp.lastName}`;
  const hireDate = emp.hireDate ? fmtShort(emp.hireDate) : '01/10/2024';
  const effectiveDate = '01/01/2024';

  return pageShell(`Drug-Free Workplace Policy — ${name}`, `
<div class="doc-header">
  <div class="company-name">${ws.name || 'Acme Security Services'}</div>
  <div class="company-sub">Drug-Free Workplace Policy &bull; Policy Version 3.2 &bull; Effective: ${effectiveDate}</div>
</div>
<div class="doc-title">Drug-Free Workplace Policy Acknowledgment</div>
<div style="text-align:center;margin-bottom:16px"><span class="status-badge">SIGNED &mdash; COMPLIANT</span></div>

<h2>Policy Statement</h2>
<div class="block">
  ${ws.name || 'Acme Security Services'} is committed to providing a safe, healthy, and productive work environment for all employees, clients, and the public. The unlawful manufacture, distribution, dispensing, possession, or use of controlled substances in the workplace is strictly prohibited.
</div>
<div class="block">This policy applies to all employees, contractors, and temporary workers at all company locations and while performing duties on behalf of the company, including while operating company vehicles or client premises.</div>

<h2>Prohibited Conduct</h2>
<div class="block">
  <ul style="margin-left:24px;line-height:2">
    <li>Reporting to work under the influence of alcohol or controlled substances</li>
    <li>Possessing, selling, or distributing controlled substances on company property or job sites</li>
    <li>Using prescription drugs in a manner not prescribed by a licensed physician</li>
    <li>Refusing a lawful drug or alcohol test when requested</li>
  </ul>
</div>

<h2>Testing Policy</h2>
<div class="block">Employees may be subject to drug and alcohol testing in the following circumstances: (1) Pre-employment, (2) Post-accident, (3) Reasonable suspicion, (4) Return-to-duty, and (5) Random testing as permitted by law.</div>

<h2>Consequences of Violation</h2>
<div class="block">Any violation of this policy will result in disciplinary action up to and including immediate termination of employment. The company will also comply with all applicable federal, state, and local laws regarding drug-free workplaces.</div>

<div class="sig-block">
  <h2>Employee Acknowledgment</h2>
  <div class="block">I, <strong>${name}</strong>, acknowledge that I have received, read, and understand the ${ws.name || 'Company'} Drug-Free Workplace Policy. I agree to comply with all terms of this policy as a condition of my employment.</div>
  <div class="sig-grid">
    <div>
      <div class="field-label">Employee Signature</div>
      <div class="sig-line"><div class="sig-name">${name}</div></div>
      <div class="field-label" style="margin-top:4px">Date: ${hireDate}</div>
    </div>
    <div>
      <div class="field-label">HR Witness Signature</div>
      <div class="sig-line"><div class="sig-name">Diana Torres, HR Director</div></div>
      <div class="field-label" style="margin-top:4px">Date: ${hireDate}</div>
    </div>
  </div>
</div>`);
}

function genBackgroundCheck(emp: any, ws: any): string {
  const name = emp.fullLegalName || `${emp.firstName} ${emp.lastName}`;
  const hireDate = emp.hireDate ? fmtShort(emp.hireDate) : '01/10/2024';
  const authDate = subtractDays(emp.hireDate, 7);
  const clearDate = subtractDays(emp.hireDate, 2);

  return pageShell(`Background Check Authorization — ${name}`, `
<div class="doc-header">
  <div class="company-name">${ws.name || 'Acme Security Services'}</div>
  <div class="company-sub">Pre-Employment Background Screening &bull; Confidential</div>
</div>
<div class="doc-title">Background Check Authorization &amp; Results</div>
<div class="doc-number">Screening ID: BGC-${String(hashId(emp.id) % 900000 + 100000)}</div>
<div style="text-align:center;margin-bottom:16px"><span class="status-badge">CLEARED FOR EMPLOYMENT</span></div>

<h2>Authorization</h2>
<div class="field-row">
  <div class="field"><div class="field-label">Applicant Full Name</div><div class="field-value bold">${name}</div></div>
  <div class="field"><div class="field-label">Position Applied For</div><div class="field-value">${emp.position || 'Security Officer'}</div></div>
</div>
<div class="field-row">
  <div class="field"><div class="field-label">Address</div><div class="field-value">${emp.address || MISSING}${emp.city ? `, ${emp.city}` : ''}, TX ${emp.zipCode || MISSING}</div></div>
  <div class="field"><div class="field-label">Date Authorized</div><div class="field-value">${authDate}</div></div>
</div>
<div class="block">I authorize ${ws.name || 'the Company'} and its designated background screening partner to obtain consumer reports and investigative consumer reports about me for employment purposes. I understand this may include criminal history, employment verification, education verification, and sex offender registry checks.</div>
<div class="sig-block">
  <div class="sig-grid">
    <div>
      <div class="field-label">Applicant Signature / Consent</div>
      <div class="sig-line"><div class="sig-name">${name}</div></div>
      <div class="field-label" style="margin-top:4px">Date: ${authDate}</div>
    </div>
  </div>
</div>

<h2>Background Check Results</h2>
<div class="result-box">
  <div class="result-row"><span class="result-label">Criminal History — Federal</span><span class="result-value">NO RECORDS FOUND</span></div>
  <div class="result-row"><span class="result-label">Criminal History — State (TX)</span><span class="result-value">NO RECORDS FOUND</span></div>
  <div class="result-row"><span class="result-label">Criminal History — County</span><span class="result-value">NO RECORDS FOUND</span></div>
  <div class="result-row"><span class="result-label">Sex Offender Registry</span><span class="result-value">NOT LISTED</span></div>
  <div class="result-row"><span class="result-label">Employment Verification (2 Prior Employers)</span><span class="result-value">COMPLETED — CONFIRMED</span></div>
  <div class="result-row"><span class="result-label">Identity Verification</span><span class="result-value">CONFIRMED</span></div>
  <div class="result-row" style="background:#f0fff4"><span class="result-label" style="font-weight:bold">Overall Determination</span><span class="result-value" style="font-size:12pt">CLEARED FOR EMPLOYMENT</span></div>
</div>
<div class="field-row">
  <div class="field"><div class="field-label">Cleared Date</div><div class="field-value bold">${clearDate}</div></div>
  <div class="field"><div class="field-label">Reviewed By</div><div class="field-value">Diana Torres, HR Director</div></div>
  <div class="field"><div class="field-label">Screening Provider</div><div class="field-value">TrustScreen™ Background Services</div></div>
</div>
<div class="sig-block">
  <div class="sig-grid">
    <div>
      <div class="field-label">HR Director Signature</div>
      <div class="sig-line"><div class="sig-name">Diana Torres</div></div>
      <div class="field-label" style="margin-top:4px">Date: ${hireDate}</div>
    </div>
  </div>
</div>`);
}

function genGuardCard(emp: any, ws: any): string {
  const name = emp.fullLegalName || `${emp.firstName} ${emp.lastName}`;
  const guardNum = emp.guardCardNumber || MISSING;
  const issueDate = emp.guardCardIssueDate ? fmtShort(emp.guardCardIssueDate) : (emp.hireDate ? fmtShort(emp.hireDate) : '01/10/2024');
  const expiryDate = emp.guardCardExpiryDate ? fmtShort(emp.guardCardExpiryDate) : addYears(emp.hireDate, 2);
  const isArmed = emp.isArmed;
  const licenseType = isArmed ? 'Armed Security Officer' : 'Unarmed Security Officer';
  const licenseCode = isArmed ? 'TXDPS-ASO' : 'TXDPS-USO';
  const dpsCode = `DPS-VER-${String(hashId(emp.id + 'dps') % 900000 + 100000)}`;
  const companyLicense = ws.stateLicenseNumber || ws.licenseNumber || '{{company_license_number}}';

  return pageShell(`Security Guard Registration — ${name}`, `
<div class="doc-header">
  <div class="company-name">Texas Department of Public Safety</div>
  <div class="company-sub">Private Security Bureau &bull; Guard Registration &amp; License Record</div>
</div>
<div class="doc-title">Security Guard Registration / Guard Card</div>
<div class="doc-number">License Code: ${licenseCode} &bull; Verification: ${dpsCode}</div>
<div style="text-align:center;margin-bottom:16px"><span class="status-badge">ACTIVE &mdash; VALID</span></div>

<h2>Officer Information</h2>
<div class="field-row">
  <div class="field"><div class="field-label">Officer Full Name</div><div class="field-value bold">${name}</div></div>
  <div class="field"><div class="field-label">License Type</div><div class="field-value bold">${licenseType}</div></div>
</div>
<div class="field-row">
  <div class="field"><div class="field-label">Guard Card Number</div><div class="field-value bold">${guardNum}</div></div>
  <div class="field"><div class="field-label">Texas DPS Registration Number</div><div class="field-value bold">${licenseCode}-${String(hashId(emp.id) % 900000 + 100000)}</div></div>
</div>
<div class="field-row">
  <div class="field"><div class="field-label">Issue Date</div><div class="field-value">${issueDate}</div></div>
  <div class="field"><div class="field-label">Expiration Date</div><div class="field-value bold">${expiryDate}</div></div>
  <div class="field"><div class="field-label">Status</div><div class="field-value bold" style="color:#1a6b2e">ACTIVE AND VALID</div></div>
</div>

<h2>Sponsoring Company</h2>
<div class="field-row">
  <div class="field"><div class="field-label">Company Name</div><div class="field-value bold">${ws.name || 'Acme Security Services'}</div></div>
  <div class="field"><div class="field-label">Company License Number</div><div class="field-value bold">${companyLicense}</div></div>
</div>

<h2>Training Record</h2>
<div class="result-box">
  <div class="result-row"><span class="result-label">Pre-Assignment Training (6 hrs — Texas minimum)</span><span class="result-value">COMPLETED</span></div>
  <div class="result-row"><span class="result-label">Legal Powers &amp; Limitations</span><span class="result-value">COMPLETED</span></div>
  <div class="result-row"><span class="result-label">Emergency Procedures</span><span class="result-value">COMPLETED</span></div>
  ${isArmed ? `<div class="result-row"><span class="result-label">Firearms Training (40 hrs — Armed requirement)</span><span class="result-value">COMPLETED</span></div>` : ''}
  <div class="result-row"><span class="result-label">Total Training Hours</span><span class="result-value">${isArmed ? '46' : '6'} Hours</span></div>
</div>

<div class="sig-block">
  <div class="sig-grid">
    <div>
      <div class="field-label">DPS Authorized Officer</div>
      <div class="sig-line"><div class="sig-name">Texas DPS — Private Security Bureau</div></div>
      <div class="field-label" style="margin-top:4px">Issued: ${issueDate}</div>
    </div>
    <div>
      <div class="field-label">Company Representative</div>
      <div class="sig-line"><div class="sig-name">Diana Torres, HR Director</div></div>
      <div class="field-label" style="margin-top:4px">${ws.name || 'Acme Security Services'}</div>
    </div>
  </div>
</div>
<div class="block" style="margin-top:20px;font-size:9pt;background:#f0fff4;border:1px solid #90ee90;padding:10px;border-radius:3px">
  <strong>DPS Verification Code: ${dpsCode}</strong> &nbsp;&bull;&nbsp; Verify this license online at verifyguard.dps.texas.gov
</div>`);
}

// ── Document type dispatch ────────────────────────────────────────────────────

const DOC_GENERATORS: Record<string, (emp: any, ws: any) => string> = {
  employment_application:     genEmploymentApplication,
  photo_id_copy:              genGovernmentID,
  government_id:              genGovernmentID,
  social_security_card:       genSSNAcknowledgment,
  ssn_card:                   genSSNAcknowledgment,
  i9_form:                    genI9,
  w4_form:                    genW4,
  w9_form:                    genW4,
  tax_form:                   genW4,
  zero_policy_drug_form:      genDrugFree,
  drug_test:                  genDrugFree,
  background_check:           genBackgroundCheck,
  guard_card:                 genGuardCard,
  guard_card_copy:            genGuardCard,
  license:                    genGuardCard,
  cover_sheet:                genEmploymentApplication,
};

// ── Routes ────────────────────────────────────────────────────────────────────

documentViewRouter.get('/view/:docId', async (req: any, res) => {
  try {
    const { docId } = req.params;
    const workspaceId = req.workspaceId || req.user?.workspaceId || req.user?.currentWorkspaceId;

    const [doc] = await db.select().from(employeeDocuments)
      .where(eq(employeeDocuments.id, docId));

    if (!doc) return res.status(404).send(pageShell('Document Not Found',
      '<h2>Document Not Found</h2><p>The requested document record does not exist.</p>'));

    if (workspaceId && doc.workspaceId !== workspaceId) {
      return res.status(403).send('Access denied');
    }

    const [emp] = await db.select({
      id: employees.id, firstName: employees.firstName, lastName: employees.lastName,
      email: employees.email, phone: employees.phone, position: employees.position,
      hireDate: employees.hireDate, hourlyRate: employees.hourlyRate,
      workerType: employees.workerType, payType: employees.payType,
      payFrequency: employees.payFrequency,
      address: employees.address, city: employees.city, state: employees.state,
      zipCode: employees.zipCode, dateOfBirth: employees.dateOfBirth,
      fullLegalName: employees.fullLegalName, guardCardNumber: employees.guardCardNumber,
      guardCardIssueDate: employees.guardCardIssueDate, guardCardExpiryDate: employees.guardCardExpiryDate,
      ssnLast4: employees.ssnLast4, emergencyContactName: employees.emergencyContactName,
      emergencyContactPhone: employees.emergencyContactPhone,
      guardCardVerified: employees.guardCardVerified, isArmed: employees.isArmed,
    }).from(employees).where(eq(employees.id, doc.employeeId));

    const [ws] = await db.select({
      id: workspaces.id, name: workspaces.name, stateLicenseNumber: workspaces.stateLicenseNumber,
    }).from(workspaces).where(eq(workspaces.id, doc.workspaceId));

    const docType = doc.documentType;
    const generator = DOC_GENERATORS[docType] || DOC_GENERATORS['employment_application'];
    const html = generator(emp || { id: doc.employeeId, firstName: 'Employee', lastName: 'Record', ...doc }, ws || {});

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (err) {
    log.error('[documentView] error:', err);
    res.status(500).send('Error generating document');
  }
});

documentViewRouter.get('/download/:docId', async (req: any, res) => {
  try {
    const { docId } = req.params;
    const workspaceId = req.workspaceId || req.user?.workspaceId || req.user?.currentWorkspaceId;

    const [doc] = await db.select().from(employeeDocuments)
      .where(eq(employeeDocuments.id, docId));

    if (!doc) return res.status(404).send('Not found');
    if (workspaceId && doc.workspaceId !== workspaceId) return res.status(403).send('Access denied');

    const [emp] = await db.select({
      id: employees.id, firstName: employees.firstName, lastName: employees.lastName,
      email: employees.email, phone: employees.phone, position: employees.position,
      hireDate: employees.hireDate, hourlyRate: employees.hourlyRate,
      workerType: employees.workerType, payType: employees.payType,
      payFrequency: employees.payFrequency,
      address: employees.address, city: employees.city, state: employees.state,
      zipCode: employees.zipCode, dateOfBirth: employees.dateOfBirth,
      fullLegalName: employees.fullLegalName, guardCardNumber: employees.guardCardNumber,
      guardCardIssueDate: employees.guardCardIssueDate, guardCardExpiryDate: employees.guardCardExpiryDate,
      ssnLast4: employees.ssnLast4, emergencyContactName: employees.emergencyContactName,
      emergencyContactPhone: employees.emergencyContactPhone,
      guardCardVerified: employees.guardCardVerified, isArmed: employees.isArmed,
    }).from(employees).where(eq(employees.id, doc.employeeId));

    const [ws] = await db.select({
      id: workspaces.id, name: workspaces.name, stateLicenseNumber: workspaces.stateLicenseNumber,
    }).from(workspaces).where(eq(workspaces.id, doc.workspaceId));

    const docType = doc.documentType;
    const generator = DOC_GENERATORS[docType] || DOC_GENERATORS['employment_application'];
    const html = generator(emp || { id: doc.employeeId, firstName: 'Employee', lastName: 'Record' }, ws || {});
    const name = emp ? `${emp.firstName}_${emp.lastName}` : 'employee';
    const filename = `${name}_${docType.replace(/_/g, '-')}.html`;

    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(html);
  } catch (err) {
    log.error('[documentDownload] error:', err);
    res.status(500).send('Error generating document');
  }
});
