# CoAIleague Diagnostics Runner

Automated E2E testing and site auditing tool that crawls the live site, tests user workflows, and generates detailed reports.

## Features

- **Crawl Mode**: Visits up to 300 pages, capturing screenshots and detecting:
  - Console errors
  - Network failures (4xx/5xx)
  - Broken images
  - UI error text patterns
  
- **Workflow Mode**: Tests critical user flows:
  - Login
  - Page navigation
  - Form submissions
  
- **CAPTCHA Handling**: Detects and gracefully skips CAPTCHA-blocked pages (never hangs)

- **Report Generation**:
  - HTML report (shareable)
  - `summary.json` for agent parsing
  - Screenshots, traces, and logs

## Quick Start

```bash
# Run full diagnostics (crawl + workflows)
npx tsx diagnostics-runner/index.ts full

# Run crawl mode only (visit pages)
npx tsx diagnostics-runner/index.ts crawl

# Run workflow tests only
npx tsx diagnostics-runner/index.ts workflows

# Run CORE features mode (payroll, scheduling, invoicing, time tracking)
npx tsx diagnostics-runner/index.ts core

# Nightly run with extended settings
MAX_PAGES=300 ENABLE_TRACE=true npx tsx diagnostics-runner/index.ts full
```

## Environment Variables

**Required for running on Replit:**
```bash
# Set before running (required in Replit environment)
export PLAYWRIGHT_BROWSERS_PATH=/tmp/pw-browsers

# One-time setup: Install Playwright browsers
PLAYWRIGHT_BROWSERS_PATH=/tmp/pw-browsers npx playwright install chromium
```

Set these in Replit Secrets:

| Variable | Description | Default |
|----------|-------------|---------|
| `DIAG_BASE_URL` | URL to test | `https://coaileague.com` |
| `TEST_USERNAME` | Login email for workflow tests | - |
| `TEST_PASSWORD` | Login password for workflow tests | - |
| `MAX_PAGES` | Max pages to crawl | `300` |
| `ENABLE_VIDEO` | Record video of tests | `false` |
| `ENABLE_TRACE` | Save Playwright traces | `false` |
| `ENABLE_SCREENSHOTS` | Capture screenshots | `true` |
| `DIAG_BYPASS_CAPTCHA` | Send bypass header | `false` |
| `GEMINI_API_KEY` | For Trinity AI-powered analysis | - |

### CAPTCHA Bypass (Secure)

For authenticated testing, you can bypass CAPTCHA with dual verification:

1. Set `DIAG_BYPASS_CAPTCHA=true` in the runner environment
2. Set `DIAG_BYPASS_CAPTCHA=true` on the server (Replit Secrets)
3. Server validates both the env var AND the `X-Diagnostics-Runner: trinity-diagnostics-agent` header

This is secure because both conditions must be true for bypass to work.

### Trinity AI Analysis

When `GEMINI_API_KEY` is available, the runner provides AI-powered analysis:

- **Root cause identification** for each issue
- **Fix recommendations** with file paths
- **Effort estimation** (trivial/easy/medium/complex)  
- **Platform health score** (0-100%)
- **Critical path** for fastest resolution

Output files:
- `trinity_analysis.json` - Prioritized fixes with AI recommendations
- `trinity_thoughts.json` - Trinity's metacognition pipeline log

## Output Structure

```
diagnostics-runner/output/
├── latest -> run_20260113_123456_abc123/  (symlink)
└── run_20260113_123456_abc123/
    ├── report.html          # HTML report
    ├── summary.json         # Machine-readable summary
    ├── screenshots/         # Page screenshots
    ├── traces/              # Playwright traces (if enabled)
    ├── videos/              # Test videos (if enabled)
    ├── logs/                # Console/network logs
    └── html_snapshots/      # HTML captures on CAPTCHA/errors
```

## Agent Integration

In future sessions, tell the agent:

> "Fix report issues"

The agent will:
1. Read `/diagnostics-runner/output/latest/summary.json`
2. Parse the issues list
3. Fix issues in priority order (critical → high → medium → low)

## Customizing Workflows

Edit `workflows.json` to add custom test flows:

```json
[
  {
    "name": "Custom Flow",
    "description": "Test something specific",
    "steps": [
      { "action": "goto", "url": "${BASE_URL}/page" },
      { "action": "click", "selector": "button.action" },
      { "action": "assertVisible", "selector": ".success-message" }
    ]
  }
]
```

### Available Actions

| Action | Parameters | Description |
|--------|------------|-------------|
| `goto` | `url` | Navigate to URL |
| `click` | `selector` | Click element |
| `fill` | `selector`, `value` | Type into input |
| `waitForURL` | `url` | Wait for URL match |
| `waitForSelector` | `selector` | Wait for element |
| `assertVisible` | `selector` | Assert element visible |
| `assertText` | `selector`, `text` | Assert text content |
| `select` | `selector`, `value` | Select dropdown option |
| `upload` | `selector`, `value` | Upload file |
| `screenshot` | `description` | Capture screenshot |

## Safety Features

The runner will **never click** elements containing:
- delete, remove, logout, unsubscribe
- cancel, destroy, pay, confirm payment

## Scheduling Nightly Runs

For automated nightly diagnostics:

1. Use a cron job or scheduled task
2. Run `npm run diag:nightly`
3. Reports accumulate in `output/` directory

## Troubleshooting

### Runner hangs
- CAPTCHA detection should prevent hangs
- Check if a new CAPTCHA type was added
- Increase `PAGE_TIMEOUT` if pages are slow

### No screenshots
- Ensure `ENABLE_SCREENSHOTS=true`
- Check disk space in Replit

### Login workflow fails
- Verify `TEST_USERNAME` and `TEST_PASSWORD` are set
- Check if login page structure changed
- Update selectors in `workflows.json`
