// Netlify reads this policy from dist/_headers, including manual deployments.
import {securityHeaders} from '../src/security-policy.js';
export const NETLIFY_HEADERS = Object.freeze(securityHeaders());
export const netlifyHeadersFile = () => `# Generated policy for the static personal-use site.\n/*\n${Object.entries(NETLIFY_HEADERS).map(([key,value])=>`  ${key}: ${value}`).join('\n')}\n`;
