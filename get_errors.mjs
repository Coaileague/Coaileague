import { Project, DiagnosticCategory } from 'ts-morph';
import { writeFileSync } from 'fs';

const project = new Project({
  tsConfigFilePath: './tsconfig.json',
  skipAddingFilesFromTsConfig: true,
});

project.addSourceFilesFromTsConfig('./tsconfig.json');
console.log('Files loaded:', project.getSourceFiles().length);

const diagnostics = project.getPreEmitDiagnostics();
const errors = diagnostics.filter(d => d.getCategory() === DiagnosticCategory.Error);
console.log(`Total errors: ${errors.length}`);

const byCode = {};
const byFile = {};
for (const d of errors) {
  const code = String(d.getCode());
  byCode[code] = (byCode[code] || 0) + 1;
  const sf = d.getSourceFile();
  const file = sf ? sf.getFilePath().replace(process.cwd() + '/', '') : 'unknown';
  if (!byFile[file]) byFile[file] = [];
  byFile[file].push({ code, line: d.getStart()?.getLineNumber?.() || 0, msg: d.getMessageText().toString().slice(0, 120) });
}

console.log('\nTop codes:');
Object.entries(byCode).sort((a,b)=>b[1]-a[1]).slice(0,15).forEach(([c,n])=>console.log(`  TS${c}: ${n}`));
console.log('\nTop files:');
Object.entries(byFile).sort((a,b)=>b[1].length-a[1].length).slice(0,20).forEach(([f,e])=>console.log(`  ${e.length}  ${f}`));

writeFileSync('/tmp/ts_errors.json', JSON.stringify({byCode, byFile}, null, 2));
console.log('\nSaved to /tmp/ts_errors.json');
