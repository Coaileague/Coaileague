#!/usr/bin/env python3
"""
CoAIleague — Client Deletion Verification Script
Run BEFORE committing any client file deletion.
Catches the 5 failure patterns from Phase 3 cleanup.

Usage: python3 scripts/verify-client-deletions.py
Must print "✅ All checks passed" before any commit touching client/src.
"""
import re, os, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLIENT = os.path.join(ROOT, 'client/src')
ESBUILD = os.path.join(ROOT, 'node_modules/.bin/esbuild')

errors = []

def check(label, msg):
    errors.append(f"[{label}] {msg}")

def scan():
    all_files = []
    for root, dirs, files in os.walk(CLIENT):
        dirs[:] = [d for d in dirs if d != 'node_modules']
        for f in files:
            if f.endswith(('.ts', '.tsx')):
                all_files.append(os.path.join(root, f))

    print(f"Scanning {len(all_files)} client files...")

    for fpath in all_files:
        content = open(fpath).read()
        short = fpath.replace(ROOT + '/', '')
        dirname = os.path.dirname(fpath)

        # ── PATTERN 1: Broken static imports (from './X') ───────────────────
        for m in re.finditer(r"\bfrom\s+['\"](\.[^'\"]+)['\"]", content):
            imp = m.group(1)
            resolved = os.path.normpath(os.path.join(dirname, imp))
            exists = any(os.path.exists(resolved + ext) for ext in
                         ['', '.ts', '.tsx', '/index.ts', '/index.tsx'])
            if not exists:
                check("STATIC IMPORT", f"{short}\n    missing: {imp}")

        # ── PATTERN 2: Broken dynamic imports (import('./X')) ────────────────
        for m in re.finditer(r"import\(['\"](\.[^'\"]+)['\"]\)", content):
            imp = m.group(1)
            resolved = os.path.normpath(os.path.join(dirname, imp))
            exists = any(os.path.exists(resolved + ext) for ext in
                         ['', '.ts', '.tsx', '/index.ts', '/index.tsx'])
            if not exists:
                check("DYNAMIC IMPORT", f"{short}\n    missing: {imp}")

        # ── PATTERN 3: Barrel re-exports pointing at deleted files ───────────
        if os.path.basename(fpath) in ('index.ts', 'index.tsx'):
            for m in re.finditer(r"(?:export\s+(?:\*|\{[^}]+\})\s+from|export\s+\{[^}]+\}\s+from)\s+['\"](\./[^'\"]+)['\"]", content):
                imp = m.group(1)
                resolved = os.path.normpath(os.path.join(dirname, imp))
                exists = any(os.path.exists(resolved + ext) for ext in
                             ['', '.ts', '.tsx'])
                if not exists:
                    check("BARREL EXPORT", f"{short}\n    missing: {imp}")

        # ── PATTERN 4: Named import from @/components barrel, name not exported
        for m in re.finditer(
            r"import\s+\{([^}]+)\}\s+from\s+['\"](@/components/\w+)['\"]",
            content
        ):
            named_block = m.group(1)
            barrel_alias = m.group(2)  # e.g. @/components/trinity
            
            # Resolve barrel to index file
            barrel_path = barrel_alias.replace('@', CLIENT + '/..').replace('/src/..', '')
            barrel_path = os.path.normpath(barrel_path)
            
            index_file = None
            for ext in ['/index.ts', '/index.tsx', '.ts', '.tsx']:
                candidate = barrel_path + ext
                if os.path.exists(candidate):
                    index_file = candidate
                    break
            
            if not index_file:
                continue
                
            barrel_content = open(index_file).read()
            
            for name in named_block.split(','):
                name = name.strip()
                if not name or name.startswith('//') or name.startswith('type '):
                    continue
                # Strip 'as X' aliases
                name = name.split(' as ')[0].strip()
                if not name:
                    continue
                # Check name is exported from the barrel
                if name not in barrel_content:
                    check("BARREL NAMED EXPORT",
                          f"{short}\n    '{name}' not exported by {index_file.replace(ROOT+'/','')}")

        # ── PATTERN 5: Orphaned JSX — <Component used but not imported ───────
        # Only check actual JSX render context (not TS generics)
        # JSX tag = <ComponentName followed by space, /, or newline (not < for generics)
        jsx_tags = set(re.findall(r'<([A-Z][A-Za-z0-9]+)(?:\s|/|>|\n)', content))
        
        # All names available in this file
        imported_names = set()
        # Named imports
        for m in re.finditer(r'import\s+\{([^}]+)\}', content):
            for n in m.group(1).split(','):
                n = n.strip().split(' as ')[-1].strip()
                if n: imported_names.add(n)
        # Default imports
        for m in re.finditer(r'import\s+([A-Z]\w+)\s+from', content):
            imported_names.add(m.group(1))
        # Local definitions (const X = ..., function X, class X)
        for m in re.finditer(r'(?:^|\n)\s*(?:export\s+)?(?:const|function|class)\s+([A-Z]\w+)', content):
            imported_names.add(m.group(1))
        # Namespace imports (import * as X)
        for m in re.finditer(r'import\s+\*\s+as\s+(\w+)', content):
            imported_names.add(m.group(1))

        # Known React built-ins to skip
        skip = {'React', 'Fragment', 'Suspense', 'StrictMode', 'Component',
                'PureComponent', 'ErrorBoundary', 'Provider', 'Consumer'}

        for tag in jsx_tags:
            if tag in skip or tag in imported_names:
                continue
            # Must look like actual JSX use — check it appears as <Tag (not as type param)
            # Verify the tag appears after = or ( or { or newline — typical JSX positions
            jsx_pattern = r'(?:return|=>|\(|\{|\n)\s*(?:.*\n\s*)?<' + re.escape(tag) + r'[\s/>]'
            if re.search(jsx_pattern, content):
                check("ORPHANED JSX",
                      f"{short}\n    <{tag}> used in JSX but not imported")

    # ── esbuild syntax check ─────────────────────────────────────────────────
    print(f"Running esbuild syntax check on all {len(all_files)} files...")
    syntax_errors = 0
    for fpath in all_files:
        r = subprocess.run(
            [ESBUILD, fpath, '--bundle=false'],
            capture_output=True, text=True, cwd=ROOT
        )
        if r.returncode != 0:
            out = r.stdout + r.stderr
            errs = [l.strip() for l in out.split('\n')
                    if '✘' in l or (':' in l and 'ERROR' in l.upper())]
            errs = [e for e in errs if e and 'string' not in e.lower()[:10]]
            if errs:
                short = fpath.replace(ROOT + '/', '')
                check("SYNTAX", f"{short}\n    " + '\n    '.join(errs[:2]))
                syntax_errors += 1

if __name__ == '__main__':
    print("=" * 60)
    print("CoAIleague — Client Deletion Verification")
    print("=" * 60 + "\n")
    scan()

    # Deduplicate
    seen = set()
    unique = [e for e in errors if e not in seen and not seen.add(e)]

    if unique:
        print(f"❌ {len(unique)} issue(s) found:\n")
        for e in unique:
            print(f"  {e}\n")
        print(f"Fix all issues before committing.\n")
        sys.exit(1)
    else:
        print(f"✅ All checks passed — safe to commit\n")
        sys.exit(0)
