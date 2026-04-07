import { ChevronRight, Home } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";

const routeLabels: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/schedule": "My Schedule",
  "/schedule/team": "Team Schedule",
  "/shift-marketplace": "Shift Marketplace",
  "/time-tracking": "Time Tracking",
  "/employees": "Employees",
  "/employee/profile": "My Profile",
  "/employee/portal": "Employee Portal",
  "/employee-recognition": "Recognition",
  "/clients": "Clients",
  "/client/portal": "Client Portal",
  "/invoices": "Invoices",
  "/reports": "Reports",
  "/analytics": "Analytics",
  "/analytics/reports": "Analytics Reports",
  "/bi-analytics": "Business Intelligence",
  "/settings": "Settings",
  "/billing": "Billing",
  "/expenses": "Expenses",
  "/expense-approvals": "Expense Approvals",
  "/payroll": "Payroll",
  "/payroll/deductions": "Deductions",
  "/payroll/garnishments": "Garnishments",
  "/my-paychecks": "My Paychecks",
  "/chatrooms": "Help Desk",
  "/messages": "Private Messages",
  "/diagnostics": "Diagnostics",
  "/training": "Training",
  "/budgeting": "Budgeting",
  "/records": "Records",
  "/insights": "Insights",
  "/chat": "Help Desk",
  "/admin": "Admin",
  "/admin/banners": "Banners",
  "/admin/permission-matrix": "Permission Matrix",
  "/admin/custom-forms": "Custom Forms",
  "/admin/usage": "Usage",
  "/admin/ticket-reviews": "Ticket Reviews",
  "/admin/breach-response": "Breach Response SOP",
  "/root-admin-dashboard": "Platform Admin",
  "/canonical-config": "Canonical Config Values",
  "/admin/support-console": "Support Console",
  "/leaders-hub": "Leaders Hub",
  "/disputes": "Disputes",
  "/review-disputes": "Review Disputes",
  "/file-grievance": "File Grievance",
  "/policies": "Policies",
  "/i9-compliance": "I-9 Compliance",
  "/role-management": "Role Management",
  "/workspace/permissions": "Permission Matrix",
  "/manager-dashboard": "Manager Dashboard",
  "/automation": "Automation",
  "/automation/settings": "Automation Settings",
  "/automation-control": "Automation Control",
  "/automation/audit-log": "Automation Audit Log",
  "/ai": "AI",
  "/ai/brain": "Trinity",
  "/ai/command-center": "AI Command Center",
  "/ai/audit-log-viewer": "AI Audit Log",
  "/ai/orchestration": "Orchestration",
  "/ai/workboard": "Workboard",
  "/ai-integrations": "AI Integrations",
  "/alert-configuration": "Alert Configuration",
  "/alert-settings": "Alert Settings",
  "/audit-logs": "Audit Logs",
  "/availability": "Availability",
  "/unavailability": "Unavailability",
  "/hr": "HR",
  "/hr/benefits": "Benefits",
  "/hr/pto": "PTO",
  "/hr/reviews": "Reviews",
  "/hr/terminations": "Terminations",
  "/timesheets": "Timesheets",
  "/timesheets/approvals": "Timesheet Approvals",
  "/timesheets/pending": "Pending Time Entries",
  "/workflow-approvals": "Workflow Approvals",
  "/org-management": "Organization Management",
  "/support": "Support",
  "/support/queue": "Support Queue",
  "/support/chatrooms": "Support Chat",
  "/support/bugs": "Bug Reports",
  "/support/ai-console": "AI Console",
  "/support/assisted-onboarding": "Assisted Onboarding",
  "/help": "Help",
  "/profile": "Profile",
  "/inbox": "Email",
  "/category": "Category",
  "/category/communication": "Communication",
  "/category/operations": "Operations",
  "/category/growth": "Growth",
  "/category/platform": "Platform",
  "/engagement": "Engagement",
  "/engagement/dashboard": "Engagement Dashboard",
  "/engagement/employee": "Employee Engagement",
  "/enterprise": "Enterprise",
  "/enterprise/branding": "White Label",
  "/enterprise/fleet": "Fleet Management",
  "/enterprise/armory": "Armory",
  "/enterprise/sso": "SSO",
  "/enterprise/account-manager": "Account Manager",
  "/enterprise/background-checks": "Background Checks",
  "/enterprise/api-access": "API Access",
  "/security-compliance": "Security Compliance",
  "/compliance-reports": "Compliance Reports",
  "/document-library": "Document Library",
  "/field-reports": "Field Reports",
  "/my-team": "My Team",
  "/my-tickets": "My Tickets",
  "/my-audit-record": "My Audit Record",
  "/owner-analytics": "Owner Analytics",
  "/ai-usage": "AI Usage Dashboard",
  "/usage": "Usage",
  "/workspace": "Workspace",
  "/workspace-onboarding": "Workspace Onboarding",
  "/resolution-inbox": "Resolution Inbox",
  "/financial-intelligence": "Financial Intelligence",
  "/oversight": "Oversight Hub",
  "/integrations": "Integrations",
  "/trinity": "Trinity Chat",
  "/trinity-memory": "Trinity Memory",
  "/hris-management": "HRIS Management",
  "/labor-law-config": "Labor Law Config",
  "/behavior-scoring": "Behavior Scoring",
  "/flex-staffing": "Flex Staffing",
  "/outreach": "Outreach",
  "/sales": "Sales",
  "/sales-crm": "Sales CRM",
  "/inbound-opportunities": "Inbound Opportunities",
  "/worker": "Worker Dashboard",
  "/worker/incidents": "Incidents",
  "/command-center": "Command Center",
  "/commands": "Commands",
  "/quickbooks-import": "QuickBooks Import",
  "/accounting-integrations": "Accounting",
  "/company-reports": "Company Reports",
  "/approvals": "Approvals Hub",
  "/updates": "Updates",
  "/owner": "Owner",
  "/owner/hireos": "Hiring",
  "/owner/hireos/workflow-builder": "Workflow Builder",
  "/platform": "Platform",
  "/platform/sales": "Platform Sales",
  "/email-intelligence": "Email Intelligence",
  "/forms": "Forms",
  "/pto": "PTO",
  "/mobile-hub": "Mobile Hub",
  "/universal-inbox": "Notifications",
  "/notifications": "Notifications",
  "/broadcasts": "Broadcasts",
  "/mileage": "Mileage",
  "/finance-hub": "Finance Hub",
  "/document-vault": "Document Vault",
  "/document-templates": "Document Templates",
  "/document-form": "Fill Out Form",
  "/equipment": "Equipment",
  "/guard-tour": "Guard Tour",
  "/bridge-channels": "Bridge Channels",
  "/rms": "RMS Hub",
  "/cad": "CAD Console",
  "/safety": "Safety Hub",
  "/safety-check": "Safety Check",
  "/ethics": "Ethics Hotline",
  "/rfp": "RFP Manager",
  "/rfp-pipeline": "RFP Pipeline",
  "/incident-pipeline": "Incident Pipeline",
  "/employee-packets": "Employee Packets",
  "/employee-onboarding": "Employee Onboarding",
  "/ai-brain-dashboard": "AI Brain Dashboard",
  "/trinity-insights": "Trinity Insights",
  "/org-hub": "Org Hub",
};

const parentRoutes: Record<string, string> = {
  "/schedule/team": "/schedule",
  "/analytics/reports": "/analytics",
  "/payroll/deductions": "/payroll",
  "/payroll/garnishments": "/payroll",
  "/admin/banners": "/admin",
  "/admin/permission-matrix": "/admin",
  "/admin/custom-forms": "/admin",
  "/admin/usage": "/admin",
  "/admin/ticket-reviews": "/admin",
  "/admin/breach-response": "/admin",
  "/automation/settings": "/automation",
  "/automation/audit-log": "/automation",
  "/ai/brain": "/ai",
  "/ai/command-center": "/ai",
  "/ai/audit-log-viewer": "/ai",
  "/ai/orchestration": "/ai",
  "/ai/workboard": "/ai",
  "/hr/benefits": "/hr",
  "/hr/pto": "/hr",
  "/hr/reviews": "/hr",
  "/hr/terminations": "/hr",
  "/timesheets/approvals": "/timesheets",
  "/timesheets/pending": "/timesheets",
  "/support/queue": "/support",
  "/support/chatrooms": "/support",
  "/support/bugs": "/support",
  "/support/ai-console": "/support",
  "/support/assisted-onboarding": "/support",
  "/category/communication": "/category",
  "/category/operations": "/category",
  "/category/growth": "/category",
  "/category/platform": "/category",
  "/engagement/dashboard": "/engagement",
  "/engagement/employee": "/engagement",
  "/enterprise/branding": "/enterprise",
  "/enterprise/fleet": "/enterprise",
  "/enterprise/armory": "/enterprise",
  "/enterprise/sso": "/enterprise",
  "/enterprise/account-manager": "/enterprise",
  "/enterprise/background-checks": "/enterprise",
  "/enterprise/api-access": "/enterprise",
  "/worker/incidents": "/worker",
  "/owner/hireos": "/owner",
  "/owner/hireos/workflow-builder": "/owner/hireos",
  "/platform/sales": "/platform",
};

function isUUID(segment: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)
    || /^\d+$/.test(segment)
    || segment.length > 20;
}

function formatSegment(segment: string): string {
  return segment
    .replace(/-/g, " ")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());
}

export function PageBreadcrumb() {
  const [location] = useLocation();
  
  if (location === "/" || location === "/dashboard" || location === "/schedule") {
    return null;
  }
  
  const breadcrumbs: { path: string; label: string; isLink: boolean }[] = [
    { path: "/dashboard", label: "Home", isLink: true },
  ];

  const fullPath = location.split("?")[0];
  
  if (routeLabels[fullPath]) {
    const parent = parentRoutes[fullPath];
    if (parent && routeLabels[parent]) {
      breadcrumbs.push({ path: parent, label: routeLabels[parent], isLink: true });
    }
    breadcrumbs.push({ path: fullPath, label: routeLabels[fullPath], isLink: false });
  } else {
    const pathSegments = fullPath.split("/").filter(Boolean);
    let currentPath = "";
    
    pathSegments.forEach((segment, index) => {
      currentPath += `/${segment}`;
      const isLast = index === pathSegments.length - 1;
      
      if (isUUID(segment)) {
        return;
      }
      
      const label = routeLabels[currentPath] || formatSegment(segment);
      const hasValidRoute = routeLabels[currentPath] !== undefined;
      
      breadcrumbs.push({ 
        path: currentPath, 
        label, 
        isLink: !isLast && hasValidRoute,
      });
    });
  }
  
  if (breadcrumbs.length <= 1) return null;
  
  return (
    <nav 
      className="flex items-center gap-1 px-4 py-2 border-b bg-card/50 overflow-x-auto"
      aria-label="Breadcrumb navigation"
      data-testid="breadcrumb-nav"
    >
      <Button
        variant="ghost"
        size="sm"
        asChild
        data-testid="breadcrumb-home"
      >
        <Link href="/dashboard">
          <Home className="h-4 w-4" />
          <span className="hidden sm:inline ml-1">Home</span>
        </Link>
      </Button>
      
      {breadcrumbs.slice(1).map((crumb, index) => (
        <div key={crumb.path} className="flex items-center gap-1 shrink-0">
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          {crumb.isLink ? (
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="text-sm"
              data-testid={`breadcrumb-${crumb.label.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <Link href={crumb.path}>{crumb.label}</Link>
            </Button>
          ) : (
            <span 
              className="text-sm font-medium px-2 py-1 truncate max-w-[200px]" 
              data-testid={`breadcrumb-current-${crumb.label.toLowerCase().replace(/\s+/g, "-")}`}
            >
              {crumb.label}
            </span>
          )}
        </div>
      ))}
    </nav>
  );
}
