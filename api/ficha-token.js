// Vercel serverless: valida o player no projeto do index e emite o token no projeto das fichas.
// Variáveis de ambiente (Vercel > Settings > Environment Variables, marcadas para Production):
//   INDEX_SUPA_URL, INDEX_SUPA_KEY            -> projeto do index (URL e chave anon)
//   FICHAS_SUPA_URL, FICHAS_SUPA_SERVICE_KEY  -> projeto das fichas (URL e chave service_role, NUNCA no front)
const H = k => ({ apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' });
const ENV = ['INDEX_SUPA_URL', 'INDEX_SUPA_KEY', 'FICHAS_SUPA_URL', 'FICHAS_SUPA_SERVICE_KEY'];

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });

  const falta = ENV.filter(k => !process.env[k]);
  if (falta.length) {
    console.error('ficha-token: variáveis de ambiente faltando:', falta.join(', '));
    return res.status(500).json({ error: 'Servidor sem configuração.' });
  }

  const { nome, senha } = req.body || {};
  if (!nome || !senha) return res.status(400).json({ error: 'Informe nome e senha.' });

  try {
    const a = await fetch(`${process.env.INDEX_SUPA_URL}/rest/v1/rpc/player_login`, {
      method: 'POST', headers: H(process.env.INDEX_SUPA_KEY),
      body: JSON.stringify({ p_nome: nome, p_senha: senha })
    });
    if (!a.ok) return res.status(401).json({ error: 'Nome ou senha incorretos.' });
    let r = await a.json(); r = Array.isArray(r) ? r[0] : r;
    if (!r || r.id == null) return res.status(401).json({ error: 'Nome ou senha incorretos.' });

    const b = await fetch(`${process.env.FICHAS_SUPA_URL}/rest/v1/rpc/ficha_emitir_token`, {
      method: 'POST', headers: H(process.env.FICHAS_SUPA_SERVICE_KEY),
      body: JSON.stringify({ p_player_id: String(r.id), p_nome: r.nome || nome })
    });
    if (!b.ok) {
      console.error('ficha-token: ficha_emitir_token falhou:', b.status, await b.text().catch(() => ''));
      return res.status(500).json({ error: 'Falha ao iniciar a sessão.' });
    }
    return res.status(200).json(await b.json());
  } catch (e) {
    console.error('ficha-token:', e);
    return res.status(500).json({ error: 'Erro no servidor.' });
  }
};
