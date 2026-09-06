import { onRequestGet } from '../functions/api/youtube-search.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/youtube-search') {
      if (request.method !== 'GET') {
        return new Response(JSON.stringify({ error: '只接受搜尋請求' }), {
          status: 405,
          headers: { 'content-type': 'application/json; charset=utf-8' }
        });
      }
      return onRequestGet({ request, env });
    }

    return env.ASSETS.fetch(request);
  }
};
