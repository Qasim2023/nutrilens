import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { recipePdf, recipeDocx } from '../tests/recipe-fixtures.mjs';
const executable = path.resolve(process.argv[2] || 'release/win-unpacked/NutriLens.exe');
const artifacts = path.resolve('artifacts');
await fs.mkdir(artifacts, { recursive: true });
const profile = await fs.mkdtemp(path.join(artifacts, 'desktop-test-profile-'));
const env = { ...process.env,
  NUTRILENS_SMOKE_PROFILE: profile,
  NUTRILENS_SMOKE_REPORT: path.join(profile, 'report.json'),
  NUTRILENS_SMOKE_DOCUMENTS: JSON.stringify([
    { name: 'recipe.pdf', data: recipePdf().toString('base64') },
    { name: 'recipe.docx', data: recipeDocx().toString('base64') }
  ])
};
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(executable, ['--desktop-smoke-test'], { env, windowsHide: true });
let output = '';
child.stdout.on('data', data => { output += data; process.stdout.write(data); });
child.stderr.on('data', data => { output += data; process.stderr.write(data); });
const timer = setTimeout(() => child.kill(), 90000);
try {
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
  const report = JSON.parse(await fs.readFile(env.NUTRILENS_SMOKE_REPORT, 'utf8'));
  await fs.writeFile(path.join(artifacts, 'desktop-test.log'), output + '\n' + JSON.stringify(report, null, 2));
  if (code !== 0 || !report.result.booted || report.result.nodeExposed || !report.documents.includes('recipe.pdf') || !report.documents.includes('recipe.docx')) throw new Error(`Desktop test failed (exit ${code}). See artifacts/desktop-test.log.`);
  console.log('Packaged desktop test passed:', path.basename(executable));
} finally {
  clearTimeout(timer);
  // Only delete the unique profile created by this test, never normal app data.
  await fs.rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}


