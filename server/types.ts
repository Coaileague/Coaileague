// Session extensions for express-session.
// Request/user augmentation lives in server/types/express.d.ts so the
// entire backend shares one canonical Express contract.
import "express-session";

type SessionClaims = {
  sub: string;
  email: string;
  first_name: string;
  last_name: string;
};

declare module "express-session" {
  interface SessionData {
    userId: string;
    workspaceId?: string;
    currentWorkspaceId?: string;
    activeWorkspaceId?: string;
    workspaceRole?: string;
    role?: string;
    employeeId?: string;
    auditorId?: string;
    workspaceName?: string;
    preferredLanguage?: string;
    hrisOAuthState?: string;
    csrfToken?: string;
    csrfTokenCreatedAt?: number;
    passport?: {
      user: {
        claims: SessionClaims;
        expires_at?: number;
        refresh_token?: string;
      };
    };
  }
}

export {};
