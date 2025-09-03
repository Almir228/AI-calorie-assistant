function toNum(v) {
  if (v == null) return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const m = v.replace(',', '.').match(/[-+]?\d+(?:\.\d+)?/);
    if (m) return Number(m[0]);
    return null;
  }
  return null;
}

function extractMacros(obj) {
  if (!obj) return {};
  const map = {
    calories: ['calories','kcal','cal','energy','калории'],
    proteins: ['proteins','protein','белки','белок'],
    fats: ['fats','fat','жиры','жир'],
    carbohydrates: ['carbohydrates','carbs','углеводы','углеводы,г']
  };
  const out = {};
  for (const key in map) {
    for (const k of map[key]) {
      if (obj[k] != null) { out[key] = toNum(obj[k]); break; }
    }
  }
  return out;
}

function extractMacrosFromText(text) {
  if (typeof text !== 'string' || !text) return {};
  const norm = text.replace(/,/g, '.');
  const re = (r)=> { const m = norm.match(r); return m? Number(m[1]) : null; };
  const calories = re(/([\d.]+)\s*(?:ккал|kcal|кал)/i);
  const proteins = re(/(?:б|белк(?:и|а)?)\s*([\d.]+)/i);
  const fats = re(/(?:ж|жир(?:ы|а)?)\s*([\d.]+)/i);
  const carbohydrates = re(/(?:у|углевод(?:ы|а)?)\s*([\d.]+)/i);
  const out = { calories, proteins, fats, carbohydrates };
  return Object.values(out).some(v=> v!=null) ? out : {};
}

function deepExtractMacros(x, maxDepth=4) {
  if (!x || maxDepth < 0) return {};
  if (typeof x === 'string') return extractMacrosFromText(x);
  if (Array.isArray(x)) {
    for (const el of x) {
      const m = deepExtractMacros(el, maxDepth-1);
      if (Object.values(m).some(v=> v!=null)) return m;
    }
    return {};
  }
  if (typeof x === 'object') {
    const direct = extractMacros(x);
    if (Object.values(direct).some(v=> v!=null)) return direct;
    for (const k of Object.keys(x)) {
      const m = deepExtractMacros(x[k], maxDepth-1);
      if (Object.values(m).some(v=> v!=null)) return m;
    }
  }
  return {};
}

function deepExtractMacrosLoose(x, maxDepth=4) {
  if (!x || maxDepth < 0) return {};
  if (typeof x === 'string') return extractMacrosFromText(x);
  if (Array.isArray(x)) {
    for (const el of x) { const m = deepExtractMacrosLoose(el, maxDepth-1); if (Object.values(m).some(v=> v!=null)) return m; }
    return {};
  }
  if (typeof x === 'object') {
    const out = { calories:null, proteins:null, fats:null, carbohydrates:null };
    const setIf = (key,val) => { const n = toNum(val); if (n!=null && out[key]==null) out[key]=n; };
    const ck = /cal|kcal|ккал|energy|кал/i;
    const pk = /prot|protein|белк/i;
    const fk = /fat|жир/i;
    const ck2 = /carb|углевод/i;
    for (const [k,v] of Object.entries(x)) {
      if (typeof v === 'object' && v) {
        const m = deepExtractMacrosLoose(v, maxDepth-1);
        if (Object.values(m).some(n=> n!=null)) return m;
      } else {
        if (ck.test(k)) setIf('calories', v);
        if (pk.test(k)) setIf('proteins', v);
        if (fk.test(k)) setIf('fats', v);
        if (ck2.test(k)) setIf('carbohydrates', v);
      }
    }
    if (Object.values(out).some(n=> n!=null)) return out;
  }
  return {};
}

function formatMacros(per) {
  if (!per) return "—";
  const n = (x) => (x == null ? "—" : Number(x).toFixed(1));
  return `${n(per.calories)} ккал / Б ${n(per.proteins)} г / Ж ${n(per.fats)} г / У ${n(per.carbohydrates)} г (на 100 г)`;
}

module.exports = {
  toNum,
  extractMacros,
  extractMacrosFromText,
  deepExtractMacros,
  deepExtractMacrosLoose,
  formatMacros,
};

