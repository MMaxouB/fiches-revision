/* Moteur de quiz du site de fiches (aucune dépendance, aucun réseau hors le fichier de questions de la fiche, progression gardée sur l'appareil).
   Page : <div id="quiz" data-banque="quiz.json" data-gens="nom1,nom2" data-slug="..." data-retour="./"></div> + assets/generateurs.js + assets/quiz.js.
   Questions : { id?, type:'qcm'|'vf'|'saisie'|'multi'|'ordre', niveau?(1 rappel, 2 application, 3 type DS), q, choix?, rep, items?, nombre?, tol?, ordre?, expl?, source?, hors_cours? } (voir references/quiz.md du skill).
   multi : plusieurs bonnes réponses (rep = liste d'indices) ; ordre : remettre dans l'ordre (items = ordre correct).
   Texte mathématique entre $...$ : mini-syntaxe convertie en MathML (x^2, u_n, u_{n+1}, frac(a,b), sqrt(a), set(1;2), bar(A) (barre), cap, cup, Delta, RR, inf, vide ; un décimal s'écrit avec un point, 0.6, et s'affiche 0,6). */
(function () {
  'use strict';
  var root = document.getElementById('quiz');
  if (!root) return;
  var D = root.dataset;
  var GEN = window.QUIZ_GEN || {};
  var GENS = (D.gens || '').split(',').filter(function (n) { return n && GEN[n]; });
  var KEY = 'quiz:' + (D.slug || location.pathname);
  var RETOUR = D.retour || './';
  var bank = [], prog = { v: 1, b: {} };
  var S = null;                     // série en cours

  /* ---------- utilitaires ---------- */
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function ri(n) { return Math.floor(Math.random() * n); }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = ri(i + 1), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function $(sel, ctx) { return (ctx || root).querySelector(sel); }
  function load() { try { var r = JSON.parse(localStorage.getItem(KEY)); if (r && r.v === 1 && r.b) prog = r; } catch (e) { } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(prog)); } catch (e) { } }
  function wipe() { prog = { v: 1, b: {} }; try { localStorage.removeItem(KEY); } catch (e) { } }

  /* ---------- texte mathématique : mini-syntaxe -> MathML ---------- */
  var FONCTIONS = { ln: 1, log: 1, exp: 1, cos: 1, sin: 1, tan: 1, lim: 1, max: 1, min: 1, pgcd: 1, ppcm: 1 };
  var OPS = { cup: '∪', cap: '∩', setminus: '∖', pm: '±', in: '∈' };
  var GREC = { Delta: 'Δ', alpha: 'α', beta: 'β', pi: 'π', lambda: 'λ', theta: 'θ', inf: '∞', vide: '∅', RR: 'ℝ', NN: 'ℕ' };
  function mathml(s) {
    var t = [], re = /\s*(\d+(?:\.\d+)?|[A-Za-z]+|<=|>=|!=|[-+*\/=<>(){}\[\]^_,;|!])/g, m, i = 0;
    while ((m = re.exec(s))) t.push(m[1]);
    var MOTS = { frac: 1, sqrt: 1, set: 1, bar: 1 };
    t = t.reduce(function (o, x) {        // un mot inconnu (« ax », « ac ») devient des lettres séparées, pour que ^ et _ visent la dernière
      if (/^[A-Za-z]{2,}$/.test(x) && !MOTS[x] && !OPS[x] && !GREC[x] && !FONCTIONS[x]) return o.concat(x.split(''));
      o.push(x); return o;
    }, []);
    function seq(stop) { var o = ''; while (i < t.length && stop.indexOf(t[i]) < 0) { var k = i; o += atom(); if (i === k) i++; } return o; }
    function script() {
      var x = t[i];
      if (x === '{') { i++; var r = seq(['}']); i++; return '<mrow>' + r + '</mrow>'; }
      if (x === '-') { i++; return '<mrow><mo>−</mo>' + script() + '</mrow>'; }
      return prim();
    }
    function prim() {
      var x = t[i++], r;
      if (x === undefined) return '';
      if (/^\d/.test(x)) return '<mn>' + x.replace('.', ',') + '</mn>';          // décimal : point dans la source, virgule à l'écran
      if ((x === 'bar') && t[i] === '(') { i++; r = seq([')']); i++; return '<mover accent="true"><mrow>' + r + '</mrow><mo>¯</mo></mover>'; }   // bar(A) : événement contraire
      if ((x === 'frac') && t[i] === '(') { i++; var a = seq([',']); i++; var b = seq([')']); i++; return '<mfrac><mrow>' + a + '</mrow><mrow>' + b + '</mrow></mfrac>'; }
      if ((x === 'sqrt') && t[i] === '(') { i++; r = seq([')']); i++; return '<msqrt>' + r + '</msqrt>'; }
      if ((x === 'set') && t[i] === '(') { i++; r = seq([')']); i++; return '<mrow><mo>{</mo>' + r + '<mo>}</mo></mrow>'; }
      if (OPS[x]) return '<mo>' + OPS[x] + '</mo>';
      if (GREC[x]) return '<mi>' + GREC[x] + '</mi>';
      if (/^[A-Za-z]+$/.test(x)) {
        if (x.length === 1) return '<mi>' + x + '</mi>';
        if (FONCTIONS[x]) return '<mi mathvariant="normal">' + x + '</mi>';
        return x.split('').map(function (c) { return '<mi>' + c + '</mi>'; }).join('');   // « ac » = a et c (produit implicite)
      }
      if (x === '(') { r = seq([')']); i++; return '<mrow><mo>(</mo>' + r + '<mo>)</mo></mrow>'; }
      if (x === '{') { r = seq(['}']); i++; return '<mrow>' + r + '</mrow>'; }
      var ops = { '*': '×', '-': '−', '<=': '≤', '>=': '≥', '!=': '≠', '<': '&lt;', '>': '&gt;' };
      return '<mo>' + (ops[x] || x) + '</mo>';
    }
    function atom() {
      var base = prim(), sub = null, sup = null;
      while (t[i] === '^' || t[i] === '_') { var k = t[i++], sc = script(); if (k === '^') sup = sc; else sub = sc; }
      if (sub && sup) return '<msubsup>' + base + sub + sup + '</msubsup>';
      if (sup) return '<msup>' + base + sup + '</msup>';
      if (sub) return '<msub>' + base + sub + '</msub>';
      return base;
    }
    return '<math>' + seq([]) + '</math>';
  }
  function fmt(s) {
    var p = String(s).split('$'), o = '';
    for (var k = 0; k < p.length; k++) o += k % 2 ? '<span class="qz-m">' + mathml(p[k]) + '</span>' : esc(p[k]);
    return o;
  }
  function ajuster() {               // une formule plus large que son bloc défile dans son propre cadre au lieu d'élargir la page
    root.querySelectorAll('.qz-m').forEach(function (s) {
      s.classList.remove('lg');
      var h = s.parentElement, mm = s.firstChild;
      if (mm && h && mm.getBoundingClientRect().width > h.getBoundingClientRect().width - 2) s.classList.add('lg');
    });
  }

  /* ---------- réponses ---------- */
  function norm(s) {
    return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’`]/g, "'")
      .replace(/[−–—]/g, '-').replace(/\s+/g, ' ').trim();
  }
  function num(s) {
    if (typeof s === 'number') return s;
    var x = String(s).replace(/[−–—]/g, '-').replace(/\s/g, ''), f = /^([-+]?\d+)\/(\d+)$/.exec(x);
    if (f) return parseInt(f[1], 10) / parseInt(f[2], 10);
    x = x.replace(',', '.');
    return /^[-+]?\d+(\.\d+)?$/.test(x) ? parseFloat(x) : NaN;
  }
  function aff(q) {                  // réponse attendue affichée (virgule décimale pour un nombre)
    var r = String(q.aff !== undefined ? q.aff : (Array.isArray(q.rep) ? q.rep[0] : q.rep));
    return q.nombre ? r.replace('.', ',').replace(/^-/, '−') : r;      // virgule décimale et vrai signe moins
  }
  function estBon(q, saisie) {
    var reps = Array.isArray(q.rep) ? q.rep : [q.rep];
    if (q.nombre) {
      var u = num(saisie);
      if (isNaN(u)) return false;
      return reps.some(function (r) { return Math.abs(u - num(r)) <= (q.tol || 1e-9); });
    }
    var n = norm(saisie);
    return n !== '' && reps.some(function (r) { return norm(r) === n; });
  }

  /* ---------- tirage des questions ---------- */
  var POIDS = { 0: 4, 1: 5, 2: 3, 3: 2, 4: 1, 5: 0.5 };       // 0 = jamais vue ; plus la boîte est haute, moins la question revient
  var POIDS_NIVEAU = { 1: 1, 2: 2, 3: 3 };                     // niveau « tous » : les questions de type DS reviennent trois fois plus que les rappels
  function boite(q) { return q.id && prog.b[q.id] ? prog.b[q.id][0] : 0; }
  function niveauDe(q) { return q.niveau || 2; }
  function tirer() {
    var q, essais = 0, dernier = S.cur ? S.cur.q : '', mini = S.niv === 'ds' ? 3 : S.niv === 'moyen' ? 2 : 1;
    do {
      var gen = GENS.length && (!bank.length || Math.random() < 0.4);
      if (gen) {
        var nom = GENS[ri(GENS.length)], k = 0;
        do { q = GEN[nom](); k++; } while (niveauDe(q) < mini && k < 12);
        q.gen = nom;
      } else {
        var base = bank.filter(function (b) { return niveauDe(b) >= mini; });
        if (!base.length) base = bank.slice();
        var pool = base.filter(function (b) { return S.vues.indexOf(b.id) < 0; });
        if (!pool.length) { S.vues = []; pool = base.slice(); }
        var tot = 0, w = pool.map(function (b) { var x = POIDS[boite(b)] * (S.niv === 'tous' ? POIDS_NIVEAU[niveauDe(b)] : 1); tot += x; return x; }), r = Math.random() * tot, j = 0;
        while (j < pool.length - 1 && r >= w[j]) { r -= w[j]; j++; }
        q = pool[j];
        S.vues.push(q.id);
      }
      essais++;
    } while (q.q === dernier && essais < 8 && (bank.length + GENS.length) > 1);
    return q;
  }

  /* ---------- écrans ---------- */
  function icone(c) { return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + (c === 'ok' ? 'M5 13l4 4L19 7' : 'M6 6l12 12M18 6L6 18') + '"/></svg>'; }

  function accueil() {
    S = null;
    var nb = bank.length, vues = 0, maitrisees = 0, ds = bank.some(function (b) { return niveauDe(b) >= 3; });
    bank.forEach(function (b) { var x = boite(b); if (x > 0) vues++; if (x >= 4) maitrisees++; });
    var vide = !nb && !GENS.length;
    root.innerHTML =
      '<h1>Quiz</h1><p class="m">' + esc(D.titre || '') + '</p>' +
      (vide ? '<p class="lead">Aucune question n\'est disponible pour l\'instant.</p>' :
        '<p class="lead">' + (GENS.length ? 'Les questions changent à chaque série.' : 'Les questions sont mélangées à chaque série.') +
        ' Celles dont la réponse était fausse reviennent plus souvent.</p>' +
        '<p class="qz-lab" id="qz-lab">Nombre de questions</p>' +
        '<div class="qz-seg" role="group" aria-labelledby="qz-lab" data-g="n">' +
        '<button type="button" class="btn" data-v="10" aria-pressed="true">10</button>' +
        '<button type="button" class="btn" data-v="20" aria-pressed="false">20</button>' +
        '<button type="button" class="btn" data-v="0" aria-pressed="false">Sans fin</button></div>' +
        (ds ? '<p class="qz-lab" id="qz-lab2">Niveau</p>' +
          '<div class="qz-seg" role="group" aria-labelledby="qz-lab2" data-g="niv">' +
          '<button type="button" class="btn" data-v="tous" aria-pressed="true">Tous niveaux</button>' +
          '<button type="button" class="btn" data-v="moyen" aria-pressed="false">Moyen et DS</button>' +
          '<button type="button" class="btn" data-v="ds" aria-pressed="false">DS</button></div>' : '') +
        '<div class="row2"><button type="button" class="btn qz-pri" id="qz-go">Commencer</button></div>' +
        (nb ? '<p class="m qz-stat">' + maitrisees + ' question' + (maitrisees > 1 ? 's' : '') + ' maîtrisée' + (maitrisees > 1 ? 's' : '') +
          ' sur ' + nb + ', ' + vues + ' déjà vue' + (vues > 1 ? 's' : '') + '.</p>' : '')) +
      '<div class="row2" style="margin-top:1.6rem"><a class="btn" href="' + esc(RETOUR) + '">Retour à la fiche</a>' +
      (vues ? '<button type="button" class="btn" id="qz-raz">Effacer la progression</button>' : '') + '</div>';
    var choix = { n: 10, niv: 'tous' };
    root.querySelectorAll('.qz-seg').forEach(function (g) {
      g.querySelectorAll('.btn').forEach(function (b) {
        b.onclick = function () {
          choix[g.dataset.g] = g.dataset.g === 'n' ? parseInt(b.dataset.v, 10) : b.dataset.v;
          g.querySelectorAll('.btn').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        };
      });
    });
    var go = $('#qz-go'); if (go) go.onclick = function () { demarrer(choix.n, null, choix.niv); };
    var raz = $('#qz-raz'); if (raz) raz.onclick = function () { if (confirm('Effacer la progression de ce quiz sur cet appareil ?')) { wipe(); accueil(); } };
  }

  function demarrer(n, rejouer, niv) {
    S = { n: rejouer ? rejouer.length : n, rejouer: rejouer, niv: niv || 'tous', i: 0, bons: 0, faux: [], vues: [], cur: null, repondu: false };
    suivante();
  }

  function suivante() {
    if (S.n && S.i >= S.n) return fin();
    S.i++;
    S.repondu = false;
    S.cur = S.rejouer ? S.rejouer[S.i - 1] : tirer();
    afficher();
  }

  function bouton(it, k, lettre) {
    return '<button type="button" class="qz-ch" data-k="' + k + '"><span class="qz-lt" aria-hidden="true">' + lettre + '</span>' +
      '<span class="qz-tx">' + fmt(it.t) + '</span><span class="qz-mk" aria-hidden="true"></span></button>';
  }

  function afficher() {
    var q = S.cur, pct = S.n ? Math.round((S.i - 1) / S.n * 100) : 0, mode = 'choix';
    var corps = '<div class="qz-top"><span class="m" id="qz-pos">' + (S.n ? 'Question ' + S.i + ' sur ' + S.n : 'Question ' + S.i) + '</span>' +
      (S.n ? '' : '<button type="button" class="btn qz-fin" id="qz-stop">Terminer</button>') + '</div>' +
      (S.n ? '<div class="qz-bar" aria-hidden="true"><i style="width:' + pct + '%"></i></div>' : '<div class="qz-gap"></div>') +
      '<h2 class="qz-text" id="qz-text" tabindex="-1">' + fmt(q.q) + '</h2><div id="qz-ans">';
    S.items = null; S.sel = null; S.seq = null;
    if (q.type === 'saisie') {
      mode = 'saisie';
      corps += '<form id="qz-form" autocomplete="off"><label class="qz-lab" for="qz-in">Votre réponse</label>' +
        '<input class="qz-in" id="qz-in" type="text" inputmode="' + (q.nombre ? 'decimal' : 'text') + '" enterkeyhint="done" autocapitalize="off" spellcheck="false">' +
        '<div class="row2"><button type="submit" class="btn qz-pri">Valider</button></div></form>';
    } else if (q.type === 'multi') {
      mode = 'multi';
      var im = shuffle(q.choix.map(function (c, k) { return { t: c, bon: q.rep.indexOf(k) >= 0 }; }));
      S.items = im; S.sel = im.map(function () { return false; });
      corps += '<p class="m qz-hint">Plusieurs réponses sont possibles : touchez toutes les bonnes.</p><div role="group" aria-labelledby="qz-text">' +
        im.map(function (it, k) { return bouton(it, k, String.fromCharCode(65 + k)); }).join('') + '</div>' +
        '<div class="row2"><button type="button" class="btn qz-pri" id="qz-val">Valider</button></div><p class="qz-err" id="qz-err" role="alert" hidden></p>';
    } else if (q.type === 'ordre') {
      mode = 'ordre';
      var io = shuffle(q.items.map(function (t, k) { return { t: t, rang: k }; }));
      S.items = io; S.seq = [];
      corps += '<p class="m qz-hint">Touchez les éléments dans l\'ordre, du premier au dernier. Touchez-en une deuxième fois pour le retirer.</p><div role="group" aria-labelledby="qz-text">' +
        io.map(function (it, k) { return bouton(it, k, ''); }).join('') + '</div>' +
        '<div class="row2"><button type="button" class="btn qz-pri" id="qz-val">Valider</button></div><p class="qz-err" id="qz-err" role="alert" hidden></p>';
    } else {
      var items = q.type === 'vf' ? [{ t: 'Vrai', bon: q.rep === true }, { t: 'Faux', bon: q.rep === false }]
        : q.choix.map(function (c, k) { return { t: c, bon: k === q.rep }; });
      if (q.type !== 'vf' && q.ordre !== 'fixe') items = shuffle(items);
      S.items = items;
      corps += '<div role="group" aria-labelledby="qz-text">' + items.map(function (it, k) { return bouton(it, k, String.fromCharCode(65 + k)); }).join('') + '</div>';
    }
    corps += '</div><div class="qz-fb" id="qz-fb" role="status" aria-live="polite" hidden></div>' +
      '<div class="row2"><button type="button" class="btn qz-pri" id="qz-next" hidden>Question suivante</button></div>';
    root.innerHTML = corps;
    ajuster();
    var h = $('#qz-text'); if (h) h.focus({ preventScroll: false });
    root.querySelectorAll('.qz-ch').forEach(function (b) {
      b.onclick = function () { var k = parseInt(b.dataset.k, 10); if (mode === 'choix') repondreChoix(k); else basculer(k); };
    });
    var f = $('#qz-form'); if (f) f.onsubmit = function (e) { e.preventDefault(); repondreSaisie($('#qz-in').value); };
    var vb = $('#qz-val'); if (vb) vb.onclick = function () { if (mode === 'multi') validerMulti(); else validerOrdre(); };
    var st = $('#qz-stop'); if (st) st.onclick = fin;
    $('#qz-next').onclick = suivante;
  }

  function enregistrer(q, bon) {
    if (bon) S.bons++; else S.faux.push(q);
    if (q.id) {
      var b = prog.b[q.id] ? prog.b[q.id][0] : 0;
      prog.b[q.id] = [bon ? Math.min(5, b + 1) : 1, Date.now()];
      save();
    }
  }

  function retour(q, bon, attendu, libelle, brut) {
    S.repondu = true;
    var fb = $('#qz-fb');
    var html = '<p class="qz-v"><b>' + (bon ? icone('ok') + 'Bonne réponse' : icone('ko') + 'Pas tout à fait') + '</b></p>';
    if (!bon) html += brut ? '<p>' + (libelle || 'Réponse attendue') + ' :</p>' + attendu : '<p>' + (libelle || 'Réponse attendue') + ' : <b>' + attendu + '</b></p>';
    if (q.expl) html += '<p class="qz-ex">' + fmt(q.expl) + '</p>';
    if (q.source) html += '<p class="m qz-src">' + (q.hors_cours ? 'Information absente du cours (†). ' : 'Dans la fiche : ') + fmt(q.source) +
      '. <a href="' + esc(RETOUR) + '">Ouvrir la fiche</a></p>';
    fb.className = 'qz-fb ' + (bon ? 'ok' : 'ko');
    fb.innerHTML = html; fb.hidden = false;
    ajuster();
    var nx = $('#qz-next');
    nx.hidden = false;
    nx.textContent = (S.n && S.i >= S.n) ? 'Voir le résultat' : 'Question suivante';
    nx.focus();
  }

  function repondreChoix(k) {
    if (S.repondu) return;
    var q = S.cur, it = S.items[k], bon = it.bon, att = '';
    root.querySelectorAll('.qz-ch').forEach(function (b, j) {
      b.disabled = true;
      var mk = b.querySelector('.qz-mk');
      if (S.items[j].bon) { b.classList.add('ok'); mk.innerHTML = icone('ok'); att = S.items[j].t; }
      else if (j === k) { b.classList.add('ko'); mk.innerHTML = icone('ko'); }
    });
    enregistrer(q, bon);
    retour(q, bon, fmt(att));
  }

  /* plusieurs bonnes réponses : on touche pour cocher, puis on valide */
  function basculer(k) {
    if (S.repondu) return;
    var b = root.querySelectorAll('.qz-ch')[k];
    if (S.cur.type === 'multi') {
      S.sel[k] = !S.sel[k];
      b.classList.toggle('sel', S.sel[k]);
      b.setAttribute('aria-pressed', S.sel[k] ? 'true' : 'false');
      b.querySelector('.qz-mk').innerHTML = S.sel[k] ? icone('ok') : '';
    } else {
      var p = S.seq.indexOf(k);
      if (p >= 0) S.seq.splice(p, 1); else S.seq.push(k);
      root.querySelectorAll('.qz-ch').forEach(function (x, j) {
        var r = S.seq.indexOf(j);
        x.classList.toggle('sel', r >= 0);
        x.setAttribute('aria-pressed', r >= 0 ? 'true' : 'false');
        x.querySelector('.qz-lt').textContent = r >= 0 ? String(r + 1) : '';
      });
    }
    var er = $('#qz-err'); if (er) er.hidden = true;
  }
  function validerMulti() {
    if (S.repondu) return;
    var q = S.cur, bons = 0, ok = true, att = [];
    if (S.sel.indexOf(true) < 0) { var er = $('#qz-err'); er.textContent = 'Touchez au moins une réponse.'; er.hidden = false; return; }
    root.querySelectorAll('.qz-ch').forEach(function (b, j) {
      var it = S.items[j], mk = b.querySelector('.qz-mk');
      b.disabled = true; b.classList.remove('sel');
      if (it.bon) att.push(it.t);
      if (it.bon && S.sel[j]) { b.classList.add('ok'); mk.innerHTML = icone('ok'); }
      else if (!it.bon && S.sel[j]) { b.classList.add('ko'); mk.innerHTML = icone('ko'); ok = false; }
      else if (it.bon) { b.classList.add('miss'); mk.innerHTML = icone('ok'); ok = false; }
      else mk.innerHTML = '';
    });
    $('#qz-val').hidden = true;
    enregistrer(q, ok);
    retour(q, ok, att.map(fmt).join(' ; '), att.length > 1 ? 'Réponses attendues' : 'Réponse attendue');
  }
  function validerOrdre() {
    if (S.repondu) return;
    var q = S.cur, ok = true;
    if (S.seq.length < S.items.length) { var er = $('#qz-err'); er.textContent = 'Placez les ' + S.items.length + ' éléments avant de valider.'; er.hidden = false; return; }
    root.querySelectorAll('.qz-ch').forEach(function (b, j) {
      var it = S.items[j], r = S.seq.indexOf(j), bon = r === it.rang, mk = b.querySelector('.qz-mk');
      b.disabled = true; b.classList.remove('sel');
      b.classList.add(bon ? 'ok' : 'ko'); mk.innerHTML = icone(bon ? 'ok' : 'ko');
      if (!bon) ok = false;
    });
    $('#qz-val').hidden = true;
    enregistrer(q, ok);
    retour(q, ok, '<ol class="qz-ord">' + q.items.map(function (t) { return '<li>' + fmt(t) + '</li>'; }).join('') + '</ol>', 'Ordre attendu', true);
  }

  function repondreSaisie(v) {
    if (S.repondu) return;
    var inp = $('#qz-in'), q = S.cur;
    if (!String(v).trim()) { inp.setAttribute('aria-invalid', 'true'); inp.focus(); return; }
    var bon = estBon(q, v);
    inp.disabled = true; $('#qz-form .btn').hidden = true;
    inp.classList.add(bon ? 'ok' : 'ko');
    enregistrer(q, bon);
    retour(q, bon, fmt(aff(q)));
  }

  function fin() {
    var n = S.i - (S.repondu ? 0 : 1);          // questions réellement traitées
    if (n < 0) n = 0;
    var faux = S.faux, bons = S.bons, niv = S.niv;
    var liste = faux.map(function (q) {
      var att;
      if (q.type === 'saisie') att = fmt(aff(q));
      else if (q.type === 'vf') att = q.rep ? 'Vrai' : 'Faux';
      else if (q.type === 'multi') att = q.rep.map(function (k) { return fmt(q.choix[k]); }).join(' ; ');
      else if (q.type === 'ordre') att = q.items.map(function (t, k) { return (k + 1) + '. ' + fmt(t); }).join(' ; ');
      else att = fmt(q.choix[q.rep]);
      return '<li><span class="qz-lq">' + fmt(q.q) + '</span><span class="m">Réponse : ' + att + '</span></li>';
    }).join('');
    root.innerHTML = '<h1>Résultat</h1><p class="qz-score"><b>' + bons + '</b> sur ' + n + (n ? ' (' + Math.round(bons / n * 100) + ' %)' : '') + '</p>' +
      (faux.length ? '<p class="qz-lab">À revoir</p><ol class="qz-rev">' + liste + '</ol>' : (n ? '<p class="lead">Aucune erreur sur cette série.</p>' : '')) +
      '<div class="row2">' + (faux.length ? '<button type="button" class="btn qz-pri" id="qz-redo">Refaire les questions ratées</button>' : '') +
      '<button type="button" class="btn' + (faux.length ? '' : ' qz-pri') + '" id="qz-new">Nouvelle série</button>' +
      '<a class="btn" href="' + esc(RETOUR) + '">Retour à la fiche</a></div>';
    ajuster();
    var redo = $('#qz-redo'); if (redo) redo.onclick = function () { demarrer(0, faux.slice(), niv); };
    $('#qz-new').onclick = accueil;
    var h = root.querySelector('h1'); if (h) { h.tabIndex = -1; h.focus(); }
    S = null;
  }

  /* clavier : A à D ou 1 à 4 pour choisir (ou cocher), Entrée pour passer à la suite */
  document.addEventListener('keydown', function (e) {
    if (!S || e.ctrlKey || e.metaKey || e.altKey) return;
    var tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (!S.repondu && S.items && S.cur && S.cur.type !== 'saisie') {
      var k = /^[1-9]$/.test(e.key) ? parseInt(e.key, 10) - 1 : /^[a-iA-I]$/.test(e.key) ? e.key.toLowerCase().charCodeAt(0) - 97 : -1;
      if (k >= 0 && k < S.items.length) {
        e.preventDefault();
        if (S.cur.type === 'multi' || S.cur.type === 'ordre') basculer(k); else repondreChoix(k);
      }
    }
  });

  /* ---------- démarrage ---------- */
  load();
  function pret(data) {
    bank = (data && data.questions) || [];
    accueil();
  }
  if (D.banque) {
    fetch(D.banque, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(pret).catch(function () { root.innerHTML = '<h1>Quiz</h1><p class="lead">Les questions n\'ont pas pu être chargées. Vérifiez la connexion, puis rechargez la page.</p>'; });
  } else pret({ questions: [] });
})();
