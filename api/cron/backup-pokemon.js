// /api/cron/backup-pokemon.js
//
// Roda 1x/dia via Vercel Cron (ver vercel.json). Lê a tabela `pokemons`
// do Supabase (fonte de verdade) e sobrescreve o pokemon.json no GitHub,
// que agora é só um backup/export estático — não é mais escrito pelo admin.
//
// Variáveis de ambiente necessárias (configurar no painel da Vercel,
// Project Settings → Environment Variables):
//   GITHUB_TOKEN   -> token com permissão de escrita no repo (NUNCA no client)
//   GITHUB_REPO    -> ex: "alphx-r/kingdomplatinum"
//   GITHUB_FILE    -> ex: "pokemon.json"
//   SUPA_URL       -> https://fatdzivyqipmcbzaiftc.supabase.co
//   SUPA_KEY       -> anon key (a mesma do admin já serve, já que a RLS de
//                      leitura é pública)
//   CRON_SECRET    -> (opcional, recomendado) string aleatória; a Vercel
//                      manda essa mesma string no header Authorization
//                      quando o cron dispara, e checamos abaixo.

export default async function handler(req, res) {
  // Proteção simples: só aceita chamada do próprio Vercel Cron (ou manual
  // com o secret certo), pra ninguém disparar isso via URL pública.
  const CRON_SECRET = process.env.CRON_SECRET;
  if (CRON_SECRET) {
    const auth = req.headers['authorization'] || '';
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return res.status(401).json({ error: 'unauthorized' });
    }
  }

  const { GITHUB_TOKEN, GITHUB_REPO, GITHUB_FILE = 'pokemon.json', SUPA_URL, SUPA_KEY } = process.env;

  if (!GITHUB_TOKEN || !GITHUB_REPO || !SUPA_URL || !SUPA_KEY) {
    return res.status(500).json({ error: 'Faltam variáveis de ambiente (GITHUB_TOKEN, GITHUB_REPO, SUPA_URL, SUPA_KEY).' });
  }

  try {
    // 1. Lê todos os Pokémon do Supabase
    const dbRes = await fetch(`${SUPA_URL}/rest/v1/pokemons?select=*`, {
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` }
    });
    if (!dbRes.ok) throw new Error('Supabase: ' + await dbRes.text());
    const pokemons = await dbRes.json();

    // Ordena por id numérico/alfanumérico pra ficar estável no diff do git
    pokemons.sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));

    // 2. Busca o SHA atual do arquivo no GitHub (necessário pra PUT)
    const API = `https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_FILE}`;
    const GH = { Authorization: `token ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json' };

    const metaRes = await fetch(API, { headers: GH });
    let sha = null;
    if (metaRes.ok) {
      const meta = await metaRes.json();
      sha = meta.sha;
    } else if (metaRes.status !== 404) {
      throw new Error('GitHub (buscar sha): ' + await metaRes.text());
    }

    // 3. Sobe o novo conteúdo
    const content = Buffer.from(JSON.stringify(pokemons, null, 2), 'utf-8').toString('base64');
    const body = {
      message: `chore: backup automático pokemon.json (${new Date().toISOString().slice(0, 10)})`,
      content,
      ...(sha ? { sha } : {})
    };

    const putRes = await fetch(API, {
      method: 'PUT',
      headers: { ...GH, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!putRes.ok) throw new Error('GitHub (PUT): ' + await putRes.text());

    return res.status(200).json({ ok: true, count: pokemons.length, updated_at: new Date().toISOString() });
  } catch (e) {
    console.error('backup-pokemon falhou:', e);
    return res.status(500).json({ error: e.message });
  }
}
