/* Jeu « Frise à compléter » (aucune dépendance, aucun réseau ; meilleurs scores gardés sur l'appareil).
   Page : <div id="frise"></div> + <script type="application/json" id="fd">{slug, debut, fin, titre, evenements:[{t,d,a,b,c}], regimes:[{t,l,d}]}</script>.
   Trois jeux : « axe » (événement donné, on touche l'année sur une frise vide), « frise » (les dates sont données, on place l'événement sur sa date),
   « regimes » (idem pour les régimes et les rois). Sans glisser-déposer : on touche ; la page défile toujours. */
(function () {
  'use strict';
  var root = document.getElementById('frise'), raw = document.getElementById('fd');
  if (!root || !raw) return;
  var DATA = JSON.parse(raw.textContent), KEY = 'frise:' + DATA.slug;
  var PPY = 17, Y0 = DATA.debut - 2, Y1 = DATA.fin + 2, HAUT = (Y1 - Y0) * PPY + 28;
  var S = null, MEILLEURS = {};
  var MQ = window.matchMedia ? matchMedia('(min-width: 900px)') : { matches: false };       // ordinateur : frise horizontale ; téléphone : frise verticale
  function H() { return MQ.matches; }
  function pct(y) { return (y - Y0) / (Y1 - Y0) * 100; }
  function pos(y) { return H() ? 'left:' + pct(y) + '%' : 'top:' + (14 + (y - Y0) * PPY) + 'px'; }
  var JEUX = [
    { id: 'axe', nom: 'Placer sur l\'axe', n: 8, max: 3, desc: 'Un événement s\'affiche, la frise est vide : touche l\'année où il a lieu.' },
    { id: 'frise', nom: 'Remplir la frise', n: 8, max: 1, desc: 'Les dates sont données : touche la date qui correspond à chaque événement.' }
  ];
  if ((DATA.regimes || []).length) JEUX.push({ id: 'regimes', nom: 'Régimes et rois', n: DATA.regimes.length, max: 1, desc: 'Place chaque régime et chaque roi sur sa période.' });

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function ri(n) { return Math.floor(Math.random() * n); }
  function melange(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = ri(i + 1), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function $(s, c) { return (c || root).querySelector(s); }
  function charge() { try { MEILLEURS = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { MEILLEURS = {}; } }
  function garde() { try { localStorage.setItem(KEY, JSON.stringify(MEILLEURS)); } catch (e) { } }
  function masque(t) { return t.replace(/\b1[5-9]\d\d\b/g, '…'); }       // l'année écrite dans l'énoncé donnerait la réponse
  function doux() { return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'; }

  /* ---------- écran de départ ---------- */
  function accueil() {
    S = null;
    var h = '<h1 style="margin-top:.6rem">Frise à compléter</h1><p class="lead">' + esc(DATA.titre) + '. Trois jeux pour fixer les dates sur la frise : touche, ne glisse pas.</p><ul class="fz-jeux">';
    JEUX.forEach(function (j) {
      var m = MEILLEURS[j.id];
      h += '<li><button type="button" class="fz-jeu" data-j="' + j.id + '"><span class="fz-jt"><b>' + esc(j.nom) + '</b><small>' + esc(j.desc) + '</small></span>' +
        (m !== undefined ? '<span class="fz-best">Meilleur score<b>' + m + ' / ' + j.n * j.max + '</b></span>' : '<span class="fz-best">' + j.n + ' questions</span>') + '</button></li>';
    });
    root.innerHTML = h + '</ul>';
    root.querySelectorAll('.fz-jeu').forEach(function (b) { b.onclick = function () { demarre(b.dataset.j); }; });
  }

  /* ---------- série ---------- */
  function demarre(id) {
    var jeu = JEUX.filter(function (j) { return j.id === id; })[0], elems;
    if (id === 'regimes') elems = melange(DATA.regimes.map(function (r, k) { return { t: r.t, d: r.d, l: r.l, k: k }; }));
    else elems = melange(DATA.evenements.map(function (e, k) { return { t: e.t, d: e.d, a: e.a, b: e.b, c: e.c, k: k }; })).slice(0, jeu.n);
    S = { jeu: jeu, el: elems, i: 0, pts: 0, fait: [], essai: null, rendu: false };
    if (id === 'axe') axe(); else liste();
  }
  function entete(extra) {
    return '<div class="fz-top"><button type="button" class="btn fz-q" id="fz-quit">Changer de jeu</button><span class="m">Question ' + (S.i + 1) + ' sur ' + S.el.length + '</span>' +
      '<span class="fz-sc">' + S.pts + ' / ' + S.jeu.max * S.el.length + '</span></div>' + (extra || '');
  }
  function quitte() { var q = $('#fz-quit'); if (q) q.onclick = accueil; }

  /* ---------- jeu « axe » : on touche l'année sur une frise vide ---------- */
  function axe() {
    var e = S.el[S.i], h0 = H(), larg = Math.max(300, root.clientWidth - 68), tousLesAns = !h0 || larg / (Y1 - Y0) >= 34;
    var h = entete('<div class="fz-card" id="fz-card"><span class="fz-cat">' + esc(e.c) + '</span><p>' + esc(masque(e.t)) + '</p></div>');
    h += '<div class="fz-axe' + (h0 ? ' h' : '') + '" id="fz-axe" tabindex="0" role="group" aria-label="Frise vide de ' + Y0 + ' à ' + Y1 + '. Touche une année, ou utilise les flèches du clavier." style="height:' + (h0 ? 250 : HAUT) + 'px"><div class="fz-in" id="fz-in">';
    for (var y = Y0; y <= Y1; y++) {
      var maj = y % 5 === 0 || ((y === DATA.debut || y === DATA.fin) && Math.abs(y - 5 * Math.round(y / 5)) >= 2);      // une borne trop proche d'un multiple de 5 ferait chevaucher les étiquettes
      h += '<i class="fz-tk' + (maj ? ' maj' : '') + '" style="' + pos(y) + '"></i>' + (maj || tousLesAns ? '<span class="fz-yr' + (maj ? ' maj' : '') + '" style="' + pos(y) + '">' + y + '</span>' : '');
    }
    S.fait.forEach(function (f, k) {
      var mid = (f.a + f.b) / 2;
      h += '<span class="fz-pt" style="' + pos(mid) + ';' + (h0 ? 'top:' + (18 + (k % 4) * 24) + 'px' : 'right:' + (12 + (k % 4) * 22) + 'px') + '" title="' + esc(f.d) + '">' + (k + 1) + '</span>';
    });
    h += '<div id="fz-mk"></div></div></div><div class="fz-bar" id="fz-bar"></div>';
    root.innerHTML = h;
    quitte();
    var ax = $('#fz-axe'), dedans = $('#fz-in');
    ax.onclick = function (ev) {
      if (S.rendu) return;
      if (H()) { var r = dedans.getBoundingClientRect(); choisit(Math.round(Y0 + (ev.clientX - r.left) / r.width * (Y1 - Y0))); }
      else { var q = ax.getBoundingClientRect(); choisit(Math.round(Y0 + (ev.clientY - q.top - 14) / PPY)); }
    };
    ax.onkeydown = function (ev) {
      if (S.rendu) return;
      var pas = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -1, ArrowRight: 1, PageUp: -5, PageDown: 5 }[ev.key];
      if (pas) { ev.preventDefault(); choisit((S.essai === null ? Math.round((DATA.debut + DATA.fin) / 2) : S.essai) + pas); }
      else if (ev.key === 'Enter' && S.essai !== null) { ev.preventDefault(); valideAxe(); }
    };
    S.essai = null; S.rendu = false;
    barre();
  }
  function choisit(y) {
    y = Math.max(Y0, Math.min(Y1, y)); S.essai = y;
    $('#fz-mk').innerHTML = '<span class="fz-g" style="' + pos(y) + '"><b>' + y + '</b></span>';
    barre();
  }
  function barre() {
    var b = $('#fz-bar');
    if (!b) return;
    if (S.rendu) return;
    if (S.essai === null) { b.innerHTML = '<p class="m fz-aide">Touche l\'année sur la frise, ou utilise les flèches du clavier.</p>'; return; }
    b.innerHTML = '<div class="fz-ctl"><button type="button" class="btn" id="fz-m" aria-label="Un an plus tôt">−1 an</button><b class="fz-an">' + S.essai + '</b>' +
      '<button type="button" class="btn" id="fz-p" aria-label="Un an plus tard">+1 an</button></div><button type="button" class="btn pri fz-ok" id="fz-v">Valider</button>';
    $('#fz-m').onclick = function () { choisit(S.essai - 1); }; $('#fz-p').onclick = function () { choisit(S.essai + 1); }; $('#fz-v').onclick = valideAxe;
  }
  function valideAxe() {
    var e = S.el[S.i], g = S.essai, ecart = g < e.a ? e.a - g : g > e.b ? g - e.b : 0, pts = ecart === 0 ? 3 : ecart <= 1 ? 2 : ecart <= 3 ? 1 : 0, cls = pts === 3 ? 'ok' : pts ? 'near' : 'ko';
    S.rendu = true; S.pts += pts; S.fait.push({ a: e.a, b: e.b, d: e.d, t: e.t, g: g, pts: pts });
    var mid = (e.a + e.b) / 2;
    if (H()) $('#fz-mk').insertAdjacentHTML('beforeend', '<span class="fz-v ' + cls + '" style="left:' + pct(e.a) + '%;width:' + Math.max(0.8, (e.b - e.a) / (Y1 - Y0) * 100) + '%"></span><span class="fz-vl ' + cls + '" style="left:' + pct(mid) + '%">' + esc(e.d) + '</span>');
    else {
      var haut = 14 + (e.a - Y0) * PPY, hauteur = Math.max(8, (e.b - e.a) * PPY);
      $('#fz-mk').insertAdjacentHTML('beforeend', '<span class="fz-v ' + cls + '" style="top:' + haut + 'px;height:' + hauteur + 'px"></span><span class="fz-vl ' + cls + '" style="top:' + (haut + hauteur / 2) + 'px">' + esc(e.d) + '</span>');
    }
    var phrase = pts === 3 ? 'Exact : ' : pts === 2 ? 'À ' + ecart + ' an près : ' : pts === 1 ? 'À ' + ecart + ' ans : ' : 'À ' + ecart + ' ans, c\'est loin : ';
    $('#fz-bar').innerHTML = '<div class="fz-res ' + cls + '" role="status"><b>' + phrase + esc(e.d) + '</b><span class="m">' + esc(e.t) + '</span><span class="fz-pts">+' + pts + (pts > 1 ? ' points' : ' point') + '</span></div>' +
      '<button type="button" class="btn pri fz-ok" id="fz-n">' + (S.i + 1 < S.el.length ? 'Question suivante' : 'Voir le résultat') + '</button>';
    $('#fz-n').onclick = suite;
    $('#fz-n').focus({ preventScroll: true });
    var v = $('.fz-v'); if (v && !H() && v.scrollIntoView) v.scrollIntoView({ block: 'center', behavior: doux() });
    var sc = $('.fz-sc'); if (sc) sc.textContent = S.pts + ' / ' + S.jeu.max * S.el.length;
  }

  /* ---------- jeux « frise » et « regimes » : les dates sont données, on place l'événement ---------- */
  function liste() {
    var regimes = S.jeu.id === 'regimes';
    if (S.rendu === false && S.i === 0 && !S.slots) {
      S.slots = S.el.map(function (e) { return e; }).sort(function (x, y) { return regimes ? x.k - y.k : x.a - y.a || x.b - y.b || x.k - y.k; });
      S.rempli = {};
    }
    var e = S.el[S.i];
    var h = entete('<div class="fz-card" id="fz-card">' + (regimes ? '<span class="fz-cat">' + esc(e.l) + '</span>' : '<span class="fz-cat">' + esc(e.c) + '</span>') + '<p>' + esc(e.t) + '</p></div>');
    h += '<ol class="fz-slots' + (H() ? ' h' : '') + '">';
    S.slots.forEach(function (s, k) {
      var pris = S.rempli[k];
      h += '<li><button type="button" class="fz-slot' + (pris ? ' ' + pris.cls : '') + '" data-k="' + k + '"' + (pris ? ' disabled' : '') + '><span class="fz-d">' + esc(s.d) + (regimes ? ' <small>' + esc(s.l) + '</small>' : '') + '</span>' +
        '<span class="fz-c">' + (pris ? esc(pris.t) : 'Touche pour placer ici') + '</span></button></li>';
    });
    root.innerHTML = h + '</ol><div class="fz-bar" id="fz-bar"></div>';
    quitte();
    S.rendu = false;
    root.querySelectorAll('.fz-slot').forEach(function (b) { b.onclick = function () { valideListe(+b.dataset.k); }; });
  }
  function valideListe(k) {
    if (S.rendu) return;
    var e = S.el[S.i], regimes = S.jeu.id === 'regimes', bon = S.slots.map(function (s, i) { return s.d === e.d && (!regimes || s.l === e.l) ? i : -1; }).filter(function (i) { return i >= 0 && !S.rempli[i]; });
    var juste = bon.indexOf(k) >= 0, cible = juste ? k : bon[0];
    S.rendu = true;
    if (juste) S.pts += 1;
    S.rempli[cible] = { t: e.t, cls: juste ? 'ok' : 'near' };
    S.fait.push({ d: e.d, t: e.t, pts: juste ? 1 : 0, choix: S.slots[k].d });
    root.querySelectorAll('.fz-slot').forEach(function (b) {
      var i = +b.dataset.k; b.disabled = true;
      if (i === cible) { b.classList.add(juste ? 'ok' : 'near'); b.querySelector('.fz-c').textContent = e.t; }
      else if (i === k) { b.classList.add('ko'); }
    });
    var sc = $('.fz-sc'); if (sc) sc.textContent = S.pts + ' / ' + S.jeu.max * S.el.length;
    $('#fz-bar').innerHTML = '<div class="fz-res ' + (juste ? 'ok' : 'ko') + '" role="status"><b>' + (juste ? 'Bonne date : ' : 'Ce n\'était pas là : ') + esc(e.d) + '</b>' +
      (juste ? '' : '<span class="m">Tu avais touché ' + esc(S.slots[k].d) + '. L\'événement est maintenant placé sur sa vraie date.</span>') + '</div>' +
      '<button type="button" class="btn pri fz-ok" id="fz-n">' + (S.i + 1 < S.el.length ? 'Question suivante' : 'Voir le résultat') + '</button>';
    $('#fz-n').onclick = suite;
    $('#fz-n').focus({ preventScroll: true });
    var cs = root.querySelectorAll('.fz-slot')[cible]; if (cs && cs.scrollIntoView) cs.scrollIntoView({ block: 'center', behavior: doux() });
  }

  /* ---------- suite et résultat ---------- */
  function suite() {
    S.i++;
    if (S.i >= S.el.length) return fin();
    window.scrollTo(0, 0);
    if (S.jeu.id === 'axe') axe(); else liste();
  }
  function fin() {
    var j = S.jeu, tot = j.max * S.el.length, rec = MEILLEURS[j.id] === undefined || S.pts > MEILLEURS[j.id];
    if (rec) { MEILLEURS[j.id] = S.pts; garde(); }
    var h = '<h1 style="margin-top:.6rem">Résultat</h1><p class="fz-big"><b>' + S.pts + '</b> / ' + tot + '</p><p class="lead">' + (S.pts === tot ? 'Sans faute.' : S.pts >= tot * 0.7 ? 'Très bien : les repères sont là.' : S.pts >= tot * 0.4 ? 'Pas mal : reprends les dates ratées.' : 'Les repères sont encore fragiles : relis la frise et rejoue.') +
      (rec ? ' C\'est ton meilleur score sur cet appareil.' : '') + '</p><ul class="rows fz-bilan">';
    S.fait.forEach(function (f) {
      h += '<li><div class="row"><span class="ic fz-bic ' + (f.pts === j.max ? 'ok' : f.pts ? 'near' : 'ko') + '">' + (f.pts === j.max ? '✓' : f.pts ? '≈' : '✗') + '</span><span class="tx"><b>' + esc(f.d) + '</b><small>' + esc(f.t) +
        (j.id === 'axe' && f.pts < 3 ? ' (tu avais placé ' + f.g + ')' : j.id !== 'axe' && !f.pts ? ' (tu avais choisi ' + esc(f.choix) + ')' : '') + '</small></span></div></li>';
    });
    h += '</ul><div class="row2" style="margin-top:1.2rem"><button type="button" class="btn pri" id="fz-r">Rejouer</button><button type="button" class="btn" id="fz-a">Changer de jeu</button></div>';
    root.innerHTML = h;
    window.scrollTo(0, 0);
    $('#fz-r').onclick = function () { demarre(j.id); }; $('#fz-a').onclick = accueil;
  }

  charge();
  accueil();
  if (MQ.addEventListener) MQ.addEventListener('change', accueil);      // changement de disposition : on revient au choix du jeu
})();
