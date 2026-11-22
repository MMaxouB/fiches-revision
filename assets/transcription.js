/* Page « Transcrire un cours » du site de fiches.
   Connexion Supabase (comptes créés à la main), transcription par le Worker Cloudflare, bibliothèque personnelle.
   Aucune clé secrète ici : la clé publique Supabase est protégée par les règles RLS de la base. */
(function () {
  "use strict";
  const K = window.TR_CONF;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const MATIERES = [["maths", "Mathématiques"], ["nsi", "NSI"], ["pc", "Physique-Chimie"], ["esphy", "ES Physique"], ["essvt", "ES SVT"],
    ["fr", "Français"], ["hg", "Histoire-Géographie"], ["emc", "EMC"], ["ang", "Anglais"], ["angp", "Anglais+"], ["dnl", "DNL"], ["ita", "Italien"]];
  const nomMat = (c) => (MATIERES.find((m) => m[0] === c) || [0, c])[1];
  const SIGNAUX = { doutes: "Passages douteux, notés [?…] ou [illisible]", schema: "Schéma ou figure : le moteur les lit mal",
    boucle: "Lignes répétées : probable boucle du moteur", vide: "Texte presque vide", sciences: "Maths et sciences : à vérifier avec la photo",
    relu_claude: "Relue de nuit par Claude : garde un œil sur les formules et les chiffres" };
  const CHEVRON = '<svg class="go" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

  /* ---------- session ---------- */
  const CLE_SESSION = "transcription.session";
  let session = null;
  try { session = JSON.parse(localStorage.getItem(CLE_SESSION)); } catch (e) { session = null; }
  const ecrireSession = (s) => { try { s ? localStorage.setItem(CLE_SESSION, JSON.stringify(s)) : localStorage.removeItem(CLE_SESSION); } catch (e) { /* stockage bloqué : session en mémoire */ } };

  async function appelAuth(chemin, corps) {
    const r = await fetch(K.supabase + "/auth/v1/" + chemin, { method: "POST", headers: { apikey: K.cle, "Content-Type": "application/json" }, body: JSON.stringify(corps) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(/invalid login/i.test(JSON.stringify(d)) ? "E-mail ou mot de passe incorrect." : (d.error_description || d.msg || d.message || "Erreur " + r.status));
    return d;
  }
  const versSession = (d) => ({ access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Math.floor(Date.now() / 1000) + (d.expires_in || 3600), user: { id: d.user.id, email: d.user.email } });
  async function jeton() {
    if (!session) throw new Error("Connexion requise.");
    if (session.expires_at - 60 < Date.now() / 1000) {
      try { session = versSession(await appelAuth("token?grant_type=refresh_token", { refresh_token: session.refresh_token })); ecrireSession(session); }
      catch (e) { deconnexion(); throw new Error("Session expirée : reconnecte-toi."); }
    }
    return session.access_token;
  }
  function deconnexion() { session = null; ecrireSession(null); vue = "accueil"; rendre(); }

  /* ---------- accès aux données (tout passe par les règles RLS) ---------- */
  async function rest(chemin, o) {
    o = o || {};
    const r = await fetch(K.supabase + "/rest/v1/" + chemin, { method: o.methode || "GET",
      headers: Object.assign({ apikey: K.cle, Authorization: "Bearer " + await jeton(), "Content-Type": "application/json" }, o.entetes || {}),
      body: o.corps ? JSON.stringify(o.corps) : undefined });
    if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.message || "Erreur " + r.status); }
    return r.status === 204 ? null : await r.json().catch(() => null);
  }
  async function stockage(methode, chemin, corps, type) {
    const h = { apikey: K.cle, Authorization: "Bearer " + await jeton() };
    if (type) h["Content-Type"] = type;
    if (methode === "POST") h["x-upsert"] = "true";
    return fetch(K.supabase + "/storage/v1/" + chemin, { method: methode, headers: h, body: corps });
  }
  async function envoyerPhoto(chemin, blob) { const r = await stockage("POST", "object/photos/" + chemin, blob, "image/jpeg"); if (!r.ok) throw new Error("Photo non enregistrée (" + r.status + ")."); }
  async function lirePhoto(chemin) { const r = await stockage("GET", "object/authenticated/photos/" + chemin); if (!r.ok) throw new Error("Photo introuvable."); return URL.createObjectURL(await r.blob()); }
  async function supprimerPhotos(chemins) { if (chemins.length) await stockage("DELETE", "object/photos", JSON.stringify({ prefixes: chemins }), "application/json"); }
  async function worker(chemin, corps) {
    const r = await fetch(K.worker + chemin, { method: corps ? "POST" : "GET", headers: Object.assign({ Authorization: "Bearer " + await jeton() }, corps ? { "Content-Type": "application/json" } : {}), body: corps ? JSON.stringify(corps) : undefined });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.erreur || "Erreur " + r.status);
    return d;
  }

  /* ---------- photo : orientation, rotation, deux moitiés pour le moteur, copie réduite pour le stockage ---------- */
  const versBlob = (cv, q) => new Promise((r) => cv.toBlob(r, "image/jpeg", q));
  const versB64 = (blob) => new Promise((res, rej) => { const f = new FileReader(); f.onload = () => res(String(f.result).split(",")[1]); f.onerror = rej; f.readAsDataURL(blob); });
  function recadrer(src, y0, y1, largeurMax) {
    const k = largeurMax ? Math.min(1, largeurMax / Math.max(src.width, y1 - y0)) : 1;
    const c = document.createElement("canvas");
    c.width = Math.round(src.width * k); c.height = Math.round((y1 - y0) * k);
    c.getContext("2d").drawImage(src, 0, y0, src.width, y1 - y0, 0, 0, c.width, c.height);
    return c;
  }
  async function preparer(file, rot) {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height)), w = Math.round(bmp.width * k), h = Math.round(bmp.height * k), cote = rot % 180 !== 0;
    const c = document.createElement("canvas");
    c.width = cote ? h : w; c.height = cote ? w : h;
    const g = c.getContext("2d");
    g.translate(c.width / 2, c.height / 2); g.rotate(rot * Math.PI / 180); g.drawImage(bmp, -w / 2, -h / 2, w, h);
    if (bmp.close) bmp.close();
    const H = c.height, r = Math.round(H * 0.05), mid = Math.floor(H / 2);
    return {
      haut: await versB64(await versBlob(recadrer(c, 0, mid + r), 0.88)),
      bas: await versB64(await versBlob(recadrer(c, mid - r, H), 0.88)),
      complet: await versBlob(recadrer(c, 0, H, 1600), 0.8),
    };
  }

  /* ---------- aperçu : Markdown, formules (MathML), syntaxe du cours, puis nettoyage ---------- */
  function rendu(md) {
    if (!window.marked || !window.DOMPurify) return "<pre>" + esc(md) + "</pre>";
    const maths = [];
    let t = md.replace(/\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g, (m, a, b) => { maths.push({ d: a !== undefined, s: a !== undefined ? a : b }); return "XMATHX" + (maths.length - 1) + "X"; });
    t = t.replace(/\{(r|b|v|o|j|p|m)\|([^{}]*)\}/g, '<span class="c-$1">$2</span>').replace(/\{(?:cadre|pe)\|([^{}]*)\}/g, '<span class="cadre">$1</span>')
      .replace(/\{pb\|([^{}]*)\}/g, "<s>$1</s>").replace(/\{ps\|([^{}]*)\}/g, "<u>$1</u>").replace(/==([^=\n]+)==/g, "<mark>$1</mark>");
    let html = marked.parse(t, { breaks: true, gfm: true }).replace(/\[!(\w+)\]/g, '<b class="tag">$1</b>');
    html = html.replace(/XMATHX(\d+)X/g, (m, i) => {
      const f = maths[+i];
      try { return window.katex ? katex.renderToString(f.s, { displayMode: f.d, throwOnError: false, output: "mathml" }) : esc(f.s); } catch (e) { return esc(f.s); }
    });
    return DOMPurify.sanitize(html.replace(/<annotation[\s\S]*?<\/annotation>/g, ""));   // l'annotation LaTeX de KaTeX s'afficherait en clair après le nettoyage
  }
  const assembler = (titre, matiere, pages) => "# " + titre + "\n\n*" + nomMat(matiere) + "*\n\n" +
    pages.map((p) => "<!-- page " + p.numero + (p.statut === "a_relire" ? " : à relire" : "") + " -->\n" + p.markdown.trim()).join("\n\n") + "\n";
  async function copier(t, bouton) {
    try { await navigator.clipboard.writeText(t); } catch (e) { const a = document.createElement("textarea"); a.value = t; document.body.appendChild(a); a.select(); document.execCommand("copy"); a.remove(); }
    const x = bouton.textContent; bouton.textContent = "Copié"; setTimeout(() => { bouton.textContent = x; }, 1400);
  }
  function telecharger(titre, texte) {
    const nom = titre.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "cours";
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([texte], { type: "text/markdown;charset=utf-8" })); a.download = nom + ".md"; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  const dateFr = (iso) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

  /* ---------- état ---------- */
  let vue = "accueil", quota = null, erreur = "", chargement = false, emailSaisi = "";
  let chapitres = null, courant = null;        // liste ; { id, titre, matiere, pages: [...] }
  let nv = null;                                // nouveau chapitre en cours de dépôt
  const nouveau = () => ({ matiere: "maths", titre: "", cartes: [], chapitreId: null, prochain: 1, enCours: false, msg: "", compteur: 0 });

  async function majQuota() { try { const e = await worker("/etat"); quota = e; } catch (e) { /* non bloquant */ } rendre(); }
  async function chargerAccueil() {
    chargement = true; erreur = ""; rendre();
    try { chapitres = await rest("chapitres?select=id,matiere,titre,cree_le,pages(count)&order=cree_le.desc"); } catch (e) { erreur = e.message; }
    chargement = false; rendre();
  }
  async function ouvrir(id, meta) {
    chargement = true; erreur = ""; vue = "chapitre"; rendre();
    try {
      const ch = (chapitres && chapitres.find((c) => c.id === id)) || meta;
      const pages = await rest("pages?chapitre_id=eq." + id + "&select=id,numero,markdown,signaux,statut,photo_path&order=numero");
      courant = { id, titre: ch.titre, matiere: ch.matiere, pages: pages.map((p) => Object.assign(p, { vue: "apercu", photo: null })) };
    } catch (e) { erreur = e.message; vue = "accueil"; }
    chargement = false; rendre();
  }

  /* ---------- vues ---------- */
  function vueConnexion() {
    return '<h1>Transcrire un cours</h1><p class="m">Réservé aux comptes créés à la main. Connecte-toi pour déposer des photos de cours.</p>' +
      '<form id="form-connexion" class="formu"><label for="email">E-mail</label><input id="email" type="email" autocomplete="username" value="' + esc(emailSaisi) + '" required>' +
      '<label for="mdp">Mot de passe</label><input id="mdp" type="password" autocomplete="current-password" required>' +
      '<button class="lien" data-a="voirmdp" type="button">Afficher le mot de passe</button>' +
      (erreur ? '<p class="alerte" role="alert">' + esc(erreur) + "</p>" : "") +
      '<div class="row2"><button class="btn plein" type="submit">' + (chargement ? "Connexion…" : "Se connecter") + "</button></div></form>";
  }
  const enTete = (retour) => '<div class="barre">' + (retour ? '<button class="back" data-a="accueil" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>Bibliothèque</button>' : "<span></span>") +
    '<span class="compte">' + esc(session.user.email) + ' <button class="lien" data-a="sortir" type="button">Se déconnecter</button></span></div>';
  const lignequota = () => quota ? '<p class="m petit">Pages transcrites aujourd\'hui : ' + quota.utilisees + " sur " + quota.quota + ".</p>" : "";

  function vueAccueil() {
    let h = enTete(false) + "<h1>Transcrire un cours</h1><p class=\"m\">Dépose les photos d'un chapitre : le texte est transcrit en Markdown, prêt à copier ou à télécharger.</p>" + lignequota() +
      '<div class="row2"><button class="btn plein" data-a="nouveau" type="button">Nouveau chapitre</button></div>';
    if (erreur) h += '<p class="alerte" role="alert">' + esc(erreur) + "</p>";
    if (chargement && !chapitres) h += '<p class="m">Chargement…</p>';
    else if (chapitres && !chapitres.length) h += '<p class="vide">Aucun chapitre pour l\'instant.</p>';
    else if (chapitres) {
      h += '<h2 class="sub">Mes chapitres</h2><ul class="rows">' + chapitres.map((c) => {
        const t = K.teintes[c.matiere] || ["#9AA6BF", "#586380"], n = c.pages && c.pages[0] ? c.pages[0].count : 0;
        return '<li class="mat" style="--kd:' + t[0] + ";--kl:" + t[1] + '"><button class="row" data-a="ouvrir" data-id="' + esc(c.id) + '" type="button"><span class="ic">' + esc(nomMat(c.matiere).charAt(0)) +
          '</span><span class="tx"><b>' + esc(c.titre) + "</b><small>" + esc(nomMat(c.matiere)) + ", " + n + " page" + (n > 1 ? "s" : "") + ", " + dateFr(c.cree_le) + "</small></span>" + CHEVRON + "</button></li>";
      }).join("") + "</ul>";
    }
    return h + '<p class="foot">Le moteur est gratuit : il lit bien le texte (histoire, anglais, français) mais se trompe souvent sur les maths, les sciences et les schémas. Les pages signalées « à relire » se vérifient avec la photo.</p>';
  }

  function badge(p) { const m = p.statut === "a_relire" ? ["À relire", "b-warn"] : p.statut === "relu" ? ["Relu", "b-ok"] : ["Transcrit", "b-ok"]; return '<span class="badge ' + m[1] + '">' + m[0] + "</span>"; }
  const listeSignaux = (p) => { const s = (p.signaux || []).filter((c) => SIGNAUX[c]); return s.length ? '<ul class="signaux">' + s.map((c) => "<li>" + SIGNAUX[c] + "</li>").join("") + "</ul>" : ""; };
  function blocPage(p, i) {
    return '<article class="carte"><div class="tete"><div class="titre"><b>Page ' + p.numero + "</b>" + badge(p) + "</div></div>" + listeSignaux(p) +
      '<div class="onglets"><button data-a="cvue" data-i="' + i + '" data-v="apercu" aria-pressed="' + (p.vue === "apercu") + '" type="button">Aperçu</button>' +
      '<button data-a="cvue" data-i="' + i + '" data-v="texte" aria-pressed="' + (p.vue === "texte") + '" type="button">Texte</button>' +
      '<button data-a="cphoto" data-i="' + i + '" type="button">' + (p.photo ? "Masquer la photo" : "Voir la photo") + "</button>" +
      '<button data-a="cpage" data-i="' + i + '" type="button">Copier cette page</button></div>' +
      (p.photo ? '<div class="img"><img alt="Photo de la page ' + p.numero + '" src="' + p.photo + '"></div>' : "") +
      (p.vue === "texte" ? '<textarea data-a="cedit" data-i="' + i + '" spellcheck="false" aria-label="Texte de la page ' + p.numero + '">' + esc(p.markdown) + "</textarea>" +
        '<div class="row2"><button class="btn plein" data-a="csave" data-i="' + i + '" type="button">Enregistrer</button></div>'
        : '<div class="apercu">' + rendu(p.markdown) + "</div>") + "</article>";
  }
  function vueChapitre() {
    if (!courant) return enTete(true) + (erreur ? '<p class="alerte" role="alert">' + esc(erreur) + "</p>" : '<p class="m">Chargement…</p>');
    return enTete(true) + '<h1>' + esc(courant.titre) + '</h1><p class="m">' + esc(nomMat(courant.matiere)) + ", " + courant.pages.length + " page" + (courant.pages.length > 1 ? "s" : "") + "</p>" +
      '<div class="row2"><button class="btn" data-a="copiertout" type="button">Copier tout</button><button class="btn plein" data-a="telechargertout" type="button">Télécharger .md</button>' +
      '<button class="btn plein" data-a="ajouter" type="button">Ajouter des photos</button>' +
      '<button class="btn danger" data-a="supprimer" type="button">Supprimer le chapitre</button></div>' +
      (erreur ? '<p class="alerte" role="alert">' + esc(erreur) + "</p>" : "") + courant.pages.map((p, i) => blocPage(p, i)).join("");
  }

  const LIB = { attente: ["En attente", "b-attente"], cours: ["Transcription…", "b-cours"], ok: ["Terminé", "b-ok"], relire: ["À relire", "b-warn"], erreur: ["Erreur", "b-err"] };
  function vueNouveau() {
    const reste = nv.cartes.filter((c) => c.statut === "attente" || c.statut === "erreur").length;
    const libre = (c) => !nv.enCours && c.statut !== "ok" && c.statut !== "cours";
    let h = enTete(true) + "<h1>" + (nv.ajout ? "Ajouter des pages" : "Nouveau chapitre") + "</h1>" + lignequota() +
      '<label for="matiere">Matière</label><select id="matiere"' + (nv.chapitreId ? " disabled" : "") + ">" + MATIERES.map((m) => '<option value="' + m[0] + '"' + (m[0] === nv.matiere ? " selected" : "") + ">" + m[1] + "</option>").join("") + "</select>" +
      '<label for="titre">Titre du chapitre</label><input id="titre" type="text" maxlength="120" value="' + esc(nv.titre) + '" placeholder="Ex. Ch3 - Probabilités conditionnelles" autocomplete="off"' + (nv.chapitreId ? " disabled" : "") + ">" +
      '<div class="row2"><input id="fichiers" type="file" accept="image/*" multiple><label class="btn plein" for="fichiers">Ajouter des photos</label>' +
      '<button class="btn plein" data-a="go" type="button"' + (nv.enCours || !reste ? " disabled" : "") + ">" + (nv.enCours ? "Transcription en cours…" : "Transcrire" + (reste ? " (" + reste + ")" : "")) + "</button></div>" +
      (nv.msg ? '<p class="alerte" role="alert">' + esc(nv.msg) + "</p>" : "");
    if (!nv.cartes.length) return h + '<p class="vide">Aucune photo pour l\'instant.</p>';
    return h + nv.cartes.map((c, i) => {
      const cle = c.statut === "ok" && c.signaux.length ? "relire" : c.statut, l = LIB[cle];
      let res = "";
      if (c.statut === "ok") res = listeSignaux({ signaux: c.signaux.map((s) => s.code) }) + '<div class="apercu">' + rendu(c.md) + "</div>";
      else if (c.statut === "erreur") res = '<p class="alerte">' + esc(c.msg || "Échec") + "</p>";
      return '<article class="carte"><div class="tete"><div class="mini"><img alt="" src="' + c.url + '" style="transform:rotate(' + c.rot + 'deg)"></div>' +
        '<div class="titre"><b>Page ' + (i + 1) + ", " + esc(c.file.name) + '</b><span class="badge ' + l[1] + '">' + l[0] + "</span></div>" +
        (libre(c) ? '<div class="outils"><button data-a="nrot" data-i="' + i + '" aria-label="Pivoter la photo" type="button">↻</button><button data-a="nhaut" data-i="' + i + '" aria-label="Monter" type="button"' + (i ? "" : " disabled") + '>↑</button>' +
          '<button data-a="nbas" data-i="' + i + '" aria-label="Descendre" type="button"' + (i < nv.cartes.length - 1 ? "" : " disabled") + '>↓</button><button data-a="nsup" data-i="' + i + '" aria-label="Retirer" type="button">×</button></div>' : "") +
        "</div>" + res + "</article>";
    }).join("") + (nv.cartes.some((c) => c.statut === "ok") ? '<div class="row2"><button class="btn" data-a="nterminer" type="button">Ouvrir le chapitre</button></div>' : "");
  }

  function rendre() {
    const A = $("#app");
    if (!A) return;
    A.innerHTML = !session ? vueConnexion() : vue === "nouveau" ? vueNouveau() : vue === "chapitre" ? vueChapitre() : vueAccueil();
  }

  /* ---------- transcription d'un nouveau chapitre (une page à la fois) ---------- */
  async function transcrireTout() {
    if (!nv.titre.trim()) { nv.msg = "Indique le titre du chapitre."; return rendre(); }
    nv.msg = ""; nv.enCours = true; rendre();
    for (const c of nv.cartes) {
      if (c.statut !== "attente" && c.statut !== "erreur") continue;
      c.statut = "cours"; rendre();
      try {
        const img = await preparer(c.file, c.rot);
        const d = await worker("/transcrire", { images: [img.haut, img.bas], matiere: nv.matiere });
        if (!nv.chapitreId) { const r = await rest("chapitres", { methode: "POST", corps: { matiere: nv.matiere, titre: nv.titre.trim() }, entetes: { Prefer: "return=representation" } }); nv.chapitreId = r[0].id; }
        const numero = nv.prochain++, chemin = session.user.id + "/" + nv.chapitreId + "/" + numero + "-" + Date.now() + ".jpg";
        await envoyerPhoto(chemin, img.complet);
        const p = await rest("pages", { methode: "POST", entetes: { Prefer: "return=representation" }, corps: { chapitre_id: nv.chapitreId, numero, markdown: d.markdown,
          signaux: d.signaux.map((s) => s.code), statut: d.a_relire ? "a_relire" : "transcrit", photo_path: chemin, modele: d.modele } });
        Object.assign(c, { statut: "ok", md: d.markdown, signaux: d.signaux, pageId: p[0].id, numero, photoPath: chemin, vue: "apercu" });
        quota = { utilisees: d.utilisees, quota: d.quota };
      } catch (e) { c.statut = "erreur"; c.msg = e.message; }
      rendre();
    }
    nv.enCours = false; chapitres = null; rendre();
  }

  /* ---------- événements ---------- */
  document.addEventListener("submit", async (e) => {
    if (e.target.id !== "form-connexion") return;
    e.preventDefault(); erreur = ""; chargement = true;
    const email = $("#email").value.trim(), mdp = $("#mdp").value;
    emailSaisi = email;
    try { session = versSession(await appelAuth("token?grant_type=password", { email, password: mdp })); ecrireSession(session); chargement = false; vue = "accueil"; majQuota(); chargerAccueil(); }
    catch (err) { chargement = false; erreur = err.message; rendre(); }
  });
  document.addEventListener("change", async (e) => {
    const t = e.target;
    if (t.id === "matiere" && nv) nv.matiere = t.value;
    else if (t.id === "fichiers" && nv) {
      const fichiers = [...t.files].filter((f) => f.type.startsWith("image/")).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      t.value = "";
      let couchees = 0;
      for (const f of fichiers) {
        let rot = 0;
        try { const b = await createImageBitmap(f, { imageOrientation: "from-image" }); if (b.width > b.height) { rot = 90; couchees++; } if (b.close) b.close(); } catch (err) { /* dimension inconnue : on garde 0 */ }
        nv.cartes.push({ file: f, url: URL.createObjectURL(f), rot, statut: "attente", md: "", signaux: [], vue: "apercu" });
      }
      if (couchees) nv.msg = couchees + " photo" + (couchees > 1 ? "s étaient couchées" : " était couchée") + " : " + (couchees > 1 ? "je les ai pivotées" : "je l'ai pivotée") + " de 90°. Vérifie que le texte est bien droit sur la vignette, sinon touche ↻ avant de transcrire (une photo à l'envers donne un texte inventé).";
      rendre();
    }
  });
  document.addEventListener("input", (e) => {
    const t = e.target;
    if (t.id === "titre" && nv) nv.titre = t.value;
    else if (t.dataset && t.dataset.a === "cedit") courant.pages[+t.dataset.i].markdown = t.value;
  });
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-a]");
    if (!b) return;
    const a = b.dataset.a, i = +b.dataset.i;
    if (a === "voirmdp") { const m = $("#mdp"), v = m.type === "password"; m.type = v ? "text" : "password"; b.textContent = v ? "Masquer le mot de passe" : "Afficher le mot de passe"; return; }
    try {
      if (a === "sortir") deconnexion();
      else if (a === "accueil") { vue = "accueil"; courant = null; erreur = ""; if (!chapitres) chargerAccueil(); else rendre(); }
      else if (a === "nouveau") { nv = nouveau(); vue = "nouveau"; rendre(); }
      else if (a === "nterminer") { if (nv.chapitreId) ouvrir(nv.chapitreId, { titre: nv.titre, matiere: nv.matiere }); else { vue = "accueil"; if (!chapitres) chargerAccueil(); else rendre(); } }
      else if (a === "ajouter") {
        nv = nouveau(); nv.ajout = true; nv.chapitreId = courant.id; nv.matiere = courant.matiere; nv.titre = courant.titre;
        nv.prochain = courant.pages.reduce((m, p) => Math.max(m, p.numero), 0) + 1; vue = "nouveau"; rendre();
      }
      else if (a === "cpage") copier(courant.pages[i].markdown.trim() + "\n", b);
      else if (a === "ouvrir") ouvrir(b.dataset.id);
      else if (a === "go") transcrireTout();
      else if (a === "nrot") { nv.cartes[i].rot = (nv.cartes[i].rot + 90) % 360; rendre(); }
      else if (a === "nsup") { URL.revokeObjectURL(nv.cartes[i].url); nv.cartes.splice(i, 1); rendre(); }
      else if (a === "nhaut" && i > 0) { [nv.cartes[i - 1], nv.cartes[i]] = [nv.cartes[i], nv.cartes[i - 1]]; rendre(); }
      else if (a === "nbas" && i < nv.cartes.length - 1) { [nv.cartes[i + 1], nv.cartes[i]] = [nv.cartes[i], nv.cartes[i + 1]]; rendre(); }
      else if (a === "cvue") { courant.pages[i].vue = b.dataset.v; rendre(); }
      else if (a === "cphoto") { const p = courant.pages[i]; if (p.photo) { URL.revokeObjectURL(p.photo); p.photo = null; } else p.photo = await lirePhoto(p.photo_path); rendre(); }
      else if (a === "csave") { const p = courant.pages[i]; await rest("pages?id=eq." + p.id, { methode: "PATCH", corps: { markdown: p.markdown, statut: "relu" } }); p.statut = "relu"; rendre(); }
      else if (a === "copiertout") copier(assembler(courant.titre, courant.matiere, courant.pages), b);
      else if (a === "telechargertout") telecharger(courant.titre, assembler(courant.titre, courant.matiere, courant.pages));
      else if (a === "supprimer") {
        if (!confirm("Supprimer ce chapitre, ses textes et ses photos ? Cette action est définitive.")) return;
        await supprimerPhotos(courant.pages.map((p) => p.photo_path).filter(Boolean));
        await rest("chapitres?id=eq." + courant.id, { methode: "DELETE" });
        courant = null; chapitres = null; vue = "accueil"; chargerAccueil();
      }
    } catch (err) { erreur = err.message; rendre(); }
  });

  rendre();
  if (session) { majQuota(); chargerAccueil(); }
})();
