/**
 * Google JWT OAuth2 client — creates OAuth2 access tokens from Service Account keys.
 * Implements the JWT Bearer flow (RFC 7523) for server-to-server auth.
 * No user interaction required; tokens auto-renew.
 * 
 * Compatible with Cloudflare Workers (no Node.js deps).
 */

/**
 * Base64 URL-safe encode
 */
function base64UrlEncode(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Parse PEM-encoded RSA private key and sign a JWT
 * Cloudflare Workers support subtle.crypto APIs
 */
async function signJwt(payload, privateKeyPem) {
  // Build JWT header
  const header = { alg: 'RS256', typ: 'JWT' };

  // Parse PEM key
  const pem = privateKeyPem
    .replace('-----BEGIN RSA PRIVATE KEY-----', '')
    .replace('-----END RSA PRIVATE KEY-----', '')
    .replace(/\s/g, '');

  const binaryDer = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryDer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signatureInput = `${headerB64}.${payloadB64}`;

  const signature = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    privateKey,
    new TextEncoder().encode(signatureInput),
  );

  const signatureB64 = base64UrlEncode(String.fromCharCode(...new Uint8Array(signature)));

  return `${signatureInput}.${signatureB64}`;
}

/**
 * Exchange JWT for an OAuth2 access token
 * @param {Object} serviceAccountKey - Parsed service account JSON
 * @param {string} scope - OAuth2 scope (e.g., "https://www.googleapis.com/auth/bigquery")
 * @returns {Promise<{ access_token: string, expires_in: number, token_type: string }>}
 */
export async function jwtClient(serviceAccountKey, scope) {
  const now = Math.floor(Date.now() / 1000);

  // JWT payload for Google OAuth2
  const payload = {
    iss: serviceAccountKey.client_email,
    scope: scope,
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  // Sign the JWT with the service account's private key
  const jwt = await signJwt(payload, serviceAccountKey.private_key);

  // Exchange JWT for access token via Google's OAuth2 endpoint
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }).toString(),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Google OAuth2 error ${response.status}: ${err}`);
  }

  return await response.json();
}
