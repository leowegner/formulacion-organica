'use strict';

const $ = (s, r = document) => r.querySelector(s);
const SUBS = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆' };
const sub = s => s.replace(/\d/g, d => `<sub>${d}</sub>`);
const usub = s => s.replace(/\d/g, d => SUBS[d]);

// ---------- dibujo de moléculas ----------

// Cadena: lista de trozos; un trozo [átomo, rama] dibuja la rama colgando debajo.
function chain(parts) {
  return '<span class="chain">' + parts.map(p => Array.isArray(p)
    ? `<span class="br"><span>${sub(p[0])}</span><span>|</span><span>${sub(p[1])}</span></span>`
    : `<span>${sub(p)}</span>`).join('') + '</span>';
}

// Anillo: n vértices, el 0 arriba y en sentido horario. subs = {vértice: "grupo"}; "=O" dibuja un doble enlace.
function ring(s) {
  const R = 24, cx = 44, cy = 54, n = s.n;
  const v = i => { const a = (-90 + i * 360 / n) * Math.PI / 180; return [Math.cos(a), Math.sin(a)]; };
  let w = 92;
  for (const k in (s.subs || {})) if (v(+k)[0] > 0.3) w = Math.max(w, cx + R + 24 + s.subs[k].length * 8.5);
  let o = `<svg width="${w}" height="108" viewBox="0 0 ${w} 108" fill="none" stroke="currentColor" stroke-width="1.5">`;
  o += '<polygon points="' + [...Array(n).keys()].map(i => { const [c, d] = v(i); return (cx + R * c) + ',' + (cy + R * d); }).join(' ') + '"/>';
  if (s.benz) o += `<circle cx="${cx}" cy="${cy}" r="${R * 0.58}"/>`;
  for (const k in (s.subs || {})) {
    let lab = s.subs[k];
    const [c, d] = v(+k);
    const x1 = cx + R * c, y1 = cy + R * d, x2 = cx + (R + 14) * c, y2 = cy + (R + 14) * d;
    if (lab[0] === '=') {
      lab = lab.slice(1);
      const px = -d * 2, py = c * 2;
      o += `<line x1="${x1 + px}" y1="${y1 + py}" x2="${x2 + px}" y2="${y2 + py}"/><line x1="${x1 - px}" y1="${y1 - py}" x2="${x2 - px}" y2="${y2 - py}"/>`;
    } else o += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
    const anchor = c > 0.3 ? 'start' : c < -0.3 ? 'end' : 'middle';
    const tx = cx + (R + 17) * c, ty = cy + (R + 17) * d + (Math.abs(c) < 0.3 ? (d > 0 ? 11 : -2) : 5);
    o += `<text x="${tx}" y="${ty}" text-anchor="${anchor}" fill="currentColor" stroke="none">${usub(lab)}</text>`;
  }
  return o + '</svg>';
}
const draw = m => Array.isArray(m) ? chain(m) : ring(m);

// ---------- banco de moléculas ----------

const seen = new Set();
const BANK = [...RAW_N.map(([m, n]) => ({ m, n })), ...RAW_F.map(([n, m]) => ({ m, n }))]
  .filter(e => !seen.has(e.n) && seen.add(e.n));

// "a / b" y "a (b)" son nombres alternativos válidos.
const alts = n => n.split(' / ').flatMap(p => { const m = p.match(/^(.*?) \((.*)\)$/); return m ? [m[1], m[2]] : [p]; });
const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const hasN = n => /amin|amid|^N[-,]/.test(n);
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
};

// ---------- simulacro ----------

const TOTAL = 30, HALF = 15, LIMIT = 20 * 60;
let S = null, timer = null;

function simHome() {
  clearInterval(timer);
  const hist = store.get('hist', []);
  const chip = ok => `<span class="chip ${ok >= 24 ? 'good' : ok >= 15 ? 'mid' : ''}">${(ok / 3).toFixed(1)}</span>`;
  $('#sim').innerHTML = `
    <div class="hero">
      <div>
        <h2>Simulacro de examen</h2>
        <p>${HALF} moléculas para nombrar aquí y ${HALF} para formular en papel. Al corregir, los nombres se comprueban solos y las fórmulas las marcas tú comparando con la solución.</p>
        <label class="check"><input type="checkbox" id="withN" ${store.get('withN', false) ? 'checked' : ''}> Incluir aminas y amidas</label>
        <button class="primary" id="go">Empezar simulacro</button>
      </div>
      <div class="stats"><div><b>${TOTAL}</b><span>ejercicios</span></div><div><b>20</b><span>minutos</span></div><div><b>${BANK.length}</b><span>moléculas</span></div></div>
    </div>
    ${hist.length ? `<h2>Tus últimos simulacros</h2><div class="scroll"><table><tr><th>Fecha</th><th>Aciertos</th><th>Nota</th><th>Tiempo</th></tr>${
      hist.slice(-8).reverse().map(h => `<tr><td>${h.d}</td><td>${h.ok} / ${TOTAL}</td><td>${chip(h.ok)}</td><td>${fmt(h.t)}</td></tr>`).join('')}</table></div>` : ''}`;
  $('#go').onclick = simStart;
  $('#withN').onchange = e => store.set('withN', e.target.checked);
}

const fmt = t => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');

function simStart() {
  const withN = $('#withN').checked;
  const pool = shuffle(BANK.filter(e => withN || !hasN(e.n)));
  S = { t0: Date.now(), used: 0, graded: false, q: pool.slice(0, TOTAL).map((e, i) => ({ ...e, type: i < HALF ? 'n' : 'f', ok: null })) };
  const card = (q, i) => q.type === 'n'
    ? `<div class="card" data-i="${i}"><span class="num">${i + 1}</span><div class="mol">${draw(q.m)}</div><input autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Nombre"><div class="res"></div></div>`
    : `<div class="card" data-i="${i}"><span class="num">${i + 1}</span><p class="name">${q.n}</p><div class="mol" hidden>${draw(q.m)}</div><div class="res"></div></div>`;
  $('#sim').innerHTML = `
    <div class="bar"><span id="clock">20:00</span><div class="prog"><i id="prog"></i></div><span class="score" id="score"></span><button class="primary" id="grade">Corregir</button></div>
    <h2>Parte 1: nombra</h2><div class="grid">${S.q.slice(0, HALF).map(card).join('')}</div>
    <h2>Parte 2: formula en papel</h2><div class="grid">${S.q.slice(HALF).map((q, i) => card(q, i + HALF)).join('')}</div>`;
  $('#grade').onclick = simGrade;
  timer = setInterval(() => {
    const left = LIMIT - (Date.now() - S.t0) / 1000;
    const c = $('#clock');
    c.textContent = fmt(Math.max(0, left));
    c.classList.toggle('low', left < 120);
    $('#prog').style.width = Math.max(0, left / LIMIT * 100) + '%';
    if (left <= 0) simGrade();
  }, 500);
}

function simGrade() {
  if (S.graded) return;
  clearInterval(timer);
  S.graded = true;
  S.used = Math.min(LIMIT, (Date.now() - S.t0) / 1000);
  S.date = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  S.q.forEach((q, i) => {
    const el = $(`.card[data-i="${i}"]`), res = $('.res', el);
    if (q.type === 'n') {
      const inp = $('input', el);
      inp.disabled = true;
      q.ok = alts(q.n).map(norm).includes(norm(inp.value));
      res.innerHTML = `<b>${q.n}</b>` + (q.ok ? '' : '<div class="row"><button data-set="1">Mi respuesta también vale</button></div>');
    } else {
      $('.mol', el).hidden = false;
      res.innerHTML = '<div class="row"><button data-set="1">La tenía bien</button><button data-set="0">La tenía mal</button></div>';
    }
  });
  $('#sim').onclick = e => {
    const b = e.target.closest('button[data-set]');
    if (!b) return;
    S.q[+b.closest('.card').dataset.i].ok = b.dataset.set === '1';
    simScore();
  };
  $('#grade').textContent = 'Nuevo simulacro';
  $('#grade').onclick = simHome;
  simScore();
  window.scrollTo(0, 0);
}

function simScore() {
  S.q.forEach((q, i) => {
    const el = $(`.card[data-i="${i}"]`);
    el.classList.toggle('ok', q.ok === true);
    el.classList.toggle('bad', q.ok === false);
  });
  const ok = S.q.filter(q => q.ok).length, pending = S.q.filter(q => q.ok === null).length;
  $('#clock').textContent = fmt(S.used);
  $('#clock').classList.remove('low');
  $('.prog').hidden = true;
  $('#score').textContent = `${ok} / ${TOTAL} · nota ${(ok / 3).toFixed(1)}` + (pending ? ` · faltan ${pending} por marcar` : '');
  const hist = store.get('hist', []).filter(h => h.id !== S.t0);
  hist.push({ id: S.t0, d: S.date, ok, t: Math.round(S.used) });
  store.set('hist', hist.slice(-30));
}

// ---------- familias ----------

const FAM = [
  ['CH3–CH2–OH', 'Alcohol'], ['CH3–CHOH–CH3', 'Alcohol'], ['CH3–CH2–CH2–CH2–OH', 'Alcohol'],
  ['CH3–O–CH3', 'Éter'], ['CH3–CH2–O–CH3', 'Éter'], ['CH3–CH2–O–CH2–CH3', 'Éter'],
  ['CH3–CHO', 'Aldehído'], ['CH3–CH2–CHO', 'Aldehído'], ['H–CHO', 'Aldehído'],
  ['CH3–CO–CH3', 'Cetona'], ['CH3–CH2–CO–CH3', 'Cetona'], ['CH3–CH2–CO–CH2–CH3', 'Cetona'],
  ['CH3–COOH', 'Ácido'], ['H–COOH', 'Ácido'], ['CH3–CH2–COOH', 'Ácido'],
  ['CH3–CO–O–CH3', 'Éster'], ['H–CO–O–CH2–CH3', 'Éster'], ['CH3–CH2–CO–O–CH3', 'Éster'],
  ['CH3–CN', 'Nitrilo'], ['CH3–CH2–CN', 'Nitrilo'],
  ['CH3–CH2–Cl', 'Halógeno'], ['CH3–CHBr–CH3', 'Halógeno'],
  ['CH3–NH2', 'Amina'], ['CH3–CH2–NH–CH3', 'Amina'], ['CH3–CH2–CH2–NH2', 'Amina'],
  ['CH3–CO–NH2', 'Amida'], ['CH3–CO–NH–CH3', 'Amida'], ['CH3–CH2–CO–NH2', 'Amida'],
];
const INFO = {
  'Ácido': 'ácido -oico', 'Éster': '-oato de -ilo', 'Amida': '-amida', 'Nitrilo': '-nitrilo · prefijo ciano-',
  'Aldehído': '-al · prefijo oxo-', 'Cetona': '-ona · prefijo oxo-', 'Alcohol': '-ol · prefijo hidroxi-',
  'Amina': '-amina · prefijo amino-', 'Éter': '-oxi- o «éter»', 'Halógeno': 'siempre prefijo: cloro-, bromo-…',
};
const F = { ok: 0, n: 0, streak: 0, cur: null };

function famNext() {
  const withN = store.get('withN', false);
  const pool = FAM.filter(f => withN || !['Amina', 'Amida'].includes(f[1]));
  let q;
  do q = pool[Math.floor(Math.random() * pool.length)]; while (F.cur && q[0] === F.cur[0]);
  F.cur = q;
  const fams = Object.keys(INFO).filter(f => withN || !['Amina', 'Amida'].includes(f));
  $('#fam').innerHTML = `
    <p>¿A qué familia pertenece? <span class="mute">Aciertos: ${F.ok} / ${F.n} · racha: ${F.streak}</span></p>
    <div class="big">${chain([q[0]])}</div>
    <div class="opts">${fams.map(f => `<button data-f="${f}">${f}</button>`).join('')}</div>
    <p id="fb" class="mute">&nbsp;</p>`;
  $('#fam').onclick = e => {
    const b = e.target.closest('button[data-f]');
    if (!b || F.done) return;
    F.done = true; F.n++;
    const right = b.dataset.f === q[1];
    right ? (F.ok++, F.streak++) : (F.streak = 0);
    b.classList.add(right ? 'ok' : 'bad');
    $(`#fam button[data-f="${q[1]}"]`).classList.add('ok');
    $('#fb').innerHTML = `<b>${q[1]}</b>: ${INFO[q[1]]}. <button id="next" class="primary">Siguiente</button>`;
    $('#next').onclick = () => { F.done = false; famNext(); };
  };
}

// ---------- navegación ----------

document.querySelectorAll('nav button').forEach(b => b.onclick = () => {
  document.querySelectorAll('nav button').forEach(x => x.classList.toggle('on', x === b));
  document.querySelectorAll('main > section').forEach(s => s.hidden = s.id !== b.dataset.v);
  if (b.dataset.v === 'fam') { F.done = false; famNext(); }
});
simHome();
if (location.hash === '#demo') simStart();
