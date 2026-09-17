function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`${name} is not set. Copy frontend/.env.example to frontend/.env.`);
  return value;
}

/** Public tenant and API facts from `frontend/.env`. None of them are secrets. */
export const config = {
  auth0Domain: required('VITE_AUTH0_DOMAIN', import.meta.env.VITE_AUTH0_DOMAIN),
  auth0ClientId: required('VITE_AUTH0_CLIENT_ID', import.meta.env.VITE_AUTH0_CLIENT_ID),
  auth0Audience: required('VITE_AUTH0_AUDIENCE', import.meta.env.VITE_AUTH0_AUDIENCE),
  apiUrl: required('VITE_API_URL', import.meta.env.VITE_API_URL),
};
