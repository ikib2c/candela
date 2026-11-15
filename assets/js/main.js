/* CANDELA — Lógica de la landing
   ⚙️ CONFIGURACIÓN: números de WhatsApp de la tienda
   (indicativo de país + número, sin espacios ni símbolos).
   WHATSAPP_PEDIDOS: recibe los pedidos enviados desde el formulario.
   WHATSAPP_ATENCION: información, PQRS, reclamos y asesor humano. */
const WHATSAPP_PEDIDOS = '573504379870';
const WHATSAPP_ATENCION = '573504379692';
const LINK_MP = 'https://link.mercadopago.com.co/ziayiki';

const PACKS = {
  1: { unidades: 1, precio: 69900,  antes: 99900,  nombre: '1 tarro CANDELA 300ml',  detalle: '1 mes de ritual' },
  2: { unidades: 2, precio: 89900,  antes: 199800, nombre: '2 × CANDELA 300ml',      detalle: '2 meses de ritual · $44.950 c/u' },
  3: { unidades: 3, precio: 99900,  antes: 299700, nombre: '3 × CANDELA 300ml',      detalle: '3 meses de ritual · $33.300 c/u · + regalo sorpresa' }
};

const ENVIO_PRIORITARIO = 9900;
const DESCUENTO_ONLINE = 0.10;
let packActual = 2;

/* Advanced Matching + Conversions API (Meta) */
const PIXEL_ID = '2230714121127146';
const DOMINIO = 'https://cremacelulitis.com/';
/* Conversions API: dataset de Meta (Propietario: Ziay). El endpoint debe ser un
   proxy propio (Cloudflare Worker listo en deploy/capi-worker.js) que reenvíe a
   https://graph.facebook.com/v21.0/{DATASET}/events. El token de acceso NUNCA va
   en este archivo: se guarda como secreto del worker (wrangler secret put). */
const CAPI_DATASET = '895125782528202';
const CAPI_ENDPOINT = '';

/* Señales de Meta para CAPI/EMQ: cookie _fbp y _fbc (derivada de ?fbclid) */
let fbpActual = '';
let fbcActual = '';
function leerCookie(nombre){
  const m = document.cookie.match('(?:^|;\\s*)' + nombre + '=([^;]*)');
  return m ? decodeURIComponent(m[1]) : '';
}
function initSenalesMeta(){
  fbpActual = leerCookie('_fbp');
  const fbclid = new URLSearchParams(location.search).get('fbclid');
  if (fbclid){
    fbcActual = 'fb.1.' + Date.now() + '.' + fbclid;
    document.cookie = '_fbc=' + fbcActual + ';max-age=7776000;path=/;SameSite=Lax';
  } else {
    fbcActual = leerCookie('_fbc');
  }
}

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

function track(metaEvento, { pack, envio = 0, transaction_id, valor, pago } = {}) {
  const p = pack || PACKS[packActual];
  /* valor: monto REAL de la transacción. En Purchase online el cliente paga el
     pack con 10% de descuento (+ envío prioritario si aplica): reportar a Meta
     el precio de lista inflaría los ingresos y sesgaría el ROAS. */
  const value = typeof valor === 'number' && !isNaN(valor) ? valor : (p.precio + envio);
  const itemId = 'candela-300ml-' + p.unidades + '-tarros';
  const item = { item_id: itemId, item_name: p.nombre, item_category: 'Crema corporal', price: value, quantity: p.unidades };
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
    /* Param custom para conversiones/segmentos por método de pago */
    if (pago) params.pago = pago;
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
let identidadDe = '';

/* Advanced Matching ampliado: celular (ph) + nombre (fn) + ciudad (ct) +
   departamento (st), hasheados SHA-256. Mejora el match quality (EMQ) del
   Pixel y la calidad de eventos de la CAPI. */
async function tipificarTelefono() {
  if (typeof fbq !== 'function') return phHashActual;
  const norm = normalizarTelefono($('#fTelefono') ? $('#fTelefono').value : '');
  const nombre = ($('#fNombre') && $('#fNombre').value || '').trim().toLowerCase();
  const ciudad = ($('#fCiudad') && $('#fCiudad').value || '').trim().toLowerCase();
  const depto = ($('#fDepartamento') && $('#fDepartamento').value || '').trim().toLowerCase();
  const clave = norm + '|' + nombre + '|' + ciudad + '|' + depto;
  if (!clave.replace(/\|/g, '') || clave === identidadDe) return phHashActual;
  const datos = {};
  if (norm){ const h = await hashSHA256(norm); if (h){ phHashActual = h; datos.ph = h; } }
  if (nombre){ const h = await hashSHA256(nombre); if (h) datos.fn = h; }
  if (ciudad){ const h = await hashSHA256(ciudad); if (h) datos.ct = h; }
  if (depto){ const h = await hashSHA256(depto); if (h) datos.st = h; }
  if (!Object.keys(datos).length) return phHashActual;
  identidadDe = clave;
  fbq('init', PIXEL_ID, datos);
  return phHashActual;
}

/* Conversions API (servidor): sin CAPI_ENDPOINT solo devuelve el payload
   (estándar Meta: data[].event_name/event_id/user_data/custom_data). El worker
   de deploy/capi-worker.js completa el token como secreto. */
async function enviarCAPI(evento, eventID, phHash, valor, contentIds, numItems) {
  const user_data = phHash ? { ph: [phHash] } : {};
  if (fbpActual) user_data.fbp = fbpActual;
  if (fbcActual) user_data.fbc = fbcActual;
  if (navigator.userAgent) user_data.client_user_agent = navigator.userAgent;
  const payload = {
    data: [{
      event_name: evento,
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventID,
      event_source_url: DOMINIO,
      action_source: 'website',
      user_data: user_data,
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

/* ============ Selector de packs ============
   Dos espejos sincronizados: .bundle (sección #oferta) y .pack-hero-row
   (buy box del héroe). La lógica de elección es compartida; solo el
   auto-scroll al formulario cambia (desde el héroe no se empuja). */
function sincronizarPacks(n){
  $$('.bundle').forEach(x => {
    const on = parseInt(x.dataset.pack, 10) === n;
    x.classList.toggle('sel', on);
    x.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  $$('.pack-hero-row').forEach(x => {
    const on = parseInt(x.dataset.pack, 10) === n;
    x.classList.toggle('sel', on);
    x.setAttribute('aria-checked', on ? 'true' : 'false');
  });
}

function elegirPack(n, { autoScroll = true } = {}){
  packActual = n;
  sincronizarPacks(n);
  actualizarResumen();
  track('AddToCart', { pack: PACKS[packActual] });
  addCartOrigen = packActual;
  const p = PACKS[packActual];
  const ahorro = p.antes - p.precio;
  toast('¡Buena elección! Ahorras ' + cop(ahorro) + (p.unidades === 3 ? ' + regalo sorpresa 🎁' : ' 🎉'));
  flashSticky();
  actualizarPasos();
  if (autoScroll){
    const pedido = document.querySelector('#pedido');
    if (pedido) setTimeout(() => pedido.scrollIntoView({ behavior: 'smooth', block: 'start' }), 400);
  }
}

function initBundles(){
  $$('.bundle').forEach(b => {
    b.tabIndex = 0;
    b.setAttribute('role', 'button');
    b.setAttribute('aria-pressed', b.classList.contains('sel') ? 'true' : 'false');
    const elegir = () => elegirPack(parseInt(b.dataset.pack, 10));
    b.addEventListener('click', elegir);
    b.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); elegir(); }
    });
  });
  $$('.pack-hero-row').forEach(r => {
    const elegir = () => elegirPack(parseInt(r.dataset.pack, 10), { autoScroll: false });
    r.addEventListener('click', elegir);
    r.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); elegir(); }
    });
  });
  sincronizarPacks(packActual);
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

function pagoOnlineActivo(){
  const chk = document.querySelector('input[name="pago"]:checked');
  return !!(chk && chk.value === 'online');
}

/* Pago online con tarjeta: 10% de descuento redondeado a centenas
   (sin "dieces": 89.900 x 0,9 = 80.910 → se cobra 80.900) */
function precioOnline(p){
  return Math.floor(p.precio * (1 - DESCUENTO_ONLINE) / 100) * 100;
}

function totalActual(){
  const p = packData();
  const base = pagoOnlineActivo() ? Math.round(p.precio * (1 - DESCUENTO_ONLINE)) : p.precio;
  return base + envioActual();
}

function actualizarResumen(){
  const p = packData();
  const sub = $('#resNombre');
  const det = $('#resDetalle');
  const mon = $('#resMonto');
  const ri  = $('#resImagen');
  const tS  = $('#tSubtotal');
  const tE  = $('#tEnvio');
  const tT  = $('#tTotal');
  const online = pagoOnlineActivo();
  const desc = online ? p.precio - precioOnline(p) : 0;
  if (sub) sub.textContent = p.nombre;
  if (det) det.textContent = p.detalle;
  if (mon) mon.textContent = cop(p.precio);
  if (ri)  ri.src = 'assets/img/pack-oferta-' + p.unidades + '.jpg?v=2';
  if (tS)  tS.textContent  = cop(p.precio);
  const rowD = $('#rowDescuento');
  const tD = $('#tDescuento');
  if (rowD) rowD.hidden = !online;
  if (tD) tD.textContent = '-' + cop(desc);
  if (tE)  tE.textContent  = envioActual() > 0 ? cop(envioActual()) : 'Gratis';
  if (tT)  tT.textContent  = cop(p.precio - desc + envioActual());
  const stPack = $('#stickyPack');
  const stPrecio = $('#stickyPrecio');
  const stAntes = $('#stickyAntes');
  if (stPack) stPack.textContent = 'PACK DE ' + p.unidades + ' · HOY';
  if (stPrecio) stPrecio.textContent = cop(p.precio);
  if (stAntes) stAntes.textContent = cop(p.antes);
  const pMon = $('#pagoMonto');
  const pPack = $('#pagoPackTxt');
  const pBase = precioOnline(p);
  const envio = envioActual();
  if (pMon) pMon.textContent = cop(pBase + envio);
  if (pPack) pPack.textContent = 'Pack de ' + p.unidades + ' tarro' + (p.unidades > 1 ? 's' : '') + ' con 10% de descuento';
  const dP = $('#dPack');
  if (dP) dP.textContent = cop(pBase);
  const dRow = $('#dEnvioRow');
  if (dRow) dRow.hidden = envio === 0;
  const dE = $('#dEnvio');
  if (dE) dE.textContent = cop(envio);
  const pBtn = $('#pagoBtnTxt');
  if (pBtn) pBtn.textContent = 'Pagar ' + cop(pBase + envio) + ' con Mercado Pago · 10% OFF →';
  const aH = $('#pagoAhorro');
  if (aH) aH.textContent = cop(desc);
  refrescarDatosPago();
}

/* ============ Mensaje "Ya pagué" con los datos del formulario ============
   Si el cliente ya llenó sus datos, el mensaje viaja completo (nombre, celular,
   dirección y monto) para que el asesor cruze el pago de Mercado Pago sin
   volver a preguntar nada. Si no los llenó, viaja la plantilla para que los
   diligencie en WhatsApp (ruta de rescate documentada en FAQ/SOP). */
function mensajeComprobante(eventID, total){
  const val = id => { const e = $('#' + id); return e ? e.value.trim() : ''; };
  const p = packData();
  const monto = cop(total || (precioOnline(p) + envioActual()));
  const lineas = [
    '*Ya pagué online — CANDELA*',
    'Adjunto mi comprobante de pago.',
    ''
  ];
  if (eventID) lineas.push('*N.º de pedido:* ' + eventID);
  lineas.push('*Monto pagado:* ' + monto + ' (10% de descuento incluido)');
  lineas.push('');
  lineas.push('*Mis datos de envío:*');
  lineas.push('Nombre completo: ' + val('fNombre'));
  lineas.push('Celular: ' + val('fTelefono'));
  lineas.push('Departamento: ' + val('fDepartamento'));
  lineas.push('Ciudad: ' + val('fCiudad'));
  lineas.push('Dirección: ' + val('fDireccion'));
  const nota = val('fNota');
  if (nota) lineas.push('Referencia: ' + nota);
  lineas.push('');
  lineas.push('¡Gracias!');
  return lineas.join('\n');
}

function refrescarDatosPago(eventID, total){
  const exDatos = $('#datosPagoLink');
  if (exDatos) exDatos.href = `https://wa.me/${WHATSAPP_PEDIDOS}?text=${encodeURIComponent(mensajeComprobante(eventID, total))}`;
}

function initPago(){
  refrescarDatosPago();
  /* El enlace "Ya pagué" se recalcula al instante del clic: aunque el cliente
     escriba sus datos y pague sin enviar el formulario, el mensaje llega lleno. */
  const exDatos = $('#datosPagoLink');
  if (exDatos) exDatos.addEventListener('click', () => refrescarDatosPago());
  /* Recordatorio universal en todos los enlaces de Mercado Pago del sitio:
     tras pagar hay que enviar el comprobante (o los datos si no envió pedido). */
  $$('a[href*="link.mercadopago.com.co"]').forEach(a => a.addEventListener('click', () => {
    toast('Después de pagar toca "Ya pagué · enviar comprobante" 📲');
  }));
  $$('input[name="pago"]').forEach(r => r.addEventListener('change', () => {
    const chk = document.querySelector('input[name="pago"]:checked');
    const online = !!(chk && chk.value === 'online');
    const info = $('#pagoOnlineInfo');
    if (info) info.hidden = !online;
    const cpTxt = $('#fCompromisoTxt');
    if (cpTxt) cpTxt.textContent = online
      ? 'Confirmo mi pedido: pagaré online por Mercado Pago el monto de mi pack y enviaré el comprobante a mi asesor por WhatsApp.'
      : 'Me comprometo a recibir y pagar mi pedido en la entrega. Tendré el dinero disponible o dejaré el pago con quien reciba por mí.';
    const bTxt = $('#btnEnviarTxt');
    if (bTxt) bTxt.textContent = online ? 'Enviar mi pedido · Pago online' : 'Enviar mi pedido · Pagas al recibir';
    const pp3 = $('#pp3Txt');
    if (pp3) pp3.textContent = online ? 'Pagas online' : 'Pagas al recibir';
    const tLbl = $('#tTotalLbl');
    if (tLbl) tLbl.textContent = online ? 'Total a pagar online' : 'Total a pagar al recibir';
    actualizarResumen();
  }));
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
    const pagoRadio = document.querySelector('input[name="pago"]:checked');
    const pagoOnline = !!(pagoRadio && pagoRadio.value === 'online');
    const desc = pagoOnline ? p.precio - precioOnline(p) : 0;
    const total = p.precio - desc + envio;

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
      `*Envío:* ${envio > 0 ? 'Prioritario — ' + cop(envio) : 'Gratis'}`
    );
    if (pagoOnline) lineas.push('- Descuento 10% por pago online: -' + cop(desc));
    lineas.push(
      `*TOTAL:* ${cop(total)}`,
      '',
      pagoOnline ? '*Método de pago:* Pago online — Mercado Pago (monto a pagar: ' + cop(total) + ' · 10% de descuento incluido)' : '*Método de pago:* Contraentrega (pago al recibir)',
      '',
      pagoOnline ? 'Confirmo mi pedido: pagaré online y enviaré el comprobante a mi asesor por WhatsApp.' : 'Confirmo que recibiré y pagaré mi pedido en la entrega.'
    );
    const mensajePedido = encodeURIComponent(lineas.join('\n'));

    track('Purchase', { pack: p, envio: envio, pago: pagoOnline ? 'online' : 'contraentrega', transaction_id: eventID, valor: total });
    enviarCAPI('Purchase', eventID, phHashActual, total, ['candela-300ml-' + p.unidades + '-tarros'], p.unidades);

    const p3 = document.querySelector('#pasosPedido .pp:nth-child(3)');
    if (p3) p3.classList.add('done');

    window.open(`https://wa.me/${WHATSAPP_PEDIDOS}?text=${mensajePedido}`, '_blank');

    const overlay = $('#exito');
    if (overlay){
      const exTxt = overlay.querySelector('.exito-caja p');
      const acc = $('#exitoAcciones');
      if (pagoOnline){
        const exPagar = $('#exitoPagar');
        if (exPagar) exPagar.href = LINK_MP;
        /* El comprobante viaja con el N.º de pedido, el monto y TODOS los datos
           que el cliente acaba de diligenciar: cero re-escritura, cero datos perdidos. */
        const exComp = $('#exitoComprobante');
        if (exComp) exComp.href = `https://wa.me/${WHATSAPP_PEDIDOS}?text=${encodeURIComponent(mensajeComprobante(eventID, total))}`;
        refrescarDatosPago(eventID, total);
        if (exTxt) exTxt.textContent = 'Tu pedido ya llegó a WhatsApp. Ahora paga tu pack con el 10% de descuento (se abrió Mercado Pago en una pestaña nueva; si no abrió, usa el botón):';
        if (acc) acc.hidden = false;
        overlay.classList.add('show');
        overlay.setAttribute('aria-hidden', 'false');
        window.open(LINK_MP, '_blank');
      } else {
        if (exTxt) exTxt.textContent = 'Te llevamos a WhatsApp para confirmar con tu asesor…';
        if (acc) acc.hidden = true;
        overlay.classList.add('show');
        overlay.setAttribute('aria-hidden', 'false');
        setTimeout(() => {
          overlay.classList.remove('show');
          overlay.setAttribute('aria-hidden', 'true');
        }, 2400);
      }
    }
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

/* ============ Reloj de oferta del héroe (30 min por visita, espejo del offer-clock) ============ */
function initRelojOferta(){
  const min = document.querySelector('[data-reloj-min]');
  const seg = document.querySelector('[data-reloj-seg]');
  const fill = document.querySelector('[data-reloj-fill]');
  if (!min || !seg) return;
  const TOTAL = 30 * 60;
  let rest = TOTAL;
  const pinta = () => {
    min.textContent = String(Math.floor(rest / 60)).padStart(2, '0');
    seg.textContent = String(rest % 60).padStart(2, '0');
    if (fill) fill.style.transform = 'scaleX(' + (rest / TOTAL) + ')';
  };
  pinta();
  setInterval(() => {
    if (rest > 0){ rest--; pinta(); }
  }, 1000);
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
  initSenalesMeta();
  initGaleria();
  initBundles();
  initEnvio();
  initPago();
  actualizarResumen();
  const exClose = $('#exitoCerrar');
  if (exClose) exClose.addEventListener('click', () => {
    const ov = $('#exito');
    ov.classList.remove('show');
    ov.setAttribute('aria-hidden', 'true');
  });
  actualizarPasos();
  initFormulario();
  initFaq();
  initCuentaRegresiva();
  initRelojOferta();
  initReveal();
  initVuelo();
  const anio = $('#anio');
  if (anio) anio.textContent = new Date().getFullYear();
  track('ViewContent');
});
