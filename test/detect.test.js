import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findSpikes, markAlerted, updateHistory, buildRecap, recapDue, baselineAt } from '../src/detect.js';

const M = 60_000;
const cfg = {
  spikePct: 30, spikeWindowMin: 60, alertDrops: true, minChaos: 20, minListings: 15,
  cooldownHours: 6, reAlertPct: 25, maxAlertsPerRun: 15, recapHour: 19, recapTop: 10, historyHours: 26,
};
const entry = (key, chaos, listings = 50) => ({ key, name: key, category: 'Test', chaos, listings, lowConfidence: false });

function simulate(series, step = 15 * M) {
  const state = { items: {}, lastRecap: null };
  const t0 = Date.UTC(2026, 10, 13, 12);
  const log = [];
  series.forEach((entries, i) => {
    const now = t0 + i * step;
    const alerts = findSpikes(state, entries, now, cfg);
    markAlerted(state, alerts, now);
    updateHistory(state, entries, now, cfg);
    log.push(alerts);
  });
  return { state, log };
}

test('pas d’alerte sans historique suffisant', () => {
  const { log } = simulate([[entry('a', 50)], [entry('a', 100)]]);
  assert.equal(log.flat().length, 0);
});

test('spike détecté sur 1 h', () => {
  const series = [50, 50, 50, 50, 80].map((p) => [entry('a', p)]);
  const { log } = simulate(series);
  assert.equal(log[4].length, 1);
  assert.equal(Math.round(log[4][0].change), 60);
});

test('chute détectée, et ignorée si alertDrops=false', () => {
  const series = [100, 100, 100, 100, 50].map((p) => [entry('a', p)]);
  assert.equal(simulate(series).log[4].length, 1);
  cfg.alertDrops = false;
  assert.equal(simulate(series).log[4].length, 0);
  cfg.alertDrops = true;
});

test('item illiquide ou trop bon marché ignoré', () => {
  const s1 = [50, 50, 50, 50, 100].map((p) => [entry('a', p, 3)]);
  const s2 = [5, 5, 5, 5, 10].map((p) => [entry('a', p)]);
  assert.equal(simulate(s1).log.flat().length, 0);
  assert.equal(simulate(s2).log.flat().length, 0);
});

test('cooldown : pas de doublon, mais re-alerte si ça continue de monter fort', () => {
  const prices = [50, 50, 50, 50, 80, 82, 84, 85, 86, 120];
  const { log } = simulate(prices.map((p) => [entry('a', p)]));
  const hits = log.map((l, i) => (l.length ? i : null)).filter((i) => i !== null);
  assert.deepEqual(hits, [4, 9]);
});

test('baseline ignore les points trop récents', () => {
  const now = 10 * 60 * M;
  assert.equal(baselineAt([[now - 10 * M, 1]], now, 60 * M), null);
  assert.deepEqual(baselineAt([[now - 70 * M, 1], [now - 55 * M, 2], [now - 5 * M, 3]], now, 60 * M), [now - 55 * M, 2]);
});

test('récap 24 h et déclenchement une fois par jour à 19 h Paris', () => {
  const series = Array.from({ length: 98 }, (_, i) => [entry('up', 40 + i), entry('down', 200 - i), entry('flat', 30)]);
  const { state } = simulate(series);
  const now = Date.UTC(2026, 10, 13, 12) + 97 * 15 * M;
  const recap = buildRecap(state, now, cfg);
  assert.equal(recap.gainers[0].name, 'up');
  assert.equal(recap.losers[0].name, 'down');

  const at18 = Date.UTC(2026, 10, 14, 17, 0); // 18 h Paris
  const at19 = Date.UTC(2026, 10, 14, 18, 5); // 19 h 05 Paris
  assert.equal(recapDue({ lastRecap: null }, at18, cfg), null);
  assert.equal(recapDue({ lastRecap: null }, at19, cfg), '2026-11-14');
  assert.equal(recapDue({ lastRecap: '2026-11-14' }, at19, cfg), null);
});
