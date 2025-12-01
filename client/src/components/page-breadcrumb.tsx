import { ChevronRight, Home } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";

const routeLabels: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/schedule": "Schedule",
  "/time-tracking": "Time Tracking",
  "/employees": "Employees",
  "/clients": "Clients",
  "/invoices": "Invoices",
  "/reports": "Reports",
  "/analytics": "Analytics",
  "/settings": "Settings",
  "/billing": "Billing",
  "/expenses": "Expenses",
  "/payroll": "Payroll",
  "/my-paychecks": "My Paychecks",
  "/communications": "Chatrooms",
  "/chatrooms": "Chatrooms",
  "/diagnostics": "Diagnostics",
  "/training": "Training",
  "/budgeting": "Budgeting",
  "/records": "Records",
  "/insights": "Insights",
  "/chat": "Help Desk",
  "/admin-command-center": "Admin Command Center",
  "/platform-admin": "Platform Admin",
  "/leaders-hub": "Leaders Hub",
  "/disputes": "Disputes",
  "/policies": "Policies",
  "/i9-compliance": "I-9 Compliance",
  "/role-management": "Role Management",
  "/manager-dashboard": "Manager Dashboard",
  "/org-support": "Support Tickets",
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
