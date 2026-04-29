/**
 * HR Documents Center
 * ===================
 * Document template library for security companies (templates are for reference only — not legal advice).
 * Shows 14+ pre-populated templates across 4 categories with preview,
 * generation, and send-for-signature capabilities.
 *
 * Categories:
 * - Employee Onboarding (10 docs)
 * - Contractor Onboarding (4 docs)
 * - Operational (3 docs)
 * - Client-Facing (3 docs)
 */

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useEmployee } from "@/hooks/useEmployee";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { PageSkeleton } from "@/components/ui/skeleton-loaders";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  UniversalModal,
  UniversalModalContent,
  UniversalModalHeader,
  UniversalModalTitle,
  UniversalModalFooter,
} from "@/components/ui/universal-modal";
import {
  UniversalDocumentFrame,
  DocumentSection,
  DocumentField,
  DocumentGrid,
  DocumentText,
  DocumentBullets,
  DocumentLegalText,
  type DocumentStatus,
} from "@/components/documents/UniversalDocumentFrame";
import {
  Eye,
  FileText,
  Send,
  Download,
  Search,
  Users,
  Briefcase,
  ClipboardList,
  Building2,
  Shield,
  CheckCircle2,
  Clock,
  FileSignature,
  AlertTriangle,
} from 'lucide-react';;
import { format } from "date-fns";

// ─── ORG DEFAULTS (overridden by live workspace data in the component) ─────────
const ACME_ORG = {
  name: "Your Security Company",
  licenseNumber: "[License #]",
  address: "[Company Address]",
  phone: "[Phone]",
  email: "[hr@yourcompany.com]",
  stateOfIncorporation: "Texas",
  federalEIN: "[EIN]",
};

// ─── DOCUMENT DATA TYPES ────────────────────────────────────────────────────────
interface EmployeeData {
  fullName: string;
  firstName: string;
  lastName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  email: string;
  position: string;
  psbLicense: string;
  licenseExpiry: string;
  startDate: string;
  payRate: string;
  payType: string;
  manager: string;
}

interface ContractorData {
  fullName: string;
  firstName: string;
  businessName: string;
  ein: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  email: string;
  position: string;
  psbLicense: string;
  licenseExpiry: string;
  startDate: string;
  rate: string;
}

interface ClientData {
  clientName: string;
  address: string;
  contact: string;
  phone: string;
  email: string;
  siteId: string;
}

const TODAY = format(new Date(), "MMMM d, yyyy");
const TODAY_ISO = new Date().toISOString();

// ─── DOCUMENT TEMPLATE DEFINITIONS ────────────────────────────────────────────

interface DocumentTemplate {
  id: string;
  title: string;
  description: string;
  category: "employee" | "contractor" | "operational" | "client";
  requiresSignature: boolean;
  signatureCount: number;
  estimatedMinutes: number;
  tags: string[];
  simulationLabel: string;
  renderContent: () => React.ReactNode;
}

function makeTemplates(
  emp: EmployeeData,
  contractor: ContractorData,
  client: ClientData,
  org: { name: string; licenseNumber: string; federalEIN: string },
): DocumentTemplate[] {
  return [
  // ── EMPLOYEE ONBOARDING ────────────────────────────────────────────────────
  {
    id: "employee-application",
    title: "Employment Application",
    description: "Standard job application capturing work history, references, education, and licensing status for security officer candidates in Texas.",
    category: "employee",
    requiresSignature: true,
    signatureCount: 1,
    estimatedMinutes: 15,
    tags: ["onboarding", "hiring", "texas"],
    simulationLabel: "Marcus Johnson — Security Officer II",
    renderContent: () => (
      <div className="space-y-6">
        <DocumentSection title="Personal Information">
          <DocumentGrid cols={2}>
            <DocumentField label="Full Legal Name" value={emp.fullName} />
            <DocumentField label="Address" value={emp.address} />
            <DocumentField label="City / State / ZIP" value={`${emp.city}, ${emp.state} ${emp.zip}`} />
            <DocumentField label="Phone" value={emp.phone} />
            <DocumentField label="Email" value={emp.email} />
          </DocumentGrid>
        </DocumentSection>
        <DocumentSection title="Position Applied For">
          <DocumentGrid cols={2}>
            <DocumentField label="Position" value={emp.position} />
            <DocumentField label="Available Start Date" value={emp.startDate} />
            <DocumentField label="Desired Pay" value={emp.payRate} />
            <DocumentField label="Employment Type" value="Full-Time W-2 Employee" />
          </DocumentGrid>
        </DocumentSection>
        <DocumentSection title="Texas PSB Licensing">
          <DocumentGrid cols={2}>
            <DocumentField label="PSB License Number" value={emp.psbLicense} />
            <DocumentField label="License Expiration" value={emp.licenseExpiry} />
            <DocumentField label="License Class" value="Class B — Unarmed Security Officer" />
            <DocumentField label="Armed Endorsement" value="No" />
          </DocumentGrid>
        </DocumentSection>
        <DocumentSection title="Work Authorization">
          <DocumentText>
            I certify that I am authorized to work in the United States and that the information provided in this application is true and complete to the best of my knowledge.
          </DocumentText>
        </DocumentSection>
        <DocumentSection title="Acknowledgment">
          <DocumentLegalText>
            False statements on this application are grounds for immediate termination. I authorize {org.name} to contact previous employers, references, and educational institutions. I understand that employment is at-will under Texas law and may be terminated by either party at any time with or without cause.
          </DocumentLegalText>
        </DocumentSection>
      </div>
    ),
  },
  {
    id: "offer-letter",
    title: "Offer Letter",
    description: "Conditional offer of employment with position title, start date, compensation, and at-will employment notice as required in Texas.",
    category: "employee",
    requiresSignature: true,
    signatureCount: 2,
    estimatedMinutes: 5,
    tags: ["onboarding", "hiring", "compensation"],
    simulationLabel: "Marcus Johnson — Offered: Security Officer II",
    renderContent: () => (
      <div className="space-y-6">
        <div className="text-right text-sm text-muted-foreground">{TODAY}</div>
        <div>
          <DocumentText>Dear {emp.firstName},</DocumentText>
          <div className="mt-3 space-y-3">
            <DocumentText>
              On behalf of {org.name}, we are pleased to extend this conditional offer of employment for the position of <strong>{emp.position}</strong> based in Houston, Texas.
            </DocumentText>
            <DocumentText>
              Your employment is conditioned upon successful completion of a background check, drug screening, and verification of your Texas PSB security officer license.
            </DocumentText>
          </div>
        </div>
        <DocumentSection title="Offer Terms">
          <DocumentGrid cols={2}>
            <DocumentField label="Position Title" value={emp.position} />
            <DocumentField label="Department" value="Field Operations" />
            <DocumentField label="Employment Type" value="Full-Time, Non-Exempt" />
            <DocumentField label="Start Date" value={emp.startDate} />
            <DocumentField label="Pay Rate" value={emp.payRate} />
            <DocumentField label="Pay Frequency" value="Bi-Weekly" />
            <DocumentField label="Reports To" value={emp.manager} />
            <DocumentField label="Work Location" value="Houston, TX (Various Sites)" />
          </DocumentGrid>
        </DocumentSection>
        <DocumentSection title="At-Will Employment">
          <DocumentText>
            Your employment with {org.name} is at-will under Texas law. Either party may terminate the employment relationship at any time, with or without cause or notice.
          </DocumentText>
        </DocumentSection>
        <DocumentSection title="Conditions of Employment">
          <DocumentBullets items={[
            "Valid Texas PSB Class B (or higher) Security Officer License maintained at all times",
            "Successful completion of background check and drug test",
            "Completion of all required company onboarding documents within 15 days of hire",
            "Compliance with all company policies as outlined in the Employee Handbook",
          ]} />
        </DocumentSection>
        <DocumentText>
          Please sign and return this offer letter by <strong>{format(new Date(Date.now() + 5 * 86400000), "MMMM d, yyyy")}</strong>. We look forward to having you on the team.
        </DocumentText>
        <div className="text-sm text-muted-foreground">
          Sincerely,<br />
          <strong>Diana Rivera</strong><br />
          Operations Manager, {org.name}
        </div>
      </div>
    ),
  },
  {
    id: "w4",
    title: "W-4 Employee's Withholding Certificate",
    description: "IRS Form W-4 for federal income tax withholding. Must be completed before first paycheck.",
    category: "employee",
    requiresSignature: true,
    signatureCount: 1,
    estimatedMinutes: 10,
    tags: ["payroll", "tax", "irs"],
    simulationLabel: "Marcus Johnson — 2024 W-4",
    renderContent: () => (
      <div className="space-y-6">
        <div className="p-3 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
          <DocumentText>
            <strong>IRS Form W-4</strong> — Employee's Withholding Certificate. Complete this form so {org.name} can withhold the correct federal income tax from your pay.
          </DocumentText>
        </div>
        <DocumentSection title="Step 1 — Personal Information">
          <DocumentGrid cols={2}>
            <DocumentField label="First Name & Middle Initial" value="Marcus D." />
            <DocumentField label="Last Name" value="Johnson" />
            <DocumentField label="Address" value={emp.address} />
            <DocumentField label="City / State / ZIP" value={`${emp.city}, ${emp.state} ${emp.zip}`} />
            <DocumentField label="Filing Status" value="Single or Married filing separately" />
          </DocumentGrid>
        </DocumentSection>
        <DocumentSection title="Step 2 — Multiple Jobs or Spouse Works">
          <DocumentText>
            Complete this step if you (1) hold more than one job at a time, or (2) are married filing jointly and your spouse also works. Leave blank if it does not apply.
          </DocumentText>
          <DocumentField label="Multiple Jobs (check if applicable)" value="Not applicable" />
        </DocumentSection>
        <DocumentSection title="Step 3 — Claim Dependents">
          <DocumentGrid cols={2}>
            <DocumentField label="Qualifying Children Under 17" value="0" />
            <DocumentField label="Other Dependents" value="0" />
            <DocumentField label="Total Claim Amount" value="$0" />
          </DocumentGrid>
        </DocumentSection>
        <DocumentSection title="Step 4 — Other Adjustments (Optional)">
          <DocumentGrid cols={2}>
            <DocumentField label="Other Income (not from jobs)" value="$0" />
            <DocumentField label="Deductions" value="$0" />
            <DocumentField label="Extra Withholding Per Pay Period" value="$0" />
          </DocumentGrid>
        </DocumentSection>
        <DocumentLegalText>
          Under penalties of perjury, I declare that this certificate, to the best of my knowledge and belief, is true, correct, and complete.
        </DocumentLegalText>
      </div>
    ),
  },
  {
    id: "i9",
    title: "I-9 Employment Eligibility Verification",
    description: "USCIS Form I-9 for verifying identity and employment authorization. Must be completed on or before first day of work.",
    category: "employee",
    requiresSignature: true,
    signatureCount: 2,
    estimatedMinutes: 15,
    tags: ["compliance", "uscis", "identity"],
    simulationLabel: "Marcus Johnson — I-9 Verification",
    renderContent: () => (
      <div className="space-y-6">
        <div className="p-3 rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
          <DocumentText>
            <strong>USCIS Form I-9</strong> — Employment Eligibility Verification. Employers must complete this form within 3 business days of the employee's first day of work for pay.
          </DocumentText>
        </div>
        <DocumentSection title="Section 1 — Employee Information (Completed by Employee)">
          <DocumentGrid cols={2}>
            <DocumentField label="Last Name" value="Johnson" />
            <DocumentField label="First Name" value="Marcus" />
            <DocumentField label="Middle Initial" value="D" />
            <DocumentField label="Other Last Names Used" value="None" />
            <DocumentField label="Address" value={emp.address} />
            <DocumentField label="City / State / ZIP" value={`${emp.city}, ${emp.state} ${emp.zip}`} />
            <DocumentField label="Date of Birth" value="**/**/1990" />
            <DocumentField label="Email" value={emp.email} />
            <DocumentField label="Phone" value={emp.phone} />
          </DocumentGrid>
          <div className="mt-4">
            <DocumentText>
              <strong>Attestation:</strong> I attest, under penalty of perjury, that I am (check one):
            </DocumentText>
            <div className="mt-2 space-y-1 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded border-2 border-primary bg-primary/20 flex items-center justify-center">
                  <div className="w-2 h-2 bg-primary rounded-sm" />
                </div>
                <span>A citizen of the United States</span>
              </div>
            </div>
          </div>
        </DocumentSection>
        <DocumentSection title="Section 2 — Employer Review (Completed by Employer)">
          <DocumentGrid cols={2}>
            <DocumentField label="Employer/Organization Name" value={org.name} />
            <DocumentField label="Employer EIN" value={org.federalEIN} />
            <DocumentField label="First Day of Employment" value={emp.startDate} />
            <DocumentField label="Document Title (List A)" value="U.S. Passport" />
            <DocumentField label="Issuing Authority" value="U.S. Department of State" />
            <DocumentField label="Document Number" value="***4521" />
            <DocumentField label="Expiration Date" value="2029-04-15" />
          </DocumentGrid>
        </DocumentSection>
        <DocumentLegalText>
          ANTI-DISCRIMINATION NOTICE: All employees can choose which acceptable documentation to present. It is illegal to discriminate against work-authorized individuals. Employers CANNOT specify which documents they will accept from an employee. The refusal to hire or continue to employ an individual because the documentation presented has a future expiration date may also constitute illegal discrimination.
        </DocumentLegalText>
      </div>
    ),
  },
  {
    id: "direct-deposit",
    title: "Direct Deposit Authorization",
    description: "Employee's authorization for payroll direct deposit, including banking information and ACH authorization.",
    category: "employee",
    requiresSignature: true,
    signatureCount: 1,
    estimatedMinutes: 5,
    tags: ["payroll", "banking"],
    simulationLabel: "Marcus Johnson — Direct Deposit",
    renderContent: () => (
      <div className="space-y-6">
        <DocumentText>
          I, <strong>{emp.fullName}</strong>, authorize {org.name} to initiate credit entries and, if necessary, debit entries and adjustments for any credit entries made in error to my account(s) indicated below.
        </DocumentText>
        <DocumentSection title="Account Information">
          <DocumentGrid cols={2}>
            <DocumentField label="Bank Name" value="Chase Bank" />
            <DocumentField label="Account Type" value="Checking" />
            <DocumentField label="Routing Number" value="021000021" />
            <DocumentField label="Account Number (masked)" value="****7842" />
            <DocumentField label="Percentage / Amount" value="100% of net pay" />
            <DocumentField label="Effective Date" value={emp.startDate} />
          </DocumentGrid>
        </DocumentSection>
        <DocumentSection title="Authorization">
          <DocumentLegalText>
            This authorization is to remain in full force and effect until {org.name} and the depository named above have received written notification from me of its termination in such time and manner as to afford {org.name} and the depository a reasonable opportunity to act on it. I understand that this authorization supersedes and cancels any prior direct deposit authorizations.
          </DocumentLegalText>
        </DocumentSection>
      </div>
    ),
  },
  {
    id: "tx-psb-license-verification",
    title: "TX PSB License Verification",
    description: "Texas Private Security Bureau license confirmation, including license class, endorsements, and expiration tracking.",
    category: "employee",
    requiresSignature: false,
    signatureCount: 0,
    estimatedMinutes: 2,
    tags: ["compliance", "texas-psb", "licensing"],
    simulationLabel: "Marcus Johnson — License B45678-TX",
    renderContent: () => (
      <div className="space-y-6">
        <div className="p-4 rounded-md border" style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)" }}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#ffc83c" }}>
                Texas Department of Public Safety
              </p>
              <p className="text-sm mt-0.5" style={{ color: "#94a3b8" }}>
                Private Security Bureau — Officer License
              </p>
              <p className="text-2xl font-bold mt-2 font-mono" style={{ color: "#ffffff" }}>
                {emp.psbLicense}
              </p>
            </div>
            <Shield className="w-10 h-10 flex-shrink-0" style={{ color: "#ffc83c" }} />
          </div>
        </div>
        <DocumentSection title="License Details">
          <DocumentGrid cols={2}>
            <DocumentField label="Officer Name" value={emp.fullName} />
            <DocumentField label="License Number" value={emp.psbLicense} />
            <DocumentField label="License Class" value="Class B — Unarmed Security Officer" />
            <DocumentField label="Endorsements" value="None" />
            <DocumentField label="Issue Date" value="2024-03-31" />
            <DocumentField label="Expiration Date" value={emp.licenseExpiry} />
            <DocumentField label="Status" value="Active — Verified" />
            <DocumentField label="Employer of Record" value={org.name} />
          </DocumentGrid>
        </DocumentSection>
        <DocumentSection title="Verification">
          <DocumentText>
            This license was verified against the Texas DPS Private Security Bureau online database on {TODAY}. License is valid and in good standing. No disciplinary actions on record.
          </DocumentText>
        </DocumentSection>
        <DocumentLegalText>
          Texas Occupations Code Chapter 1702 requires all security officers to maintain a valid PSB license while employed. Failure to maintain a valid license results in immediate ineligibility for work assignment.
        </DocumentLegalText>
      </div>
    ),
  },
  {
    id: "handbook-acknowledgment",
    title: "Employee Handbook Acknowledgment",
    description: "Employee acknowledges receipt, understanding, and agreement to comply with all policies in the Employee Handbook.",
    category: "employee",
    requiresSignature: true,
    signatureCount: 1,
    estimatedMinutes: 3,
    tags: ["policy", "handbook"],
    simulationLabel: "Marcus Johnson — Handbook v2.1",
    renderContent: () => (
      <div className="space-y-6">
        <DocumentText>
          I, <strong>{emp.fullName}</strong>, acknowledge that I have received, read, and understand the {org.name} Employee Handbook (Version 2.1, dated {TODAY}).
        </DocumentText>
        <DocumentSection title="Acknowledgment Items">
          <DocumentBullets items={[
            "I have received a copy of the Employee Handbook and understand it is my responsibility to read and comply with all policies.",
            "I understand the handbook does not constitute a contract of employment and that my employment is at-will under Texas law.",
            "I understand company policies may change and updates will be communicated via CoAIleague platform notifications.",
            "I have read and understand the Code of Conduct, including zero-tolerance policies for harassment, discrimination, and workplace violence.",
            "I understand the uniforms, equipment use, and appearance policies specific to security operations.",
            "I have read and understand the confidentiality and non-disclosure obligations regarding clients, sites, and company information.",
            "I acknowledge receipt of and agreement to the Electronic Monitoring Notice.",
          ]} />
        </DocumentSection>
        <DocumentSection title="Key Policies Confirmed">
          <DocumentGrid cols={2}>
            <DocumentField label="Handbook Version" value="2.1" />
            <DocumentField label="Date Issued" value={TODAY} />
            <DocumentField label="Attendance Policy" value="Reviewed" />
            <DocumentField label="Uniform Policy" value="Reviewed" />
            <DocumentField label="Drug-Free Workplace Policy" value="Reviewed" />
            <DocumentField label="Social Media Policy" value="Reviewed" />
          </DocumentGrid>
        </DocumentSection>
        <DocumentLegalText>
          If I have questions about any policy, I understand I may contact HR or speak with my direct supervisor. My signature below indicates my acknowledgment of and agreement to comply with all policies described in the Employee Handbook.
        </DocumentLegalText>
      </div>
    ),
  },
  {
    id: "at-will-agreement",
    title: "At-Will Employment Agreement",
    description: "Texas at-will employment acknowledgment establishing that either party may terminate employment at any time.",
    category: "employee",
    requiresSignature: true,
    signatureCount: 2,
    estimatedMinutes: 3,
    tags: ["employment", "legal", "texas"],
    simulationLabel: "Marcus Johnson — At-Will Confirmation",
    renderContent: () => (
      <div className="space-y-6">
        <DocumentText>
          This At-Will Employment Acknowledgment is entered into on {TODAY} between <strong>{org.name}</strong> ("Company") and <strong>{emp.fullName}</strong> ("Employee").
        </DocumentText>
        <DocumentSection title="At-Will Employment Statement">
          <DocumentText>
            I understand and acknowledge that my employment with {org.name} is AT-WILL under the laws of the State of Texas. This means that either the Company or I may terminate the employment relationship at any time, for any reason or no reason, with or without cause or advance notice.
          </DocumentText>
        </DocumentSection>
        <DocumentSection title="No Contrary Representations">
          <DocumentBullets items={[
            "No oral statements, promises, or representations made to me constitute a contract of employment for any specific duration.",
            "No manager, supervisor, or representative of the company has the authority to change this at-will employment relationship except the CEO or COO in writing.",
            "This acknowledgment supersedes any prior verbal or written statements to the contrary.",
            "This acknowledgment does not create any guarantee of continued employment for any specific period.",
          ]} />
        </DocumentSection>
        <DocumentSection title="Applicable Law">
          <DocumentText>
            This agreement shall be governed by and construed in accordance with the laws of the State of Texas. Any disputes arising from this employment relationship shall be resolved in Harris County, Texas.
          </DocumentText>
        </DocumentSection>
      </div>
    ),
  },
  {
    id: "confidentiality-nda",
    title: "Confidentiality & Non-Disclosure Agreement",
    description: "Protects client identities, site locations, post orders, patrol patterns, and business information from unauthorized disclosure.",
    category: "employee",
    requiresSignature: true,
    signatureCount: 2,
    estimatedMinutes: 5,
    tags: ["legal", "nda", "confidentiality"],
    simulationLabel: "Marcus Johnson — NDA",
    renderContent: () => (
      <div className="space-y-6">
        <DocumentText>
          This Non-Disclosure and Confidentiality Agreement ("Agreement") is entered into as of {TODAY} between <strong>{org.name}</strong> ("Company") and <strong>{emp.fullName}</strong> ("Employee").
        </DocumentText>
        <DocumentSection title="Definition of Confidential Information">
          <DocumentText>
            "Confidential Information" includes, without limitation:
          </DocumentText>
          <DocumentBullets items={[
            "Client names, addresses, facility layouts, and security vulnerabilities",
            "Post orders, patrol patterns, schedule rotations, and deployment strategies",
            "Proprietary security procedures, alarm codes, and access control information",
            "Employee compensation, personnel matters, and performance information",
            "Business strategies, pricing, contracts, and financial information",
            "Any information designated as confidential by the Company or client",
          ]} />
        </DocumentSection>
        <DocumentSection title="Employee Obligations">
          <DocumentBullets items={[
            "Employee shall hold all Confidential Information in strict confidence",
            "Employee shall not disclose Confidential Information to any third party without prior written consent",
            "Employee shall use Confidential Information solely to perform assigned duties",
            "Obligations survive termination of employment indefinitely for client security information",
            "Employee shall immediately report any suspected breach of confidentiality",
          ]} />
        </DocumentSection>
        <DocumentSection title="Remedies">
          <DocumentText>
            Employee acknowledges that any breach of this Agreement would cause irreparable harm to the Company and its clients, and the Company shall be entitled to seek injunctive relief without bond or other security in addition to all other available remedies.
          </DocumentText>
        </DocumentSection>
      </div>
    ),
  },
  {
    id: "background-check-auth",
    title: "Background Check & Drug Test Authorization",
    description: "FCRA-compliant authorization for criminal background check, employment verification, and pre-employment drug screening.",
    category: "employee",
    requiresSignature: true,
    signatureCount: 1,
    estimatedMinutes: 5,
    tags: ["compliance", "fcra", "background"],
    simulationLabel: "Marcus Johnson — Background Authorization",
    renderContent: () => (
      <div className="space-y-6">
        <div className="p-3 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
          <DocumentText>
            <strong>FCRA Notice:</strong> This authorization is provided pursuant to the Fair Credit Reporting Act (FCRA), 15 U.S.C. §1681 et seq.
          </DocumentText>
        </div>
        <DocumentText>
          I, <strong>{emp.fullName}</strong>, hereby authorize <strong>{org.name}</strong> and its designated consumer reporting agency to conduct a comprehensive background investigation.
        </DocumentText>
        <DocumentSection title="Background Check Scope">
          <DocumentBullets items={[
            "Criminal history — felony and misdemeanor records (7-year Texas search)",
            "Texas DPS sex offender registry search",
            "Federal criminal records search",
            "Employment history verification (10 years)",
            "Professional license verification — Texas PSB",
            "Motor vehicle records (MVR) — Texas DPS",
            "Social Security number trace and identity verification",
          ]} />
        </DocumentSection>
        <DocumentSection title="Drug Screening Authorization">
          <DocumentText>
            I also authorize a pre-employment drug screening for the following substances: marijuana (THC), cocaine, opiates, amphetamines, phencyclidine (PCP), barbiturates, and benzodiazepines. Testing will be conducted at a SAMHSA-certified laboratory. A positive test will result in withdrawal of the conditional offer of employment.
          </DocumentText>
        </DocumentSection>
        <DocumentSection title="Applicant Rights">
          <DocumentBullets items={[
            "I have the right to request disclosure of the nature and scope of any consumer report",
            "I have the right to receive a copy of any consumer report obtained",
            "Before any adverse action is taken, I will receive a Pre-Adverse Action Notice and copy of the report",
            "I may dispute inaccurate information with the consumer reporting agency",
          ]} />
        </DocumentSection>
        <DocumentGrid cols={2}>
          <DocumentField label="Applicant Name" value={emp.fullName} />
          <DocumentField label="Date of Birth" value="[Date of Birth]" />
          <DocumentField label="Current Address" value={emp.address} />
        </DocumentGrid>
      </div>
    ),
  },

  // ── CONTRACTOR ONBOARDING ─────────────────────────────────────────────────
  {
    id: "contractor-agreement",
    title: "Independent Contractor Agreement",
    description: "1099 independent contractor agreement template establishing the nature of the contractor relationship and scope of services. Have your attorney review before use.",
    category: "contractor",
    requiresSignature: true,
    signatureCount: 2,
    estimatedMinutes: 10,
    tags: ["contractor", "1099", "legal"],
    simulationLabel: "Rosa Delgado — RD Security Consulting",
    renderContent: () => (
      <div className="space-y-6">
        <DocumentText>
          This Independent Contractor Agreement ("Agreement") is entered into as of {TODAY} between <strong>{org.name}</strong> ("Company") and <strong>{contractor.businessName}</strong>, represented by <strong>{contractor.fullName}</strong> ("Contractor").
        </DocumentText>
        <DocumentSection title="Contractor Information">
          <DocumentGrid cols={2}>
            <DocumentField label="Contractor Name" value={contractor.fullName} />
            <DocumentField label="Business Name" value={contractor.businessName} />
            <DocumentField label="EIN" value={contractor.ein} />
            <DocumentField label="PSB License" value={contractor.psbLicense} />
            <DocumentField label="License Expiry" value={contractor.licenseExpiry} />
            <DocumentField label="Position" value={contractor.position} />
          </DocumentGrid>
        </DocumentSection>
        <DocumentSection title="Nature of Relationship">
          <DocumentText>
            Contractor is an independent contractor and not an employee, agent, partner, or joint venturer of the Company. Contractor shall have no authority to bind the Company in any contract or agreement without prior written authorization. Contractor retains control over the manner and means of performing services, subject to the Company's performance standards and client requirements.
          </DocumentText>
        </DocumentSection>
        <DocumentSection title="Compensation">
          <DocumentGrid cols={2}>
            <DocumentField label="Rate" value={contractor.rate} />
            <DocumentField label="Payment Type" value="1099-NEC" />
            <DocumentField label="Payment Schedule" value="Bi-Weekly via ACH" />
            <DocumentField label="Effective Date" value={contractor.startDate} />
          </DocumentGrid>
        </DocumentSection>
        <DocumentSection title="Independent Contractor Obligations">
          <DocumentBullets items={[
            "Contractor is responsible for all federal and state income taxes, self-employment taxes, and any other applicable taxes",
            "Contractor shall maintain general liability insurance of at least $1,000,000 per occurrence",
            "Contractor shall maintain a valid Texas PSB license throughout the term of this agreement",
            "Contractor may not subcontract services without prior written approval from Company",
          ]} />
        </DocumentSection>
        <DocumentLegalText>
          This Agreement constitutes the entire agreement between the parties and supersedes all prior agreements, representations, and understandings. Any modification must be in writing and signed by both parties.
        </DocumentLegalText>
      </div>
    ),
  },
  {
    id: "w9",
    title: "W-9 Request for Taxpayer Identification",
    description: "IRS Form W-9 for contractors and vendors providing their taxpayer identification number for 1099 reporting.",
    category: "contractor",
    requiresSignature: true,
    signatureCount: 1,
    estimatedMinutes: 5,
    tags: ["tax", "irs", "1099"],
    simulationLabel: "Rosa Delgado — W-9 (EIN 82-9876543)",
    renderContent: () => (
      <div className="space-y-6">
        <div className="p-3 rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
          <DocumentText>
            <strong>IRS Form W-9</strong> — Request for Taxpayer Identification Number and Certification. The information you provide will be used to prepare a Form 1099-NEC.
          </DocumentText>
        </div>
        <DocumentSection title="Payee Information">
          <DocumentGrid cols={2}>
            <DocumentField label="Name (as shown on tax return)" value={contractor.fullName} />
            <DocumentField label="Business Name / DBA" value={contractor.businessName} />
            <DocumentField label="Federal Tax Classification" value="LLC — Taxed as S-Corp" />
            <DocumentField label="Exempt Payee Code" value="Not Applicable" />
            <DocumentField label="TIN Type" value="Employer Identification Number (EIN)" />
            <DocumentField label="EIN" value={contractor.ein} />
            <DocumentField label="Address" value={contractor.address} />
            <DocumentField label="City / State / ZIP" value={`${contractor.city}, ${contractor.state} ${contractor.zip}`} />
          </DocumentGrid>
        </DocumentSection>
        <DocumentSection title="Certification">
          <DocumentText>
            Under penalties of perjury, I certify that:
          </DocumentText>
          <DocumentBullets items={[
            "The number shown on this form is my correct taxpayer identification number",
            "I am not subject to backup withholding",
            "I am a U.S. person (including a U.S. resident alien)",
            "The FATCA code(s) entered on this form (if any) indicating that I am exempt from FATCA reporting is correct",
          ]} />
        </DocumentSection>
      </div>
    ),
  },
  {
    id: "contractor-nda",
    title: "Contractor Confidentiality Agreement",
    description: "Non-disclosure agreement specifically for contractors, covering client site information, post orders, and operational security.",
    category: "contractor",
    requiresSignature: true,
    signatureCount: 2,
    estimatedMinutes: 5,
    tags: ["legal", "nda", "contractor"],
    simulationLabel: "Rosa Delgado — Contractor NDA",
    renderContent: () => (
      <div className="space-y-6">
        <DocumentText>
          This Confidentiality Agreement is entered into as of {TODAY} between <strong>{org.name}</strong> ("Company") and <strong>{contractor.fullName}</strong> operating as <strong>{contractor.businessName}</strong> ("Contractor").
        </DocumentText>
        <DocumentSection title="Confidential Information">
          <DocumentBullets items={[
            "All client identities, business addresses, facility layouts, and security vulnerabilities",
            "Post orders, patrol schedules, emergency response protocols, and access credentials",
            "Alarm codes, keypad combinations, and any security bypass information",
            "Client employee names, schedules, and internal business information",
            "Company pricing, contract terms, and competitive information",
          ]} />
        </DocumentSection>
        <DocumentSection title="Contractor Obligations">
          <DocumentBullets items={[
            "Contractor shall not disclose Confidential Information to any third party, including subcontractors, without prior written consent",
            "Contractor shall use Confidential Information solely to perform contracted services",
            "Obligations survive termination of the contractor relationship for 5 years",
            "Obligations regarding client site security information survive indefinitely",
          ]} />
        </DocumentSection>
        <DocumentLegalText>
          Any breach of this Agreement may result in immediate termination of the contractor relationship, legal action for damages, and potential criminal liability under applicable Texas and federal law.
        </DocumentLegalText>
      </div>
    ),
  },
  {
    id: "contractor-post-orders-ack",
    title: "Contractor Post Orders Acknowledgment",
    description: "Contractor-specific acknowledgment of site post orders, confirming understanding of site procedures, emergency contacts, and reporting requirements.",
    category: "contractor",
    requiresSignature: true,
    signatureCount: 1,
    estimatedMinutes: 5,
    tags: ["post-orders", "site-specific", "contractor"],
    simulationLabel: "Rosa Delgado — Lone Star Industrial Site",
    renderContent: () => (
      <div className="space-y-6">
        <DocumentText>
          I, <strong>{contractor.fullName}</strong>, representing <strong>{contractor.businessName}</strong>, acknowledge receipt and understanding of the Post Orders for <strong>{client.clientName}</strong> at <strong>{client.address}</strong>.
        </DocumentText>
        <DocumentSection title="Site Information">
          <DocumentGrid cols={2}>
            <DocumentField label="Client" value={client.clientName} />
            <DocumentField label="Site ID" value={client.siteId} />
            <DocumentField label="Address" value={client.address} />
            <DocumentField label="Client Contact" value={client.contact} />
          </DocumentGrid>
        </DocumentSection>
        <DocumentSection title="Acknowledged Procedures">
          <DocumentBullets items={[
            "Check-in and check-out procedures with site access log",
            "Emergency response protocols and primary/secondary emergency contacts",
            "Patrol patterns — exterior perimeter and interior checkpoints (see attached map)",
            "Prohibited areas and special access restrictions",
            "Incident reporting — all incidents reported via CoAIleague DAR within 2 hours",
            "Visitor management — no access without client-issued credentials",
            "Post Orders are confidential — not to be shared with anyone outside the assignment",
          ]} />
        </DocumentSection>
        <DocumentLegalText>
          Failure to follow post orders may result in immediate removal from the site assignment and termination of the contractor agreement without further obligation by {org.name}.
        </DocumentLegalText>
      </div>
    ),
  },

  // ── OPERATIONAL ──────────────────────────────────────────────────────────
  {
    id: "post-orders-template",
    title: "Post Orders",
    description: "Site-specific post orders document outlining duties, patrol routes, emergency contacts, and special instructions for assigned officers.",
    category: "operational",
    requiresSignature: true,
    signatureCount: 1,
    estimatedMinutes: 3,
    tags: ["post-orders", "operations", "site-specific"],
    simulationLabel: "Lone Star Industrial Park — Post Orders",
    renderContent: () => (
      <div className="space-y-6">
        <DocumentSection title="Site Assignment">
          <DocumentGrid cols={2}>
            <DocumentField label="Client" value={client.clientName} />
            <DocumentField label="Site ID" value={client.siteId} />
            <DocumentField label="Address" value={client.address} />
            <DocumentField label="Effective Date" value={TODAY} />
            <DocumentField label="Post Commander" value={emp.manager} />
            <DocumentField label="Version" value="1.0" />
          </DocumentGrid>
        </DocumentSection>
        <DocumentSection title="Officer Duties">
          <DocumentBullets items={[
            "Conduct exterior perimeter patrol every 60 minutes — log each patrol in CoAIleague DAR",
            "Monitor all vehicle and pedestrian ingress/egress points",
            "Verify credentials of all contractors and visitors — contact site manager for unannounced visitors",
            "Conduct interior checkpoint patrols at: Warehouse A, Warehouse B, Main Office, Loading Dock every 2 hours",
            "Respond to all alarms within 3 minutes of activation — contact client security immediately",
            "Complete Daily Activity Report (DAR) at end of each shift via CoAIleague platform",
          ]} />
        </DocumentSection>
        <DocumentSection title="Emergency Contacts">
          <DocumentGrid cols={2}>
            <DocumentField label="Primary — Site Manager" value={`${client.contact} — ${client.phone}`} />
            <DocumentField label="After-Hours Emergency" value="(713) 555-0199" />
            <DocumentField label="Police (non-emergency)" value="(713) 884-3131" />
            <DocumentField label="Company Dispatch" value="(713) 555-0100" />
          </DocumentGrid>
        </DocumentSection>
        <DocumentSection title="Special Instructions">
          <DocumentBullets items={[
            "CCTV monitoring — report any camera malfunction immediately to dispatch",
            "No personal vehicles in Lot C — reserved for client fleet",
            "Loading dock access requires shipping manifest verification — no exceptions",
            "Active chemical storage in Warehouse B — emergency evacuation to Assembly Point North",
          ]} />
        </DocumentSection>
        <DocumentLegalText>
          Post Orders are classified CONFIDENTIAL. Officers must acknowledge these orders before first assignment and re-acknowledge any time orders are updated. Violations are subject to disciplinary action and removal from post.
        </DocumentLegalText>
      </div>
    ),
  },
  {
    id: "daily-activity-report",
    title: "Daily Activity Report (DAR)",
    description: "Standardized daily shift report capturing patrol activities, incidents, visitor log, and post conditions.",
    category: "operational",
    requiresSignature: true,
    signatureCount: 1,
    estimatedMinutes: 5,
    tags: ["reporting", "daily", "shift"],
    simulationLabel: "Marcus Johnson — Shift Report Template",
    renderContent: () => (
      <div className="space-y-6">
        <DocumentSection title="Shift Information">
          <DocumentGrid cols={2}>
            <DocumentField label="Officer Name" value={emp.fullName} />
            <DocumentField label="PSB License" value={emp.psbLicense} />
            <DocumentField label="Site / Client" value={client.clientName} />
            <DocumentField label="Date" value={TODAY} />
            <DocumentField label="Shift Start" value="18:00" />
            <DocumentField label="Shift End" value="06:00" />
            <DocumentField label="Post Commander" value={emp.manager} />
            <DocumentField label="Relief Officer" value="[Next Officer Name]" />
          </DocumentGrid>
        </DocumentSection>
        <DocumentSection title="Activity Log">
          <div className="border rounded-md overflow-hidden">
            <div className="grid grid-cols-3 gap-0 text-xs font-semibold text-muted-foreground p-2 border-b bg-muted/30">
              <span>Time</span>
              <span className="col-span-2">Activity Description</span>
            </div>
            {[
              ["18:00", "Relieved day shift officer. Equipment check complete. Post secure."],
              ["19:00", "Perimeter patrol — no anomalies noted. All cameras operational."],
              ["21:00", "Visitor: ABC Trucking (manifest #TRK-4421) — authorized entry Lot B."],
              ["23:00", "Interior patrol complete. Warehouse B: locked and secure."],
              ["01:00", "Perimeter patrol. Found open access gate West — secured and reported."],
              ["03:00", "Activity quiet. All posts secure."],
              ["05:30", "End-of-shift report completed. Equipment transferred to relief officer."],
            ].map(([time, activity], i) => (
              <div key={i} className="grid grid-cols-3 gap-0 text-xs p-2 border-b last:border-b-0">
                <span className="font-mono text-muted-foreground">{time}</span>
                <span className="col-span-2 text-foreground">{activity}</span>
              </div>
            ))}
          </div>
        </DocumentSection>
        <DocumentSection title="Incidents">
          <DocumentField label="Incidents This Shift" value="1 — Open access gate West (non-criminal, administrative)" />
          <DocumentField label="Incident Reports Filed" value="None required — minor administrative" />
        </DocumentSection>
      </div>
    ),
  },
  {
    id: "incident-report",
    title: "Incident Report",
    description: "Formal incident documentation including description, witnesses, injuries, property damage, and recommended follow-up.",
    category: "operational",
    requiresSignature: true,
    signatureCount: 2,
    estimatedMinutes: 10,
    tags: ["incident", "reporting", "legal"],
    simulationLabel: "Template — Incident Report",
    renderContent: () => (
      <div className="space-y-6">
        <DocumentSection title="Incident Information">
          <DocumentGrid cols={2}>
            <DocumentField label="Incident Date" value="[Date]" />
            <DocumentField label="Incident Time" value="[Time]" />
            <DocumentField label="Location" value="[Site / Address]" />
            <DocumentField label="Incident Type" value="[Type]" />
            <DocumentField label="Reporting Officer" value="[Officer Name]" />
            <DocumentField label="PSB License" value="[License #]" />
          </DocumentGrid>
        </DocumentSection>
        <DocumentSection title="Incident Description">
          <div className="border rounded-md p-3 min-h-[120px] bg-muted/20">
            <DocumentText>Describe the incident in detail, including what happened, how it was discovered, sequence of events, and officer actions taken...</DocumentText>
          </div>
        </DocumentSection>
        <DocumentSection title="Parties Involved">
          <DocumentGrid cols={2}>
            <DocumentField label="Subject Name" value="[Name or Unknown]" />
            <DocumentField label="Description" value="[Physical description]" />
            <DocumentField label="Witness Name" value="[Witness if any]" />
            <DocumentField label="Contact" value="[Phone/Email]" />
          </DocumentGrid>
        </DocumentSection>
        <DocumentSection title="Injuries & Property Damage">
          <DocumentGrid cols={2}>
            <DocumentField label="Injuries?" value="None / [Describe]" />
            <DocumentField label="EMS Called?" value="No / Yes" />
            <DocumentField label="Property Damage?" value="None / [Describe]" />
            <DocumentField label="Damage Estimate" value="$0 / $[Amount]" />
          </DocumentGrid>
        </DocumentSection>
        <DocumentSection title="Law Enforcement">
          <DocumentGrid cols={2}>
            <DocumentField label="Police Called?" value="No / Yes" />
            <DocumentField label="Police Report #" value="[If applicable]" />
            <DocumentField label="Officer Name" value="[PD Officer if applicable]" />
            <DocumentField label="Disposition" value="[Outcome]" />
          </DocumentGrid>
        </DocumentSection>
      </div>
    ),
  },

  // ── CLIENT-FACING ─────────────────────────────────────────────────────────
  {
    id: "service-proposal",
    title: "Service Proposal",
    description: "Professional security services proposal for prospective clients, including scope of services, pricing, and terms.",
    category: "client",
    requiresSignature: false,
    signatureCount: 0,
    estimatedMinutes: 15,
    tags: ["sales", "proposal", "client"],
    simulationLabel: "Lone Star Industrial Park — Service Proposal",
    renderContent: () => (
      <div className="space-y-6">
        <div className="text-right text-sm text-muted-foreground">{TODAY}</div>
        <div>
          <DocumentText><strong>{client.contact}</strong></DocumentText>
          <DocumentText>{client.clientName}</DocumentText>
          <DocumentText>{client.address}</DocumentText>
        </div>
        <DocumentSection title="Executive Summary">
          <DocumentText>
            {org.name} is pleased to present this Security Services Proposal to {client.clientName}. Our proposal addresses your facility security requirements at {client.address} with experienced, Texas-licensed security professionals, state-of-the-art reporting technology, and proven operational protocols.
          </DocumentText>
        </DocumentSection>
        <DocumentSection title="Proposed Services">
          <DocumentBullets items={[
            "24/7 uniformed security officer coverage — 2 officers per shift",
            "Real-time daily activity reporting via CoAIleague digital platform",
            "Emergency response coordination with Houston PD and Fire",
            "Visitor management and access control",
            "CCTV monitoring and incident documentation",
            "Monthly security assessment reports",
          ]} />
        </DocumentSection>
        <DocumentSection title="Pricing">
          <div className="border rounded-md overflow-hidden">
            <div className="grid grid-cols-3 text-xs font-semibold text-muted-foreground p-2 border-b bg-muted/30">
              <span>Service</span>
              <span>Rate</span>
              <span className="text-right">Monthly Est.</span>
            </div>
            {[
              ["Security Officer (2x 12-hr shifts)", "$22.00/hr × 2", "$31,680"],
              ["Supervisor Coverage (2 hrs/day)", "$28.00/hr", "$1,680"],
              ["Technology & Reporting Platform", "Included", "$0"],
              ["Management Oversight Fee", "10%", "$3,336"],
            ].map(([service, rate, monthly], i) => (
              <div key={i} className="grid grid-cols-3 text-sm p-2 border-b last:border-b-0">
                <span>{service}</span>
                <span className="text-muted-foreground">{rate}</span>
                <span className="text-right font-medium">{monthly}</span>
              </div>
            ))}
            <div className="grid grid-cols-3 text-sm p-2 font-semibold bg-muted/20">
              <span className="col-span-2">Total Monthly Investment</span>
              <span className="text-right">$36,696</span>
            </div>
          </div>
        </DocumentSection>
        <DocumentSection title="Term & Guarantee">
          <DocumentGrid cols={2}>
            <DocumentField label="Initial Term" value="12 months" />
            <DocumentField label="Auto-Renewal" value="Month-to-month after initial term" />
            <DocumentField label="Notice Period" value="30 days written notice" />
            <DocumentField label="Service Level" value="Officer replacement per service agreement terms (negotiate with client)" />
          </DocumentGrid>
        </DocumentSection>
      </div>
    ),
  },
  {
    id: "service-agreement",
    title: "Service Agreement",
    description: "Master service agreement between the security company and client, establishing terms, liability, billing, and service level obligations.",
    category: "client",
    requiresSignature: true,
    signatureCount: 2,
    estimatedMinutes: 15,
    tags: ["contract", "legal", "client"],
    simulationLabel: "Lone Star Industrial — Master Service Agreement",
    renderContent: () => (
      <div className="space-y-6">
        <DocumentText>
          This Security Services Agreement ("Agreement") is entered into as of {TODAY} between <strong>{org.name}</strong> ("Service Provider") and <strong>{client.clientName}</strong> ("Client").
        </DocumentText>
        <DocumentSection title="Parties">
          <DocumentGrid cols={2}>
            <DocumentField label="Service Provider" value={org.name} />
            <DocumentField label="TX PSB License" value={org.licenseNumber} />
            <DocumentField label="Client" value={client.clientName} />
            <DocumentField label="Client Contact" value={client.contact} />
          </DocumentGrid>
        </DocumentSection>
        <DocumentSection title="Services">
          <DocumentText>
            Service Provider agrees to provide uniformed security officer services at the client's facility located at {client.address}, in accordance with the Post Orders attached as Exhibit A, which may be updated by mutual written agreement.
          </DocumentText>
        </DocumentSection>
        <DocumentSection title="Term & Termination">
          <DocumentGrid cols={2}>
            <DocumentField label="Effective Date" value={TODAY} />
            <DocumentField label="Initial Term" value="12 months" />
            <DocumentField label="Renewal" value="Automatic month-to-month" />
            <DocumentField label="Termination Notice" value="30 days written notice by either party" />
          </DocumentGrid>
        </DocumentSection>
        <DocumentSection title="Payment Terms">
          <DocumentBullets items={[
            "Invoices issued bi-weekly based on actual hours worked",
            "Payment due within 30 days of invoice date",
            "Late payment fee of 1.5% per month on balances 30+ days past due",
            "Client responsible for reasonable attorney fees in collection actions",
          ]} />
        </DocumentSection>
        <DocumentSection title="Liability Limitation">
          <DocumentLegalText>
            Service Provider's liability to Client shall not exceed the total fees paid in the 12-month period preceding any claim. Service Provider carries general liability insurance as required by applicable law. Security services are observational and deterrent in nature; they do not guarantee prevention of criminal activity or other adverse events. Service Provider is not liable for criminal acts of third parties. This limitation applies regardless of the form of action, whether in contract, tort, or otherwise. <strong>Consult a licensed attorney before executing this agreement.</strong>
          </DocumentLegalText>
        </DocumentSection>
        <DocumentSection title="Governing Law">
          <DocumentText>
            This Agreement shall be governed by the laws of the State of Texas. All disputes shall be resolved by binding arbitration in Harris County, Texas.
          </DocumentText>
        </DocumentSection>
      </div>
    ),
  },
  ]; // end return
} // end makeTemplates

// ─── CATEGORY CONFIG ───────────────────────────────────────────────────────────

const CATEGORY_CONFIG = {
  employee: {
    label: "Employee Onboarding",
    icon: Users,
    description: "10-document packet for W-2 employees. All documents must be completed within 15 days of hire.",
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    count: 10,
  },
  contractor: {
    label: "Contractor Onboarding",
    icon: Briefcase,
    description: "4-document packet for 1099 independent contractors. Must be completed before first day on site.",
    color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    count: 4,
  },
  operational: {
    label: "Operational Docs",
    icon: ClipboardList,
    description: "Post orders, daily activity reports, and incident documentation for ongoing operations.",
    color: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
    count: 3,
  },
  client: {
    label: "Client-Facing",
    icon: Building2,
    description: "Proposals and service agreements for prospective and active clients.",
    color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    count: 2,
  },
};

// ─── MAIN PAGE ─────────────────────────────────────────────────────────────────

const pageConfig: CanvasPageConfig = {
  id: "hr-documents",
  title: "HR Documents Center",
  subtitle: "Document template library — employee, contractor, operational & client",
  category: "operations",
  maxWidth: "6xl",
};

export default function HrDocuments() {
  const [activeCategory, setActiveCategory] = useState<"employee" | "contractor" | "operational" | "client">("employee");
  const [searchQuery, setSearchQuery] = useState("");
  const [previewTemplate, setPreviewTemplate] = useState<DocumentTemplate | null>(null);

  const { data: workspace, isLoading: workspaceLoading } = useQuery<{ name: string; companyName: string | null; stateLicenseNumber: string | null }>({
    queryKey: ["/api/workspace/current"],
  });

  const { employee: employeeMe, isLoading: employeeLoading } = useEmployee();

  const empData: EmployeeData = useMemo(() => ({
    fullName: employeeMe ? `${employeeMe.firstName} ${employeeMe.lastName}` : '[Employee Name]',
    firstName: employeeMe?.firstName ?? '[First Name]',
    lastName: employeeMe?.lastName ?? '[Last Name]',
    email: employeeMe?.email ?? '[email@company.com]',
    position: employeeMe?.role ?? '[Position]',
    phone: employeeMe?.phone ?? '[Phone]',
    address: employeeMe?.address ?? '[Address]',
    city: employeeMe?.city ?? '[City]',
    state: employeeMe?.state ?? 'TX',
    zip: employeeMe?.zipCode ?? '[ZIP]',
    psbLicense: (employeeMe?.licenses?.[0]) ?? '[PSB License #]',
    licenseExpiry: '[Expiry Date]',
    startDate: employeeMe?.hireDate
      ? format(new Date(employeeMe.hireDate), 'MMMM d, yyyy')
      : format(new Date(), 'MMMM d, yyyy'),
    payRate: employeeMe?.hourlyRate ? `$${employeeMe.hourlyRate}/hr` : '[Pay Rate]',
    payType: 'Hourly',
    manager: '[Manager Name]',
  }), [employeeMe]);

  // Contractor and client templates use generic placeholders — real data comes from
  // the "Send for Signature" flow which queries live employees/clients.
  const contractorData: ContractorData = {
    fullName: '[Contractor Name]',
    firstName: '[First Name]',
    businessName: '[Business Name]',
    ein: '[EIN]',
    address: '[Address]',
    city: '[City]',
    state: 'TX',
    zip: '[ZIP]',
    phone: '[Phone]',
    email: '[contractor@email.com]',
    position: 'Contract Security Supervisor',
    psbLicense: '[PSB License #]',
    licenseExpiry: '[Expiry Date]',
    startDate: format(new Date(), 'MMMM d, yyyy'),
    rate: '[Rate]',
  };

  const clientData: ClientData = {
    clientName: '[Client Name]',
    address: '[Client Address]',
    contact: '[Contact Name, Title]',
    phone: '[Phone]',
    email: '[contact@client.com]',
    siteId: '[Site ID]',
  };

  const orgData = {
    name: workspace?.name || workspace?.companyName || ACME_ORG.name,
    licenseNumber: workspace?.stateLicenseNumber || ACME_ORG.licenseNumber,
    federalEIN: ACME_ORG.federalEIN,
  };

  const templates = useMemo(
    () => makeTemplates(empData, contractorData, clientData, orgData),
    // contractorData and clientData are static placeholders
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [empData, workspace],
  );

  const filteredTemplates = templates.filter(t => {
    const matchesCategory = t.category === activeCategory;
    const matchesSearch = searchQuery === "" || (
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
    );
    return matchesCategory && matchesSearch;
  });

  const catConfig = CATEGORY_CONFIG[activeCategory];
  const CatIcon = catConfig.icon;

  if (workspaceLoading || employeeLoading) {
    return (
      <CanvasHubPage config={pageConfig}>
        <PageSkeleton />
      </CanvasHubPage>
    );
  }

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="space-y-5">
        {/* ── Legal Disclaimer Banner ────────────────────────── */}
        <div className="rounded-md px-4 py-3 flex items-start gap-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
          <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
            <strong>For Reference Only — Not Legal Advice.</strong> These document templates are provided as starting points only. CoAIleague is not a law firm and does not practice law. Templates may not reflect current law in your state or jurisdiction, may require modification for your specific situation, and do not constitute legal, HR, tax, or compliance advice. Always have a licensed attorney in your jurisdiction review any document before use or execution.
          </p>
        </div>

        {/* ── Org Banner ────────────────────────────────────── */}
        <div
          className="rounded-md px-4 py-3 flex flex-wrap items-center gap-3"
          style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)", border: "1px solid rgba(255,200,60,0.25)" }}
        >
          <Shield className="w-4 h-4 flex-shrink-0" style={{ color: "#ffc83c" }} />
          <span className="text-sm" style={{ color: "#94a3b8" }}>
            Templates populated with —
            <span className="font-medium" style={{ color: "#ffffff" }}> {workspace?.name || workspace?.companyName || ACME_ORG.name}</span>
            {(workspace?.stateLicenseNumber) && (
              <>
                <span style={{ color: "#64748b" }}> · </span>
                <span style={{ color: "#ffc83c" }}>{workspace.stateLicenseNumber}</span>
              </>
            )}
          </span>
          <div className="flex flex-wrap gap-2 ml-auto">
            <Badge variant="outline" className="text-xs border-blue-400/30 text-blue-300" data-testid="badge-sim-employee">
              {empData.fullName} — Employee
            </Badge>
            <Badge variant="outline" className="text-xs border-purple-400/30 text-purple-300" data-testid="badge-sim-contractor">
              Contractor — Placeholder
            </Badge>
            <Badge variant="outline" className="text-xs border-green-400/30 text-green-300" data-testid="badge-sim-client">
              Client — Placeholder
            </Badge>
          </div>
        </div>

        {/* ── Search ────────────────────────────────────────── */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search documents by name, type, or tag..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-document-search"
          />
        </div>

        {/* ── Category Tabs ─────────────────────────────────── */}
        <Tabs value={activeCategory} onValueChange={v => setActiveCategory(v as any)}>
          <TabsList className="w-full grid grid-cols-2 sm:grid-cols-4" data-testid="tabs-document-category">
            {(Object.entries(CATEGORY_CONFIG) as [typeof activeCategory, typeof catConfig][]).map(([key, cfg]) => {
              const Icon = cfg.icon;
              return (
                <TabsTrigger
                  key={key}
                  value={key}
                  data-testid={`tab-${key}`}
                  className="flex items-center gap-1.5 text-xs sm:text-sm"
                >
                  <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="hidden sm:inline">{cfg.label}</span>
                  <span className="sm:hidden">{cfg.label.split(" ")[0]}</span>
                  <Badge variant="secondary" className="text-xs ml-auto" data-testid={`badge-count-${key}`}>
                    {cfg.count}
                  </Badge>
                </TabsTrigger>
              );
            })}
          </TabsList>

          {(Object.keys(CATEGORY_CONFIG) as (typeof activeCategory)[]).map(cat => (
            <TabsContent key={cat} value={cat} className="mt-4 space-y-4">
              <div className="flex items-start gap-2">
                <CatIcon className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <p className="text-sm text-muted-foreground">{CATEGORY_CONFIG[cat].description}</p>
              </div>

              {filteredTemplates.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No documents match your search.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {filteredTemplates.map(template => (
                    <DocumentTemplateCard
                      key={template.id}
                      template={template}
                      categoryConfig={CATEGORY_CONFIG[cat]}
                      onPreview={() => setPreviewTemplate(template)}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {/* ── Document Preview Modal ────────────────────────── */}
      {previewTemplate && (
        <DocumentPreviewModal
          template={previewTemplate}
          workspace={workspace}
          empData={empData}
          contractorData={contractorData}
          clientData={clientData}
          onClose={() => setPreviewTemplate(null)}
        />
      )}
    </CanvasHubPage>
  );
}

// ─── DOCUMENT TEMPLATE CARD ────────────────────────────────────────────────────

function DocumentTemplateCard({
  template,
  categoryConfig,
  onPreview,
}: {
  template: DocumentTemplate;
  categoryConfig: typeof CATEGORY_CONFIG[keyof typeof CATEGORY_CONFIG];
  onPreview: () => void;
}) {
  return (
    <Card
      className="flex flex-col hover-elevate cursor-pointer"
      onClick={onPreview}
      data-testid={`card-template-${template.id}`}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex items-start gap-2 min-w-0">
            <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
            <CardTitle className="text-sm leading-snug">{template.title}</CardTitle>
          </div>
          {template.requiresSignature && (
            <FileSignature className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col flex-1 gap-3">
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
          {template.description}
        </p>

        <div className="flex flex-wrap gap-1.5">
          {template.requiresSignature && (
            <Badge variant="outline" className="text-xs">
              <FileSignature className="w-3 h-3 mr-1" />
              {template.signatureCount} signature{template.signatureCount !== 1 ? "s" : ""}
            </Badge>
          )}
          <Badge variant="secondary" className="text-xs">
            <Clock className="w-3 h-3 mr-1" />
            ~{template.estimatedMinutes} min
          </Badge>
        </div>

        <div className="mt-auto pt-2 border-t">
          <p className="text-xs text-muted-foreground truncate" data-testid={`text-sim-${template.id}`}>
            {template.simulationLabel}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── DOCUMENT PREVIEW MODAL ────────────────────────────────────────────────────

function DocumentPreviewModal({
  template,
  workspace,
  empData,
  contractorData,
  clientData,
  onClose,
}: {
  template: DocumentTemplate;
  workspace?: { name: string; companyName: string | null; stateLicenseNumber: string | null } | null;
  empData: EmployeeData;
  contractorData: ContractorData;
  clientData: ClientData;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [showSendModal, setShowSendModal] = useState(false);
  const [selectedRecipientId, setSelectedRecipientId] = useState<string>("");

  const isClientDoc = template.category === "client";
  const needsRecipient = template.requiresSignature;

  const { data: employees = [] } = useQuery<Array<{ id: string; firstName: string; lastName: string; email: string | null; position: string | null }>>({
    queryKey: ["/api/employees"],
    enabled: needsRecipient && !isClientDoc,
  });

  const { data: clients = [] } = useQuery<Array<{ id: string; name: string; contactEmail: string | null; contactName: string | null }>>({
    queryKey: ["/api/clients"],
    enabled: needsRecipient && isClientDoc,
  });

  const orgName = workspace?.name || workspace?.companyName || ACME_ORG.name;
  const licenseNumber = workspace?.stateLicenseNumber || ACME_ORG.licenseNumber;

  const getPreviewSigners = (): Array<{ id: string; name: string; title: string; email: string }> => {
    if (!template.requiresSignature) return [];
    if (template.category === "employee" || template.category === "operational") {
      const signers: any[] = [{ id: "employee-sig", name: empData.fullName, title: empData.position, email: empData.email }];
      if (template.signatureCount >= 2) {
        signers.push({ id: "company-sig", name: "Operations Manager", title: `Operations Manager, ${orgName}`, email: "[hr@yourcompany.com]" });
      }
      return signers;
    }
    if (template.category === "contractor") {
      const signers: any[] = [{ id: "contractor-sig", name: contractorData.fullName, title: `${contractorData.position}, ${contractorData.businessName}`, email: contractorData.email }];
      if (template.signatureCount >= 2) {
        signers.push({ id: "company-sig", name: "Operations Manager", title: `Operations Manager, ${orgName}`, email: "[hr@yourcompany.com]" });
      }
      return signers;
    }
    if (template.category === "client") {
      const signers: any[] = [{ id: "client-sig", name: clientData.contact, title: `Facilities Director, ${clientData.clientName}`, email: clientData.email }];
      if (template.signatureCount >= 2) {
        signers.push({ id: "provider-sig", name: "Account Manager", title: `Account Manager, ${orgName}`, email: "[hr@yourcompany.com]" });
      }
      return signers;
    }
    return [];
  };

  const handleSendConfirm = () => {
    if (!selectedRecipientId) return;
    const recipient = isClientDoc
      ? clients.find(c => c.id === selectedRecipientId)
      : employees.find(e => e.id === selectedRecipientId);
    if (!recipient) return;

    const recipientName = isClientDoc
      ? (recipient as any).contactName || (recipient as any).name
      : `${(recipient as any).firstName} ${(recipient as any).lastName}`;
    const recipientEmail = isClientDoc
      ? (recipient as any).contactEmail
      : (recipient as any).email;

    if (!recipientEmail) {
      toast({ title: "No email on file", description: `${recipientName} has no email address in the system.`, variant: "destructive" });
      return;
    }

    toast({
      title: "Signature request queued",
      description: `"${template.title}" will be sent to ${recipientName} (${recipientEmail}) for signature.`,
    });
    setShowSendModal(false);
    onClose();
  };

  const signers = getPreviewSigners();
  const catCfg = CATEGORY_CONFIG[template.category];

  return (
    <>
      <UniversalModal open onOpenChange={(open) => !open && onClose()}>
        <UniversalModalContent size="xl">
          <UniversalModalHeader>
            <UniversalModalTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <FileText className="w-4 h-4 text-muted-foreground" />
                {template.title}
                <Badge variant="secondary" className={catCfg.color}>
                  {catCfg.label}
                </Badge>
                <Badge variant="outline" className="text-xs border-amber-400/50 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30">
                  Sample Preview
                </Badge>
              </div>
            </UniversalModalTitle>
          </UniversalModalHeader>

          <div className="overflow-y-auto max-h-[60vh] p-4 sm:p-6">
            <UniversalDocumentFrame
              orgName={orgName}
              licenseNumber={licenseNumber}
              documentTitle={template.title}
              documentId={`${template.id.toUpperCase().replace(/-/g, "")}-${Date.now().toString(36).toUpperCase().slice(-5)}`}
              documentType={catCfg.label}
              version={1}
              issueDate={TODAY_ISO}
              classification="internal"
              status="draft"
              signers={signers}
              showActions={true}
              onPrint={() => window.print()}
            >
              {template.renderContent()}
            </UniversalDocumentFrame>
          </div>

          <UniversalModalFooter>
            <div className="flex items-center justify-between w-full flex-wrap gap-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {template.requiresSignature ? (
                  <>
                    <FileSignature className="w-3.5 h-3.5" />
                    {template.signatureCount} signature{template.signatureCount !== 1 ? "s" : ""} required
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                    No signature required
                  </>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose} data-testid="button-close-preview">
                  Close
                </Button>
                {template.requiresSignature && (
                  <Button onClick={() => setShowSendModal(true)} data-testid="button-send-for-signature">
                    <Send className="w-3.5 h-3.5 mr-1.5" />
                    Send for Signature
                  </Button>
                )}
              </div>
            </div>
          </UniversalModalFooter>
        </UniversalModalContent>
      </UniversalModal>

      {showSendModal && (
        <UniversalModal open onOpenChange={(open) => !open && setShowSendModal(false)}>
          <UniversalModalContent size="sm">
            <UniversalModalHeader>
              <UniversalModalTitle>Select Recipient</UniversalModalTitle>
            </UniversalModalHeader>
            <div className="p-4 space-y-4">
              <p className="text-sm text-muted-foreground">
                Choose the {isClientDoc ? "client contact" : "employee or contractor"} who will receive
                &ldquo;{template.title}&rdquo; for signature.
              </p>
              <div className="space-y-2">
                <Label htmlFor="recipient-select">
                  {isClientDoc ? "Client" : "Employee"}
                </Label>
                <Select
                  value={selectedRecipientId}
                  onValueChange={setSelectedRecipientId}
                >
                  <SelectTrigger id="recipient-select" data-testid="select-signature-recipient">
                    <SelectValue placeholder={`Select ${isClientDoc ? "client" : "employee"}...`} />
                  </SelectTrigger>
                  <SelectContent>
                    {isClientDoc
                      ? clients.map(c => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}{c.contactName ? ` — ${c.contactName}` : ""}
                          </SelectItem>
                        ))
                      : employees.map(e => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.firstName} {e.lastName}{e.position ? ` — ${e.position}` : ""}
                          </SelectItem>
                        ))
                    }
                    {(isClientDoc ? clients : employees).length === 0 && (
                      <SelectItem value="_none" disabled>No records found</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <UniversalModalFooter>
              <div className="flex gap-2 justify-end w-full">
                <Button variant="outline" onClick={() => setShowSendModal(false)} data-testid="button-cancel-send">
                  Cancel
                </Button>
                <Button
                  onClick={handleSendConfirm}
                  disabled={!selectedRecipientId || selectedRecipientId === "_none"}
                  data-testid="button-confirm-send-signature"
                >
                  <Send className="w-3.5 h-3.5 mr-1.5" />
                  Send
                </Button>
              </div>
            </UniversalModalFooter>
          </UniversalModalContent>
        </UniversalModal>
      )}
    </>
  );
}
