// Run tests with the same Node runtime before producing any new deployment files.
// No dependency on npm being on PATH (also supports the bundled desktop runtime).
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {buildPages} from './build-pages.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const tests=(await fs.readdir(path.join(root,'tests'))).filter(name=>name.endsWith('.test.mjs')).sort().map(name=>path.join(root,'tests',name));
if(!tests.length)throw new Error('No regression tests found. Refusing to build an unchecked deployment.');
const testCode=await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['--test',...tests],{cwd:root,stdio:'inherit',windowsHide:true});
  child.once('error',reject);child.once('exit',code=>resolve(code??1));
});
if(testCode!==0) {
  process.exitCode=testCode;
  console.error('Regression tests failed. No new Netlify deployment was generated.');
} else {
  const {output,files}=await buildPages();
  console.log(`Netlify static build: ${output} (${files.length} public files).`);
  console.log('No local server, account credentials, API keys, or browser meal data are bundled.');
  console.log('Set private visitor access in Netlify, then enter your personal provider settings in the app.');
}
