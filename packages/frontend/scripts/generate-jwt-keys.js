#!/usr/bin/env node
/**
 * Imba Production — JWT Key Generator
 * Generates Supabase-compatible anon + service_role JWT keys.
 *
 * Usage: node scripts/generate-jwt-keys.js
 * No external dependencies.
 */

import crypto from 'node:crypto'

// Generate a strong JWT secret
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(40).toString('hex')

// Minimal JWT encode (no external dep)
function base64url(str) {
  return Buffer.from(str).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function sign(payload, secret) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = base64url(JSON.stringify(payload))
  const sig = crypto.createHmac('sha256', secret)
    .update(`${header}.${body}`).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  return `${header}.${body}.${sig}`
}

const now = Math.floor(Date.now() / 1000)
const exp = now + (100 * 365 * 24 * 60 * 60) // 100 years

const anonKey = sign({
  role: 'anon',
  aud: 'authenticated',
  iss: 'supabase',
  iat: now,
  exp,
}, JWT_SECRET)

const serviceKey = sign({
  role: 'service_role',
  aud: 'authenticated',
  iss: 'supabase',
  iat: now,
  exp,
}, JWT_SECRET)

console.log('\n=== Supabase JWT Keys ===\n')
console.log(`JWT_SECRET=${JWT_SECRET}`)
console.log(`\nSUPABASE_ANON_KEY=${anonKey}`)
console.log(`VITE_SUPABASE_ANON_KEY=${anonKey}`)
console.log(`\nSUPABASE_SERVICE_KEY=${serviceKey}`)
console.log('\n========================\n')
console.log('Copy these into your .env and Coolify environment variables.')
console.log('Keep JWT_SECRET secret — all tokens are invalidated if it changes.\n')
