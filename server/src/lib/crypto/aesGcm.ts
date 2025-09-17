import { createDecipheriv, createCipheriv, randomBytes, timingSafeEqual } from 'node:crypto'

const ALGO = 'aes-256-gcm'
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

export type EncryptedPayload = {
  keyId: string
  iv: string // base64
  ciphertext: string // base64
  tag: string // base64
}

function getKey(): { key: Buffer; keyId: string } {
  const keyB64 = process.env.TOKEN_ENCRYPTION_KEY
  const keyId = process.env.TOKEN_ENCRYPTION_KEY_ID || 'default'
  if (!keyB64) throw new Error('TOKEN_ENCRYPTION_KEY not set')
  const key = Buffer.from(keyB64, 'base64')
  if (key.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY must be 32 bytes (base64 of 32 bytes)')
  return { key, keyId }
}

export function encryptToB64(plaintext: string): string {
  const { key, keyId } = getKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGO, key, iv, { authTagLength: AUTH_TAG_LENGTH })
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  const payload: EncryptedPayload = {
    keyId,
    iv: iv.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    tag: tag.toString('base64'),
  }
  // Length guard ~16KB max after base64
  const size = Buffer.byteLength(JSON.stringify(payload), 'utf8')
  if (size > 16 * 1024) throw new Error('Encrypted payload exceeds 16KB')
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64')
}

export function decryptFromB64(b64: string): string {
  const { key } = getKey()
  const raw = Buffer.from(b64, 'base64').toString('utf8')
  const payload = JSON.parse(raw) as EncryptedPayload
  const iv = Buffer.from(payload.iv, 'base64')
  const tag = Buffer.from(payload.tag, 'base64')
  const ciphertext = Buffer.from(payload.ciphertext, 'base64')
  const decipher = createDecipheriv(ALGO, key, iv, { authTagLength: AUTH_TAG_LENGTH })
  decipher.setAuthTag(tag)
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
  return plaintext
}

export function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}


