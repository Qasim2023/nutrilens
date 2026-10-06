// Defence in depth for first-party published files. This is not a substitute
// for reviewing staged source or rotating a credential that was ever exposed.
import fs from 'node:fs/promises';
import path from 'node:path';

export function publicContentIssues(text) {
  const rules = [
    ['credential-shaped token', /(?:sk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16})/],
    ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
    ['embedded API credential', /["']?(?:apiKey|extraHeaders)["']?\s*:\s*["'][^"'\r\n]+["']/],
    ['personal filesystem path', /(?:[A-Za-z]:[\\/]|\/)(?:Users|home)[\\/][^\s"'<>\\/]+/i],
  ];
  return rules.filter(([,pattern]) => pattern.test(text)).map(([label]) => label);
}

export async function checkPublicContent({output, files}) {
  const findings = [];
  for (const file of files) {
    // Dependency assets are copied from pinned packages, not personal files.
    if (file.startsWith('vendor/') || !/\.(?:js|css|html|svg|webmanifest)$/.test(file)) continue;
    const text = await fs.readFile(path.join(output, ...file.split('/')), 'utf8');
    for (const issue of publicContentIssues(text)) findings.push(`${file}: ${issue}`);
  }
  if (findings.length) throw new Error('Public-content privacy check failed (values redacted):\n' + findings.join('\n'));
  return {checked: files.filter(file => !file.startsWith('vendor/') && /\.(?:js|css|html|svg|webmanifest)$/.test(file)).length};
}
