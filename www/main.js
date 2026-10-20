/* EatAndFit — app Android (dati sul telefono): Oggi, Alimentazione, Peso e foto. */
"use strict";

const APP_VERSION = window.EAF_VERSION || "0.0.0";
const EAF_VERSION = APP_VERSION;
const REPO = "Roby5991/EatAndFit";
const $app = document.getElementById("app");
const $sheet = document.getElementById("sheet");
const $toast = document.getElementById("toast");
const S = { view: "hub" };
const NATIVE = !!window.Capacitor?.isNativePlatform?.();

/* ---------- utilità (come nell'app Allenamento) ---------- */
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function toast(msg, ms = 2200) { $toast.textContent = msg; $toast.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => ($toast.hidden = true), ms); }
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const dIn = (v) => (v ? String(v).slice(0, 10) : "");
const dFmt = (v) => { const x = dIn(v); return x ? `${x.slice(8, 10)}/${x.slice(5, 7)}/${x.slice(2, 4)}` : ""; };
function todayISO() { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
function num(v) { const n = parseFloat(String(v).replace(",", ".")); return isNaN(n) ? 0 : n; }
const fmt = (n) => String(n).replace(".", ",");
const r1 = (x) => Math.round(x * 10) / 10;
const n0 = (x) => Math.round(x).toLocaleString("it-IT");
const kgTxt = (x) => fmt(r1(x).toFixed(1));
const tLoc = (v) => new Date(String(v).replace(" ", "T"));
const dayKey = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const isoAdd = (iso, n) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return dayKey(d); };
const isoMinus = (iso, n) => new Date(Date.parse(iso) - n * 86400000).toISOString().slice(0, 10);
let FT = "";
const fileToken = async () => "";
const phUrl = (rec, f) => pb.files.getURL(rec, f);
function closeSheet() { $sheet.querySelectorAll("video").forEach((v) => v.pause()); $sheet.hidden = true; }
$sheet.addEventListener("click", (e) => { if (e.target === $sheet) closeSheet(); });
/* riduce le foto del telefono a max 1600 px JPEG prima di salvarle */
async function shrink(file) {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const sc = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.85));
    return blob ? new File([blob], (file.name || "foto").replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg", lastModified: file.lastModified }) : file;
  } catch { return file; }
}
function niceScale(lo, hi, n = 4) {
  if (hi - lo < 1e-9) { lo -= 5; hi += 5; }
  const raw = (hi - lo) / n, steps = [0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100];
  const st = steps.find((x) => x >= raw) || raw;
  return { lo: Math.floor(lo / st) * st, hi: Math.ceil(hi / st) * st, st };
}
function tipBox(host) { let t = host.querySelector(".tip"); if (!t) { t = document.createElement("div"); t.className = "tip"; t.hidden = true; host.appendChild(t); } return t; }
function showTip(host, x, lines) {
  const t = tipBox(host); t.replaceChildren();
  for (const [val, lab, color] of lines) {
    const row = document.createElement("div");
    if (color) { const k = document.createElement("i"); k.className = "lk"; k.style.background = color; row.appendChild(k); }
    const b = document.createElement("b"); b.textContent = val; row.appendChild(b);
    const sp = document.createElement("span"); sp.textContent = " " + lab; row.appendChild(sp);
    t.appendChild(row);
  }
  t.hidden = false;
  const w = t.offsetWidth, W = host.clientWidth;
  t.style.left = Math.max(0, Math.min(W - w, x - w / 2)) + "px";
}

/* ---------- peso ---------- */
let PW = { list: [] };
async function loadPeso() { PW.list = await pb.collection("peso").getFullList({ sort: "time" }); flagAnomalies(); }
/* pesata anomala: più del 5% dalla mediana delle 7 pesate valide precedenti (60 giorni); resta segnata finché non la accetti */
function flagAnomalies() {
  const good = [];
  for (const r of PW.list) {
    r._bad = false; if (!(r.kg > 0)) continue;
    const t = tLoc(r.time).getTime();
    const prev = good.filter((g) => g.t > t - 60 * 86400000).slice(-7).map((g) => g.kg).sort((a, b) => a - b);
    if (!r.ok && prev.length >= 3) { const med = prev[Math.floor(prev.length / 2)]; if (Math.abs(r.kg - med) / med > 0.05) { r._bad = true; continue; } }
    good.push({ t, kg: r.kg });
  }
}
function pesoDays() {
  const m = new Map();
  for (const r of PW.list) {
    if (!(r.kg > 0) || r._bad) continue;
    const d = tLoc(r.time), k = dayKey(d);
    if (!m.has(k)) m.set(k, { day: k, kg: r.kg, fat: r.fat || 0, d }); else if (!m.get(k).fat && r.fat) m.get(k).fat = r.fat;
  }
  const days = [...m.values()].sort((a, b) => a.day.localeCompare(b.day));
  for (const x of days) {
    const t = Date.parse(x.day), w = days.filter((y) => { const u = Date.parse(y.day); return u <= t && u > t - 7 * 86400000; });
    x.avg = w.reduce((a, y) => a + y.kg, 0) / w.length;
  }
  return days;
}
function avgBetween(days, from, to) { const w = days.filter((x) => x.day > from && x.day <= to); return w.length ? w.reduce((a, y) => a + y.kg, 0) / w.length : 0; }
function renderPeso() {
  const all = pesoDays(), rng = S.prng ?? (S.prng = 90), today = todayISO();
  const days = rng ? all.filter((x) => x.day > isoMinus(today, rng)) : all;
  const last = PW.list.filter((r) => r.kg > 0 && !r._bad).slice(-1)[0];
  const nBad = PW.list.filter((r) => r._bad).length;
  const a7 = avgBetween(all, isoMinus(today, 7), today), p7 = avgBetween(all, isoMinus(today, 14), isoMinus(today, 7));
  const diff = a7 && p7 ? a7 - p7 : null, hasFat = days.some((x) => x.fat > 0);
  const rows = [...PW.list].reverse();
  const wasOpen = new Set([...$app.querySelectorAll("details[data-pd][open]")].map((d) => d.dataset.pd));
  $app.innerHTML = `
  <div class="bar"><h1>Peso e foto<span class="sub">${last ? "ultima pesata " + esc(tLoc(last.time).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" })) : "nessuna pesata"}</span></h1>
    <button class="ib" data-a="menu" title="Menu">⋯</button></div>
  <div class="wrap">
    <h3 class="ch">Aggiungi pesata</h3>
    <div class="pwadd">
      <input class="e-in" type="date" id="pw-d" value="${today}" max="${today}">
      <input class="e-in" type="text" inputmode="decimal" id="pw-kg" placeholder="kg">
      <input class="e-in" type="text" inputmode="decimal" id="pw-fat" placeholder="grasso %">
      <button class="btn" data-a="pw-add" style="margin:0">+</button>
    </div>
    ${all.length ? `
    <div class="tiles2">
      <div class="tile"><div class="tl">Ultima pesata</div><div class="tv">${kgTxt(last.kg)} kg</div><div class="ts">${last.fat ? "grasso " + fmt(r1(last.fat)) + "%" : "&nbsp;"}</div></div>
      <div class="tile"><div class="tl">Media ultimi 7 giorni</div><div class="tv">${a7 ? kgTxt(a7) + " kg" : "—"}</div>
        <div class="ts">${diff == null ? "&nbsp;" : (diff > 0 ? "+" : diff < 0 ? "−" : "±") + kgTxt(Math.abs(diff)) + " kg sui 7 giorni prima"}</div></div>
    </div>
    <div class="seg" style="margin-top:8px">${[[30, "30 gg"], [90, "90 gg"], [365, "1 anno"], [0, "Tutto"]].map(([v, l]) => `<button class="${rng === v ? "on" : ""}" data-pw="rng" data-v="${v}">${l}</button>`).join("")}</div>
    <h3 class="ch">Peso (kg)</h3>
    <div class="legend"><span><i class="lk" style="background:var(--s2)"></i>Pesata del giorno</span><span><i class="lk" style="background:var(--s1)"></i>Media 7 giorni</span></div>
    <div class="chart" id="ch-peso"></div>
    ${hasFat ? `<h3 class="ch">Massa grassa (%)</h3><div class="chart" id="ch-fat"></div>` : ""}` : `<div class="empty">Ancora nessuna pesata: aggiungila qui sopra.</div>`}
    ${checksHtml()}
    ${nBad ? `<div class="pwbad">⚠ ${nBad === 1 ? "1 pesata anomala esclusa" : nBad + " pesate anomale escluse"} da grafico e medie (si scostano più del 5% dalle precedenti). In "Tutte le pesate": <b>Accetta</b> se è giusta, ✕ per eliminarla.</div>` : ""}
    ${rows.length ? `<details class="tbl" data-pd="list" ${wasOpen.has("list") || nBad ? "open" : ""}><summary>Tutte le pesate (${rows.length})</summary>
      <table class="pct pwl"><thead><tr><th>Data</th><th>kg</th><th>Grasso</th><th></th></tr></thead><tbody>
      ${rows.map((r) => { const d = tLoc(r.time); return `<tr class="${r._bad ? "bad" : ""}"><td>${esc(d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" }))}
          ${r._bad ? `<div class="rs"><b class="warn">⚠ anomala</b> <button class="chip sm" data-a="pw-ok" data-id="${r.id}">Accetta</button></div>` : ""}</td>
        <td>${r.kg ? kgTxt(r.kg) : "—"}</td><td>${r.fat ? fmt(r1(r.fat)) + "%" : "—"}</td>
        <td><button class="ib sm" data-a="pw-del" data-id="${r.id}" title="Elimina">✕</button></td></tr>`; }).join("")}
      </tbody></table></details>` : ""}
  </div>`;
  if (days.length) {
    drawPeso($app.querySelector("#ch-peso"), days, [["kg", "var(--s2)", "pesata", true], ["avg", "var(--s1)", "media 7 gg", false]], " kg");
    if (hasFat) drawPeso($app.querySelector("#ch-fat"), days.filter((x) => x.fat > 0), [["fat", "var(--s2)", "grasso", true]], "%");
  }
}
function drawPeso(host, rows, defs, unit) {
  const W = host.clientWidth, Hh = 200, m = { l: 42, r: 46, t: 14, b: 24 };
  const vals = rows.flatMap((r) => defs.map(([k]) => r[k])).filter((v) => v > 0);
  const sc = niceScale(Math.min(...vals), Math.max(...vals));
  const T = rows.map((r) => Date.parse(r.day)), t0 = T[0], t1 = T[T.length - 1];
  const X = (i) => t1 === t0 ? (m.l + (W - m.r)) / 2 : m.l + (T[i] - t0) / (t1 - t0) * (W - m.l - m.r);
  const Y = (v) => m.t + (sc.hi - v) / (sc.hi - sc.lo) * (Hh - m.t - m.b);
  const ticks = []; for (let v = sc.lo; v <= sc.hi + 1e-9; v += sc.st) ticks.push(v);
  let svg = `<svg width="${W}" height="${Hh}" role="img">`;
  svg += ticks.map((v) => `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}" class="gl"/><text x="${m.l - 6}" y="${Y(v) + 4}" text-anchor="end" class="ax">${fmt(v)}</text>`).join("");
  const nT = Math.max(2, Math.min(6, Math.floor((W - m.l - m.r) / 62) + 1)), yr = t1 - t0 > 330 * 86400000;
  for (let j = 0; j < nT; j++) {
    const t = t0 + (t1 - t0) * j / (nT - 1), d = new Date(t), x = m.l + (t1 === t0 ? 0.5 : j / (nT - 1)) * (W - m.l - m.r);
    const lab = yr ? `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}` : `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
    svg += `<text x="${x}" y="${Hh - 6}" text-anchor="${j === 0 ? "start" : j === nT - 1 ? "end" : "middle"}" class="ax">${lab}</text>`;
    if (t1 === t0) break;
  }
  const dots = rows.length <= 60;
  for (const [k, c, , dot] of defs) {
    const p = rows.map((r, i) => [i, r[k]]).filter(([, v]) => v > 0); if (!p.length) continue;
    svg += `<path d="${p.map(([i, v], j) => (j && T[i] - T[p[j - 1][0]] <= 30 * 86400000 ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1)).join(" ")}" style="fill:none;stroke:${c};stroke-width:${dot ? 1.5 : 2.5};stroke-linejoin:round;stroke-linecap:round${dot && defs.length > 1 ? ";opacity:.75" : ""}"/>`;
    if (dot && dots) svg += p.map(([i, v]) => `<circle cx="${X(i)}" cy="${Y(v)}" r="3" style="fill:${c};stroke:var(--card);stroke-width:1.5"/>`).join("");
  }
  const lastR = rows[rows.length - 1], lk = defs.length > 1 ? "avg" : defs[0][0];
  if (lastR[lk] > 0) svg += `<text x="${X(rows.length - 1) + 8}" y="${Y(lastR[lk]) + 4}" class="lbv">${fmt(r1(lastR[lk]))}</text>`;
  svg += `<line class="xh" x1="0" x2="0" y1="${m.t}" y2="${Hh - m.b}" style="display:none"/><rect x="0" y="0" width="${W}" height="${Hh}" fill="transparent" class="hit"/></svg>`;
  host.innerHTML = svg;
  const xh = host.querySelector(".xh"), hit = host.querySelector(".hit");
  const move = (ev) => {
    const bx = host.getBoundingClientRect(), px = ev.clientX - bx.left;
    let i = 0, d = 1e9; rows.forEach((_, j) => { const dd = Math.abs(X(j) - px); if (dd < d) { d = dd; i = j; } });
    xh.setAttribute("x1", X(i)); xh.setAttribute("x2", X(i)); xh.style.display = "";
    const r = rows[i];
    showTip(host, X(i), [[new Date(r.day + "T12:00:00").toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "2-digit", year: "2-digit" }), "", ""],
      ...defs.map(([k, c, l]) => [r[k] > 0 ? fmt(r1(r[k])) + unit : "—", l, c])]);
  };
  hit.addEventListener("pointermove", move); hit.addEventListener("pointerdown", move);
  hit.addEventListener("pointerleave", () => { xh.style.display = "none"; tipBox(host).hidden = true; });
}
async function pesoAdd() {
  const d = $app.querySelector("#pw-d").value, kg = num($app.querySelector("#pw-kg").value), fat = num($app.querySelector("#pw-fat").value);
  if (!d || !(kg > 20 && kg < 400)) return toast("Scrivi data e peso in kg");
  if (fat && !(fat > 0 && fat < 100)) return toast("Grasso % non valido");
  const t = d === todayISO() ? new Date() : new Date(d + "T08:00:00");
  await pb.collection("peso").create({ time: t.toISOString().replace("T", " "), kg, fat: fat || 0, source: "a mano", ok: false });
  await loadPeso(); renderPeso(); toast("Pesata aggiunta");
}
document.addEventListener("click", (ev) => { const t = ev.target.closest("[data-pw]"); if (!t || S.view !== "peso") return; S.prng = +t.dataset.v; renderPeso(); });
window.addEventListener("resize", debounce(() => { if (S.view === "peso") renderPeso(); }, 250));

/* ---------- foto dei check ---------- */
let CK = { list: [] };
async function loadChecks() { CK.list = await pb.collection("checks").getFullList({ sort: "-day" }).catch(() => []); }
const kgOn = (day) => pesoDays().find((x) => x.day === day)?.kg;
function checksHtml() {
  const L = CK.list;
  return `<h3 class="ch">Foto dei check</h3>
    <div class="g2"><label class="btn hfile" style="margin:0">📷 Nuovo check<input type="file" accept="image/*" multiple hidden data-chk="new"></label>
      <button class="btn ghost" data-a="chk-cmp" style="margin:0" ${L.length < 2 ? "disabled" : ""}>↔ Confronta</button></div>
    ${L.length ? L.map((c) => `<div class="gcard ckrow">
      <div class="ckh"><b>${esc(new Date(c.day + "T12:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" }))}</b>
        <span class="rs">${kgOn(c.day) ? kgTxt(kgOn(c.day)) + " kg · " : ""}${(c.foto || []).length} foto</span></div>
      ${c.note ? `<div class="rs">${esc(c.note)}</div>` : ""}
      <div class="tiles">${(c.foto || []).map((f, i) => `<button class="ph" data-a="chk-open" data-id="${c.id}" data-i="${i}"><img src="${esc(phUrl(c, f))}" alt="" loading="lazy"></button>`).join("")}</div>
    </div>`).join("") : `<div class="rs" style="margin:8px 2px">Ancora nessun check: carica le foto (anche vecchie: la data viene presa dalle foto).</div>`}`;
}
let CKNEW = null;
function chkNew(files, day) {
  const ds = [...new Set(files.map((f) => dayKey(new Date(f.lastModified || Date.now()))))];
  CKNEW = { files };
  const def = day || (ds.length === 1 ? ds[0] : todayISO());
  $sheet.innerHTML = `<div class="in"><h2>Nuovo check · ${files.length} foto</h2>
    <div class="tiles" id="ck-prev"></div>
    <div class="lbl">Data del check</div><input class="e-in" type="date" id="ck-day" value="${def}" max="${todayISO()}">
    ${ds.length === 1 && ds[0] !== todayISO() ? `<div class="rs">Data presa dalle foto: cambiala se serve.</div>` : ""}
    <div class="lbl">Nota (facoltativa)</div><textarea class="e-in" id="ck-note" rows="2" placeholder="es. a digiuno, stessa luce"></textarea>
    <div id="ck-prog"></div>
    <button class="btn" data-a="chk-save">Salva check</button><button class="btn ghost" data-a="close">Annulla</button></div>`;
  $sheet.hidden = false;
  const box = document.getElementById("ck-prev");
  for (const f of files.slice(0, 12)) box.insertAdjacentHTML("beforeend", `<span class="ph"><img src="${URL.createObjectURL(f)}" alt=""></span>`);
}
async function chkSave() {
  const day = document.getElementById("ck-day").value || todayISO(), note = document.getElementById("ck-note").value.trim();
  const prog = document.getElementById("ck-prog"), files = CKNEW.files;
  $sheet.querySelectorAll(".btn").forEach((b) => (b.disabled = true));
  const fd = new FormData();
  for (const [i, f] of files.entries()) {
    prog.innerHTML = `<div class="prog"><span>Preparo le foto ${i + 1}/${files.length}…</span><i style="width:${(i / files.length * 90).toFixed(0)}%"></i></div>`;
    const s = await shrink(f); fd.append("foto+", s, s.name);
  }
  const ex = CKNEW.add ? CK.list.find((c) => c.id === CKNEW.add) : await pb.collection("checks").getFirstListItem(pb.filter("day = {:d}", { d: day })).catch(() => null);
  if (ex) { if (note && !CKNEW.add) fd.append("note", [ex.note, note].filter(Boolean).join(" · ")); await pb.collection("checks").update(ex.id, fd); }
  else { fd.append("day", day); fd.append("note", note); await pb.collection("checks").create(fd); }
  closeSheet(); CKNEW = null; toast("Check salvato");
  await loadChecks(); if (S.view === "peso") renderPeso(); else if (S.view === "hub") { await loadHub(); renderHub(); }
}
function chkOpen(id, i = 0) {
  const c = CK.list.find((x) => x.id === id); if (!c) return;
  const L = c.foto || []; i = Math.max(0, Math.min(L.length - 1, i));
  $sheet.innerHTML = `<div class="in"><h2>Check del ${dFmt(c.day)}${L.length > 1 ? ` · ${i + 1}/${L.length}` : ""}</h2>
    ${L.length ? `<img class="phbig" src="${esc(phUrl(c, L[i]))}" alt="">` : `<div class="rs">Nessuna foto.</div>`}
    ${L.length > 1 ? `<div class="g2"><button class="btn ghost" data-a="chk-open" data-id="${c.id}" data-i="${i - 1}" ${i ? "" : "disabled"}>‹ Precedente</button>
      <button class="btn ghost" data-a="chk-open" data-id="${c.id}" data-i="${i + 1}" ${i < L.length - 1 ? "" : "disabled"}>Successiva ›</button></div>` : ""}
    ${c.note ? `<div class="rs" style="margin-top:8px">${esc(c.note)}</div>` : ""}
    <div class="g2"><label class="btn ghost hfile">+ Aggiungi foto<input type="file" accept="image/*" multiple hidden data-chk="${c.id}"></label>
      ${L.length ? `<button class="btn danger" data-a="chk-delf" data-id="${c.id}" data-f="${esc(L[i])}">Elimina foto</button>` : ""}</div>
    <button class="btn danger" data-a="chk-del" data-id="${c.id}">Elimina tutto il check</button>
    <button class="btn ghost" data-a="close">Chiudi</button></div>`;
  $sheet.hidden = false;
}
function chkCompare(a, b) {
  const L = CK.list; if (L.length < 2) return;
  const A = L.find((x) => x.id === a) || L[L.length - 1], B = L.find((x) => x.id === b) || L[0];
  const opt = (sel) => L.map((c) => `<option value="${c.id}" ${c.id === sel.id ? "selected" : ""}>${dFmt(c.day)}${kgOn(c.day) ? " · " + kgTxt(kgOn(c.day)) + " kg" : ""}</option>`).join("");
  const n = Math.max((A.foto || []).length, (B.foto || []).length);
  const cell = (c, i) => c.foto?.[i] ? `<img src="${esc(phUrl(c, c.foto[i]))}" alt="">` : `<span class="rs">—</span>`;
  const gap = Math.round((Date.parse(B.day) - Date.parse(A.day)) / 86400000), ka = kgOn(A.day), kb = kgOn(B.day);
  $sheet.innerHTML = `<div class="in wide"><h2>Confronto check</h2>
    <div class="g2"><select class="e-in" id="cmp-a">${opt(A)}</select><select class="e-in" id="cmp-b">${opt(B)}</select></div>
    <div class="rs" style="margin:6px 2px">${Math.abs(gap)} giorni${ka && kb ? ` · ${kb - ka > 0 ? "+" : kb - ka < 0 ? "−" : "±"}${kgTxt(Math.abs(kb - ka))} kg` : ""}</div>
    <div class="cmp">${Array.from({ length: n }, (_, i) => `<div>${cell(A, i)}</div><div>${cell(B, i)}</div>`).join("")}</div>
    <button class="btn ghost" data-a="close">Chiudi</button></div>`;
  $sheet.hidden = false;
}
document.addEventListener("change", (ev) => {
  const t = ev.target;
  if (t.dataset.chk && t.files?.length) {
    const fs = [...t.files], add = t.dataset.chk !== "new" ? t.dataset.chk : null; t.value = "";
    if (add) { const c = CK.list.find((x) => x.id === add); chkNew(fs, c?.day); CKNEW.add = add; document.getElementById("ck-day").disabled = true; return; }
    chkNew(fs);
  }
  if ((t.id === "cmp-a" || t.id === "cmp-b") && !$sheet.hidden) chkCompare(document.getElementById("cmp-a").value, document.getElementById("cmp-b").value);
});

/* ---------- Oggi ---------- */
let HB = null;
async function loadHub() {
  const today = todayISO();
  const [pasti, ob] = await Promise.all([
    pb.collection("pasti").getFullList({ filter: pb.filter("day = {:d}", { d: today }) }),
    pb.collection("obiettivi").getFirstListItem(pb.filter("from <= {:d} && (to >= {:d} || to = '')", { d: today }), { sort: "-from" }).catch(() => null),
  ]);
  await loadPeso(); await loadChecks();
  HB = { today, pasti, ob, check: CK.list[0] || null, lastBk: await metaGet("lastBackup").catch(() => null) };
}
function mealNow() { const h = new Date().getHours(); return h < 10 ? 0 : h < 12 ? 1 : h < 15 ? 2 : h < 18 ? 3 : h < 21 ? 4 : 5; }
function renderHub() {
  const g = HB, d = new Date(g.today + "T12:00:00");
  const tot = { kcal: 0, carb: 0, prot: 0, fat: 0 }; for (const p of g.pasti) for (const k in tot) tot[k] += Number(p[k]) || 0;
  const goal = g.ob?.days?.[(d.getDay() + 6) % 7] || null;
  const all = pesoDays(), last = PW.list.filter((r) => r.kg > 0 && !r._bad).slice(-1)[0];
  const a7 = avgBetween(all, isoMinus(g.today, 7), g.today), p7 = avgBetween(all, isoMinus(g.today, 14), isoMinus(g.today, 7));
  const diff = a7 && p7 ? a7 - p7 : null, c = g.check;
  const hasData = IDB.mem.pasti.size + IDB.mem.peso.size + IDB.mem.checks.size > 0;
  const bkDays = g.lastBk ? Math.round((Date.parse(g.today) - Date.parse(g.lastBk)) / 86400000) : null;
  $app.innerHTML = `
  <div class="bar"><h1>EatAndFit<span class="sub">${esc(d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" }))}</span></h1>
    <button class="ib" data-a="menu" title="Menu">⋯</button></div>
  <div class="wrap hub">
    ${S.upd ? `<div class="pwbad upd">🆕 È disponibile la versione <b>${esc(S.upd.v)}</b>. <button class="btn" data-a="upd-go">Aggiorna</button></div>` : ""}
    ${hasData && (bkDays == null || bkDays >= 14) ? `<div class="pwbad">💾 ${bkDays == null ? "Non hai ancora fatto un backup." : `Ultimo backup ${bkDays} giorni fa.`} I dati sono solo su questo telefono: salvane una copia su Drive.
      <button class="btn ghost" data-a="bk-exp">Fai il backup ora</button></div>` : ""}
    <section class="hcard">
      <button class="hh" data-a="nav" data-v="diario"><span>🍽 Alimentazione</span><i>›</i></button>
      ${goal ? `<div class="drem"><b>${n0(Math.abs(goal[0] - tot.kcal))}</b> kcal ${goal[0] - tot.kcal >= 0 ? "rimanenti" : "in più"}</div>` : `<div class="rs">Imposta gli obiettivi da Alimentazione → 🎯 Obiettivi.</div>`}
      ${macroBars(tot, goal)}
      <div class="dbtns"><button class="btn" data-a="hub-add" style="margin:0">+ Aggiungi alimento</button></div>
    </section>
    <section class="hcard">
      <button class="hh" data-a="nav" data-v="peso"><span>⚖️ Peso e foto</span><i>›</i></button>
      <div class="tiles2" style="margin:4px 0 8px">
        <div class="tile"><div class="tl">Ultima pesata</div><div class="tv">${last ? kgTxt(last.kg) + " kg" : "—"}</div>
          <div class="ts">${last ? esc(tLoc(last.time).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })) : "&nbsp;"}</div></div>
        <div class="tile"><div class="tl">Media 7 giorni</div><div class="tv">${a7 ? kgTxt(a7) + " kg" : "—"}</div>
          <div class="ts">${diff == null ? "&nbsp;" : (diff > 0 ? "+" : diff < 0 ? "−" : "±") + kgTxt(Math.abs(diff)) + " kg"}</div></div>
      </div>
      ${c ? `<div class="rs">Ultimo check: ${dFmt(c.day)}</div>
        <div class="tiles">${(c.foto || []).slice(0, 4).map((f, i) => `<button class="ph" data-a="chk-open" data-id="${c.id}" data-i="${i}"><img src="${esc(phUrl(c, f))}" alt=""></button>`).join("")}</div>` : ""}
      <div class="g2"><button class="btn ghost" data-a="hub-peso">+ Pesata</button>
        <label class="btn ghost hfile">📷 Nuovo check<input type="file" accept="image/*" multiple hidden data-chk="new"></label></div>
    </section>
  </div>`;
}

/* ---------- backup ---------- */
async function blobToB64(b) {
  const s = await new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => ko(r.error); r.readAsDataURL(b); });
  return String(s).slice(String(s).indexOf(",") + 1);
}
async function exportBackup() {
  const prog = (t) => { $sheet.innerHTML = `<div class="in"><h2>Backup</h2><div class="prog"><span>${t}</span><i style="width:60%"></i></div></div>`; $sheet.hidden = false; };
  prog("Preparo il backup…");
  const blob = await backupBlob(), name = `EatAndFit-backup-${todayISO()}.zip`;
  if (NATIVE && window.Capacitor.Plugins?.Filesystem && window.Capacitor.Plugins?.Share) {
    const { Filesystem, Share } = window.Capacitor.Plugins, CH = 3 * 1024 * 1024;
    prog("Salvo il file…");
    for (let i = 0; i < blob.size; i += CH) {
      const data = await blobToB64(blob.slice(i, i + CH));
      if (i === 0) await Filesystem.writeFile({ path: name, data, directory: "CACHE" }); else await Filesystem.appendFile({ path: name, data, directory: "CACHE" });
    }
    const { uri } = await Filesystem.getUri({ path: name, directory: "CACHE" });
    closeSheet();
    await Share.share({ title: "Backup EatAndFit", text: name, url: uri, dialogTitle: "Salva il backup (es. su Drive)" });
  } else {
    const file = new File([blob], name, { type: "application/zip" });
    closeSheet();
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: "Backup EatAndFit" });
    else { const a = document.createElement("a"); a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
  }
  await metaSet("lastBackup", todayISO());
  toast(`Backup pronto (${(blob.size / 1048576).toFixed(1)} MB)`, 3000);
  if (S.view === "hub") { await loadHub(); renderHub(); }
}
async function importBackup(file) {
  if (!confirm("Ripristinare questo backup? Tutti i dati attuali di EatAndFit su questo telefono verranno sostituiti.")) return;
  $sheet.innerHTML = `<div class="in"><h2>Ripristino</h2><div class="prog"><span>Ripristino in corso…</span><i style="width:50%"></i></div></div>`; $sheet.hidden = false;
  try {
    const r = await restoreZip(file);
    closeSheet(); toast(`Ripristinati ${r.record} dati e ${r.foto} foto`, 3500);
    await go("hub");
  } catch (e) { $sheet.innerHTML = `<div class="in"><h2>Ripristino</h2><div class="pwbad">${esc(e.message || e)}</div><button class="btn ghost" data-a="close">Chiudi</button></div>`; }
}

/* ---------- aggiornamenti (release su GitHub) ---------- */
const newer = (a, b) => { const x = String(a).split(".").map(Number), y = String(b).split(".").map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
async function checkUpdate(manual) {
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: "application/vnd.github+json" } });
    if (!r.ok) throw new Error("GitHub ha risposto " + r.status);
    const j = await r.json(), v = String(j.tag_name || "").replace(/^v/, ""), apk = (j.assets || []).find((a) => /\.apk$/i.test(a.name));
    if (apk && newer(v, APP_VERSION)) { S.upd = { v, url: apk.browser_download_url, notes: j.body || "" }; if (S.view === "hub") renderHub(); if (manual) showUpdate(); }
    else if (manual) toast(`Hai già l'ultima versione (${APP_VERSION})`);
  } catch (e) { if (manual) toast("Controllo non riuscito: " + (e.message || e)); }
}
function showUpdate() {
  $sheet.innerHTML = `<div class="in"><h2>Aggiornamento ${esc(S.upd.v)}</h2>
    ${S.upd.notes ? `<div class="pre rs">${esc(S.upd.notes)}</div>` : ""}
    <p class="rs">Tocca "Scarica": si apre il browser e scarica il file. Poi aprilo dalla notifica e conferma "Installa"/"Aggiorna". I tuoi dati restano.</p>
    <button class="btn" data-a="upd-dl">Scarica la versione ${esc(S.upd.v)}</button><button class="btn ghost" data-a="close">Più tardi</button></div>`;
  $sheet.hidden = false;
}

/* ---------- menu ---------- */
function showMenu() {
  $sheet.innerHTML = `<div class="in"><h2>EatAndFit</h2>
    <div class="rs">Versione ${esc(APP_VERSION)} · i dati sono salvati solo su questo telefono.</div>
    <button class="btn" data-a="bk-exp">💾 Fai il backup (salva su Drive)</button>
    <label class="btn ghost hfile">⤒ Ripristina da un backup<input type="file" id="bk-file" accept=".zip,application/zip,application/octet-stream" hidden></label>
    <button class="btn ghost" data-a="upd-check">🔄 Controlla aggiornamenti</button>
    <button class="btn ghost" data-a="close">Chiudi</button></div>`;
  $sheet.hidden = false;
}

/* ---------- navigazione ---------- */
const TABS = [["hub", "🏠", "Oggi"], ["diario", "🍽", "Alimentazione"], ["peso", "⚖️", "Peso e foto"]];
const $tabs = document.createElement("nav");
$tabs.className = "tabbar t3";
$tabs.innerHTML = TABS.map(([v, i, l]) => `<button data-a="nav" data-v="${v}"><span>${i}</span>${l}</button>`).join("");
document.body.appendChild($tabs);
function syncNav() {
  document.body.classList.add("withtabs");
  $tabs.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.v === S.view));
}
new MutationObserver(syncNav).observe($app, { childList: true });
async function go(view) {
  S.view = view;
  if (view === "hub") { await loadHub(); renderHub(); }
  else if (view === "diario") { await openDiario(todayISO()); return; }
  else if (view === "peso") { await loadPeso(); await loadChecks(); renderPeso(); }
  window.scrollTo(0, 0);
}
function render() { if (S.view === "hub") renderHub(); else if (S.view === "diario") renderDiario(); else if (S.view === "peso") renderPeso(); }

/* ---------- eventi ---------- */
document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("[data-a]"); if (!t) return;
  const a = t.dataset.a, id = t.dataset.id;
  try {
    if (/^(di|f|ff|ocr|g)-/.test(a)) return await ciboClick(a, t);
    switch (a) {
      case "nav": return go(t.dataset.v);
      case "close": return closeSheet();
      case "menu": return showMenu();
      case "gday": return openDiario(t.dataset.d || todayISO());
      case "hub-add": await openDiario(todayISO()); return showAdd(MEALS[mealNow()]);
      case "hub-peso": await go("peso"); document.getElementById("pw-kg")?.focus(); return;
      case "pw-add": return pesoAdd();
      case "pw-ok": await pb.collection("peso").update(id, { ok: true }); await loadPeso(); renderPeso(); toast("Pesata accettata"); return;
      case "pw-del": if (!confirm("Eliminare questa pesata?")) return; await pb.collection("peso").delete(id); await loadPeso(); renderPeso(); return;
      case "chk-open": return chkOpen(id, +(t.dataset.i || 0));
      case "chk-save": return chkSave();
      case "chk-cmp": return chkCompare();
      case "chk-delf": {
        if (!confirm("Eliminare questa foto?")) return;
        await pb.collection("checks").update(id, { "foto-": [t.dataset.f] }); await loadChecks();
        const c = CK.list.find((x) => x.id === id); if (c?.foto?.length) chkOpen(c.id, 0); else closeSheet();
        render(); toast("Foto eliminata"); return;
      }
      case "chk-del": if (!confirm("Eliminare il check con tutte le sue foto?")) return; await pb.collection("checks").delete(id); closeSheet(); await loadChecks(); render(); toast("Check eliminato"); return;
      case "bk-exp": return exportBackup();
      case "upd-check": closeSheet(); return checkUpdate(true);
      case "upd-go": return showUpdate();
      case "upd-dl": closeSheet(); location.href = S.upd.url; return;
    }
  } catch (e) { console.error(e); toast("Errore: " + (e.message || "operazione non riuscita")); }
});
document.addEventListener("change", (ev) => {
  if (ev.target.id === "bk-file" && ev.target.files.length) { const f = ev.target.files[0]; ev.target.value = ""; closeSheet(); importBackup(f); }
});
/* tasto indietro di Android: chiude i pannelli, poi torna a Oggi, poi esce */
if (NATIVE && window.Capacitor.Plugins?.App) {
  window.Capacitor.Plugins.App.addListener("backButton", () => {
    const ov = document.getElementById("ocrov");
    if (ov && !ov.hidden) { ov.hidden = true; ov.innerHTML = ""; return; }
    if (!$sheet.hidden) return closeSheet();
    if (S.view !== "hub") return go("hub");
    window.Capacitor.Plugins.App.exitApp();
  });
}

(async function start() {
  try { await dbInit(); }
  catch (e) { $app.innerHTML = `<div class="empty">Impossibile aprire i dati del telefono: ${esc(e.message || e)}</div>`; return; }
  await go("hub");
  const lastChk = await metaGet("updChk").catch(() => null);
  if (lastChk !== todayISO()) { await metaSet("updChk", todayISO()).catch(() => {}); checkUpdate(false); }
  else checkUpdate(false);
  if ("serviceWorker" in navigator && !NATIVE) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
