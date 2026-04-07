import fs from 'fs';

function removeLineRanges(source, ranges) {
  const lines = source.split('\n');
  const linesToRemove = new Set();
  
  for (const [start, end] of ranges) {
    for (let i = start - 1; i < end; i++) {
      linesToRemove.add(i);
    }
    if (end < lines.length && lines[end].trim() === '') {
      linesToRemove.add(end);
    }
  }
  
  return lines.filter((_, i) => !linesToRemove.has(i)).join('\n');
}

// === 1. Clean hrInlineRoutes.ts ===
// Remove: terminations (38-129), leaders (131-695)
let hrSource = fs.readFileSync('server/routes/hrInlineRoutes.ts', 'utf8');
hrSource = removeLineRanges(hrSource, [[38, 695]]);
fs.writeFileSync('server/routes/hrInlineRoutes.ts', hrSource);
console.log(`hrInlineRoutes.ts cleaned: ${hrSource.split('\n').length} lines remaining`);

// === 2. Clean governanceInlineRoutes.ts ===
// Remove: policies+compliance (22-308), oversight (397-603), dm-audit+platform-audit (727-969)
// After removing 22-308, lines shift. Need to use original line numbers.
let govSource = fs.readFileSync('server/routes/governanceInlineRoutes.ts', 'utf8');
govSource = removeLineRanges(govSource, [[22, 308], [397, 603], [727, 969]]);
fs.writeFileSync('server/routes/governanceInlineRoutes.ts', govSource);
console.log(`governanceInlineRoutes.ts cleaned: ${govSource.split('\n').length} lines remaining`);

// === 3. Clean contentInlineRoutes.ts ===
// Remove: report-templates (26-80), report-submissions (82-262), custom-forms+form stuff (399-846)
let contentSource = fs.readFileSync('server/routes/contentInlineRoutes.ts', 'utf8');
contentSource = removeLineRanges(contentSource, [[26, 262], [399, 846]]);
fs.writeFileSync('server/routes/contentInlineRoutes.ts', contentSource);
console.log(`contentInlineRoutes.ts cleaned: ${contentSource.split('\n').length} lines remaining`);

console.log('\nDone cleaning intermediate files.');
