import { useEffect } from "react";
import { useLocation } from "wouter";

const PLATFORM_NAME = (import.meta.env.VITE_PLATFORM_NAME as string) || "CoAIleague";

const PAGE_TITLE_MAP: Record<string, string> = {
  "/": `Dashboard — ${PLATFORM_NAME}`,
  "/dashboard": `Dashboard — ${PLATFORM_NAME}`,

  "/employees": `Officers — ${PLATFORM_NAME}`,
  "/employees/new": `Add Officer — ${PLATFORM_NAME}`,

  "/scheduling": `Scheduling — ${PLATFORM_NAME}`,
  "/shifts": `Shifts — ${PLATFORM_NAME}`,
  "/time-tracking": `Time Tracking — ${PLATFORM_NAME}`,

  "/payroll": `Payroll — ${PLATFORM_NAME}`,
  "/invoices": `Invoices — ${PLATFORM_NAME}`,
  "/clients": `Clients — ${PLATFORM_NAME}`,
  "/billing": `Billing — ${PLATFORM_NAME}`,

  "/compliance": `Compliance — ${PLATFORM_NAME}`,
  "/security-compliance": `Security Compliance — ${PLATFORM_NAME}`,
  "/security-compliance/approvals": `Document Approvals — ${PLATFORM_NAME}`,
  "/security-compliance/expiration-alerts": `Expiration Alerts — ${PLATFORM_NAME}`,
  "/security-compliance/regulator-access": `Regulator Access — ${PLATFORM_NAME}`,
  "/security-compliance/audit-readiness": `Audit Readiness — ${PLATFORM_NAME}`,
  "/security-compliance/auditor-portal": `Auditor Portal — ${PLATFORM_NAME}`,
  "/security-compliance/my-packet": `My Compliance Packet — ${PLATFORM_NAME}`,
  "/compliance/regulatory-enrollment": `Regulatory Enrollment — ${PLATFORM_NAME}`,
  "/compliance-matrix": `Compliance Matrix — ${PLATFORM_NAME}`,
  "/compliance-reports": `Compliance Reports — ${PLATFORM_NAME}`,
  "/compliance-evidence": `Compliance Evidence — ${PLATFORM_NAME}`,
  "/i9-compliance": `I-9 Compliance — ${PLATFORM_NAME}`,
  "/training-compliance": `Training Compliance — ${PLATFORM_NAME}`,
  "/enforcement-status": `Enforcement Status — ${PLATFORM_NAME}`,

  "/documents": `Documents — ${PLATFORM_NAME}`,
  "/incidents": `Incidents — ${PLATFORM_NAME}`,

  "/analytics": `Analytics — ${PLATFORM_NAME}`,
  "/reports": `Reports — ${PLATFORM_NAME}`,

  "/settings": `Settings — ${PLATFORM_NAME}`,
  "/inbox": `Inbox — ${PLATFORM_NAME}`,
  "/notifications": `Notifications — ${PLATFORM_NAME}`,
  "/support": `Support — ${PLATFORM_NAME}`,
  "/helpdesk": `Help Desk — ${PLATFORM_NAME}`,
  "/chat": `Messages — ${PLATFORM_NAME}`,

  "/trinity": `Trinity AI — ${PLATFORM_NAME}`,
  "/trinity-chat": `Trinity Chat — ${PLATFORM_NAME}`,
  "/trinity-memory": `Trinity Memory — ${PLATFORM_NAME}`,
  "/trinity-insights": `Trinity Insights — ${PLATFORM_NAME}`,

  "/workboard": `Workboard — ${PLATFORM_NAME}`,
  "/workspace": `Workspace — ${PLATFORM_NAME}`,
  "/onboarding": `Onboarding — ${PLATFORM_NAME}`,
  "/proposals": `Proposals — ${PLATFORM_NAME}`,
  "/leads": `Leads — ${PLATFORM_NAME}`,
  "/gate-duty": `Gate Duty — ${PLATFORM_NAME}`,
  "/visitor-log": `Visitor Log — ${PLATFORM_NAME}`,

  "/sra-portal": `SRA Portal — ${PLATFORM_NAME}`,
  "/data-subject-requests": `Privacy Requests — ${PLATFORM_NAME}`,
  "/privacy": `Privacy Policy — ${PLATFORM_NAME}`,
  "/terms": `Terms of Service — ${PLATFORM_NAME}`,
  "/cookies": `Cookie Policy — ${PLATFORM_NAME}`,
  "/dpa": `Data Processing Agreement — ${PLATFORM_NAME}`,

  "/login": `Sign In — ${PLATFORM_NAME}`,
  "/register": `Create Account — ${PLATFORM_NAME}`,
  "/forgot-password": `Reset Password — ${PLATFORM_NAME}`,
  "/profile": `My Profile — ${PLATFORM_NAME}`,

  "/equipment": `Equipment & Assets — ${PLATFORM_NAME}`,
  "/mileage": `Mileage Log — ${PLATFORM_NAME}`,
  "/field-reports": `Field Reports — ${PLATFORM_NAME}`,
  "/interviews": `Interviews — ${PLATFORM_NAME}`,
  "/hiring": `Hiring — ${PLATFORM_NAME}`,
  "/payouts": `Payouts — ${PLATFORM_NAME}`,
  "/disputes": `Disputes — ${PLATFORM_NAME}`,
  "/rms-hub": `RMS Hub — ${PLATFORM_NAME}`,
  "/platform-admin": `Platform Admin — ${PLATFORM_NAME}`,
};

function getPageTitle(path: string): string {
  if (PAGE_TITLE_MAP[path]) return PAGE_TITLE_MAP[path];
  const segments = path.split("/").filter(Boolean);
  if (segments.length === 0) return `${PLATFORM_NAME} — Workforce Intelligence`;
  const first = segments[0];
  const titleCased = first
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return `${titleCased} — ${PLATFORM_NAME}`;
}

export function usePageTitle(customTitle?: string) {
  const [location] = useLocation();

  useEffect(() => {
    const title = customTitle || getPageTitle(location);
    document.title = title;
  }, [location, customTitle]);
}
