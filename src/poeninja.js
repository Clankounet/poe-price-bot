const BASE = 'https://poe.ninja/api/data';
const HEADERS = { 'User-Agent': 'poe-price-bot/1.0 (personal Discord alerts)', Accept: 'application/json' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(20000) });
      if (res.status === 404) return null; // catégorie absente pour cette league
      if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      await sleep(1500 * (i + 1));
    }
  }
  throw lastErr;
}

// Détecte la league challenge softcore trade en cours.
export async function resolveLeague(league) {
  if (league && league.toLowerCase() !== 'auto') return league;
  const idx = await getJson(`${BASE}/getindexstate`);
  const leagues = idx?.economyLeagues ?? [];
  const pick = leagues.find((l) => !/standard|hardcore|\bhc\b|ssf|ruthless|event/i.test(l.name));
  if (!pick) throw new Error('League introuvable automatiquement : renseigne la variable LEAGUE.');
  return pick.name;
}

function currencyEntries(data, type) {
  const icons = new Map((data.currencyDetails ?? []).map((d) => [d.name, d.icon]));
  return (data.lines ?? []).map((l) => ({
    key: `cur:${l.detailsId ?? l.currencyTypeName}`,
    name: l.currencyTypeName,
    category: type,
    chaos: l.chaosEquivalent ?? l.receive?.value ?? 0,
    listings: l.receive?.listing_count ?? l.receive?.count ?? 0,
    lowConfidence: !l.receive || (l.receiveSparkLine?.data?.length ?? 0) === 0,
    icon: icons.get(l.currencyTypeName),
  }));
}

function itemLabel(l) {
  const parts = [l.name];
  if (l.variant) parts.push(`[${l.variant}]`);
  if (l.links) parts.push(`${l.links}L`);
  if (l.gemLevel) parts.push(`lvl ${l.gemLevel}${l.gemQuality ? `/${l.gemQuality}%` : ''}`);
  if (l.mapTier) parts.push(`T${l.mapTier}`);
  if (l.corrupted) parts.push('corrompu');
  return parts.join(' ');
}

function itemEntries(data, type) {
  return (data.lines ?? []).map((l) => ({
    key: `it:${type}:${l.detailsId}:${l.variant ?? ''}:${l.links ?? ''}:${l.gemLevel ?? ''}:${l.gemQuality ?? ''}:${l.corrupted ? 1 : 0}`,
    name: itemLabel(l),
    category: type,
    chaos: l.chaosValue ?? 0,
    listings: l.listingCount ?? l.count ?? 0,
    lowConfidence: (l.sparkline?.data?.length ?? 0) === 0 && (l.lowConfidenceSparkline?.data?.length ?? 0) > 0,
    icon: l.icon,
  }));
}

export async function fetchMarket(league, cfg) {
  const entries = [];
  const errors = [];
  const q = encodeURIComponent(league);

  for (const type of cfg.currencyTypes) {
    try {
      const data = await getJson(`${BASE}/currencyoverview?league=${q}&type=${type}`);
      if (data) entries.push(...currencyEntries(data, type));
    } catch (e) { errors.push(`${type}: ${e.message}`); }
  }
  for (const type of cfg.itemTypes) {
    try {
      const data = await getJson(`${BASE}/itemoverview?league=${q}&type=${type}`);
      if (data) entries.push(...itemEntries(data, type));
    } catch (e) { errors.push(`${type}: ${e.message}`); }
    await sleep(250); // reste poli avec poe.ninja
  }

  const divine = entries.find((e) => e.key.startsWith('cur:') && e.name === 'Divine Orb');
  return { entries, divineChaos: divine?.chaos || null, errors };
}
