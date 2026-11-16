/* Cloudflare Worker — Conversions API de Meta para CANDELA
   ========================================================
   Despliegue (5 pasos, sin exponer el token nunca):
   1) npm install -g wrangler
   2) Guarda este archivo como capi-worker.js y al lado un wrangler.toml mínimo:
        name = "candela-capi"
        main = "capi-worker.js"
        compatibility_date = "2024-11-01"
   3) wrangler secret put META_CAPI_TOKEN   → pega aquí el token EAAz… (no va en ningún archivo)
   4) wrangler deploy  → te da la URL https://candela-capi.<tu-subdominio>.workers.dev
   5) Pega esa URL en assets/js/main.js (constante CAPI_ENDPOINT) y sube el repo.

   Verifica la configuración sin gastar eventos: añade el header
   "x-test-event-code: TEST12345" (código del Test Events de Events Manager). */
/* Endpoint del PIXEL (Meta enruta los eventos al dataset del pixel -> dedup
   Pixel↔CAPI garantizada). El dataset 895125782528202 "Ziay" es del tracking
   VIEJO: el token no tiene permisos sobre él (verificado contra Graph API). */
const DATASET_ID = '2230714121127146';
const ORIGEN_PERMITIDO = 'https://cremacelulitis.com';

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors(request) });
    }
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }
    const origin = request.headers.get('Origin') || '';
    if (origin && origin !== ORIGEN_PERMITIDO) {
      return new Response('Forbidden', { status: 403 });
    }
    let payload;
    try {
      payload = await request.json();
    } catch (e) {
      return new Response('Bad Request', { status: 400 });
    }
    /* Sanidad: solo eventos del funnel y máximo 10 por lote */
    const validos = ['ViewContent', 'AddToCart', 'InitiateCheckout', 'Purchase'];
    payload.data = (payload.data || []).filter(e => validos.includes(e.event_name)).slice(0, 10);
    if (!payload.data.length) {
      return new Response('No events', { status: 422 });
    }
    const token = env && env.META_CAPI_TOKEN;
    if (!token) {
      return new Response('Token no configurado (wrangler secret put META_CAPI_TOKEN)', { status: 500 });
    }
    const testCode = request.headers.get('x-test-event-code');
    const url = 'https://graph.facebook.com/v21.0/' + DATASET_ID + '/events'
      + '?access_token=' + encodeURIComponent(token)
      + (testCode ? '&test_event_code=' + encodeURIComponent(testCode) : '');
    let meta;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      meta = { status: res.status, body: await res.text() };
    } catch (e) {
      return new Response('Upstream error', { status: 502 });
    }
    return new Response(meta.body, { status: meta.status, headers: { 'Content-Type': 'application/json', ...cors(request) } });
  }
};

function cors(request) {
  return {
    'Access-Control-Allow-Origin': request.headers.get('Origin') === ORIGEN_PERMITIDO ? ORIGEN_PERMITIDO : '',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-test-event-code'
  };
}
