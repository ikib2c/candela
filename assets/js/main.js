/* CANDELA — Lógica de la landing
   ⚙️ CONFIGURACIÓN: reemplaza WHATSAPP_TIENDA por el número real de WhatsApp
   de la tienda (indicativo de país + número, sin espacios ni símbolos). */
const WHATSAPP_TIENDA = '573147247260';

const PACKS = {
  1: { unidades: 1, precio: 69900,  antes: 99900,  nombre: '1 tarro CANDELA 300ml',  detalle: '1 mes de ritual' },
  2: { unidades: 2, precio: 89900,  antes: 199800, nombre: '2 × CANDELA 300ml',      detalle: '2 meses de ritual · $44.950 c/u' },
  3: { unidades: 3, precio: 99900,  antes: 299700, nombre: '3 × CANDELA 300ml',      detalle: '3 meses de ritual · $33.300 c/u · + regalo sorpresa' }
};

const ENVIO_PRIORITARIO = 9900;
let packActual = 2;

/* Advanced Matching + Conversions API (Meta) */
const PIXEL_ID = '1283443887279567';
/* Sin backend no se puede llamar a la API de Conversiones directamente: al configurar
   un proxy propio (Cloudflare Worker / Make / función serverless) que reenvíe a
   https://graph.facebook.com/{PIXEL_ID}/events con el access token, escríbelo aquí.
   El token de acceso NUNCA va en este archivo (es secreto de servidor). */
const CAPI_ENDPOINT = '';

const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const cop = v => new Intl.NumberFormat('es-CO', { style:'currency', currency:'COP', minimumFractionDigits:0 }).format(v);

/* ============ Tracking de conversiones (Meta Pixel + GA4 + GTM dataLayer) ============
   Cada evento se envía a Meta (fbq), a Google Analytics 4 (gtag) y al dataLayer de
   Google Tag Manager con la misma información de compra (valor, moneda, ítem). */
const GA4_EVENTOS = {
  ViewContent: 'view_item',
  AddToCart: 'add_to_cart',
  InitiateCheckout: 'begin_checkout',
  Purchase: 'purchase'
};

function track(metaEvento, { pack, envio = 0, transaction_id } = {}) {
  const p = pack || PACKS[packActual];
  const value = p.precio + envio;
  const itemId = 'candela-300ml-' + p.unidades + '-tarros';
  const item = { item_id: itemId, item_name: p.nombre, item_category: 'Crema corporal', price: p.precio, quantity: 1 };
  const eventoGa4 = GA4_EVENTOS[metaEvento] || metaEvento.toLowerCase();

  if (typeof fbq === 'function') {
    const params = {
      value: value,
      currency: 'COP',
      content_type: 'product',
      content_ids: [itemId],
      content_name: p.nombre,
      num_items: p.unidades
    };
    if (transaction_id) fbq('track', metaEvento, params, { eventID: transaction_id });
    else fbq('track', metaEvento, params);
  }

  if (typeof gtag === 'function') {
    const params = { currency: 'COP', value: value, items: [item] };
    if (transaction_id) {
      params.transaction_id = transaction_id;
      if (envio) params.shipping = envio;
    }
    gtag('event', eventoGa4, params);
  }

  window.dataLayer = window.dataLayer || [];
  const ecommerce = { currency: 'COP', value: value, items: [item] };
  if (transaction_id) {
    ecommerce.transaction_id = transaction_id;
    if (envio) ecommerce.shipping = envio;
  }
  window.dataLayer.push({ event: eventoGa4, ecommerce: ecommerce });
}

/* Advanced Matching: normaliza el celular colombiano y lo envía hasheado (SHA-256 hex)
   con fbq('init', id, { ph }) para mejorar el match y la calidad de evento (EMQ). */
function normalizarTelefono(tel) {
  let d = String(tel || '').replace(/\D/g, '');
  if (d.length === 10) d = '57' + d;
  return d.length === 12 && d.indexOf('57') === 0 ? d : '';
}

async function hashSHA256(texto) {
  if (!(window.crypto && window.crypto.subtle)) return null;
  const buf = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

let phHashActual = null;
let phHashDe = '';

async function tipificarTelefono() {
  const campo = $('#fTelefono');
  if (!campo) return phHashActual;
  const norm = normalizarTelefono(campo.value);
  if (!norm || norm === phHashDe || typeof fbq !== 'function') return phHashActual;
  const h = await hashSHA256(norm);
  if (!h) return phHashActual;
  phHashDe = norm;
  phHashActual = h;
  fbq('init', PIXEL_ID, { ph: h });
  return h;
}

/* Conversions API (servidor): sin CAPI_ENDPOINT solo devuelve el payload
   (estándar Meta: data[].event_name/event_id/user_data.ph/custom_data). */
async function enviarCAPI(evento, eventID, phHash, valor, contentIds, numItems) {
  const payload = {
    data: [{
      event_name: evento,
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventID,
      action_source: 'website',
      user_data: phHash ? { ph: [phHash] } : {},
      custom_data: { currency: 'COP', value: valor, content_ids: contentIds, num_items: numItems }
    }]
  };
  if (!CAPI_ENDPOINT) return payload;
  try {
    await fetch(CAPI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true
    });
  } catch (e) { /* CAPI es complementaria: un fallo de red no afecta la conversión */ }
  return payload;
}

/* Consecutivo de pedido: CDL-AAMMDD-HHMMSS. Único (granularidad de segundo),
   legible para el asesor, ordenable cronológicamente y con la fecha embebida
   para seguimiento y trazabilidad. Es el mismo identificador que viaja como
   eventID de Meta, transaction_id de GA4 y event_id de la API de Conversiones. */
function numeroPedido() {
  const f = new Date();
  const p2 = n => String(n).padStart(2, '0');
  return 'CDL-' + String(f.getFullYear()).slice(2) + p2(f.getMonth() + 1) + p2(f.getDate()) +
    '-' + p2(f.getHours()) + p2(f.getMinutes()) + p2(f.getSeconds());
}

/* ============ Galería del héroe ============ */
function initGaleria(){
  const img = $('#heroImg');
  const cap = $('#heroCap');
  $$('.hero-miniaturas img').forEach(t => {
    t.addEventListener('click', () => {
      img.src = t.src;
      img.alt = t.alt.replace(/^Ver foto \d+: /, '');
      img.style.opacity = '0';
      setTimeout(() => img.style.opacity = '1', 120);
      $$('.hero-miniaturas img').forEach(x => x.classList.remove('on'));
      t.classList.add('on');
      if (cap && t.dataset.cap) {
        cap.textContent = t.dataset.cap;
        cap.classList.remove('pop');
        void cap.offsetWidth;
        cap.classList.add('pop');
      }
    });
  });
}

/* ============ Selector de packs ============ */
function initBundles(){
  $$('.bundle').forEach(b => {
    b.tabIndex = 0;
    b.setAttribute('role', 'button');
    b.setAttribute('aria-pressed', b.classList.contains('sel') ? 'true' : 'false');
    const elegir = () => {
      $$('.bundle').forEach(x => { x.classList.remove('sel'); x.setAttribute('aria-pressed', 'false'); });
      b.classList.add('sel');
      b.setAttribute('aria-pressed', 'true');
      packActual = parseInt(b.dataset.pack, 10);
      actualizarResumen();
      track('AddToCart', { pack: PACKS[packActual] });
      const p = PACKS[packActual];
      const ahorro = p.antes - p.precio;
      toast('¡Buena elección! Ahorras ' + cop(ahorro) + (p.unidades === 3 ? ' + regalo sorpresa 🎁' : ' 🎉'));
      flashSticky();
      actualizarPasos();
      const pedido = document.querySelector('#pedido');
      if (pedido) setTimeout(() => pedido.scrollIntoView({ behavior: 'smooth', block: 'start' }), 400);
    };
    b.addEventListener('click', elegir);
    b.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); elegir(); }
    });
  });
}

function packData(){
  return PACKS[packActual];
}

/* ============ Dopamina: feedback inmediato ============ */
let toastTimer;
function toast(mensaje){
  const t = $('#toast');
  if (!t) return;
  t.textContent = mensaje;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

function actualizarPasos(){
  const ids = ['fNombre', 'fTelefono', 'fCiudad', 'fDireccion'];
  const full = ids.every(i => { const e = $('#' + i); return e && e.value.trim() !== ''; }) && ($('#fDepartamento') || { value: '' }).value !== '';
  const p2 = document.querySelector('#pasosPedido .pp:nth-child(2)');
  if (p2) p2.classList.toggle('done', full);
}

function flashSticky(){
  const st = document.querySelector('.sticky-movil');
  if (!st) return;
  st.classList.remove('flash');
  void st.offsetWidth;
  st.classList.add('flash');
}

function envioActual(){
  const r = document.querySelector('input[name="envio"]:checked');
  return r && r.value === 'prioritario' ? ENVIO_PRIORITARIO : 0;
}

function actualizarResumen(){
  const p = packData();
  const sub = $('#resNombre');
  const det = $('#resDetalle');
  const mon = $('#resMonto');
  const tS  = $('#tSubtotal');
  const tE  = $('#tEnvio');
  const tT  = $('#tTotal');
  if (sub) sub.textContent = p.nombre;
  if (det) det.textContent = p.detalle;
  if (mon) mon.textContent = cop(p.precio);
  if (tS)  tS.textContent  = cop(p.precio);
  if (tE)  tE.textContent  = envioActual() > 0 ? cop(envioActual()) : 'Gratis';
  if (tT)  tT.textContent  = cop(p.precio + envioActual());
  const stPack = $('#stickyPack');
  const stPrecio = $('#stickyPrecio');
  const stAntes = $('#stickyAntes');
  if (stPack) stPack.textContent = 'PACK DE ' + p.unidades + ' · HOY';
  if (stPrecio) stPrecio.textContent = cop(p.precio);
  if (stAntes) stAntes.textContent = cop(p.antes);
}

function initEnvio(){
  $$('input[name="envio"]').forEach(r => r.addEventListener('change', actualizarResumen));
}

function irAlPedido(){
  actualizarResumen();
  const destino = $('#pedido');
  if (destino) destino.scrollIntoView({ behavior:'smooth' });
}

/* ============ Envío del pedido por WhatsApp ============ */
function initFormulario(){
  const form = $('#formPedido');
  if (!form) return;

  let checkoutIniciado = false;
  const marcarInicioCheckout = () => {
    if (checkoutIniciado) return;
    checkoutIniciado = true;
    track('InitiateCheckout', { pack: packData(), envio: envioActual() });
  };
  form.addEventListener('focusin', marcarInicioCheckout);
  form.addEventListener('input', () => { marcarInicioCheckout(); actualizarPasos(); tipificarTelefono(); });
  form.addEventListener('change', () => { marcarInicioCheckout(); actualizarPasos(); tipificarTelefono(); });

  form.addEventListener('submit', async e => {
    e.preventDefault();

    const nombre = $('#fNombre').value.trim();
    const telefono = $('#fTelefono').value.trim();
    const departamento = $('#fDepartamento').value;
    const ciudad = $('#fCiudad').value.trim();
    const direccion = $('#fDireccion').value.trim();
    const nota = $('#fNota').value.trim();
    const compromiso = $('#fCompromiso').checked;

    if (!nombre || !telefono || !departamento || !ciudad || !direccion){
      alert('Por favor completa todos los campos marcados con *.');
      return;
    }
    if (!compromiso){
      alert('Marca la casilla de compromiso para confirmar tu pedido.');
      return;
    }

    const p = packData();
    const envio = envioActual();
    const total = p.precio + envio;

    await tipificarTelefono();
    const eventID = numeroPedido();

    const lineas = [
      '*🔥 Nuevo pedido — CANDELA*',
      `*N.º de pedido:* ${eventID}`,
      '',
      `*Cliente:* ${nombre}`,
      `*Celular / WhatsApp:* ${telefono}`,
      `*Dirección:* ${direccion}`,
      `*Departamento:* ${departamento}`,
      `*Ciudad:* ${ciudad}`
    ];
    if (nota) lineas.push(`*Referencia:* ${nota}`);
    lineas.push(
      '',
      '*Pedido:*',
      `- ${p.nombre} — ${cop(p.precio)}`
    );
    if (packActual === 3) lineas.push('- Regalo sorpresa incluido');
    lineas.push(
      `*Envío:* ${envio > 0 ? 'Prioritario — ' + cop(envio) : 'Gratis'}`,
      `*TOTAL:* ${cop(total)}`,
      '',
      '*Método de pago:* Contraentrega (pago al recibir)',
      '',
      'Confirmo que recibiré y pagaré mi pedido en la entrega.'
    );
    const mensajePedido = encodeURIComponent(lineas.join('\n'));

    track('Purchase', { pack: p, envio: envio, transaction_id: eventID });
    enviarCAPI('Purchase', eventID, phHashActual, total, ['candela-300ml-' + p.unidades + '-tarros'], p.unidades);

    const p3 = document.querySelector('#pasosPedido .pp:nth-child(3)');
    if (p3) p3.classList.add('done');
    const overlay = $('#exito');
    if (overlay){
      overlay.classList.add('show');
      overlay.setAttribute('aria-hidden', 'false');
      setTimeout(() => {
        overlay.classList.remove('show');
        overlay.setAttribute('aria-hidden', 'true');
      }, 2400);
    }

    window.open(`https://wa.me/${WHATSAPP_TIENDA}?text=${mensajePedido}`, '_blank');
  });
}

/* ============ FAQ acordeón ============ */
function initFaq(){
  $$('.faq-item').forEach(item => {
    const q = item.querySelector('.faq-q');
    const a = item.querySelector('.faq-a');
    q.addEventListener('click', () => {
      const abierto = item.classList.contains('open');
      $$('.faq-item.open').forEach(o => {
        o.classList.remove('open');
        o.querySelector('.faq-a').style.maxHeight = null;
        o.querySelector('.faq-q').setAttribute('aria-expanded', 'false');
      });
      if (!abierto){
        item.classList.add('open');
        a.style.maxHeight = a.scrollHeight + 'px';
        q.setAttribute('aria-expanded', 'true');
      }
    });
  });
}

/* ============ Cuenta regresiva diaria (regalo sorpresa) ============ */
function initCuentaRegresiva(){
  const el = $('#cuentaRegresiva');
  if (!el) return;
  function tic(){
    const ahora = new Date();
    const fin = new Date(ahora);
    fin.setHours(23, 59, 59, 999);
    let dif = Math.max(0, fin - ahora);
    const h = String(Math.floor(dif / 3600000)).padStart(2, '0');
    const m = String(Math.floor((dif % 3600000) / 60000)).padStart(2, '0');
    const s = String(Math.floor((dif % 60000) / 1000)).padStart(2, '0');
    el.textContent = `${h}:${m}:${s}`;
  }
  tic();
  setInterval(tic, 1000);
}

/* ============ Aparición al hacer scroll ============ */
function initReveal(){
  const obs = new IntersectionObserver(entradas => {
    entradas.forEach(en => {
      if (en.isIntersecting){
        en.target.classList.add('vis');
        obs.unobserve(en.target);
      }
    });
  }, { threshold: 0.12 });
  $$('.reveal').forEach(el => obs.observe(el));
}

/* ============ Inicio ============ */
document.addEventListener('DOMContentLoaded', () => {
  initGaleria();
  initBundles();
  initEnvio();
  actualizarResumen();
  actualizarPasos();
  initFormulario();
  initFaq();
  initCuentaRegresiva();
  initReveal();
  const anio = $('#anio');
  if (anio) anio.textContent = new Date().getFullYear();
  track('ViewContent');
});
