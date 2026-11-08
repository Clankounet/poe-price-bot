// Logique pure (sans réseau) : historique, détection de spikes, récap. Testée dans test/.

const H = 3600_000;

export function pct(from, to) {
  return from > 0 ? ((to - from) / from) * 100 : 0;
}

function isLiquid(e, cfg, factor = 1) {
  return e.chaos >= cfg.minChaos * factor && e.listings >= cfg.minListings * factor && !e.lowConfidence;
}

// Point de l'historique le plus proche de (now - windowMs), au moins 75 % aussi vieux que la fenêtre.
export function baselineAt(points, now, windowMs) {
  const target = now - windowMs;
  let best = null;
  for (const [ts, price] of points) {
    if (now - ts < windowMs * 0.75) continue;
    if (!best || Math.abs(ts - target) < Math.abs(best[0] - target)) best = [ts, price];
  }
  return best;
}

export function findSpikes(state, entries, now, cfg) {
  const windowMs = cfg.spikeWindowMin * 60_000;
  const alerts = [];
  for (const e of entries) {
    if (!isLiquid(e, cfg)) continue;
    const item = state.items[e.key];
    if (!item) continue;
    const base = baselineAt(item.points, now, windowMs);
    if (!base) continue;
    const change = pct(base[1], e.chaos);
    if (Math.abs(change) < cfg.spikePct) continue;
    if (change < 0 && !cfg.alertDrops) continue;

    const last = item.lastAlert;
    if (last && now - last.ts < cfg.cooldownHours * H && Math.abs(pct(last.price, e.chaos)) < cfg.reAlertPct) continue;

    alerts.push({ ...e, from: base[1], change, sinceMin: Math.round((now - base[0]) / 60_000) });
  }
  alerts.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  return alerts.slice(0, cfg.maxAlertsPerRun);
}

export function markAlerted(state, alerts, now) {
  for (const a of alerts) state.items[a.key].lastAlert = { ts: now, price: a.chaos };
}

// On garde l'historique des items « presque liquides » (moitié des seuils) pour voir venir ceux qui montent.
export function updateHistory(state, entries, now, cfg) {
  const keepFrom = now - cfg.historyHours * H;
  for (const e of entries) {
    const item = state.items[e.key];
    if (!item && !isLiquid(e, cfg, 0.5)) continue;
    const it = item ?? (state.items[e.key] = { points: [] });
    it.name = e.name;
    it.category = e.category;
    it.listings = e.listings;
    it.icon = e.icon;
    it.seen = now;
    it.points.push([now, Math.round(e.chaos * 100) / 100]);
    it.points = it.points.filter(([ts]) => ts >= keepFrom);
  }
  for (const [k, it] of Object.entries(state.items)) {
    if (now - it.seen > 48 * H) delete state.items[k];
  }
}

export function buildRecap(state, now, cfg) {
  const rows = [];
  for (const it of Object.values(state.items)) {
    if (now - it.seen > 2 * H || it.listings < cfg.minListings) continue;
    const cur = it.points.at(-1)?.[1];
    const base = baselineAt(it.points, now, 24 * H);
    if (!cur || !base || cur < cfg.minChaos) continue;
    rows.push({ name: it.name, category: it.category, from: base[1], to: cur, change: pct(base[1], cur) });
  }
  const gainers = rows.filter((r) => r.change > 0).sort((a, b) => b.change - a.change).slice(0, cfg.recapTop);
  const losers = rows.filter((r) => r.change < 0).sort((a, b) => a.change - b.change).slice(0, cfg.recapTop);
  return { gainers, losers, tracked: rows.length };
}

// Date et heure à Paris, pour déclencher le récap une fois par jour.
export function parisClock(now) {
  const f = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(new Date(now)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}

export function recapDue(state, now, cfg) {
  const { date, hour } = parisClock(now);
  return hour >= cfg.recapHour && state.lastRecap !== date ? date : null;
}
