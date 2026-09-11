const ALLOWED_ENDPOINTS = new Set([
  'sessoes',
  'estado',
  'desconectar',
  'fichas',
  'honey',
  'shiny-charm',
  'bonus',
]);

const SESSION_COOKIE = 'kp_fichas_token';
const FICHARIO_BASE_URL = 'https://kpfichas.vercel.app/api/integracoes/rolagens';

function readCookie(req, name) {
  const cookies = String(req.headers.cookie || '').split(';');
  const prefix = `${name}=`;
  const entry = cookies.map(cookie => cookie.trim()).find(cookie => cookie.startsWith(prefix));
  return entry ? decodeURIComponent(entry.slice(prefix.length)) : '';
}

function sessionCookie(token, maxAge) {
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${Math.max(0, Number(maxAge) || 0)}`,
  ].join('; ');
}

function bearerToken(req) {
  const authorization = String(req.headers.authorization || '');
  if (authorization.startsWith('Bearer ') && authorization !== 'Bearer cookie') {
    return authorization.slice(7);
  }
  return readCookie(req, SESSION_COOKIE);
}

function decodeSession(token) {
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  return {
    idUsuario: payload.idUsuario,
    username: payload.sub,
    expiresAt: payload.exp ? payload.exp * 1000 : null,
  };
}

async function upstreamRequest(endpoint, method, token, body) {
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${FICHARIO_BASE_URL}/${endpoint}`, {
    method,
    headers,
    body: method === 'GET' ? undefined : JSON.stringify(body || {}),
  });
}

export default async function handler(req, res) {
  const endpoint = String(req.query.endpoint || '');
  if (!ALLOWED_ENDPOINTS.has(endpoint)) {
    return res.status(404).json({ message: 'Endpoint de integração não encontrado.' });
  }

  const allowedMethods = ['fichas', 'estado'].includes(endpoint) ? ['GET'] : ['POST'];
  if (!allowedMethods.includes(req.method)) {
    res.setHeader('Allow', allowedMethods.join(', '));
    return res.status(405).json({ message: 'Método não permitido.' });
  }

  try {
    if (endpoint === 'desconectar') {
      res.setHeader('Set-Cookie', sessionCookie('', 0));
      return res.status(204).end();
    }

    if (endpoint === 'estado') {
      const token = bearerToken(req);
      if (!token) return res.status(401).json({ message: 'Fichário não conectado.' });

      const upstream = await upstreamRequest('fichas', 'GET', token);
      const responseBody = await upstream.text();
      if (!upstream.ok) {
        if (upstream.status === 401 || upstream.status === 403) {
          res.setHeader('Set-Cookie', sessionCookie('', 0));
        }
        res.status(upstream.status);
        res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
        return res.send(responseBody);
      }

      const session = decodeSession(token);
      return res.status(200).json({
        ...session,
        nome: session.username,
        fichas: responseBody ? JSON.parse(responseBody) : [],
      });
    }

    const upstream = await upstreamRequest(endpoint, req.method, bearerToken(req), req.body);
    const responseBody = await upstream.text();

    if (endpoint === 'sessoes' && upstream.ok) {
      const session = responseBody ? JSON.parse(responseBody) : {};
      if (!session.accessToken) {
        return res.status(502).json({ message: 'O Fichário não retornou uma sessão válida.' });
      }
      res.setHeader('Set-Cookie', sessionCookie(session.accessToken, session.expiresIn || 3600));
      return res.status(200).json(session);
    }

    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    return res.send(responseBody);
  } catch (error) {
    console.error('[fichario-proxy]', error);
    return res.status(502).json({ message: 'Não foi possível acessar o Fichário agora.' });
  }
}
