/* CANDELA — Lógica de la landing
   ⚙️ CONFIGURACIÓN: números de WhatsApp de la tienda
   (indicativo de país + número, sin espacios ni símbolos).
   WHATSAPP_PEDIDOS: recibe los pedidos enviados desde el formulario.
   WHATSAPP_ATENCION: información, PQRS, reclamos y asesor humano. */
const WHATSAPP_PEDIDOS = '573160868408';
const WHATSAPP_ATENCION = '573173671930';

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
      addCartOrigen = packActual;
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

let addCartOrigen = null;
function pedirDesdeSticky(e){
  if (e) e.preventDefault();
  if (addCartOrigen !== packActual){
    addCartOrigen = packActual;
    track('AddToCart', { pack: PACKS[packActual] });
  }
  irAlPedido();
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
  const limpiarErrorCampo = destino => {
    const campo = destino && destino.closest && destino.closest('.campo, .cod-compromiso');
    if (!campo) return;
    campo.classList.remove('campo-error');
    const aviso = campo.querySelector('.campo-err');
    if (aviso) aviso.remove();
  };
  form.addEventListener('input', e => { marcarInicioCheckout(); actualizarPasos(); tipificarTelefono(); limpiarErrorCampo(e.target); });
  form.addEventListener('change', e => { marcarInicioCheckout(); actualizarPasos(); tipificarTelefono(); limpiarErrorCampo(e.target); });

  form.addEventListener('submit', async e => {
    e.preventDefault();

    const nombre = $('#fNombre').value.trim();
    const telefono = $('#fTelefono').value.trim();
    const departamento = $('#fDepartamento').value;
    const ciudad = $('#fCiudad').value.trim();
    const direccion = $('#fDireccion').value.trim();
    const nota = $('#fNota').value.trim();
    const compromiso = $('#fCompromiso').checked;

    $$('#formPedido .campo-err').forEach(e => e.remove());
    $$('#formPedido .campo-error').forEach(c => c.classList.remove('campo-error'));
    let primerError = null;
    const marcar = (el, mensaje) => {
      if (!el) return;
      const campo = el.closest('.campo, .cod-compromiso');
      if (!campo) return;
      campo.classList.add('campo-error');
      const aviso = document.createElement('small');
      aviso.className = 'campo-err';
      aviso.textContent = mensaje;
      campo.appendChild(aviso);
      if (!primerError) primerError = el;
    };
    const soloDigitos = telefono.replace(/\D/g, '');
    if (!nombre) marcar($('#fNombre'), 'Escribe tu nombre completo.');
    if (!/^\d{10}$/.test(soloDigitos) || soloDigitos[0] !== '3') marcar($('#fTelefono'), 'Ingresa un celular de 10 dígitos que empiece por 3 (ej. 300 123 4567).');
    if (!departamento) marcar($('#fDepartamento'), 'Selecciona tu departamento.');
    if (!ciudad) marcar($('#fCiudad'), 'Escribe tu ciudad o municipio.');
    if (!direccion) marcar($('#fDireccion'), 'Escribe tu dirección de entrega.');
    if (!compromiso) marcar($('#fCompromiso'), 'Marca la casilla de compromiso para confirmar tu pedido.');
    if (primerError){
      primerError.scrollIntoView({ behavior: 'smooth', block: 'center' });
      primerError.focus({ preventScroll: true });
      return;
    }

    const p = packData();
    const envio = envioActual();
    const total = p.precio + envio;

    await tipificarTelefono();
    const eventID = numeroPedido();

    const lineas = [
      '*Nuevo pedido — CANDELA*',
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
    if ($('#fReto') && $('#fReto').checked) lineas.push('- Me uno al reto de las 21 noches (envíenme el checklist)');
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

    window.open(`https://wa.me/${WHATSAPP_PEDIDOS}?text=${mensajePedido}`, '_blank');
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

/* ============ Efecto "vuela a la oferta" (fly-to-cart) ============
 * Inspirado en los catálogos de venta: al tocar la imagen, esta vuela
 * con una curva hacia la oferta y la página baja sola a #oferta.
 * Respeta prefers-reduced-motion (vuelve a un simple anclaje suave). */
function initVuelo(){
  const objetivoOferta = $('#bundles');
  const reducir = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  $$('.historias .galeria-historias figure img, .hero-foto img, .creativos-img').forEach(img => {
    img.closest('figure')?.classList.add('vuela-cta');
    img.addEventListener('click', () => {
      if (window.__vueloEnCurso) return;
      window.__vueloEnCurso = true;
      if (window.fbq) fbq('trackCustom', 'VueloOferta', { zona: img.closest('.hero-foto') ? 'hero' : 'historias' });
      if (window.gtag) gtag('event', 'vuelo_oferta');
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: 'vuelo_oferta' });
      const burbuja = document.createElement('img');
      burbuja.src = img.currentSrc || img.src;
      burbuja.alt = '';
      burbuja.setAttribute('aria-hidden', 'true');
      burbuja.className = 'vuelo-clon';
      const desde = img.getBoundingClientRect();
      burbuja.style.left = desde.left + 'px';
      burbuja.style.top = desde.top + 'px';
      burbuja.style.width = desde.width + 'px';
      burbuja.style.height = desde.height + 'px';
      document.body.appendChild(burbuja);
      img.style.visibility = 'hidden';
      const destino = (objetivoOferta?.getBoundingClientRect()) || { left: innerWidth / 2 - 40, top: innerHeight / 2 - 40, width: 80, height: 80 };
      const deltaY = destino.top - desde.top;
      const deltaX = destino.left - desde.left;
      requestAnimationFrame(() => {
        burbuja.style.transform = `translate(${deltaX * 0.92}px, ${deltaY * 0.96}px) scale(0.08) rotate(8deg)`;
        burbuja.style.opacity = '0.35';
      });
      if (reducir) {
        $('#oferta').scrollIntoView({ behavior: 'auto' });
      } else {
        $('#oferta').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      setTimeout(() => {
        burbuja.remove();
        img.style.visibility = '';
        window.__vueloEnCurso = false;
      }, 700);
      flashSticky();
    });
  });
}

/* ============ Variante de ángulo (?ang=postparto): message match con la pauta ============ */
const VARIANTE_POSTPARTO = [
  { sel: '.hero .chip',        html: '💛 Pensada para mamás · estrías postparto' },
  { sel: '.hero h1',           html: 'Estrías de <span class="mano">postparto</span>: recupera tu piel <span class="mano">noche a noche</span>' },
  { sel: '.hero .bajada',      html: 'CANDELA es la <strong>crema para estrías de embarazo y postparto</strong> con <strong>efecto calor</strong>: un ritual de 5 minutos mientras tu bebé duerme que hidrata a profundidad y ayuda a que tu piel se vea más firme, lisa y uniforme.' },
  { sel: '#historia h2',       html: '¿Las estrías del <em>embarazo te quitan confianza?</em>' },
  { sel: '#historia .sub',     html: 'No estás sola, mamá: tu piel se estiró al darte vida y puede verse mejor con un ritual simple de 5 minutos cada noche.' },
  { sel: '#resultados .eyebrow', html: 'El reto de las 21 noches · mamás' }
];
const TESTIMONIOS_POSTPARTO = [
  { a: 'C', n: 'Camila Restrepo', t: '"Después de tener a mi hija, las estrías rojas del embarazo me quitaban la confianza. Tres semanas aplicando Candela cada noche y ya se ven mucho más tenues. Se lo recomiendo a cualquier mamá."' },
  { a: 'L', n: 'Laura Betancur',  t: '"Soy mamá primeriza y no tenía tiempo para mí. Lo aplico mientras el bebé duerme: la piel se siente más firme y ese rato se volvió mi ritual favorito."' },
  { a: 'V', n: 'Valentina Osorio', t: '"Tras mi segundo embarazo, el abdomen quedó con flacidez. El efecto calor se siente riquísimo y el reto de las 21 noches me mantuvo constante: ya noto la diferencia."' }
];

function initAngulo(){
  const params = new URLSearchParams(location.search);
  const señal = [params.get('ang'), params.get('angulo'), params.get('utm_content'), params.get('utm_campaign')]
    .join(' ').toLowerCase();
  if (señal.indexOf('postparto') === -1) return;
  document.body.dataset.angulo = 'postparto';
  VARIANTE_POSTPARTO.forEach(c => { const el = document.querySelector(c.sel); if (el) el.innerHTML = c.html; });
  $$('.testi').slice(0, 3).forEach((t, i) => {
    const d = TESTIMONIOS_POSTPARTO[i];
    if (!d) return;
    const av = t.querySelector('.avatar');
    const nb = t.querySelector('.cab b');
    const tx = t.querySelector('p');
    if (av) av.textContent = d.a;
    if (nb) nb.textContent = d.n;
    if (tx) tx.textContent = d.t;
  });
  if (typeof fbq === 'function') fbq('trackCustom', 'AnguloPostparto');
  if (typeof gtag === 'function') gtag('event', 'angulo_postparto');
}

/* ============ Inicio ============ */
document.addEventListener('DOMContentLoaded', () => {
  initAngulo();
  initGaleria();
  initBundles();
  initEnvio();
  actualizarResumen();
  actualizarPasos();
  initFormulario();
  initFaq();
  initCuentaRegresiva();
  initReveal();
  initVuelo();
  const anio = $('#anio');
  if (anio) anio.textContent = new Date().getFullYear();
  track('ViewContent');
});
