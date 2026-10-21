/* EatAndFit — diario alimentare, dal diario dell'app "Allenamento" (v2.9): pasti del giorno, obiettivi, archivio alimenti con codici a barre,
   Open Food Facts e lettura dei valori dalla foto dell'etichetta (OCR sul telefono, gratis). */
"use strict";

const MEALS = ["Colazione", "Spuntino Mattina", "Pranzo", "Spuntino Pomeriggio", "Cena", "Pre-Nanna"];
const NUTR = [["kcal", "Calorie", "kcal"], ["carb", "Carboidrati", "g"], ["sugar", "di cui zuccheri", "g"], ["fat", "Grassi", "g"],
  ["prot", "Proteine", "g"], ["fiber", "Fibre", "g"], ["sodium", "Sodio", "mg"]];
const WD = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
let DI = null;          // giorno aperto nel diario: { iso, pasti, ob }
let FA = null;          // pannello "aggiungi": { meal, seq, online }
let FQ = null;          // pannello quantità: { item, entry, per, unit, meal }
let FF = null;          // modulo alimento: { rec, meal, ocrText }
let RICAVATI = false, RIC2 = false, SCQ = false;

const mealIdx = (m) => { const i = MEALS.indexOf(m); return i < 0 ? 9 : i; };
const g1 = (x) => (Math.abs(x) < 10 ? fmt(r1(x)) : n0(x));
const foodName = (it) => (it.brand ? it.brand + " - " + it.name : it.name);
const baseTxt = (it) => (it.base === 100 ? `100 ${it.unit}` : `1 ${it.unit || "porzione"}`);
const sumP = (L, k) => L.reduce((a, p) => a + (Number(p[k]) || 0), 0);
const rid = () => Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) => b.toString(36).padStart(2, "0")).join("");

/* nomi italiani degli additivi più comuni (gli altri si mostrano col solo codice) */
const ADD_IT = { e100: "curcumina", e101: "riboflavina", e120: "cocciniglia (carminio)", e150a: "caramello", e150b: "caramello solfitico caustico", e150c: "caramello ammoniacale", e150d: "caramello solfito-ammoniacale",
  e160a: "caroteni", e160b: "annatto", e160c: "estratto di paprica", e162: "rosso di barbabietola", e170: "carbonato di calcio", e171: "biossido di titanio",
  e200: "acido sorbico", e202: "sorbato di potassio", e210: "acido benzoico", e211: "benzoato di sodio", e220: "anidride solforosa", e223: "metabisolfito di sodio", e224: "metabisolfito di potassio",
  e250: "nitrito di sodio", e251: "nitrato di sodio", e252: "nitrato di potassio", e260: "acido acetico", e262: "acetati di sodio", e270: "acido lattico", e281: "propionato di sodio", e282: "propionato di calcio", e290: "anidride carbonica", e296: "acido malico",
  e300: "acido ascorbico (vit. C)", e301: "ascorbato di sodio", e306: "tocoferoli (vit. E)", e307: "alfa-tocoferolo", e316: "eritorbato di sodio", e322: "lecitine", e322i: "lecitina", e325: "lattato di sodio", e327: "lattato di calcio",
  e330: "acido citrico", e331: "citrati di sodio", e332: "citrati di potassio", e333: "citrati di calcio", e334: "acido tartarico", e338: "acido fosforico", e339: "fosfati di sodio", e340: "fosfati di potassio", e341: "fosfati di calcio",
  e392: "estratto di rosmarino", e401: "alginato di sodio", e407: "carragenina", e410: "farina di semi di carrube", e412: "gomma di guar", e414: "gomma arabica", e415: "gomma di xantano", e417: "gomma di tara", e418: "gomma di gellano",
  e420: "sorbitolo", e422: "glicerolo", e440: "pectine", e450: "difosfati", e451: "trifosfati", e452: "polifosfati", e460: "cellulosa", e461: "metilcellulosa", e464: "idrossipropilmetilcellulosa", e466: "carbossimetilcellulosa",
  e471: "mono- e digliceridi degli acidi grassi", e472e: "esteri diacetiltartarici (DATEM)", e476: "poliricinoleato di poliglicerolo", e481: "stearoil-2-lattilato di sodio", e500: "carbonati di sodio (bicarbonato)", e501: "carbonati di potassio",
  e503: "carbonati di ammonio", e504: "carbonati di magnesio", e508: "cloruro di potassio", e509: "cloruro di calcio", e516: "solfato di calcio", e551: "biossido di silicio", e570: "acidi grassi", e575: "glucono-delta-lattone",
  e621: "glutammato monosodico", e627: "guanilato disodico", e631: "inosinato disodico", e635: "ribonucleotidi", e901: "cera d'api", e903: "cera carnauba", e904: "gommalacca", e938: "argon", e941: "azoto", e948: "ossigeno",
  e950: "acesulfame K", e951: "aspartame", e952: "ciclammati", e954: "saccarina", e955: "sucralosio", e960: "glicosidi steviolici", e965: "maltitolo", e967: "xilitolo", e968: "eritritolo",
  e1400: "destrina", e1404: "amido ossidato", e1412: "fosfato di diamido", e1414: "fosfato di diamido acetilato", e1420: "amido acetilato", e1422: "adipato di diamido acetilato", e1442: "fosfato di diamido idrossipropilato", e1450: "ottenilsuccinato di amido sodico" };
const addName = (c) => ADD_IT[c] || ADD_IT[c.replace(/[a-z]+$/, "")] || "";
const NOVA_T = { 1: "non trasformato o minimamente", 2: "ingrediente culinario", 3: "trasformato", 4: "ultra-trasformato" };
function scoreBadges(it) {
  const a = Array.isArray(it?.additivi) ? it.additivi : [];
  const b = [];
  if (it?.off_rif && (it.nutriscore || it.nova || a.length)) b.push(`<i class="apx" title="abbinato per marca e nome">≈</i>`);
  if (it?.nutriscore) b.push(`<i class="nsb ns-${it.nutriscore}" title="Nutri-Score">${it.nutriscore.toUpperCase()}</i>`);
  if (it?.nova) b.push(`<i class="nvb nv-${it.nova}" title="NOVA: ${NOVA_T[it.nova]}">N${it.nova}</i>`);
  if (it?.off_chk && (it.nutriscore || it.nova || a.length)) b.push(`<i class="adb ${a.length ? "" : "zero"}" title="additivi">${a.length ? a.length + " add." : "0 add."}</i>`);
  return b.length ? `<span class="badges">${b.join("")}</span>` : "";
}
function legendHtml(open) {
  return `<details class="legend2" ${open ? "open" : ""}><summary>ⓘ Cosa significano i badge</summary>
    <div class="lg"><b>Nutri-Score</b> — qualità nutrizionale per 100 g, da A (migliore) a E (peggiore). Penalizza calorie, zuccheri, grassi saturi e sale; premia fibre, proteine, frutta, verdura e legumi. Serve per confrontare prodotti simili (es. due cereali), non un olio con uno yogurt.
      <div class="lgr">${["a", "b", "c", "d", "e"].map((x) => `<i class="nsb ns-${x}">${x.toUpperCase()}</i>`).join("")}</div></div>
    <div class="lg"><b>NOVA</b> — quanto è lavorato l'alimento:
      <div class="lgl"><i class="nvb nv-1">N1</i> non trasformato o minimamente (carne, pesce, uova, riso, frutta, latte)</div>
      <div class="lgl"><i class="nvb nv-2">N2</i> ingrediente da cucina (olio, burro, zucchero, sale, miele)</div>
      <div class="lgl"><i class="nvb nv-3">N3</i> trasformato (formaggi, pane, conserve, tonno in scatola)</div>
      <div class="lgl"><i class="nvb nv-4">N4</i> ultra-trasformato (merendine, bibite, snack, prodotti con molti additivi o ingredienti industriali)</div></div>
    <div class="lg"><b>add.</b> — numero di additivi (codici E): l'elenco con i nomi è nella scheda dell'alimento. È solo il conteggio, non un giudizio.</div>
    <div class="rs">Dati da Open Food Facts.</div></details>`;
}
function scoreDetails(it) {
  const a = Array.isArray(it?.additivi) ? it.additivi : [];
  if (!it?.off_chk || (!it.nutriscore && !it.nova && !a.length))
    return it?.barcode ? `<div class="rs">Punteggi Open Food Facts non disponibili per questo prodotto.</div>`
      : `<div class="rs">Senza codice a barre: collega il codice (✎ Modifica alimento → 📷) per vedere Nutri-Score, NOVA e additivi.</div>`;
  return `<div class="scd">${it.nutriscore ? `<span><i class="nsb ns-${it.nutriscore}">${it.nutriscore.toUpperCase()}</i> Nutri-Score</span>` : ""}
    ${it.nova ? `<span><i class="nvb nv-${it.nova}">N${it.nova}</i> NOVA ${it.nova}: ${NOVA_T[it.nova]}</span>` : ""}
    <details><summary>${a.length ? `${a.length} ${a.length === 1 ? "additivo" : "additivi"}` : "Nessun additivo"}</summary>${a.map((c) => `<div class="rs">${c.toUpperCase()}${addName(c) ? " · " + esc(addName(c)) : ""}</div>`).join("")}</details>
    ${it.off_rif ? `<div class="rs">≈ Abbinato per marca e nome a: <b>${esc(it.off_rif)}</b>. Se non è il prodotto giusto: ✎ Modifica alimento → 📷 e scansiona il codice.</div>` : ""}
    <div class="rs">Dati Open Food Facts (controllati il ${dFmt(it.off_chk)}).</div>${legendHtml(false)}</div>`;
}

/* api(): in db.js (dati sul telefono e Open Food Facts) */

/* ---------- caricamento ---------- */
async function loadDiario(iso) {
  const [pasti, ob] = await Promise.all([
    pb.collection("pasti").getFullList({ filter: pb.filter("day = {:d}", { d: iso }), sort: "pos" }),
    pb.collection("obiettivi").getFirstListItem(pb.filter("from <= {:d} && (to >= {:d} || to = '')", { d: iso }), { sort: "-from" }).catch(() => null),
  ]);
  let al = await foodsOf(pasti);
  // alimenti MyFitnessPal importati dopo: si aggiungono all'archivio (una volta per sessione)
  if (!RIC2 && pasti.some((p) => p.source === "MyFitnessPal" && p.qty > 0 && !al[p.food])) {
    RIC2 = true; try { await api("/api/allenamento/alimenti/ricava", { method: "POST", body: "{}" }); al = await foodsOf(pasti); } catch {}
  }
  DI = { iso, pasti, ob, al };
  if (!RICAVATI) {                 // la prima volta: alimenti ricavati dallo storico MyFitnessPal
    RICAVATI = true;
    try {
      const a = await pb.collection("alimenti").getList(1, 1, { filter: 'source = "MyFitnessPal"', skipTotal: true });
      if (!a.items.length) await api("/api/allenamento/alimenti/ricava", { method: "POST", body: "{}" });
    } catch (e) { console.warn("ricava", e); }
  }
}
async function openDiario(iso) {
  S.view = "diario";
  await loadDiario(iso || DI?.iso || todayISO());
  renderDiario(); window.scrollTo(0, 0);
}
async function scoreVisible() {
  if (SCQ || !DI) return; SCQ = true;
  const iso = DI.iso, todo = [...new Map(Object.values(DI.al || {}).filter((a) => !a.off_chk).map((a) => [a.id, a])).values()].slice(0, 25);
  let n = 0;
  for (const a of todo) { try { const r = await api("/api/allenamento/alimenti/punteggi/" + a.id, { method: "POST", body: "{}" }); if (r.ok) n++; } catch {} }
  SCQ = false;
  if (n && S.view === "diario" && DI?.iso === iso) { DI.al = await foodsOf(DI.pasti); renderDiario(); }
}
async function refreshDiario() { await loadDiario(DI.iso); if (S.view === "diario") renderDiario(); }

/* alimento d'archivio di ogni riga del diario (stesso "Marca - Nome"): serve per Nutri-Score, NOVA e additivi */
async function foodsOf(pasti) {
  const map = {}, names = [...new Set(pasti.map((p) => p.food).filter(Boolean))];
  for (let i = 0; i < names.length; i += 20) {
    const P = {}, conds = names.slice(i, i + 20).map((f, j) => {
      const k = f.indexOf(" - ");
      P["n" + j] = k > 0 ? f.slice(k + 3) : f; P["b" + j] = k > 0 ? f.slice(0, k) : "";
      return `(name = {:n${j}} && brand = {:b${j}})`;
    });
    const L = await pb.collection("alimenti").getFullList({ filter: pb.filter(conds.join(" || "), P), fields: "id,name,brand,barcode,nutriscore,nova,additivi,off_chk,off_rif" }).catch(() => []);
    for (const a of L) { const f = foodName(a); if (!map[f] || (!map[f].off_chk && a.off_chk) || (!map[f].barcode && a.barcode)) map[f] = a; }
  }
  return map;
}

/* ---------- pagina del diario ---------- */
function goalOf(g) { return g.ob?.days?.[(new Date(g.iso + "T12:00:00").getDay() + 6) % 7] || null; }   // [kcal, carbo, proteine, grassi]
function macroBars(tot, goal) {
  const bar = (v, gl, lab, u) => `<div class="mac"><div class="macl"><span>${lab}</span><b>${n0(v)}${u}${gl ? ` <small>/ ${n0(gl)}${u}</small>` : ""}</b></div>
    ${gl ? `<i style="--p:${Math.min(100, v / gl * 100).toFixed(0)}%" class="${v > gl * 1.05 ? "over" : ""}"></i>` : ""}</div>`;
  return bar(tot.kcal, goal?.[0], "Calorie", " kcal") + bar(tot.carb, goal?.[1], "Carboidrati", " g") + bar(tot.prot, goal?.[2], "Proteine", " g") + bar(tot.fat, goal?.[3], "Grassi", " g");
}
function renderDiario() {
  const g = DI, d = new Date(g.iso + "T12:00:00"), goal = goalOf(g);
  const tot = {}; for (const [k] of NUTR) tot[k] = sumP(g.pasti, k);
  const meals = [...MEALS, ...[...new Set(g.pasti.map((p) => p.meal))].filter((m) => m && !MEALS.includes(m))];
  const rem = goal ? goal[0] - tot.kcal : null;
  $app.innerHTML = `
  <div class="bar">
    <h1>Alimentazione<span class="sub">${esc(d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" }))}</span></h1>
    <button class="ib" data-a="menu" title="Menu">⋯</button></div>
  <div class="gnav"><button class="btn ghost" data-a="di-move" data-n="-1">‹</button>
    <input class="e-in" type="date" id="di-date" value="${g.iso}">
    <button class="btn ghost" data-a="di-move" data-n="1">›</button></div>
  <div class="wrap">
    <div class="gcard dsum">
      ${rem != null ? `<div class="drem"><b>${n0(Math.abs(rem))}</b> kcal ${rem >= 0 ? "rimanenti" : "in più"}</div>` : ""}
      ${macroBars(tot, goal)}
      ${guideHtml(tot)}
      <div class="dbtns"><button class="chip" data-a="di-goals">🎯 Obiettivi${goal ? "" : " (non impostati)"}</button></div>
    </div>
    ${meals.map((m) => {
      const L = g.pasti.filter((p) => p.meal === m);
      if (!L.length && !MEALS.includes(m)) return "";
      if (!L.length) return `<div class="gcard dmeal dme"><b>${esc(m)}</b><span class="dbtns"><button class="chip" data-a="di-add" data-m="${esc(m)}">+ Aggiungi</button>
        <button class="chip" data-a="di-copy" data-m="${esc(m)}" title="Copia gli alimenti di questo pasto dal giorno prima">⧉ Come ieri</button></span></div>`;
      return `<div class="gcard dmeal"><div class="dmh"><b>${esc(m)}</b>${L.length ? `<span class="rs">${n0(sumP(L, "kcal"))} kcal · C ${n0(sumP(L, "carb"))} · P ${n0(sumP(L, "prot"))} · G ${n0(sumP(L, "fat"))}</span>` : ""}</div>
        ${L.map((p) => `<button class="ditem" data-a="di-item" data-id="${p.id}"><span class="dnr"><span class="dn">${esc(p.food)}</span>${scoreBadges(g.al?.[p.food])}</span>
          <span class="rs">${p.qty ? fmt(r1(p.qty)) + " " + esc(p.unit || "") + " · " : ""}${n0(p.kcal || 0)} kcal · C ${g1(p.carb || 0)} · P ${g1(p.prot || 0)} · G ${g1(p.fat || 0)}</span></button>`).join("")}
        <div class="dbtns"><button class="chip" data-a="di-add" data-m="${esc(m)}">+ Aggiungi</button>
          <button class="chip" data-a="di-copy" data-m="${esc(m)}" title="Copia gli alimenti di questo pasto dal giorno prima">⧉ Come ieri</button></div></div>`;
    }).join("")}
    ${legendHtml(false)}
  </div>`;
  scoreVisible();
}
document.addEventListener("change", (ev) => {
  if (ev.target.id !== "di-date" || S.view !== "diario" || !ev.target.value) return;
  openDiario(ev.target.value).catch((e) => toast("Errore: " + e.message));
});

/* fibre, zuccheri e sodio rispetto alle linee guida (solo indicazione, non obiettivi) */
function guideRows(t) {
  const k = t.kcal, fd = k ? t.fiber / k * 1000 : 0, sp = k ? t.sugar * 4 / k * 100 : 0;
  return [
    ["Fibre", `${g1(t.fiber)} g`, k ? `${fmt(r1(fd))} g/1000 kcal` : "",
      t.fiber >= 25 && fd >= 12.6 ? ["ok", "in linea"] : t.fiber >= 25 ? ["mid", "ok il minimo, bassa per le kcal"] : ["low", "sotto"],
      `almeno 25 g; 12,6–16,7 g ogni 1000 kcal${k ? ` (≈ ${n0(k * 0.0126)}–${n0(k * 0.0167)} g oggi)` : ""}`],
    ["Zuccheri", `${g1(t.sugar)} g`, k ? `${n0(sp)}% delle kcal` : "",
      sp <= 15 ? ["ok", "in linea"] : sp <= 20 ? ["mid", "un po' sopra"] : ["high", "sopra"],
      "sotto il 15% delle calorie (zuccheri totali)"],
    ["Sodio", `${n0(t.sodium)} mg`, `≈ ${fmt(r1(t.sodium * 2.5 / 1000))} g di sale`,
      t.sodium <= 2000 ? ["ok", "in linea"] : t.sodium <= 3500 ? ["mid", "sopra il generale, ok se sudi molto"] : ["high", "alto"],
      "circa 2.000 mg (5 g di sale); chi si allena e suda molto ne perde di più"],
  ];
}
function guideHtml(t) {
  if (!t.kcal) return "";
  return `<details class="guide"><summary>${guideRows(t).map(([l, v, , [c]]) => `<span><i class="gd ${c}"></i>${l} <b>${v}</b></span>`).join("")}</summary>
    ${guideRows(t).map(([l, v, x, [, w], ref]) => `<div class="gr"><b>${l}</b> ${v}${x ? ` · ${x}` : ""} — <span class="${w === "in linea" ? "" : "warn2"}">${w}</span><div class="rs">Riferimento: ${ref}</div></div>`).join("")}
    <div class="rs">Linee guida LARN (SINU) per adulti; per chi si allena contano soprattutto i macro: fibre e zuccheri si possono ridurre vicino agli allenamenti e alla gara, il sodio perso col sudore va reintegrato. Solo un'indicazione, non un obiettivo.</div></details>`;
}

/* ---------- aggiungi: ricerca, recenti, online ---------- */
function showAdd(meal) {
  FA = { meal, seq: 0, online: [] };
  $sheet.innerHTML = `<div class="in fsheet"><h2>Aggiungi a ${esc(meal)}</h2>
    <div class="fbtns"><button class="btn" data-a="f-scan">📷 Codice a barre</button><button class="btn ghost" data-a="f-new">✎ Nuovo alimento</button></div>
    <input id="fq" class="e-in fq" type="search" placeholder="🔍 Cerca (es. basmati, skyr, olio)" autocomplete="off" enterkeyhint="search">
    <div id="fres"><div class="rs">Caricamento…</div></div>
    <button class="btn ghost" data-a="close">Chiudi</button></div>`;
  $sheet.hidden = false;
  searchLocal("");
}
function foodRow(it, a, extra) {
  return `<button class="frow" data-a="${a}" ${extra}><span class="dn">${esc(it.name)}</span>
    <span class="rs">${it.brand ? esc(it.brand) + " · " : ""}${n0(it.kcal)} kcal per ${esc(baseTxt(it))}${it.source === "Open Food Facts" ? " · OFF" : it.source === "Mio" ? " · mio" : it.source === "Roberto" ? " · da Roberto" : ""}${it.uses ? " · ★" : ""}</span>${scoreBadges(it)}</button>`;
}
async function searchLocal(q) {
  const seq = ++FA.seq, box = () => document.getElementById("fres");
  const ws = q.trim().split(/\s+/).filter(Boolean).slice(0, 5), P = {};
  let filter = "", sort = "-uses,-last,name";
  if (ws.length) { filter = ws.map((w, i) => { P["w" + i] = w; return `(name ~ {:w${i}} || brand ~ {:w${i}} || barcode = {:w${i}})`; }).join(" && "); }
  else { filter = "last != ''"; sort = "-last,-uses"; }
  const r = await pb.collection("alimenti").getList(1, 40, { filter: pb.filter(filter, P), sort, skipTotal: true });
  if (seq !== FA.seq || !box()) return;
  box().innerHTML = `${ws.length ? "" : `<div class="hsec">Usati di recente</div>`}
    ${r.items.map((it) => foodRow(it, "f-pick", `data-id="${it.id}"`)).join("") || `<div class="rs fem">${ws.length ? "Nessun alimento trovato tra i tuoi." : "Ancora nessun alimento usato."}</div>`}
    ${ws.length ? `<button class="btn ghost" data-a="f-online">🌐 Cerca «${esc(q.trim())}» su Open Food Facts</button>` : ""}`;
}
async function searchOnline() {
  const q = document.getElementById("fq")?.value.trim(); if (!q) return;
  const box = document.getElementById("fres");
  box.innerHTML = `<div class="rs">Cerco su Open Food Facts…</div>`;
  try {
    const r = await api("/api/allenamento/alimenti/online?q=" + encodeURIComponent(q));
    FA.online = r.items;
    box.innerHTML = `<div class="hsec">Open Food Facts</div>${r.items.map((it, i) => foodRow(it, "f-pick-on", `data-i="${i}"`)).join("") || `<div class="rs fem">Nessun prodotto trovato.</div>`}
      <button class="btn ghost" data-a="f-new">✎ Inseriscilo tu</button>`;
  } catch (e) { box.innerHTML = `<div class="rs fem">${esc(e.message)}</div><button class="btn ghost" data-a="f-new">✎ Inseriscilo tu</button>`; }
}
document.addEventListener("input", (ev) => {
  if (ev.target.id === "fq" && FA) qDeb(ev.target.value);
  if (ev.target.id === "fqty" || ev.target.id === "fmeal") qtyPreview();
  if (ev.target.closest?.("#ffm")) ffCheck();
});
const qDeb = debounce((v) => searchLocal(v).catch((e) => toast("Errore: " + e.message)), 250);
document.addEventListener("keydown", (ev) => { if (ev.target.id === "fq" && ev.key === "Enter") { ev.preventDefault(); ev.target.blur(); } });

/* ---------- quantità (nuovo alimento nel diario o modifica di una riga) ---------- */
function showQty(item, opt = {}) {
  const entry = opt.entry || null;
  let per, unit, qty;
  if (item) {
    per = {}; for (const [k] of NUTR) per[k] = (Number(item[k]) || 0) / (item.base || 100);
    unit = item.unit || "g"; qty = entry?.qty || item.serving || (item.base === 100 ? 100 : 1);
  } else {
    const q0 = Number(entry.qty) || 1; per = {}; for (const [k] of NUTR) per[k] = (Number(entry[k]) || 0) / q0;
    unit = entry.unit || ""; qty = entry.qty || 1;
  }
  FQ = { item, entry, per, unit, meal: opt.meal || entry?.meal || MEALS[0] };
  const chips = [];
  if (item?.serving_label && item.serving) chips.push([item.serving, "Porzione: " + item.serving_label]);
  if (item?.base === 100) for (const v of [50, 100, 150, 200]) chips.push([v, v + " " + unit]);
  const meals = MEALS.includes(FQ.meal) ? MEALS : [...MEALS, FQ.meal];
  $sheet.innerHTML = `<div class="in fsheet"><h2>${esc(item ? item.name : entry.food)}</h2>
    ${item ? `<div class="rs">${item.brand ? esc(item.brand) + " · " : ""}per ${esc(baseTxt(item))}: ${n0(item.kcal)} kcal · C ${g1(item.carb)} · P ${g1(item.prot)} · G ${g1(item.fat)}${item.barcode ? " · " + esc(item.barcode) : ""}</div>${scoreDetails(item)}` : ""}
    ${!item && opt.info ? scoreDetails(opt.info) : ""}
    <div class="qrow"><input id="fqty" class="e-in big" type="text" inputmode="decimal" value="${esc(fmt(r1(qty)))}"><span class="qu">${esc(unit)}</span></div>
    ${chips.length ? `<div class="pchips">${chips.map(([v, l]) => `<button class="chip" data-a="f-q" data-v="${v}">${esc(l)}</button>`).join("")}</div>` : ""}
    <div class="lbl">Pasto</div><select id="fmeal" class="e-in">${meals.map((m) => `<option ${m === FQ.meal ? "selected" : ""}>${esc(m)}</option>`).join("")}</select>
    <div id="fprev" class="fprev"></div>
    <button class="btn" data-a="f-save">${entry ? "Salva" : "Aggiungi al diario"}</button>
    ${item ? `<button class="btn ghost" data-a="f-edit">✎ Modifica alimento</button>` : opt.info ? `<button class="btn ghost" data-a="f-edit-info" data-id="${opt.info.id}">✎ Modifica alimento${opt.info.barcode ? "" : " (collega il codice a barre)"}</button>` : ""}
    ${entry ? `<button class="btn danger" data-a="f-del">Elimina dal diario</button>` : ""}
    <button class="btn ghost" data-a="close">Annulla</button></div>`;
  $sheet.hidden = false;
  qtyPreview();
  if (!entry) setTimeout(() => { const i = document.getElementById("fqty"); i?.focus(); i?.select(); }, 60);
}
function qtyVals() {
  const q = num(document.getElementById("fqty")?.value), v = {};
  for (const [k] of NUTR) v[k] = Math.round(FQ.per[k] * q * 10) / 10;
  return { q, v };
}
function qtyPreview() {
  const box = document.getElementById("fprev"); if (!box || !FQ) return;
  const { q, v } = qtyVals();
  box.innerHTML = q > 0 ? `<div class="fk"><b>${n0(v.kcal)}</b> kcal</div>
    <div class="gst"><span>C <b>${g1(v.carb)}</b></span><span>P <b>${g1(v.prot)}</b></span><span>G <b>${g1(v.fat)}</b></span><span>Fibre <b>${g1(v.fiber)}</b></span><span>Zucch. <b>${g1(v.sugar)}</b></span><span>Sodio <b>${n0(v.sodium)} mg</b></span></div>` : `<div class="rs">Scrivi la quantità</div>`;
}
function nextPos(meal) {
  const L = DI.pasti.filter((p) => p.meal === meal);
  return mealIdx(meal) + Math.min(0.999, (L.length + 1) / 1000);
}
async function qtySave() {
  const { q, v } = qtyVals(); if (!(q > 0)) return toast("Scrivi la quantità");
  const meal = document.getElementById("fmeal").value, { item, entry } = FQ;
  const data = { qty: q, unit: FQ.unit, meal, ...v };
  if (entry) {
    if (meal !== entry.meal) data.pos = nextPos(meal);
    await pb.collection("pasti").update(entry.id, data);
  } else {
    await pb.collection("pasti").create({ ...data, day: DI.iso, pos: nextPos(meal), food: foodName(item), source: "Diario", ext: "app|" + rid() });
  }
  if (item) await pb.collection("alimenti").update(item.id, { "uses+": 1, last: DI.iso > (item.last || "") ? DI.iso : item.last, serving: q });
  closeSheet(); await refreshDiario(); toast(entry ? "Salvato" : "Aggiunto");
}

/* ---------- alimento: nuovo, modifica, valori dalla foto ---------- */
function showFoodForm(pre = {}, opt = {}) {
  FF = { rec: pre.id ? pre : (opt.rec || null), meal: opt.meal || null, ocrText: "" };
  const v = (k) => (pre[k] != null && pre[k] !== "" ? esc(fmt(pre[k])) : "");
  const per = pre.base === 1 ? "u" : pre.unit === "ml" ? "ml" : "g";
  const sale = pre.sodium ? fmt(Math.round(pre.sodium / 1000 * 2.5 * 100) / 100) : "";
  $sheet.innerHTML = `<div class="in fsheet" id="ffm"><h2>${FF.rec ? "Modifica alimento" : "Nuovo alimento"}</h2>
    ${opt.msg ? `<div class="pwbad">${esc(opt.msg)}</div>` : ""}
    <div class="lbl">Leggi i valori dalla foto dell'etichetta</div>
    <div class="g2 ocrg"><label class="mbtn ocrb">📷 Scatta foto<input type="file" class="ff-photo" accept="image/*" capture="environment" hidden></label>
      <label class="mbtn ocrb">🖼 Dalla galleria<input type="file" class="ff-photo" accept="image/*" hidden></label></div>
    <div class="lbl">Nome</div><input class="e-in" id="ff-name" value="${esc(pre.name || "")}" placeholder="es. Skyr bianco">
    <div class="g2"><div><div class="lbl">Marca</div><input class="e-in" id="ff-brand" value="${esc(pre.brand || "")}"></div>
      <div><div class="lbl">Codice a barre</div><div class="qrow" style="margin:0"><input class="e-in" id="ff-code" inputmode="numeric" value="${esc(pre.barcode || "")}"><button class="chip" data-a="ff-scan" title="Leggi il codice con la fotocamera">📷</button></div></div></div>
    <div class="lbl">Valori riferiti a</div>
    <div class="seg" id="ff-per">${[["g", "100 g"], ["ml", "100 ml"], ["u", "1 porzione/pezzo"]].map(([k, l]) => `<button type="button" data-a="ff-per" data-v="${k}" class="${k === per ? "on" : ""}">${l}</button>`).join("")}</div>
    <div id="ff-uw" ${per === "u" ? "" : "hidden"}><div class="lbl">Nome dell'unità</div><input class="e-in" id="ff-unit" value="${esc(per === "u" ? pre.unit || "porzione" : "porzione")}" placeholder="es. uovo, fetta, capsula"></div>
    <div class="ffg">
      <label>Calorie (kcal)<input class="e-in" id="ff-kcal" inputmode="decimal" value="${v("kcal")}"></label>
      <label>Carboidrati (g)<input class="e-in" id="ff-carb" inputmode="decimal" value="${v("carb")}"></label>
      <label>di cui zuccheri (g)<input class="e-in" id="ff-sugar" inputmode="decimal" value="${v("sugar")}"></label>
      <label>Grassi (g)<input class="e-in" id="ff-fat" inputmode="decimal" value="${v("fat")}"></label>
      <label>Proteine (g)<input class="e-in" id="ff-prot" inputmode="decimal" value="${v("prot")}"></label>
      <label>Fibre (g)<input class="e-in" id="ff-fiber" inputmode="decimal" value="${v("fiber")}"></label>
      <label>Sale (g)<input class="e-in" id="ff-salt" inputmode="decimal" value="${sale}"></label>
      <label>Porzione abituale<input class="e-in" id="ff-serv" inputmode="decimal" value="${v("serving")}" placeholder="es. 30"></label>
    </div>
    <div id="ff-chk" class="rs"></div>
    <details id="ff-raw" hidden><summary class="rs">Testo letto dalla foto</summary><pre class="pre rs"></pre></details>
    <button class="btn" data-a="ff-save">Salva${FF.meal ? " e scegli la quantità" : ""}</button>
    ${FF.rec ? `<button class="btn danger" data-a="ff-del">Elimina alimento</button>` : ""}
    <button class="btn ghost" data-a="close">Annulla</button></div>`;
  $sheet.hidden = false;
  ffCheck();
}
const ffv = (id) => document.getElementById("ff-" + id)?.value.trim() || "";
function ffPer() { return document.querySelector("#ff-per button.on")?.dataset.v || "g"; }
function ffCheck() {
  const box = document.getElementById("ff-chk"); if (!box) return;
  const c = Etichetta.check({ kcal: num(ffv("kcal")), carb: num(ffv("carb")), fat: num(ffv("fat")), prot: num(ffv("prot")), fiber: num(ffv("fiber")) });
  box.innerHTML = c ? (c.ok ? `✓ Calorie coerenti con i macro (≈ ${c.est} kcal)` : `<span class="warn">⚠ Dai macro risultano ≈ ${c.est} kcal: controlla i valori</span>`) : "";
}
async function ffSave() {
  const name = ffv("name"); if (!name) return toast("Scrivi il nome");
  if (ffv("kcal") === "") return toast("Scrivi le calorie");
  const per = ffPer(), code = ffv("code").replace(/\D/g, "");
  const data = { name, brand: ffv("brand"), barcode: code, base: per === "u" ? 1 : 100, unit: per === "u" ? ffv("unit") || "porzione" : per,
    kcal: num(ffv("kcal")), carb: num(ffv("carb")), sugar: num(ffv("sugar")), fat: num(ffv("fat")), prot: num(ffv("prot")), fiber: num(ffv("fiber")),
    sodium: Math.round(num(ffv("salt")) / 2.5 * 1000 * 10) / 10, serving: num(ffv("serv")), source: "Mio" };
  if (data.serving && !FF.rec?.serving_label) data.serving_label = fmt(data.serving) + " " + (per === "u" ? data.unit : per);
  let rec;
  const write = () => (FF.rec ? pb.collection("alimenti").update(FF.rec.id, data) : pb.collection("alimenti").create(data));
  try { rec = await write(); }
  catch (e) {
    if (!code || !/barcode|unique/i.test(JSON.stringify(e.data || e.message))) throw e;
    const other = await pb.collection("alimenti").getFirstListItem(pb.filter("barcode = {:b}", { b: code })).catch(() => null);
    if (!other || other.source !== "Open Food Facts" || other.uses) return toast(`Questo codice a barre è già in archivio${other ? ": " + other.name : ""}`);
    // il codice era di un prodotto Open Food Facts mai usato: lo sostituisce il tuo (con i suoi punteggi)
    Object.assign(data, { nutriscore: other.nutriscore || "", nova: other.nova || 0, additivi: other.additivi || [], off_chk: other.off_chk || "" });
    await pb.collection("alimenti").delete(other.id); rec = await write();
  }
  if (code && (code !== (FF.rec?.barcode || "") || !rec.off_chk)) { try { rec = (await api("/api/allenamento/alimenti/punteggi/" + rec.id, { method: "POST", body: "{}" })).item; } catch {} }
  toast("Alimento salvato");
  if (FF.meal) return showQty(rec, { meal: FF.meal });
  if (FQ?.item && FQ.item.id === rec.id) return showQty(rec, { meal: FQ.meal });
  closeSheet();
  if (S.view === "diario") await refreshDiario();
}

/* ---------- lettura dell'etichetta (Tesseract sul telefono) ---------- */
let OCRW = null, OCRP = null;
function loadScript(src) {
  return new Promise((ok, ko) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => ko(new Error("file " + src + " non trovato")); document.head.appendChild(s); });
}
async function ocrWorker(onProg) {
  OCRP = onProg;
  if (OCRW) return OCRW;
  if (!window.Tesseract) await loadScript("ocr/tesseract.min.js?v=" + APP_VERSION);
  OCRW = await Tesseract.createWorker("ita+eng", 1, {
    workerPath: new URL("ocr/worker.min.js", location.href).href, corePath: new URL("ocr/", location.href).href, langPath: new URL("ocr/lang", location.href).href, gzip: true,
    logger: (m) => OCRP && OCRP(m),
  });
  await OCRW.setParameters({ tessedit_pageseg_mode: "6", preserve_interword_spaces: "1" });
  return OCRW;
}
function ocrOverlay() {
  let ov = document.getElementById("ocrov");
  if (!ov) { ov = document.createElement("div"); ov.id = "ocrov"; ov.className = "ocrov"; document.body.appendChild(ov); }
  ov.hidden = false; return ov;
}
async function ocrStart(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const ov = ocrOverlay();
  ov.innerHTML = `<div class="ocrin"><h2>Seleziona la tabella</h2>
    <div class="rs">Trascina un rettangolo attorno ai valori nutrizionali (facoltativo: senza selezione legge tutta la foto).</div>
    <div class="ocrc"><canvas id="ocrcv"></canvas></div>
    <div id="ocrmsg" class="rs"></div>
    <button class="btn" data-a="ocr-go">Leggi i valori</button><button class="btn ghost" data-a="ocr-x">Annulla</button></div>`;
  const cv = document.getElementById("ocrcv"), W = Math.min(bmp.width, 1400), sc = W / bmp.width;
  cv.width = W; cv.height = Math.round(bmp.height * sc);
  const ctx = cv.getContext("2d");
  const st = { bmp, sc, sel: null, drag: null };
  const draw = () => {
    ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
    if (st.sel) {
      const { x, y, w, h } = st.sel;
      ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.fillRect(0, 0, cv.width, y); ctx.fillRect(0, y + h, cv.width, cv.height - y - h);
      ctx.fillRect(0, y, x, h); ctx.fillRect(x + w, y, cv.width - x - w, h);
      ctx.strokeStyle = "#E8B25A"; ctx.lineWidth = Math.max(3, cv.width / 200); ctx.strokeRect(x, y, w, h);
    }
  };
  const pt = (e) => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * cv.width / r.width, y: (e.clientY - r.top) * cv.height / r.height }; };
  cv.addEventListener("pointerdown", (e) => { cv.setPointerCapture(e.pointerId); st.drag = pt(e); st.sel = null; draw(); });
  cv.addEventListener("pointermove", (e) => {
    if (!st.drag) return; const p = pt(e);
    st.sel = { x: Math.min(p.x, st.drag.x), y: Math.min(p.y, st.drag.y), w: Math.abs(p.x - st.drag.x), h: Math.abs(p.y - st.drag.y) }; draw();
  });
  cv.addEventListener("pointerup", () => { st.drag = null; if (st.sel && (st.sel.w < 30 || st.sel.h < 30)) st.sel = null; draw(); });
  draw(); ov._st = st;
}
/* immagine da leggere: zona scelta, ridimensionata; "forte" = grigi, ingrandita e con più contrasto */
function ocrCanvas(st, strong) {
  const s = st.sel ? { x: st.sel.x / st.sc, y: st.sel.y / st.sc, w: st.sel.w / st.sc, h: st.sel.h / st.sc } : { x: 0, y: 0, w: st.bmp.width, h: st.bmp.height };
  let k = Math.min(1, 2000 / Math.max(s.w, s.h));
  if (s.w * k < 1000) k = Math.min(2, 1000 / s.w);
  if (strong) k = Math.min(k * 2, 2600 / Math.max(s.w, s.h));
  const c = document.createElement("canvas"); c.width = Math.round(s.w * k); c.height = Math.round(s.h * k);
  const x = c.getContext("2d", { willReadFrequently: true });
  x.imageSmoothingQuality = "high"; x.drawImage(st.bmp, s.x, s.y, s.w, s.h, 0, 0, c.width, c.height);
  if (strong) {
    const im = x.getImageData(0, 0, c.width, c.height), d = im.data, hist = new Uint32Array(256);
    for (let i = 0; i < d.length; i += 4) { const g = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 | 0; d[i] = g; hist[g]++; }
    const n = d.length / 4; let lo = 0, hi = 255, a = 0;
    while (lo < 255 && (a += hist[lo]) < n * 0.01) lo++;
    a = 0; while (hi > 0 && (a += hist[hi]) < n * 0.01) hi--;
    const f = 255 / Math.max(1, hi - lo);
    for (let i = 0; i < d.length; i += 4) { const g = Math.max(0, Math.min(255, (d[i] - lo) * f)); d[i] = d[i + 1] = d[i + 2] = g; }
    x.putImageData(im, 0, 0);
  }
  return c;
}
const better = (a, b) => (!a ? b : !b ? a : b.trovati !== a.trovati ? (b.trovati > a.trovati ? b : a) : ((b.coerenza ?? 9) < (a.coerenza ?? 9) ? b : a));
async function ocrGo() {
  const ov = document.getElementById("ocrov"), st = ov._st, msg = document.getElementById("ocrmsg");
  ov.querySelectorAll(".btn").forEach((b) => (b.disabled = true));
  const step = (t) => { msg.textContent = t; };
  try {
    let pass = "";
    const w = await ocrWorker((m) => {
      if (m.status === "recognizing text") step(`${pass}Lettura… ${Math.round((m.progress || 0) * 100)}%`);
      else if (/load|initializ/.test(m.status || "")) step("Preparo la lettura (solo la prima volta richiede qualche secondo)…");
    });
    pass = "";
    const r1t = (await w.recognize(ocrCanvas(st, false))).data.text;
    let best = { ...Etichetta.parse(r1t), text: r1t };
    if (best.trovati < 5 || best.coerenza == null || best.coerenza > 0.08) {
      pass = "Seconda lettura · ";
      const r2t = (await w.recognize(ocrCanvas(st, true))).data.text;
      best = better(best, { ...Etichetta.parse(r2t), text: r2t });
    }
    ov.hidden = true; ov.innerHTML = "";
    ocrFill(best);
  } catch (e) {
    console.error(e); step("Lettura non riuscita: " + (e.message || e));
    ov.querySelectorAll(".btn").forEach((b) => (b.disabled = false));
  }
}
function ocrFill(r) {
  const set = (id, v) => { const el = document.getElementById("ff-" + id); if (el && v != null && isFinite(v)) { el.value = fmt(Math.round(v * 100) / 100); el.classList.add("ocrd"); } };
  set("kcal", r.kcal); set("carb", r.carb); set("sugar", r.sugar); set("fat", r.fat); set("prot", r.prot); set("fiber", r.fiber);
  if (r.sodium != null) set("salt", r.sodium / 1000 * 2.5);
  if (r.serving && !ffv("serv")) set("serv", r.serving);
  const b = document.querySelector(`#ff-per button[data-v="${r.unit === "ml" ? "ml" : "g"}"]`);
  if (b && ffPer() !== "u") { document.querySelectorAll("#ff-per button").forEach((x) => x.classList.toggle("on", x === b)); }
  const raw = document.getElementById("ff-raw"); if (raw) { raw.hidden = false; raw.querySelector("pre").textContent = r.text; }
  ffCheck();
  toast(r.trovati ? `Letti ${r.trovati} valori: controllali prima di salvare` : "Non ho trovato valori: prova una foto più vicina e dritta", 4000);
}

/* ---------- codice a barre ---------- */
let SCAN = null;
function ffSnap() {
  const o = { id: FF.rec?.id, name: ffv("name"), brand: ffv("brand"), barcode: ffv("code"), base: ffPer() === "u" ? 1 : 100, unit: ffPer() === "u" ? ffv("unit") : ffPer() };
  for (const k of ["kcal", "carb", "sugar", "fat", "prot", "fiber", "serving"]) { const v = ffv(k === "serving" ? "serv" : k); o[k] = v === "" ? "" : num(v); }
  const sl = ffv("salt"); o.sodium = sl === "" ? "" : num(sl) / 2.5 * 1000;
  return o;
}
async function showScan(meal, onCode) {
  $sheet.innerHTML = `<div class="in fsheet"><h2>Codice a barre</h2>
    <div class="scanbox"><video id="scv" playsinline muted></video><i class="scanl"></i></div>
    <div class="rs" id="scmsg">Avvio la fotocamera…</div>
    <div class="qrow"><input id="sccode" class="e-in" inputmode="numeric" placeholder="oppure scrivi il numero sotto le barre"><button class="chip" data-a="f-code">Cerca</button></div>
    <button class="btn ghost" data-a="close">Chiudi</button></div>`;
  $sheet.hidden = false;
  SCAN = { meal, stop: false, stream: null, onCode };
  const msg = (t) => { const m = document.getElementById("scmsg"); if (m) m.textContent = t; };
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("La fotocamera non è disponibile");
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    if (!SCAN || SCAN.stop) { stream.getTracks().forEach((t) => t.stop()); return; }
    SCAN.stream = stream;
    const v = document.getElementById("scv"); v.srcObject = stream; await v.play();
    msg("Inquadra il codice a barre");
    const detect = await barcodeDetector();
    const loop = async () => {
      if (!SCAN || SCAN.stop) return;
      let code = null;
      try { code = await detect(v); } catch {}
      if (code && SCAN && !SCAN.stop) { navigator.vibrate?.(60); return lookupCode(code); }
      setTimeout(loop, 120);
    };
    loop();
  } catch (e) { msg((e.name === "NotAllowedError" ? "Permesso fotocamera negato. " : "") + (e.message || e) + " — puoi scrivere il numero qui sotto."); }
}
async function barcodeDetector() {
  const F = ["ean_13", "ean_8", "upc_a", "upc_e"];
  if ("BarcodeDetector" in window) {
    try {
      const ok = (await BarcodeDetector.getSupportedFormats()).filter((f) => F.includes(f));
      if (ok.length) { const d = new BarcodeDetector({ formats: ok }); return async (v) => (await d.detect(v))[0]?.rawValue || null; }
    } catch {}
  }
  if (!window.ZXing) await loadScript("zxing.min.js?v=" + APP_VERSION);
  const Z = window.ZXing, hints = new Map();
  hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E]);
  hints.set(Z.DecodeHintType.TRY_HARDER, true);
  const rd = new Z.MultiFormatReader(); rd.setHints(hints);
  const c = document.createElement("canvas"), x = c.getContext("2d", { willReadFrequently: true });
  return async (v) => {
    if (!v.videoWidth) return null;
    c.width = v.videoWidth; c.height = v.videoHeight; x.drawImage(v, 0, 0);
    try { return rd.decode(new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(c)))).getText(); }
    catch { return null; }
  };
}
function stopScan() { if (!SCAN) return; SCAN.stop = true; SCAN.stream?.getTracks().forEach((t) => t.stop()); SCAN = null; }
async function lookupCode(code) {
  const meal = SCAN?.meal || FA?.meal || MEALS[0], cb = SCAN?.onCode;
  stopScan();
  if (cb) return cb(String(code).replace(/\D/g, ""));
  code = String(code).replace(/\D/g, "");
  if (code.length < 6) return toast("Codice non valido");
  $sheet.innerHTML = `<div class="in fsheet"><h2>Codice ${esc(code)}</h2><div class="rs">Cerco il prodotto…</div></div>`; $sheet.hidden = false;
  const r = await api("/api/allenamento/alimenti/code/" + code);
  if (r.found) { if (r.nuovo) toast("Trovato su Open Food Facts e salvato", 3000); return showQty(r.item, { meal }); }
  showFoodForm({ barcode: code, name: r.partial?.name || "", brand: r.partial?.brand || "" }, { meal,
    msg: r.offline ? "Open Food Facts non raggiungibile (sei offline?): inserisci il prodotto (bastano i valori per 100 g), puoi leggerli dalla foto." :
      r.partial ? "Prodotto trovato su Open Food Facts ma senza valori nutrizionali: leggili dalla foto dell'etichetta." :
        "Prodotto non trovato: inseriscilo tu (resta salvato col suo codice). Puoi leggere i valori dalla foto dell'etichetta." });
}

/* ---------- obiettivi ---------- */
/* come MyFitnessPal: carboidrati, proteine e grassi (le calorie si calcolano: 4 / 4 / 9) e i giorni della settimana a cui valgono */
let GR = [];
const kOf = (g) => Math.round(4 * g.c + 4 * g.p + 9 * g.f);
function showGoals() {
  const cur = DI.ob?.days || [];
  GR = [];
  WD.forEach((_, i) => {
    const d = cur[i] || [0, 0, 0, 0], k = [d[1], d[2], d[3]].join("|");
    let g = GR.find((x) => x.k === k);
    if (!g) GR.push((g = { k, c: d[1] || 0, p: d[2] || 0, f: d[3] || 0, kc: d[0] || 0, days: [] }));
    g.days.push(i);
  });
  drawGoals();
}
function readGoals() {
  document.querySelectorAll("[data-gq]").forEach((el) => { GR[+el.dataset.gi][el.dataset.gq] = num(el.value); });
}
function drawGoals() {
  const y = $sheet.querySelector(".in")?.scrollTop || 0, from = document.getElementById("g-from")?.value || DI.iso;
  const free = WD.map((_, i) => i).filter((i) => !GR.some((g) => g.days.includes(i)));
  $sheet.innerHTML = `<div class="in fsheet"><h2>Obiettivi giornalieri</h2>
    <div class="rs">${DI.ob ? `In vigore dal ${dFmt(DI.ob.from)} (${esc(DI.ob.source || "")}).` : "Nessun obiettivo per questo giorno."}
      Scrivi carboidrati, proteine e grassi e scegli i giorni in cui valgono. Le calorie si calcolano da sole (4 / 4 / 9 kcal per grammo).</div>
    ${GR.map((g, gi) => `<div class="gcard ggrp">
      <div class="ggin">
        <label>Carbo (g)<input class="e-in" inputmode="numeric" data-gi="${gi}" data-gq="c" value="${g.c || ""}"></label>
        <label>Proteine (g)<input class="e-in" inputmode="numeric" data-gi="${gi}" data-gq="p" value="${g.p || ""}"></label>
        <label>Grassi (g)<input class="e-in" inputmode="numeric" data-gi="${gi}" data-gq="f" value="${g.f || ""}"></label>
      </div>
      <div class="ggk" id="ggk-${gi}"><b>${n0(kOf(g))}</b> kcal${g.kc && Math.abs(g.kc - kOf(g)) > 5 ? ` <span class="rs">(prima ${n0(g.kc)})</span>` : ""}</div>
      <div class="gdays">${WD.map((d, i) => `<button class="chip ${g.days.includes(i) ? "on" : ""}" data-a="g-day" data-gi="${gi}" data-d="${i}">${d}</button>`).join("")}</div>
      ${GR.length > 1 ? `<button class="lnk rs" data-a="g-rm" data-gi="${gi}">Elimina questi valori</button>` : ""}
    </div>`).join("")}
    ${free.length ? `<div class="pwbad">Giorni senza obiettivo: ${free.map((i) => WD[i]).join(", ")}</div>` : ""}
    <button class="btn ghost" data-a="g-add">+ Altri valori (es. giorni OFF)</button>
    <div class="lbl">Valido dal</div><input class="e-in" type="date" id="g-from" value="${from}">
    <button class="btn" data-a="g-save">Salva obiettivi</button><button class="btn ghost" data-a="close">Annulla</button></div>`;
  $sheet.hidden = false; $sheet.querySelector(".in").scrollTop = y;
}
document.addEventListener("input", (ev) => {
  const t = ev.target; if (!t.dataset?.gq) return;
  GR[+t.dataset.gi][t.dataset.gq] = num(t.value);
  const g = GR[+t.dataset.gi], el = document.getElementById("ggk-" + t.dataset.gi); if (el) el.innerHTML = `<b>${n0(kOf(g))}</b> kcal`;
});
async function saveGoals() {
  readGoals();
  if (WD.some((_, i) => !GR.some((g) => g.days.includes(i)))) return toast("Assegna tutti i giorni della settimana");
  const days = WD.map((_, i) => { const g = GR.find((x) => x.days.includes(i)); return [kOf(g), g.c, g.p, g.f]; });
  const from = document.getElementById("g-from").value || DI.iso;
  if (days.every((d) => !d[0])) return toast("Scrivi carboidrati, proteine e grassi");
  const old = await pb.collection("obiettivi").getFullList({ filter: pb.filter("from < {:f} && (to = '' || to >= {:f})", { f: from }) });
  for (const o of old) await pb.collection("obiettivi").update(o.id, { to: isoAdd(from, -1) });
  const next = await pb.collection("obiettivi").getFirstListItem(pb.filter("from > {:f}", { f: from }), { sort: "from" }).catch(() => null);
  const data = { from, to: next ? isoAdd(next.from, -1) : "", days, source: "Diario" };
  const same = await pb.collection("obiettivi").getFirstListItem(pb.filter("from = {:f} && source = 'Diario'", { f: from })).catch(() => null);
  if (same) await pb.collection("obiettivi").update(same.id, data); else await pb.collection("obiettivi").create(data);
  closeSheet(); await refreshDiario(); toast("Obiettivi salvati");
}

let OFFT = null;

/* ---------- azioni ---------- */
async function ciboClick(a, t) {
  switch (a) {
    case "di-open": $sheet.hidden = true; return openDiario(t.dataset.d || todayISO());
    case "di-move": return openDiario(isoAdd(DI.iso, +t.dataset.n));
    case "di-add": return showAdd(t.dataset.m);
    case "di-item": { const p = DI.pasti.find((x) => x.id === t.dataset.id); if (p) showQty(null, { entry: p, info: DI.al?.[p.food] }); return; }
    case "di-goals": return showGoals();
    case "di-copy": {
      const m = t.dataset.m, prev = isoAdd(DI.iso, -1);
      const L = await pb.collection("pasti").getFullList({ filter: pb.filter("day = {:d} && meal = {:m}", { d: prev, m }), sort: "pos" });
      if (!L.length) return toast(`Ieri non c'era nulla in ${m}`);
      for (const p of L) {
        await pb.collection("pasti").create({ day: DI.iso, meal: m, pos: nextPos(m), food: p.food, qty: p.qty, unit: p.unit, kcal: p.kcal, carb: p.carb, fat: p.fat,
          prot: p.prot, fiber: p.fiber, sugar: p.sugar, sodium: p.sodium, source: "Diario", ext: "app|" + rid() });
        DI.pasti.push({ meal: m });
      }
      await refreshDiario(); toast(`Copiati ${L.length} alimenti da ieri`); return;
    }
    case "f-pick": return showQty(await pb.collection("alimenti").getOne(t.dataset.id), { meal: FA.meal });
    case "f-online": return searchOnline();
    case "f-pick-on": { const r = await api("/api/allenamento/alimenti/salva", { method: "POST", body: JSON.stringify(FA.online[+t.dataset.i]) }); return showQty(r.item, { meal: FA.meal }); }
    case "f-new": return showFoodForm({ name: document.getElementById("fq")?.value.trim() || "" }, { meal: FA?.meal || MEALS[0] });
    case "f-scan": return showScan(FA?.meal || MEALS[0]);
    case "f-code": return lookupCode(document.getElementById("sccode").value);
    case "f-q": { const i = document.getElementById("fqty"); i.value = fmt(t.dataset.v); qtyPreview(); return; }
    case "f-save": return qtySave();
    case "f-edit": return showFoodForm(FQ.item);
    case "f-edit-info": { const it = await pb.collection("alimenti").getOne(t.dataset.id); FQ = null; return showFoodForm(it); }
    case "f-del": if (!confirm("Eliminare questo alimento dal diario?")) return; await pb.collection("pasti").delete(FQ.entry.id); closeSheet(); await refreshDiario(); toast("Eliminato"); return;
    case "ff-per": document.querySelectorAll("#ff-per button").forEach((x) => x.classList.toggle("on", x === t)); document.getElementById("ff-uw").hidden = t.dataset.v !== "u"; return;
    case "ff-save": return ffSave();
    case "ff-scan": { const snap = ffSnap(), rec = FF.rec, meal = FF.meal; return showScan(meal, (code) => showFoodForm({ ...snap, id: undefined, barcode: code }, { meal, rec })); }
    case "ff-del": if (!confirm("Eliminare l'alimento dall'archivio? Il diario non cambia.")) return; await pb.collection("alimenti").delete(FF.rec.id); closeSheet(); toast("Alimento eliminato"); return;
    case "ocr-go": return ocrGo();
    case "ocr-x": { const ov = document.getElementById("ocrov"); ov.hidden = true; ov.innerHTML = ""; return; }
    case "g-day": { readGoals(); const gi = +t.dataset.gi, d = +t.dataset.d, g = GR[gi];
      if (g.days.includes(d)) g.days = g.days.filter((x) => x !== d); else { GR.forEach((x) => (x.days = x.days.filter((y) => y !== d))); g.days.push(d); }
      return drawGoals(); }
    case "g-add": readGoals(); GR.push({ c: 0, p: 0, f: 0, kc: 0, days: [] }); drawGoals(); $sheet.querySelector(".in").scrollTop = 1e6; return;
    case "g-rm": readGoals(); GR.splice(+t.dataset.gi, 1); return drawGoals();
    case "g-save": return saveGoals();
  }
}
document.addEventListener("change", (ev) => {
  if (ev.target.classList?.contains("ff-photo") && ev.target.files.length) { const f = ev.target.files[0]; ev.target.value = ""; ocrStart(f).catch((e) => toast("Errore: " + e.message)); }
});
// chiudendo il pannello si spegne la fotocamera e si ferma l'aggiornamento dello stato
new MutationObserver(() => { if ($sheet.hidden) { stopScan(); clearTimeout(OFFT); } }).observe($sheet, { attributes: true, attributeFilter: ["hidden"] });
