/* Carnet Repas — appli web installable (Supabase + GitHub Pages) */
'use strict';

const CFG = window.CARNET_CONFIG || {};
const CONFIGURED = CFG.supabaseUrl && !/VOTRE/.test(CFG.supabaseUrl) && CFG.supabaseAnonKey && !/VOTRE/.test(CFG.supabaseAnonKey);
const sb = CONFIGURED ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'carnet-auth' }
}) : null;

const CATS = ['Tout', 'Plat batch', 'Week-end', 'Plat', 'Soupe', 'Salade', 'Accompagnement', 'Quiche & salé', 'Petit-déjeuner', 'Boisson', 'Dessert', 'Pain & viennoiserie', 'Sauce & base', 'Autre'];
const TAGS = [['favoris','★ Favoris'],['à valider','À valider'],['à traduire','À traduire'],['congelable','Congelable'],['volaille','Volaille'],['bœuf','Bœuf'],['porc','Porc'],['poisson','Poisson'],['légumineuses','Légumineuses'],['pâtes','Pâtes'],['pommes de terre','Pommes de terre'],['champignons','Champignons'],['shaker','Shaker requis']];

// Recherche : équivalents anglais pour les recettes pas encore traduites
const SYN = {poulet:'chicken',dinde:'turkey',boeuf:'beef',porc:'pork',saumon:'salmon',cabillaud:'cod',oeuf:'egg',oeufs:'egg',
  'pois chiches':'chickpea','pois chiche':'chickpea',lentilles:'lentil',lentille:'lentil',haricots:'bean',haricot:'bean',riz:'rice',pates:'pasta',
  avoine:'oat',flocons:'oat',farine:'flour',sucre:'sugar',lait:'milk',beurre:'butter',fromage:'cheese',yaourt:'yogurt',
  courgette:'zucchini',courgettes:'zucchini','patate douce':'sweet potato','patates douces':'sweet potato',butternut:'butternut',potiron:'pumpkin',courge:'squash',
  carotte:'carrot',carottes:'carrot',epinards:'spinach','chou-fleur':'cauliflower','chou fleur':'cauliflower',brocoli:'broccoli',chou:'cabbage',
  champignons:'mushroom',champignon:'mushroom',oignon:'onion',ail:'garlic',tomate:'tomato',tomates:'tomato',poivron:'pepper',poivrons:'pepper',
  pomme:'apple',pommes:'apple',banane:'banana',myrtilles:'blueberr',myrtille:'blueberr',fraise:'strawberr',fraises:'strawberr',citron:'lemon',
  'citron vert':'lime',coco:'coconut',chocolat:'chocolate',cacao:'cocoa',miel:'honey',cannelle:'cinnamon',gingembre:'ginger',coriandre:'cilantro',
  'pomme de terre':'potato','pommes de terre':'potato',mais:'corn',quinoa:'quinoa',tofu:'tofu',feta:'feta',mozzarella:'mozzarella'};

const S = {
  session: null, role: null, online: navigator.onLine,
  recettes: new Map(), seances: new Map(), loaded: false, syncedAt: null,
  route: { name: 'recettes' }, q: '', cat: 'Tout', tag: null, favs: new Set(),
  portions: {}, checked: {}, confirmDel: false, cook: null, timers: [], busy: false
};

/* ---------- utilitaires ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const slug = s => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || ('r-' + Date.now());
const isEditor = () => S.role === 'editeur';
const ICON = {
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  chev: '<svg class="chev" viewBox="0 0 9 14"><path d="M1.5 1.5L7 7l-5.5 5.5"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
  timer: '<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/></svg>'
};

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, 2600);
}
function fmtDate(d, opts) { try { return new Date(d).toLocaleDateString('fr-FR', opts); } catch { return ''; } }

/* ---------- quantités ---------- */
function roundQ(v, u) {
  if (v == null) return null;
  if (u === 'g' || u === 'ml') { if (v >= 100) return Math.round(v / 5) * 5; if (v >= 10) return Math.round(v); return Math.round(v * 10) / 10; }
  if (v >= 10) return Math.round(v);
  return Math.round(v * 4) / 4;
}
function fmtQ(q, u) {
  if (q == null || q === '') return '';
  const s = roundQ(q, u).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
  return u ? s + ' ' + u : s;
}
function parseIngLine(line) {
  line = line.trim(); if (!line) return null;
  if (/:$/.test(line)) return { grp: line.replace(/\s*:$/, '').trim() };
  const m = line.match(/^(\d+(?:[.,]\d+)?)\s*(kg|g|cl|ml|l)?(?=\s|$)\s*(.*)$/i);
  if (!m) return { q: null, u: '', n: line };
  let q = parseFloat(m[1].replace(',', '.')), u = (m[2] || '').toLowerCase();
  if (u === 'kg') { q *= 1000; u = 'g'; } else if (u === 'cl') { q *= 10; u = 'ml'; } else if (u === 'l') { q *= 1000; u = 'ml'; }
  return { q, u, n: m[3].trim() };
}
const ingToLine = i => i.grp ? i.grp + ' :' : (i.q == null ? i.n : (i.u ? i.q + ' ' + i.u : String(i.q)) + ' ' + i.n);
function parseStepLine(line) {
  line = line.trim(); if (!line) return null;
  let min = null; const m = line.match(/[\[(](\d+(?:[.,]\d+)?)\s*min[\])]/i);
  if (m) { min = parseFloat(m[1].replace(',', '.')); line = line.replace(m[0], '').trim(); }
  return { t: line, min };
}
const stepToLine = s => s.t + (s.min ? ' [' + s.min + ' min]' : '');

/* ---------- données ---------- */
const CACHE_KEY = 'carnet-cache-v1';
function saveCache() {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: S.syncedAt, role: S.role, favs: [...S.favs], recettes: [...S.recettes.values()], seances: [...S.seances.values()] })); } catch {}
}
function loadCache() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); if (!c) return false;
    S.recettes = new Map(c.recettes.map(r => [r.id, r])); S.seances = new Map(c.seances.map(s => [s.id, s]));
    S.favs = new Set(c.favs || []);
    S.syncedAt = c.at; S.role = S.role || c.role; S.loaded = true; return true;
  } catch { return false; }
}
async function refresh(silent) {
  if (!sb || !S.session) return;
  try {
    const email = S.session.user.email;
    const [r, s, m, f] = await Promise.all([
      sb.from('recettes').select('*').order('titre'),
      sb.from('seances').select('*').order('date', { ascending: false }),
      sb.from('membres').select('role').ilike('email', email).maybeSingle(),
      sb.from('favoris').select('recette_id')
    ]);
    if (r.error) throw r.error; if (s.error) throw s.error;
    S.recettes = new Map(r.data.map(x => [x.id, x]));
    S.seances = new Map(s.data.map(x => [x.id, x]));
    S.role = m.data?.role || null;
    if (!f.error) S.favs = new Set(f.data.map(x => x.recette_id));
    S.loaded = true; S.online = true; S.syncedAt = new Date().toISOString();
    saveCache();
  } catch (e) {
    S.online = false;
    if (!S.loaded) loadCache();
    if (!silent) toast('Pas de connexion : affichage de la dernière copie.');
  }
  if (!S.cook && !isTyping()) render();
}
function isTyping() { const a = document.activeElement; return a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && a.type !== 'checkbox')); }

async function writeRow(table, row) {
  const { error } = await sb.from(table).upsert(row);
  if (error) throw error;
}
async function deleteRow(table, id) {
  const { error } = await sb.from(table).delete().eq('id', id);
  if (error) throw error;
}
function writeFailed(e) {
  if (!navigator.onLine) toast('Hors connexion : modification impossible pour l\'instant.');
  else if (/row-level|permission|42501/i.test(e?.message || e?.code || '')) toast('Votre compte est en lecture seule.');
  else toast('Enregistrement impossible : ' + (e?.message || 'erreur inconnue'));
}

/* ---------- routes (#/...) ---------- */
function parseRoute() {
  const h = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  const p = h.split('/').filter(Boolean);
  if (p[0] === 'r' && p[1] && p[2] === 'modifier') return { name: 'edit', id: p[1] };
  if (p[0] === 'r' && p[1]) return { name: 'recette', id: p[1] };
  if (p[0] === 'nouvelle') return { name: 'edit', id: null };
  if (p[0] === 's' && p[1] === 'nouvelle') return { name: 'newseance' };
  if (p[0] === 's' && p[1]) return { name: 'seance', id: p[1] };
  if (p[0] === 's') return { name: 'seances' };
  if (p[0] === 'compte') return { name: 'reglages' };
  return { name: 'recettes' };
}
function go(hash) { if (location.hash === hash) { onRoute(); } else location.hash = hash; }
function onRoute() {
  S.route = parseRoute(); S.confirmDel = false;
  render(); window.scrollTo(0, 0);
}
window.addEventListener('hashchange', onRoute);

/* ---------- rendu ---------- */
function render() {
  const app = $('#app'), tab = $('#tabbar');
  document.body.classList.toggle('cooking', !!S.cook);
  if (!CONFIGURED) { tab.hidden = true; app.innerHTML = viewNotConfigured(); return; }
  if (!S.session) { tab.hidden = true; app.innerHTML = viewLogin(); return; }
  if (S.cook) { tab.hidden = true; app.innerHTML = viewCook(); return; }
  const r = S.route.name;
  tab.hidden = ['edit', 'newseance'].includes(r);
  const cur = r === 'reglages' ? 'reglages' : (['seances', 'seance', 'newseance'].includes(r) ? 'seances' : 'recettes');
  tab.querySelectorAll('button').forEach(b => b.setAttribute('aria-current', b.dataset.tab === cur ? 'page' : 'false'));
  const html = {
    recettes: viewList, recette: viewRecipe, edit: viewEdit,
    seances: viewSeances, seance: viewSeance, newseance: viewNewSeance, reglages: viewSettings
  }[r]();
  app.innerHTML = `<div class="page ${tab.hidden ? 'notab' : ''}">${html}</div>`;
}

function viewNotConfigured() {
  return `<div class="login"><img src="icons/apple-touch-icon.png" alt=""><h1>Carnet Repas</h1>
  <p>L'appli n'est pas encore reliée à la base. Renseignez l'adresse et la clé de votre projet Supabase dans le fichier config.js.</p></div>`;
}
function viewLogin() {
  return `<form class="login" id="loginform" autocomplete="on">
    <img src="icons/apple-touch-icon.png" alt="">
    <h1>Carnet Repas</h1>
    <p>Les recettes de la famille, en grammes.</p>
    <div class="group">
      <input class="cell" type="email" id="l-email" placeholder="Adresse e-mail" autocomplete="username" required>
      <input class="cell" type="password" id="l-pass" placeholder="Mot de passe" autocomplete="current-password" required>
    </div>
    <div class="err" id="l-err"></div>
    <button class="btn pri" type="submit" id="l-go">Se connecter</button>
  </form>`;
}

function tagsHtml(r) {
  const out = [];
  if (r.congelable) out.push('<span class="tag frz">Congelable</span>');
  (r.tags || []).forEach(t => {
    const n = norm(t);
    if (n === 'shaker') out.push('<span class="tag shk">Shaker requis</span>');
    else if (n === 'a valider') out.push('<span class="tag chk">À valider</span>');
    else if (n === 'a traduire') out.push('<span class="tag chk">À traduire</span>');
    else if (n === 'paprika') return;
    else out.push(`<span class="tag">${esc(t)}</span>`);
  });
  return out.join('');
}
function recList() { return [...S.recettes.values()].sort((a, b) => String(a.titre).localeCompare(String(b.titre), 'fr')); }
// Découpe la recherche en termes, en gardant ensemble les expressions connues (« pomme de terre »).
function terms(q) {
  q = norm(q).trim(); if (!q) return [];
  const out = [];
  Object.keys(SYN).filter(k => k.includes(' ')).sort((a, b) => b.length - a.length).forEach(k => {
    const n = norm(k); if (q.includes(n)) { out.push(n); q = q.replace(n, ' '); }
  });
  return out.concat(q.split(/\s+/).filter(Boolean));
}
const synOf = w => { const k = Object.keys(SYN).find(x => norm(x) === w); return k ? SYN[k] : null; };
function hit(hay, w) { const e = synOf(w); return hay.includes(w) || (e && hay.includes(e)); }
function passesFilters(r, cat) {
  if (cat !== 'Tout' && r.categorie !== cat) return false;
  if (S.tag === 'favoris') return S.favs.has(r.id);
  if (S.tag === 'congelable' && !r.congelable) return false;
  if (S.tag && S.tag !== 'congelable' && !(r.tags || []).map(norm).includes(norm(S.tag))) return false;
  return true;
}
function matches(r, ws) {
  if (!ws.length) return true;
  const hay = norm([r.titre, r.categorie, (r.tags || []).join(' '), (r.ingredients || []).map(i => i.n || i.grp).join(' ')].join(' '));
  return ws.every(w => hit(hay, w));
}
// Ingrédients qui correspondent à la recherche, affichés sous le titre quand le titre ne suffit pas.
function ingHits(r, ws) {
  if (!ws.length) return [];
  const t = norm(r.titre);
  const need = ws.filter(w => !hit(t, w)); if (!need.length) return [];
  return (r.ingredients || []).filter(i => i.n && need.some(w => hit(norm(i.n), w))).map(i => i.n).slice(0, 3);
}
function filtered() {
  const ws = terms(S.q);
  return recList().filter(r => passesFilters(r, S.cat) && matches(r, ws));
}
function offlineBanner() {
  return S.online ? '' : `<div class="banner off">Hors connexion. Copie du ${esc(fmtDate(S.syncedAt, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }))}.</div>`;
}
function viewList() {
  const ws = terms(S.q), counts = {};
  S.recettes.forEach(r => { if (passesFilters(r, 'Tout') && matches(r, ws)) { counts.Tout = (counts.Tout || 0) + 1; counts[r.categorie] = (counts[r.categorie] || 0) + 1; } });
  const chipsC = CATS.filter(c => c === 'Tout' || c === S.cat || counts[c]).map(c => `<button class="chip" data-cat="${esc(c)}" aria-pressed="${S.cat === c}">${esc(c)} <span class="cn">${counts[c] || 0}</span></button>`).join('');
  const chipsT = TAGS.map(([k, l]) => `<button class="chip" data-tag="${esc(k)}" aria-pressed="${S.tag === k}">${esc(l)}</button>`).join('');
  return `<div class="nav"><span></span>${isEditor() ? '<button class="act" data-go="#/nouvelle">Ajouter</button>' : ''}</div>
  <h1 class="large">Recettes</h1>
  ${offlineBanner()}
  <label class="search">${ICON.search}<input type="search" id="q" placeholder="Plat ou ingrédients : poulet courgette…" value="${esc(S.q)}" autocomplete="off" enterkeyhint="search"></label>
  <div class="chips" id="chipsC">${chipsC}</div>
  <div class="chips">${chipsT}</div>
  <div id="results">${listResults()}</div>`;
}
function listResults() {
  if (!S.loaded) return '<div class="empty">Chargement des recettes…</div>';
  if (!S.recettes.size) return `<div class="empty"><b>Aucune recette</b><span>Les fiches créées avec Claude apparaîtront ici.</span></div>`;
  const rows = filtered(), ws = terms(S.q);
  if (!rows.length) return `<div class="empty"><b>Aucun résultat</b><span>${S.tag === 'favoris' && !S.favs.size ? 'Touchez l\'étoile d\'une recette pour l\'ajouter à vos favoris.' : 'Essayez un autre mot ou retirez un filtre.'}</span></div>`;
  return `<div class="section-h">${rows.length} recette${rows.length > 1 ? 's' : ''}</div><div class="group">` + rows.map(r => { const ih = ingHits(r, ws); return `
    <button class="cell" data-go="#/r/${esc(encodeURIComponent(r.id))}">
      <span class="main"><span class="t">${S.favs.has(r.id) ? '<span class="star on" aria-label="Favori">★</span> ' : ''}${esc(r.titre)}</span>${ih.length ? `<span class="ih">${esc(ih.join(' · '))}</span>` : ''}<span class="m"><span class="tag cat">${esc(r.categorie || 'Autre')}</span>${tagsHtml(r)}</span></span>
      <span class="r num">×${esc(r.portions)}</span>${ICON.chev}
    </button>`; }).join('') + '</div>';
}

function curPortions(r) { return S.portions[r.id] ?? r.portions ?? 1; }
function ingCells(r, key) {
  const f = curPortions(r) / (r.portions || 1), chk = S.checked[key] || (S.checked[key] = {});
  let html = '', open = false;
  (r.ingredients || []).forEach((i, k) => {
    if (i.grp) { if (open) html += '</div>'; html += `<div class="grp">${esc(i.grp)}</div><div class="group">`; open = true; return; }
    if (!open) { html += '<div class="group">'; open = true; }
    html += `<label class="cell ing"><input type="checkbox" data-chk="${esc(key)}" data-k="${k}" ${chk[k] ? 'checked' : ''}><span class="q num">${esc(fmtQ(i.q == null ? null : i.q * f, i.u))}</span><span class="n">${esc(i.n)}</span></label>`;
  });
  return html + (open ? '</div>' : '');
}
function stepsHtml(steps, who) {
  return '<div class="steps">' + steps.map((s, k) => `<div class="step"><div>${who && s.r ? `<span class="who">${esc(who(s.r))}</span>` : ''}<p>${esc(s.t)}</p>${s.min ? `<button class="tbtn" data-timer="${k}">${ICON.timer}${esc(String(s.min).replace('.', ','))} min</button>` : ''}</div></div>`).join('') + '</div>';
}
function backBtn(hash, label) { return `<button class="back" data-go="${hash}">${ICON.back}${esc(label)}</button>`; }

function viewRecipe() {
  const r = S.recettes.get(S.route.id);
  if (!r) return `<div class="nav">${backBtn('#/', 'Recettes')}</div><div class="empty"><b>Recette introuvable</b></div>`;
  const p = curPortions(r);
  const kv = [['Accompagnement', r.accompagnement], ['Protéines Papa', r.proteines], ['Conservation', r.conservation], ['Origine', r.source]].filter(x => x[1]);
  const aValider = (r.tags || []).some(t => norm(t) === 'a valider'), aTraduire = (r.tags || []).some(t => norm(t) === 'a traduire');
  const fav = S.favs.has(r.id);
  return `<div class="nav">${backBtn('#/', 'Recettes')}<span class="navr"><button class="act star ${fav ? 'on' : ''}" data-act="fav" aria-pressed="${fav}" aria-label="${fav ? 'Retirer des favoris' : 'Ajouter aux favoris'}">${fav ? '★' : '☆'}</button>${isEditor() ? `<button class="act" data-go="#/r/${esc(encodeURIComponent(r.id))}/modifier">Modifier</button>` : ''}</span></div>
  <h1 class="large">${esc(r.titre)}</h1>
  <div class="facts"><span class="tag cat">${esc(r.categorie || 'Autre')}</span>${tagsHtml(r)}</div>
  ${aTraduire ? '<div class="banner"><b>Pas encore traduite.</b> Recette d\'origine en anglais, quantités non converties.</div>' : ''}
  ${aValider && !aTraduire ? `<div class="banner"><b>À valider.</b> Quantités et étapes à vérifier lors de la première préparation.${isEditor() ? '<button class="btn pri sm" data-act="valider">Valider la recette</button>' : ''}</div>` : ''}
  <div class="group"><div class="cell"><span class="main">Portions</span><div class="stepper"><button data-por="-1" aria-label="Moins">−</button><output class="num">${esc(p)}</output><button data-por="1" aria-label="Plus">+</button></div></div></div>
  ${(r.etapes || []).length ? '<div class="btns"><button class="btn pri" data-act="cook">Mode cuisine</button></div>' : ''}
  <div class="section-h">Ingrédients · ${esc(p)} portion${p > 1 ? 's' : ''}</div>
  ${ingCells(r, r.id)}
  ${(r.ingredients || []).length ? '<div class="btns"><button class="btn" data-act="copy-rec">Copier la liste pour Todoist</button></div><p class="hint">Les ingrédients cochés (déjà en stock) ne sont pas copiés.</p>' : ''}
  ${(r.etapes || []).length ? `<div class="section-h">Étapes</div>${stepsHtml(r.etapes)}` : ''}
  ${kv.length ? '<div class="section-h">Infos</div><div class="group kv">' + kv.map(([k, v]) => `<div class="cell"><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></div>`).join('') + '</div>' : ''}
  ${r.notes ? `<div class="section-h">Notes</div><div class="note">${esc(r.notes)}</div>` : ''}
  <p class="meta-line">Mise à jour le ${esc(fmtDate(r.maj, { day: 'numeric', month: 'long', year: 'numeric' }))}</p>`;
}

function viewEdit() {
  const r = S.route.id ? S.recettes.get(S.route.id) : null;
  if (!isEditor()) return `<div class="nav">${backBtn('#/', 'Recettes')}</div><div class="empty"><b>Lecture seule</b><span>Votre compte ne permet pas de modifier les recettes.</span></div>`;
  const d = r || { titre: '', categorie: 'Plat batch', portions: 6, tags: [], congelable: true, ingredients: [], etapes: [], notes: '', accompagnement: '', proteines: '', conservation: '' };
  const back = r ? '#/r/' + encodeURIComponent(r.id) : '#/';
  return `<form id="edform">
  <div class="nav"><button type="button" class="act" data-go="${back}">Annuler</button><button type="submit" class="act" id="f-save" style="font-weight:700">OK</button></div>
  <h1 class="large">${r ? 'Modifier' : 'Nouvelle recette'}</h1>
  <div class="group form">
    <div class="cell"><label class="l" for="f-titre">Nom</label><input id="f-titre" required value="${esc(d.titre)}" placeholder="Nom du plat"></div>
    <div class="cell"><label class="l" for="f-cat">Catégorie</label><select id="f-cat">${CATS.slice(1).map(c => `<option ${d.categorie === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
    <div class="cell"><label class="l" for="f-por">Portions</label><input id="f-por" type="number" min="1" step="1" inputmode="numeric" value="${esc(d.portions)}"></div>
    <div class="cell"><label class="l" for="f-frz">Se congèle</label><input type="checkbox" class="sw" id="f-frz" ${d.congelable ? 'checked' : ''}></div>
    <div class="cell"><label class="l" for="f-tags">Étiquettes</label><input id="f-tags" value="${esc((d.tags || []).join(', '))}" placeholder="volaille, à valider…"></div>
  </div>
  <div class="section-h">Ingrédients</div>
  <textarea class="ta" id="f-ing" spellcheck="false">${esc((d.ingredients || []).map(ingToLine).join('\n'))}</textarea>
  <p class="hint">Une ligne par ingrédient : « 1200 g filet de poulet ». Une ligne finissant par « : » crée un groupe.</p>
  <div class="section-h">Étapes</div>
  <textarea class="ta" id="f-step">${esc((d.etapes || []).map(stepToLine).join('\n'))}</textarea>
  <p class="hint">Une ligne par étape. Ajoutez [20 min] pour un minuteur.</p>
  <div class="section-h">Infos</div>
  <div class="group form">
    <div class="cell"><label class="l" for="f-acc">Accompagnement</label><input id="f-acc" value="${esc(d.accompagnement)}"></div>
    <div class="cell"><label class="l" for="f-pro">Protéines Papa</label><input id="f-pro" value="${esc(d.proteines)}"></div>
    <div class="cell"><label class="l" for="f-con">Conservation</label><input id="f-con" value="${esc(d.conservation)}"></div>
  </div>
  <div class="section-h">Notes</div>
  <textarea class="ta prose" id="f-not">${esc(d.notes)}</textarea>
  ${r ? (S.confirmDel
    ? `<div class="confirm"><p>Supprimer « ${esc(r.titre)} » ? C'est définitif.</p><div class="btns two"><button type="button" class="btn" data-act="del-no">Annuler</button><button type="button" class="btn pri" style="background:var(--danger)" data-act="del-yes">Supprimer</button></div></div>`
    : '<div class="btns"><button type="button" class="btn dng" data-act="del">Supprimer la recette</button></div>') : ''}
  </form>`;
}

function seaRecipes(s) { return [S.recettes.get(s.a), S.recettes.get(s.b)]; }
function seaTitle(s) { const [a, b] = seaRecipes(s); return s.titre || ((a?.titre || '?') + ' + ' + (b?.titre || '?')); }
function seaSteps(s) {
  if ((s.etapes || []).length) return s.etapes;
  const [a, b] = seaRecipes(s);
  return [...(a?.etapes || []).map(e => ({ ...e, r: 'A' })), ...(b?.etapes || []).map(e => ({ ...e, r: 'B' }))];
}
function whoLabel(s) { const [a, b] = seaRecipes(s); return k => k === 'A' ? (a?.titre || 'Plat A') : k === 'B' ? (b?.titre || 'Plat B') : 'Les deux plats'; }
function mergedIngs(s) {
  const [a, b] = seaRecipes(s), m = new Map();
  [[a, 'A'], [b, 'B']].forEach(([r, k]) => {
    if (!r) return; const f = curPortions(r) / (r.portions || 1);
    (r.ingredients || []).forEach(i => {
      if (i.grp) return; const key = norm(i.n) + '|' + (i.u || '');
      const e = m.get(key) || { n: i.n, u: i.u, q: 0, hasQ: false, parts: {} };
      if (i.q != null) { e.q += i.q * f; e.hasQ = true; e.parts[k] = (e.parts[k] || 0) + i.q * f; } else e.parts[k] = e.parts[k] ?? null;
      m.set(key, e);
    });
  });
  return [...m.values()].sort((x, y) => (y.q || 0) - (x.q || 0));
}
function viewSeances() {
  const list = [...S.seances.values()].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const today = new Date().toISOString().slice(0, 10);
  const next = list.filter(s => (s.date || '') >= today).reverse(), past = list.filter(s => (s.date || '') < today);
  const cells = arr => '<div class="group">' + arr.map(s => {
    const [a, b] = seaRecipes(s);
    return `<button class="cell" data-go="#/s/${esc(encodeURIComponent(s.id))}"><span class="main"><span class="t">${esc(a?.titre || '?')}<br>${esc(b?.titre || '?')}</span><span class="m">${s.date ? `<span class="tag cat">${esc(fmtDate(s.date, { weekday: 'short', day: 'numeric', month: 'short' }))}</span>` : ''}${(s.etapes || []).length ? '' : '<span class="tag">Fiche combinée à venir</span>'}</span></span>${ICON.chev}</button>`;
  }).join('') + '</div>';
  return `<div class="nav"><span></span>${isEditor() ? '<button class="act" data-go="#/s/nouvelle">Composer</button>' : ''}</div>
  <h1 class="large">Séances</h1>
  ${offlineBanner()}
  ${!list.length ? '<div class="empty"><b>Aucune séance</b><span>Une séance réunit les deux plats d\'un batch dans une seule fiche.</span></div>' : ''}
  ${next.length ? `<div class="section-h">À venir</div>${cells(next)}` : ''}
  ${past.length ? `<div class="section-h">Passées</div>${cells(past)}` : ''}`;
}
function viewSeance() {
  const s = S.seances.get(S.route.id);
  if (!s) return `<div class="nav">${backBtn('#/s', 'Séances')}</div><div class="empty"><b>Séance introuvable</b></div>`;
  const [a, b] = seaRecipes(s), key = 'sea-' + s.id, chk = S.checked[key] || (S.checked[key] = {});
  const ings = mergedIngs(s), steps = seaSteps(s);
  const short = r => (r?.titre || '').split(/[ ,]/)[0];
  const por = r => r ? `<div class="cell"><span class="main">${esc(r.titre)}</span><div class="stepper"><button data-por="-1" data-r="${esc(r.id)}" aria-label="Moins">−</button><output class="num">${esc(curPortions(r))}</output><button data-por="1" data-r="${esc(r.id)}" aria-label="Plus">+</button></div></div>` : '';
  return `<div class="nav">${backBtn('#/s', 'Séances')}</div>
  <h1 class="large">${esc(seaTitle(s).replace(/^Batch [^·]*·\s*/, ''))}</h1>
  ${s.date ? `<p class="sub">${esc(fmtDate(s.date, { weekday: 'long', day: 'numeric', month: 'long' }))}${s.duree ? ' · ' + esc(s.duree) : ''}</p>` : ''}
  ${!(s.etapes || []).length ? '<div class="banner"><b>Fiche combinée à venir.</b> Les étapes des deux plats s\'affichent l\'une après l\'autre en attendant que Claude rédige le déroulé.</div>' : ''}
  <div class="section-h">Portions</div><div class="group">${por(a)}${por(b)}</div>
  ${steps.length ? '<div class="btns"><button class="btn pri" data-act="cook-sea">Mode cuisine</button></div>' : ''}
  <div class="section-h">Ingrédients cumulés</div>
  <div class="group">${ings.map((i, k) => {
    const split = Object.keys(i.parts).length > 1 && i.hasQ ? `<span class="split">${esc(short(a))} ${esc(fmtQ(i.parts.A, i.u))} · ${esc(short(b))} ${esc(fmtQ(i.parts.B, i.u))}</span>` : '';
    return `<label class="cell ing"><input type="checkbox" data-chk="${esc(key)}" data-k="${k}" ${chk[k] ? 'checked' : ''}><span class="q num">${esc(i.hasQ ? fmtQ(i.q, i.u) : '')}</span><span class="n">${esc(i.n)}${split}</span></label>`;
  }).join('')}</div>
  <div class="btns"><button class="btn" data-act="copy-sea">Copier la liste pour Todoist</button></div>
  <p class="hint">Les ingrédients cochés (déjà en stock) ne sont pas copiés.</p>
  <div class="section-h">Déroulé</div>${stepsHtml(steps, whoLabel(s))}
  ${s.notes ? `<div class="section-h">Notes</div><div class="note">${esc(s.notes)}</div>` : ''}
  <div class="section-h">Fiches</div><div class="group">
    ${a ? `<button class="cell" data-go="#/r/${esc(encodeURIComponent(a.id))}"><span class="main">${esc(a.titre)}</span>${ICON.chev}</button>` : ''}
    ${b ? `<button class="cell" data-go="#/r/${esc(encodeURIComponent(b.id))}"><span class="main">${esc(b.titre)}</span>${ICON.chev}</button>` : ''}
  </div>
  ${isEditor() ? (S.confirmDel
    ? `<div class="confirm"><p>Supprimer cette séance ? Les deux recettes restent.</p><div class="btns two"><button class="btn" data-act="del-no">Annuler</button><button class="btn pri" style="background:var(--danger)" data-act="seadel-yes">Supprimer</button></div></div>`
    : '<div class="btns"><button class="btn dng" data-act="del">Supprimer la séance</button></div>') : ''}`;
}
function viewNewSeance() {
  const opts = recList().map(r => `<option value="${esc(r.id)}">${esc(r.titre)}</option>`).join('');
  return `<form id="seaform">
  <div class="nav"><button type="button" class="act" data-go="#/s">Annuler</button><button type="submit" class="act" style="font-weight:700">Créer</button></div>
  <h1 class="large">Composer une séance</h1>
  <div class="group form">
    <div class="cell"><label class="l" for="s-a">Plat A</label><select id="s-a" required><option value="">Choisir</option>${opts}</select></div>
    <div class="cell"><label class="l" for="s-b">Plat B</label><select id="s-b" required><option value="">Choisir</option>${opts}</select></div>
    <div class="cell"><label class="l" for="s-d">Date</label><input id="s-d" type="date"></div>
  </div>
  <p class="hint">Claude pourra ensuite rédiger le déroulé entrelacé des deux plats.</p>
  </form>`;
}
function viewSettings() {
  const email = S.session?.user?.email || '';
  return `<div class="nav"><span></span></div>
  <h1 class="large">Compte</h1>
  <div class="group kv">
    <div class="cell"><span class="k">Connecté</span><span class="v">${esc(email)}</span></div>
    <div class="cell"><span class="k">Accès</span><span class="v">${S.role === 'editeur' ? 'Lecture et modification' : S.role === 'lecteur' ? 'Lecture seule' : 'Aucun accès aux recettes'}</span></div>
    <div class="cell"><span class="k">Recettes</span><span class="v num">${S.recettes.size} · ${S.seances.size} séances</span></div>
    <div class="cell"><span class="k">Synchronisé</span><span class="v">${S.syncedAt ? esc(fmtDate(S.syncedAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })) : '—'}</span></div>
  </div>
  <div class="btns">
    <button class="btn" data-act="sync">Actualiser maintenant</button>
    <button class="btn" data-act="export">Exporter une sauvegarde</button>
    <button class="btn dng" data-act="logout">Se déconnecter</button>
  </div>
  ${S.role ? '' : '<p class="hint">Cette adresse n\'est pas encore dans la liste des membres de la base. Ajoutez-la dans la table « membres » sur Supabase.</p>'}`;
}

/* ---------- mode cuisine ---------- */
let wakeLock = null;
async function lockScreen() { try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { wakeLock = null; } }
function releaseLock() { try { wakeLock?.release(); } catch {} wakeLock = null; }
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { if (S.cook) lockScreen(); if (!S.cook) refresh(true); }
});
function startCook(title, steps, who, recipe) {
  S.cook = { title, steps, who, i: 0, recipeId: recipe?.id || null };
  ensureAudio(); lockScreen(); render();
}
function viewCook() {
  const c = S.cook, s = c.steps[c.i], r = c.recipeId ? S.recettes.get(c.recipeId) : null;
  return `<div class="cook">
    <div class="cook-h"><div class="row"><span class="ttl">${esc(c.title)}</span><button class="close" data-act="cook-close">Terminer</button></div>
      <div class="bar"><i style="width:${((c.i + 1) / c.steps.length * 100).toFixed(1)}%"></i></div></div>
    <div class="cook-b">
      <span class="pos">Étape ${c.i + 1} sur ${c.steps.length}</span>
      ${c.who && s.r ? `<span class="who">${esc(c.who(s.r))}</span>` : ''}
      <p class="txt">${esc(s.t)}</p>
      ${s.min ? `<button class="tbtn" data-ctimer="${c.i}">${ICON.timer}Lancer ${esc(String(s.min).replace('.', ','))} min</button>` : ''}
      ${r ? `<details><summary>Ingrédients</summary>${ingCells(r, r.id)}</details>` : ''}
    </div>
    <div class="cook-f"><button class="btn" data-act="cook-prev" ${c.i === 0 ? 'disabled' : ''}>Précédente</button><button class="btn pri" data-act="cook-next">${c.i === c.steps.length - 1 ? 'Terminé' : 'Suivante'}</button></div>
  </div>`;
}
function stopCook() { S.cook = null; releaseLock(); render(); }

/* ---------- minuteurs ---------- */
let audioCtx = null;
function ensureAudio() { try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === 'suspended') audioCtx.resume(); } catch {} }
function beep() {
  if (audioCtx) try {
    const t = audioCtx.currentTime;
    [0, .35, .7].forEach(d => { const o = audioCtx.createOscillator(), g = audioCtx.createGain(); o.frequency.value = 880; g.gain.setValueAtTime(.0001, t + d); g.gain.exponentialRampToValueAtTime(.4, t + d + .02); g.gain.exponentialRampToValueAtTime(.0001, t + d + .28); o.connect(g).connect(audioCtx.destination); o.start(t + d); o.stop(t + d + .3); });
  } catch {}
  try { navigator.vibrate?.([300, 150, 300]); } catch {}
}
function addTimer(step) {
  ensureAudio();
  const label = step.t.length > 42 ? step.t.slice(0, 40) + '…' : step.t;
  S.timers.push({ id: String(Date.now() + Math.random()), label, end: Date.now() + step.min * 60000, left: step.min * 60000, paused: false, done: false });
  tick(); if (!tick.i) tick.i = setInterval(tick, 500);
}
function tick() {
  const now = Date.now();
  S.timers.forEach(t => { if (!t.paused && !t.done) { t.left = t.end - now; if (t.left <= 0) { t.left = 0; t.done = true; beep(); t.rep = setInterval(beep, 4000); } } });
  $('#dock').innerHTML = S.timers.map(t => {
    const s = Math.ceil(t.left / 1000), m = Math.floor(s / 60), r = s % 60;
    return `<div class="tmr ${t.done ? 'done' : ''}"><span class="lbl">${esc(t.label)}</span><span class="t">${m}:${String(r).padStart(2, '0')}</span>${t.done ? `<button data-tstop="${t.id}">OK</button>` : `<button data-tpause="${t.id}">${t.paused ? '▶' : 'II'}</button><button data-tstop="${t.id}" aria-label="Annuler">✕</button>`}</div>`;
  }).join('');
  if (!S.timers.length && tick.i) { clearInterval(tick.i); tick.i = null; }
}

/* ---------- interactions ---------- */
function currentSteps() {
  if (S.route.name === 'seance') { const s = S.seances.get(S.route.id); return s ? seaSteps(s) : []; }
  return S.recettes.get(S.route.id)?.etapes || [];
}
document.addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  const d = b.dataset;
  if (d.tab) return go({ recettes: '#/', seances: '#/s', reglages: '#/compte' }[d.tab]);
  if (d.go) { e.preventDefault(); return go(d.go); }
  if (d.cat) { S.cat = d.cat; return render(); }
  if (d.tag) { S.tag = S.tag === d.tag ? null : d.tag; return render(); }
  if (d.por) { const r = S.recettes.get(d.r || S.route.id); if (r) { S.portions[r.id] = Math.max(1, curPortions(r) + Number(d.por)); render(); } return; }
  if (d.timer != null) { const st = currentSteps()[+d.timer]; if (st) addTimer(st); return; }
  if (d.ctimer != null) { addTimer(S.cook.steps[+d.ctimer]); return; }
  if (d.tpause) { const t = S.timers.find(x => x.id === d.tpause); if (t) { if (t.paused) { t.end = Date.now() + t.left; t.paused = false; } else t.paused = true; tick(); } return; }
  if (d.tstop) { const t = S.timers.find(x => x.id === d.tstop); if (t) clearInterval(t.rep); S.timers = S.timers.filter(x => x.id !== d.tstop); tick(); return; }
  switch (d.act) {
    case 'cook': { const r = S.recettes.get(S.route.id); return startCook(r.titre, r.etapes || [], null, r); }
    case 'cook-sea': { const s = S.seances.get(S.route.id); return startCook(seaTitle(s), seaSteps(s), whoLabel(s), null); }
    case 'cook-prev': S.cook.i = Math.max(0, S.cook.i - 1); render(); return;
    case 'cook-next': if (S.cook.i >= S.cook.steps.length - 1) return stopCook(); S.cook.i++; render(); return;
    case 'cook-close': return stopCook();
    case 'fav': return toggleFav(S.route.id);
    case 'valider': return validerRecette(S.route.id);
    case 'copy-rec': { const r = S.recettes.get(S.route.id); const chk = S.checked[r.id] || {}; const f = curPortions(r) / (r.portions || 1);
      return copyList((r.ingredients || []).map((i, k) => i.grp || chk[k] ? null : { n: i.n, q: i.q == null ? null : i.q * f, u: i.u }).filter(Boolean)); }
    case 'copy-sea': { const s = S.seances.get(S.route.id); const chk = S.checked['sea-' + s.id] || {};
      return copyList(mergedIngs(s).map((i, k) => chk[k] ? null : { n: i.n, q: i.hasQ ? i.q : null, u: i.u }).filter(Boolean)); }
    case 'del': S.confirmDel = true; return render();
    case 'del-no': S.confirmDel = false; return render();
    case 'del-yes': try { await deleteRow('recettes', S.route.id); S.recettes.delete(S.route.id); saveCache(); toast('Recette supprimée'); go('#/'); } catch (err) { writeFailed(err); } return;
    case 'seadel-yes': try { await deleteRow('seances', S.route.id); S.seances.delete(S.route.id); saveCache(); toast('Séance supprimée'); go('#/s'); } catch (err) { writeFailed(err); } return;
    case 'sync': await refresh(); toast(S.online ? 'Recettes à jour' : 'Toujours hors connexion'); return;
    case 'export': return exportAll();
    case 'logout': await sb.auth.signOut(); try { localStorage.removeItem(CACHE_KEY); } catch {} S.recettes.clear(); S.seances.clear(); S.loaded = false; S.role = null; return;
  }
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.chk) (S.checked[el.dataset.chk] ||= {})[el.dataset.k] = el.checked;
});
document.addEventListener('input', e => {
  if (e.target.id === 'q') {
    S.q = e.target.value; $('#results').innerHTML = listResults();
    const tmp = document.createElement('div'); tmp.innerHTML = viewList(); $('#chipsC').innerHTML = tmp.querySelector('#chipsC').innerHTML;
  }
});
document.addEventListener('submit', async e => {
  e.preventDefault();
  const id = e.target.id;
  if (id === 'loginform') return login();
  if (id === 'edform') return saveRecipe();
  if (id === 'seaform') return saveSeance();
});

async function login() {
  const btn = $('#l-go'), err = $('#l-err');
  btn.disabled = true; btn.textContent = 'Connexion…'; err.textContent = '';
  const { error } = await sb.auth.signInWithPassword({ email: $('#l-email').value.trim(), password: $('#l-pass').value });
  if (error) { btn.disabled = false; btn.textContent = 'Se connecter'; err.textContent = /invalid/i.test(error.message) ? 'Adresse ou mot de passe incorrect.' : (navigator.onLine ? error.message : 'Pas de connexion internet.'); }
}
function uniqueId(base, map) { let id = base, n = 2; while (map.has(id)) id = base + '-' + (n++); return id; }
async function saveRecipe() {
  const titre = $('#f-titre').value.trim(); if (!titre) return;
  const old = S.route.id ? S.recettes.get(S.route.id) : null;
  const row = {
    id: old ? old.id : uniqueId(slug(titre), S.recettes),
    titre, categorie: $('#f-cat').value, portions: Math.max(1, parseInt($('#f-por').value) || 1),
    congelable: $('#f-frz').checked,
    tags: $('#f-tags').value.split(',').map(s => s.trim()).filter(Boolean),
    ingredients: $('#f-ing').value.split('\n').map(parseIngLine).filter(Boolean),
    etapes: $('#f-step').value.split('\n').map(parseStepLine).filter(Boolean),
    accompagnement: $('#f-acc').value.trim(), proteines: $('#f-pro').value.trim(),
    conservation: $('#f-con').value.trim(), notes: $('#f-not').value.trim(),
    source: old?.source || 'Saisie dans le carnet'
  };
  const btn = $('#f-save'); btn.disabled = true;
  try {
    await writeRow('recettes', row);
    S.recettes.set(row.id, { ...old, ...row, maj: new Date().toISOString() }); delete S.portions[row.id]; saveCache();
    toast('Recette enregistrée'); go('#/r/' + encodeURIComponent(row.id));
  } catch (err) { btn.disabled = false; writeFailed(err); }
}
async function saveSeance() {
  const a = $('#s-a').value, b = $('#s-b').value, date = $('#s-d').value || null;
  if (!a || !b) return; if (a === b) return toast('Choisissez deux plats différents.');
  const ra = S.recettes.get(a), rb = S.recettes.get(b);
  const row = { id: uniqueId('s-' + (date || new Date().toISOString().slice(0, 10)) + '-' + slug(ra.titre).slice(0, 20), S.seances), titre: ra.titre + ' + ' + rb.titre, a, b, date, etapes: [], notes: '' };
  try { await writeRow('seances', row); S.seances.set(row.id, row); saveCache(); go('#/s/' + encodeURIComponent(row.id)); }
  catch (err) { writeFailed(err); }
}
async function toggleFav(id) {
  const on = !S.favs.has(id);
  on ? S.favs.add(id) : S.favs.delete(id); render();
  try {
    const { error } = on ? await sb.from('favoris').insert({ recette_id: id }) : await sb.from('favoris').delete().eq('recette_id', id);
    if (error && !/duplicate/i.test(error.message)) throw error;
    saveCache(); toast(on ? 'Ajoutée aux favoris' : 'Retirée des favoris');
  } catch (err) { on ? S.favs.delete(id) : S.favs.add(id); render(); writeFailed(err); }
}
async function validerRecette(id) {
  const r = S.recettes.get(id); if (!r) return;
  const tags = (r.tags || []).filter(t => norm(t) !== 'a valider');
  try {
    const { error } = await sb.from('recettes').update({ tags }).eq('id', id);
    if (error) throw error;
    r.tags = tags; saveCache(); render(); toast('Recette validée');
  } catch (err) { writeFailed(err); }
}
// Une ligne par article : Todoist propose d'en faire autant de tâches au collage.
async function copyList(items) {
  if (!items.length) return toast('Rien à copier : tout est coché.');
  const text = items.map(i => i.n.charAt(0).toUpperCase() + i.n.slice(1) + (i.q != null ? ' (' + fmtQ(i.q, i.u) + ')' : '')).join('\n');
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch {
    const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); try { ok = document.execCommand('copy'); } catch {} ta.remove();
  }
  toast(ok ? items.length + ' article' + (items.length > 1 ? 's' : '') + ' copié' + (items.length > 1 ? 's' : '') + ' : collez dans Todoist' : 'Copie impossible sur cet appareil');
}
function exportAll() {
  const data = JSON.stringify({ exporte: new Date().toISOString(), recettes: recList(), seances: [...S.seances.values()] }, null, 2);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  a.download = 'carnet-repas-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ---------- démarrage ---------- */
window.addEventListener('online', () => refresh(true));
window.addEventListener('offline', () => { S.online = false; if (!S.cook && !isTyping()) render(); });
(async () => {
  S.route = parseRoute();
  if (!sb) return render();
  loadCache();
  const { data } = await sb.auth.getSession();
  S.session = data.session;
  render();
  if (S.session) refresh(true);
  sb.auth.onAuthStateChange((evt, session) => {
    const had = !!S.session; S.session = session;
    if (evt === 'SIGNED_IN' && !had) { render(); refresh(); }
    if (evt === 'SIGNED_OUT') render();
  });
})();
