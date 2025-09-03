const { DEFAULTS } = require('../consts');
const { nowStamp } = require('../utils/time');
const { toNum, extractMacros } = require('../utils/macros');

async function ensureFolder(plugin, path) {
  const { vault } = plugin.app;
  const adapter = vault.adapter;
  const lastSlash = path.lastIndexOf("/");
  if (lastSlash === -1) return; // root
  const folder = path.slice(0, lastSlash);
  if (!(await adapter.exists(folder))) {
    await adapter.mkdir(folder);
  }
}

async function appendToNote(plugin, path, content) {
  const { vault } = plugin.app;
  await ensureFolder(plugin, path);
  const exists = await vault.adapter.exists(path);
  const stamp = nowStamp();
  const block = `\n\n---\n**${stamp}**\n\n${content}\n`;
  if (exists) {
    const file = vault.getAbstractFileByPath(path);
    await vault.modify(file, (await vault.read(file)) + block);
  } else {
    await vault.create(path, `# Food Log\n${block}`);
  }
}

async function savePhotoToVault(plugin, file) {
  const folder = plugin.settings.photosFolder || DEFAULTS.photosFolder;
  await ensureFolder(plugin, folder + "/a");
  const ext = (file.name?.split(".").pop() || "jpg").toLowerCase();
  const name = `food_${Date.now()}.${ext}`;
  const arr = new Uint8Array(await file.arrayBuffer());
  await plugin.app.vault.createBinary(`${folder}/${name}`, arr);
  return `${folder}/${name}`;
}

async function insertMealAndUpdateTable(plugin, path, resJson) {
  const { vault } = plugin.app;
  const file = vault.getAbstractFileByPath(path);
  if (!file) return {};
  let text = await vault.read(file);

  const startMarker = '<!--MEALS_TABLE_START-->';
  const endMarker = '<!--MEALS_TABLE_END-->';
  const header = '| Время | Блюдо | Порция г | Ккал | Б | Ж | У |';
  const sep = '|-------|-------|---------:|-----:|--:|--:|--:|';

  if (!text.includes(startMarker) || !text.includes(endMarker)) {
    const refreshBtn = `<button class="ca-refresh-table-btn">Обновить таблицу</button>`;
    text = text.trimEnd() + `\n\n${startMarker}\n\n${refreshBtn}\n\n${header}\n${sep}\n${endMarker}\n`;
  }

  const stamp = nowStamp();
  const mealId = `MID-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
  const item = (resJson.item || resJson.description || '—').trim();
  const per = extractMacros(resJson.per_100g || {});
  const grams = resJson.portion_g || resJson.portion || null;
  const t = resJson.portion_totals || (grams ? {
    calories: per.calories!=null? per.calories*grams/100 : null,
    proteins: per.proteins!=null? per.proteins*grams/100 : null,
    fats: per.fats!=null? per.fats*grams/100 : null,
    carbohydrates: per.carbohydrates!=null? per.carbohydrates*grams/100 : null,
  } : null);
  const n = (x)=> (x==null||isNaN(x)?'—':Number(x).toFixed(1));
  const mealBlock = [
    '\n---',
    `#### Приём пищи — ${stamp}`,
    `<!--MEAL_ID:${mealId}-->`,
    `**Блюдо:** ${item}`,
    `**На 100 г:** ${n(per.calories)} ккал / Б ${n(per.proteins)} / Ж ${n(per.fats)} / У ${n(per.carbohydrates)}`,
    grams ? `**Порция:** ${grams} г` : null,
    grams ? `**Итого за порцию:** ${n(t?.calories)} ккал (Б ${n(t?.proteins)} / Ж ${n(t?.fats)} / У ${n(t?.carbohydrates)})` : null,
  ].filter(Boolean).join('\n');

  const idx = text.indexOf(startMarker);
  text = text.slice(0, idx).trimEnd() + '\n\n' + mealBlock + '\n\n' + text.slice(idx);

  const s = text.indexOf(startMarker);
  const e = text.indexOf(endMarker, s);
  if (s !== -1 && e !== -1) {
    const before = text.slice(0, s);
    const tableBlock = text.slice(s, e);
    const after = text.slice(e);
    const lines = tableBlock.split(/\n/);
    if (lines[1] !== '') { lines.splice(1, 0, ''); }
    const hasRefresh = lines.some(l => l.includes('ca-refresh-table-btn'));
    const headerIndex = lines.findIndex(l => l.trim() === header);
    if (!hasRefresh && headerIndex !== -1) {
      lines.splice(headerIndex, 0, '<button class="ca-refresh-table-btn">Обновить таблицу</button>', '');
    }
    const n2 = (x)=> (x==null||isNaN(x)?'—':Number(x).toFixed(1).replace(/\.0$/,''));
    const time = stamp.slice(11,16);
    const row = `| ${time} | ${item.replace(/\|/g,'/')} | ${grams ?? '—'} | ${n2(t?.calories)} | ${n2(t?.proteins)} | ${n2(t?.fats)} | ${n2(t?.carbohydrates)} | <!--MEAL_ID:${mealId}-->`;
    const sepIndex = lines.findIndex(l => l.trim() === sep);
    if (sepIndex !== -1) lines.splice(sepIndex+1, 0, row);
    const rebuilt = lines.join('\n');
    text = before + rebuilt + after;
  }
  await vault.modify(file, text);
  return { mealId, stamp };
}

async function rebuildMealsTable(plugin, path) {
  const { vault } = plugin.app;
  const file = vault.getAbstractFileByPath(path);
  if (!file) return;
  let text = await vault.read(file);
  const startMarker = '<!--MEALS_TABLE_START-->';
  const endMarker = '<!--MEALS_TABLE_END-->';
  const header = '| Время | Блюдо | Порция г | Ккал | Б | Ж | У |';
  const sep = '|-------|-------|---------:|-----:|--:|--:|--:|';

  const s = text.indexOf(startMarker);
  const e = s === -1 ? -1 : text.indexOf(endMarker, s);
  if (s === -1 || e === -1) return;

  const before = text.slice(0, s);
  const mealBlocks = [...before.matchAll(/#### Приём пищи — (.+?)\n[\s\S]*?<!--MEAL_ID:([A-Za-z0-9_-]+)-->[\s\S]*?(?=\n---|$)/g)];
  const rows = [];
  for (const m of mealBlocks) {
    const stamp = m[1];
    const id = m[2];
    const block = m[0];
    const time = (stamp.match(/\b(\d{2}:\d{2})\b/)||[])[1] || '';
    const item = (block.match(/\*\*Блюдо:\*\*\s*(.*)/) || [,'—'])[1].replace(/\|/g,'/');
    const g = (block.match(/\*\*Порция:\*\*\s*(\d+(?:[.,]\d+)?)\s*г/) || [,'—'])[1];
    const kcal = (block.match(/Итого за порцию:\*\*\s*([\d.,]+)\s*ккал/) || [,'—'])[1];
    const p = (block.match(/Б\s*([\d.,]+)/) || [,'—'])[1];
    const f = (block.match(/Ж\s*([\d.,]+)/) || [,'—'])[1];
    const c = (block.match(/У\s*([\d.,]+)/) || [,'—'])[1];
    rows.push(`| ${time} | ${item} | ${g} | ${kcal} | ${p} | ${f} | ${c} | <!--MEAL_ID:${id}-->`);
  }
  const table = `${startMarker}\n\n<button class=\"ca-refresh-table-btn\">Обновить таблицу</button>\n\n${header}\n${sep}\n${rows.join('\n')}\n${endMarker}`;
  text = text.slice(0, s) + table + text.slice(e + endMarker.length);
  await vault.modify(file, text);
}

async function deleteMealByIdFromNote(plugin, path, mealId) {
  if (!mealId) return;
  try {
    const { vault } = plugin.app;
    const file = vault.getAbstractFileByPath(path);
    if (!file) return;
    let text = await vault.read(file);
    const res = removeMealBlockById(text, mealId);
    text = res.text;
    const rowRe = new RegExp(`^.*<!--MEAL_ID:${mealId}-->.*$`, 'm');
    text = text.replace(rowRe, '');
    await vault.modify(file, text);
  } catch (err) {
    console.warn('deleteMealByIdFromNote failed', err);
  }
}

function parseDailyTable(section) {
  const lines = section.split(/\n/);
  const rows = [];
  const headerMatch = /\|\s*Время\s*\|\s*Блюдо\s*\|\s*Ккал\/100г/i;
  for (const line of lines) {
    if (!line.startsWith('|')) continue;
    if (/^\|[- :]+\|$/.test(line)) continue;
    if (headerMatch.test(line)) continue;
    const partsRaw = line.split('|');
    let parts = partsRaw.map(p=>p.trim());
    if (parts[0] === '') parts = parts.slice(1);
    if (parts[parts.length-1] === '') parts = parts.slice(0,-1);
    if (parts.length < 12) continue;
    const [time,item,kcal100,prot100,fat100,carb100,portion,totalK,totalP,totalF,totalC,comment] = parts;
    rows.push({
      time,
      item,
      kcal100: toNum(kcal100),
      prot100: toNum(prot100),
      fat100: toNum(fat100),
      carb100: toNum(carb100),
      portion: toNum(portion),
      totalK: toNum(totalK),
      totalP: toNum(totalP),
      totalF: toNum(totalF),
      totalC: toNum(totalC),
      comment
    });
  }
  const sums = { calories:0, proteins:0, fats:0, carbohydrates:0 };
  for (const r of rows) {
    const k = (r.totalK!=null ? r.totalK : (r.kcal100!=null && r.portion!=null ? r.kcal100 * r.portion / 100 : null));
    const p = (r.totalP!=null ? r.totalP : (r.prot100!=null && r.portion!=null ? r.prot100 * r.portion / 100 : null));
    const f = (r.totalF!=null ? r.totalF : (r.fat100!=null && r.portion!=null ? r.fat100 * r.portion / 100 : null));
    const c = (r.totalC!=null ? r.totalC : (r.carb100!=null && r.portion!=null ? r.carb100 * r.portion / 100 : null));
    if (k!=null) sums.calories += k;
    if (p!=null) sums.proteins += p;
    if (f!=null) sums.fats += f;
    if (c!=null) sums.carbohydrates += c;
  }
  return { rows, sums };
}

async function updateDailySection(plugin, path) {
  await updateDailyRunningTotals(plugin, path, true);
}

async function updateDailyRunningTotals(plugin, path, withTable=false) {
  try {
    const { vault } = plugin.app;
    const file = vault.getAbstractFileByPath(path);
    if (!file) return;
    let text = await vault.read(file);
    const today = nowStamp().slice(0,10);
    const marker = `<!--DAILY_TOTALS:${today}-->`;
    const heading = `## ${today}`;

    if (!text.includes(heading)) {
      text += `\n\n${heading}\n${marker}\n**Итого сейчас:** — ккал / Б — / Ж — / У —\n\n### База (на 100 г)\n| Время | Блюдо | Ккал/100г | Б/100г | Ж/100г | У/100г | Порц. | Комментарий |\n|-------|-------|----------:|------:|------:|------:|-----:|-------------|\n\n### Итоги (по порции)\n| Время | Блюдо | Порц. | Ккал | Б | Ж | У | Комментарий |\n|-------|-------|-----:|-----:|--:|--:|--:|-------------|\n`;
    }

    if (withTable) {
      // rely on manual edits later; only keeping recompute pass
    }

    const sStart = text.indexOf(heading);
    const sNext = text.indexOf('\n## ', sStart+heading.length);
    let s = sNext === -1 ? text.slice(sStart) : text.slice(sStart, sNext);
    s = s.replace(/\|\s*Время\s*\|\s*Блюдо\s*\|\s*Ккал\/100г[\s\S]*?\n\n/g, '');
    const baseHeader = '| Время | Блюдо | Ккал/100г | Б/100г | Ж/100г | У/100г | Порц. | Комментарий |';
    const baseIdx = s.indexOf(baseHeader);
    let baseRows = [];
    if (baseIdx !== -1) {
      let baseEnd = s.indexOf('\n\n', baseIdx);
      if (baseEnd === -1) baseEnd = s.length;
      const basePart = s.slice(baseIdx, baseEnd);
      const lines = basePart.split(/\n/).slice(2);
      for (const line of lines) {
        if (!line.startsWith('|')) continue;
        const cols = line.split('|').map(c=>c.trim());
        if (cols.length < 9) continue;
        baseRows.push({
          time: cols[1],
          item: cols[2],
          kcal100: toNum(cols[3]),
          prot100: toNum(cols[4]),
          fat100: toNum(cols[5]),
          carb100: toNum(cols[6]),
          portion: toNum(cols[7]),
          comment: cols[8] || ''
        });
      }
    }
    const fmtCell = (x)=> (x==null||isNaN(x)?'—':Number(x).toFixed(1).replace(/\.0$/,''));
    const portionHeader = '| Время | Блюдо | Порц. | Ккал | Б | Ж | У | Комментарий |';
    const portionSep = '|-------|-------|-----:|-----:|--:|--:|--:|-------------|';
    const portionRows = baseRows.map(r => {
      const k = (r.kcal100!=null && r.portion!=null)? r.kcal100*r.portion/100 : null;
      const p = (r.prot100!=null && r.portion!=null)? r.prot100*r.portion/100 : null;
      const f = (r.fat100!=null && r.portion!=null)? r.fat100*r.portion/100 : null;
      const c = (r.carb100!=null && r.portion!=null)? r.carb100*r.portion/100 : null;
      return `| ${r.time} | ${r.item} | ${fmtCell(r.portion)} | ${fmtCell(k)} | ${fmtCell(p)} | ${fmtCell(f)} | ${fmtCell(c)} | ${r.comment} |`;
    });
    const headerPos = s.indexOf(portionHeader);
    if (headerPos !== -1) {
      const afterHeader = s.indexOf('\n', headerPos + portionHeader.length) + 1;
      const afterSep = s.indexOf('\n', afterHeader) + 1;
      let portionEnd = s.indexOf('\n\n', afterSep); if (portionEnd === -1) portionEnd = s.length;
      s = s.slice(0, headerPos) + portionHeader + '\n' + portionSep + '\n' + portionRows.join('\n') + '\n' + s.slice(portionEnd);
    } else {
      s += `\n${portionHeader}\n${portionSep}\n${portionRows.join('\n')}\n`;
    }
    const sums = baseRows.reduce((acc,r)=>{
      const k=(r.kcal100!=null && r.portion!=null)? r.kcal100*r.portion/100:null; if (k!=null) acc.calories+=k;
      const p=(r.prot100!=null && r.portion!=null)? r.prot100*r.portion/100:null; if (p!=null) acc.proteins+=p;
      const f=(r.fat100!=null && r.portion!=null)? r.fat100*r.portion/100:null; if (f!=null) acc.fats+=f;
      const c=(r.carb100!=null && r.portion!=null)? r.carb100*r.portion/100:null; if (c!=null) acc.carbohydrates+=c;
      return acc; }, {calories:0,proteins:0,fats:0,carbohydrates:0});
    const fmt = (n)=> (n==null||isNaN(n)?'—':Math.round(n));
    const t = Object.assign({}, DEFAULTS.dailyTargets, plugin.settings.dailyTargets||{});
    const pct = (val,tgt)=> tgt>0? Math.round(val/tgt*100): null;
    const pctStr = (p)=> p==null?'' : `${p}%`;
    const totalLine = `${marker}\n**Итого сейчас:** ${fmt(sums.calories)} ккал / Б ${fmt(sums.proteins)} / Ж ${fmt(sums.fats)} / У ${fmt(sums.carbohydrates)}` +
      (t.calories||t.proteins||t.fats||t.carbohydrates
        ? ` (К ${pctStr(pct(sums.calories,t.calories))} / Б ${pctStr(pct(sums.proteins,t.proteins))} / Ж ${pctStr(pct(sums.fats,t.fats))} / У ${pctStr(pct(sums.carbohydrates,t.carbohydrates))})` : '' );
    const pairRe = new RegExp(`${marker}\\n\\*\\*Итого сейчас:[^\\n]*\\n?`,'g');
    s = s.replace(pairRe, '');
    s = s.replace(heading, heading+'\n'+totalLine);
    text = sNext === -1 ? text.slice(0,sStart) + s : text.slice(0,sStart) + s + text.slice(sNext);
    const original = await vault.read(file);
    if (original !== text) await vault.modify(file, text);
  } catch (err) {
    console.warn('updateDailyRunningTotals failed', err);
  }
}

function removeMealBlockById(text, mealId) {
  try {
    const token = `<!--MEAL_ID:${mealId}-->`;
    const idIdx = text.indexOf(token);
    if (idIdx === -1) return { text, removed: false };
    const starts = [];
    const startRe = /(^|\n)---\r?\n#### Приём пищи[^\n]*\n/g;
    let m;
    while ((m = startRe.exec(text)) !== null) {
      const start = m.index + (m[1] ? m[1].length : 0);
      if (start < idIdx) starts.push(start);
      else break;
    }
    let startIdx = starts.length ? starts[starts.length - 1] : -1;
    if (startIdx === -1) {
      const headerRe = /(^|\n)#### Приём пищи[^\n]*\n/g;
      let headerIdx = -1;
      while ((m = headerRe.exec(text)) !== null) {
        if (m.index < idIdx) headerIdx = m.index + (m[1] ? m[1].length : 0); else break;
      }
      if (headerIdx !== -1) {
        const uptoHeader = text.slice(0, headerIdx);
        const dashIdx = uptoHeader.lastIndexOf('\n---\r?\n');
        startIdx = dashIdx !== -1 ? dashIdx + 1 : headerIdx;
      } else {
        return { text, removed: false };
      }
    }
    let endIdx = text.length;
    startRe.lastIndex = startIdx + 1;
    while ((m = startRe.exec(text)) !== null) {
      const s = m.index + (m[1] ? m[1].length : 0);
      if (s > idIdx) { endIdx = s; break; }
    }
    const tableMarker = '<!--MEALS_TABLE_START-->';
    const tableStartIdx = text.indexOf(tableMarker, idIdx);
    if (tableStartIdx !== -1 && tableStartIdx < endIdx) {
      endIdx = tableStartIdx;
    }
    let newText = text.slice(0, startIdx) + text.slice(endIdx);
    newText = newText.replace(/\n{3,}/g, '\n\n').replace(/^\s+$/gm, '');
    return { text: newText, removed: true };
  } catch {
    return { text, removed: false };
  }
}

module.exports = {
  ensureFolder,
  appendToNote,
  insertMealAndUpdateTable,
  rebuildMealsTable,
  deleteMealByIdFromNote,
  parseDailyTable,
  updateDailySection,
  updateDailyRunningTotals,
  removeMealBlockById,
  savePhotoToVault,
};
