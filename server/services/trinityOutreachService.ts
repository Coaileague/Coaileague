import { db } from "../db";
import crypto from 'crypto';
import { orgInvitations, activities } from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { getAppBaseUrl } from '../utils/getAppBaseUrl';
import { validateWebhookUrl } from './webhookDeliveryService';
import { PLATFORM_WORKSPACE_ID } from './billing/billingConstants';

type PipelineStage = 'prospected' | 'contacted' | 'responded' | 'demo' | 'subscribed';

interface CrawlResult {
  companyName: string;
  website: string;
  emails: string[];
  contactName?: string;
  phone?: string;
  location?: string;
  services?: string[];
  robotsAllowed: boolean;
  crawledAt: Date;
}

interface OutreachCandidate {
  companyName: string;
  email: string;
  contactName?: string;
  website: string;
  location?: string;
  services?: string[];
  stage: PipelineStage;
}

interface PipelineSummary {
  total: number;
  prospected: number;
  contacted: number;
  responded: number;
  demo: number;
  subscribed: number;
  conversionRate: number;
}

interface OutreachResult {
  success: boolean;
  candidatesFound: number;
  emailsSent: number;
  errors: string[];
  executionId: string;
}

export class TrinityOutreachService {
  private executionId: string;

  constructor() {
    this.executionId = `outreach-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`;
  }

  async checkRobotsTxt(domain: string): Promise<{ allowed: boolean; crawlDelay?: number }> {
    try {
      const url = `https://${domain}/robots.txt`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'CoAIleagueBot/1.0 (+https://coaileague.com/bot)' },
      });
      clearTimeout(timeout);

      if (!response.ok) {
        return { allowed: true };
      }

      const text = await response.text();
      const lines = text.split('\n');
      let isRelevantAgent = false;
      let disallowAll = false;
      let crawlDelay: number | undefined;

      for (const line of lines) {
        const trimmed = line.trim().toLowerCase();
        if (trimmed.startsWith('user-agent:')) {
          const agent = trimmed.replace('user-agent:', '').trim();
          isRelevantAgent = agent === '*' || agent === 'coaileaguebot';
        }
        if (isRelevantAgent && trimmed.startsWith('disallow:')) {
          const path = trimmed.replace('disallow:', '').trim();
          if (path === '/') disallowAll = true;
        }
        if (isRelevantAgent && trimmed.startsWith('crawl-delay:')) {
          crawlDelay = parseInt(trimmed.replace('crawl-delay:', '').trim(), 10);
        }
      }

      return { allowed: !disallowAll, crawlDelay };
    } catch {
      return { allowed: true };
    }
  }

  private isUrlSafe(url: string): boolean {
    try {
      const normalized = url.startsWith('http') ? url : `https://${url}`;
      const parsed = new URL(normalized);

      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;

      const hostname = parsed.hostname.toLowerCase();
      if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') return false;
      if (hostname.startsWith('10.') || hostname.startsWith('192.168.') || hostname.startsWith('172.')) return false;
      if (hostname.endsWith('.local') || hostname.endsWith('.internal')) return false;
      if (hostname === '[::1]' || hostname.startsWith('169.254.')) return false;

      if (!hostname.includes('.') || hostname.endsWith('.')) return false;

      return true;
    } catch {
      return false;
    }
  }

  async crawlSecurityCompanyWebsite(url: string): Promise<CrawlResult> {
    const domain = url.replace(/^https?:\/\//, '').replace(/\/.*$/, '');

    // DNS-resolved SSRF guard: replace string-match isUrlSafe with full resolution check
    try {
      await validateWebhookUrl(url.startsWith('http') ? url : `https://${url}`);
    } catch {
      return { companyName: domain, website: url, emails: [], robotsAllowed: false, crawledAt: new Date() };
    }

    const robotsCheck = await this.checkRobotsTxt(domain);

    if (!robotsCheck.allowed) {
      return {
        companyName: domain,
        website: url,
        emails: [],
        robotsAllowed: false,
        crawledAt: new Date(),
      };
    }

    if (robotsCheck.crawlDelay) {
      await new Promise(resolve => setTimeout(resolve, robotsCheck.crawlDelay! * 1000));
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url.startsWith('http') ? url : `https://${url}`, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'CoAIleagueBot/1.0 (+https://coaileague.com/bot)',
          'Accept': 'text/html',
        },
      });
      clearTimeout(timeout);

      if (!response.ok) {
        return { companyName: domain, website: url, emails: [], robotsAllowed: true, crawledAt: new Date() };
      }

      const html = await response.text();

      const emails = this.extractEmails(html);
      const companyName = this.extractCompanyName(html, domain);
      const phone = this.extractPhone(html);
      const services = this.extractSecurityServices(html);
      const contactName = this.extractContactName(html);
      const location = this.extractLocation(html);

      return {
        companyName,
        website: url,
        emails: [...new Set(emails)],
        contactName,
        phone,
        location,
        services,
        robotsAllowed: true,
        crawledAt: new Date(),
      };
    } catch {
      return { companyName: domain, website: url, emails: [], robotsAllowed: true, crawledAt: new Date() };
    }
  }

  private extractEmails(html: string): string[] {
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const matches = html.match(emailRegex) || [];
    const filtered = matches.filter(email => {
      const lower = email.toLowerCase();
      if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.gif') || lower.endsWith('.svg')) return false;
      if (lower.includes('example.com') || lower.includes('test.com') || lower.includes('sentry.io')) return false;
      if (lower.startsWith('noreply@') || lower.startsWith('no-reply@')) return false;
      return true;
    });
    return filtered.slice(0, 10);
  }

  private extractCompanyName(html: string, fallbackDomain: string): string {
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      const title = titleMatch[1].trim();
      const cleaned = title.split(/[|\-–—]/)[0].trim();
      if (cleaned.length > 2 && cleaned.length < 100) return cleaned;
    }
    const parts = fallbackDomain.split('.');
    if (parts.length >= 2) {
      return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    }
    return fallbackDomain;
  }

  private extractPhone(html: string): string | undefined {
    const phoneRegex = /(?:\+1[\s.-]?)?\(?[2-9]\d{2}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g;
    const matches = html.match(phoneRegex);
    return matches?.[0]?.trim();
  }

  private extractSecurityServices(html: string): string[] {
    const services: string[] = [];
    const keywords = [
      'armed guard', 'unarmed guard', 'patrol', 'surveillance', 'cctv',
      'access control', 'executive protection', 'event security', 'fire watch',
      'loss prevention', 'alarm monitoring', 'mobile patrol', 'concierge security',
      'construction security', 'hospital security', 'retail security',
    ];
    const lowerHtml = html.toLowerCase();
    for (const keyword of keywords) {
      if (lowerHtml.includes(keyword)) services.push(keyword);
    }
    return services;
  }

  private extractContactName(html: string): string | undefined {
    const metaMatch = html.match(/<meta[^>]*name=["']author["'][^>]*content=["']([^"']+)["']/i);
    if (metaMatch) return metaMatch[1].trim();
    return undefined;
  }

  private extractLocation(html: string): string | undefined {
    const statePattern = /(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)/;
    const addressMatch = html.match(new RegExp(`[A-Z][a-z]+,\\s*${statePattern.source}\\s+\\d{5}`));
    return addressMatch?.[0];
  }

  async crawlMultipleWebsites(urls: string[]): Promise<CrawlResult[]> {
    const results: CrawlResult[] = [];
    for (const url of urls) {
      const result = await this.crawlSecurityCompanyWebsite(url);
      results.push(result);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    return results;
  }

  async buildProspectList(crawlResults: CrawlResult[]): Promise<OutreachCandidate[]> {
    const candidates: OutreachCandidate[] = [];
    for (const result of crawlResults) {
      if (!result.robotsAllowed || result.emails.length === 0) continue;

      const priorityEmail = this.selectBestEmail(result.emails);
      if (!priorityEmail) continue;

      candidates.push({
        companyName: result.companyName,
        email: priorityEmail,
        contactName: result.contactName,
        website: result.website,
        location: result.location,
        services: result.services,
        stage: 'prospected',
      });
    }
    return candidates;
  }

  private selectBestEmail(emails: string[]): string | undefined {
    const priorities = ['info@', 'contact@', 'sales@', 'admin@', 'office@', 'hello@', 'support@'];
    for (const prefix of priorities) {
      const match = emails.find(e => e.toLowerCase().startsWith(prefix));
      if (match) return match;
    }
    return emails[0];
  }

  async sendOutreachInvitations(
    candidates: OutreachCandidate[],
    sentByUserId: string,
    options?: { customMessage?: string; trialDays?: number }
  ): Promise<OutreachResult> {
    const errors: string[] = [];
    let emailsSent = 0;
    const trialDays = options?.trialDays || 14;

    for (const candidate of candidates) {
      try {
        const token = crypto.randomUUID();
        const expiry = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);

        await db.insert(orgInvitations).values({
          email: candidate.email,
          organizationName: candidate.companyName,
          contactName: candidate.contactName || null,
          invitationToken: token,
          invitationTokenExpiry: expiry,
          sentBy: sentByUserId,
          status: 'pending',
        });

        await db.insert(activities).values({
          organizationId: PLATFORM_WORKSPACE_ID,
          workspaceId: PLATFORM_WORKSPACE_ID,
          activityType: 'outreach_invitation',
          subject: `Automated outreach to ${candidate.companyName}`,
          prospectEmail: candidate.email,
          createdByUserId: sentByUserId || 'system',
        });

        const { sendAutomationEmail } = await import('./emailService');
        await sendAutomationEmail({
          to: candidate.email,
          subject: `${candidate.companyName} - Streamline Your Security Operations with CoAIleague`,
          html: this.buildOutreachTemplate(candidate, token, trialDays, options?.customMessage),
          category: 'sales_outreach',
          workspaceId: undefined,
        });

        emailsSent++;
        await new Promise(resolve => setTimeout(resolve, 1500));
      } catch (err: any) {
        errors.push(`Failed for ${candidate.email}: ${(err instanceof Error ? err.message : String(err))}`);
      }
    }

    return { success: errors.length === 0, candidatesFound: candidates.length, emailsSent, errors, executionId: this.executionId };
  }

  private buildOutreachTemplate(
    candidate: OutreachCandidate,
    token: string,
    trialDays: number,
    customMessage?: string
  ): string {
    const greeting = candidate.contactName ? `Hello ${candidate.contactName}` : `Hello ${candidate.companyName} Team`;
    const servicesLine = candidate.services && candidate.services.length > 0
      ? `<p>We noticed your company provides ${candidate.services.slice(0, 3).join(', ')} services, and we believe CoAIleague could significantly streamline your operations.</p>`
      : '';

    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #1e40af, #7c3aed); color: white; padding: 24px; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0;">CoAIleague</h2>
          <p style="margin: 4px 0 0; opacity: 0.9;">AI-Powered Workforce Intelligence</p>
        </div>
        <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p>${greeting},</p>
          <p>We are reaching out because we help security companies like yours manage their workforce more efficiently with AI-powered tools.</p>
          ${servicesLine}
          ${customMessage ? `<p>${customMessage}</p>` : ''}
          <div style="background: #f9fafb; padding: 16px; border-radius: 6px; margin: 16px 0;">
            <p style="margin: 0 0 8px; font-weight: 600;">What CoAIleague can do for you:</p>
            <ul style="margin: 0; padding-left: 20px; color: #374151;">
              <li>AI-powered shift scheduling and optimization</li>
              <li>Real-time GPS clock-in/out with anomaly detection</li>
              <li>Automated compliance tracking and certifications</li>
              <li>Integrated payroll and invoicing</li>
              <li>Client portal with live incident reporting</li>
            </ul>
          </div>
          <div style="text-align: center; margin: 24px 0;">
            <a href="${getAppBaseUrl()}/invite/${token}" style="background: linear-gradient(135deg, #1e40af, #7c3aed); color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">
              Start Your ${trialDays}-Day Free Trial
            </a>
          </div>
          <p style="color: #6b7280; font-size: 13px;">No credit card required. Set up takes less than 5 minutes.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
          <p style="color: #9ca3af; font-size: 11px;">
            You are receiving this because your company was identified as a potential fit for CoAIleague.
            If you do not wish to receive further messages, simply ignore this email.
          </p>
        </div>
      </div>
    `;
  }

  async getPipelineSummary(userId: string): Promise<PipelineSummary> {
    const invitations = await db.select().from(orgInvitations)
      .where(eq(orgInvitations.sentBy, userId));

    const stages: Record<PipelineStage, number> = {
      prospected: 0,
      contacted: 0,
      responded: 0,
      demo: 0,
      subscribed: 0,
    };

    for (const inv of invitations) {
      if (inv.acceptedAt) {
        stages.subscribed++;
      } else if (inv.status === 'pending') {
        stages.contacted++;
      } else {
        stages.prospected++;
      }
    }

    const total = Object.values(stages).reduce((a, b) => a + b, 0);
    const conversionRate = total > 0 ? (stages.subscribed / total) * 100 : 0;

    return {
      total,
      ...stages,
      conversionRate: Math.round(conversionRate * 100) / 100,
    };
  }

  async getProspectsByStage(userId: string, stage?: PipelineStage): Promise<OutreachCandidate[]> {
    const invitations = await db.select().from(orgInvitations)
      .where(eq(orgInvitations.sentBy, userId))
      .orderBy(desc(orgInvitations.sentAt));

    const candidates: OutreachCandidate[] = invitations.map(inv => {
      let currentStage: PipelineStage = 'prospected';
      if (inv.acceptedAt) currentStage = 'subscribed';
      else if (inv.status === 'pending') currentStage = 'contacted';

      return {
        companyName: inv.organizationName,
        email: inv.email,
        contactName: inv.contactName || undefined,
        website: '',
        stage: currentStage,
      };
    });

    if (stage) return candidates.filter(c => c.stage === stage);
    return candidates;
  }
}

export const trinityOutreachService = new TrinityOutreachService();
