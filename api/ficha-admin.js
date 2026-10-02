// Login do ADM das fichas. Variáveis na Vercel: FICHAS_ADMIN_PASSWORD, FICHAS_SUPA_URL, FICHAS_SUPA_SERVICE_KEY
const crypto = require('crypto');
const sha = s => crypto.createHash('sha256').update(String(s)).digest();

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
  const ok = process.env.FICHAS_ADMIN_PASSWORD || '';
  const senha = (req.body || {}).senha || '';
  if (!ok || !crypto.timingSafeEqual(sha(senha), sha(ok))) return res.status(401).json({ error: 'Senha incorreta.' });
  try {
    const k = process.env.FICHAS_SUPA_SERVICE_KEY;
    const r = await fetch(`${process.env.FICHAS_SUPA_URL}/rest/v1/rpc/ficha_emitir_token`, {
      method: 'POST',
      headers: { apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_player_id: 'admin', p_nome: 'ADM', p_admin: true })
    });
    if (!r.ok) throw new Error('rpc');
    return res.status(200).json(await r.json());
  } catch (e) {
    return res.status(500).json({ error: 'Falha ao iniciar a sessão.' });
  }
};
