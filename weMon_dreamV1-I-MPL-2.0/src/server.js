/* MPL-2.0: Mozilla Public License 2.0
 * Copyright (c) 2026
 */

'use strict';

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import pino from 'pino';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createWeMonEngine } from './weMon/engine.js';
import { routes } from './weMon/routes.js';

function loadStrictEnv() {
  // Strictly rely on process.env, no implicit dotenv parsing.
  const must = (k, def) => {
    if (process.env[k] === undefined || process.env[k] === '') {
      if (def !== undefined) return def;
      return undefined;
    }
    return process.env[k];
  };

  return {
    NODE_ENV: must('NODE_ENV', 'production'),

    WE_MON_DATA_DIR: must('WE_MON_DATA_DIR', '/data'),
    WE_MON_LOG_DIR: must('WE_MON_LOG_DIR', '/data/logs'),

    WE_MON_READONLY_ON_MISSING_KEYS: must('WE_MON_READONLY_ON_MISSING_KEYS', 'true') === 'true',

    WE_MON_MAX_NOISE_WORDS: Number(must('WE_MON_MAX_NOISE_WORDS', '500')),
    WE_MON_MAX_DOC_TOKENS: Number(must('WE_MON_MAX_DOC_TOKENS', '400000')),

    WE_MON_PORT: Number(must('PORT', must('WE_MON_PORT', '3000'))),
    WE_MON_HOST: must('HOST', '0.0.0.0'),

    // Optional key isolation. If absent, engine boots into sandbox mode.
    WE_MON_KEY_PATH: must('WE_MON_KEY_PATH', '/secrets/engine.key'),
    WE_MON_PEM_PATH: must('WE_MON_PEM_PATH', '/secrets/engine.pem'),

    WE_MON_SECRET_FALLBACK_ALLOWED: must('WE_MON_SECRET_FALLBACK_ALLOWED', 'false') === 'true'
  };
}

function tryReadSecret(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
}

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

const app = Fastify({
  logger,
  requestTimeout: 30_000
});

app.register(cors, { origin: true });
app.register(helmet, {
  contentSecurityPolicy: false
});

const env = loadStrictEnv();

const maybeKey = tryReadSecret(env.WE_MON_KEY_PATH);
const maybePem = tryReadSecret(env.WE_MON_PEM_PATH);

const engine = createWeMonEngine({
  dataDir: env.WE_MON_DATA_DIR,
  logDir: env.WE_MON_LOG_DIR,
  maxNoiseWords: env.WE_MON_MAX_NOISE_WORDS,
  maxDocTokens: env.WE_MON_MAX_DOC_TOKENS,
  readonlyOnMissingKeys: env.WE_MON_READONLY_ON_MISSING_KEYS,
  cryptoMaterial: {
    key: maybeKey,
    pem: maybePem
  }
});

app.register(routes, { engine });

app.get('/health', async () => {
  return {
    ok: true,
    engine: {
      mode: engine.mode,
      readonly: engine.readonly
    }
  };
});

app.listen({ port: env.WE_MON_PORT, host: env.WE_MON_HOST });


