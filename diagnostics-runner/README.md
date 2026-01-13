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
| `DIAG_BASE_URL` | URL to test | `https://coaileague.replit.app` |
| `TEST_USERNAME` | Login email for workflow tests | - |
| `TEST_PASSWORD` | Login password for workflow tests | - |
| `MAX_PAGES` | Max pages to crawl | `300` |
| `ENABLE_VIDEO` | Record video of tests | `false` |
| `ENABLE_TRACE` | Save Playwright traces | `false` |
| `ENABLE_SCREENSHOTS` | Capture screenshots | `true` |
| `DIAG_BYPASS_CAPTCHA` | Send bypass header | `false` |

### CAPTCHA Bypass (Optional)

For testing environments, you can bypass CAPTCHA:

1. Set `DIAG_BYPASS_CAPTCHA=true` in the runner
2. Set `ENABLE_DIAG_BYPASS=true` on the server
3. Server checks for `X-Diagnostics-Runner: true` header

**Never enable bypass in production!**

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
