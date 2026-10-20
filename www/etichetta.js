/* Lettura dei valori nutrizionali dal testo dell'etichetta (OCR fatto sul telefono con Tesseract).
   Prende la prima colonna (per 100 g / 100 ml). Funziona con etichette italiane e bilingue.
   L'OCR spesso legge la "g" come "9" ("1,5 g" -> "1,59") o perde la virgola ("4,9 g" -> "494"):
   per ogni valore si preparano le letture possibili e si sceglie la combinazione in cui
   le calorie tornano con i macro (4 kcal/g carboidrati e proteine, 9 grassi, 2 fibre). */
"use strict";
(function (root) {
  const KEYS = [
    ["carb", /carboidrat|carbohydrat|glucid/, /di cui|of which|dont/],
    ["sugar", /zuccher|sugars?\b/, null],
    ["fat", /grass[io]|\bfat\b|lipid/, /satur|di cui|of which|dont|monoins|polins/],
    ["fiber", /fibr[ae]|fibre|fiber/, null],
    ["prot", /protein|protid/, null],
    ["salt", /\bsale\b|\bsalt\b|\bsel\b/, null],
    ["sodium", /\bsodio\b|\bsodium\b/, null],
  ];
  const clean = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/(\d)\s*[o](?=\s|$|g\b)/g, "$10").replace(/\b[o](?=[.,]\d)/g, "0")      // "o" letta al posto di 0
    .replace(/(\d)\s+([.,])\s*(\d)/g, "$1$2$3").replace(/(\d)([.,])\s+(\d)/g, "$1$2$3")   // "1 ,5" -> "1,5"
    .replace(/k[ce][ae][l1i|]\b/g, "kcal").replace(/\bk[j1il)]\b/g, "kj")
    .replace(/[|©‘’“”"]/g, " ");
  const toN = (s) => parseFloat(String(s).replace(",", "."));
  const TOK = /^[^\d<]*?(<\s*)?(\d[\d.,]*\d|\d)(?:\s*(mg|g|ml|9(?![\d.,])))?(\s*%)?/;

  /* letture possibili di un numero letto dall'OCR, con una "penalità" (più alta = meno probabile) */
  function cands(tok, unit) {
    const out = [], seen = new Set();
    const add = (s, p) => { const v = toN(s); if (isFinite(v) && v >= 0 && !seen.has(v)) { seen.add(v); out.push({ v, p }); } };
    const s = tok.replace(/\./g, ",").replace(/,(?=.*,)/g, "");
    const bases = [[s, unit ? 0 : 0.6]];
    if (!unit && s.length > 1 && /9$/.test(s)) bases.push([s.slice(0, -1).replace(/,$/, ""), 0.3]);    // "g" letta come 9
    if (!unit && s.length > 1 && /0$/.test(s)) bases.push([s.slice(0, -1).replace(/,$/, ""), 1.0]);    // "g" letta come 0
    for (const [b, p] of bases) {
      add(b, /^0\d/.test(b) ? p + 1 : p);                                                    // "01" non si stampa mai così
      if (b.includes(",") || b.length < 2) continue;
      if (b[0] === "0") { add("0," + b.slice(1), p + 0.1); continue; }                          // "01" -> 0,1
      for (let i = 1; i < b.length; i++) add(b.slice(0, i) + "," + b.slice(i), p + 1.0);      // virgola persa
    }
    return out.sort((a, b) => a.p - b.p);
  }
  // numero dopo la parola chiave (sulla stessa riga, o all'inizio della riga dopo se la riga ha solo il nome)
  function tokAfter(lines, i, m) {
    const rest = lines[i].slice(m.index + m[0].length);
    let x = rest.match(TOK);
    if (!x && /^\W{0,4}(tracc|traces?\b)/.test(rest)) return { tok: "0", unit: "g" };
    if (!x && lines[i + 1] && /^[<\d]/.test(lines[i + 1])) x = lines[i + 1].match(TOK);
    if (!x || x[4]) return null;                                         // "zucchero 20%" negli ingredienti
    return { tok: x[2], unit: x[3] ? (x[3] === "9" ? "g" : x[3]) : "", lt: !!x[1] };
  }

  function parse(raw) {
    const lines = String(raw || "").split(/\n+/).map(clean).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
    const all = lines.join("\n"), out = {}, C = {};
    // calorie: numero subito prima di "kcal"; altrimenti dai kJ
    let k = all.match(/(\d+(?:[.,]\d+)?)\s*kcal/);
    if (k) out.kcal = toN(k[1]);
    else if ((k = all.match(/(\d+(?:[.,]\d+)?)\s*kj/))) out.kcal = Math.round(toN(k[1]) / 4.184);
    for (const [key, re, not] of KEYS) {
      for (let i = 0; i < lines.length && !C[key]; i++) {
        const l = lines[i], m = l.match(re);
        if (!m || (not && not.test(l))) continue;
        const t = tokAfter(lines, i, m); if (!t) continue;
        let c = cands(t.tok, t.unit);
        if (key === "sodium") c = c.map((x) => ({ v: t.unit === "mg" ? x.v : x.v * 1000, p: x.p }));
        else c = c.filter((x) => x.v <= 100);
        if (c.length) C[key] = c;
      }
    }
    // combinazione di carboidrati, grassi, proteine e fibre più coerente con le calorie
    const M = ["carb", "fat", "prot", "fiber"].filter((x) => C[x]);
    let best = null;
    const walk = (j, pick) => {
      if (j === M.length) {
        const g = (x) => pick[x] ?? 0, sum = g("carb") + g("fat") + g("prot") + g("fiber");
        if (sum > 105) return;
        const pen = M.reduce((a, x) => a + pick["_" + x], 0);
        let sc = pen * 0.05;
        if (out.kcal && M.length >= 2) sc += Math.abs(4 * g("carb") + 4 * g("prot") + 9 * g("fat") + 2 * g("fiber") - out.kcal) / Math.max(out.kcal, 40);
        if (!best || sc < best.sc) best = { sc, pick: { ...pick } };
        return;
      }
      for (const c of C[M[j]].slice(0, 8)) { pick[M[j]] = c.v; pick["_" + M[j]] = c.p; walk(j + 1, pick); }
    };
    walk(0, {});
    if (best) for (const x of M) out[x] = best.pick[x];
    if (C.sugar) out.sugar = (C.sugar.find((c) => out.carb == null || c.v <= out.carb + 0.5) || C.sugar[0]).v;
    if (C.sodium) out.sodium = C.sodium[0].v;
    else if (C.salt) out.sodium = Math.round(C.salt[0].v / 2.5 * 1000 * 10) / 10;
    out.unit = /100\s*m[l1i]\b/.test(all) ? "ml" : "g";
    const sv = all.match(/(?:porzion[ei]|serving|portion)[^\d\n]{0,15}(\d+(?:[.,]\d+)?)\s*(g|ml)\b/);
    if (sv) out.serving = toN(sv[1]);
    out.trovati = ["kcal", "carb", "fat", "prot", "sugar", "fiber", "sodium"].filter((x) => out[x] != null).length;
    out.coerenza = best && out.kcal ? best.sc : null;
    return out;
  }
  // calorie ricalcolate dai macro: serve per accorgersi di una lettura sbagliata
  function check(v) {
    const est = 4 * (v.carb || 0) + 4 * (v.prot || 0) + 9 * (v.fat || 0) + 2 * (v.fiber || 0);
    if (!v.kcal || !est) return null;
    return { est: Math.round(est), ok: Math.abs(est - v.kcal) <= Math.max(15, v.kcal * 0.12) };
  }
  const api = { parse, check };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Etichetta = api;
})(typeof self !== "undefined" ? self : this);
