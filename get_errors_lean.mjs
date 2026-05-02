// Memory-lean version: process files in batches, don't keep all diagnostics in memory
import { Project, DiagnosticCategory } from 'ts-morph';
import { writeFileSync } from 'fs';

// Only load server files first (not client - client uses Vite which handles differently)
const project = new Project({
  compilerOptions: {
    target: 'ES2020',
    module: 'ESNext',
    moduleResolution: 'bundler',
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    jsx: 'preserve',
    esModuleInterop: true,
    baseUrl: '.',
    ignoreDeprecations: '6.0',
    paths: { '@/*': ['./client/src/*'], '@shared/*': ['./shared/*'] },
    typeRoots: ['./node_modules/@types', './server/types'],
  },
  skipAddingFilesFromTsConfig: true,
});

// Add only server files + shared
project.addSourceFilesAtPaths([
  'server/**/*.ts',
  'shared/**/*.ts',
]);

const files = project.getSourceFiles();
console.log(`Analyzing ${files.length} server+shared files...`);

const byCode = {};
const byFile = {};
let total = 0;

// Get diagnostics per file to avoid memory issues
for (const sf of files) {
  const diags = sf.getPreEmitDiagnostics().filter(d => d.getCategory() === DiagnosticCategory.Error);
  if (diags.length === 0) continue;
  
  const relPath = sf.getFilePath().replace(process.cwd() + '/', '');
  byFile[relPath] = [];
  
  for (const d of diags) {
    const code = String(d.getCode());
    byCode[code] = (byCode[code] || 0) + 1;
    byFile[relPath].push({ code, line: d.getStartLineNumber?.() || 0, msg: d.getMessageText().toString().slice(0, 100) });
    total++;
  }
  
  // Free memory
  sf.forget?.();
}

console.log(`\nTotal server errors: ${total}`);
console.log('\nTop codes:');
Object.entries(byCode).sort((a,b)=>b[1]-a[1]).slice(0,15).forEach(([c,n])=>console.log(`  TS${c}: ${n}`));
console.log('\nTop files (>10 errors):');
Object.entries(byFile).filter(([,e])=>e.length>10).sort((a,b)=>b[1].length-a[1].length).slice(0,20).forEach(([f,e])=>console.log(`  ${e.length}  ${f.split('/').pop()}`));

writeFileSync('/tmp/ts_errors_server.json', JSON.stringify({total, byCode, byFile}, null, 2));
console.log('\nSaved /tmp/ts_errors_server.json');
