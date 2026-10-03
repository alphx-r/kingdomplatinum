// GET /api/fichas  ->  data/index.json (lista leve: sem imagens grandes)
const { readFile } = require('./_gh');
module.exports = async (req, res) => {
  try {
    const t = await readFile('data/index.json');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=15');
    return res.status(200).send(t || '[]');
  } catch (e) { return res.status(500).json({ error: e.message }); }
};
