/* Moteur de quiz du site de fiches (aucune dépendance, aucun réseau hors les fichiers de questions, progression gardée sur l'appareil).
   Deux sortes de pages :
   (1) le quiz d'une fiche : <div id="quiz" data-banque="quiz.json" data-gens="nom1,nom2" data-slug="..." data-retour="./" data-cats='[{"id":"definition","nom":"Définitions"}]'></div>
   (2) la page « Quiz » commune à tous les chapitres : <div id="quiz" data-catalogue="catalogue.json" data-cats='...' data-retour="../" data-retourtxt="Retour à l'accueil"></div>
       Le catalogue liste les chapitres (matière, titre, banque, générateurs, effectifs par catégorie et niveau) ; l'élève coche ses chapitres, ses catégories, le niveau et le nombre de questions.
   + assets/generateurs.js + assets/quiz.js.
   Questions : { id?, type:'qcm'|'vf'|'saisie'|'multi'|'ordre', niveau?(1 rappel, 2 application, 3 type DS), cat?('definition'|'formule'|'calcul'|'exercice'|'methode'|'piege'|'date'|'repere'|'cause'), q, choix?, rep, items?, nombre?, tol?, ordre?, expl?, source?, hors_cours? } (voir references/quiz.md du skill).
   multi : plusieurs bonnes réponses (rep = liste d'indices) ; ordre : remettre dans l'ordre (items = ordre correct).
   Texte mathématique entre $...$ : mini-syntaxe convertie en MathML (x^2, u_n, u_{n+1}, frac(a,b), sqrt(a), set(1;2), bar(A) (barre), cap, cup, Delta, RR, inf, vide ; un décimal s'écrit avec un point, 0.6, et s'affiche 0,6). */
(function () {
  'use strict';
  var root = document.getElementById('quiz');
  if (!root) return;
  var D = root.dataset;
  var GEN = window.QUIZ_GEN || {};
  var GEN_CAT = window.QUIZ_GEN_CAT || {};
  var CATS = [], CATNOM = {};
  try { CATS = JSON.parse(D.cats || '[]'); } catch (e) { }
  CATS.forEach(function (c) { CATNOM[c.id] = c.nom; });
  var GLOBAL = !!D.catalogue;                 // page commune à plusieurs chapitres
  var RETOUR = D.retour || './', RETOUR_TXT = D.retourtxt || 'Retour à la fiche';
  var CHAP = [], NEUTRE = null;               // chapitres proposés : { slug, matiere, kd, kl, titre, chapitre, banque, gens, fiche, n, cats:{cat:[n1,n2,n3]} }
  var banks = {}, progs = {};                 // questions chargées et progression, par chapitre (slug)
  var F = { chap: [], sans: [], n: 10, niv: 'tous' };   // filtres choisis : chapitres, catégories écartées, nombre de questions, niveau
  var MINI = { tous: 1, moyen: 2, ds: 3 };
  var S = null;                     // série en cours

  /* ---------- utilitaires ---------- */
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function ri(n) { return Math.floor(Math.random() * n); }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = ri(i + 1), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function $(sel, ctx) { return (ctx || root).querySelector(sel); }
  function catNom(id) { return CATNOM[id] || ''; }
  function pl(n, un, plu) { return n + ' ' + (n > 1 ? plu : un); }
  /* progression par chapitre : { v:1, b:{ idQuestion: [boîte 1 à 5, date] } }, gardée dans le navigateur (aucun envoi) */
  function cle(slug) { return 'quiz:' + slug; }
  function prog(slug) {
    if (progs[slug]) return progs[slug];
    var p = { v: 1, b: {} };
    try { var r = JSON.parse(localStorage.getItem(cle(slug))); if (r && r.v === 1 && r.b) p = r; } catch (e) { }
    return (progs[slug] = p);
  }
  function save(slug) { try { localStorage.setItem(cle(slug), JSON.stringify(progs[slug])); } catch (e) { } }
  function wipe(slugs) { slugs.forEach(function (s) { progs[s] = { v: 1, b: {} }; try { localStorage.removeItem(cle(s)); } catch (e) { } }); }
  /* filtres : gardés sur l'appareil pour la page commune seulement (confort, jamais indispensable) */
  function chargerFiltres() {
    try { var r = JSON.parse(localStorage.getItem('quiz:filtres')); if (r && typeof r === 'object') return r; } catch (e) { }
    return {};
  }
  function sauverFiltres() { if (GLOBAL) { try { localStorage.setItem('quiz:filtres', JSON.stringify(F)); } catch (e) { } } }

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
  function genCat(nom) { return GEN_CAT[nom] || 'calcul'; }
  function niveauDe(q) { return q.niveau || 2; }
  function boite(q) { var p = q.id && q._s ? prog(q._s.slug).b[q.id] : null; return p ? p[0] : 0; }
  function catOk(c) { return !S.cats || S.cats.indexOf(c) >= 0; }     // S.cats vaut null quand toutes les catégories sont retenues
  function eligibles(c) {
    return (banks[c.slug] || []).filter(function (x) { return niveauDe(x) >= S.mini && catOk(x.cat || ''); });
  }
  function gensDe(c) {
    return (c.gens || []).filter(function (n) { return GEN[n] && catOk(genCat(n)); });
  }
  function tirer() {
    var q, essais = 0, dernier = S.cur ? S.cur.q : '';
    var cands = S.chap.filter(function (c) { return eligibles(c).length || gensDe(c).length; });
    if (!cands.length) return null;
    do {                                       // on choisit d'abord un chapitre au hasard : chaque chapitre coché passe aussi souvent que les autres
      var c = cands[ri(cands.length)], base = eligibles(c), gs = gensDe(c);
      if (gs.length && (!base.length || Math.random() < 0.4)) {
        var nom = gs[ri(gs.length)], k = 0;
        do { q = GEN[nom](); k++; } while (niveauDe(q) < S.mini && k < 12);
        q.gen = nom; q._s = c; if (!q.cat) q.cat = genCat(nom);
      } else {
        var ids = {}; base.forEach(function (b) { ids[b.id] = 1; });
        var pool = base.filter(function (b) { return S.vues.indexOf(b.id) < 0; });
        if (!pool.length) { S.vues = S.vues.filter(function (id) { return !ids[id]; }); pool = base.slice(); }
        var tot = 0, w = pool.map(function (b) { var x = POIDS[boite(b)] * (S.niv === 'tous' ? POIDS_NIVEAU[niveauDe(b)] : 1); tot += x; return x; }), r = Math.random() * tot, j = 0;
        while (j < pool.length - 1 && r >= w[j]) { r -= w[j]; j++; }
        q = pool[j];
        S.vues.push(q.id);
      }
      essais++;
    } while (q.q === dernier && essais < 8);
    return q;
  }

  /* ---------- filtres : effectifs affichés à l'écran de départ ---------- */
  function selection() { return CHAP.filter(function (c) { return F.chap.indexOf(c.slug) >= 0; }); }
  function effectifs(sel) {                    // { catégorie: nombre de questions } pour le niveau choisi
    var mini = MINI[F.niv], o = {};
    sel.forEach(function (c) {
      Object.keys(c.cats || {}).forEach(function (k) {
        var a = c.cats[k];
        for (var i = mini - 1; i < 3; i++) o[k] = (o[k] || 0) + (a[i] || 0);
      });
    });
    return o;
  }
  function calculs(sel) {                      // des générateurs de calcul sont-ils disponibles dans la sélection ?
    return sel.some(function (c) { return (c.gens || []).some(function (n) { return GEN[n]; }); });
  }
  function categoriesRetenues(sel) {           // null = toutes ; sinon la liste des catégories gardées
    if (!F.sans.length) return null;
    return CATS.map(function (c) { return c.id; }).filter(function (id) { return F.sans.indexOf(id) < 0; });
  }

  /* ---------- écrans ---------- */
  function icone(c) { return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + (c === 'ok' ? 'M5 13l4 4L19 7' : 'M6 6l12 12M18 6L6 18') + '"/></svg>'; }
  function teinte(c) {                         // couleur de la matière sur toute la page (page commune)
    var w = root.parentElement, t = c || NEUTRE;
    if (GLOBAL && w && t) { w.style.setProperty('--kd', t.kd); w.style.setProperty('--kl', t.kl); }
  }
  function seg(id, groupe, label, valeurs, courante) {
    return '<p class="qz-lab" id="' + id + '">' + label + '</p><div class="qz-seg" role="group" aria-labelledby="' + id + '" data-g="' + groupe + '">' +
      valeurs.map(function (v) { return '<button type="button" class="btn" data-v="' + v[0] + '" aria-pressed="' + (String(courante) === String(v[0])) + '">' + v[1] + '</button>'; }).join('') + '</div>';
  }

  function accueil() {
    S = null; teinte(null);
    var vide = !CHAP.length;
    var groupes = [];                          // chapitres groupés par matière, dans l'ordre du catalogue
    CHAP.forEach(function (c) {
      var g = groupes.filter(function (x) { return x.m === c.matiere; })[0];
      if (!g) groupes.push(g = { m: c.matiere, kd: c.kd, kl: c.kl, l: [] });
      g.l.push(c);
    });
    var ds = CHAP.some(function (c) { return (c.gens || []).length || Object.keys(c.cats || {}).some(function (k) { return c.cats[k][2] > 0; }); });
    var h = '<h1>Quiz</h1><p class="m">' + esc(D.titre || '') + '</p>';
    if (vide) h += '<p class="lead">Aucune question n\'est disponible pour l\'instant.</p>';
    else {
      h += '<p class="lead">' + (GLOBAL ? 'Choisissez les chapitres et les catégories à réviser.' : 'Choisissez ce que vous voulez réviser.') +
        ' Les questions sont mélangées à chaque série, et celles dont la réponse était fausse reviennent plus souvent.</p>';
      if (GLOBAL) {
        h += '<p class="qz-lab" id="qz-labc">Chapitres</p><div id="qz-chaps">' + groupes.map(function (g, gi) {
          return '<section class="mat qz-grp" data-gi="' + gi + '" style="--kd:' + esc(g.kd) + ';--kl:' + esc(g.kl) + '" aria-label="' + esc(g.m) + '">' +
            '<div class="qz-gh"><b class="qz-gt">' + esc(g.m) + '</b><button type="button" class="qz-all" data-gi="' + gi + '"></button></div>' +
            g.l.map(function (c) {
              return '<label class="qz-ck"><input type="checkbox" value="' + esc(c.slug) + '"><span class="qz-bx" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg></span>' +
                '<span class="qz-ct"><b>' + esc(c.chapitre) + '</b><span>' + esc(c.titre) + '</span><small class="qz-cn" data-s="' + esc(c.slug) + '"></small></span></label>';
            }).join('') + '</section>';
        }).join('') + '</div>';
      }
      h += '<p class="qz-lab" id="qz-labk">Catégories</p><div class="qz-cats" role="group" aria-labelledby="qz-labk">' +
        CATS.map(function (c) { return '<button type="button" class="btn qz-cat" data-id="' + esc(c.id) + '" aria-pressed="true">' + esc(c.nom) + ' <small></small></button>'; }).join('') + '</div>' +
        seg('qz-lab1', 'n', 'Nombre de questions', [[10, '10'], [20, '20'], [0, 'Sans fin']], F.n) +
        (ds ? seg('qz-lab2', 'niv', 'Niveau', [['tous', 'Tous niveaux'], ['moyen', 'Moyen et DS'], ['ds', 'DS']], F.niv) : '') +
        '<p class="qz-count" id="qz-count" role="status" aria-live="polite"></p>' +
        '<div class="row2"><button type="button" class="btn qz-pri" id="qz-go">Commencer</button></div><p class="m qz-stat" id="qz-stat"></p>';
    }
    h += '<div class="row2" style="margin-top:1.6rem"><a class="btn" href="' + esc(RETOUR) + '">' + esc(RETOUR_TXT) + '</a>' +
      (!GLOBAL && D.global ? '<a class="btn" href="' + esc(D.global) + '">Quiz de plusieurs chapitres</a>' : '') +
      '<button type="button" class="btn" id="qz-raz" hidden>Effacer la progression</button></div>';
    root.innerHTML = h;
    if (vide) return;
    // état initial des cases et des puces
    root.querySelectorAll('.qz-ck input').forEach(function (i) {
      i.checked = F.chap.indexOf(i.value) >= 0;
      i.onchange = function () {
        var p = F.chap.indexOf(i.value);
        if (i.checked && p < 0) F.chap.push(i.value); else if (!i.checked && p >= 0) F.chap.splice(p, 1);
        sauverFiltres(); maj();
      };
    });
    root.querySelectorAll('.qz-all').forEach(function (b) {
      b.onclick = function () {
        var l = groupes[+b.dataset.gi].l, tous = l.every(function (c) { return F.chap.indexOf(c.slug) >= 0; });
        l.forEach(function (c) {
          var p = F.chap.indexOf(c.slug);
          if (tous && p >= 0) F.chap.splice(p, 1); else if (!tous && p < 0) F.chap.push(c.slug);
        });
        root.querySelectorAll('.qz-ck input').forEach(function (i) { i.checked = F.chap.indexOf(i.value) >= 0; });
        sauverFiltres(); maj();
      };
    });
    root.querySelectorAll('.qz-cat').forEach(function (b) {
      b.onclick = function () {
        if (b.getAttribute('aria-disabled') === 'true') return;
        var p = F.sans.indexOf(b.dataset.id);
        if (p >= 0) F.sans.splice(p, 1); else F.sans.push(b.dataset.id);
        sauverFiltres(); maj();
      };
    });
    root.querySelectorAll('.qz-seg').forEach(function (g) {
      g.querySelectorAll('.btn').forEach(function (b) {
        b.onclick = function () {
          F[g.dataset.g] = g.dataset.g === 'n' ? parseInt(b.dataset.v, 10) : b.dataset.v;
          g.querySelectorAll('.btn').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
          sauverFiltres(); maj();
        };
      });
    });
    $('#qz-go').onclick = function () { demarrer(null); };
    $('#qz-raz').onclick = function () {
      if (confirm('Effacer la progression des chapitres cochés sur cet appareil ?')) { wipe(selection().map(function (c) { return c.slug; })); maj(); }
    };
    maj();
  }

  /* met à jour, sans tout redessiner, les effectifs, les puces et le bouton « Commencer » */
  function maj() {
    var sel = selection(), aucune = !sel.length, vue = aucune ? CHAP : sel;          // sans chapitre coché, les puces montrent les effectifs de tout le quiz
    var eff = effectifs(vue), gen = calculs(vue), total = 0, retenues = 0;
    root.querySelectorAll('.qz-all').forEach(function (b) {
      var boxes = b.closest('.qz-grp').querySelectorAll('input'), tous = Array.prototype.every.call(boxes, function (i) { return i.checked; });
      b.textContent = tous ? 'Tout décocher' : 'Tout cocher';
    });
    root.querySelectorAll('.qz-cn').forEach(function (s) {
      var c = CHAP.filter(function (x) { return x.slug === s.dataset.s; })[0], P = prog(c.slug).b, vues = 0, maitrisees = 0;
      Object.keys(P).forEach(function (k) { if (P[k][0] > 0) vues++; if (P[k][0] >= 4) maitrisees++; });
      s.textContent = pl(c.n || 0, 'question', 'questions') + ((c.gens || []).length ? ' et des calculs renouvelés' : '') + (maitrisees ? ', ' + maitrisees + ' maîtrisée' + (maitrisees > 1 ? 's' : '') : '');
    });
    root.querySelectorAll('.qz-cat').forEach(function (b) {
      var id = b.dataset.id, n = eff[id] || 0, avecGen = id === 'calcul' && gen, dispo = n > 0 || avecGen, actif = F.sans.indexOf(id) < 0;
      b.setAttribute('aria-pressed', dispo && actif ? 'true' : 'false');
      b.setAttribute('aria-disabled', dispo ? 'false' : 'true');
      b.classList.toggle('off', !dispo);
      b.querySelector('small').textContent = dispo ? String(n) + (avecGen ? '+' : '') : '0';
      if (dispo && actif) { total += n; retenues++; }
    });
    var c = $('#qz-count'), go = $('#qz-go');
    if (c) {
      var calcOk = gen && F.sans.indexOf('calcul') < 0;          // les générateurs ne servent que si la catégorie « calcul » est retenue
      if (!F.sans.length) total += eff[''] || 0;                  // questions sans catégorie : seulement quand rien n'est écarté
      var ok = !aucune && (total > 0 || calcOk);
      c.textContent = aucune ? 'Cochez au moins un chapitre.' : !ok && !retenues ? 'Choisissez au moins une catégorie.' :
        !ok ? 'Aucune question avec ces filtres.' : pl(total, 'question', 'questions') + ' dans la sélection' + (calcOk ? ', plus des calculs qui changent à chaque série' : '') + '.';
      go.disabled = !ok; go.setAttribute('aria-disabled', ok ? 'false' : 'true');
    }
    var st = $('#qz-stat'), raz = $('#qz-raz'), v = 0, mm = 0;
    sel.forEach(function (x) { var P = prog(x.slug).b; Object.keys(P).forEach(function (k) { if (P[k][0] > 0) v++; if (P[k][0] >= 4) mm++; }); });
    if (st) st.textContent = v ? pl(mm, 'question maîtrisée', 'questions maîtrisées') + ', ' + pl(v, 'déjà vue', 'déjà vues') + ' dans la sélection.' : '';
    if (raz) raz.hidden = !v;
  }

  function erreur() { root.innerHTML = '<h1>Quiz</h1><p class="lead">Les questions n\'ont pas pu être chargées. Vérifiez la connexion, puis rechargez la page.</p>'; }

  function charger(sel) {                      // charge (une seule fois) la banque de chaque chapitre coché
    return Promise.all(sel.map(function (c) {
      if (banks[c.slug] || !c.banque) { banks[c.slug] = banks[c.slug] || []; return null; }
      return fetch(c.banque, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(function (d) { banks[c.slug] = ((d && d.questions) || []).map(function (q) { q._s = c; return q; }); });
    }));
  }

  function demarrer(rejouer) {
    var sel = rejouer ? CHAP : selection();
    if (!rejouer && !sel.length) return;
    root.innerHTML = '<p class="m">Chargement…</p>';
    (rejouer ? Promise.resolve() : charger(sel)).then(function () {
      S = { n: rejouer ? rejouer.length : F.n, rejouer: rejouer, niv: F.niv, mini: MINI[F.niv], cats: categoriesRetenues(sel), chap: sel, i: 0, bons: 0, faux: [], vues: [], cur: null, repondu: false, parCat: {} };
      if (!rejouer && !S.chap.some(function (c) { return eligibles(c).length || gensDe(c).length; })) {
        S = null; accueil(); var cn = $('#qz-count'); if (cn) cn.textContent = 'Aucune question avec ces filtres.'; return;
      }
      suivante();
    }).catch(erreur);
  }

  function suivante() {
    if (S.n && S.i >= S.n) return fin();
    S.i++;
    S.repondu = false;
    S.cur = S.rejouer ? S.rejouer[S.i - 1] : tirer();
    if (!S.cur) return fin();
    afficher();
  }

  function bouton(it, k, lettre) {
    return '<button type="button" class="qz-ch" data-k="' + k + '"><span class="qz-lt" aria-hidden="true">' + lettre + '</span>' +
      '<span class="qz-tx">' + fmt(it.t) + '</span><span class="qz-mk" aria-hidden="true"></span></button>';
  }

  function afficher() {
    var q = S.cur, pct = S.n ? Math.round((S.i - 1) / S.n * 100) : 0, mode = 'choix', c = q._s || {};
    teinte(c);
    var tags = (GLOBAL && c.matiere ? '<span class="qz-tag">' + esc(c.matiere + ', ' + c.chapitre) + '</span>' : '') + (q.cat && catNom(q.cat) ? '<span class="qz-tag qz-tc">' + esc(catNom(q.cat)) + '</span>' : '');
    var corps = '<div class="qz-top"><span class="m" id="qz-pos">' + (S.n ? 'Question ' + S.i + ' sur ' + S.n : 'Question ' + S.i) + '</span>' +
      (S.n ? '' : '<button type="button" class="btn qz-fin" id="qz-stop">Terminer</button>') + '</div>' +
      (S.n ? '<div class="qz-bar" aria-hidden="true"><i style="width:' + pct + '%"></i></div>' : '<div class="qz-gap"></div>') +
      (tags ? '<div class="qz-tags">' + tags + '</div>' : '') +
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
    var k = q.cat || '', pc = S.parCat[k] || (S.parCat[k] = [0, 0]);
    pc[1]++; if (bon) pc[0]++;
    if (q.id && q._s) {
      var P = prog(q._s.slug), b = P.b[q.id] ? P.b[q.id][0] : 0;
      P.b[q.id] = [bon ? Math.min(5, b + 1) : 1, Date.now()];
      save(q._s.slug);
    }
  }

  function retour(q, bon, attendu, libelle, brut) {
    S.repondu = true;
    var fb = $('#qz-fb'), fiche = (q._s && q._s.fiche) || RETOUR;
    var html = '<p class="qz-v"><b>' + (bon ? icone('ok') + 'Bonne réponse' : icone('ko') + 'Pas tout à fait') + '</b></p>';
    if (!bon) html += brut ? '<p>' + (libelle || 'Réponse attendue') + ' :</p>' + attendu : '<p>' + (libelle || 'Réponse attendue') + ' : <b>' + attendu + '</b></p>';
    if (q.expl) html += '<p class="qz-ex">' + fmt(q.expl) + '</p>';
    if (q.source) html += '<p class="m qz-src">' + (q.hors_cours ? 'Information absente du cours (†). ' : q.cat === 'exercice' ? 'Exercice du cours : ' : 'Dans la fiche : ') + fmt(q.source) +
      '. <a href="' + esc(fiche) + '">Ouvrir la fiche</a></p>';
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
    var faux = S.faux, bons = S.bons, parCat = S.parCat;
    teinte(null);
    var liste = faux.map(function (q) {
      var att;
      if (q.type === 'saisie') att = fmt(aff(q));
      else if (q.type === 'vf') att = q.rep ? 'Vrai' : 'Faux';
      else if (q.type === 'multi') att = q.rep.map(function (k) { return fmt(q.choix[k]); }).join(' ; ');
      else if (q.type === 'ordre') att = q.items.map(function (t, k) { return (k + 1) + '. ' + fmt(t); }).join(' ; ');
      else att = fmt(q.choix[q.rep]);
      var ou = [GLOBAL && q._s && q._s.matiere ? q._s.matiere + ', ' + q._s.chapitre : '', catNom(q.cat)].filter(Boolean).join(' : ');
      return '<li><span class="qz-lq">' + fmt(q.q) + '</span>' + (ou ? '<span class="m qz-ou">' + esc(ou) + '</span>' : '') + '<span class="m">Réponse : ' + att + '</span></li>';
    }).join('');
    var cats = Object.keys(parCat).filter(function (k) { return k && catNom(k); });
    var detail = cats.length > 1 ? '<p class="qz-lab">Par catégorie</p><ul class="qz-pc">' + cats.map(function (k) {
      var p = parCat[k], r = Math.round(p[0] / p[1] * 100);
      return '<li><span>' + esc(catNom(k)) + '</span><b>' + p[0] + ' sur ' + p[1] + '</b><i class="qz-pb" aria-hidden="true"><i style="width:' + r + '%"></i></i></li>';
    }).join('') + '</ul>' : '';
    root.innerHTML = '<h1>Résultat</h1><p class="qz-score"><b>' + bons + '</b> sur ' + n + (n ? ' (' + Math.round(bons / n * 100) + ' %)' : '') + '</p>' + detail +
      (faux.length ? '<p class="qz-lab">À revoir</p><ol class="qz-rev">' + liste + '</ol>' : (n ? '<p class="lead">Aucune erreur sur cette série.</p>' : '')) +
      '<div class="row2">' + (faux.length ? '<button type="button" class="btn qz-pri" id="qz-redo">Refaire les questions ratées</button>' : '') +
      '<button type="button" class="btn' + (faux.length ? '' : ' qz-pri') + '" id="qz-new">Nouvelle série</button>' +
      '<a class="btn" href="' + esc(RETOUR) + '">' + esc(RETOUR_TXT) + '</a></div>';
    ajuster();
    var redo = $('#qz-redo'); if (redo) redo.onclick = function () { demarrer(faux.slice()); };
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
  function comptes(c, qs) {                     // effectifs par catégorie et par niveau : { cat: [niveau 1, 2, 3] }
    var o = {};
    qs.forEach(function (q) { var k = q.cat || '', a = o[k] || (o[k] = [0, 0, 0]); a[niveauDe(q) - 1]++; });
    c.n = qs.length; c.cats = o;
  }
  function fetchJson(u) { return fetch(u, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }
  if (GLOBAL) {
    fetchJson(D.catalogue).then(function (cat) {
      CHAP = cat.chapitres || []; NEUTRE = cat.neutre || null;
      var r = chargerFiltres();
      F.chap = (r.chap || []).filter(function (s) { return CHAP.some(function (c) { return c.slug === s; }); });
      F.sans = (r.sans || []).filter(function (id) { return CATNOM[id]; });
      if (r.n === 0 || r.n === 10 || r.n === 20) F.n = r.n;
      if (MINI[r.niv]) F.niv = r.niv;
      accueil();
    }).catch(erreur);
  } else {
    var gens = (D.gens || '').split(',').filter(function (n) { return n && GEN[n]; });
    var c1 = { slug: D.slug || location.pathname, matiere: '', chapitre: '', titre: D.titre || '', banque: D.banque || '', gens: gens, fiche: RETOUR };
    CHAP = [c1]; F.chap = [c1.slug];
    (D.banque ? fetchJson(D.banque).then(function (d) { return (d && d.questions) || []; }) : Promise.resolve([])).then(function (qs) {
      banks[c1.slug] = qs.map(function (q) { q._s = c1; return q; });
      comptes(c1, qs);
      accueil();
    }).catch(erreur);
  }
})();
