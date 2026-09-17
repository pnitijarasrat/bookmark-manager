const API_ORIGIN = 'http://localhost:3001';

type Handler = (call: RecordedCall) => Response | Promise<Response>;

export interface RecordedCall {
  method: string;
  url: string;
  /** The URL without the API origin, e.g. `/bookmarks?q=a`. */
  path: string;
  searchParams: URLSearchParams;
  headers: Headers;
  body: unknown;
}

export interface MockApi {
  /** Answers `method pathname`. A later handler for the same route wins. */
  on: (method: string, pathname: string, handler: Handler) => void;
  calls: RecordedCall[];
}

/** Replaces the global `fetch` with a fake API for the current test. */
export function mockApi(): MockApi {
  const handlers = new Map<string, Handler>();
  const calls: RecordedCall[] = [];

  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.origin !== API_ORIGIN) throw new Error(`Unexpected fetch to ${request.url}`);
    const text = await request.text();
    const call: RecordedCall = {
      method: request.method,
      url: request.url,
      path: url.pathname + url.search,
      searchParams: url.searchParams,
      headers: request.headers,
      body: text ? JSON.parse(text) : undefined,
    };
    calls.push(call);
    const handler = handlers.get(`${request.method} ${url.pathname}`);
    if (!handler) throw new Error(`No mock for ${request.method} ${call.path}`);
    return handler(call);
  });

  return {
    on: (method, pathname, handler) => handlers.set(`${method} ${pathname}`, handler),
    calls,
  };
}

const TITLES: Record<number, string> = {
  401: 'Unauthorized',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Content',
  500: 'Internal Server Error',
};

export function problem(status: number, extra: Record<string, unknown> = {}): Response {
  return new Response(
    JSON.stringify({ type: 'about:blank', title: TITLES[status] ?? 'Error', status, ...extra }),
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  );
}

export function noContent(): Response {
  return new Response(null, { status: 204 });
}
