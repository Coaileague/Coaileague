import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';

/**
 * Rate Limiting Middleware for API Protection
 * 
 * Implements rate limiting to protect against:
 * - API abuse and DDoS attacks
 * - Brute force authentication attempts
 * - Resource exhaustion
 * 
 * Note: Current implementation is IP-based only. For full SOC2 compliance,
 * per-workspace/user rate limiting should be added (requires Redis or similar).
 */

// General API rate limiter - applies to all API routes
// Higher threshold to accommodate shared NAT/proxy environments
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per 15 minutes
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too many requests',
      message: 'You have exceeded the rate limit. Please try again later.',
      retryAfter: '15 minutes'
    });
  }
});

// Stricter rate limiter for authentication endpoints
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login attempts per windowMs
  message: {
    error: 'Too many authentication attempts from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  skipSuccessfulRequests: true, // Don't count successful requests
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too many authentication attempts',
      message: 'Your account has been temporarily locked due to too many failed login attempts. Please try again in 15 minutes.',
      retryAfter: '15 minutes'
    });
  }
});

// Moderate rate limiter for mutation operations (create/update/delete)
export const mutationLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // Limit each IP to 30 mutations per minute
  message: {
    error: 'Too many operations from this IP, please slow down.',
    retryAfter: '1 minute'
  },
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Rate limit exceeded',
      message: 'You are performing operations too quickly. Please wait a moment and try again.',
      retryAfter: '1 minute'
    });
  }
});

// Lenient rate limiter for read operations
export const readLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // Limit each IP to 60 read requests per minute
  message: {
    error: 'Too many requests from this IP, please slow down.',
    retryAfter: '1 minute'
  }
});
