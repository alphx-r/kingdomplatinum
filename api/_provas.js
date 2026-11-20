// Provas de Valor (página editável do index) — fica em data/provasdevalor.json no repo (kpfichas_db)
//   GET  /api/ficha-salvar?provas=1                       -> { html, atualizado, por }
//   POST /api/ficha-salvar {action:'provas_salvar', nome, senha, por, html}   (só ADM: nome+senha do player)
const { readFile, commit } = require('./_gh');
const CAMINHO = 'data/provasdevalor.json';
const MAX_HTML = 400000;

// Mesma checagem de ADM do "atribuir": RPC admin_login no projeto do index
async function admDe(b) {
  const { nome, senha } = b;
  if (!nome || !senha) return { st: 401, erro: 'Informe o nome e a senha do admin.' };
  const IU = process.env.INDEX_SUPA_URL, IK = process.env.INDEX_SUPA_KEY;
  if (!IU || !IK) return { st: 500, erro: 'Servidor sem configuração (INDEX_SUPA_URL ou INDEX_SUPA_KEY).' };
  const a = await fetch(`${IU}/rest/v1/rpc/admin_login`, {
    method: 'POST', headers: { apikey: IK, Authorization: 'Bearer ' + IK, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_nome: nome, p_senha: senha }),
  });
  if (!a.ok) return a.status === 400 ? { st: 403, erro: 'Nome ou senha de admin incorretos.' } : { st: 502, erro: 'Não consegui conferir o admin (HTTP ' + a.status + ').' };
  let adm = await a.json().catch(() => null); adm = Array.isArray(adm) ? adm[0] : adm;
  if (!adm || !adm.nome) return { st: 403, erro: 'Nome ou senha de admin incorretos.' };
  return { adm };
}

async function obter(res) {
  const t = await readFile(CAMINHO);
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=5');
  return res.status(200).send(t || '{}');
}

async function acao(action, b, res) {
  if (action !== 'provas_salvar') return res.status(400).json({ error: 'Ação inválida.' });
  const r = await admDe(b);
  if (!r.adm) return res.status(r.st).json({ error: r.erro });
  const html = b.html;
  if (typeof html !== 'string' || !html.trim()) return res.status(400).json({ error: 'Conteúdo vazio.' });
  if (html.length > MAX_HTML) return res.status(413).json({ error: 'Conteúdo grande demais.' });
  const por = String(b.por || r.adm.nome).slice(0, 60);
  const conteudo = JSON.stringify({ html, atualizado: new Date().toISOString(), por });
  await commit(async () => [{ path: CAMINHO, content: conteudo }], `provas de valor: atualização por ${por}`);
  return res.json({ ok: true });
}

module.exports = { obter, acao };
