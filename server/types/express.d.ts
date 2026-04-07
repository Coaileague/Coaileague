import type { User } from '@shared/schema/auth';

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export {};
