/* EatAndFit — dati sul telefono (IndexedDB).
   Espone un piccolo "pb" con le stesse chiamate di PocketBase usate dal diario (collection().getFullList, create, update, ...),
   così il codice del diario è lo stesso dell'app "Allenamento". Open Food Facts viene interrogato direttamente dal telefono. */
"use strict";

const COLS = ["pasti", "alimenti", "obiettivi", "peso", "checks"];
const FILEF = { checks: "foto" };                 // campi con foto
const IDB = { db: null, mem: {}, files: new Map() };   // mem: collezione -> Map(id -> record); files: chiave -> objectURL

function idbOpen() {
  return new Promise((ok, ko) => {
    const r = indexedDB.open("eatandfit", 1);
    r.onupgradeneeded = () => { const d = r.result; for (const c of [...COLS, "files", "meta"]) if (!d.objectStoreNames.contains(c)) d.createObjectStore(c); };
    r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error);
  });
}
const tx = (store, mode, fn) => new Promise((ok, ko) => {
  const t = IDB.db.transaction(store, mode), s = t.objectStore(store); let out;
  Promise.resolve(fn(s)).then((v) => { out = v; });
  t.oncomplete = () => ok(out); t.onerror = () => ko(t.error); t.onabort = () => ko(t.error);
});
const req = (r) => new Promise((ok, ko) => { r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });
async function dbInit() {
  IDB.db = await idbOpen();
  for (const c of COLS) {
    IDB.mem[c] = new Map();
    const all = await tx(c, "readonly", (s) => req(s.getAll()));
    for (const r of all) IDB.mem[c].set(r.id, r);
  }
  try { await navigator.storage?.persist?.(); } catch {}
}
const putRec = (c, r) => tx(c, "readwrite", (s) => s.put(r, r.id));
const delRec = (c, id) => tx(c, "readwrite", (s) => s.delete(id));
const metaGet = (k) => tx("meta", "readonly", (s) => req(s.get(k)));
const metaSet = (k, v) => tx("meta", "readwrite", (s) => s.put(v, k));
const fileKey = (c, id, f) => `${c}/${id}/${f}`;
async function fileUrl(c, id, f) {
  const k = fileKey(c, id, f);
  if (IDB.files.has(k)) return IDB.files.get(k);
  const b = await tx("files", "readonly", (s) => req(s.get(k)));
  const u = b ? URL.createObjectURL(b) : "";
  IDB.files.set(k, u); return u;
}
async function withUrls(c, recs) {
  const f = FILEF[c]; if (!f) return recs;
  for (const r of recs) for (const n of r[f] || []) await fileUrl(c, r.id, n);
  return recs;
}

/* ---------- filtri nello stile PocketBase: a = 'x' && (b ~ 'y' || c >= 3) ---------- */
function pbFilter(expr, P = {}) {
  return String(expr).replace(/\{:(\w+)\}/g, (_, k) => (typeof P[k] === "number" ? String(P[k]) : JSON.stringify(String(P[k] ?? ""))));
}
function parseFilter(src) {
  const T = []; let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (src.startsWith("&&", i) || src.startsWith("||", i)) { T.push({ t: "op", v: src.slice(i, i + 2) }); i += 2; continue; }
    if (ch === "(" || ch === ")") { T.push({ t: ch }); i++; continue; }
    const m = src.slice(i).match(/^(!=|>=|<=|!~|=|>|<|~)/);
    if (m) { T.push({ t: "cmp", v: m[1] }); i += m[1].length; continue; }
    if (ch === "'" || ch === '"') {
      let j = i + 1, s = "";
      while (j < src.length && src[j] !== ch) { if (src[j] === "\\" && j + 1 < src.length) { j++; s += { n: "\n", t: "\t" }[src[j]] ?? src[j]; } else s += src[j]; j++; }
      T.push({ t: "val", v: s }); i = j + 1; continue;
    }
    const w = src.slice(i).match(/^[\w.]+/);
    if (w) { const x = w[0]; T.push(/^-?\d+(\.\d+)?$/.test(x) ? { t: "val", v: Number(x) } : x === "true" || x === "false" ? { t: "val", v: x === "true" } : { t: "id", v: x }); i += x.length; continue; }
    throw new Error("filtro non valido: " + src);
  }
  let p = 0;
  const or = () => { let l = and(); while (T[p]?.t === "op" && T[p].v === "||") { p++; const r = and(), a = l; l = (o) => a(o) || r(o); } return l; };
  const and = () => { let l = atom(); while (T[p]?.t === "op" && T[p].v === "&&") { p++; const r = atom(), a = l; l = (o) => a(o) && r(o); } return l; };
  const term = () => { const x = T[p++]; return x.t === "id" ? (o) => o[x.v] : () => x.v; };
  const atom = () => {
    if (T[p]?.t === "(") { p++; const e = or(); p++; return e; }
    const a = term(), op = T[p++].v, b = term();
    return (o) => cmp(a(o), op, b(o));
  };
  const e = or(); return e;
}
function cmp(a, op, b) {
  if (a == null) a = ""; if (b == null) b = "";
  const num = typeof a === "number" || typeof b === "number";
  const A = num ? Number(a) || 0 : String(a), B = num ? Number(b) || 0 : String(b);
  switch (op) {
    case "=": return A === B; case "!=": return A !== B;
    case ">": return A > B; case ">=": return A >= B; case "<": return A < B; case "<=": return A <= B;
    case "~": return String(a).toLowerCase().includes(String(b).toLowerCase());
    case "!~": return !String(a).toLowerCase().includes(String(b).toLowerCase());
  }
  return false;
}
const FCACHE = new Map();
const compile = (f) => { if (!f) return () => true; if (!FCACHE.has(f)) FCACHE.set(f, parseFilter(f)); return FCACHE.get(f); };
function sorter(sort) {
  const keys = String(sort || "").split(",").map((s) => s.trim()).filter(Boolean).map((s) => (s[0] === "-" ? [s.slice(1), -1] : [s.replace(/^\+/, ""), 1]));
  return (x, y) => {
    for (const [k, d] of keys) {
      const a = x[k] ?? "", b = y[k] ?? "";
      if (a < b) return -d; if (a > b) return d;
    }
    return 0;
  };
}
const rid15 = () => Array.from(crypto.getRandomValues(new Uint8Array(15)), (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
const nowStr = () => new Date().toISOString().replace("T", " ");
const clone = (r) => JSON.parse(JSON.stringify(r));

class Col {
  constructor(name) { this.name = name; this.m = IDB.mem[name]; if (!this.m) throw new Error("collezione sconosciuta " + name); }
  _list(o = {}) { const f = compile(o.filter); return [...this.m.values()].filter((r) => f(r)).sort(sorter(o.sort)); }
  async getFullList(o = {}) { return withUrls(this.name, this._list(o).map(clone)); }
  async getList(page = 1, per = 30, o = {}) { const L = this._list(o); return { page, perPage: per, totalItems: L.length, items: await withUrls(this.name, L.slice((page - 1) * per, page * per).map(clone)) }; }
  async getFirstListItem(filter, o = {}) { const r = this._list({ ...o, filter })[0]; if (!r) throw Object.assign(new Error("non trovato"), { status: 404 }); return (await withUrls(this.name, [clone(r)]))[0]; }
  async getOne(id) { const r = this.m.get(id); if (!r) throw Object.assign(new Error("non trovato"), { status: 404 }); return (await withUrls(this.name, [clone(r)]))[0]; }
  _unique(r) {
    if (this.name === "alimenti" && r.barcode) for (const x of this.m.values())
      if (x.id !== r.id && x.barcode === r.barcode) throw Object.assign(new Error("barcode: valore già presente (unique)"), { data: { barcode: { code: "validation_not_unique" } } });
  }
  async _apply(r, data) {
    const ff = FILEF[this.name], adds = [];
    const entries = data instanceof FormData ? [...data.entries()] : Object.entries(data);
    for (const [k0, v] of entries) {
      let k = k0, mod = "";
      if (/[+-]$/.test(k)) { mod = k.slice(-1); k = k.slice(0, -1); }
      if (ff && k === ff) {
        const arr = Array.isArray(r[k]) ? r[k] : (r[k] = []);
        if (mod === "-") { for (const n of [].concat(v)) { const i = arr.indexOf(n); if (i >= 0) arr.splice(i, 1); await tx("files", "readwrite", (s) => s.delete(fileKey(this.name, r.id, n))); IDB.files.delete(fileKey(this.name, r.id, n)); } continue; }
        if (v instanceof Blob) { if (!mod && !adds.length && data instanceof FormData && !r._fresh) arr.length = 0; adds.push(v); continue; }
        continue;
      }
      if (mod === "+") { if (Array.isArray(r[k])) r[k].push(...[].concat(v)); else r[k] = (Number(r[k]) || 0) + (Number(v) || 0); continue; }
      if (mod === "-") { if (Array.isArray(r[k])) r[k] = r[k].filter((x) => ![].concat(v).includes(x)); else r[k] = (Number(r[k]) || 0) - (Number(v) || 0); continue; }
      r[k] = v instanceof Blob ? r[k] : v;
    }
    for (const b of adds) {
      const n = `${(b.name || "foto").replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "_").slice(0, 40)}_${rid15().slice(0, 10)}.jpg`;
      await tx("files", "readwrite", (s) => s.put(b, fileKey(this.name, r.id, n)));
      (r[ff] ||= []).push(n);
    }
  }
  async create(data) {
    const r = { id: rid15(), created: nowStr(), _fresh: true };
    await this._apply(r, data); delete r._fresh;
    r.updated = r.created;
    if (data instanceof FormData) { const day = data.get("day"); if (day) r.day = day; }
    this._unique(r);
    this.m.set(r.id, r); await putRec(this.name, r);
    return (await withUrls(this.name, [clone(r)]))[0];
  }
  async update(id, data) {
    const cur = this.m.get(id); if (!cur) throw Object.assign(new Error("non trovato"), { status: 404 });
    const r = clone(cur);
    await this._apply(r, data); r.updated = nowStr();
    this._unique(r);
    this.m.set(id, r); await putRec(this.name, r);
    return (await withUrls(this.name, [clone(r)]))[0];
  }
  async delete(id) {
    const r = this.m.get(id); if (!r) return true;
    const ff = FILEF[this.name];
    if (ff) for (const n of r[ff] || []) { await tx("files", "readwrite", (s) => s.delete(fileKey(this.name, id, n))); IDB.files.delete(fileKey(this.name, id, n)); }
    this.m.delete(id); await delRec(this.name, id); return true;
  }
  async subscribe() {} async unsubscribe() {}
}

const pb = {
  filter: pbFilter,
  authStore: { token: "", isValid: true, record: { email: "" } },
  autoCancellation() {},
  collection: (n) => new Col(n),
  files: {
    getURL: (rec, f) => IDB.files.get(fileKey(rec.collectionName || "checks", rec.id, f)) || "",
    getToken: async () => "",
  },
};

/* ---------- Open Food Facts dal telefono ---------- */
const OFF_FIELDS = "code,product_name,product_name_it,brands,nutriments,serving_quantity,serving_size,quantity,product_quantity_unit,nutriscore_grade,nova_group,additives_tags";
const nb = (v) => { const x = parseFloat(String(v ?? "").replace(",", ".")); return isFinite(x) ? x : NaN; };
const r2 = (x) => Math.round(x * 100) / 100;
const zz = (x) => (isFinite(x) ? r2(x) : 0);
const today10 = () => new Date().toISOString().slice(0, 10);
function unitOf(qtyText, unitTag) {
  const u = String(unitTag || "").toLowerCase(), t = String(qtyText || "").toLowerCase();
  if (u === "ml" || u === "l" || u === "cl") return "ml";
  if (!u && /\d\s*(ml|cl|l)\b/.test(t)) return "ml";
  return "g";
}
function offScores(p) {
  const ns = String((p && p.nutriscore_grade) || "").toLowerCase(), nv = parseInt(p && p.nova_group, 10);
  const add = String(Array.isArray(p && p.additives_tags) ? p.additives_tags.join(",") : (p && p.additives_tags) || "")
    .split(",").map((x) => x.trim().replace(/^[a-z]{2}:/, "").toLowerCase()).filter((x) => /^e\d/.test(x));
  return { nutriscore: /^[a-e]$/.test(ns) ? ns : "", nova: nv >= 1 && nv <= 4 ? nv : 0, additivi: [...new Set(add)].slice(0, 60), off_chk: today10() };
}
function offItem(p, code) {
  if (!p) return null;
  const nu = p.nutriments || {};
  let kcal = nb(nu["energy-kcal_100g"]);
  if (!isFinite(kcal) && isFinite(nb(nu.energy_100g))) kcal = nb(nu.energy_100g) / 4.184;
  if (!isFinite(kcal)) return null;
  let sod = nb(nu.sodium_100g);
  if (!isFinite(sod) && isFinite(nb(nu.salt_100g))) sod = nb(nu.salt_100g) / 2.5;
  const name = String(p.product_name_it || p.product_name || "").trim(); if (!name) return null;
  const sq = nb(p.serving_quantity);
  return { name: name.slice(0, 300), brand: String(p.brands || "").split(",")[0].trim().slice(0, 200), barcode: String(code || p.code || "").slice(0, 40),
    base: 100, unit: unitOf(p.quantity, p.product_quantity_unit), kcal: zz(kcal), carb: zz(nb(nu.carbohydrates_100g)), fat: zz(nb(nu.fat_100g)), prot: zz(nb(nu.proteins_100g)),
    fiber: zz(nb(nu.fiber_100g)), sugar: zz(nb(nu.sugars_100g)), sodium: isFinite(sod) ? r2(sod * 1000) : 0,
    serving: isFinite(sq) && sq > 0 ? r2(sq) : 0, serving_label: String(p.serving_size || "").slice(0, 100), source: "Open Food Facts", uses: 0, last: "", ...offScores(p) };
}
async function offGet(url) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { Accept: "application/json" } });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error("Open Food Facts ha risposto " + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}
async function saveItem(it) {
  const A = pb.collection("alimenti");
  if (it.barcode) { const ex = [...IDB.mem.alimenti.values()].find((x) => x.barcode === it.barcode); if (ex) return clone(ex); }
  return A.create(it);
}
/* stesse risposte delle funzioni del server dell'app "Allenamento" */
async function api(path, opt = {}) {
  const u = new URL(path, "https://x"), p = u.pathname;
  let m;
  if ((m = p.match(/\/alimenti\/code\/(\d+)$/))) {
    const code = m[1];
    const loc = [...IDB.mem.alimenti.values()].find((x) => x.barcode === code);
    if (loc) return { found: true, item: clone(loc) };
    let j;
    try { j = await offGet(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${OFF_FIELDS}`); }
    catch (e) { return { found: false, offline: true, error: String(e.message || e) }; }
    const pr = j && j.status === 1 ? j.product : null, it = offItem(pr, code);
    if (it) return { found: true, item: await saveItem(it), nuovo: true };
    return { found: false, partial: pr ? { name: String(pr.product_name_it || pr.product_name || ""), brand: String(pr.brands || "").split(",")[0].trim() } : null };
  }
  if (p.endsWith("/alimenti/online")) {
    const q = u.searchParams.get("q") || "";
    let j;
    try { j = await offGet("https://it.openfoodfacts.org/cgi/search.pl?search_simple=1&action=process&json=1&page_size=25&search_terms=" + encodeURIComponent(q) + "&fields=" + OFF_FIELDS); }
    catch (e) { throw new Error("Open Food Facts non raggiungibile: controlla la connessione o riprova tra un minuto."); }
    return { items: ((j && j.products) || []).map((x) => offItem(x, x.code)).filter(Boolean) };
  }
  if (p.endsWith("/alimenti/salva")) return { item: await saveItem(JSON.parse(opt.body || "{}")) };
  if ((m = p.match(/\/alimenti\/punteggi\/(\w+)$/))) {
    const r = IDB.mem.alimenti.get(m[1]); if (!r) throw new Error("alimento non trovato");
    if (!r.barcode) return { ok: false, item: clone(await pb.collection("alimenti").update(r.id, { off_chk: today10() })) };
    let j; try { j = await offGet(`https://world.openfoodfacts.org/api/v2/product/${r.barcode}.json?fields=nutriscore_grade,nova_group,additives_tags`); } catch { return { ok: false, item: clone(r) }; }
    const item = await pb.collection("alimenti").update(r.id, offScores(j && j.status === 1 ? j.product : null));
    return { ok: true, item };
  }
  if (p.endsWith("/alimenti/ricava")) return { alimenti: 0 };
  throw new Error("funzione non disponibile");
}

/* ---------- backup: tutti i dati + foto in uno zip ---------- */
async function backupBlob() {
  const zip = new JSZip(), data = { app: "EatAndFit", versione: EAF_VERSION, creato: new Date().toISOString(), collezioni: {} };
  for (const c of COLS) data.collezioni[c] = [...IDB.mem[c].values()];
  zip.file("dati.json", JSON.stringify(data));
  for (const c of Object.keys(FILEF)) for (const r of IDB.mem[c].values()) for (const n of r[FILEF[c]] || []) {
    const b = await tx("files", "readonly", (s) => req(s.get(fileKey(c, r.id, n))));
    if (b) zip.file(`foto/${c}/${r.id}/${n}`, b);
  }
  return zip.generateAsync({ type: "blob", compression: "STORE" });
}
async function restoreZip(file) {
  const zip = await JSZip.loadAsync(file), j = zip.file("dati.json");
  if (!j) throw new Error("Non è un backup di EatAndFit (manca dati.json)");
  const data = JSON.parse(await j.async("string"));
  if (data.app !== "EatAndFit") throw new Error("Non è un backup di EatAndFit");
  for (const c of [...COLS, "files"]) await tx(c, "readwrite", (s) => s.clear());
  for (const u of IDB.files.values()) if (u) URL.revokeObjectURL(u);
  IDB.files.clear();
  for (const c of COLS) {
    IDB.mem[c] = new Map();
    for (const r of data.collezioni?.[c] || []) { IDB.mem[c].set(r.id, r); await putRec(c, r); }
  }
  let n = 0;
  for (const path of Object.keys(zip.files)) {
    const m = path.match(/^foto\/(\w+)\/(\w+)\/(.+)$/); if (!m || zip.files[path].dir) continue;
    const b = await zip.files[path].async("blob");
    await tx("files", "readwrite", (s) => s.put(new Blob([b], { type: "image/jpeg" }), fileKey(m[1], m[2], m[3]))); n++;
  }
  try { await metaSet("lastBackup", String(data.creato || "").slice(0, 10) || null); } catch {}
  return { record: COLS.reduce((a, c) => a + IDB.mem[c].size, 0), foto: n };
}

/* ---------- alimenti condivisi con Roberto ---------- */
const FOODS_URL = "https://raw.githubusercontent.com/Roby5991/EatAndFit/main/db/alimenti.json";
const SHARE_F = ["name", "brand", "barcode", "base", "unit", "kcal", "carb", "fat", "prot", "fiber", "sugar", "sodium", "serving", "serving_label", "nutriscore", "nova", "additivi", "off_chk"];
const normK = (n, b) => (String(b || "") + "|" + String(n || "")).toLowerCase().replace(/\s+/g, " ").trim();
/* scarica gli alimenti pubblicati da Roberto: aggiunge i nuovi, aggiorna i suoi non modificati, non tocca quelli inseriti o modificati qui */
async function syncFoods() {
  const url = (await metaGet("foodsUrl").catch(() => null)) || FOODS_URL;
  const r = await fetch(url + (url.includes("?") ? "&" : "?") + "t=" + Date.now(), { cache: "no-store" });
  if (r.status === 404) return { nuovi: 0, aggiornati: 0, totale: 0 };
  if (!r.ok) throw new Error("download non riuscito (" + r.status + ")");
  const txt = await r.text(), j = JSON.parse(txt);
  if (j.app !== "EatAndFit" || !Array.isArray(j.items)) throw new Error("file alimenti non valido");
  const sig = j.items.length + ":" + txt.length;
  if (sig === (await metaGet("foodsSig").catch(() => null))) return { nuovi: 0, aggiornati: 0, totale: j.items.length, invariato: true };
  const A = pb.collection("alimenti"), all = [...IDB.mem.alimenti.values()];
  const byExt = new Map(all.filter((x) => x.ext).map((x) => [x.ext, x]));
  const byCode = new Map(all.filter((x) => x.barcode).map((x) => [x.barcode, x]));
  const byName = new Set(all.map((x) => normK(x.name, x.brand)));
  let nuovi = 0, agg = 0;
  for (const it of j.items) {
    if (!it || !it.name || !it.id) continue;
    const ext = "rob|" + it.id, o = {};
    for (const f of SHARE_F) o[f] = it[f] ?? (["name", "brand", "barcode", "unit", "serving_label", "nutriscore", "off_chk"].includes(f) ? "" : f === "additivi" ? [] : 0);
    const loc = byExt.get(ext);
    if (loc) {
      if (loc.source === "Roberto" && SHARE_F.some((f) => JSON.stringify(loc[f] ?? "") !== JSON.stringify(o[f] ?? ""))) {
        if (o.barcode && byCode.has(o.barcode) && byCode.get(o.barcode).id !== loc.id) o.barcode = loc.barcode || "";
        await A.update(loc.id, o); agg++;
      }
      continue;
    }
    if ((o.barcode && byCode.has(o.barcode)) || byName.has(normK(o.name, o.brand))) continue;   // ce l'hai già: resta il tuo
    const rec = await A.create({ ...o, ext, source: "Roberto", uses: 0, last: "" });
    if (rec.barcode) byCode.set(rec.barcode, rec); byName.add(normK(rec.name, rec.brand)); nuovi++;
  }
  await metaSet("foodsSig", sig); await metaSet("foodsSync", new Date().toISOString());
  return { nuovi, aggiornati: agg, totale: j.items.length };
}
/* alimenti inseriti qui (a mano o trovati con il codice a barre), da mandare a Roberto */
function myFoodsJson() {
  const items = [...IDB.mem.alimenti.values()].filter((x) => x.source !== "Roberto").map((x) => { const o = {}; for (const f of SHARE_F) if (x[f] !== "" && x[f] != null) o[f] = x[f]; return o; });
  return { app: "EatAndFit", tipo: "alimenti", da: "EatAndFit", creato: new Date().toISOString(), items };
}
