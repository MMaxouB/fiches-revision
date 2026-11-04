/* Générateurs de questions : chaque générateur renvoie une question neuve (nombres tirés au hasard) dont la réponse est CALCULÉE, donc toujours exacte.
   Une question = { type:'qcm'|'saisie'|'vf', q, ... } (format décrit dans references/quiz.md du skill fiche-revision).
   Texte mathématique : entre $...$, mini-syntaxe (x^2, u_n, frac(a,b), sqrt(a), Delta, set(1;2)) convertie en MathML par quiz.js.
   Ce fichier n'utilise ni le DOM ni le réseau : il se teste avec Node (voir quiz/tester_generateurs.js). */
(function (root) {
  'use strict';
  var G = root.QUIZ_GEN = root.QUIZ_GEN || {};

  function ri(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  function nz(a, b) { var n = 0; while (n === 0) n = ri(a, b); return n; }
  function pick(t) { return t[ri(0, t.length - 1)]; }
  function par(n) { return n < 0 ? '(' + n + ')' : String(n); }

  /* a x^2 + b x + c en mini-syntaxe, sans coefficients inutiles (1, 0) */
  function poly(a, b, c) {
    var s = (a === 1 ? '' : a === -1 ? '-' : String(a)) + 'x^2';
    if (b) s += (b > 0 ? '+' : '-') + (Math.abs(b) === 1 ? '' : String(Math.abs(b))) + 'x';
    if (c) s += (c > 0 ? '+' : '-') + Math.abs(c);
    return s;
  }
  function disc(a, b, c) { return b * b - 4 * a * c; }
  function dEtapes(a, b, c) {
    var d = disc(a, b, c);
    return '$Delta=b^2-4ac=' + par(b) + '^2-4*' + par(a) + '*' + par(c) + '=' + d + '$';
  }

  /* trinôme dont le discriminant est négatif, nul ou positif (cas : 'neg' | 'zero' | 'pos') */
  function trinome(cas) {
    var a, b, c, r, n = 0;
    if (cas === 'zero') {
      a = nz(-3, 3); r = ri(-4, 4);
      return { a: a, b: -2 * a * r, c: a * r * r };
    }
    do {
      a = nz(-4, 4); b = ri(-6, 6); c = ri(-6, 6); n++;
    } while (n < 500 && (cas === 'neg' ? disc(a, b, c) >= 0 : disc(a, b, c) <= 0));
    return { a: a, b: b, c: c };
  }

  G['maths-discriminant'] = function () {
    var t = trinome(pick(['neg', 'zero', 'pos', 'pos']));
    var d = disc(t.a, t.b, t.c);
    return {
      type: 'saisie', nombre: true,
      q: 'Calculer le discriminant de l\'équation $' + poly(t.a, t.b, t.c) + '=0$.',
      rep: [d], expl: dEtapes(t.a, t.b, t.c) + '.', source: 'Discriminant et solutions',
      _abc: [t.a, t.b, t.c]
    };
  };

  G['maths-nb-solutions'] = function () {
    var cas = pick(['neg', 'zero', 'pos']);
    var t = trinome(cas), d = disc(t.a, t.b, t.c);
    var bonne = d < 0 ? 0 : d === 0 ? 1 : 2;
    var concl = d < 0 ? 'Comme $Delta<0$, l\'équation n\'a aucune solution réelle.'
      : d === 0 ? 'Comme $Delta=0$, l\'équation a une solution double.'
      : 'Comme $Delta>0$, l\'équation a deux solutions distinctes.';
    return {
      type: 'qcm', ordre: 'fixe',
      q: 'Combien de solutions réelles a l\'équation $' + poly(t.a, t.b, t.c) + '=0$ ?',
      choix: ['Aucune', 'Une seule', 'Deux'], rep: bonne,
      expl: dEtapes(t.a, t.b, t.c) + '. ' + concl, source: 'Discriminant et solutions',
      _abc: [t.a, t.b, t.c]
    };
  };

  G['maths-suite-terme'] = function () {
    var forme = pick(['explicite', 'explicite', 'recurrence']);
    if (forme === 'explicite') {
      var p = nz(-5, 5), s = ri(-6, 6), k = ri(2, 9);
      var f = (p === 1 ? '' : p === -1 ? '-' : String(p)) + 'n' + (s ? (s > 0 ? '+' : '-') + Math.abs(s) : '');
      return {
        type: 'saisie', nombre: true,
        q: 'La suite $(u_n)$ est définie par $u_n=' + f + '$. Calculer $u_' + k + '$.',
        rep: [p * k + s], expl: '$u_' + k + '=' + (p === 1 ? '' : p === -1 ? '-' : par(p) + '*') + k + (s ? (s > 0 ? '+' : '-') + Math.abs(s) : '') + '=' + (p * k + s) + '$',
        source: 'Définie explicitement', _chk: { forme: forme, p: p, s: s, k: k }
      };
    }
    var u0 = ri(-3, 5), m = nz(-3, 3), c = ri(-4, 4), n = ri(2, 4), u = u0, etapes = '$u_0=' + u0 + '$';
    for (var i = 1; i <= n; i++) {
      u = m * u + c;
      etapes += ', $u_' + i + '=' + (m === 1 ? '' : m === -1 ? '-' : par(m) + '*') + 'u_' + (i - 1) + (c ? (c > 0 ? '+' : '-') + Math.abs(c) : '') + '=' + u + '$';
    }
    var rec = (m === 1 ? '' : m === -1 ? '-' : String(m)) + 'u_n' + (c ? (c > 0 ? '+' : '-') + Math.abs(c) : '');
    return {
      type: 'saisie', nombre: true,
      q: 'La suite $(u_n)$ est définie par $u_0=' + u0 + '$ et $u_{n+1}=' + rec + '$. Calculer $u_' + n + '$.',
      rep: [u], expl: etapes + '.', source: 'Définie par récurrence', _chk: { forme: forme, u0: u0, m: m, c: c, n: n }
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
