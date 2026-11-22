// /api/admin/backup-pokemon-now.js
//
// Botão "Commit pokemon.json" do datadex_adm.html.
//
// POST  → o ADM manda o pokemon.json (gzip) e esta rota só COMMITA no GitHub
//         usando o helper _gh.js. Não consulta o Supabase.
// POST com Content-Type: application/json → upload de sprites (ver _upload-sprite.js).
//         Fica aqui para não criar uma função nova (limite de 12 no plano Hobby).
// POST com Content-Type: text/plain → LEITURA do pokemon.json atual (gzip), sem cache e sem limite da API pública.
// GET   → comportamento antigo (backupPokemonToGithub, igual ao cron).
//
// Variáveis: GH_REPO, GH_TOKEN, GH_BRANCH (já usadas pelo _gh.js) e,
// opcionalmente, POKEMON_JSON_PATH (padrão "pokemon.json" — use o
// mesmo caminho que o lib/backupPokemon.js escreve).

import { gunzipSync, gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { commit, readFile } from '../_gh.js';
import { handleUploadSprite } from '../_upload-sprite.js';
import { backupPokemonToGithub } from '../../lib/backupPokemon.js';

const JSON_PATH = process.env.POKEMON_JSON_PATH || 'pokemon.json';
// Impressão digital do pokemon.json: o navegador calcula a mesma coisa (SHA-256 de JSON.stringify da lista já lida)
const hashRows = rows => createHash('sha256').update(JSON.stringify(rows)).digest('hex');

// Leitura do pokemon.json ATUAL do GitHub (sem cache de CDN e sem o limite de 60 consultas/h da API pública),
// usando o GH_TOKEN que esta rota já tem. Sem função nova: entra aqui como POST text/plain (corpo "read").
// Vai em gzip porque o arquivo (~3,7 MB) passa perto do limite de resposta da Vercel (4,5 MB).
async function lerPokemonJson(res) {
  const repo = process.env.GH_REPO, token = process.env.GH_TOKEN, branch = process.env.GH_BRANCH || 'main';
  if (!repo || !token) return res.status(500).json({ error: 'GH_REPO / GH_TOKEN não configurados.' });
  const r = await fetch(`https://api.github.com/repos/${repo}/contents/${encodeURI(JSON_PATH)}?ref=${encodeURIComponent(branch)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.raw+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'kp-adm',
    },
  });
  if (!r.ok) return res.status(r.status).json({ error: 'GitHub HTTP ' + r.status });
  const gz = gzipSync(Buffer.from(await r.arrayBuffer()));
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Encoding', 'gzip');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).send(gz);
}

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
  // POST em JSON = upload de sprite (o backup do pokemon.json manda application/octet-stream)
  if (req.method === 'POST' && String(req.headers['content-type'] || '').includes('application/json')) {
    return handleUploadSprite(req, res);
  }
  // POST text/plain = só LER o pokemon.json atual (ver lerPokemonJson). Não grava nada.
  if (req.method === 'POST' && String(req.headers['content-type'] || '').includes('text/plain')) {
    try { return await lerPokemonJson(res); }
    catch (e) { console.error('leitura do pokemon.json falhou:', e); return res.status(500).json({ error: e.message }); }
  }
  try {
    if (req.method === 'GET') {
      return res.status(200).json(await backupPokemonToGithub());
    }

    const raw = await readBody(req);
    if (!raw.length) return res.status(400).json({ error: 'Corpo vazio.' });

    // Corpo = lista de Pokémon (formato antigo) OU { rows, ifMatch } (formato novo).
    // ifMatch = impressão digital do pokemon.json que o ADM conferiu/mesclou: só grava se o GitHub AINDA estiver assim.
    let rows, ifMatch = null;
    try {
      const parsed = JSON.parse(gunzipSync(raw).toString('utf8'));
      if (Array.isArray(parsed)) rows = parsed;
      else { rows = parsed && parsed.rows; ifMatch = typeof (parsed && parsed.ifMatch) === 'string' ? parsed.ifMatch : null; }
    } catch {
      return res.status(400).json({ error: 'Corpo inválido (esperado JSON em gzip).' });
    }
    // trava de segurança: nunca commitar um arquivo vazio/estranho por cima do atual
    if (!Array.isArray(rows) || !rows.length || rows.some(p => !p || p.id == null)) {
      return res.status(400).json({ error: 'pokemon.json inválido: precisa ser uma lista não vazia com "id" em cada item.' });
    }

    const content = JSON.stringify(rows);
    let unchanged = false, remotoMudou = false;
    const sha = await commit(async parent => {
      unchanged = false; remotoMudou = false;   // o commit() refaz este bloco se outro commit entrar no meio
      const atual = await readFile(JSON_PATH, parent);   // lê o commit-PAI exato (nunca uma leitura atrasada do ramo)
      if (ifMatch && atual != null) {
        let h = null;
        try { h = hashRows(JSON.parse(atual)); } catch {}
        if (h !== ifMatch) { remotoMudou = true; return []; }   // alguém commitou depois que o ADM mesclou: não grava; o ADM mescla de novo
      }
      if (atual === content) { unchanged = true; return []; }
      return [{ path: JSON_PATH, content }];
    }, `chore: atualiza pokemon.json (${rows.length} Pokémon) via ADM [skip ci]`);

    if (remotoMudou) return res.status(409).json({ code: 'remoto_mudou', error: 'O pokemon.json mudou no GitHub desde que você conferiu (outro admin commitou agora). Nada foi gravado.' });
    if (unchanged || !sha) return res.status(200).json({ unchanged: true, total: rows.length });
    return res.status(200).json({ ok: true, commit: sha, total: rows.length });
  } catch (e) {
    console.error('backup-pokemon-now falhou:', e);
    return res.status(e.statusCode || 500).json({ error: e.message });
  }
}
