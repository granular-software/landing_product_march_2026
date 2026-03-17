import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, normalize } from 'node:path';

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const ROOT = dirname(fileURLToPath(import.meta.url));
const SLACK_WAITLIST_WEBHOOK_URL = process.env.SLACK_WAITLIST_WEBHOOK_URL;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function sendFile(res, filePath) {
  const ext = extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': contentType });
  createReadStream(filePath).pipe(res);
}

async function parseJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function handleWaitlist(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const { email, github = '', twitter = '', page = 'prod_landing' } = await parseJsonBody(req);

    if (!email || (!github && !twitter)) {
      return sendJson(res, 400, { error: 'Email and one profile are required' });
    }

    if (!SLACK_WAITLIST_WEBHOOK_URL) {
      return sendJson(res, 500, { error: 'Missing SLACK_WAITLIST_WEBHOOK_URL' });
    }

    const text = [
      'New Granular waitlist signup',
      `Email: ${email}`,
      `GitHub: ${github || 'N/A'}`,
      `Twitter: ${twitter || 'N/A'}`,
      `Page: ${page}`,
      'Source: local-dev',
    ].join('\n');

    const slackResponse = await fetch(SLACK_WAITLIST_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    if (!slackResponse.ok) {
      return sendJson(res, 502, { error: 'Failed to send Slack notification' });
    }

    return sendJson(res, 200, { ok: true });
  } catch (error) {
    return sendJson(res, 500, { error: 'Invalid request' });
  }
}

async function handleStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let pathname = url.pathname;

  if (pathname === '/') pathname = '/index.html';

  const filePath = normalize(join(ROOT, pathname));
  if (!filePath.startsWith(ROOT)) {
    return sendJson(res, 403, { error: 'Forbidden' });
  }

  try {
    await readFile(filePath);
    sendFile(res, filePath);
  } catch {
    try {
      const fallbackPath = join(ROOT, 'index.html');
      await readFile(fallbackPath);
      sendFile(res, fallbackPath);
    } catch {
      sendJson(res, 404, { error: 'Not found' });
    }
  }
}

const server = createServer(async (req, res) => {
  if (!req.url) {
    return sendJson(res, 400, { error: 'Bad request' });
  }

  if (req.url.startsWith('/api/waitlist')) {
    return handleWaitlist(req, res);
  }

  return handleStatic(req, res);
});

server.listen(PORT, HOST, () => {
  console.log(`Granular local server running at http://${HOST}:${PORT}`);
});
