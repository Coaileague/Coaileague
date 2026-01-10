import { useMemo } from 'react';
import { Helmet } from 'react-helmet-async';

interface SEOProps {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: 'website' | 'article' | 'product';
  noindex?: boolean;
}

const DEFAULT_TITLE = 'CoAIleague - AI-Powered Workforce Management';
const DEFAULT_DESCRIPTION = 'Autonomous workforce management platform with intelligent scheduling, GPS time tracking, payroll automation, and incident reporting. Built for security and field service teams.';
const DEFAULT_IMAGE = '/og-image.png';
const SITE_NAME = 'CoAIleague';

export function SEO({
  title,
  description = DEFAULT_DESCRIPTION,
  image = DEFAULT_IMAGE,
  url,
  type = 'website',
  noindex = false,
}: SEOProps) {
  const fullTitle = useMemo(() => title ? `${title} | ${SITE_NAME}` : DEFAULT_TITLE, [title]);
  const currentUrl = useMemo(() => url || (typeof window !== 'undefined' ? window.location.pathname : ''), [url]);

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      
      {noindex && <meta name="robots" content="noindex, nofollow" />}
      
      <meta property="og:type" content={type} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={image} />
      <meta property="og:url" content={currentUrl} />
      <meta property="og:site_name" content={SITE_NAME} />
      
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />
      
      <link rel="canonical" href={currentUrl} />
    </Helmet>
  );
}

export const PAGE_SEO = {
  landing: {
    title: 'AI-Powered Workforce Management',
    description: 'Transform your workforce operations with autonomous AI scheduling, GPS time tracking, real-time payroll, and intelligent compliance. Start free trial today.',
  },
  pricing: {
    title: 'Pricing Plans',
    description: 'Flexible pricing for businesses of all sizes. Starter $499/mo, Professional $1,499/mo, Enterprise custom. 14-day free trial included.',
  },
  login: {
    title: 'Sign In',
    description: 'Sign in to your CoAIleague account to access your workforce management dashboard.',
  },
  register: {
    title: 'Create Account',
    description: 'Create your free CoAIleague account. Start managing your workforce with AI-powered automation.',
  },
  dashboard: {
    title: 'Dashboard',
    description: 'Your CoAIleague workforce management dashboard with real-time insights and analytics.',
  },
  schedule: {
    title: 'Schedule',
    description: 'AI-optimized employee scheduling with profit-first assignments and compliance tracking.',
  },
  employees: {
    title: 'Employees',
    description: 'Manage your workforce with performance scoring, certifications, and automated onboarding.',
  },
  clients: {
    title: 'Clients',
    description: 'Client management with tiered service levels, contract tracking, and billing automation.',
  },
  timekeeping: {
    title: 'Time & Attendance',
    description: 'GPS-verified time tracking with geofence validation and automated timesheet approval.',
  },
  payroll: {
    title: 'Payroll',
    description: 'Automated payroll processing with QuickBooks sync, tax calculations, and direct deposit.',
  },
  incidents: {
    title: 'Incident Reports',
    description: 'Real-time incident reporting with GPS verification, photo uploads, and automated notifications.',
  },
  worker: {
    title: 'Employee Portal',
    description: 'Clock in/out, view schedules, submit timesheets, and report incidents from your mobile device.',
  },
  onboarding: {
    title: 'Setup Wizard',
    description: 'Get started with CoAIleague in 7 easy steps. AI-powered data migration from QuickBooks and other systems.',
  },
} as const;
