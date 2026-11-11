/**
 * Automated Search Quality & Performance Regression Suite
 * Covers brand, manufacturer, composition, combined attributes, joined spacing,
 * strengths, Hindi/Devanagari queries, negative relevance checks, equivalent
 * brand discovery, and latency percentiles via the shared search engine module.
 *
 * Usage: node tests/search-regression.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { createOphthalmicSearchEngine } from '../public/search-engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const db = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'public', 'assets', 'data', 'ophthalmic-products.json'), 'utf8')
);

const t0 = performance.now();
const engine = createOphthalmicSearchEngine(db.items);
const initMs = performance.now() - t0;

const checks = [
  // Brands
  { name: 'Brand: Moxicip', q: 'Moxicip', verify: (r) => r.results[0]?.n.toLowerCase().includes('moxicip') },
  { name: 'Brand: Systane', q: 'Systane', verify: (r) => r.results[0]?.n.toLowerCase().includes('systane') },
  { name: 'Brand: Refresh Tears', q: 'Refresh Tears', verify: (r) => r.results[0]?.n.toLowerCase().includes('refresh tears') },
  { name: 'Brand: Lubrex DS', q: 'Lubrex DS', verify: (r) => r.results[0]?.n.toLowerCase().includes('lubrex') },

  // Manufacturers
  { name: 'Mfr: Cipla', q: 'Cipla', verify: (r) => r.results.length >= 5 && r.results.slice(0, 5).every((x) => x.m.includes('Cipla')) },
  { name: 'Mfr typo: Sipla -> Cipla', q: 'Sipla', verify: (r) => r.results.length >= 5 && r.results.slice(0, 5).every((x) => x.m.includes('Cipla')) },
  { name: 'Mfr: Alcon', q: 'Alcon', verify: (r) => r.results.length >= 5 && r.results.slice(0, 5).every((x) => x.m.includes('Alcon') || x.n.includes('Alcon')) },
  { name: 'Mfr: Allergan', q: 'Allergan', verify: (r) => r.results.length >= 3 && r.results.slice(0, 3).every((x) => x.m.includes('Allergan')) },

  // Compositions & Synonyms
  { name: 'Comp: Moxifloxacin', q: 'Moxifloxacin', verify: (r) => r.results.length >= 5 && r.results.slice(0, 5).every((x) => x.c.toLowerCase().includes('moxifloxacin')) },
  { name: 'Comp abbr: CMC', q: 'CMC', verify: (r) => r.results.length >= 5 && r.results.slice(0, 5).every((x) => x.c.toLowerCase().includes('carboxymethyl')) },
  { name: 'Comp: Carboxymethylcellulose', q: 'Carboxymethylcellulose', verify: (r) => r.results.length >= 5 && r.results.slice(0, 5).every((x) => x.c.toLowerCase().includes('carboxymethyl')) },
  { name: 'Comp: Sodium Hyaluronate', q: 'Sodium Hyaluronate', verify: (r) => r.results.length >= 5 && r.results.slice(0, 5).every((x) => x.c.toLowerCase().includes('hyaluronate')) },
  { name: 'Semantic: Artificial tears', q: 'Artificial tears', verify: (r) => r.results.length >= 5 && r.results.slice(0, 5).every((x) => (x.k || '').includes('lubricant')) },

  // Combined multi-attribute
  {
    name: 'Combined: Cipla Moxifloxacin (Top 1 both Cipla & Moxifloxacin)',
    q: 'Cipla Moxifloxacin',
    verify: (r) => r.results[0]?.m.includes('Cipla') && r.results[0]?.c.toLowerCase().includes('moxifloxacin'),
  },
  {
    name: 'Combined: Cipla Moxifloxacin 0.5% eye drops',
    q: 'Cipla Moxifloxacin 0.5% eye drops',
    verify: (r) =>
      r.results[0]?.m.includes('Cipla') &&
      r.results[0]?.c.toLowerCase().includes('moxifloxacin') &&
      r.results[0]?.s.includes('0.5%') &&
      r.results[0]?.f === 'Eye Drops',
  },
  {
    name: 'Combined: Allergan CMC (Top 1 both Allergan & Carboxymethylcellulose)',
    q: 'Allergan CMC',
    verify: (r) => r.results[0]?.m.includes('Allergan') && r.results[0]?.c.toLowerCase().includes('carboxymethyl'),
  },
  {
    name: 'Combined: Alcon HPMC (Top 1 both Alcon & HPMC)',
    q: 'Alcon HPMC',
    verify: (r) => r.results[0]?.m.includes('Alcon') && r.results[0]?.c.toLowerCase().includes('hydroxypropyl'),
  },
  {
    name: 'Combined fallback: Alcon CMC (returns Alcon lubricants, never bogus Ahlcon)',
    q: 'Alcon CMC',
    verify: (r) => r.results.length > 0 && r.results[0]?.m.includes('Alcon') && (r.results[0]?.k || '').includes('lubricant') && !r.results[0]?.m.includes('Ahlcon'),
  },
  {
    name: 'Combined: Moxicip 0.5%',
    q: 'Moxicip 0.5%',
    verify: (r) => r.results[0]?.n.toLowerCase().includes('moxicip') && (r.results[0]?.s || r.results[0]?.c || '').includes('0.5%'),
  },
  {
    name: 'Combined: Refresh Tears 10ml',
    q: 'Refresh Tears 10ml',
    verify: (r) => r.results[0]?.n.toLowerCase().includes('refresh tears') && r.results[0]?.p.toLowerCase().includes('10 ml'),
  },
  {
    name: 'Combined: Timolol eye drops',
    q: 'Timolol eye drops',
    verify: (r) => r.results.length >= 5 && r.results[0]?.c.toLowerCase().includes('timolol') && r.results[0]?.f === 'Eye Drops',
  },
  {
    name: 'Form: Eye ointment',
    q: 'Eye ointment',
    verify: (r) => r.results.length >= 5 && r.results.slice(0, 5).every((x) => x.f === 'Eye Ointment'),
  },
  {
    name: 'Incomplete: Moxi / Carboxy / Cip',
    q: 'Carboxy',
    verify: (r) => r.results.length >= 5 && r.results.slice(0, 5).every((x) => `${x.n} ${x.c}`.toLowerCase().includes('carboxy')),
  },

  // Compact spacing
  { name: 'Spacing: Refreshtears', q: 'Refreshtears', verify: (r) => r.results[0]?.n.toLowerCase().includes('refresh tears') },
  { name: 'Spacing: LubrexDS', q: 'LubrexDS', verify: (r) => r.results[0]?.n.toLowerCase().includes('lubrex') },

  // Typos
  { name: 'Typo: Moxisipp -> Moxicip', q: 'Moxisipp', verify: (r) => r.results[0]?.n.toLowerCase().includes('moxicip') },
  { name: 'Typo: Carboxymethylcellullose', q: 'Carboxymethylcellullose', verify: (r) => r.results.length >= 5 && r.results[0]?.c.toLowerCase().includes('carboxymethyl') },

  // Strengths
  { name: 'Strength: 0.5%', q: '0.5%', verify: (r) => r.results.length >= 5 && r.results.slice(0, 5).every((x) => `${x.s} ${x.c}`.includes('0.5%')) },
  { name: 'Strength: 1%', q: '1%', verify: (r) => r.results.length >= 5 && r.results.slice(0, 5).every((x) => `${x.s} ${x.c}`.includes('1%')) },
  { name: 'Strength: 0.3%', q: '0.3%', verify: (r) => r.results.length >= 5 && r.results.slice(0, 5).every((x) => `${x.s} ${x.c}`.includes('0.3%')) },

  // Hindi / Devanagari
  { name: 'Hindi: सिपला', q: 'सिपला', verify: (r) => r.results.length >= 5 && r.results.slice(0, 5).every((x) => x.m.includes('Cipla')) },
  { name: 'Hindi: रिफ्रेश टियर्स', q: 'रिफ्रेश टियर्स', verify: (r) => r.results[0]?.n.toLowerCase().includes('refresh tears') },
  { name: 'Hindi: मोक्सीफ्लोक्सासिन', q: 'मोक्सीफ्लोक्सासिन', verify: (r) => r.results.length >= 5 && r.results.slice(0, 5).every((x) => x.c.toLowerCase().includes('moxifloxacin')) },

  // Negative relevance checks
  {
    name: 'Neg: Systane must not include unrelated non-Systane antibiotics/drugs',
    q: 'Systane',
    verify: (r) => r.results.length >= 3 && r.results.every((x) => x.n.toLowerCase().includes('systane') || x.b.toLowerCase().includes('systane')),
  },
  {
    name: 'Neg: 0.5% must not return 5% as exact/top match',
    q: 'Moxifloxacin 0.5%',
    verify: (r) => r.results.length >= 5 && r.results.slice(0, 10).every((x) => `${x.s} ${x.c}`.includes('0.5%') && !`${x.s} ${x.c}`.includes('(5%')),
  },
  {
    name: 'Equiv: Missing brand or verified alternatives for Moxifloxacin 0.5% Eye Drops',
    q: 'ZedMoxiFakeBrand Eye Drop',
    verify: (r) => r.results.length === 0 && (r.alternatives?.length || 0) === 0,
  },
  {
    name: 'Equiv: Searching Moxicip returns verified same-composition/same-strength alternatives (different brands)',
    q: 'Moxicip',
    verify: (r) =>
      Array.isArray(r.alternatives) &&
      r.alternatives.length >= 5 &&
      r.alternatives.every(
        (alt) =>
          !alt.b.toLowerCase().includes('moxicip') &&
          alt.c.toLowerCase().includes('moxifloxacin') &&
          alt.s.toLowerCase().includes('0.5%') &&
          alt.f === 'Eye Drops'
      ),
  },
  {
    name: 'Equiv: Unrelated missing brand stays empty without bogus matches',
    q: 'CompletelyNonExistentOphthalmicX99',
    verify: (r) => r.results.length === 0,
  },
];

const latencies = [];
let passed = 0;
let failed = 0;

for (const tc of checks) {
  const s = performance.now();
  const res = engine.search(tc.q, 24);
  const dt = performance.now() - s;
  latencies.push(dt);
  const ok = Boolean(tc.verify(res));
  if (ok) {
    passed += 1;
    console.log(`PASS [${dt.toFixed(2)}ms] ${tc.name}`);
  } else {
    failed += 1;
    console.log(`FAIL [${dt.toFixed(2)}ms] ${tc.name} -> top3=${JSON.stringify(res.results.slice(0, 3).map((x) => `${x.n} (${x.m} | ${x.s})`))}, alts=${res.alternatives?.length ?? 'n/a'}`);
  }
}

latencies.sort((a, b) => a - b);
const p50 = latencies[Math.floor(latencies.length * 0.5)];
const p95 = latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))];

console.log('\n=== SUMMARY ===');
console.log(`Indexed items: ${engine.getCount()}`);
console.log(`Index init time: ${initMs.toFixed(2)} ms`);
console.log(`Search p50: ${p50.toFixed(2)} ms | p95: ${p95.toFixed(2)} ms`);
console.log(`Passed: ${passed}/${checks.length}, Failed: ${failed}`);
if (failed > 0) process.exitCode = 1;
