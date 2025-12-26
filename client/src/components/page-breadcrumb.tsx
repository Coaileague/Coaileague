import { ChevronRight, Home } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";

const routeLabels: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/schedule": "Schedule",
  "/time-tracking": "Time Tracking",
  "/employees": "Employees",
  "/employee-profile": "My Profile",
  "/employee-portal": "Employee Portal",
  "/employee-recognition": "Recognition",
  "/employee-file-cabinet": "File Cabinet",
  "/clients": "Clients",
  "/client-portal": "Client Portal",
  "/invoices": "Invoices",
  "/reports": "Reports",
  "/analytics": "Analytics",
  "/analytics-reports": "Analytics Reports",
  "/settings": "Settings",
  "/billing": "Billing",
  "/expenses": "Expenses",
  "/expense-approvals": "Expense Approvals",
  "/payroll": "Payroll",
  "/payroll-dashboard": "Payroll Dashboard",
  "/payroll-deductions": "Deductions",
  "/payroll-garnishments": "Garnishments",
  "/my-paychecks": "My Paychecks",
  "/communications": "Chatrooms",
  "/chatrooms": "Chatrooms",
  "/private-messages": "Private Messages",
  "/diagnostics": "Diagnostics",
  "/training": "Training",
  "/training-os": "Training OS",
  "/budgeting": "Budgeting",
  "/records": "Records",
  "/insights": "Insights",
  "/chat": "Help Desk",
  "/admin-command-center": "Admin Command Center",
  "/admin-banners": "Banners",
  "/admin-custom-forms": "Custom Forms",
  "/admin-usage": "Usage",
  "/platform-admin": "Platform Admin",
  "/platform-users": "Platform Users",
  "/leaders-hub": "Leaders Hub",
  "/disputes": "Disputes",
  "/review-disputes": "Review Disputes",
  "/file-grievance": "File Grievance",
  "/policies": "Policies",
  "/i9-compliance": "I-9 Compliance",
  "/role-management": "Role Management",
  "/manager-dashboard": "Manager Dashboard",
  "/org-support": "Support Tickets",
  "/automation-settings": "Automation Settings",
  "/automation-control": "Automation Control",
  "/automation-audit-log": "Automation Audit Log",
  "/ai-brain-dashboard": "Trinity™",
  "/ai-command-center": "AI Command Center",
  "/ai-audit-log-viewer": "AI Audit Log",
  "/ai-integrations": "AI Integrations",
  "/alert-configuration": "Alert Configuration",
  "/alert-settings": "Alert Settings",
  "/audit-logs": "Audit Logs",
  "/availability": "Availability",
  "/unavailability": "Unavailability",
  "/hr-benefits": "Benefits",
  "/hr-pto": "PTO",
  "/hr-reviews": "Reviews",
  "/hr-terminations": "Terminations",
  "/timesheet-approvals": "Timesheet Approvals",
  "/pending-time-entries": "Pending Time Entries",
  "/workflow-approvals": "Workflow Approvals",
  "/org-management": "Organization Management",
  "/support": "Support",
  "/help": "Help",
  "/profile": "Profile",
  "/inbox": "Inbox",
  "/category/communication": "Communication",
  "/category/operations": "Operations",
  "/category/growth": "Growth",
  "/category/platform": "Platform",
};

export function PageBreadcrumb() {
  const [location] = useLocation();
  
  const pathSegments = location.split("/").filter(Boolean);
  
  if (location === "/" || location === "/dashboard") {
    return null;
  }
  
  const breadcrumbs = [{ path: "/", label: "Home" }];
  
  let currentPath = "";
  pathSegments.forEach((segment) => {
    currentPath += `/${segment}`;
    const label = routeLabels[currentPath] || segment.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
    breadcrumbs.push({ path: currentPath, label });
  });
  
  return (
    <div className="flex items-center gap-2 px-4 py-3 border-b bg-card/50 backdrop-blur-sm">
      <Button
        variant="ghost"
        size="sm"
        asChild
        className="gap-2 h-8"
        data-testid="breadcrumb-home"
      >
        <Link href="/">
          <Home className="h-4 w-4" />
          <span className="hidden sm:inline">Home</span>
        </Link>
      </Button>
      
      {breadcrumbs.slice(1).map((crumb, index) => (
        <div key={crumb.path} className="flex items-center gap-2">
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          {index === breadcrumbs.length - 2 ? (
            <span className="text-sm font-medium" data-testid={`breadcrumb-current-${crumb.label.toLowerCase().replace(/\s+/g, "-")}`}>
              {crumb.label}
            </span>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="h-8 text-sm"
              data-testid={`breadcrumb-${crumb.label.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <Link href={crumb.path}>{crumb.label}</Link>
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
