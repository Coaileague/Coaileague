import { Route, Redirect } from "wouter";
import { createElement } from "react";

const LEGACY_REDIRECTS: Record<string, string> = {
  "/chat": "/chatrooms",
  "/chatroom": "/chatrooms",
  "/comm-os": "/communications",
  "/communications": "/chatrooms",
  "/helpdesk5": "/helpdesk",
  "/live-chat": "/helpdesk",
  "/mobile-chat": "/chatrooms",
  "/support/chat": "/helpdesk",
  "/support/tickets": "/my-tickets",

  "/daily-schedule": "/schedule",
  "/schedule/swaps": "/schedule",
  "/universal-schedule": "/schedule",
  "/worker/schedule": "/schedule",

  "/admin/end-user-controls": "/org-management",
  "/platform/users": "/org-management",

  "/support/console": "/support/ai-console",
  "/trinity/command-center": "/support/ai-console",
  "/helpai-orchestration": "/support/ai-console",

  "/platform-admin": "/root-admin-dashboard",
  "/root-admin-portal": "/root-admin-dashboard",
  "/platform/admin": "/root-admin-dashboard",
  "/admin/command": "/root-admin-dashboard",
  "/admin-command-center": "/dashboard",

  "/os-family/communication": "/category/communication",
  "/os-family/operations": "/category/operations",
  "/os-family/growth": "/category/growth",
  "/os-family/platform": "/category/platform",

  "/budget-os": "/budgeting",
  "/query-os": "/diagnostics",
  "/record-os": "/records",
  "/insight-os": "/insights",

  "/documents": "/document-library",
  "/help-center": "/help",
  "/mail": "/inbox",
  "/mobile-dashboard": "/mobile-hub",
  "/pending": "/timesheets/pending",

  "/reports/daily": "/field-reports?type=daily",
  "/reports/incidents": "/field-reports?type=incident",
  "/reports/safety": "/field-reports?type=safety",

  "/login": "/dashboard",
  "/register": "/dashboard",

  "/coverage-marketplace": "/shift-marketplace",
};

export function LegacyRedirectRoutes() {
  return Object.entries(LEGACY_REDIRECTS).map(([from, to]) =>
    createElement(Route, { path: from, key: from },
      createElement(Redirect, { to })
    )
  );
}

export function HelpdeskRoomRedirect() {
  return null;
}
