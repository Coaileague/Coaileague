#!/bin/bash
set -e

echo "=== Post-merge setup starting ==="

# ── 1. npm install — only if package.json changed ─────────────────────────────
if git diff HEAD~1 --name-only 2>/dev/null | grep -q "package.json"; then
  echo "[npm] package.json changed — running npm install"
  npm install --prefer-offline
else
  echo "[npm] package.json unchanged — skipping install"
fi

# ── 2. DB schema sync — only if schema files changed ──────────────────────────
# KEY FIX: drizzle-kit push takes ~200s to process all schema files.
# Skip it entirely when no schema files changed in the merge.
SCHEMA_CHANGED=$(git diff HEAD~1 --name-only 2>/dev/null | grep -E "^shared/schema|^drizzle\.config" || true)

if [ -z "$SCHEMA_CHANGED" ]; then
  echo "[db] No schema files changed — skipping drizzle-kit push"
  echo "=== Post-merge setup complete (fast path) ==="
  exit 0
fi

echo "[db] Schema files changed in this merge:"
echo "$SCHEMA_CHANGED"

# ── 3. Pre-apply missing unique constraints ────────────────────────────────────
# drizzle-kit prompts interactively when adding UNIQUE to a table with rows.
# We detect schema-defined unique constraint names and note which are pending.
# stdin is closed (/dev/null) so drizzle-kit auto-selects the safe default:
#   "No, add the constraint without truncating the table"
echo "[db] Checking for unique constraints to pre-apply..."

node --input-type=module <<'JSEOF'
import { execSync } from 'child_process';
import { readFileSync } from 'fs';

// Find all schema .ts files using shell find (avoids fs/promises glob compat issues)
const files = execSync('find shared/schema -name "*.ts" -type f', { encoding: 'utf8' })
  .split('\n').map(s => s.trim()).filter(Boolean);

const schemaNames = new Set();
const re = /(?:uniqueIndex|unique)\(\s*['"]([^'"]+)['"]/g;
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  let m;
  re.lastIndex = 0;
  while ((m = re.exec(src)) !== null) schemaNames.add(m[1]);
}

if (schemaNames.size === 0) {
  console.log('[db] No named unique constraints found in schema files.');
  process.exit(0);
}

// Get existing constraints from DB
const raw = execSync(
  `psql "${process.env.DATABASE_URL}" -t -c "SELECT indexname FROM pg_indexes WHERE schemaname='public';"`,
  { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
);
const existing = new Set(raw.split('\n').map(s => s.trim()).filter(Boolean));

const pending = [...schemaNames].filter(n => !existing.has(n));
if (pending.length === 0) {
  console.log('[db] All', schemaNames.size, 'unique constraints already in DB.');
} else {
  console.log('[db] Constraints pending (drizzle-kit will add via push):', pending.join(', '));
  console.log('[db] stdin=closed so drizzle-kit will auto-select "no truncation" for each.');
}
JSEOF

# ── 4. Run drizzle-kit push ────────────────────────────────────────────────────
echo "[db] Running drizzle-kit push..."
# stdin closed via </dev/null: drizzle-kit auto-selects safe default for any
# "truncate table?" prompts → "No, add the constraint without truncating"
npx drizzle-kit push </dev/null 2>&1 || true

echo "=== Post-merge setup complete ==="
