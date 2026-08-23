import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { authRouter } from './routes/auth.js';
import { svpRouter } from './routes/svp.js';
import { passportRouter } from './routes/passport.js';
import { portalAvailabilityRouter } from './routes/portalAvailability.js';
import { createSupabaseAdmin, createSupabaseAnon, hasSupabaseEnv, requireSupabaseEnv } from './lib/supabaseServer.js';

function requireEnv(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
}

function validateEnv() {
  const required = [
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
    'DATABASE_URL',
    'SVP_BASE_URL',
  ];

  for (const key of required) requireEnv(key);
  if (hasSupabaseEnv()) {
    requireSupabaseEnv();
  } else {
    console.warn('Supabase server env is incomplete; /health/supabase will be unavailable.');
  }
}

validateEnv();

const app = express();
const appName = process.env.APP_NAME || 'SVP Backend API';

// Railway sits behind a reverse proxy. Trust the first proxy so secure cookies,
// rate limiting, and request IP handling behave correctly in production.
app.set('trust proxy', 1);

app.use(helmet());
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

const hardcodedOrigins = [
  'https://choyes-woad.vercel.app',
  'https://svp-book.vercel.app',
  'https://svp-book-abdur-razzak-s-projects.vercel.app',
  'https://aci-root.vercel.app',
];
function normalizeOrigin(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

const origins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(normalizeOrigin)
  .filter(Boolean);
const allOrigins = [...new Set([...hardcodedOrigins, ...origins])];
const vercelProject = (process.env.VERCEL_PROJECT_SLUG || '').trim().toLowerCase();

function isAllowedOrigin(origin) {
  if (!origin) return true;
  const normalizedOrigin = normalizeOrigin(origin);
  if (allOrigins.includes(normalizedOrigin)) return true;

  // Allow Vercel preview deployments for this project without listing each random URL.
  if (vercelProject) {
    try {
      const { hostname, protocol } = new URL(normalizedOrigin);
      if (protocol === 'https:' && hostname.endsWith('.vercel.app') && hostname.includes(`-${vercelProject}-`)) {
        return true;
      }
    } catch {
      return false;
    }
  }

  // Allow Lovable preview/published domains automatically
  try {
    const { hostname, protocol } = new URL(normalizedOrigin);
    if (protocol === 'https:' &&
        (hostname.endsWith('.lovable.app') || hostname.endsWith('.lovableproject.com'))) {
      return true;
    }
  } catch {
    // ignore
  }

  return false;
}

app.use(cors({
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) return callback(null, true);
    return callback(new Error(`Origin not allowed by CORS: ${origin}`));
  },
  credentials: true,
}));

// Rate limit auth endpoints
app.use('/api/auth', rateLimit({ windowMs: 60_000, max: 30 }));

app.get('/health', (_, res) => res.json({
  ok: true,
  app: appName,
  env: process.env.NODE_ENV || 'development',
  publicDomain: process.env.RAILWAY_PUBLIC_DOMAIN || null,
  service: process.env.RAILWAY_SERVICE_NAME || null,
}));

app.get('/health/supabase', async (_, res, next) => {
  try {
    if (!hasSupabaseEnv()) {
      return res.status(503).json({
        ok: false,
        message: 'Supabase server env is incomplete',
      });
    }
    const anon = createSupabaseAnon();
    const admin = createSupabaseAdmin();
    const authHealth = await anon.auth.getSession();
    const adminHealth = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });

    res.json({
      ok: !authHealth.error && !adminHealth.error,
      project: process.env.SUPABASE_URL,
      anonClient: authHealth.error ? { ok: false, message: authHealth.error.message } : { ok: true },
      adminClient: adminHealth.error ? { ok: false, message: adminHealth.error.message } : { ok: true },
    });
  } catch (err) {
    next(err);
  }
});

app.get('/', (_, res) => res.json({
  ok: true,
  app: appName,
  env: process.env.NODE_ENV || 'development',
}));

app.use('/api/auth', authRouter);
app.use('/api/svp', svpRouter);
app.use('/api/portal-availability', portalAvailabilityRouter);
app.use('/api', passportRouter);

// global error handler
app.use((err, req, res, next) => {
  const status = err?.statusCode || err?.status || 500;
  res.status(status).json({
    message: err?.message || 'Server error',
    details: err?.details,
  });
});

const port = Number(process.env.PORT || 4000);
const host = '0.0.0.0';
app.listen(port, host, () => console.log(`${appName} listening on http://${host}:${port}`));
