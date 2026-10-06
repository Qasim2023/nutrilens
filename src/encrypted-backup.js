// Password-derived authenticated encryption. Never persist the password or key.
// Only backup files are encrypted; live browser storage is not an encrypted vault.
export const ENCRYPTED_BACKUP_FORMAT = 'nutrilens-encrypted-backup';
const ITERATIONS = 600000, MAX_BYTES = 70 * 1024 * 1024;
const aad = new TextEncoder().encode('nutrilens-encrypted-backup:v1:AES-256-GCM:PBKDF2-SHA256:600000');
const cryptoApi = () => {
  if (!globalThis.crypto?.subtle) throw new Error('Encrypted backups require HTTPS or the local app.');
  return globalThis.crypto;
};
const isPlain = value => value && typeof value === 'object' && !Array.isArray(value);
function checkPassword(password, creating = false) {
  if (typeof password !== 'string' || !password.length || password.length > 1024 || (creating && password.length < 12)) {
    throw new Error(creating ? 'Use a unique backup password of at least 12 characters (maximum 1024).' : 'Enter the backup password.');
  }
}
function toBase64(bytes) {
  const chunks = [];
  for (let i = 0; i < bytes.length; i += 32768) chunks.push(String.fromCharCode(...bytes.subarray(i, i + 32768)));
  return btoa(chunks.join(''));
}
function fromBase64(value, maximum) {
  if (typeof value !== 'string' || !value.length || value.length % 4 || value.length > Math.ceil(maximum / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new Error('Invalid encrypted backup data.');
  const bytes = Uint8Array.from(atob(value), c => c.charCodeAt(0));
  if (bytes.length > maximum || toBase64(bytes) !== value) throw new Error('Invalid encrypted backup data.');
  return bytes;
}
async function deriveKey(password, salt, usage) {
  const api = cryptoApi();
  const material = await api.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return api.subtle.deriveKey({name:'PBKDF2', hash:'SHA-256', salt, iterations:ITERATIONS}, material, {name:'AES-GCM', length:256}, false, [usage]);
}
export async function encryptBackup(data, password) {
  checkPassword(password, true);
  if (!isPlain(data) || data.format !== 'nutrilens-personal-backup' || data.version !== 1) throw new Error('Choose a valid all-meals backup.');
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  if (bytes.length > MAX_BYTES) throw new Error('This backup is too large to encrypt (70 MB maximum).');
  const api = cryptoApi(), salt = api.getRandomValues(new Uint8Array(16)), iv = api.getRandomValues(new Uint8Array(12));
  try {
    const key = await deriveKey(password, salt, 'encrypt');
    const encrypted = await api.subtle.encrypt({name:'AES-GCM', iv, additionalData:aad, tagLength:128}, key, bytes);
    return {format:ENCRYPTED_BACKUP_FORMAT, version:1, cipher:'AES-256-GCM', kdf:'PBKDF2-SHA256', iterations:ITERATIONS, salt:toBase64(salt), iv:toBase64(iv), ciphertext:toBase64(new Uint8Array(encrypted))};
  } finally { bytes.fill(0); }
}
export async function decryptBackup(data, password) {
  checkPassword(password);
  // Fixed parameters reject algorithm downgrades and malicious KDF work factors.
  if (!isPlain(data) || data.format !== ENCRYPTED_BACKUP_FORMAT || data.version !== 1 || data.cipher !== 'AES-256-GCM' || data.kdf !== 'PBKDF2-SHA256' || data.iterations !== ITERATIONS) throw new Error('Unsupported or invalid encrypted backup.');
  const salt = fromBase64(data.salt, 16), iv = fromBase64(data.iv, 12), encrypted = fromBase64(data.ciphertext, MAX_BYTES + 16);
  if (salt.length !== 16 || iv.length !== 12 || encrypted.length < 16) throw new Error('Invalid encrypted backup data.');
  const key = await deriveKey(password, salt, 'decrypt');
  let bytes;
  try { bytes = new Uint8Array(await cryptoApi().subtle.decrypt({name:'AES-GCM', iv, additionalData:aad, tagLength:128}, key, encrypted)); }
  catch { throw new Error('Incorrect password or damaged encrypted backup. No meals were changed.'); }
  try {
    const result = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(bytes));
    if (!isPlain(result) || result.format !== 'nutrilens-personal-backup' || result.version !== 1) throw new Error('Invalid decrypted meals backup.');
    return result;
  } finally { bytes.fill(0); }
}
