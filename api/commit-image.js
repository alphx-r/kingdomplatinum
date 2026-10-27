// api/commit-image.js — commita UMA imagem em sprites/ no repositório.
// Chamada pelo itemdex_adm.html. O token do GitHub fica só na Vercel
// (variável de ambiente GITHUB_TOKEN, a mesma usada por /api/commit-items);
// o navegador nunca vê o token.
//
// Body (JSON): { path, contentBase64, admin, message? }
//   path          ex.: "sprites/items/great-ball.png"
//   contentBase64 conteúdo da imagem em base64 (sem o prefixo "data:...")
//   admin         nome do admin logado (o mesmo de localStorage 'adm_session')
//
// Resposta: { ok:true, path, sha, commit }  — "sha" é o do arquivo (blob).

const REPO = process.env.GITHUB_REPO || 'alphx-r/kingdomplatinum';
const BRANCH = process.env.GITHUB_BRANCH || 'main';

// Mesmo projeto/chave usados pelo painel para validar o admin (admin_list).
// A chave "anon" já é pública no HTML do painel.
const AUTH_SUPA_URL = process.env.AUTH_SUPA_URL || 'https://ucbkodkjlbatttiuqjtv.supabase.co';
const AUTH_SUPA_KEY = process.env.AUTH_SUPA_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjYmtvZGtqbGJhdHR0aXVxanR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3NjExODcsImV4cCI6MjA5MzMzNzE4N30.a65MSk7m4DvgTw2pHXhaqMOOEpjTB_wPsXJUfvOGiG4';

// Só deixa escrever imagens nestas pastas (nada de código nem outras áreas).
// sprites/items/[<categoria>/]<arquivo>  ou  sprites/rewards/<badges|ribbons|pins|randoms>/<arquivo>
const PATH_RE = /^sprites\/(items(\/[\p{L}\p{N}][\p{L}\p{N}._ -]*)?|rewards\/(badges|ribbons|pins|randoms))\/[a-z0-9][a-z0-9._-]*\.(png|webp|gif|jpg|jpeg)$/u;
const MAX_B64 = 2_000_000; // ~1,5 MB de imagem

async function adminValido(nome) {
  if (!nome) return false;
  try {
    const r = await fetch(`${AUTH_SUPA_URL}/rest/v1/rpc/admin_list`, {
      method: 'POST',
      headers: { apikey: AUTH_SUPA_KEY, Authorization: 'Bearer ' + AUTH_SUPA_KEY, 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!r.ok) return false;
    const lista = await r.json();
    return (lista || []).some(a => a.nome === nome);
  } catch (e) {
    return false;
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido.' });
  }
  const token = process.env.GITHUB_TOKEN;
  if (!token) return res.status(500).json({ error: 'GITHUB_TOKEN não configurado na Vercel.' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  const { path, contentBase64, admin, message } = body || {};

  if (!path || !PATH_RE.test(path) || path.includes('..')) {
    return res.status(400).json({ error: 'Caminho não permitido. Use sprites/items/<categoria>/ ou sprites/rewards/<badges|ribbons|pins|randoms>/ com nome em minúsculas.' });
  }
  if (!contentBase64 || !/^[A-Za-z0-9+/=]+$/.test(contentBase64)) {
    return res.status(400).json({ error: 'Imagem inválida.' });
  }
  if (contentBase64.length > MAX_B64) {
    return res.status(413).json({ error: 'Imagem grande demais (máx. ~1,5 MB).' });
  }
  if (!(await adminValido(admin))) {
    return res.status(401).json({ error: 'Sessão de admin inválida. Faça login de novo no painel.' });
  }

  const api = `https://api.github.com/repos/${REPO}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;
  const H = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'kingdomplatinum-itemdex-adm',
  };

  try {
    // Se o arquivo já existe, o GitHub exige o sha dele para sobrescrever.
    let sha;
    const cur = await fetch(`${api}?ref=${encodeURIComponent(BRANCH)}`, { headers: H });
    if (cur.ok) {
      const j = await cur.json();
      sha = j.sha;
    } else if (cur.status !== 404) {
      return res.status(502).json({ error: `GitHub respondeu HTTP ${cur.status} ao checar o arquivo.` });
    }

    const put = await fetch(api, {
      method: 'PUT',
      headers: { ...H, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: String(message || `Atualiza ${path}`).slice(0, 200),
        content: contentBase64,
        branch: BRANCH,
        ...(sha ? { sha } : {}),
      }),
    });
    const data = await put.json().catch(() => ({}));
    if (!put.ok) {
      return res.status(502).json({ error: data.message || `GitHub respondeu HTTP ${put.status} ao commitar.` });
    }
    return res.status(200).json({ ok: true, path, sha: data.content?.sha, commit: data.commit?.sha });
  } catch (e) {
    return res.status(500).json({ error: 'Erro ao falar com o GitHub: ' + e.message });
  }
};
