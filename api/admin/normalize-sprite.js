const { fetchBuffer, normalizeBuffer, uploadToSupabase } = require('../../lib/normalizeSprite');

// POST /api/admin/normalize-sprite
// Body: { "url": "https://...png", "bucket": "pokemons", "path": "normalized/25.png" }
// Resposta: { "publicUrl": "https://.../storage/v1/object/public/pokemons/normalized/25.png" }
//
// Segue o mesmo padrão da rota /api/admin/backup-pokemon-now: sem CRON_SECRET,
// pensada pra ser chamada só a partir do próprio painel admin (que já tem seu
// próprio controle de acesso no front). Se quiser travar mais, dá pra exigir
// um header (ver comentário ADMIN_API_SECRET mais abaixo).
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST' });
    return;
  }

  // Descomente estas 3 linhas se quiser proteger a rota com um segredo:
  // const secret = req.headers['x-admin-secret'];
  // if (process.env.ADMIN_API_SECRET && secret !== process.env.ADMIN_API_SECRET) {
  //   res.status(401).json({ error: 'Não autorizado' }); return;
  // }

  const { url, bucket, path } = req.body || {};
  if (!url || !bucket || !path) {
    res.status(400).json({ error: 'Faltando url, bucket ou path no corpo da requisição' });
    return;
  }

  const supabaseUrl = process.env.SUPA_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPA_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    res.status(500).json({ error: 'SUPA_URL / SUPA_KEY não configurados nas env vars da Vercel' });
    return;
  }

  try {
    const original = await fetchBuffer(url);
    const normalized = await normalizeBuffer(original);
    const publicUrl = await uploadToSupabase(normalized, { bucket, path, supabaseUrl, supabaseKey });
    res.status(200).json({ publicUrl });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
