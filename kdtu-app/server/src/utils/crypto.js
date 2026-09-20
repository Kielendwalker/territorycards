// AES-256-GCM helpers for sensitive columns (member name, phone, etc.).
//
// Key derivation:
//   KDTU_FIELD_KEY (>= 32 chars) is hashed with SHA-256 to a 32-byte AES key.
//   This lets the field key be human-readable (passphrase) without weakening crypto.
//
// Output layout of encryptField():
//   [12-byte nonce][16-byte auth tag][ciphertext]
//   All returned as a single Buffer so it can be stored in a BLOB column.
import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'node:crypto'

export function deriveKey(fieldKey) {
  if (typeof fieldKey !== 'string' || fieldKey.length < 32) {
    throw new Error('[crypto] KDTU_FIELD_KEY must be >= 32 chars to derive a 32-byte AES key.')
  }
  return createHash('sha256').update(fieldKey, 'utf8').digest()
}

export function encryptField(plaintext, key) {
  if (typeof plaintext !== 'string') throw new TypeError('encryptField: plaintext must be a string')
  const aesKey = Buffer.isBuffer(key) ? key : deriveKey(key)
  if (aesKey.length !== 32) throw new Error('encryptField: derived key must be 32 bytes')

  const nonce = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', aesKey, nonce)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([nonce, tag, ct])
}

export function decryptField(blob, key) {
  if (!Buffer.isBuffer(blob)) throw new TypeError('decryptField: blob must be a Buffer')
  const aesKey = Buffer.isBuffer(key) ? key : deriveKey(key)
  if (aesKey.length !== 32) throw new Error('decryptField: derived key must be 32 bytes')

  // Layout: nonce(12) || tag(16) || ciphertext
  if (blob.length < 12 + 16) {
    throw new Error('decryptField: blob too short to contain nonce+tag')
  }
  const nonce = blob.subarray(0, 12)
  const tag = blob.subarray(12, 28)
  const ct = blob.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', aesKey, nonce)
  decipher.setAuthTag(tag)
  const pt = Buffer.concat([decipher.update(ct), decipher.final()])
  return pt.toString('utf8')
}