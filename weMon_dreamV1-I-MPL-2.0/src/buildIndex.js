/* MPL-2.0: Mozilla Public License 2.0
 * Copyright (c) 2026
 */

'use strict';

import { createWeMonEngine } from './weMon/engine.js';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

function loadStrictEnv() {
  const must = (k, def) => {
    if (process.env[k] === undefined || process.env[k] === '') return def;
    return process.env[k];
  };
  return {
    WE_MON_DATA_DIR: must('WE_MON_DATA_DIR', '/data'),
    WE_MON_LOG_DIR: must('WE_MON_LOG_DIR', '/data/logs'),
    WE_MON_MAX_NOISE_WORDS: Number(must('WE_MON_MAX_NOISE_WORDS', '500')),
    WE_MON_MAX_DOC_TOKENS: Number(must('WE_MON_MAX_DOC_TOKENS', '400000')),
    WE_MON_READONLY_ON_MISSING_KEYS: must('WE_MON_READONLY_ON_MISSING_KEYS', 'true') === 'true',
    WE_MON_KEY_PATH: must('WE_MON_KEY_PATH', '/secrets/engine.key'),
    WE_MON_PEM_PATH: must('WE_MON_PEM_PATH', '/secrets/engine.pem')
  };
}

function tryReadSecret(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
}

async function main() {
  const env = loadStrictEnv();
  if (!existsSync('docker-data/example-corpus.txt')) {
    console.log('No docker-data/example-corpus.txt found; skipping buildIndex.');
    process.exit(0);
  }

  const maybeKey = tryReadSecret(env.WE_MON_KEY_PATH);
  const maybePem = tryReadSecret(env.WE_MON_PEM_PATH);

  const engine = createWeMonEngine({
    dataDir: env.WE_MON_DATA_DIR,
    logDir: env.WE_MON_LOG_DIR,
    maxNoiseWords: env.WE_MON_MAX_NOISE_WORDS,
    maxDocTokens: env.WE_MON_MAX_DOC_TOKENS,
    readonlyOnMissingKeys: env.WE_MON_READONLY_ON_MISSING_KEYS,
    cryptoMaterial: { key: maybeKey, pem: maybePem }
  });

  const corpus = readFileSync('docker-data/example-corpus.txt', 'utf8');
  const r = await engine.ingest({ docId: 'example', text: corpus });
  console.log(JSON.stringify(r, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

