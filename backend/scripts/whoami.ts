import { decodeJwt } from 'jose';

// Prints the `sub` of an access token, for SEED_OWNER_A_SUB. The token is
// decoded locally and never verified or sent anywhere. Error messages never
// echo the input. See DECISIONS.md, "Seed data".
//
//   npm run whoami --prefix backend -- <token>

const token = process.argv[2];

if (!token) {
  console.error('Usage: npm run whoami --prefix backend -- <access token>');
  process.exit(2);
}

let sub: unknown;
try {
  sub = decodeJwt(token).sub;
} catch {
  console.error('That is not a JWT. Copy the token after "Bearer " in the Authorization header.');
  process.exit(1);
}

if (typeof sub !== 'string' || sub === '') {
  console.error('That JWT has no sub.');
  process.exit(1);
}

console.log(sub);
