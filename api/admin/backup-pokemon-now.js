// /api/admin/backup-pokemon-now.js
//
// Botão "Commit pokemon.json" do datadex_adm.html.
//
// POST  → o ADM manda o pokemon.json (gzip) e esta rota só COMMITA no GitHub
//         usando o helper _gh.js. Não consulta o Supabase.
// GET   → comportamento antigo (backupPokemonToGithub, igual ao cron).
//
// Variáveis: GH_REPO, GH_TOKEN, GH_BRANCH (já usadas pelo _gh.js) e,
// opcionalmente, POKEMON_JSON_PATH (padrão "public/pokemon.json" — use o
// mesmo caminho que o lib/backupPokemon.js escreve).

import { gunzipSync } from 'node:zlib';
import { commit, readFile } from '../_gh.js';
import { backupPokemonToGithub } from '../../lib/backupPokemon.js';

const JSON_PATH = process.env.POKEMON_JSON_PATH || 'public/pokemon.json';

async function readBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

export const config = { api: { bodyParser: false } }; // (Next.js) corpo cru; na Vercel pura é ignorado

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Método não permitido.' });
  }
  try {
    if (req.method === 'GET') {
      return res.status(200).json(await backupPokemonToGithub());
    }

    const raw = await readBody(req);
    if (!raw.length) return res.status(400).json({ error: 'Corpo vazio.' });

    let rows;
    try {
      rows = JSON.parse(gunzipSync(raw).toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'Corpo inválido (esperado JSON em gzip).' });
    }
    // trava de segurança: nunca commitar um arquivo vazio/estranho por cima do atual
    if (!Array.isArray(rows) || !rows.length || rows.some(p => !p || p.id == null)) {
      return res.status(400).json({ error: 'pokemon.json inválido: precisa ser uma lista não vazia com "id" em cada item.' });
    }

    const content = JSON.stringify(rows);
    let unchanged = false;
    const sha = await commit(async () => {
      const atual = await readFile(JSON_PATH);
      if (atual === content) { unchanged = true; return []; }
      return [{ path: JSON_PATH, content }];
    }, `chore: atualiza pokemon.json (${rows.length} Pokémon) via ADM`);

    if (unchanged || !sha) return res.status(200).json({ unchanged: true, total: rows.length });
    return res.status(200).json({ ok: true, total: rows.length, commit: sha });
  } catch (e) {
    console.error('backup-pokemon-now falhou:', e);
    return res.status(e.statusCode || 500).json({ error: e.message });
  }
}
