#!/usr/bin/env node
const { createHmac } = require('crypto');
const fs = require('fs');
const http = require('http');
const https = require('https');

function usage() {
  console.log(`Usage: node scripts/send_webhook.js --provider=paystack|ivorypay --secret=YOUR_SECRET [--url=URL] [--file=payload.json]`);
  process.exit(1);
}

const args = process.argv.slice(2).reduce((acc, cur) => {
  const [k, v] = cur.split('=');
  acc[k.replace(/^--/, '')] = v ?? true;
  return acc;
}, {});

const provider = args.provider;
const secret = args.secret || process.env.WEBHOOK_TEST_SECRET;
if (!provider || !secret) usage();

const url = args.url || `http://localhost:3000/api/v1/webhooks/${provider}`;
let payload = { event: 'test.event', id: `test-${Date.now()}`, data: { reference: 'ref-test', amount: 100 } };

if (args.file) {
  payload = JSON.parse(fs.readFileSync(args.file, 'utf8'));
}

const raw = JSON.stringify(payload);

let digest;
let headerName;
if (provider === 'paystack') {
  digest = createHmac('sha512', secret).update(Buffer.from(raw)).digest('hex');
  headerName = 'x-paystack-signature';
} else if (provider === 'ivorypay') {
  digest = createHmac('sha256', secret).update(Buffer.from(raw)).digest('hex');
  headerName = 'x-ivorypay-signature';
} else {
  console.error('Unknown provider:', provider);
  usage();
}

const target = new URL(url);
const opts = {
  hostname: target.hostname,
  port: target.port || (target.protocol === 'https:' ? 443 : 80),
  path: target.pathname + (target.search || ''),
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(raw),
    [headerName]: digest,
  },
};

(target.protocol === 'https:' ? https : http).request(opts, (res) => {
  let body = '';
  res.on('data', (c) => (body += c));
  res.on('end', () => {
    console.log(`Status: ${res.statusCode}`);
    console.log('Response:', body);
  });
}).on('error', (err) => {
  console.error('Request error:', err.message);
}).end(raw);
