import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { monitoringService } from '../monitoring';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incomingId = req.headers['x-request-id'];
  const requestId = (typeof incomingId === 'string' && incomingId.length > 0)
    ? incomingId
    : crypto.randomUUID();

  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);

  // Request telemetry tracking
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    monitoringService.logMetric({
      timestamp: new Date(),
      requestId,
      endpoint: req.originalUrl || req.url,
      method: req.method,
      duration,
      statusCode: res.statusCode,
      actorId: (req as any).user?.id || (req as any).session?.userId,
      workspaceId: (req as any).workspaceId || (req as any).session?.workspaceId,
    });
  });

  next();
}
