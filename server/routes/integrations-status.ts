/**
 * Integration Status & Connection Management Routes
 * ==================================================
 * Provides status and connection management for all third-party integrations:
 * - QuickBooks
 * - Gusto
 * - Stripe
 * - Resend
 * - Twilio
 */

import express, { Router, Request, Response } from 'express';
import { createLogger } from '../lib/logger';
const log = createLogger('integrations-status');

