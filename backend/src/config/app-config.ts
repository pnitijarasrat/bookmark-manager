type Env = Record<string, string | undefined>;

// A class so it can be both the type and the injection token.
export abstract class AppConfig {
  abstract readonly databaseUrl: string;
  abstract readonly auth0: {
    readonly issuer: string;
    readonly audience: string;
    readonly jwksUrl: URL;
  };
  abstract readonly port: number;
}

function parseUrl(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

/**
 * Reads and checks the API's config. Throws one error naming every missing or
 * malformed variable, so a wrong issuer or audience stops startup instead of
 * turning into a stream of 401s. Values are never echoed back.
 */
export function loadConfig(env: Env): AppConfig {
  const problems: string[] = [];

  const required = (key: string, check: (value: string) => string | undefined) => {
    const value = env[key]?.trim();
    if (!value) {
      problems.push(`${key} is missing`);
      return '';
    }
    const problem = check(value);
    if (problem) problems.push(`${key} ${problem}`);
    return value;
  };

  const httpsUrl = (value: string) =>
    parseUrl(value)?.protocol === 'https:' ? undefined : 'must be an https URL';

  const databaseUrl = required('DATABASE_URL', (value) =>
    ['postgres:', 'postgresql:'].includes(parseUrl(value)?.protocol ?? '')
      ? undefined
      : 'must be a postgresql:// URL',
  );
  // The token's `iss` is compared exactly, trailing slash included.
  const issuer = required('AUTH0_ISSUER', (value) =>
    httpsUrl(value) ?? (value.endsWith('/') ? undefined : 'must end with "/"'),
  );
  const audience = required('AUTH0_AUDIENCE', () => undefined);
  const jwksUrl = required('AUTH0_JWKS_URL', httpsUrl);

  const rawPort = env.PORT?.trim() || '3001';
  const port = Number(rawPort);
  if (!/^\d+$/.test(rawPort) || port < 1 || port > 65535) {
    problems.push('PORT must be an integer from 1 to 65535');
  }

  if (problems.length > 0) {
    throw new Error(`Invalid configuration:\n- ${problems.join('\n- ')}`);
  }

  return { databaseUrl, auth0: { issuer, audience, jwksUrl: new URL(jwksUrl) }, port };
}
