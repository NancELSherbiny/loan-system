import { config } from 'dotenv';
import { resolve } from 'path';
import { sign } from 'jsonwebtoken';

config({ path: resolve(__dirname, '../.env') });

const secret = process.env.JWT_SECRET;

if (!secret) {
  console.error('JWT_SECRET is not set in backend/.env');
  process.exit(1);
}

const payload = {
  sub: 'dashboard-admin',
  roles: ['disbursement:write'],
};

const token = sign(payload, secret, { expiresIn: '1h' });

console.log(token);

