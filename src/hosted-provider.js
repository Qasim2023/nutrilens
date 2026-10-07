// Public service coordinates only. No account credentials belong in this module.
export const WIKIVIBE_BASE_URL = 'https://api.wikivibe.dev/v1';
export const HOSTED_RELAY_PATH = '/api/wikivibe';
export const HOSTED_ROUTES = Object.freeze({
  '/v1/models': 'GET',
  '/v1/chat/completions': 'POST',
  '/v1/responses': 'POST',
});
export function isHostedProvider(value) {
  try {return new URL(value).origin === new URL(WIKIVIBE_BASE_URL).origin;} catch {return false;}
}
export function hostedProviderPath(value) {
  const url = new URL(value);
  const route = url.pathname.replace(/\/+$/, '');
  if (!isHostedProvider(value) || url.username || url.password || url.search || url.hash || !Object.hasOwn(HOSTED_ROUTES, route)) {
    throw new Error('The hosted relay supports only approved provider models, chat/completions and responses URLs without query parameters.');
  }
  return route;
}
