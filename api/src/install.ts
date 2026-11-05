// Install Piston packages by landing-page id: node dist/install.js python cpp | all
import { LANGUAGES, byId } from './languages.js';
import { compareVersions, install, packages } from './piston.js';

const args = process.argv.slice(2);
if (!args.length) {
  console.log(`Usage: languages.sh <id...> | all\nIds: ${LANGUAGES.map(l => l.id).join(' ')}`);
  process.exit(1);
}

const unknown = args.filter(a => a !== 'all' && !byId.has(a));
if (unknown.length) {
  console.error(`Unknown language: ${unknown.join(', ')}`);
  process.exit(1);
}

const ids = args.includes('all') ? LANGUAGES.map(l => l.id) : args;
// Browser-only languages (pkg '') need nothing, and custom packages are built by
// scripts/languages.sh with piston-packages/.
const pkgNames = [...new Set(ids.map(id => byId.get(id)!.pkg).filter(pkg => pkg && !pkg.startsWith('custom:')))];
const available = await packages();
let failed = 0;

for (const name of pkgNames) {
  const versions = available.filter(p => p.language === name).sort((a, b) => compareVersions(a.language_version, b.language_version));
  const latest = versions[0];
  if (!latest) { console.error(`✗ ${name}: not in the Piston repository`); failed++; continue; }
  if (latest.installed) { console.log(`✓ ${name} ${latest.language_version} already installed`); continue; }
  process.stdout.write(`… ${name} ${latest.language_version} installing\n`);
  try {
    await install(name, latest.language_version);
    console.log(`✓ ${name} ${latest.language_version} installed`);
  } catch (e) {
    console.error(`✗ ${name}: ${(e as Error).message}`);
    failed++;
  }
}

process.exit(failed ? 1 : 0);
