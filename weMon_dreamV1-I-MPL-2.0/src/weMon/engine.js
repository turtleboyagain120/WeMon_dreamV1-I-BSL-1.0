/* MPL-2.0: Mozilla Public License 2.0
 * Copyright (c) 2026
 */

'use strict';

import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, existsSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

function normalizeText(input) {
  // Fast-ish normalization.
  return String(input)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(normalized) {
  if (!normalized) return [];
  const raw = normalized.split(' ');
  const out = [];
  for (const t of raw) {
    if (!t) continue;
    if (t.length > 48) continue;
    out.push(t);
  }
  return out;
}

function sha256(str) {
  return createHash('sha256').update(str).digest('hex');
}

function buildNoiseFilter({ maxNoiseWords, corpusCounts }) {
  // Noise: very high document frequency terms.
  const entries = Array.from(corpusCounts.entries());
  entries.sort((a, b) => b[1] - a[1]);
  const noise = new Set();
  for (let i = 0; i < Math.min(maxNoiseWords, entries.length); i++) {
    noise.add(entries[i][0]);
  }
  return noise;
}

function createGC({ logDir, maxLogBytes = 15 * 1024 * 1024, intervalMs = 20_000, logger }) {
  let timer;

  const listLogFiles = () => {
    // Minimal log purge: scan directory synchronously.
    // Keeping it simple and robust across alpine/docker.
    const files = [];
    try {
      const dirEntries = require('node:fs').readdirSync(logDir, { withFileTypes: true });
      for (const ent of dirEntries) {
        if (!ent.isFile()) continue;
        if (!ent.name.endsWith('.log')) continue;
        files.push(ent.name);
      }
    } catch {
      return [];
    }
    return files;
  };

  const totalBytes = (files) => {
    let sum = 0;
    for (const f of files) {
      try {
        sum += require('node:fs').statSync(join(logDir, f)).size;
      } catch {
        // ignore
      }
    }
    return sum;
  };

  const purgeOld = () => {
    try {
      const files = listLogFiles();
      if (files.length === 0) return;
      if (totalBytes(files) <= maxLogBytes) return;

      // Sort by mtime asc (oldest first)
      files.sort((a, b) => {
        const sa = require('node:fs').statSync(join(logDir, a)).mtimeMs;
        const sb = require('node:fs').statSync(join(logDir, b)).mtimeMs;
        return sa - sb;
      });

      while (files.length && totalBytes(files) > maxLogBytes) {
        const f = files.shift();
        rmSync(join(logDir, f), { force: true });
        logger.info({ f }, 'Purged old search log');
      }
    } catch (err) {
      logger.warn({ err }, 'GC purge failed');
    }
  };

  const start = () => {
    purgeOld();
    timer = setInterval(purgeOld, intervalMs);
    timer.unref();
  };

  const stop = () => {
    if (timer) clearInterval(timer);
  };

  return { start, stop, purgeOld };
}

export function createWeMonEngine({
  dataDir,
  logDir,
  maxNoiseWords,
  maxDocTokens,
  readonlyOnMissingKeys,
  cryptoMaterial
}) {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });

  const hasKeyMaterial = Boolean(cryptoMaterial?.key && cryptoMaterial?.pem);

  const readonly = readonlyOnMissingKeys && !hasKeyMaterial;
  const mode = hasKeyMaterial ? 'secure' : 'sandbox-ro';

  const logger = require('node:console');

  // In-memory inverted index.
  // Layout:
  //  - vocab: Map token -> { postings: Map docId -> positions[] , df }
  //  - docs: Map docId -> { tokensCount }
  //  - prefix: Map prefix -> Set(token) derived lazily via token scan
  const vocab = new Map();
  const docs = new Map();
  const tokenDocFreq = new Map();

  let noiseWords = new Set();

  const gc = createGC({ logDir, logger: console, maxLogBytes: 15 * 1024 * 1024, intervalMs: 20_000 });
  gc.start();

  // Semantic deep-indexing loop (async internal processing loop)
  // - For each ingest request, we update raw token stats.
  // - Noise filter is recomputed after a short debounce.
  // - Indexing uses the latest noise filter.
  let pending = [];
  let processing = false;
  let recomputeNoiseTimer;

  const enqueueIngest = (docId, text) => {
    pending.push({ docId, text });
    if (!processing) processing = true;
    if (!recomputeNoiseTimer) {
      recomputeNoiseTimer = setTimeout(() => {
        recomputeNoiseTimer = undefined;
        noiseWords = buildNoiseFilter({ maxNoiseWords, corpusCounts: tokenDocFreq });
      }, 75);
      recomputeNoiseTimer.unref();
    }
    setImmediate(() => processPending());
  };

  const processPending = () => {
    const batch = pending;
    pending = [];
    processing = false;

    for (const item of batch) {
      if (readonly) continue;
      const normalized = normalizeText(item.text);
      const tokens = tokenize(normalized);
      const clipped = tokens.slice(0, maxDocTokens);

      if (!docs.has(item.docId)) docs.set(item.docId, { tokensCount: 0 });
      docs.get(item.docId).tokensCount = clipped.length;

      // doc-level set for df counting
      const seen = new Set(clipped);
      for (const t of seen) {
        tokenDocFreq.set(t, (tokenDocFreq.get(t) || 0) + 1);
      }

      // index positions if not noise
      for (let pos = 0; pos < clipped.length; pos++) {
        const token = clipped[pos];
        if (noiseWords.has(token)) continue;

        let entry = vocab.get(token);
        if (!entry) {
          entry = { postings: new Map(), df: 0 };
          vocab.set(token, entry);
        }

        let posting = entry.postings.get(item.docId);
        if (!posting) {
          posting = [];
          entry.postings.set(item.docId, posting);
          entry.df++;
        }
        posting.push(pos);
      }
    }
  };

  function logQuery(kind, data) {
    try {
      const id = randomUUID();
      const payload = JSON.stringify({ t: Date.now(), kind, id, ...data });
      writeFileSync(join(logDir, `${Date.now()}-${id}.log`), payload, 'utf8');
    } catch {
      // ignore
    }
  }

  // Prefix and wildcard queries via token scanning.
  // For speed: scan only tokens starting with prefix. For wildcards with '*',
  // we interpret as contains/prefix/suffix patterns over tokens.
  function matchWildcard(token, pattern) {
    // pattern supports '*' only.
    if (!pattern.includes('*')) return token === pattern;
    const [pre, suf] = pattern.split('*');
    if (pre && suf) return token.startsWith(pre) && token.endsWith(suf);
    if (pre && !suf) return token.startsWith(pre);
    if (!pre && suf) return token.endsWith(suf);
    return true;
  }

  function getPostingsForToken(token) {
    const entry = vocab.get(token);
    if (!entry) return [];
    return entry.postings;
  }

  function prefixTokens(prefix) {
    if (!prefix) return [];
    const p = prefix.toLowerCase();
    const out = [];
    for (const [tok] of vocab) {
      if (tok.startsWith(p)) out.push(tok);
    }
    return out;
  }

  function phraseSearch(phraseTokens) {
    // Find docs where sequence occurs contiguously.
    if (phraseTokens.length === 0) return new Map();

    const [first, ...rest] = phraseTokens;
    const firstEntry = vocab.get(first);
    if (!firstEntry) return new Map();

    const results = new Map();

    for (const [docId, positions] of firstEntry.postings.entries()) {
      for (const startPos of positions) {
        let ok = true;
        for (let i = 0; i < rest.length; i++) {
          const tok = rest[i];
          const e = vocab.get(tok);
          if (!e) {
            ok = false;
            break;
          }
          const pArr = e.postings.get(docId);
          if (!pArr) {
            ok = false;
            break;
          }
          const want = startPos + 1 + i;
          // positions array is typically small-ish; linear scan acceptable for demo.
          if (!pArr.includes(want)) {
            ok = false;
            break;
          }
        }
        if (ok) {
          results.set(docId, (results.get(docId) || 0) + 1);
          break;
        }
      }
    }
    return results;
  }

  function scoreDocs(docIdSet) {
    // Simple scoring: prefer shorter docs and more matches.
    const scored = [];
    for (const docId of docIdSet) {
      const len = docs.get(docId)?.tokensCount || 1;
      scored.push({ docId, score: 1 / Math.max(1, len) });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored;
  }

  async function ingest({ docId, text }) {
    if (readonly) {
      return { ok: false, mode, readonly: true, reason: 'Missing key material; running in sandbox read-only mode.' };
    }
    enqueueIngest(docId, text);

    // Fire-and-forget processing; return quickly.
    return { ok: true, mode, queued: true, docId };
  }

  async function search({ query, features = {} }) {
    const t0 = Date.now();

    const payload = { query, features };

    const normalized = normalizeText(query);

    const phraseMatches = [];
    const exactMatches = [];
    const tokens = tokenize(normalized);

    const wildcardsEnabled = Boolean(features.wildcard);
    const phrasesEnabled = Boolean(features.phrase);
    const prefixEnabled = Boolean(features.prefix);

    // Parse exact phrases enclosed in quotes
    let phrases = [];
    if (phrasesEnabled) {
      const re = /"([^"]+)"/g;
      let m;
      while ((m = re.exec(query)) !== null) {
        phrases.push(m[1]);
      }
    }

    const docScore = new Map();

    const addDoc = (docId, delta) => {
      docScore.set(docId, (docScore.get(docId) || 0) + delta);
    };

    // Prefix / exact / wildcard token matching.
    // Strategy: for each token or wildcard token, merge posting sets.
    const considerTokens = tokens.length ? tokens : [];

    for (const rawTok of considerTokens) {
      if (wildcardsEnabled && rawTok.includes('*')) {
        for (const [tok] of vocab) {
          if (matchWildcard(tok, rawTok)) {
            const postings = getPostingsForToken(tok);
            for (const [docId] of postings.entries()) addDoc(docId, 2);
          }
        }
        continue;
      }

      if (prefixEnabled && rawTok.endsWith('*')) {
        const pref = rawTok.slice(0, -1);
        for (const tok of prefixTokens(pref)) {
          const postings = getPostingsForToken(tok);
          for (const [docId] of postings.entries()) addDoc(docId, 1.5);
        }
        continue;
      }

      const postings = getPostingsForToken(rawTok);
      for (const [docId] of postings.entries()) addDoc(docId, 1);
    }

    // Phrase search boosts.
    for (const ph of phrases) {
      const n = normalizeText(ph);
      const pt = tokenize(n);
      if (pt.length === 0) continue;
      const res = phraseSearch(pt);
      for (const [docId, count] of res.entries()) addDoc(docId, 4 + count);
    }

    // Optional: empty query -> return empty
    const ranked = Array.from(docScore.entries())
      .map(([docId, score]) => {
        const len = docs.get(docId)?.tokensCount || 1;
        // incorporate doc length penalty
        const finalScore = score * (1 / Math.sqrt(len));
        return { docId, score: finalScore };
      })
      .sort((a, b) => b.score - a.score);

    const elapsedMs = Date.now() - t0;
    logQuery('search', { ...payload, top: ranked.slice(0, 20), elapsedMs });

    return {
      ok: true,
      mode,
      readonly,
      elapsedMs,
      query,
      results: ranked.slice(0, 50)
    };
  }

  return {
    mode,
    readonly,
    ingest,
    search
  };
}

