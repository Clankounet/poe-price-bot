const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function fmtPrice(chaos, divineChaos) {
  const c = chaos >= 100 ? Math.round(chaos) : Math.round(chaos * 10) / 10;
  if (divineChaos && chaos >= divineChaos * 0.5) return `${(chaos / divineChaos).toFixed(2)} div (${c}c)`;
  return `${c}c`;
}

const sign = (n) => `${n > 0 ? '+' : ''}${Math.round(n)}%`;

export function alertEmbed(a, divineChaos) {
  const up = a.change > 0;
  return {
    title: `${up ? '📈' : '📉'} ${a.name}  ${sign(a.change)}`.slice(0, 256),
    description: `${fmtPrice(a.from, divineChaos)} → **${fmtPrice(a.chaos, divineChaos)}** en ${a.sinceMin} min`,
    color: up ? 0x2ecc71 : 0xe74c3c,
    fields: [
      { name: 'Catégorie', value: a.category, inline: true },
      { name: 'Annonces', value: String(a.listings), inline: true },
    ],
    ...(a.icon ? { thumbnail: { url: a.icon } } : {}),
  };
}

export function recapEmbed(recap, league, divineChaos) {
  const line = (r) => `\`${sign(r.change).padStart(5)}\` ${r.name} — ${fmtPrice(r.from, divineChaos)} → ${fmtPrice(r.to, divineChaos)}`;
  const block = (rows) => (rows.length ? rows.map(line).join('\n') : '_Rien de notable_').slice(0, 1024);
  return {
    title: `🗞️ Récap 24 h — ${league}`,
    color: 0x3498db,
    fields: [
      { name: 'Top hausses', value: block(recap.gainers) },
      { name: 'Top baisses', value: block(recap.losers) },
    ],
    footer: { text: `${recap.tracked} items suivis${divineChaos ? ` · 1 div = ${Math.round(divineChaos)}c` : ''}` },
  };
}

export function trendEmbed(trends, cfg, divineChaos) {
  const line = (t) => `\`${sign(t.change).padStart(5)}\` ${t.name} — ${fmtPrice(t.from, divineChaos)} → **${fmtPrice(t.chaos, divineChaos)}** · ${t.listings} annonces`;
  let desc = '';
  for (const t of trends) {
    const l = line(t) + '\n';
    if ((desc + l).length > 4000) break;
    desc += l;
  }
  return {
    title: `📊 Hausses sur ${cfg.trendWindowHours} h (≥ +${cfg.trendPct} %)`,
    description: desc,
    color: 0xf1c40f,
  };
}

export async function send(webhookUrl, payload, dryRun) {
  if (dryRun || !webhookUrl) {
    console.log('[dry-run] Discord :', JSON.stringify(payload, null, 2));
    return;
  }
  for (let i = 0; i < 4; i++) {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'PoE Price Bot', ...payload }),
    });
    if (res.status === 429) {
      const body = await res.json().catch(() => ({}));
      await sleep(((body.retry_after ?? 2) * 1000) + 250);
      continue;
    }
    if (!res.ok) throw new Error(`Discord HTTP ${res.status}: ${await res.text()}`);
    return;
  }
  throw new Error('Discord : trop de rate limits');
}

// Discord limite à 10 embeds par message.
export async function sendEmbeds(webhookUrl, embeds, dryRun, content) {
  for (let i = 0; i < embeds.length; i += 10) {
    await send(webhookUrl, { ...(i === 0 && content ? { content } : {}), embeds: embeds.slice(i, i + 10) }, dryRun);
    await sleep(500);
  }
}
