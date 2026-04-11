import { useMemo } from 'react';
import { Helmet } from 'react-helmet-async';

const PLATFORM_NAME = (import.meta.env.VITE_PLATFORM_NAME as string) || 'CoAIleague';

interface SEOProps {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: 'website' | 'article' | 'product';
  noindex?: boolean;
  structuredData?: Record<string, any> | Record<string, any>[];
  canonical?: string;
}

const BASE_URL = import.meta.env.VITE_PUBLIC_URL || 'https://www.coaileague.com';
const DEFAULT_TITLE = `${PLATFORM_NAME} — AI-Powered Security Guard Workforce Management`;
const DEFAULT_DESCRIPTION = 'The AI workforce management platform built for security guard companies. Automate scheduling, payroll, compliance, and guard management with Trinity AI. Serving security companies across Texas and nationwide.';
const DEFAULT_IMAGE = `${BASE_URL}/og-image.png`;
const SITE_NAME = PLATFORM_NAME;

export function SEO({
  title,
  description = DEFAULT_DESCRIPTION,
  image = DEFAULT_IMAGE,
  url,
  type = 'website',
  noindex = false,
  structuredData,
  canonical,
}: SEOProps) {
  const fullTitle = useMemo(
    () => (title ? `${title} — ${PLATFORM_NAME} | AI Workforce Management for Security Companies` : DEFAULT_TITLE),
    [title]
  );

  const absoluteUrl = useMemo(() => {
    const path = canonical || url || (typeof window !== 'undefined' ? window.location.pathname : '/');
    if (path.startsWith('http')) return path;
    return `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  }, [url, canonical]);

  const absoluteImage = useMemo(() => {
    if (!image) return DEFAULT_IMAGE;
    if (image.startsWith('http')) return image;
    return `${BASE_URL}${image.startsWith('/') ? image : `/${image}`}`;
  }, [image]);

  const structuredDataArray = useMemo(() => {
    if (!structuredData) return [];
    return Array.isArray(structuredData) ? structuredData : [structuredData];
  }, [structuredData]);

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />

      {noindex
        ? <meta name="robots" content="noindex, nofollow" />
        : <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1" />
      }

      <link rel="canonical" href={absoluteUrl} />

      <meta property="og:type" content={type} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={absoluteImage} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:url" content={absoluteUrl} />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:locale" content="en_US" />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={absoluteImage} />

      {structuredDataArray.map((schema, i) => (
        <script key={i} type="application/ld+json">
          {JSON.stringify(schema)}
        </script>
      ))}
    </Helmet>
  );
}

export const PAGE_SEO = {
  landing: {
    title: 'Security Guard Workforce Management Software',
    description: `${PLATFORM_NAME} is the AI-powered workforce management platform built for security guard companies. Automate scheduling, payroll, compliance tracking, and guard management. Free 14-day trial.`,
  },
  features: {
    title: 'Features — AI Scheduling, Payroll & Compliance for Security Companies',
    description: `Explore ${PLATFORM_NAME}'s full feature set: AI shift scheduling, GPS time tracking, automated payroll, incident reporting, compliance management, and Trinity AI intelligence — built for security guard companies.`,
  },
  trinityFeatures: {
    title: 'Trinity AI — C-Suite Intelligence for Security Guard Companies',
    description: 'Meet Trinity, the AI COO built for security companies. Automates scheduling, flags compliance gaps, monitors overtime risk, and delivers daily operational briefings. The smartest guard management AI available.',
  },
  pricing: {
    title: 'Pricing — Security Guard Company Workforce Management Software',
    description: 'Transparent pricing for security guard companies of all sizes. Starter from $499/mo, Professional from $1,499/mo, Enterprise custom. Includes AI scheduling, payroll automation, and compliance management.',
  },
  compare: {
    title: `${PLATFORM_NAME} vs Competitors — Security Guard Management Software Comparison`,
    description: `See how ${PLATFORM_NAME} compares to Sling, Deputy, and other workforce management tools. Built exclusively for security guard companies with AI-native scheduling and compliance automation.`,
  },
  roiCalculator: {
    title: 'ROI Calculator — Security Guard Scheduling Software Savings',
    description: `Calculate how much ${PLATFORM_NAME} saves your security company. Estimate savings from reduced overtime, automated payroll, AI scheduling efficiency, and compliance management.`,
  },
  contact: {
    title: 'Contact Us — Security Guard Workforce Management Demo',
    description: `Get in touch with ${PLATFORM_NAME} for a personalized demo of our security guard workforce management platform. Schedule a call, request a demo, or ask questions. San Antonio, TX.`,
  },
  login: {
    title: 'Sign In to Your Account',
    description: `Sign in to your ${PLATFORM_NAME} security guard workforce management account.`,
  },
  register: {
    title: 'Start Your Free Trial — Security Guard Management Software',
    description: `Start your free 14-day trial of ${PLATFORM_NAME}. AI-powered scheduling, payroll automation, and compliance management for security guard companies.`,
  },
  terms: {
    title: 'Terms of Service',
    description: `${PLATFORM_NAME} terms of service and user agreement for the AI-powered security guard workforce management platform.`,
  },
  privacy: {
    title: 'Privacy Policy',
    description: `${PLATFORM_NAME} privacy policy. Learn how we protect your security company's workforce data and comply with data protection regulations.`,
  },
  status: {
    title: 'System Status',
    description: `Check the current operational status of ${PLATFORM_NAME} platform services, API health, and scheduled maintenance windows.`,
  },
  support: {
    title: `Help Center & Support — ${PLATFORM_NAME} Workforce Management`,
    description: `Get expert help with ${PLATFORM_NAME} security guard workforce management software. Browse knowledge base articles, submit support tickets, or chat with Trinity AI for instant answers.`,
  },
  dashboard: {
    title: 'Dashboard',
    description: `Your ${PLATFORM_NAME} security guard workforce management dashboard.`,
  },
  worker: {
    title: 'Guard Portal',
    description: 'Security officer portal — clock in/out, view assignments, submit reports.',
  },
} as const;

export const STRUCTURED_DATA = {
  organization: {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: `${PLATFORM_NAME}`,
    url: BASE_URL,
    logo: `${BASE_URL}/og-image.png`,
    description: 'AI-powered workforce management platform built for security guard companies.',
    foundingLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'San Antonio',
        addressRegion: 'TX',
        addressCountry: 'US',
      },
    },
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'sales',
      url: `${BASE_URL}/contact`,
    },
  },
  softwareApp: {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: `${PLATFORM_NAME}`,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web, iOS, Android',
    description: 'AI-powered workforce management platform for security guard companies. Features include AI shift scheduling, GPS time tracking, payroll automation, compliance management, and incident reporting.',
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'USD',
      lowPrice: '499',
      highPrice: '1499',
      offerCount: '3',
    },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.8',
      reviewCount: '127',
    },
    featureList: [
      'AI Shift Scheduling for Security Guards',
      'GPS Time Tracking and Geofencing',
      'Automated Payroll Processing',
      'Security License Compliance Management',
      'Incident Reporting and Escalation',
      'QuickBooks Integration',
      'Trinity AI COO Intelligence',
    ],
  },
};
