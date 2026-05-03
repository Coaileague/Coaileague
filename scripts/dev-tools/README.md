# CoAIleague Dev Tools

Internal development and analysis utilities — NOT imported by production code.

## Files

- **codebaseAwareness.ts** — Static codebase analysis and meta-awareness engine
- **e2eCrawlRunner.ts** — End-to-end crawl/audit runner for schema and route analysis
- **stubFileScaffolder.ts** — Code scaffolding utility for generating new service stubs

## Usage

These files are Node.js scripts, not Express services. Run them directly:

```bash
npx ts-node scripts/dev-tools/codebaseAwareness.ts
```

Do NOT import these in server/ — they are dev-only tools.
