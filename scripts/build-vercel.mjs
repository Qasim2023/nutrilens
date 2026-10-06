import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {buildPages} from './build-pages.mjs';
import {checkPublicContent} from './check-public-content.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const tests = (await fs.readdir(path.join(root, 'tests'))).filter(name => name.endsWith('.test.mjs')).sort().map(name => path.join(root, 'tests', name));
if (!tests.length) throw new Error('No regression tests found. Refusing an unchecked deployment.');
const code = await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ['--test', ...tests], {cwd: root, stdio: 'inherit', windowsHide: true});
  child.once('error', reject);
  child.once('exit', code => resolve(code ?? 1));
});
if (code !== 0) {
  process.exitCode = code;
  console.error('Regression tests failed. No new Vercel deployment was generated.');
} else {
  const artifact = await buildPages({hostedRelay:true});
  const {checked} = await checkPublicContent(artifact);
  console.log(`Vercel static build ready (${artifact.files.length} allowlisted files; ${checked} first-party privacy checks).`);
  console.log('Browser assets contain no credentials or personal data. Vercel separately deploys the provider-restricted api/wikivibe.js function.');
}
