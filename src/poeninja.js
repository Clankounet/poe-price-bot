// Client de l'API officielle poe.ninja (PoE1) : https://poe.ninja/docs/api
const BASE = 'https://poe.ninja/poe1/api/economy';
const HEADERS = {
  'User-Agent': 'poe-price-bot/1.1 (personal Discord alerts; github.com/Clankounet/poe-price-bot)',
  Accept: 'application/json',
};

// Catégories suivies, par endpoint.
const STASH_CURRENCY = ['Currency', 'Fragment'];
const STASH_ITEMS = [
  'UniqueWeapon', 'UniqueArmour', 'UniqueAccessory', 'UniqueFlask', 'UniqueJewel', 'UniqueMap',
  'UniqueTincture', 'UniqueRelic', 'ForbiddenJewel', 'SkillGem', 'ClusterJewel', 'Map',
  'Invitation', 'Incubator', 'Beast', 'Vial', 'Memory',
];
const EXCHANGE = [
  'DivinationCard', 'Scarab', 'Essence', 'Fossil', 'Resonator', 'Oil', 'DeliriumOrb',
  'Omen', 'Tattoo', 'Artifact', 'Astrolabe', 'Runegraft', 'AllflameEmber',
];

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

// La doc indique que la première league renvoyée est la league challenge en cours.
export async function resolveLeague(league) {
  if (league && league.toLowerCase() !== 'auto') return league;
  const leagues = (await getJson(`${BASE}/leagues`)) ?? [];
  console.log('Leagues poe.ninja :', leagues.map((l) => l.id ?? l.name).join(', '));
  const pick = leagues.find((l) => !/standard|hardcore|\bhc\b|ssf|ruthless/i.test(l.id ?? l.name)) ?? leagues[0];
  if (!pick) throw new Error('League introuvable automatiquement : renseigne la variable LEAGUE.');
  return pick.id ?? pick.name;
}

function currencyEntries(data, type) {
  const icons = new Map((data.currencyDetails ?? []).map((d) => [d.id, d.icon]));
  return (data.lines ?? []).map((l) => ({
    key: `cur:${l.detailsId ?? l.currencyTypeName}`,
    name: l.currencyTypeName,
    category: type,
    chaos: l.chaosEquivalent ?? 0,
    listings: l.receive?.listing_count ?? l.receive?.count ?? 0,
    lowConfidence: !l.receive,
    icon: icons.get(l.detailsId),
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
    key: `it:${type}:${l.detailsId ?? l.id}:${l.variant ?? ''}:${l.links ?? ''}:${l.gemLevel ?? ''}:${l.gemQuality ?? ''}:${l.corrupted ? 1 : 0}`,
    name: itemLabel(l),
    category: type,
    chaos: l.chaosValue ?? 0,
    listings: l.listingCount ?? 0,
    lowConfidence: (l.count ?? 0) < 5, // count = nombre d'observations derrière le prix
    icon: l.icon,
  }));
}

// Endpoint "exchange" : les prix sont exprimés dans une devise de référence (core.primary).
// On les convertit en chaos ; l'« activité » = volume échangé ramené en nombre d'unités.
function exchangeEntries(data, type, divineChaos) {
  const core = data.core ?? {};
  const primary = String(core.primary ?? '').toLowerCase();
  let chaosPerPrimary = null;
  if (primary.includes('chaos')) chaosPerPrimary = 1;
  else if (primary.includes('divine') && divineChaos) chaosPerPrimary = divineChaos;
  if (!chaosPerPrimary) {
    console.warn(`Exchange ${type} : devise de référence "${core.primary}" non gérée, catégorie ignorée.`);
    return [];
  }
  const meta = new Map((core.items ?? data.items ?? []).map((it) => [it.id, it]));
  return (data.lines ?? []).map((l) => {
    const chaos = (l.primaryValue ?? 0) * chaosPerPrimary;
    const volumeChaos = (l.volumePrimaryValue ?? 0) * chaosPerPrimary;
    const m = meta.get(l.id) ?? {};
    return {
      key: `ex:${type}:${l.id}`,
      name: m.name ?? l.id,
      category: type,
      chaos,
      listings: chaos > 0 ? Math.round(volumeChaos / chaos) : 0,
      lowConfidence: false,
      icon: m.icon,
    };
  });
}

export async function fetchMarket(league) {
  const entries = [];
  const errors = [];
  const q = encodeURIComponent(league);

  for (const type of STASH_CURRENCY) {
    try {
      const data = await getJson(`${BASE}/stash/current/currency/overview?league=${q}&type=${type}`);
      if (data) entries.push(...currencyEntries(data, type));
    } catch (e) { errors.push(`${type}: ${e.message}`); }
  }
  const divineChaos = entries.find((e) => e.name === 'Divine Orb')?.chaos || null;

  for (const type of STASH_ITEMS) {
    try {
      const data = await getJson(`${BASE}/stash/current/item/overview?league=${q}&type=${type}`);
      if (data) entries.push(...itemEntries(data, type));
    } catch (e) { errors.push(`${type}: ${e.message}`); }
    await sleep(250);
  }

  let logged = false;
  for (const type of EXCHANGE) {
    try {
      const data = await getJson(`${BASE}/exchange/current/overview?league=${q}&type=${type}`);
      if (!data) continue;
      if (!logged && data.lines?.length) { // aide au diagnostic si le format change
        console.log(`Exchange ${type} : primary=${data.core?.primary}, exemple=${JSON.stringify(data.lines?.[0] ?? null).slice(0, 300)}`);
        logged = true;
      }
      entries.push(...exchangeEntries(data, type, divineChaos));
    } catch (e) { errors.push(`${type}: ${e.message}`); }
    await sleep(250);
  }

  return { entries, divineChaos, errors };
}
