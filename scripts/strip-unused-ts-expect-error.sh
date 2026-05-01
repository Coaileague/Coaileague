#!/usr/bin/env bash
# Strip every @ts-expect-error directive that TypeScript flagged as unused
# in the tsc output below. Exits 0 even if no work is needed.
set -euo pipefail

LOG="${1:-sim_output/tsc-r4-sweep.log}"
[ -f "$LOG" ] || { echo "no tsc log at $LOG"; exit 1; }

# Group by file, descending line numbers so prior deletes don't shift later targets.
python3 - "$LOG" <<'PY'
import sys, re, collections

log = sys.argv[1]
pattern = re.compile(r"^([^(]+)\((\d+),\d+\): error TS2578: Unused '@ts-expect-error' directive\.")
buckets = collections.defaultdict(list)
with open(log) as fh:
    for line in fh:
        m = pattern.match(line)
        if m:
            path, lineno = m.group(1), int(m.group(2))
            buckets[path].append(lineno)

for path, lines in buckets.items():
    lines.sort(reverse=True)
    with open(path) as fh:
        src = fh.readlines()
    for ln in lines:
        idx = ln - 1
        if 0 <= idx < len(src) and '@ts-expect-error' in src[idx]:
            del src[idx]
    with open(path, 'w') as fh:
        fh.writelines(src)
    print(f"  {path}: stripped {len(lines)} unused directive(s)")
PY
