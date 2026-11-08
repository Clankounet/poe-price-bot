import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { config } from './config.js';
import { resolveLeague, fetchMarket } from './poeninja.js';
import { findSpikes, markAlerted, updateHistory, buildRecap, recapDue } from './detect.js';
import { alertEmbed, recapEmbed, send, sendEmbeds } from './discord.js';

async function loadState(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return { league: null, items: {}, lastRecap: null }; }
}

async function saveState(path, state) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(state));
}

async function main() {
  const now = Date.now();
  if (!config.webhookUrl && !config.dryRun) throw new Error('DISCORD_WEBHOOK_URL manquant (ou lance avec --dry-run).');

  const league = await resolveLeague(config.league);
  const state = await loadState(config.statePath);

  // Changement de league : on repart d'un historique vide et on prévient sur Discord.
  if (state.league !== league) {
    if (state.league) await send(config.webhookUrl, { content: `🆕 Nouvelle league suivie : **${league}** (avant : ${state.league}). Les alertes reprennent dès qu'il y a assez d'historique.` }, config.dryRun);
    Object.assign(state, { league, items: {}, lastRecap: null });
  }

  const { entries, divineChaos, errors } = await fetchMarket(league);
  console.log(`League ${league} : ${entries.length} lignes récupérées, 1 div = ${divineChaos ?? '?'}c`);
  if (errors.length) console.warn('Catégories en erreur :\n ' + errors.join('\n '));
  if (entries.length === 0) throw new Error('Aucune donnée poe.ninja : API indisponible ou nom de league incorrect.');

  const alerts = findSpikes(state, entries, now, config);
  if (alerts.length) {
    await sendEmbeds(config.webhookUrl, alerts.map((a) => alertEmbed(a, divineChaos)), config.dryRun);
    markAlerted(state, alerts, now);
  }
  console.log(`${alerts.length} alerte(s) envoyée(s).`);

  updateHistory(state, entries, now, config);

  const recapDate = recapDue(state, now, config);
  if (recapDate) {
    const recap = buildRecap(state, now, config);
    if (recap.tracked > 0) await sendEmbeds(config.webhookUrl, [recapEmbed(recap, league, divineChaos)], config.dryRun);
    state.lastRecap = recapDate;
  }

  await saveState(config.statePath, state);
  console.log(`État sauvegardé : ${Object.keys(state.items).length} items suivis.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
