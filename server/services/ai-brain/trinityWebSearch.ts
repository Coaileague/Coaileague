/**
 * Trinity Web Search — Live Knowledge Retrieval
 * ─────────────────────────────────────────────────────────────────────────────
 * Gives Trinity the ability to search the web and fetch specific pages when
 * her training data is outdated or incomplete.
 *
 * THREE TIERS (no Puppeteer/Chromium needed — pure HTTP):
 *
 *   Tier 1 — Gemini Google Search Grounding (FREE, already in your API key)
 *     Enabled per-call via the `tools: [{googleSearch:{}}]` flag on Gemini.
 *     Gemini searches Google automatically and cites sources in the response.
 *     Best for: "What is the current TX DPS renewal fee?" type questions.
 *
 *   Tier 2 — Direct URL Fetch (FREE, built-in Node fetch)
 *     Trinity reads a specific URL — regulatory agency pages, IRS publications,
 *     state law statutes — and extracts the text content.
 *     Best for: "Read the current Texas Occupations Code Chapter 1702."
 *
 *   Tier 3 — Search API (optional, ~$10/mo if Gemini grounding not enough)
 *     Serper.dev or Tavily — returns structured search results.
 *     Configured via SERPER_API_KEY or TAVILY_API_KEY env var.
 *     Only used if those keys are set; gracefully skips otherwise.
 *
 * WHAT THIS REPLACES:
 *   NOT Puppeteer — Puppeteer launched a full browser, downloaded 200MB
 *   of Chromium on every build. Web search is a 2KB HTTP call.
 */

import { createLogger } from '../../lib/logger';
const log = createLogger('TrinityWebSearch');

// ── Types ────────────────────────────────────────────────────────────────────

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source?: string;
}

export interface FetchResult {
  url: string;
  title: string;
  content: string;       // Plain text, HTML stripped
  wordCount: number;
  success: boolean;
  error?: string;
}

export interface WebSearchResult {
  query: string;
  results: SearchResult[];
  tier: 'gemini_grounding' | 'serper' | 'tavily' | 'fallback';
  citations?: string[];
}

// ── Tier 2: Direct URL Fetch ─────────────────────────────────────────────────

export async function fetchUrl(url: string, maxChars = 8000): Promise<FetchResult> {
  try {
    // Validate URL — only public HTTPS resources
    const parsed = new URL(url);
    if (!['https:', 'http:'].includes(parsed.protocol)) {
      return { url, title: '', content: '', wordCount: 0, success: false, error: 'Only HTTP/HTTPS URLs supported' };
    }

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'CoAIleague-Trinity/1.0 (AI assistant; regulatory research)',
        'Accept': 'text/html,text/plain,application/json',
      },
      signal: AbortSignal.timeout(10_000), // 10s timeout
    });

    if (!res.ok) {
      return { url, title: '', content: '', wordCount: 0, success: false, error: `HTTP ${res.status}` };
    }

    const contentType = res.headers.get('content-type') || '';
    let text = await res.text();

    // Strip HTML tags — extract readable text only
    if (contentType.includes('html')) {
      // Remove scripts, styles, nav elements
      text = text
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
        .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
        .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/\s{2,}/g, ' ')
        .trim();
    }

    // Extract title
    const titleMatch = text.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : parsed.hostname;

    // Truncate to maxChars
    const content = text.length > maxChars
      ? text.slice(0, maxChars) + `\n[Content truncated at ${maxChars} chars — ${text.length} total]`
      : text;

    return {
      url,
      title,
      content,
      wordCount: content.split(/\s+/).length,
      success: true,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn(`[TrinityWebSearch] fetchUrl failed for ${url}: ${msg}`);
    return { url, title: '', content: '', wordCount: 0, success: false, error: msg };
  }
}

// ── Tier 3: Optional Search API (Serper / Tavily) ────────────────────────────

async function searchSerper(query: string): Promise<SearchResult[]> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return [];

  try {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, num: 5, gl: 'us', hl: 'en' }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return [];
    const data = await res.json() as { organic?: Array<{title: string; link: string; snippet: string}> };
    return (data.organic || []).map(r => ({
      title: r.title || '',
      url: r.link || '',
      snippet: r.snippet || '',
      source: 'serper',
    }));
  } catch {
    return [];
  }
}

async function searchTavily(query: string): Promise<SearchResult[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return [];

  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: key, query, max_results: 5 }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return [];
    const data = await res.json() as { results?: Array<{title: string; url: string; content: string}> };
    return (data.results || []).map(r => ({
      title: r.title || '',
      url: r.url || '',
      snippet: r.content?.slice(0, 200) || '',
      source: 'tavily',
    }));
  } catch {
    return [];
  }
}

// ── Main search entry point ───────────────────────────────────────────────────

export async function trinitySearch(query: string): Promise<WebSearchResult> {
  log.info(`[TrinityWebSearch] Searching: "${query.slice(0, 80)}"`);

  // Try Serper first if configured
  if (process.env.SERPER_API_KEY) {
    const results = await searchSerper(query);
    if (results.length > 0) {
      return { query, results, tier: 'serper' };
    }
  }

  // Try Tavily if configured
  if (process.env.TAVILY_API_KEY) {
    const results = await searchTavily(query);
    if (results.length > 0) {
      return { query, results, tier: 'tavily' };
    }
  }

  // Fallback: structured empty response — Gemini grounding handles it inline
  log.info(`[TrinityWebSearch] No search API configured — Gemini grounding handles search inline`);
  return {
    query,
    results: [],
    tier: 'fallback',
    citations: [],
  };
}

// ── Gemini Grounding flag ─────────────────────────────────────────────────────
// Pass this as `tools` to getGenerativeModel() to enable live Google Search.
// Gemini automatically searches when it needs current information.

export const GEMINI_GOOGLE_SEARCH_TOOL = {
  googleSearch: {},
} as const;

// ── Knowledge gap detection ───────────────────────────────────────────────────
// Detects when a message is about something that might be outdated or missing
// so Trinity knows when to trigger a live search.

export function shouldSearchWeb(message: string): boolean {
  const searchTriggers = [
    // Regulatory / legal
    /current.*(?:law|regulation|statute|code|requirement|fee|rate)/i,
    /(?:latest|new|recent|updated|2024|2025|2026).*(?:rule|law|policy|requirement)/i,
    /(?:dps|tcole|bsis|flhsmv|nysdol).*(?:require|fee|renewal|process)/i,
    // Tax / financial rates
    /(?:current|latest).*(?:tax rate|sui rate|minimum wage|overtime threshold)/i,
    /(?:irs|fica|futa|suta).*(?:2024|2025|2026|current|rate)/i,
    // "I don't know" signals
    /(?:what is|what are|how do i|where can i find|look up)/i,
    /(?:not sure|unsure|don't know|confused about|unclear)/i,
    // Explicit search request
    /(?:search|look up|find out|check|verify|confirm).*(?:online|web|internet)/i,
  ];
  return searchTriggers.some(pattern => pattern.test(message));
}
