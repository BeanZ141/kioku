/**
 * Kioku Upload Worker
 *
 * Accepts ticket-authenticated PUT requests and streams the file body
 * directly into Cloudflare R2.
 *
 * Routes:
 *   PUT /upload/:key  — upload a file to R2 originals/{key}
 *
 * Auth:
 *   Header Authorization: Bearer <single-use upload ticket>
 *
 * Secrets (set via `wrangler secret put`):
 *   ARCHIVE_UPLOAD_SECRET — shared only with Firebase Functions
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400',
}

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    if (request.method !== 'PUT') {
      return json({ error: 'Method not allowed' }, 405)
    }

    // Parse route: /upload/:key
    const url = new URL(request.url)
    const match = url.pathname.match(/^\/upload\/(.+)$/)
    if (!match) {
      return json({ error: 'Invalid path. Use PUT /upload/:key' }, 400)
    }

    const objectKey = decodeURIComponent(match[1])
    const auth = request.headers.get('Authorization') || ''
    const token = auth.replace('Bearer ', '').trim()

    const isAuthorized = token && await validTicket(token, env.ARCHIVE_UPLOAD_SECRET, objectKey)

    if (!isAuthorized) {
      return json({ error: 'Unauthorized' }, 401)
    }

    try {
      const contentType = request.headers.get('Content-Type') || 'application/octet-stream'
      if (!contentType.startsWith('image/')) {
        return json({ error: 'Only image uploads are allowed' }, 415)
      }
      if (await env.BUCKET.head(objectKey)) {
        return json({ error: 'Upload ticket has already been used' }, 409)
      }
      await env.BUCKET.put(objectKey, request.body, { httpMetadata: { contentType } })
      return json({ ok: true, key: objectKey, publicUrl: `${env.R2_PUBLIC_URL || ''}/${objectKey}` })
    } catch (err) {
      return json({ error: 'Operation failed', detail: err.message }, 500)
    }
  },
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

async function validTicket(ticket, secret, objectKey) {
  if (!secret) return false
  const [payload, signature] = ticket.split('.')
  if (!payload || !signature) return false
  try {
    const expected = await sign(payload, secret)
    if (!timingSafeEqual(signature, expected)) return false
    const data = JSON.parse(new TextDecoder().decode(fromBase64Url(payload)))
    return data.exp > Date.now() && data.key === objectKey && data.key.startsWith('originals/')
  } catch { return false }
}

async function sign(payload, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return toBase64Url(new Uint8Array(signature))
}

function timingSafeEqual(left, right) {
  if (left.length !== right.length) return false
  let diff = 0
  for (let index = 0; index < left.length; index++) diff |= left.charCodeAt(index) ^ right.charCodeAt(index)
  return diff === 0
}

function fromBase64Url(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)
  const binary = atob(base64)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function toBase64Url(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
