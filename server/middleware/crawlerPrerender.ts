import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../lib/logger';
import { PLATFORM, EMAIL } from '../config/platformConfig';
const log = createLogger('crawlerPrerender');

const BOT_USER_AGENTS = [
  'claudebot', 'claude-web', 'anthropic',
  'googlebot', 'bingbot', 'slurp', 'duckduckbot',
  'baiduspider', 'yandexbot', 'facebot', 'twitterbot',
  'linkedinbot', 'whatsapp', 'telegrambot', 'discordbot',
  'slackbot', 'chatgpt-user', 'gptbot', 'oai-searchbot',
  'petalbot', 'semrushbot', 'ahrefsbot',
];

function isBot(ua: string): boolean {
  const lower = ua.toLowerCase();
  return BOT_USER_AGENTS.some(bot => lower.includes(bot));
}

const SITE_URL = PLATFORM.appUrl;
const OG_IMAGE = `${SITE_URL}/og-image.png`;

function socialMeta(page: { path: string; ogTitle: string; ogDescription: string }): string {
  const url = page.path === '/' ? SITE_URL + '/' : SITE_URL + page.path;
  return `  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${OG_IMAGE}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:site_name" content="${PLATFORM.name}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${page.ogTitle}">
  <meta name="twitter:description" content="${page.ogDescription}">
  <meta name="twitter:image" content="${OG_IMAGE}">`;
}

const FEATURES_DATA = [
  {
    name: "Trinity AI Assistant",
    tagline: "Your AI-Powered Workforce Manager",
    tier: "core",
    category: "AI Automation",
    description: "Trinity is your intelligent copilot for all workforce operations. Ask questions, get insights, and automate tasks with natural language.",
    benefits: ["Natural language scheduling and queries", "Real-time workforce insights", "Automated report generation", "Smart recommendations"],
    roi: "Reduces administrative workload across scheduling, payroll, and compliance — actual impact varies",
  },
  {
    name: "Smart Schedule AI",
    tagline: "1-Click Intelligent Scheduling",
    tier: "premium",
    category: "Scheduling",
    description: "AI-powered scheduling that reduces conflicts, optimizes coverage, and respects employee preferences automatically.",
    benefits: ["1-click auto-fill for entire week", "Conflict detection & resolution", "Learning algorithm improves over time", "Overtime & compliance warnings"],
    roi: "Reduces scheduling coordination time significantly — actual savings vary by organization",
  },
  {
    name: "Trinity Staffing Premier",
    tagline: "AI-Powered Automated Staffing",
    tier: "elite",
    category: "AI Automation",
    description: "Trinity monitors your email inbox for work requests, parses details using AI, creates shifts, assigns the best-fit employees, and confirms with clients - all automatically.",
    benefits: ["Email inbox monitoring for work requests", "AI extraction of shift details", "Smart employee matching (qualifications, proximity, availability)", "5-tier escalation chain (5-15-30-45-60 min)", "Human-like client confirmations"],
    roi: "Responds to requests in minutes vs hours",
  },
  {
    name: "GPS Time Tracking",
    tagline: "Verified Clock-In/Out with Location",
    tier: "premium",
    category: "Time Tracking",
    description: "Employees clock in/out with GPS verification and optional photo proof. Supports time accountability with verifiable attendance records.",
    benefits: ["GPS-verified clock-in/out", "Geofenced job sites", "Photo verification option", "Real-time location tracking"],
    roi: "Reduces unverified time entries — actual savings vary by organization",
  },
  {
    name: "Auto-Payroll Integration",
    tagline: "Seamless Payroll Processing",
    tier: "premium",
    category: "Financial",
    description: "Automatic payroll processing with QuickBooks, ADP, Gusto, and Paychex integration. Tax calculations and direct deposit included.",
    benefits: ["Sync with ADP, Gusto, Paychex, QuickBooks", "Automatic tax calculations", "Direct deposit processing", "W-2 & 1099 generation"],
    roi: "Reduces payroll administration time — actual savings vary by organization",
  },
  {
    name: "Advanced Analytics",
    tagline: "Deep Workforce Intelligence",
    tier: "premium",
    category: "Analytics",
    description: "Comprehensive analytics with labor cost optimization, productivity tracking, and profitability analysis by client and project.",
    benefits: ["Labor cost optimization", "Productivity tracking", "Per-client profitability", "Predictive forecasting"],
    roi: "Surfaces cost reduction opportunities — actual savings vary by organization",
  },
  {
    name: "50-State Compliance",
    tagline: "Automatic Labor Law Compliance",
    tier: "premium",
    category: "Compliance",
    description: "Stay compliant across all 50 states with automatic updates to labor laws, overtime rules, and required certifications.",
    benefits: ["Real-time labor law updates", "Certification expiry tracking", "Audit trail exports", "SOX compliance reports"],
    roi: "Helps monitor compliance requirements — consult legal counsel for specific obligations",
  },
  {
    name: "Trinity Contract Analysis",
    tagline: "AI-Powered Contract Review",
    tier: "elite",
    category: "AI Automation",
    description: "Advanced contract analysis with risk assessment, compliance checking, and negotiation suggestions powered by Trinity AI.",
    benefits: ["Risk assessment scoring", "Compliance gap detection", "Negotiation suggestions", "Standard clause library"],
    roi: "Assists with contract review — outputs should be verified by a licensed attorney",
  },
  {
    name: "White-Label Branding",
    tagline: "Your Brand, Your Platform",
    tier: "elite",
    category: "Enterprise",
    description: "Complete customization with your brand colors, logo, custom domain, and branded mobile app. Remove all ${PLATFORM.name} branding.",
    benefits: ["Custom color palette", "Your logo everywhere", "Custom domain (schedule.yourcompany.com)", "White-labeled mobile app"],
    roi: "Enables white-label reselling to clients — potential revenue varies by business model",
  },
  {
    name: "Guard Tour / Patrol Checkpoints",
    tagline: "Verified Patrol Routes & Checkpoint Scanning",
    tier: "premium",
    category: "Security Operations",
    description: "Define patrol routes with NFC/QR checkpoints. Officers scan checkpoints during rounds to verify completion. Missed checkpoints trigger real-time alerts.",
    benefits: ["NFC/QR checkpoint scanning", "Configurable patrol routes", "Missed checkpoint alerts", "Patrol completion reports"],
    roi: "Provides verifiable patrol records with timestamped checkpoint data",
    comingSoon: true,
  },
  {
    name: "Digital Post Orders",
    tagline: "Paperless Site Instructions & SOPs",
    tier: "premium",
    category: "Security Operations",
    description: "Create, distribute, and track acknowledgment of digital post orders for every job site. Officers access current instructions from their mobile device.",
    benefits: ["Digital post order creation & distribution", "Officer acknowledgment tracking", "Version history & audit trail", "Site-specific instructions on mobile"],
    roi: "Eliminates outdated paper post orders",
    comingSoon: true,
  },
  {
    name: "Lone Worker / Duress Button",
    tagline: "Safety Check-Ins & Emergency Alerts",
    tier: "premium",
    category: "Security Operations",
    description: "Automatic safety check-ins for lone workers with configurable intervals. Officers can trigger a silent duress alert that notifies supervisors with GPS location.",
    benefits: ["Timed safety check-ins", "Silent duress / panic button", "GPS location on alert", "Supervisor escalation chain"],
    roi: "Critical for lone worker safety compliance",
    comingSoon: true,
  },
  {
    name: "Equipment Tracking",
    tagline: "Asset Assignment & Accountability",
    tier: "premium",
    category: "Operations",
    description: "Track assignment, condition, and return of company equipment such as radios, keys, vehicles, and uniforms. Full audit trail per asset.",
    benefits: ["Equipment check-out / check-in", "Condition reporting", "Assignment history per employee", "Loss & damage tracking"],
    roi: "Reduces equipment loss and replacement costs",
    comingSoon: true,
  },
  {
    name: "Pass-Down Logs",
    tagline: "Structured Shift-to-Shift Handoff Notes",
    tier: "premium",
    category: "Operations",
    description: "Digital pass-down logs that ensure critical information transfers between shifts. Supervisors and officers document incidents, observations, and instructions for the incoming team.",
    benefits: ["Structured log templates", "Shift-to-shift handoff tracking", "Photo & attachment support", "Searchable log history"],
    roi: "Prevents information gaps between shifts",
    comingSoon: true,
  },
  {
    name: "Pass-Down Intelligence",
    tagline: "AI-Powered Keyword Scanning & Severity Assignment",
    tier: "premium",
    category: "AI Automation",
    description: "AI-powered analysis of pass-down notes that automatically scans for critical keywords, assigns severity levels, categorizes issues, and escalates safety concerns to supervisors in real-time.",
    benefits: ["AI keyword scanning for critical issues", "Auto-severity assignment (critical/high/medium/low)", "Smart categorization of handoff items", "Priority escalation for safety concerns", "Searchable pass-down history with AI tags"],
    roi: "Reduces information gaps between shifts — actual impact varies by organization",
    comingSoon: true,
  },
];

const TRINITY_FEATURES = [
  {
    title: "Context-Aware Intelligence",
    headline: "Trinity Knows What You're Working On",
    description: "Trinity doesn't just wait for questions. She understands what page you're on, what data you're viewing, and what challenges you're facing. Working on next week's schedule? Trinity notices open shifts and offers to fill them optimally. Reviewing payroll? She flags overtime issues before they become problems.",
    benefits: ["Proactive suggestions based on your current context", "Automatic issue detection and recommendations", "No need to explain what you're doing - Trinity already knows"],
  },
  {
    title: "Business Optimization",
    headline: "Data-Driven Insights That Actually Help",
    description: "Trinity has access to your complete business data: employee schedules, client contracts, time tracking with GPS, payroll costs, overtime trends, and QuickBooks financials. She doesn't just show you numbers—she tells you what they MEAN and what to DO about them.",
    benefits: ["Ask 'Why is my profit down?' and get actionable answers", "Real-time financial health monitoring", "Proactive alerts before small issues become big problems"],
  },
  {
    title: "Intelligent Automation",
    headline: "Trinity Doesn't Just Advise—She Acts",
    description: "With your approval, Trinity can execute tasks on your behalf: auto-fill open shifts based on availability and certifications, send payment reminders to overdue clients, flag overtime violations, sync QuickBooks data, and notify employees of schedule changes.",
    benefits: ["Execute actions with a single approval", "High-risk actions require confirmation for safety", "Save hours every week on repetitive tasks"],
  },
  {
    title: "Personal Growth & Accountability",
    headline: "We Care About YOU, Not Just Your Business",
    description: "Enable Personal Mode and Trinity becomes BUDDY—your accountability partner who challenges you to become a better leader, holds you accountable to commitments, and provides honest feedback even when uncomfortable.",
    benefits: ["Personal development coaching tailored to you", "Accountability that actually works", "Business success starts with personal growth"],
  },
  {
    title: "Holistic Insights",
    headline: "Trinity Sees What You Can't",
    description: "Trinity's Integrated Mode connects business performance to personal patterns. She might notice your employee turnover spiked when you started working 80-hour weeks, or your profit dropped when you stopped holding team meetings.",
    benefits: ["Connect personal habits to business outcomes", "Pattern recognition across all your data", "Insights no other platform offers"],
  },
  {
    title: "Always Available",
    headline: "24/7 Support When You Need It",
    description: "3 AM and can't sleep because you're worried about payroll? Trinity's there. Stuck on a tough decision? Trinity helps you think it through. Unlike robotic AI assistants, Trinity feels like a real partner who knows you and remembers your history.",
    benefits: ["Available any time, any device", "Remembers your preferences and history", "Genuinely cares about your success"],
  },
];

const PRICING_TIERS = [
  { name: "Trial", price: "$0/month", employees: "Up to 10 officers", description: "Full platform free for 14 days", features: ["Trinity AI Brain", "Scheduling & GPS time tracking", "Compliance monitoring", "Mobile app access", "500 AI interactions/month"] },
  { name: "Starter", price: "$1,997/month", employees: "Up to 25 officers", description: "For small security companies", features: ["Everything in Trial, plus:", "Unlimited scheduling", "Client invoicing", "Advanced compliance", "8,000 AI interactions/month"] },
  { name: "Professional", price: "$9,997/month", employees: "Up to 100 officers", description: "Most popular for growing companies", features: ["Everything in Starter, plus:", "Internal payroll processing", "HelpAI client portal", "Predictive analytics", "30,000 AI interactions/month"] },
  { name: "Business", price: "$19,997/month", employees: "Up to 300 officers", description: "For large security operations", features: ["Everything in Professional, plus:", "Multi-state compliance", "Full financial intelligence", "Priority support", "80,000 AI interactions/month"] },
  { name: "Enterprise", price: "Contact Us", employees: "300+ officers", description: "Custom for enterprise security firms", features: ["Everything in Business, plus:", "Unlimited interactions", "White-label branding", "Custom API integrations", "Dedicated account manager"] },
];

const COMPARISON = [
  { feature: "AI-Powered Scheduling", coaileague: true, whenIWork: false, deputy: false, gusto: false },
  { feature: "Context-Aware Assistant", coaileague: true, whenIWork: false, deputy: false, gusto: false },
  { feature: "QuickBooks Deep Integration", coaileague: true, whenIWork: "Basic", deputy: "Basic", gusto: true },
  { feature: "Personal Development Coaching", coaileague: true, whenIWork: false, deputy: false, gusto: false },
  { feature: "Proactive Business Insights", coaileague: true, whenIWork: false, deputy: false, gusto: false },
  { feature: "Intelligent Automation", coaileague: true, whenIWork: false, deputy: false, gusto: false },
];

function renderFeaturesHTML(): string {
  const featureCards = FEATURES_DATA.map(f => {
    const comingSoonBadge = (f as any).comingSoon ? ' <span style="background:#f59e0b;color:#fff;padding:2px 8px;border-radius:4px;font-size:0.85em;font-weight:bold;">Coming Soon</span>' : '';
    return `
    <article>
      <h3>${f.name}${comingSoonBadge} - ${f.tagline}</h3>
      <p><strong>Tier:</strong> ${f.tier} | <strong>Category:</strong> ${f.category}</p>
      <p>${f.description}</p>
      <h4>Key Benefits:</h4>
      <ul>${f.benefits.map(b => `<li>${b}</li>`).join('')}</ul>
      <p><strong>ROI:</strong> ${f.roi}</p>
    </article>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${PLATFORM.name} Features - AI-Powered Workforce Management Platform</title>
  <meta name="description" content="${PLATFORM.name} is a Fortune 500-grade workforce management platform with Trinity AI, smart scheduling, GPS time tracking, auto-payroll, 50-state compliance, and advanced analytics.">
  <meta property="og:title" content="${PLATFORM.name} Features - Complete Workforce Intelligence">
  <meta property="og:description" content="AI-powered workforce management with Trinity AI assistant, smart scheduling, GPS time tracking, auto-payroll integration, and 50-state compliance.">
  <meta property="og:type" content="website">
${socialMeta({ path: '/features', ogTitle: '${PLATFORM.name} Features - Complete Workforce Intelligence', ogDescription: 'AI-powered workforce management with Trinity AI assistant, smart scheduling, GPS time tracking, auto-payroll integration, and 50-state compliance.' })}
</head>
<body>
  <header>
    <h1>${PLATFORM.name} - AI-Powered Workforce Intelligence Platform</h1>
    <p>Fortune 500-grade multi-tenant autonomous workforce management. Trinity AI provides intelligent automation for scheduling, payroll, compliance, and business optimization.</p>
    <nav>
      <a href="/">Home</a> |
      <a href="/features">Features</a> |
      <a href="/trinity-features">Trinity AI</a> |
      <a href="/pricing">Pricing</a> |
      <a href="/compare">Compare</a> |
      <a href="/contact">Contact</a> |
      <a href="/register">Start Free Trial</a>
    </nav>
  </header>

  <main>
    <section>
      <h2>Platform Features</h2>
      <p>${PLATFORM.name} offers comprehensive workforce management capabilities organized into three tiers: Core (included with every plan), Premium, and Elite.</p>
      ${featureCards}
    </section>

    <section>
      <h2>Pricing Plans</h2>
      ${PRICING_TIERS.map(t => `
      <article>
        <h3>${t.name} - ${t.price}</h3>
        <p>${t.description} (${t.employees})</p>
        <ul>${t.features.map(f => `<li>${f}</li>`).join('')}</ul>
      </article>`).join('\n')}
      <p>All plans include a 14-day free trial. No credit card required.</p>
    </section>
  </main>

  <footer>
    <p>${PLATFORM.name} - AI-Powered Workforce Intelligence. Start your free trial today.</p>
  </footer>
</body>
</html>`;
}

function renderTrinityFeaturesHTML(): string {
  const featureSections = TRINITY_FEATURES.map(f => `
    <article>
      <h3>${f.title}: ${f.headline}</h3>
      <p>${f.description}</p>
      <ul>${f.benefits.map(b => `<li>${b}</li>`).join('')}</ul>
    </article>`).join('\n');

  const comparisonRows = COMPARISON.map(c => `
    <tr>
      <td>${c.feature}</td>
      <td>${c.coaileague === true ? 'Yes' : c.coaileague}</td>
      <td>${c.whenIWork === true ? 'Yes' : c.whenIWork === false ? 'No' : c.whenIWork}</td>
      <td>${c.deputy === true ? 'Yes' : c.deputy === false ? 'No' : c.deputy}</td>
      <td>${c.gusto === true ? 'Yes' : c.gusto === false ? 'No' : c.gusto}</td>
    </tr>`).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Trinity AI Assistant - AI-Powered Business Operations Partner | ${PLATFORM.name}</title>
  <meta name="description" content="Meet Trinity: ${PLATFORM.name}'s AI orchestration layer for workforce management. Assists with scheduling, compliance monitoring, payroll preparation, and business insights. All outputs reviewed by your team.">
  <meta property="og:title" content="Trinity AI - AI-Assisted Workforce Operations | ${PLATFORM.name}">
  <meta property="og:description" content="${PLATFORM.name}'s AI assistant helps security companies manage scheduling, compliance, payroll, and operations — with human approval gates at every critical decision point.">
  <meta property="og:type" content="website">
${socialMeta({ path: '/trinity-features', ogTitle: 'Trinity AI - AI-Assisted Workforce Operations | ${PLATFORM.name}', ogDescription: '${PLATFORM.name}\'s AI assistant helps security companies manage scheduling, compliance, payroll, and operations — with human approval gates at every critical decision point.' })}
</head>
<body>
  <header>
    <h1>Meet Trinity: Your AI Partner for Business, Leadership & Life</h1>
    <p>The only workforce management platform with an AI assistant that understands your business challenges, supports your personal growth, and actually cares about your success.</p>
    <p>Included with every ${PLATFORM.name} plan.</p>
    <nav>
      <a href="/">Home</a> |
      <a href="/features">All Features</a> |
      <a href="/trinity-features">Trinity AI</a> |
      <a href="/pricing">Pricing</a> |
      <a href="/register">Start Free Trial</a>
    </nav>
  </header>

  <main>
    <section>
      <h2>What Makes Trinity Different</h2>
      <p>Most workforce management platforms help you schedule shifts and process payroll. Trinity does that—and so much more. She's an AI assistant who knows your business inside and out, understands what you're working on, and proactively helps you succeed.</p>
      <ul>
        <li><strong>Not a chatbot</strong> — A genuine AI partner that understands your specific business</li>
        <li><strong>Not reactive</strong> — Proactively spots issues and suggests solutions before you even ask</li>
        <li><strong>Not just business</strong> — Optional personal development coaching to help you grow as a leader</li>
      </ul>
    </section>

    <section>
      <h2>Trinity AI Capabilities</h2>
      ${featureSections}
    </section>

    <section>
      <h2>Trinity AI Technical Capabilities</h2>
      <ul>
        <li><strong>Tri-AI Architecture:</strong> Trinity (Gemini) for scheduling, monitoring, payroll, data analysis. Claude (Anthropic) for RFPs, compliance, contracts, strategic planning. GPT-4 (OpenAI) for customer support, training content, chatbot queries.</li>
        <li><strong>400+ Registered Actions:</strong> Trinity can execute over 400 different workforce management actions autonomously</li>
        <li><strong>Reinforcement Learning:</strong> Trinity learns from every correction and improves her accuracy over time</li>
        <li><strong>Knowledge Graph:</strong> Entity-based memory for client preferences, employee patterns, and business intelligence</li>
        <li><strong>Multi-Tenant Isolation:</strong> Each workspace has fully isolated AI data - no cross-tenant leakage</li>
        <li><strong>Progressive Autonomy:</strong> Workspaces earn higher auto-approval thresholds based on Trinity's success rate</li>
        <li><strong>7-Step Document Pipeline:</strong> CAPTURE, PROCESS, GENERATE, APPROVE, ROUTE, DELIVER, STORE</li>
        <li><strong>Financial Pipeline:</strong> Time Entries to Invoice/Payroll Generation to Confidence Scoring to QuickBooks Sync</li>
        <li><strong>Per-Client Billing Cycles:</strong> Supports daily, weekly, bi-weekly, and monthly billing per client</li>
        <li><strong>Partial Payment Tracking:</strong> Invoices support multiple partial payments with aging reports (30/60/90/90+ days)</li>
        <li><strong>Client Self-Service Portal:</strong> Token-based client access to view invoices and payment history</li>
        <li><strong>SMS Notifications:</strong> Twilio integration for shift reminders, schedule changes, approvals</li>
        <li><strong>HRIS Integration:</strong> 8 providers (QuickBooks, Gusto, ADP, Paychex, Zenefits, Rippling, BambooHR, Workday)</li>
      </ul>
    </section>

    <section>
      <h2>Comparison: ${PLATFORM.name} vs Competitors</h2>
      <table>
        <thead><tr><th>Feature</th><th>${PLATFORM.name}</th><th>When I Work</th><th>Deputy</th><th>Gusto</th></tr></thead>
        <tbody>${comparisonRows}</tbody>
      </table>
    </section>

    <section>
      <h2>Testimonials</h2>
      <blockquote>"Trinity noticed I was scheduling too many overtime shifts and suggested hiring one more guard. I did, and my labor costs dropped 12% in one month. She paid for herself immediately." — Security Company Owner, Beta Customer</blockquote>
      <blockquote>"I was skeptical about Personal Mode at first. But Trinity called me out on avoiding a difficult conversation with an underperforming manager. She was right. My entire team improved." — Operations Manager, Beta Customer</blockquote>
      <blockquote>"I've used When I Work, Deputy, and Homebase. Trinity is in a different league. She doesn't just track time—she thinks WITH me about how to grow my business." — CEO, Beta Customer</blockquote>
    </section>
  </main>

  <footer>
    <p>${PLATFORM.name} - AI-Powered Workforce Intelligence Platform. Start your 14-day free trial today.</p>
  </footer>
</body>
</html>`;
}

function renderHomepageHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${PLATFORM.name} - AI-Powered Workforce Intelligence Platform</title>
  <meta name="description" content="Fortune 500-grade workforce management with Trinity AI. Smart scheduling, GPS time tracking, auto-payroll, 50-state compliance, and advanced analytics for security companies and service businesses.">
  <meta property="og:title" content="${PLATFORM.name} - AI-Powered Workforce Intelligence">
  <meta property="og:description" content="The only workforce management platform with an AI assistant that understands your business. Smart scheduling, GPS time tracking, auto-payroll, and more.">
  <meta property="og:type" content="website">
${socialMeta({ path: '/', ogTitle: '${PLATFORM.name} - AI-Powered Workforce Intelligence', ogDescription: 'The only workforce management platform with an AI assistant that understands your business. Smart scheduling, GPS time tracking, auto-payroll, and more.' })}
</head>
<body>
  <header>
    <h1>${PLATFORM.name} - AI-Powered Workforce Intelligence Platform</h1>
    <p>Fortune 500-grade multi-tenant autonomous workforce management for security companies and service businesses.</p>
    <nav>
      <a href="/">Home</a> |
      <a href="/features">Features</a> |
      <a href="/trinity-features">Trinity AI</a> |
      <a href="/pricing">Pricing</a> |
      <a href="/compare">Compare</a> |
      <a href="/contact">Contact</a> |
      <a href="/register">Start Free Trial</a>
    </nav>
  </header>

  <main>
    <section>
      <h2>Stop managing your workforce. Start leading it.</h2>
      <p>${PLATFORM.name} replaces 6+ tools with one intelligent platform. Trinity AI handles scheduling, payroll, compliance, and business optimization — so you can focus on growing your business.</p>
    </section>

    <section>
      <h2>Core Platform Capabilities</h2>
      <ul>
        <li><strong>Trinity AI Assistant:</strong> Natural language workforce management with 400+ autonomous actions</li>
        <li><strong>Smart Schedule AI:</strong> 1-click intelligent scheduling with conflict detection and learning algorithms</li>
        <li><strong>GPS Time Tracking:</strong> Verified clock-in/out with geofencing and photo proof</li>
        <li><strong>Auto-Payroll:</strong> Seamless integration with QuickBooks, ADP, Gusto, and Paychex</li>
        <li><strong>50-State Compliance:</strong> Automatic labor law updates and certification tracking</li>
        <li><strong>Advanced Analytics:</strong> Per-client profitability, labor cost optimization, predictive forecasting</li>
        <li><strong>Trinity Staffing Premier:</strong> AI-powered automated staffing from email inbox to employee assignment</li>
        <li><strong>Contract Analysis:</strong> AI-powered risk assessment and compliance checking</li>
        <li><strong>White-Label Branding:</strong> Custom domain, logo, and colors for your business</li>
        <li><strong>Client Self-Service Portal:</strong> Clients view invoices and payment history independently</li>
        <li><strong>Invoice Aging Reports:</strong> Automated 30/60/90-day aging buckets for accounts receivable</li>
        <li><strong>Partial Payment Tracking:</strong> Support for multiple partial payments per invoice</li>
      </ul>
    </section>

    <section>
      <h2>Who Uses ${PLATFORM.name}</h2>
      <p>${PLATFORM.name} is built for security companies, staffing agencies, cleaning services, and any business managing a mobile workforce. Our platform replaces separate scheduling, time tracking, payroll, compliance, and analytics tools with one intelligent system.</p>
    </section>

    <section>
      <h2>Quick Links</h2>
      <ul>
        <li><a href="/features">Full Feature Showcase</a></li>
        <li><a href="/trinity-features">Trinity AI Deep Dive</a></li>
        <li><a href="/pricing">Pricing Plans</a></li>
        <li><a href="/compare">Compare to Competitors</a></li>
        <li><a href="/roi-calculator">ROI Calculator</a></li>
        <li><a href="/register">Start Free Trial (14 days, no credit card)</a></li>
        <li><a href="/contact">Contact Sales</a></li>
      </ul>
    </section>
  </main>

  <footer>
    <p>${PLATFORM.name} - AI-Powered Workforce Intelligence Platform</p>
    <a href="/terms">Terms of Service</a> | <a href="/privacy">Privacy Policy</a>
  </footer>
</body>
</html>`;
}

function renderLoginHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Login - ${PLATFORM.name} Workforce Management</title>
  <meta name="description" content="Log in to your ${PLATFORM.name} workforce management dashboard. Access scheduling, time tracking, payroll, and Trinity AI from any device.">
  <meta property="og:title" content="Login - ${PLATFORM.name}">
  <meta property="og:description" content="Access your workforce management dashboard. Scheduling, time tracking, payroll, and AI insights at your fingertips.">
  <meta property="og:type" content="website">
${socialMeta({ path: '/login', ogTitle: 'Login - ${PLATFORM.name}', ogDescription: 'Access your workforce management dashboard. Scheduling, time tracking, payroll, and AI insights at your fingertips.' })}
</head>
<body>
  <header>
    <h1>Log In to ${PLATFORM.name}</h1>
    <nav>
      <a href="/">Home</a> |
      <a href="/features">Features</a> |
      <a href="/pricing">Pricing</a> |
      <a href="/register">Create Account</a>
    </nav>
  </header>
  <main>
    <section>
      <h2>Sign in to your account</h2>
      <p>Access your workforce management dashboard with your email and password.</p>
      <ul>
        <li>Email and password login</li>
        <li>Forgot password recovery via email</li>
        <li>Secure session management</li>
        <li>Multi-factor authentication support</li>
      </ul>
      <p>Don't have an account? <a href="/register">Start your free 14-day trial</a></p>
    </section>
  </main>
  <footer>
    <a href="/terms">Terms of Service</a> | <a href="/privacy">Privacy Policy</a>
  </footer>
</body>
</html>`;
}

function renderRegisterHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Start Free Trial - ${PLATFORM.name} AI Workforce Management</title>
  <meta name="description" content="Start your free 14-day trial of ${PLATFORM.name}. No credit card required. AI-powered scheduling, GPS time tracking, auto-payroll, and 50-state compliance for security companies.">
  <meta property="og:title" content="Start Free Trial - ${PLATFORM.name}">
  <meta property="og:description" content="14-day free trial. No credit card required. AI scheduling, GPS tracking, auto-payroll for security companies.">
  <meta property="og:type" content="website">
${socialMeta({ path: '/register', ogTitle: 'Start Free Trial - ${PLATFORM.name}', ogDescription: '14-day free trial. No credit card required. AI scheduling, GPS tracking, auto-payroll for security companies.' })}
</head>
<body>
  <header>
    <h1>Start Your Free 14-Day Trial</h1>
    <nav>
      <a href="/">Home</a> |
      <a href="/features">Features</a> |
      <a href="/pricing">Pricing</a> |
      <a href="/login">Log In</a>
    </nav>
  </header>
  <main>
    <section>
      <h2>Create your ${PLATFORM.name} account</h2>
      <p>Get started in minutes. No credit card required.</p>
      <h3>What's included in your trial:</h3>
      <ul>
        <li>Full access to Trinity AI Assistant</li>
        <li>Smart Schedule AI with 1-click auto-fill</li>
        <li>GPS time tracking with geofencing</li>
        <li>Up to 15 employees</li>
        <li>2,000 AI credits</li>
        <li>Email support</li>
      </ul>
      <p>Already have an account? <a href="/login">Log in here</a></p>
    </section>
  </main>
  <footer>
    <p>By creating an account you agree to our <a href="/terms">Terms of Service</a> and <a href="/privacy">Privacy Policy</a>.</p>
  </footer>
</body>
</html>`;
}

function renderContactHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Contact Us - ${PLATFORM.name} Workforce Management</title>
  <meta name="description" content="Contact the ${PLATFORM.name} team for sales inquiries, support, or partnership opportunities. We help security companies and service businesses transform their workforce management.">
  <meta property="og:title" content="Contact ${PLATFORM.name}">
  <meta property="og:description" content="Get in touch for sales, support, or partnership inquiries. AI-powered workforce management for security companies.">
  <meta property="og:type" content="website">
${socialMeta({ path: '/contact', ogTitle: 'Contact ${PLATFORM.name}', ogDescription: 'Get in touch for sales, support, or partnership inquiries. AI-powered workforce management for security companies.' })}
</head>
<body>
  <header>
    <h1>Contact ${PLATFORM.name}</h1>
    <nav>
      <a href="/">Home</a> |
      <a href="/features">Features</a> |
      <a href="/pricing">Pricing</a> |
      <a href="/register">Start Free Trial</a>
    </nav>
  </header>
  <main>
    <section>
      <h2>Get in Touch</h2>
      <p>Whether you have a question about features, pricing, need a demo, or anything else, our team is ready to answer your questions.</p>
      <ul>
        <li><strong>Sales:</strong> Schedule a personalized demo of ${PLATFORM.name} for your security company</li>
        <li><strong>Support:</strong> Get help with your existing ${PLATFORM.name} account</li>
        <li><strong>Enterprise:</strong> Custom pricing and dedicated support for large organizations</li>
        <li><strong>Partnerships:</strong> Integration and reseller partnership opportunities</li>
      </ul>
      <p>Response time: We aim to respond within 24 hours on business days.</p>
    </section>
  </main>
  <footer>
    <a href="/terms">Terms of Service</a> | <a href="/privacy">Privacy Policy</a>
  </footer>
</body>
</html>`;
}

function renderTermsHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Terms of Service - ${PLATFORM.name}</title>
  <meta name="description" content="${PLATFORM.name} Terms of Service. Read our terms governing the use of our AI-powered workforce management platform.">
  <meta property="og:title" content="Terms of Service - ${PLATFORM.name}">
  <meta property="og:type" content="website">
${socialMeta({ path: '/terms', ogTitle: 'Terms of Service - ${PLATFORM.name}', ogDescription: '${PLATFORM.name} Terms of Service governing the use of our AI-powered workforce management platform.' })}
</head>
<body>
  <header>
    <h1>Terms of Service</h1>
    <nav>
      <a href="/">Home</a> |
      <a href="/privacy">Privacy Policy</a> |
      <a href="/register">Start Free Trial</a>
    </nav>
  </header>
  <main>
    <section>
      <h2>${PLATFORM.name} Terms of Service</h2>
      <p>These Terms of Service govern your use of the ${PLATFORM.name} workforce management platform. By accessing or using ${PLATFORM.name}, you agree to be bound by these terms.</p>
      <p>Please visit the full page to read our complete Terms of Service.</p>
    </section>
  </main>
</body>
</html>`;
}

function renderPrivacyHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Privacy Policy - ${PLATFORM.name}</title>
  <meta name="description" content="${PLATFORM.name} Privacy Policy. Learn how we collect, use, and protect your personal information on our workforce management platform.">
  <meta property="og:title" content="Privacy Policy - ${PLATFORM.name}">
  <meta property="og:type" content="website">
${socialMeta({ path: '/privacy', ogTitle: 'Privacy Policy - ${PLATFORM.name}', ogDescription: '${PLATFORM.name} Privacy Policy describing how we collect, use, and protect your personal information.' })}
</head>
<body>
  <header>
    <h1>Privacy Policy</h1>
    <nav>
      <a href="/">Home</a> |
      <a href="/terms">Terms of Service</a> |
      <a href="/register">Start Free Trial</a>
    </nav>
  </header>
  <main>
    <section>
      <h2>${PLATFORM.name} Privacy Policy</h2>
      <p>Your privacy is important to us. This policy describes how ${PLATFORM.name} collects, uses, and protects personal information.</p>
      <p>Please visit the full page to read our complete Privacy Policy.</p>
    </section>
  </main>
</body>
</html>`;
}

function renderSmsTermsHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SMS Terms of Service - ${PLATFORM.name} Workforce Alerts</title>
  <meta name="description" content="${PLATFORM.name} SMS Workforce Alerts program terms — opt-in, opt-out, message frequency, and privacy information for security workforce SMS notifications.">
  <meta property="og:title" content="SMS Terms of Service - ${PLATFORM.name}">
  <meta property="og:type" content="website">
${socialMeta({ path: '/sms-terms', ogTitle: 'SMS Terms of Service - ${PLATFORM.name}', ogDescription: '${PLATFORM.name} SMS Workforce Alerts program terms including opt-in, opt-out, message frequency, and privacy information.' })}
</head>
<body>
  <header>
    <h1>SMS Terms of Service — ${PLATFORM.name} Workforce Alerts</h1>
    <nav>
      <a href="/">Home</a> |
      <a href="/privacy">Privacy Policy</a> |
      <a href="/terms">Terms of Service</a>
    </nav>
  </header>
  <main>
    <section>
      <h2>Program Summary</h2>
      <ul>
        <li><strong>Program Name:</strong> ${PLATFORM.name} Workforce Alerts</li>
        <li><strong>Message Types:</strong> Recurring automated workforce notifications (shift reminders, schedule changes, safety alerts, account notifications)</li>
        <li><strong>Message Frequency:</strong> Varies — up to 10 messages per week during active periods</li>
        <li><strong>Rates:</strong> Msg and data rates may apply</li>
        <li><strong>Opt In:</strong> Check the SMS consent checkbox in your ${PLATFORM.name} employee profile</li>
        <li><strong>Opt Out:</strong> Reply STOP, STOPALL, CANCEL, END, QUIT, or UNSUBSCRIBE to any message</li>
        <li><strong>Help:</strong> Reply HELP or email ${EMAIL.senders.support}</li>
      </ul>
    </section>
    <section>
      <h2>Opt-In</h2>
      <p>SMS consent is collected via an opt-in checkbox on the employee profile page in the ${PLATFORM.name} platform. The checkbox is unchecked by default. Consent is not required as a condition of employment or platform use.</p>
      <p>Opt-in language: "I agree to receive recurring automated text message (SMS) notifications from ${PLATFORM.name} for workforce management purposes, including shift reminders, schedule changes, safety alerts, and account notifications. Message frequency varies. Msg and data rates may apply. Reply STOP to opt out. Reply HELP for help."</p>
    </section>
    <section>
      <h2>Opt-Out</h2>
      <p>Reply STOP (or STOPALL, CANCEL, END, QUIT, UNSUBSCRIBE) to opt out at any time. You will receive one confirmation message and no further messages will be sent.</p>
      <p>Opt-out confirmation: "You have been unsubscribed from ${PLATFORM.name} Workforce Alerts. You will receive no further messages from this number. To re-enroll, update your notification preferences in the ${PLATFORM.name} app."</p>
    </section>
    <section>
      <h2>Help Response</h2>
      <p>Reply HELP for program information. Help response: "${PLATFORM.name} Workforce Alerts: Shift reminders, schedule updates, safety alerts, and account notifications for security staff. Msg frequency varies. Msg and data rates may apply. Reply STOP to unsubscribe. Contact ${EMAIL.senders.support} for help."</p>
    </section>
    <section>
      <h2>Privacy</h2>
      <p>No mobile information will be shared with third parties or affiliates for marketing or promotional purposes. Phone numbers are used solely to deliver the workforce notifications you have consented to receive.</p>
      <p>For complete privacy information, see our <a href="/privacy#sms-messaging">Privacy Policy — SMS Messaging Program</a>.</p>
    </section>
    <section>
      <h2>Contact</h2>
      <p>Email: ${EMAIL.senders.support} | Website: ${PLATFORM.appUrl}</p>
    </section>
  </main>
</body>
</html>`;
}

function renderPricingHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pricing Plans - ${PLATFORM.name} AI Workforce Management</title>
  <meta name="description" content="Simple, transparent pricing for ${PLATFORM.name}. Start free, upgrade as you grow. Plans from $8/employee/month for AI-powered scheduling, GPS tracking, payroll, and compliance.">
  <meta property="og:title" content="${PLATFORM.name} Pricing - Plans for Every Team Size">
  <meta property="og:description" content="Start free, upgrade as you grow. AI scheduling, GPS tracking, auto-payroll from $8/employee/month.">
  <meta property="og:type" content="website">
${socialMeta({ path: '/pricing', ogTitle: '${PLATFORM.name} Pricing - Plans for Every Team Size', ogDescription: 'Start free, upgrade as you grow. AI scheduling, GPS tracking, auto-payroll from $8/employee/month.' })}
</head>
<body>
  <header>
    <h1>${PLATFORM.name} Pricing Plans</h1>
    <nav>
      <a href="/">Home</a> |
      <a href="/features">Features</a> |
      <a href="/trinity-features">Trinity AI</a> |
      <a href="/register">Start Free Trial</a>
    </nav>
  </header>
  <main>
    <section>
      <h2>Simple, Transparent Pricing</h2>
      <p>Start with a free 14-day trial. No credit card required. Upgrade as your team grows.</p>
    </section>

    <section>
      <h3>Starter - Free</h3>
      <p>Perfect for small teams getting started with workforce management.</p>
      <ul>
        <li>Up to 10 employees</li>
        <li>Basic scheduling</li>
        <li>GPS time tracking</li>
        <li>Mobile clock-in/out</li>
        <li>Email support</li>
      </ul>
    </section>

    <section>
      <h3>Professional - $8/employee/month</h3>
      <p>For growing security companies that need advanced automation.</p>
      <ul>
        <li>Unlimited employees</li>
        <li>Trinity AI Assistant</li>
        <li>Smart Schedule AI with conflict detection</li>
        <li>Auto-payroll integration (QuickBooks, ADP, Gusto)</li>
        <li>50-state compliance tracking</li>
        <li>Advanced analytics and reporting</li>
        <li>Client portal</li>
        <li>Priority support</li>
      </ul>
    </section>

    <section>
      <h3>Enterprise - Custom Pricing</h3>
      <p>For large organizations requiring dedicated support and custom features.</p>
      <ul>
        <li>Everything in Professional</li>
        <li>White-label branding</li>
        <li>Custom integrations</li>
        <li>Dedicated account manager</li>
        <li>SLA guarantees</li>
        <li>On-premise deployment option</li>
        <li>Custom AI training</li>
        <li>24/7 phone support</li>
      </ul>
    </section>

    <section>
      <h2>All Plans Include</h2>
      <ul>
        <li>Unlimited shifts and schedules</li>
        <li>Mobile app for iOS and Android</li>
        <li>Real-time notifications</li>
        <li>Data encryption (AES-256)</li>
        <li>99.9% uptime SLA</li>
        <li>Free data migration</li>
      </ul>
    </section>

    <section>
      <h2>Frequently Asked Questions</h2>
      <dl>
        <dt>Can I try ${PLATFORM.name} for free?</dt>
        <dd>Yes. Start a 14-day free trial with full Professional features. No credit card required.</dd>
        <dt>How does billing work?</dt>
        <dd>You are billed monthly based on the number of active employees. Add or remove employees at any time.</dd>
        <dt>Can I switch plans?</dt>
        <dd>Yes. Upgrade or downgrade your plan at any time. Changes take effect on your next billing cycle.</dd>
      </dl>
    </section>
  </main>
  <footer>
    <a href="/terms">Terms of Service</a> | <a href="/privacy">Privacy Policy</a> | <a href="/contact">Contact Us</a>
  </footer>
</body>
</html>`;
}

function renderCompareHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Compare ${PLATFORM.name} vs Competitors - Workforce Management Comparison</title>
  <meta name="description" content="See how ${PLATFORM.name} compares to Deputy, When I Work, Homebase, and other workforce management tools. AI-powered scheduling, GPS tracking, and auto-payroll in one platform.">
  <meta property="og:title" content="${PLATFORM.name} vs Competitors - Feature Comparison">
  <meta property="og:description" content="Compare ${PLATFORM.name} to Deputy, When I Work, Homebase. One platform replaces 6+ tools with AI automation.">
  <meta property="og:type" content="website">
${socialMeta({ path: '/compare', ogTitle: '${PLATFORM.name} vs Competitors - Feature Comparison', ogDescription: 'Compare ${PLATFORM.name} to Deputy, When I Work, Homebase. One platform replaces 6+ tools with AI automation.' })}
</head>
<body>
  <header>
    <h1>How ${PLATFORM.name} Compares</h1>
    <nav>
      <a href="/">Home</a> |
      <a href="/features">Features</a> |
      <a href="/pricing">Pricing</a> |
      <a href="/register">Start Free Trial</a>
    </nav>
  </header>
  <main>
    <section>
      <h2>${PLATFORM.name} replaces 6+ separate tools</h2>
      <p>Instead of paying for separate scheduling, time tracking, payroll, compliance, analytics, and communication tools, ${PLATFORM.name} provides everything in one AI-powered platform.</p>
    </section>

    <section>
      <h3>${PLATFORM.name} vs Deputy</h3>
      <ul>
        <li>Trinity AI assistant included (Deputy has no AI)</li>
        <li>Built-in payroll integration (Deputy requires third-party)</li>
        <li>50-state compliance tracking (Deputy has limited compliance)</li>
        <li>Contract lifecycle management included</li>
      </ul>
    </section>

    <section>
      <h3>${PLATFORM.name} vs When I Work</h3>
      <ul>
        <li>GPS-verified time tracking with geofencing</li>
        <li>AI-powered schedule optimization</li>
        <li>Built-in invoicing and billing</li>
        <li>Security industry certifications tracking</li>
      </ul>
    </section>

    <section>
      <h3>${PLATFORM.name} vs Homebase</h3>
      <ul>
        <li>Enterprise-grade multi-tenant architecture</li>
        <li>Advanced analytics with per-client profitability</li>
        <li>White-label branding option</li>
        <li>AI-powered document processing</li>
      </ul>
    </section>
  </main>
  <footer>
    <a href="/terms">Terms of Service</a> | <a href="/privacy">Privacy Policy</a> | <a href="/contact">Contact Us</a>
  </footer>
</body>
</html>`;
}

function renderROICalculatorHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ROI Calculator - See How Much ${PLATFORM.name} Saves Your Business</title>
  <meta name="description" content="Calculate your return on investment with ${PLATFORM.name}. See how much time and money your security company saves with AI-powered scheduling, auto-payroll, and compliance automation.">
  <meta property="og:title" content="${PLATFORM.name} ROI Calculator">
  <meta property="og:description" content="Calculate how much time and money ${PLATFORM.name} saves your business with AI automation.">
  <meta property="og:type" content="website">
${socialMeta({ path: '/roi-calculator', ogTitle: '${PLATFORM.name} ROI Calculator', ogDescription: 'Calculate how much time and money ${PLATFORM.name} saves your business with AI automation.' })}
</head>
<body>
  <header>
    <h1>${PLATFORM.name} ROI Calculator</h1>
    <nav>
      <a href="/">Home</a> |
      <a href="/features">Features</a> |
      <a href="/pricing">Pricing</a> |
      <a href="/register">Start Free Trial</a>
    </nav>
  </header>
  <main>
    <section>
      <h2>Calculate Your Savings</h2>
      <p>See how much time and money your business could save by switching to ${PLATFORM.name}.</p>
    </section>

    <section>
      <h3>Average Customer Savings</h3>
      <ul>
        <li><strong>20+ hours/week</strong> saved on scheduling and admin tasks</li>
        <li><strong>15% reduction</strong> in overtime costs with AI-optimized scheduling</li>
        <li><strong>90% faster</strong> payroll processing with auto-payroll integration</li>
        <li><strong>$500+/month</strong> saved by replacing 6+ separate tools</li>
        <li><strong>50% fewer</strong> compliance violations with automated certification tracking</li>
      </ul>
    </section>

    <section>
      <h3>How It Works</h3>
      <p>Enter your team size, current tools, and time spent on admin tasks to see your personalized ROI estimate. Our calculator factors in scheduling automation, payroll processing, compliance management, and tool consolidation savings.</p>
    </section>
  </main>
  <footer>
    <a href="/terms">Terms of Service</a> | <a href="/privacy">Privacy Policy</a> | <a href="/contact">Contact Us</a>
  </footer>
</body>
</html>`;
}

function renderSupportHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Support & Help Center - ${PLATFORM.name}</title>
  <meta name="description" content="Get help with ${PLATFORM.name} workforce management platform. Browse articles, submit tickets, chat with Trinity AI, or contact our support team. Expert help for security guard company owners.">
  <meta property="og:title" content="${PLATFORM.name} Support & Help Center">
  <meta property="og:description" content="Get help with ${PLATFORM.name}. Browse articles, submit tickets, or contact our support team.">
  <meta property="og:type" content="website">
${socialMeta({ path: '/support', ogTitle: '${PLATFORM.name} Support & Help Center', ogDescription: 'Get help with ${PLATFORM.name}. Browse articles, submit tickets, or contact our support team.' })}
</head>
<body>
  <header>
    <h1>${PLATFORM.name} Help Center</h1>
    <nav>
      <a href="/">Home</a> |
      <a href="/features">Features</a> |
      <a href="/pricing">Pricing</a> |
      <a href="/contact">Contact</a>
    </nav>
  </header>
  <main>
    <section>
      <h2>How can we help?</h2>
      <p>Find answers to common questions, browse documentation, or contact our support team.</p>
    </section>
    <section>
      <h3>Popular Topics</h3>
      <ul>
        <li>Getting started with ${PLATFORM.name}</li>
        <li>Setting up AI scheduling</li>
        <li>GPS time tracking and geofencing</li>
        <li>Payroll integration setup (QuickBooks, ADP, Gusto)</li>
        <li>Compliance and certification management</li>
        <li>Trinity AI configuration</li>
      </ul>
    </section>
  </main>
  <footer>
    <a href="/terms">Terms of Service</a> | <a href="/privacy">Privacy Policy</a> | <a href="/contact">Contact Us</a>
  </footer>
</body>
</html>`;
}

function renderStatusHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>System Status - ${PLATFORM.name} Platform Health</title>
  <meta name="description" content="Check the current operational status of ${PLATFORM.name} platform services, API health, Trinity AI uptime, and scheduled maintenance windows.">
  <meta property="og:title" content="${PLATFORM.name} System Status">
  <meta property="og:description" content="Real-time status of ${PLATFORM.name} platform services, API health, and Trinity AI uptime.">
  <meta property="og:type" content="website">
${socialMeta({ path: '/status', ogTitle: '${PLATFORM.name} System Status', ogDescription: 'Real-time status of ${PLATFORM.name} platform services, API health, and Trinity AI uptime.' })}
</head>
<body>
  <header>
    <h1>${PLATFORM.name} Platform Status</h1>
    <nav>
      <a href="/">Home</a> |
      <a href="/support">Support</a> |
      <a href="/contact">Contact</a>
    </nav>
  </header>
  <main>
    <section>
      <h2>Current System Status</h2>
      <p>All systems are monitored 24/7. Visit the live status page for real-time service health information.</p>
    </section>
  </main>
  <footer>
    <a href="/terms">Terms of Service</a> | <a href="/privacy">Privacy Policy</a>
  </footer>
</body>
</html>`;
}

function renderCompareDeputyHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${PLATFORM.name} vs Deputy — Security Guard Workforce Management Comparison</title>
  <meta name="description" content="Compare ${PLATFORM.name} vs Deputy for security guard company workforce management. ${PLATFORM.name} includes Trinity AI, built-in payroll, 50-state compliance, and contract management that Deputy lacks.">
  <meta property="og:title" content="${PLATFORM.name} vs Deputy - Security Guard Management Software">
  <meta property="og:description" content="${PLATFORM.name} vs Deputy: AI-native scheduling, built-in payroll, and 50-state compliance vs basic scheduling. See why security companies choose ${PLATFORM.name}.">
  <meta property="og:type" content="website">
${socialMeta({ path: '/compare/deputy', ogTitle: '${PLATFORM.name} vs Deputy - Security Guard Management Software', ogDescription: '${PLATFORM.name} vs Deputy: AI-native scheduling, built-in payroll, and 50-state compliance vs basic scheduling.' })}
</head>
<body>
  <header>
    <h1>${PLATFORM.name} vs Deputy</h1>
    <nav>
      <a href="/compare">All Comparisons</a> |
      <a href="/features">Features</a> |
      <a href="/pricing">Pricing</a> |
      <a href="/register">Start Free Trial</a>
    </nav>
  </header>
  <main>
    <section>
      <h2>Why Security Companies Choose ${PLATFORM.name} Over Deputy</h2>
      <p>Deputy is a general-purpose scheduling tool. ${PLATFORM.name} is built exclusively for security guard companies with AI-native intelligence, compliance management, and industry-specific workflows.</p>
    </section>
    <section>
      <h3>Key Differences</h3>
      <ul>
        <li><strong>Trinity AI</strong> — ${PLATFORM.name} has a built-in AI COO. Deputy has no AI assistant.</li>
        <li><strong>Payroll automation</strong> — ${PLATFORM.name} integrates directly. Deputy requires expensive add-ons.</li>
        <li><strong>50-state compliance</strong> — ${PLATFORM.name} tracks guard licenses and certifications. Deputy has no compliance module.</li>
        <li><strong>Security-specific workflows</strong> — Incident reporting, post orders, CAD integration, patrol management built in.</li>
        <li><strong>Contract management</strong> — ${PLATFORM.name} manages client contracts end-to-end. Deputy has none.</li>
      </ul>
    </section>
  </main>
  <footer>
    <a href="/terms">Terms of Service</a> | <a href="/privacy">Privacy Policy</a> | <a href="/contact">Contact Us</a>
  </footer>
</body>
</html>`;
}

function renderCompareWhenIWorkHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${PLATFORM.name} vs When I Work — Security Guard Management Software Comparison</title>
  <meta name="description" content="Compare ${PLATFORM.name} vs When I Work for security guard workforce management. ${PLATFORM.name} adds Trinity AI intelligence, built-in payroll, 50-state compliance, incident management, and security-specific workflows.">
  <meta property="og:title" content="${PLATFORM.name} vs When I Work - Security Guard Management Comparison">
  <meta property="og:description" content="${PLATFORM.name} vs When I Work: AI-native scheduling built for security companies vs general-purpose scheduling. See the full feature comparison.">
  <meta property="og:type" content="website">
${socialMeta({ path: '/compare/wheniwork', ogTitle: '${PLATFORM.name} vs When I Work - Security Guard Management Comparison', ogDescription: '${PLATFORM.name} vs When I Work: AI-native scheduling built for security companies vs general-purpose scheduling.' })}
</head>
<body>
  <header>
    <h1>${PLATFORM.name} vs When I Work</h1>
    <nav>
      <a href="/compare">All Comparisons</a> |
      <a href="/features">Features</a> |
      <a href="/pricing">Pricing</a> |
      <a href="/register">Start Free Trial</a>
    </nav>
  </header>
  <main>
    <section>
      <h2>Built for Security. Not Built for Everyone.</h2>
      <p>When I Work is a general scheduling tool for retail and hospitality. ${PLATFORM.name} is built exclusively for security guard companies with industry-specific compliance, incident management, and Trinity AI intelligence.</p>
    </section>
    <section>
      <h3>${PLATFORM.name} Advantages Over When I Work</h3>
      <ul>
        <li><strong>Trinity AI</strong> — Natural language COO intelligence built in. When I Work has no AI.</li>
        <li><strong>Security compliance</strong> — Guard license tracking, certification management, PERC card monitoring. When I Work has no compliance module.</li>
        <li><strong>Incident reporting</strong> — Full RMS with incident filing, escalation, and client notification. When I Work has none.</li>
        <li><strong>Payroll automation</strong> — QuickBooks, ADP, Gusto integration built in. When I Work requires upgrades.</li>
        <li><strong>GPS geofencing</strong> — Job site-specific clock-in verification. When I Work has basic location only.</li>
        <li><strong>Contract &amp; billing</strong> — Client contracts, invoicing, and collections built in. When I Work has none.</li>
      </ul>
    </section>
  </main>
  <footer>
    <a href="/terms">Terms of Service</a> | <a href="/privacy">Privacy Policy</a> | <a href="/contact">Contact Us</a>
  </footer>
</body>
</html>`;
}

function renderCompareTrackforceHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${PLATFORM.name} vs Trackforce — Security Guard Management Software Comparison</title>
  <meta name="description" content="Compare ${PLATFORM.name} vs Trackforce Valiant for security guard workforce management. ${PLATFORM.name} adds Trinity AI intelligence, AI scheduling, payroll automation, and modern mobile-first design.">
  <meta property="og:title" content="${PLATFORM.name} vs Trackforce - Security Guard Management Comparison">
  <meta property="og:description" content="${PLATFORM.name} vs Trackforce: Modern AI-powered workforce management vs legacy guard management software. See the full comparison.">
  <meta property="og:type" content="website">
${socialMeta({ path: '/compare/trackforce', ogTitle: '${PLATFORM.name} vs Trackforce - Security Guard Management Comparison', ogDescription: '${PLATFORM.name} vs Trackforce: Modern AI-powered workforce management vs legacy guard management software.' })}
</head>
<body>
  <header>
    <h1>${PLATFORM.name} vs Trackforce Valiant</h1>
    <nav>
      <a href="/compare">All Comparisons</a> |
      <a href="/features">Features</a> |
      <a href="/pricing">Pricing</a> |
      <a href="/register">Start Free Trial</a>
    </nav>
  </header>
  <main>
    <section>
      <h2>Modern AI vs Legacy Guard Management</h2>
      <p>Trackforce Valiant is legacy guard management software. ${PLATFORM.name} is a modern, AI-native platform built to replace multiple tools with one intelligent system.</p>
    </section>
    <section>
      <h3>${PLATFORM.name} Advantages</h3>
      <ul>
        <li><strong>Trinity AI</strong> — Natural language AI COO built in. Trackforce has no AI.</li>
        <li><strong>Modern mobile-first</strong> — Clean mobile app for officers. Trackforce has dated UX.</li>
        <li><strong>Auto-payroll integration</strong> — Seamless QuickBooks, ADP, Gusto sync. Trackforce requires manual export.</li>
        <li><strong>All-in-one pricing</strong> — Flat per-employee pricing. Trackforce has complex module-based licensing.</li>
        <li><strong>Real-time analytics</strong> — Live dashboards, profitability by client. Trackforce reporting is limited.</li>
      </ul>
    </section>
  </main>
  <footer>
    <a href="/terms">Terms of Service</a> | <a href="/privacy">Privacy Policy</a> | <a href="/contact">Contact Us</a>
  </footer>
</body>
</html>`;
}

const PRERENDERED_PAGES: Record<string, () => string> = {
  '/': renderHomepageHTML,
  '/features': renderFeaturesHTML,
  '/trinity-features': renderTrinityFeaturesHTML,
  '/pricing': renderPricingHTML,
  '/compare': renderCompareHTML,
  '/compare/deputy': renderCompareDeputyHTML,
  '/compare/wheniwork': renderCompareWhenIWorkHTML,
  '/compare/trackforce': renderCompareTrackforceHTML,
  '/roi-calculator': renderROICalculatorHTML,
  '/login': renderLoginHTML,
  '/register': renderRegisterHTML,
  '/signup': renderRegisterHTML,
  '/contact': renderContactHTML,
  '/support': renderSupportHTML,
  '/status': renderStatusHTML,
  '/terms': renderTermsHTML,
  '/privacy': renderPrivacyHTML,
  '/sms-terms': renderSmsTermsHTML,
};

export function crawlerPrerenderMiddleware(req: Request, res: Response, next: NextFunction): void {
  const ua = req.headers['user-agent'] || '';

  if (!isBot(ua)) {
    return next();
  }

  const path = req.path.replace(/\/$/, '') || '/';
  const renderer = PRERENDERED_PAGES[path];

  if (!renderer) {
    return next();
  }

  log.info(`[CrawlerPrerender] Serving pre-rendered HTML for bot: ${ua.substring(0, 60)} on ${path}`);
  res.status(200).set({ 'Content-Type': 'text/html; charset=utf-8' }).send(renderer());
}
