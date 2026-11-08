// Tous les réglages passent par des variables d'environnement (GitHub Secrets / Variables),
// avec des valeurs par défaut raisonnables pour la league PoE1 en softcore trade.

const num = (v, d) => (v === undefined || v === '' ? d : Number(v));
const bool = (v, d) => (v === undefined || v === '' ? d : ['1', 'true', 'yes'].includes(String(v).toLowerCase()));

export const config = {
  webhookUrl: process.env.DISCORD_WEBHOOK_URL || '',
  // "auto" = league challenge actuelle détectée sur poe.ninja. Sinon le nom exact, ex. "Mercenaries".
  league: process.env.LEAGUE || 'auto',
  dryRun: process.argv.includes('--dry-run') || bool(process.env.DRY_RUN, false),
  statePath: process.env.STATE_PATH || 'state/state.json',

  // Détection de spikes
  spikePct: num(process.env.SPIKE_PCT, 30),             // variation minimale en % sur la fenêtre
  spikeWindowMin: num(process.env.SPIKE_WINDOW_MIN, 60), // fenêtre de comparaison en minutes
  alertDrops: bool(process.env.ALERT_DROPS, true),       // alerter aussi sur les chutes
  minChaos: num(process.env.MIN_CHAOS, 20),              // ignore ce qui vaut moins (en chaos)
  minListings: num(process.env.MIN_LISTINGS, 15),        // liquidité minimale (nombre d'annonces)
  cooldownHours: num(process.env.COOLDOWN_HOURS, 6),     // pas de nouvelle alerte sur le même item avant ce délai...
  reAlertPct: num(process.env.REALERT_PCT, 25),          // ...sauf s'il a encore bougé de ce % depuis la dernière alerte
  maxAlertsPerRun: num(process.env.MAX_ALERTS, 15),

  // Récap quotidien (heure de Paris)
  recapHour: num(process.env.RECAP_HOUR, 19),
  recapTop: num(process.env.RECAP_TOP, 10),

  historyHours: 26,

  // Catégories poe.ninja PoE1
  currencyTypes: ['Currency', 'Fragment'],
  itemTypes: [
    'UniqueWeapon', 'UniqueArmour', 'UniqueAccessory', 'UniqueFlask', 'UniqueJewel', 'UniqueMap',
    'SkillGem', 'DivinationCard', 'Essence', 'Fossil', 'Resonator', 'Scarab', 'Oil', 'Incubator',
    'DeliriumOrb', 'Omen', 'Tattoo', 'Invitation', 'Artifact', 'Beast', 'Map', 'Vial',
  ],
};
