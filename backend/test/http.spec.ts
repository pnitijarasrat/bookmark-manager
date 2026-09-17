import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Owner } from '../src/auth/owner.decorator.js';
import { startApp, type TestApp } from './support/app.js';
import { createIdentityProvider, OWNER_A, OWNER_B, type IdentityProvider } from './support/identity-provider.js';

// The global guard, pipe, filter and HTTP hardening, probed through a
// test-only controller. No resource routes exist yet.

const NOT_FOUND = '{"type":"about:blank","title":"Not Found","status":404}';

class ProbeBody {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  note?: string;
}

@Controller('probe')
class ProbeController {
  @Get()
  whoami(@Owner() owner: string) {
    return { owner };
  }

  @Post()
  echo(@Body() body: ProbeBody) {
    return { name: body.name };
  }

  @Get('boom')
  boom(): never {
    throw new Error('connection to db-secret-host failed for auth0|leaked');
  }

  @Get(':id')
  missing(@Param('id') id: string, @Query('q') q?: string): never {
    throw new NotFoundException(`No probe ${id} matching ${q}`);
  }
}

let idp: IdentityProvider;
let api: TestApp;
let tokenA: string;

beforeAll(async () => {
  idp = await createIdentityProvider();
  api = await startApp({ idp, controllers: [ProbeController] });
  tokenA = await idp.tokens.ownerA();
});

afterAll(async () => {
  await api?.close();
});

async function expectProblem(res: Response, status: number, title: string) {
  expect(res.status).toBe(status);
  expect(res.headers.get('content-type')).toMatch(/^application\/problem\+json/);
  const body = await res.json();
  expect(body).toMatchObject({ type: 'about:blank', title, status });
  return body;
}

describe('the token guard', () => {
  it('sets the Owner from a valid token', async () => {
    const res = await api.request('/probe', { token: tokenA });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ owner: OWNER_A });
  });

  it("gives each token its own Owner", async () => {
    const res = await api.request('/probe', { token: await idp.tokens.ownerB() });
    expect(await res.json()).toEqual({ owner: OWNER_B });
  });

  it('refuses a request with no token', async () => {
    const res = await api.request('/probe');
    expect(await expectProblem(res, 401, 'Unauthorized')).toEqual({
      type: 'about:blank',
      title: 'Unauthorized',
      status: 401,
    });
  });

  it.each([
    'expired',
    'wrongAudience',
    'wrongIssuer',
    'issuerWithoutSlash',
    'noSub',
    'emptySub',
    'hs256',
    'ps256',
    'none',
    'unknownKey',
  ] as const)('refuses a %s token', async (kind) => {
    const res = await api.request('/probe', { token: await idp.tokens[kind]() });
    await expectProblem(res, 401, 'Unauthorized');
  });

  it.each([
    ['a Basic scheme', (t: string) => `Basic ${t}`],
    ['an empty Bearer', () => 'Bearer '],
    ['a bare token', (t: string) => t],
    ['two tokens', (t: string) => `Bearer ${t} ${t}`],
  ])('refuses %s', async (_, header) => {
    const res = await api.request('/probe', { headers: { authorization: header(tokenA) } });
    await expectProblem(res, 401, 'Unauthorized');
  });

  it('accepts a lower-case bearer scheme', async () => {
    const res = await api.request('/probe', { headers: { authorization: `bearer ${tokenA}` } });
    expect(res.status).toBe(200);
  });

  it('never reads the token from the query string', async () => {
    const res = await api.request(`/probe?access_token=${tokenA}`);
    await expectProblem(res, 401, 'Unauthorized');
  });

  it('checks the token before validating the body', async () => {
    const res = await api.request('/probe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ownerId: OWNER_B }),
    });
    await expectProblem(res, 401, 'Unauthorized');
  });
});

describe('404s', () => {
  it('have the constant body, with no detail or path', async () => {
    const res = await api.request('/probe/some-id?q=secret', { token: tokenA });
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toMatch(/^application\/problem\+json/);
    expect(await res.text()).toBe(NOT_FOUND);
  });

  it('are the same body for an unknown route, with or without a token', async () => {
    for (const token of [tokenA, undefined]) {
      const res = await api.request('/no/such/route', { token });
      expect(res.status).toBe(404);
      expect(await res.text()).toBe(NOT_FOUND);
    }
  });
});

describe('request validation', () => {
  const post = (body: string, contentType = 'application/json') =>
    api.request('/probe', {
      method: 'POST',
      token: tokenA,
      headers: { 'content-type': contentType },
      body,
    });

  it('accepts a valid body', async () => {
    const res = await post(JSON.stringify({ name: 'ok' }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ name: 'ok' });
  });

  it('refuses ownerId in a body with a 400', async () => {
    const res = await post(JSON.stringify({ name: 'ok', ownerId: OWNER_B }));
    const body = await expectProblem(res, 400, 'Bad Request');
    expect(JSON.stringify(body)).not.toContain(OWNER_B);
  });

  it('refuses any unknown field with a 400', async () => {
    await expectProblem(await post(JSON.stringify({ name: 'ok', id: 'x' })), 400, 'Bad Request');
  });

  it('refuses malformed JSON with a 400', async () => {
    await expectProblem(await post('{"name":'), 400, 'Bad Request');
  });

  it('refuses a non-object JSON body with a 400', async () => {
    await expectProblem(await post('"just a string"'), 400, 'Bad Request');
  });

  it('refuses a JSON array body with a 400', async () => {
    await expectProblem(await post('[{"name":"ok"}]'), 400, 'Bad Request');
  });

  it('answers invalid values with a 422 that points at each field', async () => {
    const res = await post(JSON.stringify({ name: '', note: 'too long' }));
    const body = await expectProblem(res, 422, 'Unprocessable Content');
    expect(body.errors).toEqual([
      { pointer: '/name', detail: expect.any(String) },
      { pointer: '/note', detail: expect.any(String) },
    ]);
    expect(Object.keys(body).sort()).toEqual(['errors', 'status', 'title', 'type']);
  });

  it('answers a missing required field with a 422', async () => {
    const body = await expectProblem(await post('{}'), 422, 'Unprocessable Content');
    expect(body.errors).toEqual([{ pointer: '/name', detail: expect.any(String) }]);
  });

  it('gives an unknown field a 400 even when values are also invalid', async () => {
    await expectProblem(await post(JSON.stringify({ name: 5, ownerId: 'x' })), 400, 'Bad Request');
  });
});

describe('unexpected errors', () => {
  it('are a 500 with no details', async () => {
    const res = await api.request('/probe/boom', { token: tokenA });
    expect(await expectProblem(res, 500, 'Internal Server Error')).toEqual({
      type: 'about:blank',
      title: 'Internal Server Error',
      status: 500,
    });
  });
});

describe('HTTP hardening', () => {
  it('sets helmet headers', async () => {
    const res = await api.request('/probe', { token: tokenA });
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-powered-by')).toBeNull();
  });

  const preflight = (origin: string) =>
    api.request('/probe', {
      method: 'OPTIONS',
      headers: {
        origin,
        'access-control-request-method': 'PATCH',
        'access-control-request-headers': 'authorization,content-type',
      },
    });

  it('allows CORS from the SPA origin, without credentials', async () => {
    const res = await preflight('http://localhost:3000');
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
    expect(res.headers.get('access-control-allow-headers')?.toLowerCase().split(',').sort()).toEqual([
      'authorization',
      'content-type',
    ]);
    expect(res.headers.get('access-control-allow-methods')?.split(',').sort()).toEqual([
      'DELETE',
      'GET',
      'PATCH',
      'POST',
      'PUT',
    ]);
    expect(res.headers.get('access-control-allow-credentials')).toBeNull();
  });

  it.each(['http://localhost:3001', 'http://127.0.0.1:3000', 'https://localhost:3000', 'null'])(
    'refuses CORS from %s',
    async (origin) => {
      const res = await preflight(origin);
      expect(res.headers.get('access-control-allow-origin')).toBeNull();
    },
  );

  it('logs only the method, route pattern, status and duration', async () => {
    const token = await idp.tokens.ownerB();
    api.logs.length = 0;
    await api.request('/probe/f00d-id?q=private-search', { token });
    await api.request('/no/such/f00d-route?q=private-search', { token });
    await api.request('/probe', {
      method: 'POST',
      token,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'private-name' }),
    });
    await api.request('/probe/boom', { token });
    // The log line is written when the response finishes.
    await new Promise((resolve) => setTimeout(resolve, 20));

    const requestLines = api.logs.filter((line) => /^(GET|POST) /.test(line));
    expect(requestLines).toEqual([
      expect.stringMatching(/^GET \/probe\/:id 404 \d+ms$/),
      expect.stringMatching(/^GET \(unmatched\) 404 \d+ms$/),
      expect.stringMatching(/^POST \/probe 201 \d+ms$/),
      expect.stringMatching(/^GET \/probe\/boom 500 \d+ms$/),
    ]);
    const everything = api.logs.join('\n');
    for (const secret of ['f00d', 'private', OWNER_B, token, 'db-secret-host', 'auth0|leaked']) {
      expect(everything).not.toContain(secret);
    }
  });
});
