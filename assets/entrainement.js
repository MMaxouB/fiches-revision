/* Sujets d'entraînement : chrono facultatif par exercice (à rebours, on peut dépasser). Les réponses se font sur papier. */
(function () {
  'use strict';
  var root = document.getElementById('sj');
  if (!root) return;
  function $(s, c) { return (c || document).querySelector(s); }
  var barre = $('#sj-t'), tm = $('#sj-tm'), bp = $('#sj-pause'), bs = $('#sj-stop'), ch = null, tick = null;
  function mmss(ms) { var s = Math.floor(Math.abs(ms) / 1000), m = Math.floor(s / 60); return m + ':' + (s % 60 < 10 ? '0' : '') + (s % 60); }
  function compte() {
    if (!ch || !ch.run) return;
    var n = Date.now(); ch.ecoule += n - ch.dernier; ch.dernier = n;
  }
  function affiche() {
    if (!ch) { barre.hidden = true; return; }
    var reste = ch.min * 60000 - ch.ecoule;
    tm.textContent = ch.nom + ' : ' + (reste >= 0 ? mmss(reste) : 'temps écoulé, +' + mmss(reste)) + (ch.run ? '' : ' (pause)');
    tm.className = 'sj-tm' + (reste < 0 ? ' fin' : '');
    bp.textContent = ch.run ? 'Pause' : 'Reprendre'; barre.hidden = false;
  }
  function arret() {
    clearInterval(tick); tick = null; ch = null;
    Array.prototype.forEach.call(root.querySelectorAll('.chr.on'), function (b) { b.classList.remove('on'); });
    affiche();
  }
  Array.prototype.forEach.call(root.querySelectorAll('.chr'), function (b) {
    b.addEventListener('click', function () {
      if (ch) arret();
      ch = { min: +b.getAttribute('data-min'), nom: b.getAttribute('data-nom'), ecoule: 0, dernier: Date.now(), run: true };
      Array.prototype.forEach.call(root.querySelectorAll('.chr[data-ex="' + b.getAttribute('data-ex') + '"]'), function (x) { x.classList.add('on'); });
      tick = setInterval(function () { compte(); affiche(); }, 500); affiche();
    });
  });
  bp.addEventListener('click', function () { if (!ch) return; compte(); ch.run = !ch.run; ch.dernier = Date.now(); affiche(); });
  bs.addEventListener('click', arret);
})();
