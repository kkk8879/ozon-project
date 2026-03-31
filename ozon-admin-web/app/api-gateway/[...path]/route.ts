import { NextRequest } from 'next/server';

const directApiBaseUrl = (
  process.env.API_INTERNAL_BASE_URL?.trim() ||
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
  'http://127.0.0.1:3001'
).replace(/\/+$/, '');

function toTargetUrl(req: NextRequest, pathSegments: string[]) {
  const path = pathSegments.join('/');
  const query = req.nextUrl.search || '';
  return `${directApiBaseUrl}/${path}${query}`;
}

function buildForwardHeaders(req: NextRequest) {
  const headers = new Headers();
  req.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (
      lower === 'host' ||
      lower === 'connection' ||
      lower === 'content-length' ||
      lower === 'accept-encoding'
    ) {
      return;
    }
    headers.set(key, value);
  });
  return headers;
}

async function proxy(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const targetUrl = toTargetUrl(req, path || []);
  const method = req.method.toUpperCase();
  const bodyAllowed = method !== 'GET' && method !== 'HEAD';
  const body = bodyAllowed ? await req.arrayBuffer() : undefined;

  const upstream = await fetch(targetUrl, {
    method,
    headers: buildForwardHeaders(req),
    body,
    cache: 'no-store',
    redirect: 'manual',
  });

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (
      lower === 'content-length' ||
      lower === 'transfer-encoding' ||
      lower === 'connection'
    ) {
      return;
    }
    responseHeaders.set(key, value);
  });

  const payload = await upstream.arrayBuffer();
  return new Response(payload, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export async function GET(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(req, context);
}

export async function POST(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(req, context);
}

export async function PUT(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(req, context);
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(req, context);
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxy(req, context);
}

export async function OPTIONS(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxy(req, context);
}
