import fs from 'fs';

function extractRouteBlocks(source) {
  const blocks = [];
  const routeRegex = /^router\.(get|post|put|patch|delete)\("([^"]+)"/;
  const lines = source.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(routeRegex);
    if (!match) continue;
    
    const method = match[1];
    const path = match[2];
    const startLine = i;
    
    let braceCount = 0;
    let endLine = i;
    let started = false;
    
    for (let j = i; j < lines.length; j++) {
      for (const ch of lines[j]) {
        if (ch === '{') { braceCount++; started = true; }
        if (ch === '}') braceCount--;
      }
      if (started && braceCount === 0) {
        endLine = j;
        break;
      }
    }
    
    // Include the closing ");
    if (endLine + 1 < lines.length && lines[endLine + 1].trim() === '});') {
      endLine++;
    } else if (lines[endLine].trim().endsWith('});')) {
      // already included
    }
    
    blocks.push({
      method,
      path,
      startLine,
      endLine,
      code: lines.slice(startLine, endLine + 1).join('\n'),
    });
    
    i = endLine;
  }
  
  return blocks;
}

function getPrefix(path) {
  const parts = path.split('/').filter(Boolean);
  if (parts.length >= 1) return '/' + parts[0];
  return path;
}

// Read source files
const hrSource = fs.readFileSync('server/routes/hrInlineRoutes.ts', 'utf8');
const govSource = fs.readFileSync('server/routes/governanceInlineRoutes.ts', 'utf8');
const contentSource = fs.readFileSync('server/routes/contentInlineRoutes.ts', 'utf8');

const hrBlocks = extractRouteBlocks(hrSource);
const govBlocks = extractRouteBlocks(govSource);
const contentBlocks = extractRouteBlocks(contentSource);

console.log('=== HR Inline Routes ===');
hrBlocks.forEach(b => console.log(`  ${b.method.toUpperCase()} ${b.path} (lines ${b.startLine+1}-${b.endLine+1})`));

console.log('\n=== Governance Inline Routes ===');
govBlocks.forEach(b => console.log(`  ${b.method.toUpperCase()} ${b.path} (lines ${b.startLine+1}-${b.endLine+1})`));

console.log('\n=== Content Inline Routes ===');
contentBlocks.forEach(b => console.log(`  ${b.method.toUpperCase()} ${b.path} (lines ${b.startLine+1}-${b.endLine+1})`));

// Group by target file
const targetGroups = {
  'terminationRoutes': { prefixes: ['/terminations'], source: 'hr' },
  'leaderRoutes': { prefixes: ['/leaders'], source: 'hr' },
  'policyComplianceRoutes': { prefixes: ['/policies', '/compliance-reports', '/compliance'], source: 'gov' },
  'auditRoutes': { prefixes: ['/platform-audit', '/oversight', '/dm-audit'], source: 'gov' },
  'formRoutes': { prefixes: ['/custom-forms', '/custom-form-submissions', '/form-submissions', '/form-templates'], source: 'content' },
  'reviewRoutes_additions': { prefixes: ['/report-templates', '/report-submissions'], source: 'content' },
};

for (const [name, config] of Object.entries(targetGroups)) {
  const allBlocks = config.source === 'hr' ? hrBlocks : config.source === 'gov' ? govBlocks : contentBlocks;
  const matched = allBlocks.filter(b => config.prefixes.some(p => b.path.startsWith(p)));
  console.log(`\n${name}: ${matched.length} routes`);
  matched.forEach(b => console.log(`  ${b.method.toUpperCase()} ${b.path}`));
}
