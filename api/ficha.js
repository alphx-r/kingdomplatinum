// GET /api/ficha?slug=zach  ->  conteúdo de data/fichas/zach.json (lido direto do GitHub)
const { readFile } = require('./_gh');
module.exports = async (req, res) => {
  try {
    const slug = String(req.query.slug || '');
    if (!/^[a-z0-9][a-z0-9-]{0,59}$/.test(slug)) return res.status(400).json({ error: 'Slug inválido.' });
    const t = await readFile(`data/fichas/${slug}.json`);
    if (t == null) { res.setHeader('Cache-Control', 's-maxage=5'); return res.status(404).json({ error: 'Ficha não encontrada.' }); }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=10');
    return res.status(200).send(t);
  } catch (e) { return res.status(500).json({ error: e.message }); }
};
