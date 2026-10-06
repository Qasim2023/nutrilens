// Shared by the local server and the generated HTTPS deployment.
export function securityHeaders({local = false} = {}) {
  const connect = local ? "'self' https: http://localhost:* http://127.0.0.1:*" : "'self' https:";
  return {
    'Content-Security-Policy': `default-src 'self'; script-src 'self'; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src ${connect}; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'none'`,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=(), payment=(), usb=(), serial=(), bluetooth=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'X-DNS-Prefetch-Control': 'off',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
    'Cache-Control': local ? 'no-store' : 'no-cache',
    // Do not preload or impose HTTPS on subdomains we do not control.
    ...(!local ? {'Strict-Transport-Security': 'max-age=31536000'} : {}),
  };
}

export function validateEndpoint(value, {hosted = false} = {}) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Enter a valid HTTPS endpoint URL.'); }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.hash) {
    throw new Error('Use an HTTP(S) endpoint without embedded credentials or fragments.');
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && (hosted || !loopback)) {
    throw new Error('Use an HTTPS endpoint. Plain HTTP is allowed only for loopback models in the local app.');
  }
  return url;
}

export const unsafeHeader = name => /^(host|cookie|set-cookie|origin|referer|connection|content-length|forwarded|proxy-|sec-|transfer-encoding|upgrade|trailer|te$|expect$)/i.test(name);
export function validateHeader(name, value) {
  if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) || unsafeHeader(name) || typeof value !== 'string' || value.length > 8192 || /[\x00-\x1f\x7f]/.test(value)) {
    throw new Error('Invalid or unsafe custom request header.');
  }
}
