/* MPL-2.0: Mozilla Public License 2.0
 * Copyright (c) 2026
 */

'use strict';

import { createWeMonEngine } from '../weMon/engine.js';

async function main() {
  const engine = createWeMonEngine({
    dataDir: './tmp-data',
    logDir: './tmp-logs',
    maxNoiseWords: 5,
    maxDocTokens: 50_000,
    readonlyOnMissingKeys: true,
    cryptoMaterial: { key: undefined, pem: undefined }
  });

  // Should boot sandbox-ro
  console.log('mode:', engine.mode, 'readonly:', engine.readonly);

  await engine.ingest({ docId: 'd1', text: 'hello world hello dream weMon' });
  const r = await engine.search({ query: 'hello dream', features: { prefix: true, phrase: true, wildcard: true } });
  console.log(JSON.stringify(r, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

