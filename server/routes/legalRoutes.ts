/**
 * Phase 52 — Legal Document Endpoints
 * =====================================
 * GET /api/legal/dpa/download — serves the DPA as an HTML file for download
 */

import { Router } from "express";
import type { Request, Response } from "express";
import { PLATFORM } from '../config/platformConfig';

const router = Router();

function generateDPAHtml(): string {
  const name = PLATFORM.name;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${name} Data Processing Agreement (DPA)</title>
<style>
  body { font-family: Georgia, serif; max-width: 800px; margin: 0 auto; padding: 40px 24px; color: #1a1a1a; line-height: 1.7; }
  h1 { font-size: 2rem; margin-bottom: 4px; }
  h2 { font-size: 1.25rem; margin-top: 2rem; }
  p { margin: 0.75rem 0; }
  ul { margin: 0.5rem 0; padding-left: 1.5rem; }
  .meta { color: #666; font-size: 0.9rem; margin-bottom: 2rem; }
  .note { background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px; padding: 16px; font-size: 0.9rem; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
<h1>Data Processing Agreement (DPA)</h1>
<p class="meta">Version 1.0 | Effective: March 27, 2026 | GDPR Article 28 Compliant | ${name}</p>

<div class="note">
  <strong>Note:</strong> This DPA applies to all ${name} customers who process personal data
  of EU/EEA residents or California residents under GDPR and CCPA respectively. By using
  ${name}, you (the "Controller") and ${name} ("Processor") enter into this DPA.
</div>

<h2>1. Definitions</h2>
<ul>
  <li><strong>Controller:</strong> The organization that determines the purposes and means of processing personal data.</li>
  <li><strong>Processor:</strong> ${name}, which processes personal data on behalf of the Controller.</li>
  <li><strong>Sub-processor:</strong> Third parties engaged by ${name} to assist in processing.</li>
  <li><strong>Personal Data:</strong> Any information relating to an identified or identifiable natural person.</li>
  <li><strong>Data Subject:</strong> The individuals whose personal data is processed.</li>
</ul>

<h2>2. Scope and Purpose</h2>
<p>
  This DPA governs ${name}'s processing of Personal Data on behalf of the Controller
  in connection with the provision of the ${name} Platform ("Services"). ${name}
  processes Personal Data only for the purpose of delivering the Services and as
  specifically instructed by the Controller.
</p>

<h2>3. Processor Obligations</h2>
<p>${name} shall:</p>
<ul>
  <li>Process Personal Data only on documented instructions from the Controller</li>
  <li>Ensure that authorized personnel are bound by confidentiality obligations</li>
  <li>Implement appropriate technical and organizational security measures</li>
  <li>Assist the Controller in ensuring compliance with data subject rights</li>
  <li>Delete or return all Personal Data upon termination of Services</li>
  <li>Provide all necessary information to demonstrate compliance with GDPR Article 28</li>
</ul>

<h2>4. Sub-processors</h2>
<p>
  ${name} uses sub-processors to deliver portions of the Services. A current list
  of sub-processors is available upon request at legal@${PLATFORM.domain}. ${name}
  shall notify the Controller at least 10 days before adding or replacing sub-processors.
  The Controller may object in writing within 10 days.
</p>

<h2>5. Security Measures</h2>
<p>${name} implements the following technical and organizational measures:</p>
<ul>
  <li>Encryption of Personal Data at rest (AES-256) and in transit (TLS 1.2+)</li>
  <li>Role-based access controls and multi-factor authentication for administrative access</li>
  <li>Regular security testing and vulnerability assessments</li>
  <li>Incident response plan with 72-hour breach notification to the Controller</li>
  <li>Business continuity and disaster recovery procedures</li>
</ul>

<h2>6. Data Subject Rights</h2>
<p>
  ${name} shall assist the Controller in responding to data subject requests including
  access, rectification, erasure, restriction, portability, and objection. The Controller
  is responsible for responding to data subjects; ${name} will provide assistance
  within 5 business days of a written request.
</p>

<h2>7. International Transfers</h2>
<p>
  Where Personal Data is transferred outside the EEA, ${name} shall ensure appropriate
  safeguards are in place, including Standard Contractual Clauses (SCCs) where required.
</p>

<h2>8. Data Retention and Deletion</h2>
<p>
  Upon termination or expiry of the Service Agreement, ${name} shall delete or return
  all Personal Data within 30 days, unless retention is required by applicable law.
</p>

<h2>9. Audits and Inspections</h2>
<p>
  ${name} shall make available all information necessary to demonstrate compliance
  and allow for audits by the Controller or a mandated third party with at least
  30 days' prior written notice.
</p>

<h2>10. Governing Law</h2>
<p>
  This DPA is governed by the laws applicable to the principal Service Agreement between
  the parties. In the absence of a governing law clause, the laws of the State of
  California, USA shall apply.
</p>

<h2>11. Contact</h2>
<p>
  Data Protection Officer: dpo@${PLATFORM.domain}<br />
  Legal enquiries: legal@${PLATFORM.domain}<br />
  ${name} Inc., Workforce Automation Division
</p>

<p style="margin-top:3rem; font-size:0.8rem; color:#888;">
  &copy; 2025 ${name} Inc. All rights reserved. This document is provided for
  informational purposes. For a legally-binding executed DPA, contact legal@${PLATFORM.domain}.
</p>
</body>
</html>`;
}

// GET /api/legal/dpa/download — serve DPA as HTML download
router.get("/dpa/download", (_req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${PLATFORM.name}-DPA.html"`);
  res.setHeader("Cache-Control", "public, max-age=86400");
  return res.send(generateDPAHtml());
});

// GET /api/legal/dpa — redirect to DPA page (convenience)
router.get("/dpa", (_req: Request, res: Response) => {
  return res.redirect(302, "/dpa");
});

export default router;
