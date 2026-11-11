import { CONFIG } from './config.js';
import { cardPin, pointOnQuadratic } from './geometry.js';
import { readBoard, persistBoard } from './persist.js';
'use strict';
const $ = s => document.querySelector(s);
const view = $('#view'), world = $('#world'), svg = $('#strings'), cv = $('#draw'), ctx = cv.getContext('2d');
const NS = 'http://www.w3.org/2000/svg';
const T = { pol: '<div class="pin"></div><img alt=""><div class="cap" contenteditable spellcheck="false">Başlık</div>',
  note: '<div class="pin"></div><div contenteditable spellcheck="false">Aklında tut: önemli fikir</div>',
  news: '<div class="pin"></div><h3 contenteditable spellcheck="false">MANŞET BURADA</h3><p contenteditable spellcheck="false">Metni buraya yazın: ders özeti, haber, bilgi... Başlığı ve metni istediğiniz gibi değiştirebilirsiniz.</p>' };

let v = loadView(), mode = 'select', threads = [], from = null, sel = null, zTop = 1, loading = true, exporting = false, lastStamp = null, restoreId = 0, canvasBumped = 0, hintTimer = 0;

let dirty = false, drawDirty = true, drawURL = null, vt;
const VK = 'mantar-pano-view', MINK = () => Math.min(.2, innerWidth / CONFIG.WORLD_W, innerHeight / CONFIG.WORLD_H);
function loadView() {
  let d; try { d = JSON.parse(localStorage.getItem(VK)); } catch (e) {}
  if (d && d.k > 0 && isFinite(d.x) && isFinite(d.y)) return d;
  const k = innerWidth < 760 ? .5 : .8; return { k, x: innerWidth / 2 - 2000 * k, y: innerHeight / 2 - 1500 * k };
}
const place = () => { if (exporting) return; world.style.transform = `translate(${v.x}px,${v.y}px) scale(${v.k})`; clearTimeout(vt); vt = setTimeout(() => { try { localStorage.setItem(VK, JSON.stringify(v)); } catch (e) {} }, 400); };
const toWorld = e => ({ x: (e.clientX - v.x) / v.k, y: (e.clientY - v.y) / v.k });
place();

/* ---------- Dokunmatik: iki parmakla yakınlaştır + kaydır ---------- */
const pts = new Map(); let pz = null;
addEventListener('pointerdown', e => {
  if (e.pointerType !== 'touch') return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pts.size === 2) { const [a, b] = [...pts.values()], cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    pz = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, k: v.k, wx: (cx - v.x) / v.k, wy: (cy - v.y) / v.k }; }
}, true);
addEventListener('pointermove', e => {
  if (exporting || !pts.has(e.pointerId)) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pts.size === 2 && pz) {
    const [a, b] = [...pts.values()], cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    const k = Math.min(3, Math.max(MINK(), pz.k * Math.hypot(a.x - b.x, a.y - b.y) / pz.d));
    v.k = k; v.x = cx - pz.wx * k; v.y = cy - pz.wy * k; place();
  }
}, true);
['pointerup', 'pointercancel'].forEach(t => addEventListener(t, e => { pts.delete(e.pointerId); if (pts.size < 2) pz = null; }, true));

/* ---------- Gezinme (zoom / pan) ---------- */
view.addEventListener('wheel', e => {
  e.preventDefault(); if (exporting) return;
  const k = Math.min(3, Math.max(MINK(), v.k * (e.deltaY < 0 ? 1.1 : .9)));
  v.x = e.clientX - (e.clientX - v.x) * k / v.k;
  v.y = e.clientY - (e.clientY - v.y) * k / v.k;
  v.k = k; place();
}, { passive: false });

view.addEventListener('pointerdown', e => {
  if (exporting) return;
  const onBg = e.target === view || e.target === world;
  if (!(onBg && mode !== 'pen' && mode !== 'marker') && e.button !== 1) return;
  if (onBg) select(null);
  let sx = e.clientX - v.x, sy = e.clientY - v.y;
  view.classList.add('pan'); view.setPointerCapture(e.pointerId);
  const mv = m => { if (pts.size > 1) { sx = m.clientX - v.x; sy = m.clientY - v.y; return; } v.x = m.clientX - sx; v.y = m.clientY - sy; place(); };
  const up = () => { view.classList.remove('pan'); view.removeEventListener('pointermove', mv); view.removeEventListener('pointerup', up); view.removeEventListener('pointercancel', up); };
  view.addEventListener('pointermove', mv); view.addEventListener('pointerup', up); view.addEventListener('pointercancel', up);
});

/* ---------- Kartlar ---------- */
function addCard(type, img, pos) {
  const c = document.createElement('div');
  c.className = 'card ' + ({ pol: 'polaroid', note: 'note', news: 'news', news2: 'news news2', postit: 'postit', doc: 'doc', tick: 'tick' })[type];
  c.innerHTML = T[type]; c.dataset.cat = DEF[type]; ensure(c);
  if (img) c.querySelector('img').src = img;
  const p = toWorld({ clientX: innerWidth / 2, clientY: innerHeight / 2 });
  c.style.left = p.x - 100 + (Math.random() * 120 - 60) + 'px';
  c.style.top = p.y - 120 + (Math.random() * 120 - 60) + 'px';
  c.dataset.r = (Math.random() * 8 - 4).toFixed(1); c.dataset.s = 1; tf(c);
  c.style.zIndex = ++zTop;
  if (pos) { c.style.left = pos[0] + 'px'; c.style.top = pos[1] + 'px'; }
  world.appendChild(c); select(c); save(); return c;
}

function select(c) { if (sel) sel.classList.remove('sel'); const same = sel === c; sel = c; if (c) { c.classList.add('sel'); if (!same) c.style.zIndex = ++zTop; } syncCat(); }

world.addEventListener('pointerdown', e => {
  if (exporting) return;
  if (e.target.classList.contains('xdel')) return removeCard(e.target.parentNode);
  if (e.target.classList.contains('mvh')) { const k = e.target.parentNode; select(k); return startDrag(e, k); }
  if (e.target.classList.contains('rz')) return startResize(e, e.target.parentNode);
  if (e.target.classList.contains('rt')) return startRotate(e, e.target.parentNode);
  if (mode === 'stamp' && !e.target.closest('.stamp')) return stampAt(e);
  const c = e.target.closest('.card'); if (!c) return;
  if (mode === 'thread') return threadClick(c);
  if (mode !== 'select') return;
  const was = sel === c; select(c); if (!was) dirty = true;
  if (e.target.isContentEditable && (e.pointerType !== 'touch' || was)) return;   // dokunmatikte ilk dokunuş seçer, ikincisi yazdırır
  startDrag(e, c);
});
/* Post-it yapıştırma: kartın üstüne bırakılan post-it karta çocuk olur, kartla birlikte taşınır/döner/büyür */
const mat = (c, l, t) => { const w = c.offsetWidth; return new DOMMatrix().translate(l + w / 2, t).rotate(+c.dataset.r || 0).scale(+c.dataset.s || 1).translate(-w / 2, 0); };
const wm = c => { const m = mat(c, parseFloat(c.style.left) || 0, parseFloat(c.style.top) || 0); return c.parentNode === world ? m : wm(c.parentNode).multiply(m); };
function reparent(c, np) {
  const Mp = wm(c), M = np === world ? Mp : wm(np).inverse().multiply(Mp), w = c.offsetWidth;
  c.style.left = (M.e - w / 2 + M.a * w / 2) + 'px'; c.style.top = (M.f + M.b * w / 2) + 'px';
  c.dataset.r = (Math.atan2(M.b, M.a) * 180 / Math.PI).toFixed(1); c.dataset.s = Math.hypot(M.a, M.b).toFixed(3); tf(c); np.appendChild(c);
}
const lift = c => { if (c.parentNode !== world) reparent(c, world); };
function hostUnder(c) {
  if (!c.classList.contains('postit')) return null;
  const r = c.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
  return document.elementsFromPoint(x, y).map(n => n.closest && n.closest('.card')).find(h => h && h !== c && !c.contains(h) && !h.classList.contains('postit') && h.parentNode === world) || null;
}
function stick(c) {
  const h = c.parentNode === world && hostUnder(c); if (!h) return;
  const n = threads.length; threads = threads.filter(t => t.a !== c && t.b !== c);
  reparent(c, h); if (n !== threads.length) toast('Post-it yapıştı; ona bağlı ip kaldırıldı.'); drawThreads(); dirty = true; syncRot();
}
function startDrag(e, c) {
  if (e.pointerType === 'touch') e.preventDefault();
  let started = false, ox, oy, hl = null, near = [];
  const begin = m => { lift(c); near = [...world.children].filter(x => x !== c && x.classList.contains('card') && !x.classList.contains('search-hide')); const p = toWorld(m); ox = p.x - c.offsetLeft; oy = p.y - c.offsetTop; started = true; };
  if (c.parentNode === world) begin(e);
  const mv = m => {
    if (pts.size > 1) return;
    if (!started) { if (Math.hypot(m.clientX - e.clientX, m.clientY - e.clientY) < 4) return; begin(m); }
    const q = toWorld(m); let nx = q.x - ox, ny = q.y - oy;
    if (!m.altKey) { for (const other of near) { const edges = [[other.offsetLeft, nx], [other.offsetLeft + other.offsetWidth, nx + c.offsetWidth], [other.offsetTop, ny], [other.offsetTop + other.offsetHeight, ny + c.offsetHeight]]; if (Math.abs(edges[0][0]-edges[0][1]) < CONFIG.SNAP) nx = edges[0][0]; if (Math.abs(edges[1][0]-edges[1][1]) < CONFIG.SNAP) nx = edges[1][0]-c.offsetWidth; if (Math.abs(edges[2][0]-edges[2][1]) < CONFIG.SNAP) ny = edges[2][0]; if (Math.abs(edges[3][0]-edges[3][1]) < CONFIG.SNAP) ny = edges[3][0]-c.offsetHeight; } }
    c.style.left = nx + 'px'; c.style.top = ny + 'px'; dirty = true; drawThreads();
    const h = hostUnder(c); if (h !== hl) { hl && hl.classList.remove('stick-target'); hl = h; hl && hl.classList.add('stick-target'); }
  };
  const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); hl && hl.classList.remove('stick-target'); if (started) stick(c); };
  addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
}

function removeCard(c) {
  if(!c || !confirm('Bu kartı silmek istiyor musun?')) return;
  threads = threads.filter(t => t.a !== c && t.b !== c);
  c.remove(); if (sel === c) { sel = null; syncCat(); } drawThreads(); save();
}

/* ---------- İpler ---------- */
function threadClick(c) {
  if (c.parentNode !== world) return toast('Yapışık post-it\'e ip bağlanmaz. Önce kartından çek.');
  if (!from) { from = c; c.classList.add('from'); return; }
  if (from !== c) threads.push({ a: from, b: c, color: $('#color').value });
  from.classList.remove('from'); from = null; drawThreads(); save();
}

const pin = cardPin;
function geom(t) {
  const a = pin(t.a), b = pin(t.b), sag = Math.min(CONFIG.THREAD_MAX_SAG, Math.hypot(b.x - a.x, b.y - a.y) * CONFIG.THREAD_SAG_RATIO);
  return { a, b, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 + sag };
}
const ptOn = pointOnQuadratic;
const el = n => document.createElementNS(NS, n), at = (e, o) => { for (const k in o) e.setAttribute(k, o[k]); return e; };

function editLabel(t) {
  world.querySelectorAll('.ted').forEach(n => n.remove());
  const q = ptOn(geom(t), t.p ?? .5), d = document.createElement('div'), i = document.createElement('input'), x = document.createElement('button');
  d.className = 'ted'; d.style.left = q.x + 'px'; d.style.top = q.y + 'px';
  i.value = t.label || ''; i.maxLength = 40; i.placeholder = 'Etiket yaz…'; x.textContent = '🗑'; x.title = 'İpi sil';
  let done = false;
  const end = del => { if (done) return; done = true; if (del) { const k = threads.indexOf(t); if (k >= 0) threads.splice(k, 1); } else t.label = i.value.trim(); d.remove(); drawThreads(); save(); };
  i.onkeydown = e => { if (e.key === 'Enter') end(); if (e.key === 'Escape') { done = true; d.remove(); } };
  i.onblur = () => end(); x.onpointerdown = e => { e.preventDefault(); e.stopPropagation(); end(true); };
  d.append(i, x); world.appendChild(d); i.focus(); i.select();
}

let tq = 0;
function drawThreads() { if (!tq) tq = requestAnimationFrame(() => { tq = 0; drawThreadsNow(); }); }
function drawThreadsNow() {
  svg.innerHTML = ''; world.querySelectorAll('.threaded').forEach(c=>c.classList.remove('threaded'));
  threads.forEach((t, idx) => {
    t.a.classList.add('threaded'); t.b.classList.add('threaded'); t.a.querySelector('.pin')?.style.setProperty('--thread-color',t.color); t.b.querySelector('.pin')?.style.setProperty('--thread-color',t.color);
    const G = geom(t), { a, b, cx, cy } = G;
    svg.appendChild(at(el('path'), { d: `M${a.x + 2} ${a.y + 5} Q${cx + 2} ${cy + 5} ${b.x + 2} ${b.y + 5}`, stroke: 'rgba(0,0,0,.28)', 'stroke-width': 5, style: 'pointer-events:none' }));
    const p = el('path'); at(p, { d: `M${a.x} ${a.y} Q${cx} ${cy} ${b.x} ${b.y}`, stroke: t.color, 'stroke-width': 4 });
    p.onclick = e => { if (e.shiftKey) { threads.splice(threads.indexOf(t), 1); drawThreads(); save(); } else editLabel(t); };
    svg.appendChild(p);
    // İpin son birkaç milimetresi raptiye başının çevresinde yarım tur dolanır.
    [a,b].forEach((q,side)=>{ const dir=side===0?1:-1, rr=8, rot=+((side===0?t.a:t.b).dataset.r||0); const wrap=el('path'); at(wrap,{transform:`rotate(${rot} ${q.x} ${q.y})`,d:`M${q.x-dir*rr} ${q.y-rr*.45} C${q.x-dir*rr*1.25} ${q.y-rr*1.7} ${q.x+dir*rr*.8} ${q.y-rr*1.7} ${q.x+dir*rr*.75} ${q.y-rr*.15}`,stroke:t.color,'stroke-width':3.2,fill:'none','pointer-events':'none'}); svg.appendChild(wrap); });
    if (!t.label) return;
    const q = ptOn(G, t.p ?? .5), g = el('g'), x = el('text');
    at(g, { class: 'lbl', transform: `translate(${q.x} ${q.y}) rotate(${(idx * 37) % 7 - 3})` });
    at(x, { 'text-anchor': 'middle', y: 6, 'font-size': 19, fill: '#1d3557', 'font-family': '"Segoe Print","Bradley Hand","Comic Sans MS",cursive', 'font-weight': 700 });
    x.textContent = t.label; g.appendChild(x); svg.appendChild(g);
    const w = x.getComputedTextLength() + 30;
    const paper = at(el('rect'), { x: -w / 2, y: -18, width: w, height: 34, rx: 2, fill: '#fffbe6', stroke: '#d8c98a' });
    const tape = at(el('rect'), { x: -24, y: -27, width: 48, height: 15, fill: 'rgba(235,215,140,.8)', transform: 'rotate(-4)' });
    const cx2 = at(el('circle'), { class: 'lx', cx: w / 2, cy: -18, r: 9, fill: '#c1121f', stroke: '#fff', 'stroke-width': 2 });
    const cx3 = at(el('text'), { class: 'lx', x: w / 2, y: -14, 'text-anchor': 'middle', 'font-size': 11, fill: '#fff', 'font-weight': 700, 'pointer-events': 'none' }); cx3.textContent = '✕';
    cx2.onclick = e => { e.stopPropagation(); threads.splice(threads.indexOf(t), 1); drawThreads(); save(); };
    g.insertBefore(at(el('rect'), { x: -w / 2 + 2, y: -15, width: w, height: 34, rx: 2, fill: 'rgba(0,0,0,.25)' }), x); g.insertBefore(paper, x); g.insertBefore(tape, x); g.append(cx2, cx3);
    g.onpointerdown = e => {                                   // sürükle: ip boyunca kaydır, tıkla: düzenle
      if (e.target.classList.contains('lx')) return; e.preventDefault(); e.stopPropagation();
      let moved = false; const sx = e.clientX, sy = e.clientY;
      const mv = m => {
        if (!moved && Math.hypot(m.clientX - sx, m.clientY - sy) < 5) return; moved = true;
        const w2 = toWorld(m), GG = geom(t); let best = .5, bd = 1e18;
        for (let s = .05; s <= .95; s += .01) { const P = ptOn(GG, s), d = (P.x - w2.x) ** 2 + (P.y - w2.y) ** 2; if (d < bd) { bd = d; best = s; } }
        t.p = best; drawThreads();
      };
      const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); if (moved) save(); else editLabel(t); };
      addEventListener('pointermove', mv); addEventListener('pointerup', up);
    };
  });
}

/* ---------- Kalem ---------- */
cv.addEventListener('pointerdown', e => {
  if (!['pen', 'marker', 'eraser'].includes(mode) || pts.size > 1) return;
  canvasBumped++;
  const mk = mode === 'marker', er = mode === 'eraser', sz = +$('#size').value, base = er ? sz * 10 : mk ? sz * 6 : sz;
  ctx.strokeStyle = $('#color').value; ctx.lineCap = ctx.lineJoin = 'round';
  ctx.globalAlpha = mk ? .4 : 1; ctx.globalCompositeOperation = er ? 'destination-out' : 'source-over';
  const wd = ev => ev.pointerType === 'pen' && ev.pressure > 0 ? base * (.4 + ev.pressure * 1.2) : base;
  let l = toWorld(e), m0 = l; cv.setPointerCapture(e.pointerId);
  ctx.lineWidth = wd(e); ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(l.x + .01, l.y); ctx.stroke();
  const mv = ev => {
    if (pts.size > 1) return;
    const list = ev.getCoalescedEvents ? ev.getCoalescedEvents() : []; 
    for (const c of (list.length ? list : [ev])) {
      const q = toWorld(c), mid = { x: (l.x + q.x) / 2, y: (l.y + q.y) / 2 };
      ctx.lineWidth = wd(c); ctx.beginPath(); ctx.moveTo(m0.x, m0.y); ctx.quadraticCurveTo(l.x, l.y, mid.x, mid.y); ctx.stroke(); m0 = mid; l = q;
    }
    dirty = drawDirty = true;
  };
  const up = () => { cv.removeEventListener('pointermove', mv); cv.removeEventListener('pointerup', up); cv.removeEventListener('pointercancel', up); dirty = drawDirty = true; };
  cv.addEventListener('pointermove', mv); cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
});

/* ---------- Kalem imleci (görsel) ---------- */
function updateCursor() {
  const c = $('#color').value, o = 'stroke="#222" stroke-width="1.4" stroke-linejoin="round"';
  const S = {
    pen: [`<polygon points="2,30 6,20 12,26" fill="#f1d9a8" ${o}/><polygon points="2,30 4,25 7,28" fill="${c}" ${o}/><polygon points="6,20 22,4 28,10 12,26" fill="${c}" ${o}/><polygon points="22,4 25,1 31,7 28,10" fill="#f4a6b6" ${o}/>`, 2, 30],
    marker: [`<polygon points="2,30 5,22 10,27" fill="${c}" ${o}/><polygon points="5,22 21,6 27,12 10,27" fill="#444" ${o}/><polygon points="21,6 24,3 30,9 27,12" fill="${c}" ${o}/>`, 2, 30],
    eraser: [`<rect x="5" y="12" width="22" height="16" rx="3" fill="#f4a6b6" ${o}/><rect x="5" y="12" width="9" height="16" rx="3" fill="#fff" ${o}/>`, 16, 20]
  }[mode];
  cv.style.cursor = S ? `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">${S[0]}</svg>`)}") ${S[1]} ${S[2]}, crosshair` : '';
}
$('#color').addEventListener('input', updateCursor);

/* ---------- Araç çubuğu ---------- */
const MODE_HINT = { select: 'Kartı sürükle · yazıya dokunup düzenle · seçili kartta ✕ sil, ↻ döndür, sarı nokta boyut, ✥ taşı',
  thread: 'İp: sırayla iki karta dokun · ipe dokununca etiket yazabilirsin',
  pen: 'Kalem: sürükleyerek çiz · iki parmakla yakınlaştır / kaydır', marker: 'İşaretleyici: kalın, yarı saydam çizgi · iki parmakla yakınlaştır',
  eraser: 'Silgi: silmek istediğin çizimin üstünden sürükle', stamp: 'Mühür: karta ya da panoya dokun · yazısını yukarıdaki kutudan değiştir' };
function setMode(m) {
  $('#hint').textContent = MODE_HINT[m] || ''; clearTimeout(hintTimer); hintTimer=setTimeout(()=>{if($('#hint'))$('#hint').classList.add('hint-muted');},5000); $('#hint').classList.remove('hint-muted');
  mode = m; document.body.dataset.m = m;
  document.querySelectorAll('#modes button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
  { const mb = document.querySelector('#modes button.on'), mn = $('#modeNow'); if (mn) mn.textContent = mb ? mb.textContent.trim() : ''; }
  if (from) { from.classList.remove('from'); from = null; }
  
updateCursor();
}
$('#modes').addEventListener('click', e => e.target.dataset.m && e.target.dataset.m !== mode && setMode(e.target.dataset.m));
$('#addNote').onclick = () => addCard('note');
$('#addNews').onclick = () => addCard('news');
$('#addNews2').onclick = () => addCard('news2');
$('#addPostit').onclick = () => addCard('postit');
$('#addPolaroid').onclick = () => $('#file').click();
$('#file').onchange = e => {                       // büyük fotoğrafı küçültüp ekle: hız ve kayıt için
  const f = e.target.files[0]; if (!f) return; const u = URL.createObjectURL(f), im = new Image();
  im.onload = () => {
    const k = Math.min(1, CONFIG.IMAGE_MAX / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement('canvas');
    c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
    URL.revokeObjectURL(u); addCard('pol', c.toDataURL('image/jpeg', CONFIG.IMAGE_QUALITY));
  };
  im.onerror = () => toast('Bu fotoğraf açılamadı. JPG veya PNG dene.'); im.src = u; e.target.value = '';
};
$('#del').onclick = () => sel && removeCard(sel);
$('#clear').onclick = () => confirm('Tüm çizimler silinsin mi?') && (ctx.clearRect(0, 0, cv.width, cv.height), drawDirty = true, save());

$('#front').onclick=()=>{if(sel){sel.style.zIndex=++zTop;save();}};
$('#back').onclick=()=>{if(!sel||sel.parentNode!==world)return;const o=[...world.querySelectorAll(':scope>.card')].filter(c=>c!==sel),mn=o.length?Math.min(...o.map(c=>+(c.style.zIndex||1))):2;
  if(mn>1)sel.style.zIndex=mn-1;else{o.forEach(c=>c.style.zIndex=(+(c.style.zIndex||1))+1);sel.style.zIndex=1;zTop++;}save();};
function duplicateCard(c){if(!c||loading)return;const clone=c.cloneNode(true);clone.querySelectorAll('.sel,.from,.stick-target').forEach(n=>n.classList.remove('sel','from','stick-target'));clone.classList.remove('sel','from','stick-target');[clone,...clone.querySelectorAll('[data-d]')].forEach(n=>n.removeAttribute('data-d'));clone.style.left=(parseFloat(c.style.left||0)+28)+'px';clone.style.top=(parseFloat(c.style.top||0)+28)+'px';c.parentNode.appendChild(clone);ensure(clone);select(clone);save();}
function dupOther(o){const k=o.cloneNode(true);k.style.left=(parseFloat(o.style.left||0)+28)+'px';k.style.top=(parseFloat(o.style.top||0)+28)+'px';o.parentNode.appendChild(k);addX(k);lastStamp=k;save();}
const dupAny=()=>{if(loading)return;if(sel)duplicateCard(sel);else if(lastStamp&&lastStamp.isConnected)dupOther(lastStamp);};
$('#dup').onclick=dupAny;
world.addEventListener('focusin',e=>{const t=e.target.closest&&e.target.closest('.stamp,.tl');if(t)lastStamp=t;});
const fold=s=>s.replace(/İ/g,'i').replace(/I/g,'i').replace(/ı/g,'i').toLowerCase();   // I/İ/ı/i hepsi aynı sayılır
$('#search').addEventListener('input',e=>{const q=fold(e.target.value.trim());let n=0;world.querySelectorAll('.card .card').forEach(c=>c.classList.remove('search-hide'));world.querySelectorAll(':scope > .card').forEach(c=>{const hide=!!q&&!fold(c.textContent).includes(q);c.classList.toggle('search-hide',hide);if(!hide)n++;});$('#searchCount').textContent=q?n+'/'+world.querySelectorAll(':scope > .card').length+' sonuç':'';});
$('#search').addEventListener('keydown',e=>{if(e.key==='Escape'){e.target.value='';e.target.dispatchEvent(new Event('input'));e.target.blur();}});
$('#exportSelected').onclick=async()=>{if(!sel)return toast('Önce bir kart seç.');if(!window.html2canvas)return toast('PNG kütüphanesi yüklenemedi.');const card=sel;card.classList.remove('sel');try{const c=await html2canvas(card,{scale:Math.min(8,Math.max(2,1024/(card.offsetWidth||1))),backgroundColor:null,useCORS:true});const a=document.createElement('a');a.download='mantar-pano-secili-kart.png';a.href=c.toDataURL('image/png');a.click();}catch(e){toast('Seçili kart dışa aktarılamadı.');}finally{if(card.isConnected&&sel===card)card.classList.add('sel');}};
// Dosya yöneticisinden fotoğraf veya pano JSON'u sürükleyip bırakılabilir.
view.addEventListener('dragover',e=>{e.preventDefault();view.classList.add('drop-ready');});view.addEventListener('dragleave',()=>view.classList.remove('drop-ready'));
view.addEventListener('drop',async e=>{e.preventDefault();view.classList.remove('drop-ready');if(loading)return;for(const f of e.dataTransfer.files){if(f.type.startsWith('image/')){const url=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(f);});const im=new Image();im.onload=()=>{const c=document.createElement('canvas'),k=Math.min(1,CONFIG.IMAGE_MAX/Math.max(im.naturalWidth,im.naturalHeight));c.width=Math.round(im.naturalWidth*k);c.height=Math.round(im.naturalHeight*k);c.getContext('2d').drawImage(im,0,0,c.width,c.height);addCard('pol',c.toDataURL('image/jpeg',CONFIG.IMAGE_QUALITY));};im.src=url;}else if(f.name.toLowerCase().endsWith('.json')){try{restore(JSON.parse(await f.text()));save();}catch(_){toast('Geçersiz pano JSON dosyası.');}}}});

addEventListener('keydown', e => {
  if (loading || exporting || (!sel && (e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='d' && e.target.closest && e.target.closest('.stamp,.tl') && (e.preventDefault(), dupOther(e.target.closest('.stamp,.tl')), true)) || e.target.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='f'){e.preventDefault();openTab('file');$('#search').focus();return;}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='d'){e.preventDefault();dupAny();return;}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();historyMove(e.shiftKey?1:-1);return;}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();historyMove(1);return;}
  if(sel && ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const step=e.shiftKey?10:1;sel.style.left=(parseFloat(sel.style.left||0)+(e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0))+'px';sel.style.top=(parseFloat(sel.style.top||0)+(e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0))+'px';drawThreads();save();return;}
  if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); removeCard(sel); return; }
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
  const k = { v: 'select', t: 'thread', p: 'pen', m: 'marker', e: 'eraser', s: 'stamp' }[e.key.toLowerCase()];
  if (k && k !== mode) setMode(k);
});

/* ---------- Mühür, belge, zaman çizelgesi ---------- */
Object.assign(T, {
  news2: '<div class="pin"></div><h3 contenteditable spellcheck="false">MANŞET BURADA</h3><div class="cols"><p contenteditable spellcheck="false">Sol kolon: buraya yazdıkça aşağı doğru uzar.</p><p contenteditable spellcheck="false">Sağ kolon: kendi başına yazılır, soldakinden bağımsızdır.</p></div>',
  postit: '<div class="pin"></div><div contenteditable spellcheck="false">Hatırlatma</div>',
  doc: '<div class="pin"></div><div contenteditable spellcheck="false"><b>DERS NOTU</b><br>Konu: ...<br>• Madde 1<br>• Madde 2<br>• Madde 3</div>',
  tick: '<div class="pin"></div><div contenteditable spellcheck="false">Etiket</div>' });
$('#addDoc').onclick = () => addCard('doc');

function fixStamp(e) {
  if (!e.classList.contains('stamp') || e.querySelector('.st')) return;
  const t = document.createElement('span'), txt = e.firstChild ? e.firstChild.textContent : '';
  t.className = 'st'; t.contentEditable = 'true'; t.spellcheck = false; t.textContent = txt;
  [...e.childNodes].forEach(n => n.nodeType === 3 && n.remove()); e.prepend(t);
}
function addX(e) { fixStamp(e); if (e.classList.contains('tl')) e.tabIndex = 0; if (!e.querySelector('.sx')) { const x = document.createElement('span'); x.className = 'sx'; x.textContent = '✕'; x.title = 'Sil'; e.appendChild(x); } }
world.addEventListener('click', e => { if (e.target.classList.contains('sx')) { e.target.parentNode.remove(); save(); } });
function stampAt(e) {
  const host = e.target.closest('.card') || world, s = document.createElement('div');
  s.className = 'stamp'; s.textContent = $('#stampType').value.trim() || 'ÖNEMLİ';
  let x, y;
  if (host === world) ({ x, y } = toWorld(e));
  else { const q=toWorld(e), local=wm(host).inverse().transformPoint(new DOMPoint(q.x,q.y)); x=local.x; y=local.y; }
  s.style.left = x + 'px'; s.style.top = y + 'px'; addX(s); host.appendChild(s); save();
}
$('#stampType').onfocus = e => e.target.select();
try { const sv = localStorage.getItem('mantar-stamp'); if (sv) $('#stampType').value = sv; } catch (e) {}
$('#stampType').addEventListener('input', e => { try { localStorage.setItem('mantar-stamp', e.target.value); } catch (_) {} });

$('#addTl').onclick = () => {
  const p = toWorld({ clientX: innerWidth / 2, clientY: innerHeight * .8 }), x0 = p.x - 500;
  const bar = document.createElement('div'); bar.className = 'tl';
  bar.style.cssText = `left:${x0 - 60}px;top:${p.y + 40}px;width:1220px`; addX(bar); world.appendChild(bar);
  ['Başlangıç', 'Gelişme', 'Sonuç'].forEach((l, i) =>
    addCard('tick', null, [x0 + i * 500, p.y]).querySelector('div:not(.pin)').textContent = l);
  select(null); save();
};

/* ---------- Büyüteç ---------- */
const lens = $('#lens'), lw = $('#lw'); let lensOn = false;
function lensRefresh() {
  if (!lensOn || (!lensDirty && lw.childElementCount)) return; lensDirty=false;
  lw.innerHTML = ''; const c = world.cloneNode(true); c.removeAttribute('id'); c.className = 'wc'; c.style.transform = 'none';
  const im = new Image(); im.src = cv.toDataURL(); im.style.cssText = 'position:absolute;left:0;top:0;z-index:3';
  c.querySelector('#draw').replaceWith(im);
  c.querySelectorAll('.sel,.from').forEach(n => n.classList.remove('sel', 'from')); lw.appendChild(c);
}
$('#lensBtn').onclick = e => { lensOn = !lensOn; e.target.classList.toggle('on', lensOn); lens.hidden = !lensOn; lensRefresh(); };
addEventListener('pointermove', e => {
  if (!lensOn) return;
  if(lensDirty) lensRefresh();
  const p = toWorld(e), s = v.k * 2.5;
  lens.style.left = e.clientX - 130 + 'px'; lens.style.top = e.clientY - 130 + 'px';
  lw.style.transform = `translate(${130 - p.x * s}px,${130 - p.y * s}px) scale(${s})`;
});

/* ---------- Kayıt (otomatik + JSON) ---------- */
const SAVE_TXT = { idle: 'Kayıt açık', saving: 'Kaydediliyor…', saved: 'Kaydedildi', fallback: 'Yedek alanda', error: 'Kayıt başarısız' };
function setSaveState(k) { const b = $('#bar'), t = $('#saveState'); if (!b || !t) return; b.dataset.save = k; t.textContent = SAVE_TXT[k] || ''; }
const KEY = 'mantar-pano-v2', items = () => [...world.querySelectorAll(':scope > .card, :scope > .stamp, :scope > .tl')];
function snapshot() {
  const els = items();
  return { html: els.map(e => { const c = e.cloneNode(true); c.classList.remove('sel', 'from', 'dim'); c.querySelectorAll('.sel,.from,.dim,.stick-target').forEach(n => n.classList.remove('sel', 'from', 'dim', 'stick-target')); c.classList.remove('stick-target'); [c, ...c.querySelectorAll('[data-d]')].forEach(n => n.removeAttribute('data-d')); return c.outerHTML; }),
    threads: threads.filter(t=>els.includes(t.a)&&els.includes(t.b)).map(t => ({ a: els.indexOf(t.a), b: els.indexOf(t.b), color: t.color, label: t.label || '', p: t.p })), draw: drawData() };
}
function drawData() { if (drawDirty) { drawURL = cv.toDataURL(); drawDirty = false; } return drawURL; }
function restore(d) {
  if(!d || !Array.isArray(d.html) || !Array.isArray(d.threads) || !d.html.every(x => typeof x === 'string')) throw new Error('Geçersiz pano verisi');
  const rid = ++restoreId;
  const h = document.createElement('div');
  const parsed = new DOMParser().parseFromString('<section>'+d.html.join('')+'</section>', 'text/html');
  parsed.querySelectorAll('script,iframe,object,embed,link,meta,base,form').forEach(n=>n.remove());
  parsed.querySelectorAll('[data-d]').forEach(n=>n.removeAttribute('data-d'));
  parsed.querySelectorAll('*').forEach(n=>{ [...n.attributes].forEach(a=>{ const k=a.name.toLowerCase(), val=a.value.trim().toLowerCase(); if(k.startsWith('on') || (['href','src','xlink:href','formaction'].includes(k) && /^(javascript:|data:(?!image\/(png|jpeg|gif|webp);))/i.test(val))) n.removeAttribute(a.name); }); });
  [...parsed.body.firstElementChild.children].forEach(n=>h.appendChild(document.importNode(n,true))); const els = [...h.children];
  // Yeni veri burada tamamen hazır ve doğrulanmış olmalı; hata olursa mevcut pano yerinde kalır.
  threads = d.threads.filter(t => t && typeof t === 'object' && Number.isInteger(t.a)&&Number.isInteger(t.b)&&els[t.a]?.classList.contains('card')&&els[t.b]?.classList.contains('card')).map(t => ({ a: els[t.a], b: els[t.b], color: /^#[0-9a-f]{3,8}$/i.test(t.color||'')?t.color:'#c1121f', label: String(t.label||'').slice(0,40), p: Number.isFinite(+t.p)?Math.max(0,Math.min(1,+t.p)):.5 }));
  items().forEach(e => e.remove());   // geri dönüşü olmayan adım: her şey yukarıda doğrulandı
  els.forEach(e => { world.appendChild(e); if (e.matches('.stamp,.tl')) addX(e); e.querySelectorAll('.stamp').forEach(addX); if (e.classList.contains('card')) ensure(e); e.querySelectorAll('.card').forEach(ensure); });
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.clearRect(0, 0, cv.width, cv.height);
  drawURL = typeof d.draw === 'string' ? d.draw : null; drawDirty = false;
  if (drawURL) { const im = new Image(); const cb = canvasBumped; im.onload = () => { if (rid === restoreId && cb === canvasBumped) ctx.drawImage(im, 0, 0); }; im.src = drawURL; }
  zTop=Math.max(1,...[...world.querySelectorAll('.card')].map(c=>+(c.style.zIndex||1))); sel = null; syncCat(); drawThreads(); legend(); $('#search').dispatchEvent(new Event('input'));
}
let saveWarned = false, st = 0, history=[], historyIndex=-1, restoring=false, lensDirty=false, pendingTrack=false, pendingText=true, lastPushAt=0, lastPushText=false;
// Geçmiş: yazı yazarken (text=true) 2 sn içindeki değişiklikler tek adımda birleşir.
function historyPush(snapshotData,text){ if(restoring) return; const data=JSON.stringify(snapshotData || snapshot()); if(history[historyIndex]===data) return;
  if(text && lastPushText && Date.now()-lastPushAt<2000 && historyIndex===history.length-1 && historyIndex>0) history[historyIndex]=data;
  else { history=history.slice(0,historyIndex+1); history.push(data); if(history.length>CONFIG.HISTORY_LIMIT) history.shift(); historyIndex=history.length-1; }
  lastPushAt=Date.now(); lastPushText=!!text; }
// Bekleyen (henüz kaydedilmemiş) değişiklik varsa geri almadan önce geçmişe işle: böylece son hareket kaybolmaz.
function flushPending(){ if(!st) return; clearTimeout(st); st=0; const t=pendingTrack, x=pendingText; pendingTrack=false; pendingText=true; if(t) historyPush(snapshot(),x); }
function historyMove(delta){flushPending();const n=historyIndex+delta;if(n<0||n>=history.length){if(!st&&!pendingTrack)save(false);return;}historyIndex=n;lastPushText=false;restoring=true;try{restore(JSON.parse(history[n]));}finally{restoring=false;}save(false);}
async function runSave(){ st=0; const track=pendingTrack, text=pendingText; pendingTrack=false; pendingText=true; let data;
  try{ data=snapshot(); if(track) historyPush(data,text); await persistBoard(data, KEY); saveWarned=false; setSaveState('saved'); try{localStorage.removeItem(KEY);}catch(_){} }
  catch(e){ try{ localStorage.setItem(KEY,JSON.stringify({...(data||snapshot()),savedAt:Date.now()})); setSaveState('fallback'); if(!saveWarned){ saveWarned=true; toast('Tarayıcı kaydı başarısız oldu; yedek alana yazıldı. Önemli çalışmayı Dosya → Kaydet ile de yedekle.'); } }catch(_){ setSaveState('error'); toast('Otomatik kayıt başarısız: alan dolu olabilir. Lütfen Kaydet düğmesiyle yedek al.'); } }
  if(lensOn) lensDirty=true; }
function save(track=true,kind) { legend(); setSaveState('saving'); pendingTrack=pendingTrack||track; if(track) pendingText=pendingText&&kind==='text'; clearTimeout(st); st=setTimeout(runSave,CONFIG.SAVE_DELAY); }
addEventListener('pointerup', () => { if (dirty) { dirty = false; save(); } });
addEventListener('input', e => { if (e.target.id==='search' || e.target.id==='stampType') return; save(true,'text'); });
$('#saveJson').onclick = () => { const a = document.createElement('a'); a.download = 'mantar-pano.json';
  a.href = URL.createObjectURL(new Blob([JSON.stringify(snapshot())], { type: 'application/json' })); a.click(); };
$('#openJson').onclick = () => $('#jsonFile').click();
$('#jsonFile').onchange = e => { const f = e.target.files[0]; if (!f) return;
  f.text().then(t => { restore(JSON.parse(t)); save(); }).catch(() => alert('Geçersiz proje dosyası.')); e.target.value = ''; };

/* ---------- PNG / PDF dışa aktarma ---------- */
function bounds(fast) {
  const W = CONFIG.WORLD_W, H = CONFIG.WORLD_H, w0 = world.getBoundingClientRect(), K = fast ? v.k : 1;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  const add = (a, b, c, d) => { x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, c); y1 = Math.max(y1, d); };
  [...items(), ...world.querySelectorAll('.card .card')].forEach(e => { if (e.offsetParent === null) return; const r = e.getBoundingClientRect(); add((r.left - w0.left) / K, (r.top - w0.top) / K, (r.right - w0.left) / K, (r.bottom - w0.top) / K); });
  try { const b = svg.getBBox(); if (b.width) add(b.x, b.y, b.x + b.width, b.y + b.height); } catch (e) {}
  {                                                      // çizimlerin kapladığı alan (hızlı ve tam modda aynı)
    const mini=document.createElement('canvas'); mini.width=400; mini.height=300; const mc=mini.getContext('2d',{willReadFrequently:true}); mc.drawImage(cv,0,0,400,300); const d=mc.getImageData(0,0,400,300).data;
    for(let y=0;y<300;y++) for(let x=0;x<400;x++) if(d[(y*400+x)*4+3]) add(x*10,y*10,(x+1)*10,(y+1)*10);
  }
  if (x0 > x1) return { x: 0, y: 0, w: W, h: H };
  const p = CONFIG.EXPORT_PADDING; x0 = Math.max(0, x0 - p); y0 = Math.max(0, y0 - p); x1 = Math.min(W, x1 + p); y1 = Math.min(H, y1 + p);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
$('#png').onclick = async () => {
  if (!window.html2canvas || ($('#fmt').value!=='png1' && $('#fmt').value!=='png2' && $('#fmt').value!=='png3' && !window.jspdf?.jsPDF)) return alert('Dışa aktarma kütüphanesi yüklenemedi. İnternet bağlantınızı kontrol edin.');
  const f = $('#fmt').value, n = +$('#split').value, M0 = 6, P = { A4: [297, 210], A3: [420, 297], POSTER: [1000, 700] }[f];
  if(!P && n>1 && !window.JSZip) return alert('Bölünmüş PNG için ZIP kütüphanesi yüklenemedi. İnternet bağlantınızı kontrol edin.');
  const btn = $('#png'), bt = btn.textContent; btn.disabled = true; exporting = true; $('#bar').inert = true; btn.textContent = 'Hazırlanıyor…'; await new Promise(z => setTimeout(z, 40));
  const oldSel = sel, oldFlt = flt, oldFrom = from, oldQ = $('#search').value;
  if (from) { from.classList.remove('from'); from = null; }
  if (oldQ) { $('#search').value = ''; $('#search').dispatchEvent(new Event('input')); }
  drawThreadsNow(); select(null); flt = null; legend(); const old = world.style.transform; world.style.transform = 'none'; const baked = [];
  try {
    if ('filter' in ctx) for (const im of world.querySelectorAll('.polaroid img')) {
      if (!im.src || !im.naturalWidth) continue;
      const k = Math.min(1, 1600 / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement('canvas'), x = c.getContext('2d');
      c.width = im.naturalWidth * k; c.height = im.naturalHeight * k; x.filter = FIL(im.closest('.card').dataset.br || 100); x.drawImage(im, 0, 0, c.width, c.height);
      baked.push([im, im.src, im.style.filter]); im.src = c.toDataURL('image/jpeg', .92); im.style.filter = 'none'; await im.decode().catch(() => {});
    }
    let b = $('#fit').checked ? bounds() : { x: 0, y: 0, w: CONFIG.WORLD_W, h: CONFIG.WORLD_H }, pw, ph;
    const M = P ? M0 : 0, Q = P || (n > 1 ? [297, 210] : null);   // PNG bölmede de A4 oranı
    if (Q) {                                              // içeriğe göre yatay/dikey, sayfa oranına genişlet
      const land = b.w >= b.h; pw = land ? Q[0] : Q[1]; ph = land ? Q[1] : Q[0];
      const A = (pw - 2 * M) / (ph - 2 * M), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      if (b.w / b.h < A) b.w = b.h * A; else b.h = b.w / A;
      b.x = b.w <= CONFIG.WORLD_W ? Math.min(Math.max(cx - b.w / 2, 0), CONFIG.WORLD_W - b.w) : cx - b.w / 2;
      b.y = b.h <= CONFIG.WORLD_H ? Math.min(Math.max(cy - b.h / 2, 0), CONFIG.WORLD_H - b.h) : cy - b.h / 2;
    }
    let sc = P ? Math.min(2, n * (pw - 2 * M) / 25.4 * 300 / b.w) : n > 1 ? Math.min(2.5, Math.max(+f.slice(3), n * 2480 / b.w)) : +f.slice(3);
    const want = sc; sc = Math.min(sc, Math.sqrt((matchMedia('(pointer:coarse)').matches ? 16e6 : 110e6) / 12e6)); if (sc < want - .01) toast('Cihaz belleği için kalite biraz düşürüldü.');
    const big = await html2canvas(world, { scale: sc, backgroundColor: null, useCORS: true });
    const rw = Math.round(b.w * sc), rh = Math.round(b.h * sc), out = document.createElement('canvas');
    out.width = rw; out.height = rh; const o = out.getContext('2d');
    o.fillStyle = '#3a2a1c'; o.fillRect(0, 0, rw, rh); o.drawImage(big, -b.x * sc, -b.y * sc, CONFIG.WORLD_W * sc, CONFIG.WORLD_H * sc);
    if (!P) {                                             // PNG: parçalar tek ZIP içinde
      if(n===1){const a=document.createElement('a');a.download='mantar-pano.png';a.href=out.toDataURL('image/png');a.click();return;}
      if(!window.JSZip) throw Error('ZIP kütüphanesi yüklenemedi'); const zip=new JSZip();
      for(let r=0;r<n;r++)for(let c=0;c<n;c++){const t=document.createElement('canvas');t.width=Math.ceil(rw/n);t.height=Math.ceil(rh/n);t.getContext('2d').drawImage(out,-c*rw/n,-r*rh/n);const blob=await new Promise(res=>t.toBlob(res,'image/png'));zip.file(`mantar-pano-parca-${r*n+c+1}-${n*n}.png`,blob);}
      const blob=await zip.generateAsync({type:'blob'}),a=document.createElement('a');a.download=`mantar-pano-${n*n}-parca.zip`;a.href=URL.createObjectURL(blob);a.click();setTimeout(()=>URL.revokeObjectURL(a.href),300000);return;
    }
    const d = new window.jspdf.jsPDF({ orientation: pw > ph ? 'landscape' : 'portrait', unit: 'mm', format: [pw, ph] }), tw = rw / n, th = rh / n;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const t = document.createElement('canvas'); t.width = Math.round(tw); t.height = Math.round(th);
      t.getContext('2d').drawImage(out, -c * tw, -r * th);
      if (r || c) d.addPage([pw, ph], pw > ph ? 'landscape' : 'portrait');
      d.addImage(t.toDataURL('image/jpeg', .92), 'JPEG', M, M, pw - 2 * M, ph - 2 * M);
      if (n > 1) { d.setFontSize(8); d.setTextColor(120); d.text(`Sayfa ${r * n + c + 1}/${n * n}  (satır ${r + 1}, sütun ${c + 1})`, M, M - 2); }
    }
    d.save(`mantar-pano-${f}${n > 1 ? '-' + n * n + 'sayfa' : ''}.pdf`);
  } catch (e) { alert('Dışa aktarma başarısız oldu. Bellek aşılmış olabilir: kaliteyi "Normal" yapıp ya da 4 parçaya bölerek tekrar dene.'); }
  finally { btn.disabled = false; btn.textContent = bt; baked.forEach(([im, s0, f]) => { im.src = s0; im.style.filter = f; }); world.style.transform = old; flt = oldFlt; legend();
    if (oldSel && oldSel.isConnected && !sel) { sel = oldSel; oldSel.classList.add('sel'); syncCat(); }   // z-index'i bump'lamadan geri yükle
    if (oldFrom && oldFrom.isConnected && !from) { from = oldFrom; from.classList.add('from'); }
    if (oldQ) { $('#search').value = oldQ; $('#search').dispatchEvent(new Event('input')); }
    exporting = false; $('#bar').inert = false; }
};

/* ---------- Boyut, sınıf, doku ---------- */
const CATS = { 'Önemli': '#c1121f', 'Fikir': '#d9730d', 'Soru': '#1d6fb8', 'Örnek': '#2a7f3e', 'Tarih': '#7b3fa0', 'Diğer': '#555' };
const DEF = { pol: 'Örnek', note: 'Fikir', news: 'Önemli', news2: 'Önemli', postit: 'Fikir', doc: 'Önemli', tick: 'Tarih' };
let flt = null;
const tf = c => c.style.transform = `rotate(${c.dataset.r || 0}deg) scale(${c.dataset.s || 1})`;

function ensure(c) {
  if (!c.querySelector('.rt')) { const r = document.createElement('div'); r.className = 'rt'; r.textContent = '↻'; r.title = 'Döndür (Shift: 15° adım)'; c.appendChild(r); }
  if (!c.querySelector('.xdel')) { const x = document.createElement('div'); x.className = 'xdel'; x.textContent = '✕'; x.title = 'Sil'; c.appendChild(x); }
  if (!c.querySelector('.mvh')) { const m = document.createElement('div'); m.className = 'mvh'; m.textContent = '✥'; m.title = 'Taşı'; c.appendChild(m); }
  if (!c.querySelector('.rz')) { const z = document.createElement('div'); z.className = 'rz'; c.appendChild(z); }
  let t = c.querySelector('.tag');
  if (!t) { t = document.createElement('div'); t.className = 'tag'; c.appendChild(t); }
  const k = c.dataset.cat || 'Diğer';
  t.contentEditable = 'true'; t.spellcheck = false; t.textContent = k; t.style.background = c.dataset.cc || CATS[k] || '#555';
}
function startResize(e, c) {
  e.preventDefault(); lift(c); const x0 = e.clientX, s0 = +c.dataset.s || 1, w = c.offsetWidth;
  const mv = m => { c.dataset.s = Math.min(3, Math.max(.4, s0 + (m.clientX - x0) / v.k / w)).toFixed(2); tf(c); dirty = true; drawThreads(); };
  const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); stick(c); };
  addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
}
function startRotate(e, c) {
  e.preventDefault(); select(c); lift(c);
  const mv = m => {
    const q = toWorld(m), px = c.offsetLeft + c.offsetWidth / 2, py = c.offsetTop;
    let a = Math.atan2(q.x - px, -(q.y - py)) * 180 / Math.PI; if (m.shiftKey) a = Math.round(a / 15) * 15;
    c.dataset.r = a.toFixed(1); tf(c); syncRot(); dirty = true; drawThreads();
  };
  const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); stick(c); };
  addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
}
function syncRot() { const r = $('#rot'); r.disabled = !sel; r.value = sel ? ((((+sel.dataset.r || 0) + 180) % 360 + 360) % 360) - 180 : 0; }
$('#rot').oninput = e => { if (sel) { sel.dataset.r = e.target.value; tf(sel); drawThreads(); } };
$('#rot0').onclick = () => { if (sel) { sel.dataset.r = 0; tf(sel); syncRot(); drawThreads(); save(); } };
function nudge(ds, dr) {
  if (!sel) return;
  sel.dataset.s = Math.min(3, Math.max(.4, (+sel.dataset.s || 1) + ds)).toFixed(2); sel.dataset.r = (+sel.dataset.r || 0) + dr;
  tf(sel); syncRot(); drawThreads(); save();
}
$('#bigger').onclick = () => nudge(.1, 0); $('#smaller').onclick = () => nudge(-.1, 0);
addEventListener('keydown', e => {
  if (e.target.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) || !sel) return;
  ({ '+': () => nudge(.1, 0), '=': () => nudge(.1, 0), '-': () => nudge(-.1, 0), '[': () => nudge(0, -3), ']': () => nudge(0, 3) })[e.key]?.();
});

const FIL = b => `brightness(${b}%) contrast(1.05) saturate(.85) sepia(.12)`;
function syncBr() { const r = $('#bright'), im = sel && sel.querySelector('img'); r.disabled = !im; r.value = im ? (sel.dataset.br || 100) : 100; }
$('#bright').oninput = e => { const im = sel && sel.querySelector('img'); if (!im) return; sel.dataset.br = e.target.value; im.style.filter = FIL(e.target.value); };
function syncCat() { syncBr(); syncCardTab();
  syncRot(); const s = $('#cat'), cc = $('#catColor'); s.disabled = cc.disabled = !sel;
  if (sel) { const k = sel.dataset.cat || 'Diğer'; s.value = k; cc.value = sel.dataset.cc || CATS[k] || '#555555'; }
}
$('#cat').oninput = e => { if (!sel) return; const k = e.target.value.trim() || 'Diğer'; sel.dataset.cat = k; if (!sel.dataset.cc) $('#catColor').value = CATS[k] || '#555555'; ensure(sel); legend(); save(); };
$('#catColor').oninput = e => { if (sel) { sel.dataset.cc = e.target.value; ensure(sel); legend(); save(); } };
world.addEventListener('input', e => {                       // etiketi doğrudan kart üzerinde yazma
  if (!e.target.classList.contains('tag')) return;
  const c = e.target.parentNode, k = e.target.textContent.trim() || 'Diğer'; c.dataset.cat = k;
  if (!c.dataset.cc) e.target.style.background = CATS[k] || '#555'; $('#cat').value = k; legend();
});
world.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.target.classList.contains('tag') || e.target.classList.contains('st'))) { e.preventDefault(); e.target.blur(); } });
function legend() {
  const cards = [...world.querySelectorAll('.card')], n = {}, col = {}, L = $('#legend');
  cards.forEach(c => { const k = c.dataset.cat || 'Diğer'; n[k] = (n[k] || 0) + 1; col[k] = col[k] || c.dataset.cc || CATS[k] || '#555'; });
  L.textContent = '';
  [...new Set([...Object.keys(CATS), ...Object.keys(n)])].forEach(k => {
    const b = document.createElement('button'), i = document.createElement('i'), m = document.createElement('em');
    b.dataset.k = k; b.className = flt === k ? 'on' : ''; i.style.background = col[k] || CATS[k] || '#555'; m.textContent = n[k] || 0;
    b.append(i, k, m); L.appendChild(b);
  });
  cards.forEach(c => c.classList.toggle('dim', !!flt && (c.dataset.cat || 'Diğer') !== flt));
}
$('#legend').onclick = e => { const b = e.target.closest('button'); if (b) { flt = flt === b.dataset.k ? null : b.dataset.k; legend(); } };

/* Metne ilk tıklamada tüm yazı seçilir: tek tuşla silinir ya da üstüne yazılır */
world.addEventListener('focusin', e => {
  const t = e.target; if (!t.isContentEditable || t.dataset.d) return;
  setTimeout(() => { const r = document.createRange(); r.selectNodeContents(t); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }, 0);
});
world.addEventListener('input', e => { if (e.target.isContentEditable) e.target.dataset.d = 1; });

/* ---------- Başlangıç ---------- */
(async()=>{ $('#bar').inert = true; let d=null; try { d=await readBoard(KEY); if(d) restore(d); else { const legacy=JSON.parse(localStorage.getItem(KEY)||'null'); if(legacy) {restore(legacy); save(false);} else {addCard('news');addCard('note');} } historyPush(); } catch(e){ if(d) { persistBoard(d, KEY+'-hatali-'+Date.now()).catch(()=>{}); toast('Kayıtlı pano okunamadı; bozuk kopya ayrıca saklandı.'); } addCard('news');addCard('note'); } finally { loading = false; $('#bar').inert = false; } })();

/* ---------- Sekmeler, yardım, bilgilendirme ---------- */
const bar = $('#bar');
new ResizeObserver(() => document.documentElement.style.setProperty('--mobile-bar', bar.offsetHeight + 'px')).observe(bar);
// Masaüstünde sekmeler açılır-kapanır (varsayılan kapalı); telefonda alt çubukta her zaman biri açık.
const desk = () => matchMedia('(min-width:761px)').matches;
function openTab(t) {
  bar.dataset.tab = t;
  bar.querySelectorAll('.tabs button').forEach(b => { const on = b.dataset.tab === t; b.classList.toggle('on', on); b.setAttribute('aria-expanded', String(on)); });
}
function syncCardTab() {   // "Kart" sekmesi yalnızca bir kart seçiliyken görünür
  const b = $('#bar'), t = b && b.querySelector('.tabs [data-tab=card]'); if (!t) return;
  t.hidden = !sel; if (!sel && b.dataset.tab === 'card') openTab(desk() ? '' : 'tools');
}
bar.querySelector('.tabs').onclick = e => { const t = e.target.closest('button')?.dataset.tab; if (!t) return; openTab(desk() && bar.dataset.tab === t ? '' : t); };
// Bir işlem düğmesine basınca masaüstünde panel kendiliğinden kapanır (ayar düğmeleri açık kalır).
bar.addEventListener('click', e => {
  const b = e.target.closest('.pane button'); if (!b || !desk()) return;
  if (b.closest('.pane').dataset.tab === 'card' && b.id !== 'del' && b.id !== 'dup') return;
  openTab('');
});
addEventListener('pointerdown', e => { if (desk() && bar.dataset.tab && !bar.contains(e.target)) openTab(''); }, true);   // dışarı tıklayınca kapat
addEventListener('keydown', e => {
  if (e.key !== 'Escape' || !desk() || !bar.dataset.tab) return;
  const t = bar.dataset.tab, inside = bar.contains(document.activeElement); openTab('');
  if (inside) bar.querySelector(`.tabs button[data-tab=${t}]`)?.focus();
});
openTab(desk() ? '' : 'tools'); syncCardTab();
const toastQueue=[]; let toastBusy=false; function toast(m){toastQueue.push(String(m));if(toastBusy)return;const show=()=>{if(!toastQueue.length){toastBusy=false;return;}toastBusy=true;const t=$('#toast');t.textContent=toastQueue.shift();t.hidden=false;clearTimeout(show.timer);show.timer=setTimeout(()=>{t.hidden=true;show();},4200);};show();}
$('#helpBtn').onclick = () => $('#help').hidden = false;
$('#help').onclick = e => { if (e.target.id === 'help' || e.target.dataset.close) $('#help').hidden = true; };
try { if (!localStorage.getItem('mantar-help-seen')) { $('#help').hidden = false; localStorage.setItem('mantar-help-seen', 1); } } catch (e) {}
$('#legendBtn').onclick = () => $('#legend').classList.toggle('show');
function fitAll() {
  const b = bounds(true), bh = matchMedia('(max-width:760px)').matches ? bar.offsetHeight : 0, H = innerHeight - bh;
  const k = Math.max(MINK(), Math.min(3, .92 * Math.min(innerWidth / b.w, H / b.h)));
  v.k = k; v.x = innerWidth / 2 - (b.x + b.w / 2) * k; v.y = H / 2 - (b.y + b.h / 2) * k; place();
}
$('#fitBtn').onclick = fitAll;
const INFO = { png1: 'Normal: ekranda ve telefonda paylaşmak için, küçük dosya.', png2: 'Yüksek (önerilen): yazıcıdan çıktı için de yeterince net.',
  png3: 'Çok yüksek: en net ama dosya çok büyük; telefonda hata verebilir.', A4: 'A4 kâğıda yazdırmak için PDF.', A3: 'A3 kâğıda yazdırmak için PDF.', POSTER: 'Büyük poster baskısı için PDF.' };
function expInfo() { const n = +$('#split').value; $('#expInfo').textContent = INFO[$('#fmt').value] + (n > 1 ? ` ${n * n} parçaya bölünür: her parçayı ayrı kâğıda bas, kenarları hizalayıp yapıştır.` : ''); }
$('#fmt').onchange = $('#split').onchange = expInfo; expInfo();
setMode('select');
