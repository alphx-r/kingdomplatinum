// /lib/backupPokemon.js
//
// Lógica compartilhada do backup: lê a tabela `pokemons` do Supabase (fonte
// de verdade) e sobrescreve o pokemon.json no GitHub (backup/export estático).
// Usada tanto pelo cron diário (/api/cron/backup-pokemon) quanto pelo botão
// manual do admin (/api/admin/backup-pokemon-now) — mesmo código, duas portas
// de entrada com regras de acesso diferentes.

export async function backupPokemonToGithub() {
  const { GITHUB_TOKEN, GITHUB_REPO, GITHUB_FILE = 'pokemon.json', SUPA_URL, SUPA_KEY } = process.env;
  if (!GITHUB_TOKEN || !GITHUB_REPO || !SUPA_URL || !SUPA_KEY) {
    const err = new Error('Faltam variáveis de ambiente (GITHUB_TOKEN, GITHUB_REPO, SUPA_URL, SUPA_KEY).');
    err.statusCode = 500;
    throw err;
  }

  // 1. Lê todos os Pokémon do Supabase (paginado — o PostgREST limita a
  //    1000 linhas por request por padrão, então busca em blocos até acabar)
  const pokemons = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const dbRes = await fetch(`${SUPA_URL}/rest/v1/pokemons?select=*`, {
      headers: {
        apikey: SUPA_KEY,
        Authorization: `Bearer ${SUPA_KEY}`,
        Range: `${from}-${from + pageSize - 1}`
      }
    });
    if (!dbRes.ok && dbRes.status !== 206) throw new Error('Supabase: ' + await dbRes.text());
    const page = await dbRes.json();
    pokemons.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }
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

  return { ok: true, count: pokemons.length, updated_at: new Date().toISOString() };
}
