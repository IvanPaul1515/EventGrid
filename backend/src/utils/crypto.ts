import crypto from 'crypto';

const SECRET_SEED =
  process.env.APP_SECRET ||
  process.env.JWT_SECRET ||
  'eventgrid_platform_secure_vault_key_2026';

const DERIVED_KEY = crypto.scryptSync(SECRET_SEED, 'eventgrid-vault-salt-v1', 32);

/**
 * Cifrado autenticado AES-256-GCM para almacenamiento seguro de credenciales en reposo (QA-12)
 */
export function encryptSecret(plainText?: string | null): string | null {
  if (!plainText || plainText.trim() === '') return null;
  if (plainText.startsWith('enc:gcm:')) return plainText; // Ya cifrado

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', DERIVED_KEY, iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');

  return `enc:gcm:${iv.toString('hex')}:${tag}:${encrypted}`;
}

/**
 * Descifrado autenticado AES-256-GCM
 * Mantiene retrocompatibilidad transparente con contraseñas legadas no cifradas.
 */
export function decryptSecret(cipherText?: string | null): string {
  if (!cipherText || cipherText.trim() === '') return '';
  if (!cipherText.startsWith('enc:gcm:')) {
    // Texto plano legado
    return cipherText;
  }

  try {
    const parts = cipherText.split(':');
    if (parts.length !== 5) return '';
    const iv = Buffer.from(parts[2], 'hex');
    const tag = Buffer.from(parts[3], 'hex');
    const encryptedHex = parts[4];

    const decipher = crypto.createDecipheriv('aes-256-gcm', DERIVED_KEY, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('Error al descifrar secreto de configuración:', err);
    return '';
  }
}
