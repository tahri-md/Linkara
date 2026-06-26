import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const KEY_LENGTH_BYTES = 32;
const IV_LENGTH_BYTES = 16;
const AUTH_TAG_LENGTH_BYTES = 16;

const decodeKey = (key: string): Buffer => {
  const decoded = Buffer.from(key, "base64");

  if (decoded.length !== KEY_LENGTH_BYTES) {
    throw new Error("Encryption key must be a base64-encoded 32-byte value");
  }

  return decoded;
};

export function generateEncryptionKey(): string {
  return randomBytes(KEY_LENGTH_BYTES).toString("base64");
}

export function encryptSecret(plaintext: string, key: string): string {
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv("aes-256-gcm", decodeKey(key), iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

export function decryptSecret(encrypted: string, key: string): string {
  const payload = Buffer.from(encrypted, "base64");

  if (payload.length <= IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES) {
    throw new Error("Encrypted secret payload is invalid");
  }

  const iv = payload.subarray(0, IV_LENGTH_BYTES);
  const authTag = payload.subarray(
    IV_LENGTH_BYTES,
    IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES,
  );
  const ciphertext = payload.subarray(IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES);

  const decipher = createDecipheriv("aes-256-gcm", decodeKey(key), iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
