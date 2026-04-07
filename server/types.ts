// Type extensions for Express and Session
import "express-session";
import type { User } from "@shared/schema";

declare module "express-session" {
  interface SessionData {
    userId: string;
    workspaceId?: string;
    workspaceRole?: string;
    employeeId?: string;
    workspaceName?: string;
    csrfToken?: string;
    csrfTokenCreatedAt?: number;
    passport?: {
      user: {
        claims: {
          sub: string;
          email: string;
          first_name: string;
          last_name: string;
        };
        expires_at?: number;
        refresh_token?: string;
      };
    };
  }
}

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export {};
