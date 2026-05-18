/* MPL-2.0: Mozilla Public License 2.0
 * Copyright (c) 2026
 */

'use strict';

import { randomUUID } from 'node:crypto';

export const routes = async (app, opts) => {
  const { engine } = opts;

  app.post('/v1/index', async (req, reply) => {
    const { docId, text } = req.body || {};

    if (!docId || typeof docId !== 'string') {
      reply.code(400);
      return { ok: false, error: 'docId (string) is required' };
    }
    if (!text || typeof text !== 'string') {
      reply.code(400);
      return { ok: false, error: 'text (string) is required' };
    }

    const r = await engine.ingest({ docId, text });
    return { ok: true, requestId: randomUUID(), ...r };
  });

  // Hybrid Query Pipeline
  app.post('/v1/search', async (req, reply) => {
    const { query, features } = req.body || {};

    if (!query || typeof query !== 'string') {
      reply.code(400);
      return { ok: false, error: 'query (string) is required' };
    }

    // In a production pipeline you might split by feature and route edges in parallel.
    // Here we keep single engine search but ensure fast execution and deterministic ranking.
    const r = await engine.search({ query, features: features || {} });
    return r;
  });

  return;
};

