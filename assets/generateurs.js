/* Générateurs de questions : chaque générateur renvoie une question neuve (nombres tirés au hasard) dont la réponse est CALCULÉE, donc toujours exacte.
   Une question = { type:'qcm'|'saisie'|'vf', q, ... } (format décrit dans references/quiz.md du skill fiche-revision).
   Texte mathématique entre $...$, mini-syntaxe : x^2, u_n, u_{n+1}, frac(a,b), sqrt(a), set(1;2), [ ], cup, setminus, pm, Delta, alpha, RR, inf, vide.
   Les champs commençant par _ (_abc, _poly, _set, _chk...) sont réservés au test automatique (tester_generateurs.js) et ignorés par le moteur.
   Ce fichier n'utilise ni le DOM ni le réseau : il se teste avec Node. */
(function (root) {
  'use strict';
  var G = root.QUIZ_GEN = root.QUIZ_GEN || {};

  /* ---------- outils ---------- */
  function ri(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  function nz(a, b) { var n = 0; while (n === 0) n = ri(a, b); return n; }
  function pick(t) { return t[ri(0, t.length - 1)]; }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = ri(0, i), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function par(n) { return n < 0 ? '(' + n + ')' : String(n); }
  function m(s) { return '$' + s + '$'; }

  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var t = a % b; a = b; b = t; } return a; }
  function fr(p, q) { if (q < 0) { p = -p; q = -q; } var g = gcd(p, q) || 1; return { p: p / g, q: q / g }; }
  function fval(f) { return f.p / f.q; }
  function fneg(f) { return { p: -f.p, q: f.q }; }
  function ftxt(f) { return f.q === 1 ? String(f.p) : (f.p < 0 ? '-' : '') + 'frac(' + Math.abs(f.p) + ',' + f.q + ')'; }
  function fatt(f) { return m(ftxt(f)); }

  /* polynôme à coefficients entiers, du plus haut degré au plus bas : [a, b, c] = ax^2+bx+c */
  function pol(cs) {
    var n = cs.length - 1, s = '';
    for (var i = 0; i < cs.length; i++) {
      var c = cs[i], d = n - i;
      if (!c) continue;
      var ac = Math.abs(c), sg = c < 0 ? '-' : (s ? '+' : '');
      s += sg + ((ac === 1 && d > 0) ? '' : String(ac)) + (d === 0 ? '' : d === 1 ? 'x' : 'x^' + d);
    }
    return s || '0';
  }
  function mulPoly(A, B) {
    var R = [], i, j;
    for (i = 0; i < A.length + B.length - 1; i++) R.push(0);
    for (i = 0; i < A.length; i++) for (j = 0; j < B.length; j++) R[i + j] += A[i] * B[j];
    return R;
  }
  function polyRacines(rs, k) {                 /* k * produit des (q x - p) : coefficients entiers, racines p/q */
    var P = [k];
    rs.forEach(function (r) { P = mulPoly(P, [r.q, -r.p]); });
    return P;
  }
  function evalP(cs, x) { var v = 0; cs.forEach(function (c) { v = v * x + c; }); return v; }
  function evalTxt(cs, r) {
    var n = cs.length - 1, s = '';
    for (var i = 0; i < cs.length; i++) {
      var c = cs[i], d = n - i;
      if (!c) continue;
      var ac = Math.abs(c), sg = c < 0 ? '-' : (s ? '+' : ''), pw = d === 0 ? '' : d === 1 ? par(r) : par(r) + '^' + d;
      s += sg + (d === 0 ? String(ac) : (ac === 1 ? '' : ac + '*') + pw);
    }
    return s + '=' + evalP(cs, r);
  }
  function lin(r) { return r.p === 0 ? 'x' : (r.p > 0 ? 'x-' + ftxt(r) : 'x+' + ftxt(fneg(r))); }   /* x - r */
  function coef(a) { return a === 1 ? '' : a === -1 ? '-' : String(a); }
  function disc(a, b, c) { return b * b - 4 * a * c; }
  function dEtapes(a, b, c) { return 'Delta=b^2-4ac=' + par(b) + '^2-4*' + par(a) + '*' + par(c) + '=' + disc(a, b, c); }
  function rr(qs) { var q = pick(qs || [1, 1, 1, 2, 3]), p = nz(-6, 6); return fr(p, q); }      /* racine rationnelle non nulle */
  function distinctes() { var r1, r2; do { r1 = rr(); r2 = rr(); } while (fval(r1) === fval(r2)); return fval(r1) < fval(r2) ? [r1, r2] : [r2, r1]; }
  function uniques(t) { var o = {}; return t.every(function (x) { if (o[x]) return false; o[x] = 1; return true; }); }

  /* ensembles de solutions en mini-syntaxe */
  function ens(d) {
    if (d.t === 'R') return 'RR';
    if (d.t === 'vide') return 'vide';
    if (d.t === 'pt') return 'set(' + ftxt(d.x) + ')';
    if (d.t === 'Rmoins') return 'RR setminus set(' + ftxt(d.x) + ')';
    if (d.t === 'ext') return ']-inf;' + ftxt(d.r1) + (d.f ? ']' : '[') + ' cup ' + (d.f ? '[' : ']') + ftxt(d.r2) + ';+inf[';
    return (d.f ? '[' : ']') + ftxt(d.r1) + ';' + ftxt(d.r2) + (d.f ? ']' : '[');
  }
  function qcm(q, choix, bon, expl, source, extra) {
    var o = { type: 'qcm', q: q, choix: choix, rep: bon, expl: expl, source: source };
    for (var k in extra) o[k] = extra[k];
    return o;
  }

  /* ================= Chapitre 1 : équations et inéquations du 2nd degré ================= */

  /* trinôme de discriminant négatif, nul ou positif */
  function trinome(cas) {
    var a, b, c, r, n = 0;
    if (cas === 'zero') { a = nz(-3, 3); r = ri(-4, 4); return { a: a, b: -2 * a * r, c: a * r * r }; }
    do { a = nz(-4, 4); b = ri(-6, 6); c = ri(-6, 6); n++; }
    while (n < 500 && (cas === 'neg' ? disc(a, b, c) >= 0 : disc(a, b, c) <= 0));
    return { a: a, b: b, c: c };
  }

  G['maths-discriminant'] = function () {
    var t = trinome(pick(['neg', 'zero', 'pos', 'pos'])), d = disc(t.a, t.b, t.c);
    return {
      type: 'saisie', nombre: true,
      q: 'Calculer le discriminant de l\'équation ' + m(pol([t.a, t.b, t.c]) + '=0') + '.',
      rep: [d], expl: m(dEtapes(t.a, t.b, t.c)) + '.', source: 'Discriminant', _abc: [t.a, t.b, t.c]
    };
  };

  G['maths-nb-solutions'] = function () {
    var t = trinome(pick(['neg', 'zero', 'pos'])), d = disc(t.a, t.b, t.c), bonne = d < 0 ? 0 : d === 0 ? 1 : 2;
    var concl = d < 0 ? 'Comme ' + m('Delta<0') + ', l\'équation n\'a aucune solution réelle.'
      : d === 0 ? 'Comme ' + m('Delta=0') + ', l\'équation a une solution double.' : 'Comme ' + m('Delta>0') + ', l\'équation a deux solutions distinctes.';
    return qcm('Combien de solutions réelles a l\'équation ' + m(pol([t.a, t.b, t.c]) + '=0') + ' ?',
      ['Aucune', 'Une seule', 'Deux'], bonne, m(dEtapes(t.a, t.b, t.c)) + '. ' + concl, 'Discriminant', { ordre: 'fixe', _abc: [t.a, t.b, t.c] });
  };

  G['maths-resoudre'] = function () {
    var rs = distinctes(), k = nz(-3, 3), cs = polyRacines(rs, k), a = cs[0], b = cs[1], c = cs[2];
    var plus = Math.random() < 0.5, x = plus ? rs[1] : rs[0];
    return {
      type: 'saisie', nombre: true, tol: 1e-9,
      q: 'Résoudre ' + m(pol(cs) + '=0') + '. Quelle est la ' + (plus ? 'plus grande' : 'plus petite') + ' solution ? (fraction acceptée)',
      rep: [fval(x)], aff: fatt(x),
      expl: m(dEtapes(a, b, c)) + '. Les solutions sont ' + m('x_1=' + ftxt(rs[0])) + ' et ' + m('x_2=' + ftxt(rs[1])) + '.',
      source: 'Discriminant', _poly: cs, _rep: fval(x), _plus: plus
    };
  };

  /* --- forme canonique --- */
  function canonTxt(a, al, be) {
    var s = coef(a) + (al.p === 0 ? 'x^2' : '(' + lin(al) + ')^2');
    if (be.p !== 0) s += (be.p > 0 ? '+' : '-') + ftxt({ p: Math.abs(be.p), q: be.q });
    return s;
  }
  G['maths-forme-canonique'] = function () {
    var a = pick([1, 2, 3, -1, -2, 4, -3]), b = ri(-8, 8), c = ri(-6, 6);
    var al = fr(-b, 2 * a), be = fr(4 * a * c - b * b, 4 * a), f = pol([a, b, c]);
    var type = pick(['alpha', 'beta', 'forme', 'forme']);
    var calc = m('alpha=-frac(b,2a)=-frac(' + par(b) + ',2*' + par(a) + ')=' + ftxt(al)) + ' et ' + m('beta=-frac(Delta,4a)=' + ftxt(be)) + '.';
    if (type === 'alpha') return {
      type: 'saisie', nombre: true, tol: 1e-9, q: 'La forme canonique de ' + m(f) + ' s\'écrit ' + m('a(x-alpha)^2+beta') + '. Que vaut ' + m('alpha') + ' ? (fraction acceptée)',
      rep: [fval(al)], aff: fatt(al), expl: calc, source: 'Les nombres alpha et beta', _abc: [a, b, c], _al: fval(al)
    };
    if (type === 'beta') return {
      type: 'saisie', nombre: true, tol: 1e-9, q: 'La forme canonique de ' + m(f) + ' s\'écrit ' + m('a(x-alpha)^2+beta') + '. Que vaut ' + m('beta') + ' ? (fraction acceptée)',
      rep: [fval(be)], aff: fatt(be), expl: calc, source: 'Les nombres alpha et beta', _abc: [a, b, c], _be: fval(be)
    };
    var bon = canonTxt(a, al, be);
    var d1 = canonTxt(a, fneg(al), be), d2 = canonTxt(a, al, fneg(be));
    var d3 = canonTxt(a, al, fr(c * al.q * al.q - al.p * al.p, al.q * al.q));       /* oubli du facteur a dans le calcul de beta : beta = c - alpha^2 */
    if (a === 1 || !uniques([bon, d1, d2, d3])) d3 = canonTxt(a, fr(-b, a), be);   /* confusion alpha = -b/a */
    var ch = [bon, d1, d2, d3];
    if (!uniques(ch) || al.p === 0 || be.p === 0) return G['maths-forme-canonique']();
    var o = qcm('Quelle est la forme canonique de ' + m(f) + ' ?', ch.map(m), 0, calc, 'Forme canonique', { _abc: [a, b, c], _canon: [fval(al), fval(be)] });
    return o;
  };

  /* --- racine évidente --- */
  G['maths-racine-evidente'] = function () {
    var r = pick([-2, -1, 0, 1, 2]), s = pick([fr(3, 1), fr(4, 1), fr(5, 1), fr(-3, 1), fr(-4, 1), fr(-5, 1), fr(1, 2), fr(-1, 2), fr(3, 2), fr(-3, 2)]);
    var cs = polyRacines([fr(r, 1), s], nz(-3, 3));
    var cand = [-2, -1, 0, 1, 2].filter(function (x) { return x !== r; });
    cand.splice(ri(0, 3), 1);
    var ch = cand.concat([r]).sort(function (x, y) { return x - y; });
    return qcm('Parmi ces nombres, lequel est une racine évidente de ' + m('f(x)=' + pol(cs)) + ' ?', ch.map(String), ch.indexOf(r),
      m('f(' + r + ')=' + evalTxt(cs, r)) + ', donc ' + r + ' est une racine de ' + m('f') + '.', 'Racine d\'un trinôme',
      { ordre: 'fixe', _poly: cs, _cand: ch, _rep: r });
  };
  G['maths-racine-evidente-cubique'] = function () {
    var r = pick([-2, -1, 0, 1, 2]), s1 = pick([3, 4, 5, -3, -4, -5, 6]), s2 = pick([-3, -4, -5, 2.5, 3.5, 1.5]);
    var rs = [fr(r, 1), fr(s1, 1), s2 === 2.5 ? fr(5, 2) : s2 === 3.5 ? fr(7, 2) : s2 === 1.5 ? fr(3, 2) : fr(s2, 1)];
    var cs = polyRacines(rs, pick([1, 1, 2, -1]));
    var cand = [-2, -1, 0, 1, 2].filter(function (x) { return x !== r; });
    cand.splice(ri(0, 3), 1);
    var ch = cand.concat([r]).sort(function (x, y) { return x - y; });
    return qcm('Parmi ces nombres, lequel est une racine évidente de ' + m('P(x)=' + pol(cs)) + ' ?', ch.map(String), ch.indexOf(r),
      m('P(' + r + ')=' + evalTxt(cs, r)) + ', donc ' + r + ' est une racine évidente de ' + m('P') + '.', 'Polynôme de degré 3',
      { ordre: 'fixe', _poly: cs, _cand: ch, _rep: r });
  };
  G['maths-evaluer-polynome'] = function () {
    var k = pick([-2, -1, 0, 1, 2]), cs;
    if (Math.random() < 0.4) cs = polyRacines([fr(k, 1), fr(pick([3, 4, -3, -4, 5]), 1), fr(pick([-5, 2, 6, -6, 7]), 1)], pick([1, 2, -1]));
    else cs = [nz(-3, 3), ri(-6, 6), ri(-6, 6), ri(-6, 6)];
    var v = evalP(cs, k);
    return {
      type: 'saisie', nombre: true, q: 'Soit ' + m('P(x)=' + pol(cs)) + '. Calculer ' + m('P(' + k + ')') + '.', rep: [v],
      expl: m('P(' + k + ')=' + evalTxt(cs, k)) + '.' + (v === 0 ? ' Comme ' + m('P(' + k + ')=0') + ', ' + k + ' est une racine évidente.' : ''),
      source: 'Polynôme de degré 3', _poly: cs, _k: k
    };
  };
  G['maths-identification-cubique'] = function () {
    var r = pick([-2, -1, 1, 2, 3]), a = pick([1, 2, 3, -1, -2]), b = ri(-5, 5), c = nz(-5, 5);
    var cs = [a, b - a * r, c - b * r, -c * r], quoi = pick(['a', 'b', 'c']);
    var lr = lin(fr(r, 1)), val = quoi === 'a' ? a : quoi === 'b' ? b : c;
    var ex = m('P(x)=' + pol(cs) + '=(' + lr + ')(ax^2+bx+c)=ax^3+(b-' + par(r) + 'a)x^2+(c-' + par(r) + 'b)x-' + par(r) + 'c') +
      '. Par identification : ' + m('a=' + a) + ', ' + m('b-' + par(r) + '*' + par(a) + '=' + cs[1]) + ' donc ' + m('b=' + b) + ', ' +
      m('c-' + par(r) + '*' + par(b) + '=' + cs[2]) + ' donc ' + m('c=' + c) + '.';
    return {
      type: 'saisie', nombre: true,
      q: m('P(x)=' + pol(cs)) + ' admet ' + r + ' pour racine évidente et ' + m('P(x)=(' + lr + ')(ax^2+bx+c)') + '. Par identification, que vaut ' + m(quoi) + ' ?',
      rep: [val], expl: ex, source: 'Polynôme de degré 3', _poly: cs, _r: r, _quoi: quoi, _val: val
    };
  };

  /* --- factorisation --- */
  function factTxt(a, r1, r2) {
    if (fval(r1) === fval(r2)) return coef(a) + '(' + lin(r1) + ')^2';
    return coef(a) + '(' + lin(r1) + ')(' + lin(r2) + ')';
  }
  G['maths-factorisation'] = function () {
    var double = Math.random() < 0.25, rs = double ? (function () { var r = rr(); return [r, r]; })() : distinctes();
    var k = pick([1, 1, 2, -1, 3]), cs = polyRacines(rs, k), a = cs[0];
    var cle = function (aa, x, y) { return aa + '|' + [fval(x), fval(y)].sort(function (u, v) { return u - v; }).join(','); };
    var bon = factTxt(a, rs[0], rs[1]), vus = {};
    vus[cle(a, rs[0], rs[1])] = 1;
    var cands = [[a === 1 ? 2 : 1, rs[0], rs[1], factTxt(a === 1 ? 2 : 1, rs[0], rs[1])],                          /* facteur a oublié */
      [a, fneg(rs[0]), fneg(rs[1]), factTxt(a, fneg(rs[0]), fneg(rs[1]))],                                         /* signes des racines inversés */
      [-a, rs[0], rs[1], factTxt(-a, rs[0], rs[1])],                                                              /* signe de a inversé */
      [a, rs[0], fneg(rs[1]), double ? coef(a) + '(' + lin(rs[0]) + ')' : factTxt(a, rs[0], fneg(rs[1]))]];      /* une seule racine / un signe faux */
    var ch = [bon];
    shuffle(cands).forEach(function (c) {
      var kk = double && c[3].indexOf(')^2') < 0 ? 'simple' : cle(c[0], c[1], c[2]);
      if (ch.length < 4 && !vus[kk] && ch.indexOf(c[3]) < 0) { vus[kk] = 1; ch.push(c[3]); }
    });
    if (ch.length < 4) return G['maths-factorisation']();
    var ex = m(dEtapes(a, cs[1], cs[2])) + (double ? '. Racine double ' + m('x_0=' + ftxt(rs[0])) + ', donc ' + m('f(x)=' + bon) + '.'
      : '. Les racines sont ' + m(ftxt(rs[0])) + ' et ' + m(ftxt(rs[1])) + ', donc ' + m('f(x)=' + bon) + ' (le facteur ' + m('a') + ' ne s\'oublie pas).');
    return qcm('Quelle est la forme factorisée de ' + m('f(x)=' + pol(cs)) + ' ?', ch.map(m), 0, ex, 'Racines et factorisation', { _poly: cs, _fact: [fval(rs[0]), fval(rs[1])] });
  };

  /* --- signe du trinôme et inéquations --- */
  G['maths-signe-trinome'] = function () {
    var cas = pick(['pos', 'pos', 'zero', 'neg']), sym = pick(['>', '>=', '<', '<=']);
    var strict = sym === '>' || sym === '<', positif = sym === '>' || sym === '>=', a, b, c, cs, d, ch, bon, txtD, regle;
    if (cas === 'pos') {
      var rs = distinctes(), k = pick([1, 1, 2, -1, -2, 3, -3]);
      cs = polyRacines(rs, k); a = cs[0]; b = cs[1]; c = cs[2];
      var ext = (a > 0) === positif, f = !strict;
      d = ext ? { t: 'ext', r1: rs[0], r2: rs[1], f: f } : { t: 'int', r1: rs[0], r2: rs[1], f: f };
      var d1 = { t: ext ? 'int' : 'ext', r1: rs[0], r2: rs[1], f: f }, d2 = { t: d.t, r1: rs[0], r2: rs[1], f: !f }, d3 = { t: d1.t, r1: rs[0], r2: rs[1], f: !f };
      ch = [d, d1, d2, d3];
      regle = 'Les racines sont ' + m(ftxt(rs[0])) + ' et ' + m(ftxt(rs[1])) + ' et ' + m('a=' + a) + ' est ' + (a > 0 ? 'positif' : 'négatif') +
        ' : le trinôme est du signe de ' + m('a') + ' à l\'extérieur des racines et du signe de ' + m('-a') + ' entre elles. Crochets ' + (f ? 'fermés' : 'ouverts') + ' pour ' + (f ? 'une inégalité large' : 'une inégalité stricte') + '.';
    } else if (cas === 'zero') {
      var x0 = rr(), kk = pick([1, 2, -1, -2, 3]);
      cs = polyRacines([x0, x0], kk); a = cs[0]; b = cs[1]; c = cs[2];
      var meme = (a > 0) === positif;
      d = meme ? (strict ? { t: 'Rmoins', x: x0 } : { t: 'R' }) : (strict ? { t: 'vide' } : { t: 'pt', x: x0 });
      ch = [{ t: 'R' }, { t: 'vide' }, { t: 'Rmoins', x: x0 }, { t: 'pt', x: x0 }];
      regle = m('Delta=0') + ' : le trinôme s\'annule seulement en ' + m('x_0=' + ftxt(x0)) + ' et garde le signe de ' + m('a=' + a) + ' ailleurs.';
    } else {
      var t = trinome('neg'); a = t.a; b = t.b; c = t.c; cs = [a, b, c];
      var al = fr(-b, 2 * a), meme2 = (a > 0) === positif;
      d = meme2 ? { t: 'R' } : { t: 'vide' };
      ch = [{ t: 'R' }, { t: 'vide' }, { t: 'Rmoins', x: al }, { t: 'pt', x: al }];
      regle = 'Comme ' + m('Delta<0') + ', le trinôme garde le signe de ' + m('a=' + a) + ' sur ' + m('RR') + '.';
    }
    var txt = ch.map(ens), bonTxt = ens(d), uniq = [];
    txt.forEach(function (s) { if (uniq.indexOf(s) < 0) uniq.push(s); });
    if (uniq.length !== 4) return G['maths-signe-trinome']();
    var idx = uniq.indexOf(bonTxt);
    return qcm('Résoudre dans ' + m('RR') + ' l\'inéquation ' + m(pol(cs) + sym + '0') + '.', uniq.map(m), idx,
      m(dEtapes(a, b, c)) + '. ' + regle, 'Signe et inéquations', { _poly: cs, _sym: sym, _set: bonTxt, _all: uniq });
  };

  /* --- somme et produit des racines --- */
  G['maths-somme-produit'] = function () {
    var a, b, c, n = 0;
    do { a = pick([1, 2, 3, -1, -2, 4]); b = ri(-8, 8); c = ri(-6, 6); n++; } while (n < 300 && disc(a, b, c) <= 0);
    var S = fr(-b, a), P = fr(c, a), quoi = Math.random() < 0.5 ? 'S' : 'P', x = quoi === 'S' ? S : P;
    return {
      type: 'saisie', nombre: true, tol: 1e-9,
      q: 'Sans calculer les racines de ' + m(pol([a, b, c]) + '=0') + ', donner ' + (quoi === 'S' ? 'leur somme' : 'leur produit') + '. (fraction acceptée)',
      rep: [fval(x)], aff: fatt(x),
      expl: m(dEtapes(a, b, c)) + ', les racines existent. ' + (quoi === 'S' ? m('S=-frac(b,a)=-frac(' + par(b) + ',' + par(a) + ')=' + ftxt(S)) : m('P=frac(c,a)=frac(' + par(c) + ',' + par(a) + ')=' + ftxt(P))) + '.',
      source: quoi === 'S' ? 'Somme des racines' : 'Produit des racines', _abc: [a, b, c], _quoi: quoi
    };
  };
  G['maths-somme-produit-equation'] = function () {
    var S = ri(-9, 9), P = ri(-9, 9), sg = function (n, first) { return (n < 0 ? '-' : (first ? '' : '+')) + Math.abs(n); };
    var f = function (s, p) { return 'x^2' + (s ? (s > 0 ? '+' : '-') + (Math.abs(s) === 1 ? '' : Math.abs(s)) + 'x' : '') + (p ? (p > 0 ? '+' : '-') + Math.abs(p) : '') + '=0'; };
    if (!S || !P || S * S - 4 * P < 0) return G['maths-somme-produit-equation']();    /* les deux réels doivent exister */
    var ch = [f(-S, P), f(S, P), f(-S, -P), f(S, -P)];
    if (!uniques(ch)) return G['maths-somme-produit-equation']();
    return qcm('Deux réels ont pour somme ' + m(S) + ' et pour produit ' + m(P) + '. De quelle équation sont-ils les solutions ?', ch.map(m), 0,
      'Deux réels de somme ' + m('S') + ' et de produit ' + m('P') + ' sont les solutions de ' + m('x^2-Sx+P=0') + ' : ici ' + m(ch[0]) + '.', 'Deux nombres connus', { _S: S, _P: P, _all: ch });
  };
  G['maths-somme-produit-nombres'] = function () {
    var u, v;
    do { u = ri(-7, 7); v = ri(-7, 7); } while (u === v || u === 0 || v === 0);
    var S = u + v, P = u * v, plus = Math.random() < 0.5, x = plus ? Math.max(u, v) : Math.min(u, v);
    return {
      type: 'saisie', nombre: true, q: 'Deux réels distincts ont pour somme ' + m(S) + ' et pour produit ' + m(P) + '. Quel est le ' + (plus ? 'plus grand' : 'plus petit') + ' des deux ?',
      rep: [x], expl: 'Ils sont solutions de ' + m('x^2-' + par(S) + 'x+' + par(P) + '=0') + ', soit ' + m('x^2' + (S ? (-S > 0 ? '+' : '-') + (Math.abs(S) === 1 ? '' : Math.abs(S)) + 'x' : '') + (P > 0 ? '+' : '-') + Math.abs(P) + '=0') +
        ' ; les solutions sont ' + m(Math.min(u, v)) + ' et ' + m(Math.max(u, v)) + '.', source: 'Deux nombres connus', _S: S, _P: P, _rep: x, _plus: plus
    };
  };
  G['maths-racine-evidente-autre'] = function () {
    var r = pick([-2, -1, 1, 2]), s = pick([fr(3, 1), fr(-3, 1), fr(4, 1), fr(-4, 1), fr(1, 2), fr(-1, 2), fr(3, 2), fr(-3, 2), fr(5, 2)]);
    var cs = polyRacines([fr(r, 1), s], pick([1, 1, 2, -1])), a = cs[0], b = cs[1], c = cs[2], P = fr(c, a);
    var autre = fr(P.p, P.q * r);
    return {
      type: 'saisie', nombre: true, tol: 1e-9,
      q: m(r) + ' est une racine évidente de ' + m(pol(cs) + '=0') + '. En utilisant le produit des racines, trouver l\'autre racine. (fraction acceptée)',
      rep: [fval(autre)], aff: fatt(autre),
      expl: m('P=frac(c,a)=frac(' + par(c) + ',' + par(a) + ')=' + ftxt(P)) + ' et ' + m('P=' + par(r) + '*x_2') + ' donc ' + m('x_2=' + ftxt(autre)) + '.',
      source: 'Racine évidente', _poly: cs, _r: r, _rep: fval(autre)
    };
  };

  /* --- changement de variable : équation bicarrée --- */
  G['maths-bicarree'] = function () {
    var X1 = ri(-4, 4), X2 = ri(-4, 4), k = pick([1, 1, 2, -1]);
    var b = -k * (X1 + X2), c = k * X1 * X2, cs = [k, 0, b, 0, c];
    var vus = {}, n = 0;
    [X1, X2].forEach(function (X) { if (!vus[X]) { vus[X] = 1; n += X > 0 ? 2 : X === 0 ? 1 : 0; } });
    var det = Object.keys(vus).map(Number).sort(function (x, y) { return x - y; }).map(function (X) {
      return m('X=' + X) + (X > 0 ? ' donne deux solutions ' + m('x=pm sqrt(' + X + ')') : X === 0 ? ' donne une solution ' + m('x=0') : ' ne donne rien (un carré est positif)');
    }).join(' ; ');
    return qcm('Combien de solutions réelles a l\'équation ' + m(pol(cs) + '=0') + ' ?', ['0', '1', '2', '3', '4'], n,
      'On pose ' + m('X=x^2') + ' : ' + m(pol([k, b, c]).replace(/x/g, 'X') + '=0') + ' a pour solutions ' + m('X=' + X1) + (X1 === X2 ? '' : ' et ' + m('X=' + X2)) + '. Seules les valeurs ' + m('X>=0') + ' conviennent : ' + det + '.',
      'Équation bicarrée', { ordre: 'fixe', _poly: cs, _n: n });
  };

  /* --- équation paramétrique --- */
  G['maths-parametre'] = function () {
    if (Math.random() < 0.5) {
      var b = pick([1, 2, 3, 4, 5, 6, -2, -3, -4]), K = fr(b * b, 4), kt = ftxt(K), v = pick(['distinctes', 'double', 'aucune']);
      var opts = { '<': 'm<' + kt, '>': 'm>' + kt, '<=': 'm<=' + kt, '>=': 'm>=' + kt, '=': 'm=' + kt };
      var bonne = v === 'distinctes' ? '<' : v === 'aucune' ? '>' : '=';
      var autres = v === 'double' ? ['<', '>', '<=', '>='] : [bonne === '<' ? '>' : '<', bonne === '<' ? '<=' : '>=', '=', bonne === '<' ? '>=' : '<='];
      var ch = [bonne].concat(shuffle(autres).slice(0, 3)).map(function (s) { return opts[s]; });
      var quoi = v === 'distinctes' ? 'deux solutions distinctes' : v === 'double' ? 'une solution double' : 'aucune solution';
      var D = 'Delta=' + b + '^2-4m=' + (b * b) + '-4m';
      return qcm('Pour quelles valeurs de ' + m('m') + ' l\'équation ' + m('x^2' + (b > 0 ? '+' : '-') + (Math.abs(b) === 1 ? '' : Math.abs(b)) + 'x+m=0') + ' a-t-elle ' + quoi + ' ?', ch.map(m), 0,
        m(D) + '. ' + (v === 'distinctes' ? m('Delta>0') + ' équivaut à ' + m('4m<' + b * b) : v === 'double' ? m('Delta=0') + ' équivaut à ' + m('4m=' + b * b) : m('Delta<0') + ' équivaut à ' + m('4m>' + b * b)) +
        ', soit ' + m(ch[0]) + '.', 'Équation paramétrique', { _b: b, _v: v, _all: ch });
    }
    var kk = pick([1, 2, 3, 4, 5]), t = pick(['distinctes', 'aucune', 'double']);
    var ext = { t: 'ext', r1: fr(-2 * kk, 1), r2: fr(2 * kk, 1), f: false }, int_ = { t: 'int', r1: fr(-2 * kk, 1), r2: fr(2 * kk, 1), f: false };
    var dpt = 'set(' + (-2 * kk) + ';' + (2 * kk) + ')';
    var all = [ens(ext), ens(int_), ens({ t: 'ext', r1: ext.r1, r2: ext.r2, f: true }), dpt];
    var bonTxt = t === 'distinctes' ? all[0] : t === 'aucune' ? all[1] : all[3];
    var quoi2 = t === 'distinctes' ? 'deux solutions distinctes' : t === 'aucune' ? 'aucune solution' : 'une solution double';
    return qcm('Pour quelles valeurs de ' + m('m') + ' l\'équation ' + m('x^2+mx+' + kk * kk + '=0') + ' a-t-elle ' + quoi2 + ' ?', all.map(m), all.indexOf(bonTxt),
      m('Delta=m^2-4*' + kk * kk + '=m^2-' + 4 * kk * kk + '=(m-' + 2 * kk + ')(m+' + 2 * kk + ')') + ', qui est positif en dehors de ' + m('-' + 2 * kk) + ' et ' + m(2 * kk) + ', négatif entre eux, nul en ces deux valeurs.',
      'Équation paramétrique', { _k: kk, _t: t, _all: all, _bon: bonTxt });
  };

  /* --- quotient : valeurs interdites --- */
  G['maths-valeurs-interdites'] = function () {
    var rs = distinctes(), cs = polyRacines(rs, pick([1, 1, 2, -1])), nb = nz(-6, 6), na = nz(1, 3);
    var num = pol([na, nb]), rn = fr(-nb, na);
    var ens2 = function (l) { return 'set(' + l.map(ftxt).join(';') + ')'; };
    var cle = function (l) { return l.map(fval).sort(function (u, v) { return u - v; }).join(','); };
    if (fval(rn) === fval(rs[0]) || fval(rn) === fval(rs[1])) return G['maths-valeurs-interdites']();
    var bon = [rs[0], rs[1]], vus = {};
    vus[cle(bon)] = 1;
    var ch = [ens2(bon), ens2([rs[0], rs[1], rn])], cands = [[rn, rs[1]], [fneg(rs[0]), fneg(rs[1])], [rn, rs[0]], [rn]];
    vus[cle([rs[0], rs[1], rn])] = 1;
    shuffle(cands).forEach(function (l) { if (ch.length < 4 && !vus[cle(l)]) { vus[cle(l)] = 1; ch.push(ens2(l)); } });
    if (ch.length < 4) return G['maths-valeurs-interdites']();
    return qcm('Pour quelles valeurs de ' + m('x') + ' l\'expression ' + m('frac(' + num + ',' + pol(cs) + ')') + ' n\'est-elle pas définie ?', ch.map(m), 0,
      'Les valeurs qui annulent le dénominateur sont exclues : on résout ' + m(pol(cs) + '=0') + ' (' + m(dEtapes(cs[0], cs[1], cs[2])) + ') ; les solutions sont ' + m(ftxt(rs[0])) + ' et ' + m(ftxt(rs[1])) + '.',
      'Avec un quotient', { _den: cs, _bon: ch[0], _all: ch });
  };

  /* ================= Chapitre 2 : suites numériques ================= */
  function fcoefTxt(c) { return c === 1 ? '' : c === -1 ? '-' : String(c); }
  function lineaire(p, s) { return fcoefTxt(p) + 'n' + (s ? (s > 0 ? '+' : '-') + Math.abs(s) : ''); }

  G['maths-suite-terme'] = function () {
    var forme = pick(['explicite', 'quadratique', 'fraction', 'recurrence', 'recurrence', 'recurrence-demi']);
    if (forme === 'explicite') {
      var p = nz(-5, 5), s = ri(-6, 6), k = ri(2, 9);
      return {
        type: 'saisie', nombre: true, q: 'La suite ' + m('(u_n)') + ' est définie par ' + m('u_n=' + lineaire(p, s)) + '. Calculer ' + m('u_' + k) + '.', rep: [p * k + s],
        expl: m('u_' + k + '=' + (p === 1 ? '' : p === -1 ? '-' : par(p) + '*') + k + (s ? (s > 0 ? '+' : '-') + Math.abs(s) : '') + '=' + (p * k + s)) + '.',
        source: 'Définie explicitement', _chk: { forme: forme, p: p, s: s, k: k }
      };
    }
    if (forme === 'quadratique') {
      var b = ri(-5, 5), c = ri(-5, 5), k2 = ri(2, 6), v = k2 * k2 + b * k2 + c;
      return {
        type: 'saisie', nombre: true, q: 'La suite ' + m('(u_n)') + ' est définie par ' + m('u_n=' + pol([1, b, c]).replace(/x/g, 'n')) + '. Calculer ' + m('u_' + k2) + '.', rep: [v],
        expl: m('u_' + k2 + '=' + k2 + '^2' + (b ? (b > 0 ? '+' : '-') + Math.abs(b) + '*' + k2 : '') + (c ? (c > 0 ? '+' : '-') + Math.abs(c) : '') + '=' + v) + '.',
        source: 'Définie explicitement', _chk: { forme: forme, b: b, c: c, k: k2 }
      };
    }
    if (forme === 'fraction') {
      var a = ri(-4, 6), b3 = ri(-4, 4), k3 = ri(0, 6), val = fr(a * k3 + b3, k3 + 1);
      var num = pol([a, b3]).replace(/x/g, 'n');
      return {
        type: 'saisie', nombre: true, tol: 1e-9, q: 'La suite ' + m('(u_n)') + ' est définie sur ' + m('NN') + ' par ' + m('u_n=frac(' + num + ',n+1)') + '. Calculer ' + m('u_' + k3) + '. (fraction acceptée)',
        rep: [fval(val)], aff: fatt(val), expl: m('u_' + k3 + '=frac(' + a + '*' + k3 + (b3 ? (b3 > 0 ? '+' : '-') + Math.abs(b3) : '') + ',' + k3 + '+1)=frac(' + (a * k3 + b3) + ',' + (k3 + 1) + ')=' + ftxt(val)) + '.',
        source: 'Définie explicitement', _chk: { forme: forme, a: a, b: b3, k: k3 }
      };
    }
    if (forme === 'recurrence') {
      var u0 = ri(-3, 5), mm = nz(-3, 3), c2 = ri(-4, 4), n = ri(2, 4), u = u0, etapes = m('u_0=' + u0);
      for (var i = 1; i <= n; i++) {
        u = mm * u + c2;
        etapes += ', ' + m('u_' + i + '=' + (mm === 1 ? '' : mm === -1 ? '-' : par(mm) + '*') + 'u_' + (i - 1) + (c2 ? (c2 > 0 ? '+' : '-') + Math.abs(c2) : '') + '=' + u);
      }
      return {
        type: 'saisie', nombre: true, q: 'La suite ' + m('(u_n)') + ' est définie par ' + m('u_0=' + u0) + ' et ' + m('u_{n+1}=' + fcoefTxt(mm) + 'u_n' + (c2 ? (c2 > 0 ? '+' : '-') + Math.abs(c2) : '')) + '. Calculer ' + m('u_' + n) + '.',
        rep: [u], expl: etapes + '.', source: 'Définie par récurrence', _chk: { forme: forme, u0: u0, m: mm, c: c2, n: n }
      };
    }
    var w0 = pick([8, 16, -8, 4, -4, 12]), cc = ri(-5, 5), nn = ri(2, 3);
    var wv = fr(w0, 1), ex2 = m('u_0=' + w0);
    for (var l = 1; l <= nn; l++) {
      wv = fr(wv.p + 2 * cc * wv.q, 2 * wv.q);
      ex2 += ', ' + m('u_' + l + '=frac(1,2)u_' + (l - 1) + (cc ? (cc > 0 ? '+' : '-') + Math.abs(cc) : '') + '=' + ftxt(wv));
    }
    return {
      type: 'saisie', nombre: true, tol: 1e-9, q: 'La suite ' + m('(u_n)') + ' est définie par ' + m('u_0=' + w0) + ' et ' + m('u_{n+1}=frac(1,2)u_n' + (cc ? (cc > 0 ? '+' : '-') + Math.abs(cc) : '')) + '. Calculer ' + m('u_' + nn) + '. (fraction acceptée)',
      rep: [fval(wv)], aff: fatt(wv), expl: ex2 + '.', source: 'Définie par récurrence', _chk: { forme: forme, u0: w0, c: cc, n: nn }
    };
  };

  G['maths-suite-point'] = function () {
    var p = nz(-4, 4), s = ri(-5, 5), k = ri(1, 7), v = p * k + s;
    var bon = '(' + k + ';' + v + ')', ch = [bon, '(' + v + ';' + k + ')', '(' + k + ';' + k + ')', '(' + v + ';' + v + ')'];
    if (!uniques(ch)) return G['maths-suite-point']();
    return qcm('La suite ' + m('(u_n)') + ' est définie par ' + m('u_n=' + lineaire(p, s)) + '. Quelles sont les coordonnées du point qui représente ' + m('u_' + k) + ' dans un repère ?', ch.map(m), 0,
      'Le point a pour coordonnées ' + m('(n;u_n)') + ' : l\'abscisse est le rang ' + m(k) + ', l\'ordonnée est ' + m('u_' + k + '=' + v) + '.', 'Nuage de points', { _p: p, _s: s, _k: k });
  };

  var NOMS_VAR = ['Croissante', 'Décroissante', 'Non monotone'];
  G['maths-suite-variation'] = function () {
    var forme = pick(['lineaire', 'quadratique', 'homographique', 'additive', 'multiplicative']), q, bon, ex, chk;
    if (forme === 'lineaire') {
      var p = nz(-5, 5), s = ri(-6, 6);
      bon = p > 0 ? 0 : 1; chk = { forme: forme, p: p, s: s };
      q = 'Quel est le sens de variation de la suite définie par ' + m('u_n=' + lineaire(p, s)) + ' ?';
      ex = m('u_{n+1}-u_n=(' + lineaire(p, s).replace(/n/g, '(n+1)') + ')-(' + lineaire(p, s) + ')=' + p) + (p > 0 ? ', positif : la suite est croissante.' : ', négatif : la suite est décroissante.');
    } else if (forme === 'quadratique') {
      var b = ri(-6, 6), c = ri(-4, 4);
      bon = b >= -1 ? 0 : 2; chk = { forme: forme, b: b, c: c };
      q = 'Quel est le sens de variation de la suite définie sur ' + m('NN') + ' par ' + m('u_n=' + pol([1, b, c]).replace(/x/g, 'n')) + ' ?';
      ex = m('u_{n+1}-u_n=2n+1' + (b ? (b > 0 ? '+' : '-') + Math.abs(b) : '') + '=2n' + ((1 + b) ? ((1 + b) > 0 ? '+' : '-') + Math.abs(1 + b) : '')) + '. ' +
        (b >= -1 ? 'Pour tout ' + m('n>=0') + ' c\'est positif ou nul : la suite est croissante.' : 'Pour ' + m('n=0') + ' c\'est négatif et pour ' + m('n') + ' grand c\'est positif : la suite n\'est ni croissante ni décroissante.');
    } else if (forme === 'homographique') {
      var a = ri(-5, 6), b2 = ri(-5, 6);
      if (a === b2) return G['maths-suite-variation']();
      bon = a > b2 ? 0 : 1; chk = { forme: forme, a: a, b: b2 };
      q = 'Quel est le sens de variation de la suite définie sur ' + m('NN') + ' par ' + m('u_n=frac(' + pol([a, b2]).replace(/x/g, 'n') + ',n+1)') + ' ?';
      ex = m('u_{n+1}-u_n=frac(' + (a - b2) + ',(n+1)(n+2))') + ' : le dénominateur est positif, le signe est celui de ' + m(a - b2) + ' : la suite est ' + (a > b2 ? 'croissante.' : 'décroissante.');
    } else if (forme === 'additive') {
      var c3 = nz(-5, 5), u0 = ri(-5, 5);
      bon = c3 > 0 ? 0 : 1; chk = { forme: forme, c: c3, u0: u0 };
      q = 'Quel est le sens de variation de la suite définie par ' + m('u_0=' + u0) + ' et ' + m('u_{n+1}=u_n' + (c3 > 0 ? '+' : '-') + Math.abs(c3)) + ' ?';
      ex = m('u_{n+1}-u_n=' + c3) + (c3 > 0 ? ', positif : la suite est croissante.' : ', négatif : la suite est décroissante.');
    } else {
      var mm = pick([2, 3, fr(1, 2), fr(1, 3), -2]), u1 = nz(-5, 5), mv = typeof mm === 'number' ? mm : fval(mm);
      var mt = typeof mm === 'number' ? String(mm) : ftxt(mm);
      chk = { forme: forme, m: mv, u0: u1 };
      if (mv < 0) { bon = 2; ex = m('u_{n+1}=' + mt + 'u_n') + ' : les termes changent de signe à chaque rang, donc la suite n\'est ni croissante ni décroissante.'; }
      else {
        bon = ((mv - 1) * u1 > 0) ? 0 : 1;
        ex = m('u_{n+1}-u_n=(' + mt + '-1)u_n') + ' et les termes gardent le signe de ' + m('u_0=' + u1) + ' : ' + m('(' + mt + '-1)u_n') + ' est ' + (bon === 0 ? 'positif, la suite est croissante.' : 'négatif, la suite est décroissante.');
      }
      q = 'Quel est le sens de variation de la suite définie par ' + m('u_0=' + u1) + ' et ' + m('u_{n+1}=' + mt + 'u_n') + ' ?';
    }
    return qcm(q, NOMS_VAR, bon, ex, 'Méthode', { ordre: 'fixe', _chk: chk });
  };

  G['maths-suite-rang'] = function () {
    var j = ri(1, 6), b = -(2 * j + 1), c = ri(-4, 4);
    return {
      type: 'saisie', nombre: true,
      q: 'La suite ' + m('(u_n)') + ' est définie par ' + m('u_n=' + pol([1, b, c]).replace(/x/g, 'n')) + '. Elle est croissante à partir d\'un certain rang ' + m('n_0') + '. Quel est le plus petit rang ' + m('n_0') + ' possible ?',
      rep: [j], expl: m('u_{n+1}-u_n=2n+1' + b + '=2n-' + 2 * j + '=2(n-' + j + ')') + ', positif ou nul exactement pour ' + m('n>=' + j) + ' : ' + m('n_0=' + j) + '.',
      source: 'Croissante', _chk: { b: b, c: c, j: j }
    };
  };

  G['maths-suite-stationnaire'] = function () {
    var k = nz(-6, 6), u0 = m('u_0=' + k) + ' et ', bon = pick([m('u_n=' + k), u0 + m('u_{n+1}=u_n')]);
    var t = shuffle([bon, m('u_n=' + k + 'n'), u0 + m('u_{n+1}=u_n+1'), u0 + m('u_{n+1}=2u_n')]);
    return qcm('Laquelle de ces suites est stationnaire ?', t, t.indexOf(bon),
      'Une suite est stationnaire lorsque ' + m('u_{n+1}-u_n=0') + ' pour tout ' + m('n') + ' : ' + bon + ' est la seule dont tous les termes sont égaux.', 'Croissante', { _all: t, _bon: bon, _k: k });
  };

  /* ================= Questions de type DS : plusieurs étapes, pièges du cours ================= */
  function fadd(x, y) { return fr(x.p * y.q + y.p * x.q, x.q * y.q); }
  function fsub(x, y) { return fadd(x, fneg(y)); }
  function fmul(x, y) { return fr(x.p * y.p, x.q * y.q); }
  function fdiv(x, y) { return fr(x.p * y.q, x.q * y.p); }
  function trie(pts) { return pts.slice().sort(function (u, v) { return fval(u) - fval(v); }).filter(function (x, i, t) { return i === 0 || fval(x) !== fval(t[i - 1]); }); }

  /* Ensemble des solutions de f(x) > 0, >= 0, < 0 ou <= 0 d'après le signe de f entre ses points critiques.
     pts : points critiques triés (zéros et valeurs interdites) ; signeEn(x) : signe de f en x non critique ;
     nulEn(x) : f s'annule en x ; interditEn(x) : f n'est pas définie en x ;
     ignorerInterdits : variante FAUSSE qui range les valeurs interdites parmi les solutions (crochet fermé sur une valeur interdite). */
  function solveSigne(pts, signeEn, nulEn, interditEn, positif, strict, ignorerInterdits) {
    var xs = pts.map(fval), items = [], i, n = xs.length;
    for (i = 0; i <= n; i++) {
      var x = i === 0 ? xs[0] - 1 : i === n ? xs[n - 1] + 1 : (xs[i - 1] + xs[i]) / 2;
      items.push({ iv: true, k: i, inc: (signeEn(x) > 0) === positif });
      if (i < n) items.push({ iv: false, k: i, inc: !strict && ((nulEn(xs[i]) && !interditEn(xs[i])) || (ignorerInterdits && interditEn(xs[i]))) });
    }
    var parts = [], j = 0;
    if (items.every(function (it) { return it.inc; })) return 'RR';
    while (j < items.length) {
      if (!items[j].inc) { j++; continue; }
      var d = j, e = j;
      while (e + 1 < items.length && items[e + 1].inc) e++;
      if (d === e && !items[d].iv) parts.push('set(' + ftxt(pts[items[d].k]) + ')');
      else {
        var g = items[d], h = items[e];
        var gauche = g.iv ? (g.k === 0 ? ']-inf' : ']' + ftxt(pts[g.k - 1])) : '[' + ftxt(pts[g.k]);
        var droite = h.iv ? (h.k === n ? '+inf[' : ftxt(pts[h.k]) + '[') : ftxt(pts[h.k]) + ']';
        parts.push(gauche + ';' + droite);
      }
      j = e + 1;
    }
    return parts.length ? parts.join(' cup ') : 'vide';
  }
  function troisAutres(bon, essais) {          /* [bon] + trois ensembles différents de la bonne réponse, ou null */
    var ch = [bon];
    shuffle(essais).forEach(function (s) { if (ch.length < 4 && ch.indexOf(s) < 0) ch.push(s); });
    return ch.length === 4 ? ch : null;
  }

  /* équation paramétrique x^2 - 2(m+p)x + (q - m) = 0 : Delta = 4(m - r1)(m - r2) */
  function equationParam() {
    var r1, r2;
    do { r1 = ri(-6, 6); r2 = ri(-6, 6); } while ((r1 + r2) % 2 === 0 || r1 === r2);
    var p = (-(r1 + r2) - 1) / 2, q = p * p - r1 * r2;
    var lx = p === 0 ? '-2mx' : '-2(m' + (p > 0 ? '+' + p : p) + ')x';
    var eq = 'x^2' + lx + (q === 0 ? '-m' : (q > 0 ? '+' : '') + q + '-m') + '=0';
    return { r1: Math.min(r1, r2), r2: Math.max(r1, r2), p: p, q: q, eq: eq };
  }
  G['maths-discriminant-parametre'] = function () {
    var e = equationParam(), p = e.p, q = e.q;
    var bon = [4, 4 * (2 * p + 1), 4 * (p * p - q)], d1 = [1, 2 * p + 1, p * p - q], d2 = [4, 8 * p - 4, 4 * p * p + 4 * q], d3 = [2, 4 * p + 4, 2 * p * p - 4 * q];
    var txt = function (t) { return 'Delta=' + pol(t).replace(/x/g, 'm'); };
    var ch = [txt(bon), txt(d1), txt(d2), txt(d3)];
    if (!uniques(ch)) return G['maths-discriminant-parametre']();
    var b2 = p === 0 ? '(2m)' : '(2(m' + (p > 0 ? '+' : '') + p + '))';
    return qcm('Calculer le discriminant ' + m('Delta') + ' de l\'équation ' + m('(E_m):' + e.eq) + ' d\'inconnue ' + m('x') + '.', ch.map(m), 0,
      m('Delta=b^2-4ac=' + b2 + '^2-4(' + (q ? q + '-' : '-') + 'm)=' + txt(bon).slice(6)) + '. Le coefficient ' + m('b') + ' est ' + m(p === 0 ? '-2m' : '-2(m' + (p > 0 ? '+' : '') + p + ')') + ' et le terme constant est ' + m('c=' + (q ? q + '-' : '-') + 'm') + '.',
      'Équation paramétrique', { _eq: e, _all: ch });
  };
  G['maths-parametre-cours'] = function () {
    var e = equationParam(), t = pick(['distinctes', 'double', 'aucune']);
    var r1 = fr(e.r1, 1), r2 = fr(e.r2, 1);
    var all = [ens({ t: 'ext', r1: r1, r2: r2, f: false }), ens({ t: 'int', r1: r1, r2: r2, f: false }), ens({ t: 'ext', r1: r1, r2: r2, f: true }), 'set(' + e.r1 + ';' + e.r2 + ')'];
    var bon = t === 'distinctes' ? all[0] : t === 'aucune' ? all[1] : all[3];
    var quoi = t === 'distinctes' ? 'deux solutions distinctes' : t === 'aucune' ? 'aucune solution' : 'une solution double';
    return qcm('Pour quelles valeurs de ' + m('m') + ' l\'équation ' + m('(E_m):' + e.eq) + ' a-t-elle ' + quoi + ' ?', all.map(m), all.indexOf(bon),
      m('Delta=4(m-' + par(e.r1) + ')(m-' + par(e.r2) + ')') + ' : ' + m('Delta') + ' est positif à l\'extérieur de ses racines ' + m(e.r1) + ' et ' + m(e.r2) + ', négatif entre elles, nul en ces deux valeurs.',
      'Équation paramétrique', { _eq: e, _t: t, _all: all, _bon: bon });
  };

  /* expressions symétriques des racines, calculées avec la somme et le produit sans résoudre */
  G['maths-expressions-racines'] = function () {
    var a, b, c, n = 0;
    do { a = pick([1, 2, 3, -1, -2]); b = ri(-7, 7); c = nz(-6, 6); n++; } while (n < 300 && disc(a, b, c) <= 0);
    var S = fr(-b, a), P = fr(c, a), v = pick(['carres', 'inverses', 'ecart', 'mixte']), rep, ex, e;
    if (v === 'carres') { rep = fsub(fmul(S, S), fmul(fr(2, 1), P)); e = 'x_1^2+x_2^2'; ex = m('x_1^2+x_2^2=(x_1+x_2)^2-2x_1x_2=S^2-2P=' + ftxt(rep)); }
    else if (v === 'inverses') { rep = fdiv(S, P); e = 'frac(1,x_1)+frac(1,x_2)'; ex = m('frac(1,x_1)+frac(1,x_2)=frac(x_1+x_2,x_1x_2)=frac(S,P)=' + ftxt(rep)); }
    else if (v === 'ecart') { rep = fsub(fmul(S, S), fmul(fr(4, 1), P)); e = '(x_1-x_2)^2'; ex = m('(x_1-x_2)^2=(x_1+x_2)^2-4x_1x_2=S^2-4P=' + ftxt(rep)); }
    else { rep = fmul(S, P); e = 'x_1x_2(x_1+x_2)'; ex = m('x_1x_2(x_1+x_2)=PS=' + ftxt(rep)); }
    return {
      type: 'saisie', nombre: true, tol: 1e-9,
      q: m('x_1') + ' et ' + m('x_2') + ' sont les solutions de ' + m(pol([a, b, c]) + '=0') + '. Sans les calculer, déterminer ' + m(e) + '. (fraction acceptée)',
      rep: [fval(rep)], aff: fatt(rep), expl: m(dEtapes(a, b, c)) + ' : les racines existent, ' + m('S=' + ftxt(S)) + ' et ' + m('P=' + ftxt(P)) + '. ' + ex + '.',
      source: 'Somme des racines', _abc: [a, b, c], _v: v, _rep: fval(rep)
    };
  };

  /* inéquations avec un quotient, inéquations de degré 3 : tableau de signes */
  G['maths-inequation-quotient'] = function () {
    var rs = distinctes(), cs = polyRacines(rs, pick([1, 2, -1])), nb = nz(-6, 6), na = pick([1, 2, -1, -2]), rn = fr(-nb, na);
    if (fval(rn) === fval(rs[0]) || fval(rn) === fval(rs[1])) return G['maths-inequation-quotient']();
    var sym = pick(['>', '>=', '<', '<=']), strict = sym === '>' || sym === '<', positif = sym === '>' || sym === '>=';
    var pts = trie([rn, rs[0], rs[1]]), num = function (x) { return na * x + nb; }, den = function (x) { return evalP(cs, x); };
    var sg = function (x) { return Math.sign(num(x) * den(x)); }, nul = function (x) { return Math.abs(num(x)) < 1e-9; }, itd = function (x) { return Math.abs(den(x)) < 1e-9; };
    var S = function (pos, st, ig) { return solveSigne(pts, sg, nul, itd, pos, st, ig); };
    var ch = troisAutres(S(positif, strict, false), [S(!positif, strict, false), S(positif, !strict, false), S(!positif, !strict, false), S(positif, strict, true), S(positif, !strict, true)]);
    if (!ch) return G['maths-inequation-quotient']();
    return qcm('Résoudre dans ' + m('RR') + ' l\'inéquation ' + m('frac(' + pol([na, nb]) + ',' + pol(cs) + ')' + sym + '0') + '.', ch.map(m), 0,
      'Numérateur : racine ' + m(ftxt(rn)) + '. Dénominateur : ' + m(dEtapes(cs[0], cs[1], cs[2])) + ', racines ' + m(ftxt(rs[0])) + ' et ' + m(ftxt(rs[1])) + ', valeurs interdites (crochets ouverts). On étudie le signe du quotient dans un tableau de signes.',
      'Avec un quotient', { _num: [na, nb], _den: cs, _sym: sym, _all: ch });
  };
  G['maths-inequation-cubique'] = function () {
    var r = fr(pick([-2, -1, 1, 2]), 1), s = distinctes();
    if (fval(s[0]) === fval(r) || fval(s[1]) === fval(r)) return G['maths-inequation-cubique']();
    var cs = polyRacines([r, s[0], s[1]], pick([1, 1, 2, -1])), sym = pick(['>', '>=', '<', '<=']);
    var strict = sym === '>' || sym === '<', positif = sym === '>' || sym === '>=', pts = trie([r, s[0], s[1]]);
    var sg = function (x) { return Math.sign(evalP(cs, x)); }, nul = function (x) { return Math.abs(evalP(cs, x)) < 1e-9; }, itd = function () { return false; };
    var S = function (pos, st) { return solveSigne(pts, sg, nul, itd, pos, st, false); };
    var ch = troisAutres(S(positif, strict), [S(!positif, strict), S(positif, !strict), S(!positif, !strict)]);
    if (!ch) return G['maths-inequation-cubique']();
    return qcm('Résoudre dans ' + m('RR') + ' l\'inéquation ' + m('P(x)' + sym + '0') + ' avec ' + m('P(x)=' + pol(cs)) + '.', ch.map(m), 0,
      m('P(' + fval(r) + ')=' + evalTxt(cs, fval(r))) + ' : ' + m(fval(r)) + ' est racine évidente. On factorise ' + m('P(x)=' + coef(cs[0]) + '(' + lin(r) + ')(' + lin(s[0]) + ')(' + lin(s[1]) + ')') + ', puis on dresse le tableau de signes.',
      'Polynôme de degré 3', { _poly: cs, _sym: sym, _all: ch });
  };

  /* équation irrationnelle sqrt(x+a) = x-b ou b-x : racines parasites créées par le carré */
  G['maths-irrationnelle'] = function () {
    var forme = pick(['x-b', 'b-x']), s = pick([1, 3, 3, 5, 7]), T = (s * s - 1) / 4, a = ri(1, 9), b = T - a;
    var lo = b + (1 - s) / 2, hi = b + (1 + s) / 2, rhs = function (x) { return forme === 'x-b' ? x - b : b - x; };
    var rhsTxt = forme === 'x-b' ? (b === 0 ? 'x' : b > 0 ? 'x-' + b : 'x+' + (-b)) : (b === 0 ? '-x' : b > 0 ? b + '-x' : '-' + (-b) + '-x');
    var ok = function (x) { return rhs(x) >= 0; };                       /* x + a = rhs(x)^2 est vrai pour les deux racines */
    var vals = [lo, hi].filter(ok), set = function (l) { return 'set(' + l.join(';') + ')'; };
    var ch = troisAutres(set(vals), [set([lo]), set([hi]), set([lo, hi]), 'vide']);
    if (!ch) return G['maths-irrationnelle']();
    var det = [lo, hi].map(function (x) { return m('x=' + x) + ' : le second membre vaut ' + m(rhs(x)) + (ok(x) ? ', c\'est une solution' : ', négatif : fausse solution (une racine carrée est positive)'); }).join(' ; ');
    return qcm('Résoudre dans ' + m('RR') + ' l\'équation ' + m('sqrt(x+' + a + ')=' + rhsTxt) + '.', ch.map(m), 0,
      'On élève au carré : ' + m('x+' + a + '=(' + rhsTxt + ')^2') + ', soit ' + m(pol([1, -(2 * b + 1), b * b - a]) + '=0') + ' (' + m('Delta=' + s * s) + '), de solutions ' + m(lo) + ' et ' + m(hi) + '. Mais le carré peut créer de fausses solutions : il faut ' + m(rhsTxt + '>=0') + '. ' + det + '.',
      'Équation irrationnelle', { _a: a, _b: b, _forme: forme, _vals: vals, _all: ch });
  };

  /* nombre de racines d'un polynôme de degré 3 dont on connaît une racine évidente */
  function racines2f(a, b, c) { var d = disc(a, b, c); return d < 0 ? [] : d === 0 ? [-b / (2 * a)] : [(-b - Math.sqrt(d)) / (2 * a), (-b + Math.sqrt(d)) / (2 * a)]; }
  G['maths-polynome-nb-racines'] = function () {
    var r = pick([-2, -1, 0, 1, 2]), cas = pick(['pos', 'pos', 'zero', 'neg', 'confondue']), a = pick([1, 1, 2, -1]), q;
    if (cas === 'neg') q = trinome('neg');
    else if (cas === 'zero') { var x0 = pick([-4, -3, 3, 4, 5]); q = { a: a, b: -2 * a * x0, c: a * x0 * x0 }; }
    else if (cas === 'confondue') { var s = pick([-5, -4, -3, 3, 4, 5]); q = { a: a, b: -a * (r + s), c: a * r * s }; }
    else { var s1 = pick([-5, -4, -3, 3, 4, 5]), s2 = pick([-6, 6, 7, -7, 3, 4]); if (s1 === s2) return G['maths-polynome-nb-racines'](); q = { a: a, b: -a * (s1 + s2), c: a * s1 * s2 }; }
    var cs = mulPoly([1, -r], [q.a, q.b, q.c]);
    var rac = [r]; racines2f(q.a, q.b, q.c).forEach(function (x) { if (!rac.some(function (y) { return Math.abs(y - x) < 1e-9; })) rac.push(x); });
    var n = rac.length;
    return qcm('Combien de racines réelles distinctes a le polynôme ' + m('P(x)=' + pol(cs)) + ', sachant que ' + m(r) + ' est une racine évidente ?', ['1', '2', '3'], n - 1,
      m('P(' + r + ')=' + evalTxt(cs, r)) + '. On écrit ' + m('P(x)=(' + lin(fr(r, 1)) + ')(' + pol([q.a, q.b, q.c]) + ')') + ' ; le trinôme a ' + m(dEtapes(q.a, q.b, q.c)) +
      (cas === 'confondue' ? ' et l\'une de ses racines est ' + m(r) + ' : elle se confond avec la racine évidente.' : '.') + ' Au total ' + n + ' racine' + (n > 1 ? 's' : '') + ' distincte' + (n > 1 ? 's' : '') + '.',
      'Polynôme de degré 3', { ordre: 'fixe', _poly: cs, _n: n });
  };

  /* questions à plusieurs bonnes réponses */
  G['maths-multi-discriminant'] = function () {
    var quoi = pick(['distinctes', 'aucune']), cats = shuffle(['pos', 'pos', 'neg', 'neg', 'zero', pick(['pos', 'neg'])]).slice(0, 5), eqs = [], bonnes = [];
    cats.forEach(function (c) { var t = trinome(c); eqs.push({ t: [t.a, t.b, t.c], d: disc(t.a, t.b, t.c) }); });
    eqs.forEach(function (e, i) { if (quoi === 'distinctes' ? e.d > 0 : e.d < 0) bonnes.push(i); });
    var txt = eqs.map(function (e) { return m(pol(e.t) + '=0'); });
    if (bonnes.length < 2 || bonnes.length > 3 || !uniques(txt)) return G['maths-multi-discriminant']();
    return {
      type: 'multi', q: 'Quelles équations ont ' + (quoi === 'distinctes' ? 'deux solutions réelles distinctes' : 'aucune solution réelle') + ' ? (plusieurs réponses)', choix: txt, rep: bonnes,
      expl: eqs.map(function (e) { return m(pol(e.t) + ' : Delta=' + e.d); }).join(' ; ') + '. La condition est ' + (quoi === 'distinctes' ? m('Delta>0') : m('Delta<0')) + '.',
      source: 'Discriminant', _eqs: eqs.map(function (e) { return e.t; }), _quoi: quoi
    };
  };
  G['maths-multi-racines'] = function () {
    var rs = shuffle([-3, -2, -1, 0, 1, 2, 3]).slice(0, 3), k = pick([1, 1, 2, -1]);
    var cs = polyRacines(rs.map(function (x) { return fr(x, 1); }), k);
    var cand = shuffle([-3, -2, -1, 0, 1, 2, 3]).slice(0, 5).sort(function (x, y) { return x - y; }), bonnes = [];
    cand.forEach(function (x, i) { if (rs.indexOf(x) >= 0) bonnes.push(i); });
    if (bonnes.length < 2 || bonnes.length > 3) return G['maths-multi-racines']();
    return {
      type: 'multi', q: 'Quels nombres sont des racines de ' + m('P(x)=' + pol(cs)) + ' ? (plusieurs réponses)', choix: cand.map(String), rep: bonnes,
      expl: cand.map(function (x) { return m('P(' + par(x) + ')=' + evalP(cs, x)); }).join(' ; ') + '. Les racines sont les nombres pour lesquels ' + m('P') + ' s\'annule.', source: 'Polynôme de degré 3', _poly: cs, _cand: cand
    };
  };

  /* ================= Chapitre 2 (niveau DS) : variation, paramètre, nuage de points ================= */
  G['maths-suite-variation-diff'] = function () {
    var a = nz(-5, 6), b = ri(-5, 6), d = pick([1, 1, 2, 3]), N = a * d - b;
    if (N === 0) return G['maths-suite-variation-diff']();
    var den = '(n+' + d + ')(n+' + (d + 1) + ')', f = function (x) { return 'frac(' + x + ',' + den + ')'; };
    var autres = [-N, a - b, a * d + b, b - a].filter(function (x, i, t) { return x !== N && t.indexOf(x) === i; });
    if (autres.length < 3) return G['maths-suite-variation-diff']();
    var ch = [f(N)].concat(shuffle(autres).slice(0, 3).map(f)), un = pol([a, b]).replace(/x/g, 'n');
    return qcm('La suite ' + m('(u_n)') + ' est définie sur ' + m('NN') + ' par ' + m('u_n=frac(' + un + ',n+' + d + ')') + '. Que vaut ' + m('u_{n+1}-u_n') + ' ?', ch.map(m), 0,
      m('u_{n+1}-u_n=frac((' + a + '(n+1)' + (b >= 0 ? '+' : '') + b + ')(n+' + d + ')-(' + un + ')(n+' + (d + 1) + '),' + den + ')=' + f(N)) + '. Le dénominateur est positif : le signe est celui de ' + m(N) + ', la suite est ' + (N > 0 ? 'croissante.' : 'décroissante.'),
      'Méthode', { _a: a, _b: b, _d: d, _N: N, _all: ch });
  };
  var ETIQ = ['Croissante', 'Décroissante', 'Stationnaire', 'Non monotone'];
  G['maths-suite-recurrence-carre'] = function () {
    var u0 = pick([fr(2, 1), fr(3, 1), fr(4, 1), fr(5, 1), fr(9, 1), fr(1, 2), fr(1, 3), fr(1, 4), fr(2, 3), fr(3, 4), fr(3, 2), fr(4, 3), fr(5, 2), fr(5, 4)]), v = fval(u0);
    var racine = Math.random() < 0.45, haut = v > 1, bon = racine ? (haut ? 1 : 0) : (haut ? 0 : 1);
    var rec = racine ? 'u_{n+1}=sqrt(u_n)' : 'u_{n+1}=u_n^2', dif = racine ? 'sqrt(u_n)-u_n=sqrt(u_n)(1-sqrt(u_n))' : 'u_n^2-u_n=u_n(u_n-1)';
    var pourquoi = racine ? (haut ? 'les termes restent supérieurs à ' + m('1') + ', donc ' + m('sqrt(u_n)>1') + ' est faux et ' + m('1-sqrt(u_n)') + ' est négatif : la suite est décroissante.'
      : 'les termes restent compris entre ' + m('0') + ' et ' + m('1') + ', donc ' + m('1-sqrt(u_n)') + ' est positif : la suite est croissante.')
      : (haut ? 'les termes restent supérieurs à ' + m('1') + ', donc ' + m('u_n-1') + ' est positif : la suite est croissante.'
        : 'les termes restent compris entre ' + m('0') + ' et ' + m('1') + ', donc ' + m('u_n-1') + ' est négatif : la suite est décroissante.');
    return qcm('Quel est le sens de variation de la suite définie par ' + m('u_0=' + ftxt(u0)) + ' et ' + m(rec) + ' ?', ETIQ, bon,
      m('u_{n+1}-u_n=' + dif) + '. Comme ' + m('u_0=' + ftxt(u0)) + (haut ? ' est supérieur à ' + m('1') : ' est compris entre ' + m('0') + ' et ' + m('1')) + ', ' + pourquoi,
      'Méthode', { ordre: 'fixe', _u0: v, _racine: racine });
  };
  G['maths-suite-parametre'] = function () {
    var c = pick([1, 2, 3]), t = ri(-2, 2), croiss = Math.random() < 0.55, cc = c === 1 ? '' : String(c);
    var tt = t === 0 ? 'a' : 'a' + (t > 0 ? '+' + t : t), lin = t === 0 ? '+an' : '+(' + tt + ')n';
    var f = (croiss ? '' : '-') + cc + 'n^2' + lin, K = croiss ? -t - c : c - t;
    var cand = croiss ? ['a>' + K, 'a>=' + (-K), 'a>=' + (K + c), 'a>=' + (K - c), 'a>=' + (K + 1)] : ['a<' + K, 'a<=' + (-K), 'a<=' + (K + c), 'a<=' + (K - c), 'a<=' + (K - 1)];
    var bon = (croiss ? 'a>=' : 'a<=') + K, ch = troisAutres(bon, cand);
    if (!ch) return G['maths-suite-parametre']();
    return qcm('Pour quelles valeurs du réel ' + m('a') + ' la suite définie par ' + m('u_n=' + f) + ' est-elle ' + (croiss ? 'croissante' : 'décroissante') + ' ?', ch.map(m), 0,
      m('u_{n+1}-u_n=' + (croiss ? '' : '-') + cc + '(2n+1)+' + (t === 0 ? 'a' : tt)) + ', ' + (croiss ? 'positif ou nul pour tout ' + m('n>=0') : 'négatif ou nul pour tout ' + m('n>=0')) + ' si et seulement si c\'est vrai pour ' + m('n=0') +
      ' (le cas le plus défavorable), soit ' + m(bon) + '.', 'Croissante', { _c: c, _t: t, _croiss: croiss, _all: ch });
  };
  G['maths-suite-points-multi'] = function () {
    var forme = pick(['lin', 'quad']), p = nz(-3, 3), s = ri(-4, 4), b = ri(-4, 3), c = ri(-3, 3);
    var u = forme === 'lin' ? function (n) { return p * n + s; } : function (n) { return n * n + b * n + c; };
    var f = forme === 'lin' ? lineaire(p, s) : pol([1, b, c]).replace(/x/g, 'n');
    var ks = shuffle([0, 1, 2, 3, 4, 5]).slice(0, 5).sort(function (x, y) { return x - y; }), pts = [], bonnes = [];
    ks.forEach(function (k, i) {
      var ok = Math.random() < 0.5, y = u(k);
      if (!ok) y = pick([u(k + 1), u(k) + 1, u(k) - 1, u(Math.max(k - 1, 0)) + 2].filter(function (z) { return z !== u(k); }));
      if (ok) bonnes.push(i);
      pts.push(m('(' + k + ';' + y + ')'));
    });
    if (bonnes.length < 2 || bonnes.length > 3 || !uniques(pts)) return G['maths-suite-points-multi']();
    return { type: 'multi', q: 'La suite ' + m('(u_n)') + ' est définie par ' + m('u_n=' + f) + '. Quels points appartiennent à son nuage de points ? (plusieurs réponses)', choix: pts, rep: bonnes,
      expl: 'Le point d\'abscisse ' + m('n') + ' doit avoir pour ordonnée ' + m('u_n') + ' : ' + ks.map(function (k) { return m('u_' + k + '=' + u(k)); }).join(', ') + '.', source: 'Nuage de points', _forme: forme, _p: p, _s: s, _b: b, _c: c, _ks: ks };
  };
  G['maths-suite-ordre-termes'] = function () {
    var b = ri(-7, 1), c = ri(-4, 6), u = function (n) { return n * n + b * n + c; };
    var ks = shuffle([0, 1, 2, 3, 4, 5]).slice(0, 4), vals = ks.map(u);
    if (new Set(vals).size !== 4) return G['maths-suite-ordre-termes']();
    var ordre = ks.slice().sort(function (x, y) { return u(x) - u(y); });
    return { type: 'ordre', q: 'La suite ' + m('(u_n)') + ' est définie par ' + m('u_n=' + pol([1, b, c]).replace(/x/g, 'n')) + '. Rangez ces termes du plus petit au plus grand.', items: ordre.map(function (k) { return m('u_' + k); }),
      expl: 'Dans l\'ordre croissant : ' + ordre.map(function (k) { return m('u_' + k + '=' + u(k)); }).join(', ') + '.', source: 'Définie explicitement', _b: b, _c: c, _ordre: ordre };
  };


  /* ================= Chapitre 3 : probabilités conditionnelles =================
     Un décimal s'écrit avec un point dans la mini-syntaxe (0.6) et s'affiche avec une virgule ; bar(A) est l'événement contraire. */
  function dstr(f) {                                /* fraction -> décimal exact écrit avec un point, ou null s'il n'est pas fini en 4 décimales */
    var q = f.q, a = 0, b = 0;
    while (q % 2 === 0) { q /= 2; a++; }
    while (q % 5 === 0) { q /= 5; b++; }
    if (q !== 1 || Math.max(a, b) > 4) return null;
    return (Math.round(fval(f) * 10000) / 10000).toString();
  }
  function dec(x) { return (Math.round(x * 10000) / 10000).toString(); }
  function fc(p, q) { return fr(p, q); }
  function sortieP(q, f, expl, source, extra) {      /* réponse saisie : décimal exact, sinon fraction ou valeur arrondie à 0,01 */
    var d = dstr(f), o = { type: 'saisie', nombre: true, expl: expl, source: source };
    if (d) { o.q = q; o.rep = [Math.round(fval(f) * 1e6) / 1e6]; o.tol = 1e-6; o.aff = m(d); }
    else { o.q = q + ' (fraction ou valeur arrondie à 0,01)'; o.rep = [fval(f)]; o.tol = 0.006; o.aff = m(ftxt(f)); }
    for (var k in extra) o[k] = extra[k];
    return o;
  }
  function qcmP(q, f, pool, expl, source, extra) {   /* QCM : la valeur exacte et trois erreurs classiques (valeurs différentes, comprises entre 0 et 1) ; null si le tirage ne s'y prête pas */
    var ch = [f], vus = [fval(f)];
    shuffle(pool).forEach(function (g) {
      if (ch.length < 4 && fval(g) > 0 && fval(g) <= 1 && vus.every(function (v) { return Math.abs(v - fval(g)) > 1e-9; })) { vus.push(fval(g)); ch.push(g); }
    });
    if (ch.length < 4) return null;
    var tous = ch.every(function (g) { return dstr(g); });
    return qcm(q, ch.map(function (g) { return m(tous ? dstr(g) : ftxt(g)); }), 0, expl, source, extra);
  }
  function vP(label, f) { return m(label + '=' + dstr(f)); }                 /* « P(A)=0.6 » prêt à insérer (f doit être un décimal fini) */
  function cent(x) { return fc(x, 100); }                                    /* x centièmes -> fraction */

  G['maths-proba-reunion'] = function () {
    var v = pick(['reunion', 'reunion', 'inter', 'incomp', 'contraire-union', 'contraire-inter']), A, B, C, U;
    var n = 0;
    do { A = ri(4, 18) * 5; B = ri(4, 18) * 5; C = ri(1, Math.floor(Math.min(A, B) / 5)) * 5; U = A + B - C; n++; } while (n < 500 && (U > 100 || U <= Math.max(A, B)));
    var a = cent(A), b = cent(B), c = cent(C), u = cent(U), pA = vP('P(A)', a), pB = vP('P(B)', b);
    if (v === 'reunion') return sortieP('Soient ' + m('A') + ' et ' + m('B') + ' deux événements tels que ' + pA + ', ' + pB + ' et ' + vP('P(A cap B)', c) + '. Calculer ' + m('P(A cup B)') + '.', u,
      m('P(A cup B)=P(A)+P(B)-P(A cap B)=' + dec(A / 100) + '+' + dec(B / 100) + '-' + dec(C / 100) + '=' + dec(U / 100)) + '.', 'Réunion', { _v: v });
    if (v === 'inter') return sortieP('Soient ' + m('A') + ' et ' + m('B') + ' deux événements tels que ' + pA + ', ' + pB + ' et ' + vP('P(A cup B)', u) + '. Calculer ' + m('P(A cap B)') + '.', c,
      m('P(A cap B)=P(A)+P(B)-P(A cup B)=' + dec(A / 100) + '+' + dec(B / 100) + '-' + dec(U / 100) + '=' + dec(C / 100)) + '.', 'Réunion', { _v: v });
    if (v === 'incomp') {
      A = ri(2, 9) * 5; B = ri(2, 9) * 5;
      return sortieP('Soient ' + m('A') + ' et ' + m('B') + ' deux événements incompatibles tels que ' + vP('P(A)', cent(A)) + ' et ' + vP('P(B)', cent(B)) + '. Calculer ' + m('P(A cup B)') + '.', cent(A + B),
        'Incompatibles : ' + m('P(A cap B)=0') + ', donc ' + m('P(A cup B)=P(A)+P(B)=' + dec((A + B) / 100)) + '.', 'Événements incompatibles', { _v: v });
    }
    if (v === 'contraire-union') return sortieP('Soient ' + m('A') + ' et ' + m('B') + ' deux événements tels que ' + pA + ', ' + pB + ' et ' + vP('P(A cap B)', c) + '. Calculer ' + m('P(bar(A cup B))') + '.', cent(100 - U),
      m('P(A cup B)=' + dec(A / 100) + '+' + dec(B / 100) + '-' + dec(C / 100) + '=' + dec(U / 100)) + ', puis ' + m('P(bar(A cup B))=1-' + dec(U / 100) + '=' + dec((100 - U) / 100)) + '.', 'Événement contraire', { _v: v });
    return sortieP('Soient ' + m('A') + ' et ' + m('B') + ' deux événements tels que ' + vP('P(A cap B)', c) + '. Calculer ' + m('P(bar(A cap B))') + '.', cent(100 - C),
      m('P(bar(A cap B))=1-P(A cap B)=1-' + dec(C / 100) + '=' + dec((100 - C) / 100)) + '.', 'Événement contraire', { _v: v });
  };

  G['maths-proba-conditionnelle'] = function () {
    var v = pick(['def', 'def', 'produit', 'sens']), A = ri(4, 18) * 5, B, C;
    if (v === 'def') {
      C = ri(1, A / 5 - 1) * 5 || 5;
      if (C >= A) C = A - 5;
      var f = fc(C, A);
      return sortieP('On donne ' + vP('P(A)', cent(A)) + ' et ' + vP('P(A cap B)', cent(C)) + '. Calculer ' + m('P_A(B)') + '.', f,
        m('P_A(B)=frac(P(A cap B),P(A))=frac(' + dec(C / 100) + ',' + dec(A / 100) + ')=' + (dstr(f) || ftxt(f))) + '.', 'Définition', { _v: v });
    }
    if (v === 'produit') {
      var P1 = ri(2, 18) * 5, f2 = fc(A * P1, 10000);
      return sortieP('On donne ' + vP('P(A)', cent(A)) + ' et ' + vP('P_A(B)', cent(P1)) + '. Calculer ' + m('P(A cap B)') + '.', f2,
        m('P(A cap B)=P(A)*P_A(B)=' + dec(A / 100) + '*' + dec(P1 / 100) + '=' + dec(A * P1 / 10000)) + '.', 'Formule du produit', { _v: v });
    }
    var mx, Cc, nn = 0;
    do { B = ri(4, 18) * 5; mx = Math.min(A, B); Cc = ri(1, mx / 5) * 5; nn++; } while (nn < 500 && A + B - Cc > 100);
    var cond = pick(['A', 'B']), den = cond === 'A' ? A : B, lbl = cond === 'A' ? 'P_A(B)' : 'P_B(A)', f3 = fc(Cc, den);
    return sortieP('On donne ' + vP('P(A)', cent(A)) + ', ' + vP('P(B)', cent(B)) + ' et ' + vP('P(A cap B)', cent(Cc)) + '. Calculer ' + m(lbl) + '.', f3,
      'On divise par la probabilité de ce qu\'on sait : ' + m(lbl + '=frac(P(A cap B),P(' + cond + '))=frac(' + dec(Cc / 100) + ',' + dec(den / 100) + ')=' + (dstr(f3) || ftxt(f3))) + '.', 'Définition', { _v: v, niveau: 3 });
  };

  G['maths-proba-effectifs'] = function () {
    var N = pick([100, 120, 150, 200, 240, 300]), X, Y, Z, n = 0;
    do { X = ri(Math.ceil(0.2 * N / 10), Math.floor(0.7 * N / 10)) * 10; Y = ri(Math.ceil(0.2 * N / 10), Math.floor(0.7 * N / 10)) * 10; Z = ri(1, Math.min(X, Y) / 10) * 10; n++; }
    while (n < 500 && (X + Y - Z > N - 10 || Z < 10 || Z >= Math.min(X, Y)));
    var cas = pick(['P_S(M)', 'P_M(S)', 'P_{bar(S)}(M)', 'P_{bar(S)}(bar(M))', 'P(bar(S) cap bar(M))', 'P(S cup M)']), f, ex;
    var hors = N - X - Y + Z;
    if (cas === 'P_S(M)') { f = fc(Z, X); ex = ['frac(' + Z + ',' + X + ')']; }
    else if (cas === 'P_M(S)') { f = fc(Z, Y); ex = ['frac(' + Z + ',' + Y + ')']; }
    else if (cas === 'P_{bar(S)}(M)') { f = fc(Y - Z, N - X); ex = ['frac(' + (Y - Z) + ',' + (N - X) + ')']; }
    else if (cas === 'P_{bar(S)}(bar(M))') { f = fc(hors, N - X); ex = ['frac(' + hors + ',' + (N - X) + ')']; }
    else if (cas === 'P(bar(S) cap bar(M))') { f = fc(hors, N); ex = ['frac(' + hors + ',' + N + ')']; }
    else { f = fc(X + Y - Z, N); ex = ['frac(' + (X + Y - Z) + ',' + N + ')']; }
    var enonce = 'Un lycée compte ' + N + ' élèves. ' + X + ' font de l\'AS, ' + Y + ' font partie du club de maths et ' + Z + ' font les deux. On choisit un élève au hasard ; ' + m('S') + ' : « l\'élève fait de l\'AS », ' + m('M') + ' : « l\'élève fait partie du club de maths ». Calculer ' + m(cas) + '.';
    var expl = 'On compte les élèves : ' + hors + ' ne font ni l\'AS ni le club de maths. ' + m(cas + '=' + ex[0] + (dstr(f) ? '=' + dstr(f) : '')) + '.';
    if (Math.random() < 0.55) {
      var o = qcmP(enonce, f, [fc(Z, X), fc(Z, Y), fc(Z, N), fc(Y - Z, N - X), fc(hors, N - X), fc(hors, N), fc(X + Y - Z, N), fc(X, N), fc(Y, N), fc(X - Z, N), fc(Y - Z, N)], expl + ' Les autres valeurs divisent par une mauvaise condition ou oublient de conditionner.', 'Tableau à double entrée', { _cas: cas });
      if (o) return o;
    }
    return sortieP(enonce, f, expl, 'Tableau à double entrée', { _cas: cas });
  };

  G['maths-proba-arbre'] = function () {
    var pa = ri(2, 8), p1 = ri(1, 9), p2 = ri(1, 9), cas = pick(['P(A cap B)', 'P(bar(A) cap B)', 'P(B)', 'P(B)', 'P(bar(B))', 'P_B(A)', 'P_{bar(B)}(A)']);
    var PA = fc(pa, 10), PB1 = fc(p1, 10), PB2 = fc(p2, 10), un = fc(1, 1);
    var pAB = fmul(PA, PB1), pnAB = fmul(fsub(un, PA), PB2), pB = fadd(pAB, pnAB), pAnB = fmul(PA, fsub(un, PB1)), f, ex;
    if (cas === 'P(A cap B)') { f = pAB; ex = m('P(A cap B)=P(A)*P_A(B)=' + dec(pa / 10) + '*' + dec(p1 / 10) + '=' + dstr(f)); }
    else if (cas === 'P(bar(A) cap B)') { f = pnAB; ex = m('P(bar(A) cap B)=P(bar(A))*P_{bar(A)}(B)=' + dec(1 - pa / 10) + '*' + dec(p2 / 10) + '=' + dstr(f)); }
    else if (cas === 'P(B)') { f = pB; ex = 'Les événements ' + m('A') + ' et ' + m('bar(A)') + ' forment une partition : ' + m('P(B)=P(A cap B)+P(bar(A) cap B)=' + dstr(pAB) + '+' + dstr(pnAB) + '=' + dstr(f)); }
    else if (cas === 'P(bar(B))') { f = fsub(un, pB); ex = m('P(B)=' + dstr(pB)) + ' par les probabilités totales, puis ' + m('P(bar(B))=1-' + dstr(pB) + '=' + dstr(f)); }
    else if (cas === 'P_B(A)') { f = fdiv(pAB, pB); ex = m('P(B)=' + dstr(pB)) + ' par les probabilités totales, puis ' + m('P_B(A)=frac(P(A cap B),P(B))=frac(' + dstr(pAB) + ',' + dstr(pB) + ')=' + (dstr(f) || ftxt(f))); }
    else { f = fdiv(pAnB, fsub(un, pB)); ex = m('P(bar(B))=1-' + dstr(pB) + '=' + dstr(fsub(un, pB))) + ' et ' + m('P(A cap bar(B))=P(A)*P_A(bar(B))=' + dec(pa / 10) + '*' + dec(1 - p1 / 10) + '=' + dstr(pAnB)) + ', puis ' + m('P_{bar(B)}(A)=frac(' + dstr(pAnB) + ',' + dstr(fsub(un, pB)) + ')=' + (dstr(f) || ftxt(f))); }
    var enonce = 'Un arbre pondéré décrit deux événements ' + m('A') + ' et ' + m('B') + ' avec ' + vP('P(A)', PA) + ', ' + vP('P_A(B)', PB1) + ' et ' + vP('P_{bar(A)}(B)', PB2) + '. Calculer ' + m(cas) + '.';
    if (Math.random() < 0.55) {
      var somme = fadd(PB1, PB2), pool = [pAB, pnAB, pB, pAnB, fsub(un, pB), PB1, PB2, PA, fdiv(pAB, pB), fdiv(pnAB, pB), fsub(un, PA)];
      if (fval(somme) <= 1) pool.push(somme);
      var o = qcmP(enonce, f, pool, ex + '. Les autres valeurs sont des confusions classiques : un seul chemin, une probabilité conditionnelle prise pour une intersection, ou une somme non pondérée.', 'Plusieurs chemins', { _cas: cas });
      if (o) return o;
    }
    return sortieP(enonce, f, ex + '.', 'Plusieurs chemins', { _cas: cas });
  };

  G['maths-proba-independance'] = function () {
    var v = pick(['vf', 'vf', 'inter', 'cond', 'contraire']), a, b, A, B;
    if (v === 'vf') {
      A = ri(2, 9); B = ri(2, 9);
      var prod = A * B, vrai = Math.random() < 0.5, C = prod, mx = Math.min(A, B) * 10, mn = Math.max(0, A + B - 10) * 10;
      if (!vrai) { var cs = [prod - 5, prod + 5, prod + 10, prod - 10, mx].filter(function (x) { return x > mn && x <= mx && x > 0 && x !== prod; }); if (!cs.length) return G['maths-proba-independance'](); C = pick(cs); }
      else if (prod > mx || prod < mn || prod <= 0) return G['maths-proba-independance']();
      var f = cent(C), ok = C === prod;
      return {
        type: 'vf', q: 'Soient ' + m('A') + ' et ' + m('B') + ' deux événements tels que ' + vP('P(A)', fc(A, 10)) + ', ' + vP('P(B)', fc(B, 10)) + ' et ' + vP('P(A cap B)', f) + '. Les événements ' + m('A') + ' et ' + m('B') + ' sont indépendants.', rep: ok,
        expl: m('P(A)*P(B)=' + dec(A / 10) + '*' + dec(B / 10) + '=' + dec(prod / 100)) + (ok ? ' : c\'est égal à ' + m('P(A cap B)') + ', donc les événements sont indépendants.' : ', différent de ' + m('P(A cap B)=' + dec(C / 100)) + ' : les événements ne sont pas indépendants.'), source: 'Définition', _v: v
      };
    }
    A = ri(2, 5); B = ri(2, 5);
    if (v === 'inter') {
      var cand = [A * B / 100, (A + B) / 10, (A + B) / 10 - A * B / 100, Math.min(A, B) / 10].map(function (x) { return Math.round(x * 10000) / 10000; });
      if (new Set(cand).size !== 4) return G['maths-proba-independance']();
      return qcm('Soient ' + m('A') + ' et ' + m('B') + ' deux événements indépendants tels que ' + vP('P(A)', fc(A, 10)) + ' et ' + vP('P(B)', fc(B, 10)) + '. Calculer ' + m('P(A cap B)') + '.', cand.map(function (x) { return m(dec(x)); }), 0,
        'Indépendants : ' + m('P(A cap B)=P(A)*P(B)=' + dec(A / 10) + '*' + dec(B / 10) + '=' + dec(cand[0])) + '. Les autres valeurs correspondent à une somme, à ' + m('P(A cup B)') + ' ou au minimum : ce sont des confusions classiques.', 'Définition', { _v: v, _all: cand });
    }
    if (v === 'cond') return sortieP('Soient ' + m('A') + ' et ' + m('B') + ' deux événements indépendants tels que ' + vP('P(A)', fc(A, 10)) + ' et ' + vP('P(B)', fc(B, 10)) + '. Calculer ' + m('P_A(B)') + '.', fc(B, 10),
      'Indépendants avec ' + m('P(A)!=0') + ' : ' + m('P_A(B)=P(B)=' + dec(B / 10)) + ' (savoir que ' + m('A') + ' est réalisé ne change rien).', 'Avec le conditionnel', { _v: v });
    return sortieP('Soient ' + m('A') + ' et ' + m('B') + ' deux événements indépendants tels que ' + vP('P(A)', fc(A, 10)) + ' et ' + vP('P(B)', fc(B, 10)) + '. Calculer ' + m('P(bar(A) cap B)') + '.', fc((10 - A) * B, 100),
      m('bar(A)') + ' et ' + m('B') + ' sont aussi indépendants : ' + m('P(bar(A) cap B)=P(bar(A))*P(B)=' + dec(1 - A / 10) + '*' + dec(B / 10) + '=' + dec((10 - A) * B / 100)) + '.', 'Avec le contraire', { _v: v });
  };


  /* ================= Annales (composition) : capital avec retrait, seuil Python, minoration, probabilités et suites ================= */
  function dpt(x) { return (Math.round(x * 100) / 100).toString(); }          /* 1.02 : décimal avec un point (affiché avec une virgule dans une formule) */
  G['maths-suite-seuil'] = function () {
    var t = pick([2, 3, 4, 5]), R = pick([50, 100, 150, 200, 250, 300]), a = (100 + t) / 100, L = 100 * R / t;
    var u0 = Math.ceil(L / 100) * 100 + 100 * ri(1, 8), S = u0 + 100 * ri(4, 40);
    var u = u0, prev = u0, n = 0, marge = Infinity;
    while (u <= S && n < 300) { marge = Math.min(marge, Math.abs(u - S)); prev = u; u = a * u - R; n++; }
    marge = Math.min(marge, Math.abs(u - S));
    if (n < 3 || n > 80 || marge < 1e-6) return G['maths-suite-seuil']();
    var arr = function (x) { return (Math.round(x * 100) / 100).toString(); };
    return {
      type: 'saisie', nombre: true,
      q: 'Un capital de ' + u0 + ' € augmente de ' + t + ' % chaque mois, puis on retire ' + R + ' €. Que vaut n à la fin de ce programme ? u=' + u0 + ' ; n=0 ; tant que u<=' + S + ' : u=' + dpt(a) + '*u-' + R + ' puis n=n+1 ; print(n).',
      rep: [n],
      expl: 'Chaque mois : ' + m('u_{n+1}=' + dpt(a) + 'u_n-' + R) + '. Comme ' + m('u_0>' + dpt(L)) + ', les termes augmentent. Le premier terme au-dessus de ' + m(S) + ' est ' + m('u_' + n + '=' + arr(u)) + ' (valeur arrondie), le précédent ' + m('u_' + (n - 1) + '=' + arr(prev)) + ' est inférieur ou égal à ' + m(S) + '. Le programme affiche ' + n + '.',
      source: 'Seuil en Python', _t: t, _R: R, _u0: u0, _S: S, _n: n
    };
  };

  var CONCL = ['La suite est croissante', 'La suite est décroissante', 'On ne peut pas conclure', 'La suite est stationnaire'];
  G['maths-suite-minoration'] = function () {
    var rr = pick([2, 5, 10, 20, 50]), B = pick([50, 100, 150, 200, 250]), a = (100 + rr) / 100, ell = B * 100 / rr;
    var min = Math.random() < 0.55, cas = pick(['egal', 'egal', 'bon', 'mauvais']), k = ri(1, 5), L;
    if (cas === 'egal') L = ell;
    else if (min) L = cas === 'bon' ? ell + 100 * k : ell - 100 * k;
    else L = cas === 'bon' ? ell - 100 * k : ell + 100 * k;
    if (L <= 0 || L % 1 !== 0) return G['maths-suite-minoration']();
    var K = rr * L / 100 - B, bon = min ? (K >= 0 ? 0 : 2) : (K <= 0 ? 1 : 2);
    var diff = m(dpt(a - 1) + 'u_n-' + B), borne = m(dpt(a - 1) + '*' + L + '-' + B + '=' + K);
    var pourquoi = bon === 2 ? ('Avec ' + (min ? m('u_n>=' + L) : m('u_n<=' + L)) + ' on obtient seulement ' + diff + (min ? ' >= ' : ' <= ') + borne + ', qui n\'a pas le bon signe : on ne peut pas conclure.')
      : ('On a ' + diff + (min ? ' >= ' : ' <= ') + borne + ', donc la différence est ' + (min ? 'positive ou nulle : la suite est croissante.' : 'négative ou nulle : la suite est décroissante.'));
    return qcm('On sait que ' + m('u_{n+1}=' + dpt(a) + 'u_n-' + B) + ' et que ' + m('u_n' + (min ? '>=' : '<=') + L) + ' pour tout ' + m('n') + '. Que peut-on conclure sur le sens de variation ?',
      CONCL, bon, 'La différence est ' + m('u_{n+1}-u_n=' + dpt(a - 1) + 'u_n-' + B) + '. ' + pourquoi, 'Méthode', { ordre: 'fixe', _a: a, _B: B, _L: L, _min: min });
  };

  G['maths-proba-suite'] = function () {
    var p = ri(2, 9), q = ri(1, 9);
    if (p <= q) return G['maths-proba-suite']();
    var c = p - q, dd = function (x) { return (x / 10).toString(); }, forme = function (al, be) { return m(dd(al) + 'u_n+' + dd(be)); };
    var contexte = 'Chaque année, ' + (p * 10) + ' % des élèves inscrits à un club se réinscrivent et ' + (q * 10) + ' % des non-inscrits s\'y inscrivent. On note ' + m('u_n') + ' la probabilité qu\'un élève soit inscrit l\'année ' + m('n') + '.';
    if (Math.random() < 0.5) {
      var cand = [[p, q], [c, p], [q, p], [p, 10 - q]].filter(function (x) { return !(x[0] === c && x[1] === q); });
      var vus = {}, ch = [];
      cand.forEach(function (x) { var k = x.join(','); if (!vus[k] && ch.length < 3) { vus[k] = 1; ch.push(x); } });
      if (ch.length < 3) return G['maths-proba-suite']();
      return qcm(contexte + ' Que vaut ' + m('u_{n+1}') + ' en fonction de ' + m('u_n') + ' ?', [forme(c, q)].concat(ch.map(function (x) { return forme(x[0], x[1]); })), 0,
        'Probabilités totales : ' + m('u_{n+1}=' + dd(p) + 'u_n+' + dd(q) + '(1-u_n)=' + dd(c) + 'u_n+' + dd(q)) + '. Oublier le facteur ' + m('1-u_n') + ' donne ' + m(dd(p) + 'u_n+' + dd(q)) + '.',
        'Probabilités et suites', { ordre: 'fixe', _p: p, _q: q, _v: 'rel' });
    }
    var U = pick([2, 4, 5, 6, 8]), r = (p * U + q * (10 - U)) / 100;
    return {
      type: 'saisie', nombre: true, q: contexte + ' Calculer ' + m('u_{n+1}') + ' lorsque ' + m('u_n=' + dd(U)) + '.', rep: [Math.round(r * 100) / 100], tol: 1e-9,
      expl: m('u_{n+1}=' + dd(p) + '*' + dd(U) + '+' + dd(q) + '*' + dd(10 - U) + '=' + dpt(r)) + ' : on additionne les deux chemins qui mènent à « inscrit l\'année suivante ».', source: 'Probabilités et suites', _p: p, _q: q, _U: U, _v: 'calc'
    };
  };

  /* ---------- niveau de difficulté de chaque générateur (1 rappel, 2 application, 3 type DS) ---------- */
  var NIVEAU = {
    'maths-discriminant': 1, 'maths-nb-solutions': 1, 'maths-resoudre': 2, 'maths-forme-canonique': 2, 'maths-racine-evidente': 1, 'maths-racine-evidente-cubique': 2,
    'maths-evaluer-polynome': 1, 'maths-identification-cubique': 3, 'maths-factorisation': 2, 'maths-signe-trinome': 3, 'maths-somme-produit': 2, 'maths-somme-produit-equation': 2,
    'maths-somme-produit-nombres': 3, 'maths-racine-evidente-autre': 3, 'maths-bicarree': 3, 'maths-parametre': 3, 'maths-valeurs-interdites': 2,
    'maths-discriminant-parametre': 3, 'maths-parametre-cours': 3, 'maths-expressions-racines': 3, 'maths-inequation-quotient': 3, 'maths-inequation-cubique': 3,
    'maths-irrationnelle': 3, 'maths-polynome-nb-racines': 3, 'maths-multi-discriminant': 2, 'maths-multi-racines': 2,
    'maths-suite-terme': 1, 'maths-suite-point': 1, 'maths-suite-variation': 2, 'maths-suite-rang': 3, 'maths-suite-stationnaire': 2,
    'maths-proba-reunion': 2, 'maths-proba-conditionnelle': 2, 'maths-proba-effectifs': 3, 'maths-proba-arbre': 3, 'maths-proba-independance': 3,
    'maths-suite-variation-diff': 3, 'maths-suite-recurrence-carre': 3, 'maths-suite-parametre': 3, 'maths-suite-points-multi': 2, 'maths-suite-ordre-termes': 2,
    'maths-suite-seuil': 3, 'maths-suite-minoration': 3, 'maths-proba-suite': 3
  };
  /* catégorie des générateurs (voir quiz/categories.json) : tous des « calculs », sauf exception listée ici (nom : catégorie) */
  var CAT = root.QUIZ_GEN_CAT = root.QUIZ_GEN_CAT || {};
  Object.keys(NIVEAU).forEach(function (nom) {
    var f = G[nom];
    CAT[nom] = CAT[nom] || 'calcul';
    G[nom] = function () { var q = f(); if (!q.niveau) q.niveau = NIVEAU[nom]; if (!q.cat) q.cat = CAT[nom]; return q; };
  });
})(typeof window !== 'undefined' ? window : globalThis);
