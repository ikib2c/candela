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
    if (transaction_id) params.transaction_id = transaction_id;
    gtag('event', eventoGa4, params);
  }

  window.dataLayer = window.dataLayer || [];
  const ecommerce = { currency: 'COP', value: value, items: [item] };
  if (transaction_id) ecommerce.transaction_id = transaction_id;
  window.dataLayer.push({ event: eventoGa4, ecommerce: ecommerce });
}

/* ============ Galería del héroe ============ */
function initGaleria(){
  const img = $('#heroImg');
  $$('.hero-miniaturas img').forEach(t => {
    t.addEventListener('click', () => {
      img.src = t.src;
      img.alt = t.alt.replace(/^Ver foto \d+: /, '');
      img.style.opacity = '0';
      setTimeout(() => img.style.opacity = '1', 120);
      $$('.hero-miniaturas img').forEach(x => x.classList.remove('on'));
      t.classList.add('on');
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
  form.addEventListener('input', () => { marcarInicioCheckout(); actualizarPasos(); });
  form.addEventListener('change', () => { marcarInicioCheckout(); actualizarPasos(); });

  form.addEventListener('submit', e => {
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

    let msg = '*🔥 Nuevo pedido — CANDELA*%0A%0A';
    msg += `*Cliente:* ${nombre}%0A`;
    msg += `*Celular / WhatsApp:* ${telefono}%0A`;
    msg += `*Dirección:* ${direccion}%0A`;
    msg += `*Departamento:* ${departamento}%0A`;
    msg += `*Ciudad:* ${ciudad}%0A`;
    if (nota) msg += `*Referencia:* ${nota}%0A`;
    msg += '%0A*Pedido:*%0A';
    msg += `- ${p.nombre} — ${cop(p.precio)}%0A`;
    if (packActual === 3) msg += '- Regalo sorpresa incluido%0A';
    msg += `*Envío:* ${envio > 0 ? 'Prioritario — ' + cop(envio) : 'Gratis'}%0A`;
    msg += `*TOTAL:* ${cop(total)}%0A%0A`;
    msg += '*Método de pago:* Contraentrega (pago al recibir)%0A%0A';
    msg += 'Confirmo que recibiré y pagaré mi pedido en la entrega.';

    track('Purchase', { pack: p, envio: envio, transaction_id: 'CDL-' + Date.now() });

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

    window.open(`https://wa.me/${WHATSAPP_TIENDA}?text=${msg}`, '_blank');
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
