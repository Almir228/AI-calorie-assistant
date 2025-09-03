/* Calorie Assistant — Obsidian plugin (plain JS, no bundler) */
const { Plugin, ItemView, Setting, Notice, PluginSettingTab } = require("obsidian");
const { VIEW_TYPE, DEFAULTS } = require("./consts");
const { nowStamp } = require("./utils/time");
const { bytesToBase64 } = require("./utils/bytes");
const { formatMacros, toNum, extractMacros, extractMacrosFromText, deepExtractMacros, deepExtractMacrosLoose } = require("./utils/macros");
const { callWorker } = require("./services/worker");

/** ---------- Defaults & helpers ---------- */

// Styles are now provided by styles.css
const CA_CSS = null;
.ca-container { display:flex; flex-direction:column; height:100%; min-height:0; overflow-y:hidden; -webkit-overflow-scrolling: touch; scroll-padding-bottom: calc(var(--kb-inset, 0px) + 24px); transform: translateY(calc(-1 * var(--kb-inset, 0px))); transition: transform 180ms ease-out; will-change: transform; background:#1e1e1e; }
/* Обсидиан-хак: гарантируем min-height:0 даже если родитель задаёт иное */
.view-content .ca-container { min-height: 0 !important; }
@media (pointer: fine) { .ca-container { transition: none; } }
.ca-chat {
  flex: 1 1 0%;
  min-height: 0;               /* важно для скролла внутри flex-колонки */
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain; /* не передавать скролл родителю */
  padding: 20px 20px; /* компактнее чтобы вписаться в узкую колонку */
  padding-bottom: calc(20px + var(--kb-inset, 0px));
  border-radius: 0;    /* убираем внутренний радиус — внешний уже есть */
  background: #1e1e1e; /* сливаем фон для визуального единства */
  margin-bottom: 0;
  box-sizing: border-box;
  display: block; /* вместо flex: не мешаем нативному скроллу */
}

.ca-messages {
  display: flex;
  flex-direction: column;
  gap: 16px;              /* интервал между сообщениями */
  max-width: 820px;
  margin: 0 auto 0;       /* без внешнего отступа снизу */
  width: 100%;
}

.ca-msg {
  padding: 16px 22px;
  margin: 0;              /* управляет gap контейнер */
  border-radius: 18px;
  max-width: 100%;
  line-height: 1.55;
  white-space: pre-wrap;
  position: relative;
  box-shadow: 0 2px 4px rgba(0,0,0,0.35);
  box-sizing: border-box;
}

.ca-msg.user {
  background: #3b6fb6;
  align-self: flex-end;
  color: #ffffff;
  margin-left: 40px; /* умеренное поле слева */
}

.ca-msg.bot,
.ca-msg.assistant {
  background: linear-gradient(135deg,#1e9f5a,#167a46);
  align-self: flex-start;
  color: #ecfdf5;
  margin-right: 40px; /* симметрия */
  max-width: 100%;
  border: 1px solid #3ac27a;
  border-left: 6px solid #34d399;
  box-shadow: 0 2px 5px -1px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.05), 0 0 0 3px rgba(52,211,153,0.14);
}

.ca-controls { 
  display:flex; 
  flex-direction:column; 
  gap:14px; 
  padding:20px 20px 20px;       /* базовый отступ */
  background:#1e1e1e;            /* единый фон */
  border:1px solid #333;         /* рамка по периметру */
  border-radius:20px;            /* более округлое окно */
  box-shadow: 0 14px 28px rgba(0,0,0,0.32); /* тень вниз, без затемнения верхних углов */
  background-clip: padding-box;  /* чтобы фон не вылезал за радиус */
  box-sizing:border-box; 
  position:relative;
  margin: 0;                     /* без внешних полос */
  transition: none;
  will-change: auto;
}
.ca-controls.is-compact { background: transparent; border-color: transparent; box-shadow: none; padding-top: 4px; padding-bottom: 14px; }
.ca-controls.collapsed { display:none; }
/* slide-down mechanics removed: reverting to inner collapse */

.ca-controls input,
.ca-controls textarea,
.ca-controls button,
.ca-controls .file-upload {
  width: 100%;
  padding: 14px 18px;
  border-radius: 14px;
  border: 1px solid #444;
  background: #2e2e2e;
  color: #e0e0e0;
  box-sizing: border-box;
}

.ca-controls textarea {
  resize: vertical;
  min-height: 72px;             /* сниженная стартовая высота */
  line-height: 1.5;
}

/* более заметный серый плейсхолдер */
.ca-controls input::placeholder,
.ca-controls textarea::placeholder { color: #8a8f98; opacity: 1; }

.ca-controls button { cursor:pointer; background:#3b6fb6; border:none; font-weight:500; transition:background .2s; }
.ca-controls button:hover { background:#4886d6; }

.ca-controls .row { display:flex; gap:14px; }
.ca-row { display:flex; gap:14px; flex-wrap:wrap; }
/* узкая строка порции: не переносить элементы и выровнять по центру */
.ca-portion-row { flex-wrap: nowrap; align-items: center; }

/* кастомный выбор файла */
.ca-file-row { align-items:flex-start; }
.ca-file-wrap { display:flex; flex-direction:column; gap:6px; flex: 1 1 100%; width:100%; }
.ca-file-input { display:none; }
.ca-file-btn {
  background:#2ea043 !important; /* зелёный для кнопки выбора фото */
  color:#fff;
  border:none;
  padding:14px 22px;
  border-radius:24px;
  font-weight:500;
  font-size:14px;
  cursor:pointer;
  line-height:1.2;
  box-shadow:0 2px 4px rgba(0,0,0,0.35);
  transition:background .2s, transform .1s;
  text-align:center;
  min-width:180px;
  width: 100%;
}
.ca-file-btn:hover { background:#3fb950 !important; }
.ca-file-btn:active { transform:translateY(1px); }
.ca-file-btn:focus-visible { outline:2px solid #c23c55; outline-offset:2px; }
.ca-file-name { display:none; }
.ca-file-thumb { width: 120px; height: 90px; object-fit: cover; border-radius: 10px; border:1px solid #3d3d3d; box-shadow:0 1px 2px rgba(0,0,0,0.35); }

/* сворачивание всего, кроме выбора фото — height-анимация, чтобы чат занимал освобождённое место */
.ca-controls-rest {
  display:flex;
  flex-direction:column;
  gap:14px;
  overflow:hidden;
  transition: max-height .26s ease, opacity .2s ease;
  will-change: max-height;
}
.ca-controls-rest.is-collapsed { max-height: 0px; opacity:0; pointer-events:none; }
.ca-controls-rest.is-open { opacity:1; }

/* Компактный V-тоггл над выбором фото */
.ca-chevron-wrap { display:flex; justify-content:center; align-items:center; margin: 4px 0 10px; }
.ca-controls.is-compact .ca-chevron-wrap { margin-bottom: 16px; }
.ca-chevron-btn { background: transparent; border: none; padding: 0; cursor: pointer; color: rgba(207,212,220,0.55); }
.ca-chevron-btn:hover { color: rgba(207,212,220,0.85); }
.ca-chevron-svg { width: 32px; height: 10px; display:block; transition: transform .35s ease; opacity: .75; filter: drop-shadow(0 1px 0 rgba(0,0,0,0.2)); }
.ca-chevron-btn.collapsed .ca-chevron-svg { transform: rotate(180deg); }


/* Tabs inside controls */
.ca-tabs {
  display:flex;
  gap:0;
  align-items:stretch;
  margin: 6px 0 10px;
  background: #26262a;          /* единая полоса */
  border: 1px solid #3a3a3f;    /* тонкая рамка */
  border-radius: 20px;          /* плавные края */
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0,0,0,0.20);
}
.ca-tab {
  flex:1 1 0;
  display:flex;
  align-items:center;
  justify-content:center;
  padding: 12px 14px;
  background: transparent;      /* без заливки */
  border: none;
  position: relative;
  z-index: 0; /* создаём контекст наложения, чтобы wheel ловился над чатом */
  border-radius: 0;
  color:#cbcfe0;
  cursor:pointer;
  user-select:none;
  transition: background .18s ease, color .18s ease;
  position: relative;
}
.ca-controls .ca-tabs .ca-tab { /* переопределяем общий стиль кнопок */
  background: transparent !important;
  border: none !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  -webkit-appearance: none;
}
.ca-tab:hover { color:#e8eaf2; }
.ca-tab[aria-selected="true"] { color:#ffffff; font-weight:600; background: rgba(255,255,255,0.06); }
.ca-tab:not(:last-child)::after {
  content: "";
  position: absolute;
  right: 0;
  top: 0;
  height: 100%;                 /* разделитель во всю высоту полосы */
  width: 1px;
  background: #3a3a3f;
}
.ca-tab:focus-visible { outline:2px solid #22c55e; outline-offset:2px; }
.ca-tab-panel { display:none; flex-direction:column; gap:14px; }
.ca-tab-panel.active { display:flex; }
.ca-tab-panels-wrap { overflow: hidden; transition: height .24s ease; }
.ca-tab-panel input, .ca-tab-panel textarea { scroll-margin-bottom: calc(var(--kb-inset, 0px) + 24px); }

/* measurement helper not needed with height anim */

.ca-card {
  background: #2a2a2a;
  border: 1px solid #3d3d3d;
  border-left: 4px solid #c23c55;
  padding: 16px 18px;
  border-radius: 18px;
  margin: 16px 0 4px;
  max-width: 100%;
  width: 100%;
  box-shadow: 0 1px 3px rgba(0,0,0,0.4);
  box-sizing: border-box;
}
.ca-card-title { font-weight:600; font-size:15px; margin-bottom:6px; color:#ffd7dc; }

@media (max-width: 640px) {
  .ca-msg.user { margin-left: 24px; }
  .ca-msg.bot { margin-right: 24px; }
  .ca-chat { padding:16px 14px; }
  .ca-controls { padding:16px 14px 70px; }
}
/* дополнительный отступ для перекрытий нижней панели/клавиатуры */
.ca-bottom-spacer { height: 6px; width:100%; pointer-events:none; opacity:0.5; }
.ca-controls.is-compact .ca-bottom-spacer, .ca-controls-rest.is-collapsed + .ca-bottom-spacer { height: 0; }
/* header spacing */
.ca-header { padding:8px 20px 12px 28px; }
.ca-header h2 { margin:0; }
.ca-card-sub { font-size:12px; opacity:0.75; margin-bottom:8px; }
.ca-card-macros { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size:12.5px; background:rgba(255,255,255,0.04); padding:8px 10px; border-radius:10px; margin-bottom:8px; }
.ca-card-portion { font-size:12.5px; margin-top:6px; color:#ffe2e6; }

/* Кнопка сворачивания панели */
.ca-collapse-btn {
  position: absolute;
  top: 6px;
  right: 76px; /* слева от кнопки Сброс */
  padding: 4px 10px;
  font-size: 12px;
  border-radius: 8px;
  border: 1px solid #444;
  background: #3b3b3b;
  color: #e0e0e0;
  cursor: pointer;
}

/* Кнопки в заметке (HTML) */
.ca-refresh-table-btn,
.ca-delete-meal-btn {
  background: #3b6fb6;
  color: #fff;
  border: none;
  border-radius: 10px;
  padding: 6px 12px;
  cursor: pointer;
}
.ca-delete-meal-btn { background: #c23c55; }
.ca-meal-actions { margin-top: 8px; }
`;

function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function formatMacros(per) {
  if (!per) return "—";
  const n = (x) => (x == null ? "—" : Number(x).toFixed(1));
  return `${n(per.calories)} ккал / Б ${n(per.proteins)} г / Ж ${n(per.fats)} г / У ${n(per.carbohydrates)} г (на 100 г)`;
}

function toNum(v) {
  if (v == null) return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (typeof v === 'string') {
    // вытащим первое число (может быть '123.4 ккал' или '≈ 56')
    const m = v.replace(',', '.').match(/[-+]?\d+(?:\.\d+)?/);
    if (m) return Number(m[0]);
    return null;
  }
  return null;
}

function extractMacros(obj) {
  if (!obj) return {};
  // Возможные ключи-синонимы
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

// Попытка извлечь макросы из произвольного текста
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

// Глубокий поиск макросов по ответу любого вида (объект/массив/строка)
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
    // сначала проверим прямые ключи
    const direct = extractMacros(x);
    if (Object.values(direct).some(v=> v!=null)) return direct;
    // затем рекурсивно
    for (const k of Object.keys(x)) {
      const m = deepExtractMacros(x[k], maxDepth-1);
      if (Object.values(m).some(v=> v!=null)) return m;
    }
  }
  return {};
}

// Более "размытый" поиск — ловим ключи по регуляркам: calories_100g, cals, prot_g, fatsTotal, carbsNet и т.п.
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

// Парсит таблицу приёмов внутри секции дня и возвращает {rows:[...], sums}
function parseDailyTable(section) {
  // Новая структура: | Время | Блюдо | Ккал/100г | Б/100г | Ж/100г | У/100г | Порция г | Ккал | Б | Ж | У | Комментарий |
  const lines = section.split(/\n/);
  const rows = [];
  const headerMatch = /\|\s*Время\s*\|\s*Блюдо\s*\|\s*Ккал\/100г/i;
  for (const line of lines) {
    if (!line.startsWith('|')) continue;
    if (/^\|[- :]+\|$/.test(line)) continue; // separator only
    if (headerMatch.test(line)) continue;
    const partsRaw = line.split('|');
    let parts = partsRaw.map(p=>p.trim());
    if (parts[0] === '') parts = parts.slice(1);
    if (parts[parts.length-1] === '') parts = parts.slice(0,-1);
    if (parts.length < 12) continue; // not full row
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
  // Пересчёт итогов из фактических total колонок (если пусты — считаем из per100 * portion)
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

function nowStamp() {
  // Время в московском часовом поясе (Europe/Moscow), формат: YYYY-MM-DD HH:MM:SS
  const parts = new Intl.DateTimeFormat('en-CA', { // en-CA даёт YYYY-MM-DD порядок для даты
    timeZone: 'Europe/Moscow',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  }).formatToParts(new Date());
  const get = (t)=> parts.find(p=>p.type===t)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

/** ---------- The View (panel UI) ---------- */
class CalorieView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.state = {
      currentJson: null,     // текущий JSON (на 100 г) + сервисные поля
      history: []            // [{role:'user'|'assistant', text:string}]
    };
  }
  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return "Calorie Assistant"; }
  getIcon() { return "dice"; } // встроенный значок

  async onOpen() {

    const container = this.containerEl;
    container.empty();
  container.addClass("ca-root");
  container.addClass("ca-container");
  container.style.height = "100%"; // flex container fills pane

    // header
    const header = container.createEl("div", { cls: "ca-header" });
  header.createEl("h2", { text: "Calorie Assistant" });

  // (убрано отображение worker URL по просьбе пользователя)

    // reset button (в правом верхнем углу)
  const resetBtn = container.createEl("button", { text: "Сброс", cls: "ca-reset-btn" });
    resetBtn.style.position = "absolute";
    resetBtn.style.top = "6px";
    resetBtn.style.right = "6px";
    resetBtn.style.padding = "4px 10px";
    resetBtn.style.fontSize = "12px";
    resetBtn.style.borderRadius = "8px";
    resetBtn.style.border = "1px solid #444";
    resetBtn.style.background = "#3b3b3b";
    resetBtn.style.cursor = "pointer";
    resetBtn.addEventListener("click", () => {
      this.resetChat();
      new Notice("Чат очищен.");
    });

    // chat area
    const chat = container.createEl("div", { cls: "ca-chat" });

  // controls
  const controls = container.createEl("div", { cls: "ca-controls" });
  // На тач-устройствах иногда помогаем прокрутке, на ПК — не трогаем колесо
  try {
    const isCoarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    if (isCoarse) {
      const chatWheel = (e) => {
        if (e.ctrlKey) return;
        e.preventDefault();
        try { chat.scrollTop += e.deltaY; } catch {}
      };
      chat.addEventListener('wheel', chatWheel, { passive: false });
      this.register(() => { try { chat.removeEventListener('wheel', chatWheel, { passive: false }); } catch {} });
    }
  } catch {}

  // Mobile keyboard adaptation: reserve space for on-screen keyboard and keep focused inputs visible
  try {
    // detect mobile/touch devices; skip entirely on desktop to avoid input jitter
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isCoarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints && navigator.maxTouchPoints > 1);
    const isMobileLike = isIOS || isCoarse || isTouch;

    const viewContent = container.closest?.('.view-content');
    // helper: применить инсет только через CSS-переменную контейнера (анимация через transform)
    const applyInset = (valPx) => {
      const px = valPx > 60 ? valPx : 0;
      container.style.setProperty('--kb-inset', px ? px + 'px' : '0px');
    };
    const computeInset = () => {
      if (!window.visualViewport) return 0;
      const vv = window.visualViewport;
      // базовый расчёт; на iOS в WebView бывает 0 даже при открытой клавиатуре
      const base = Math.max(0, (window.innerHeight - vv.height - (vv.offsetTop||0)));
      return base;
    };
    const scheduleInset = () => {
      cancelAnimationFrame(this._vvRaf);
      this._vvRaf = requestAnimationFrame(() => {
        // On desktop, don't apply any inset to avoid layout shifts
        if (!isMobileLike) {
          applyInset(0);
          return;
        }
        let px = computeInset();
        // если фокус в инпуте и инсет подозрительно мал — поставим безопасный запас (только iOS)
        const ae = document.activeElement;
        const tag = (ae?.tagName||'').toLowerCase();
        const isEditable = ae && (tag==='input' || tag==='textarea' || ae.isContentEditable);
        if (isEditable && px < 60 && isIOS) px = 320; // надёжный запас, чтобы поле гарантированно было видно
        applyInset(px);
  if (px <= 0) this._kbFallbackActive = false; // сбрасываем флаг, когда клавиатура скрыта
      });
    };
    scheduleInset();
    if (window.visualViewport) {
      this._vvResize = () => scheduleInset();
      this._vvScroll = () => scheduleInset();
      window.visualViewport.addEventListener('resize', this._vvResize);
      window.visualViewport.addEventListener('scroll', this._vvScroll);
    }
    this._winResize = () => scheduleInset();
    window.addEventListener('resize', this._winResize);
    this._orientation = () => scheduleInset();
    window.addEventListener('orientationchange', this._orientation);
  // viewContent уже определён
    const getScrollParent = (el) => {
      let p = el.parentElement;
      while (p && p !== document.body) {
        const cs = getComputedStyle(p);
        const canScroll = /(auto|scroll)/.test(cs.overflowY) && p.scrollHeight > p.clientHeight;
        if (canScroll) return p;
        p = p.parentElement;
      }
      // предпочтительно общий скроллер заметки
      if (viewContent && viewContent.scrollHeight > viewContent.clientHeight) return viewContent;
      return container; // fallback to plugin container
    };
  // ...
    this._focusInHandler = (e) => {
      const t = e.target;
      if (!t) return;
      const tag = (t.tagName||'').toLowerCase();
      const isEditable = tag === 'input' || tag === 'textarea' || t.isContentEditable;
      if (!isEditable) return;
      // On desktop, avoid any inset/scroll tweaks to prevent jitter
      if (!isMobileLike) return;
      // срочно пересчитаем инсет, чтобы край начал подниматься вместе с клавиатурой
      scheduleInset();
  // избежим многократных скроллов
      if (this._scrollScheduled) return;
      this._scrollScheduled = true;
    // быстрее реагируем — transform уже двигает контейнер
    requestAnimationFrame(() => {
        try {
          // fallback-инсет если так и не появился
          const currentInset = parseInt((getComputedStyle(container).getPropertyValue('--kb-inset')||'0').replace('px',''))||0;
          if (isIOS && currentInset < 60) { container.style.setProperty('--kb-inset', '300px'); this._kbFallbackActive = true; }
          const scroller = getScrollParent(t);
          // нативно с учётом scroll-padding-bottom
          t.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          // небольшой доворот, если всё ещё низко
          const rect = t.getBoundingClientRect();
          const sRect = scroller.getBoundingClientRect();
          if (rect.bottom > sRect.bottom - currentInset - 12) {
            scroller.scrollBy({ top: rect.bottom - (sRect.bottom - currentInset - 12) });
          }
        } catch {}
        this._scrollScheduled = false;
    });
    };
    this._focusOutHandler = (e) => {
      // если ушли с поля и fallback активен — вернём отступ через небольшой таймаут (на случай переключения между полями)
      setTimeout(() => {
        try {
          const active = document.activeElement;
          const tag = (active?.tagName||'').toLowerCase();
          const stillEditing = active && (tag === 'input' || tag === 'textarea' || active.isContentEditable);
          if (!stillEditing && this._kbFallbackActive) {
            container.style.setProperty('--kb-inset', '0px');
            for (const tt of kbTargets) { try { tt.style.paddingBottom = ''; tt.style.scrollPaddingBottom = ''; } catch {} }
            this._kbFallbackActive = false;
          }
        } catch {}
      }, 250);
    };
    container.addEventListener('focusin', this._focusInHandler, true);
    container.addEventListener('focusout', this._focusOutHandler, true);

  // Доп. страховка: если клавиатура скрылась без blur (iOS), принудительно зачистим отступ
    const ensureClearedIfHidden = () => {
      try {
        const inset = computeInset();
        const likelyHidden = inset < 30;
        if (likelyHidden) {
          applyInset(0);
          this._kbFallbackActive = false;
        }
      } catch {}
    };
    this._kbEnsureClear = ensureClearedIfHidden;
    // сработает при таче/клике вне поля или после закрытия клавиатуры свайпом
  window.addEventListener('click', ensureClearedIfHidden, true);
  window.addEventListener('touchend', ensureClearedIfHidden, true);
  window.addEventListener('focus', ensureClearedIfHidden, true);
  } catch {}

  // compact chevron toggle (above photo)
  const chevWrap = controls.createEl('div', { cls: 'ca-chevron-wrap' });
  const chevBtn = chevWrap.createEl('div', { cls: 'ca-chevron-btn' });
  chevBtn.setAttribute('role','button');
  chevBtn.setAttribute('tabindex','0');
  chevBtn.setAttribute('aria-label','Свернуть/развернуть панель');
  chevBtn.innerHTML = '<svg class="ca-chevron-svg" viewBox="0 0 44 14" xmlns="http://www.w3.org/2000/svg"><path d="M2 2 L22 12 L42 2" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';

  // контейнер для остального (сворачивается отдельно) + вкладки
      const restContainer = controls.createEl('div', { cls: 'ca-controls-rest' });
  const setAria = (expanded) => {
        chevBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      };
      // helper: измерить высоту содержимого для анимации
      const updateRestMaxHeight = () => {
        try {
          const wasCollapsed = restContainer.classList.contains('is-collapsed');
          if (wasCollapsed) { restContainer.classList.remove('is-collapsed'); restContainer.classList.add('is-open'); }
          // reflow
          // eslint-disable-next-line no-unused-expressions
          restContainer.offsetHeight;
          let h = restContainer.scrollHeight;
          // защитимся от случайного нулевого измерения во время анимаций/перекладок
          if (!h || h < 40) {
            // попробуем ещё раз на следующем кадре
            requestAnimationFrame(() => {
              try {
                const hh = restContainer.scrollHeight;
                if (hh && hh >= 40) {
                  restContainer.style.setProperty('--rest-max-height', hh + 'px');
                }
              } catch {}
            });
          } else {
            restContainer.style.setProperty('--rest-max-height', h + 'px');
          }
          if (wasCollapsed) { restContainer.classList.remove('is-open'); restContainer.classList.add('is-collapsed'); }
        } catch {}
      };

      // начальное состояние (измерение высоты выполним ПОСЛЕ построения контента ниже)
      if (this.plugin.settings.controlsCollapsed) {
        restContainer.classList.add('is-collapsed');
        chevBtn.classList.add('collapsed');
        setAria(false);
      } else {
        restContainer.classList.add('is-open');
        setAria(true);
        // убедимся, что нет залипающего inline max-height
        restContainer.style.maxHeight = '';
      }

      let isAnimatingRest = false;
      const expandRest = () => {
        if (isAnimatingRest) return; isAnimatingRest = true;
  const el = restContainer;
        const panel = controls;
        // set open state first so children get natural sizes
  el.classList.remove('is-collapsed');
  el.classList.add('is-open');
  setAria(true);
        chevBtn.classList.remove('collapsed');
  if (panel) panel.classList.remove('is-compact');
  // chat keeps its own scroll; no container toggle
        // ensure panels wrapper is at auto to measure full height
        const panelsWrap = el.querySelector('.ca-tab-panels-wrap');
        const prevPanelsH = panelsWrap ? panelsWrap.style.height : undefined;
        if (panelsWrap) panelsWrap.style.height = 'auto';
        // force reflow then measure
        // eslint-disable-next-line no-unused-expressions
        el.offsetHeight;
        let target = el.scrollHeight;
        if (!target || target < 20) {
          // fallback: try reflow again
          // eslint-disable-next-line no-unused-expressions
          el.offsetHeight;
          target = el.scrollHeight;
        }
        if (!target || target < 10) {
          // give up on animation, just show
          el.style.maxHeight = '';
          if (panelsWrap && prevPanelsH !== undefined) panelsWrap.style.height = prevPanelsH;
          try { updateRestMaxHeight(); } catch {}
          isAnimatingRest = false;
          return;
        }
        // start from 0 then animate to target
        el.style.maxHeight = '0px';
        // force reflow and then set the target in next frame to trigger transition
        // eslint-disable-next-line no-unused-expressions
        el.offsetHeight;
        requestAnimationFrame(() => {
          el.style.maxHeight = target + 'px';
        });
        let ended = false;
        const onEnd = () => {
          if (ended) return; ended = true;
          el.removeEventListener('transitionend', onEnd);
          el.style.maxHeight = '';
          if (panelsWrap && prevPanelsH !== undefined) panelsWrap.style.height = prevPanelsH;
          try { updateRestMaxHeight(); } catch {}
          isAnimatingRest = false;
        };
        el.addEventListener('transitionend', onEnd);
        // таймаут-защита, если transitionend не сработал
        setTimeout(() => { if (!ended) onEnd(); }, 400);
      };
      const collapseRest = () => {
        if (isAnimatingRest) return; isAnimatingRest = true;
  const el = restContainer;
        const panel = controls;
        // set from current content height
        const panelsWrap = el.querySelector('.ca-tab-panels-wrap');
        const prevPanelsH = panelsWrap ? panelsWrap.style.height : undefined;
        if (panelsWrap) panelsWrap.style.height = 'auto';
        // eslint-disable-next-line no-unused-expressions
        el.offsetHeight;
        const start = el.scrollHeight || 0;
        if (panelsWrap && prevPanelsH !== undefined) panelsWrap.style.height = prevPanelsH;
        el.style.maxHeight = (start > 0 ? start : 0) + 'px';
        // force reflow
        // eslint-disable-next-line no-unused-expressions
        el.offsetHeight;
  el.classList.remove('is-open');
  el.classList.add('is-collapsed');
        setAria(false);
        chevBtn.classList.add('collapsed');
  if (panel) panel.classList.add('is-compact');
  // chat keeps its own scroll; no container toggle
        el.style.maxHeight = '0px';
        let ended = false;
        const onEnd = () => {
          if (ended) return; ended = true;
          el.removeEventListener('transitionend', onEnd);
          el.style.maxHeight = '';
          isAnimatingRest = false;
        };
        el.addEventListener('transitionend', onEnd);
        setTimeout(() => { if (!ended) onEnd(); }, 400);
      };
      const toggleCollapsed = () => {
        const currentlyCollapsed = restContainer.classList.contains('is-collapsed');
        if (currentlyCollapsed) {
          expandRest();
          this.plugin.settings.controlsCollapsed = false;
        } else {
          collapseRest();
          this.plugin.settings.controlsCollapsed = true;
        }
        this.plugin.saveSettings();
      };
      // restore chevron listeners
      chevBtn.addEventListener('click', toggleCollapsed);
      chevBtn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleCollapsed(); }
      });
      // Tabs header
      const tabs = restContainer.createEl('div', { cls: 'ca-tabs' });
      const tabPhoto = tabs.createEl('button', { cls: 'ca-tab', text: 'Фото' });
      const tabText = tabs.createEl('button', { cls: 'ca-tab', text: 'Описание' });
      const tabExport = tabs.createEl('button', { cls: 'ca-tab', text: 'Экспорт' });
      tabPhoto.setAttribute('role','tab'); tabText.setAttribute('role','tab'); tabExport.setAttribute('role','tab');
      tabPhoto.setAttribute('aria-selected','true');

  // Panels wrapper for smooth height transitions
  const panelsWrap = restContainer.createEl('div', { cls: 'ca-tab-panels-wrap' });
  const panelPhoto = panelsWrap.createEl('div', { cls: 'ca-tab-panel active', attr: { 'data-panel': 'photo' } });
  const panelText = panelsWrap.createEl('div', { cls: 'ca-tab-panel', attr: { 'data-panel': 'text' } });
  const panelExport = panelsWrap.createEl('div', { cls: 'ca-tab-panel', attr: { 'data-panel': 'export' } });

      // Panel 1: Photo analysis + portion + correction
      const fileRow = panelPhoto.createEl("div", { cls: "ca-row ca-file-row" });
      const fileWrap = fileRow.createEl("div", { cls: "ca-file-wrap" });
      const file = fileWrap.createEl("input", { type: "file", cls: "ca-file-input" });
      file.accept = "image/*"; file.id = 'ca-file-input';
      // На мобильных: по умолчанию открываем галерею. Камеру включаем только если разрешено в настройках.
      if (this.plugin.settings.cameraDefault) {
        try { file.setAttribute('capture', 'environment'); } catch {}
      } else {
        try { file.removeAttribute('capture'); } catch {}
      }
      const fileBtn = fileWrap.createEl("button", { text: "Выбрать фото" });
      fileBtn.addClass('ca-file-btn');
      fileBtn.addEventListener('click', (e) => { e.preventDefault(); file.click(); });
      const thumb = fileWrap.createEl('img', { cls: 'ca-file-thumb' });
      thumb.style.display = 'none';
      file.addEventListener("change", ()=> {
        if (file.files && file.files[0]) {
          const f = file.files[0];
          const url = URL.createObjectURL(f);
          thumb.src = url;
          thumb.style.display = '';
        } else { thumb.src = ''; thumb.style.display = 'none'; }
      });
      const analyzeBtn = fileRow.createEl("button", { text: "Анализ фото" });
      analyzeBtn.style.width = '100%'; analyzeBtn.style.flex = '1 1 100%';
      analyzeBtn.addEventListener("click", async () => {
        if (!file.files || file.files.length === 0) { new Notice("Выбери фото."); return; }
        const f = file.files[0]; await this.analyzePhotoFile(f, chat);
      });
  const instrRow = panelPhoto.createEl("div", { cls: "ca-row" });
  const instr = instrRow.createEl("textarea", { cls: "ca-textarea", placeholder: "Укажите правки к фото" });
      const portionRow = panelPhoto.createEl("div", { cls: "ca-row ca-portion-row" });
      const portion = portionRow.createEl("input", { type: "number", placeholder: "Порция, г (опц.)" });
      portion.value = String(this.plugin.settings.defaultPortion || 0);
      portion.style.width = '25%'; portion.style.maxWidth = '110px';
      const portionApplyBtn = portionRow.createEl("button", { text: "Учесть вес порции" });
      portionApplyBtn.style.width = '75%'; portionApplyBtn.style.flex = '0 0 75%'; portionApplyBtn.style.marginLeft = 'auto';
      portionApplyBtn.addEventListener("click", async () => {
        const grams = Number(portion.value);
        if (!grams || grams <= 0) { new Notice('Укажи вес порции в граммах'); return; }
        if (!this.state.currentJson || !this.state.currentJson.per_100g) { new Notice('Нет текущего блюда для учёта. Сначала проанализируй фото или текст.'); return; }
        const per = extractMacros(this.state.currentJson.per_100g);
        const clone = JSON.parse(JSON.stringify(this.state.currentJson));
        clone.portion_g = grams;
        clone.portion_totals = {
          calories: per.calories!=null? per.calories*grams/100 : null,
          proteins: per.proteins!=null? per.proteins*grams/100 : null,
          fats: per.fats!=null? per.fats*grams/100 : null,
          carbohydrates: per.carbohydrates!=null? per.carbohydrates*grams/100 : null,
        };
        this.recordEntry(clone);
        this.state.currentJson = clone;
        try {
          const t = clone.portion_totals; const n = (x)=> (x==null ? '—' : Number(x).toFixed(1));
          const title = this.state.currentJson.item ? ` — ${this.state.currentJson.item}` : '';
          this.pushAssistant(`Учёл порцию${title} (${grams} г) → ${n(t.calories)} ккал / Б ${n(t.proteins)} / Ж ${n(t.fats)} / У ${n(t.carbohydrates)}`, chat);
        } catch {}
        this.renderChat(chat, true); this.plugin.saveLastSession(this.state);
        const path = this.plugin.settings.notePath || DEFAULTS.notePath; await this.updateDailySection(path);
        new Notice('Порция учтена.');
      });
      const applyBtn = panelPhoto.createEl("button", { text: "Применить правку" });
      applyBtn.addEventListener("click", async () => {
        if (!this.state.currentJson) { new Notice("Сначала проанализируй фото."); return; }
        const text = instr.value.trim();
        await this.applyCorrection(text, portion.value ? Number(portion.value) : 0, chat);
        instr.value = "";
      });

  // Panel 2: Text description → AI estimate
  const descRow = panelText.createEl('div', { cls: 'ca-row' });
  const manualName = descRow.createEl('input', { type: 'text', placeholder: 'Название (опц.)' });
  const manualDesc = descRow.createEl('input', { type: 'text', placeholder: 'Описание блюда' });
  const manualAiBtn = descRow.createEl('button', { text: 'Оценить по описанию (ИИ)' });

  // Порция и кнопка "Учесть вес" в табе Описание
  const portionRowText = panelText.createEl('div', { cls: 'ca-row ca-portion-row' });
  const portionText = portionRowText.createEl('input', { type: 'number', placeholder: 'Порция, г (опц.)' });
  portionText.value = String(this.plugin.settings.defaultPortion || 0);
  portionText.style.width = '25%'; portionText.style.maxWidth = '110px';
  const portionApplyBtnText = portionRowText.createEl('button', { text: 'Учесть вес порции' });
  portionApplyBtnText.style.width = '75%'; portionApplyBtnText.style.flex = '0 0 75%'; portionApplyBtnText.style.marginLeft = 'auto';
  portionApplyBtnText.addEventListener('click', async () => {
    const grams = Number(portionText.value);
    if (!grams || grams <= 0) { new Notice('Укажи вес порции в граммах'); return; }
    if (!this.state.currentJson || !this.state.currentJson.per_100g) { new Notice('Нет текущего блюда для учёта. Сначала проанализируй фото или текст.'); return; }
    const per = extractMacros(this.state.currentJson.per_100g);
    const clone = JSON.parse(JSON.stringify(this.state.currentJson));
    clone.portion_g = grams;
    clone.portion_totals = {
      calories: per.calories!=null? per.calories*grams/100 : null,
      proteins: per.proteins!=null? per.proteins*grams/100 : null,
      fats: per.fats!=null? per.fats*grams/100 : null,
      carbohydrates: per.carbohydrates!=null? per.carbohydrates*grams/100 : null,
    };
    this.recordEntry(clone);
    this.state.currentJson = clone;
    try {
      const t = clone.portion_totals; const n = (x)=> (x==null ? '—' : Number(x).toFixed(1));
      const title = this.state.currentJson.item ? ` — ${this.state.currentJson.item}` : '';
      this.pushAssistant(`Учёл порцию${title} (${grams} г) → ${n(t.calories)} ккал / Б ${n(t.proteins)} / Ж ${n(t.fats)} / У ${n(t.carbohydrates)}`, this.containerEl.querySelector('.ca-chat'));
    } catch {}
    this.renderChat(this.containerEl.querySelector('.ca-chat'), true); this.plugin.saveLastSession(this.state);
    const path = this.plugin.settings.notePath || DEFAULTS.notePath; await this.updateDailySection(path);
    new Notice('Порция учтена.');
  });
  manualAiBtn.addEventListener('click', async () => {
      try {
        const item = manualName.value.trim();
        const desc = manualDesc.value.trim();
        if (!item && !desc) { new Notice('Укажи название или описание блюда'); return; }
        const q = [item, desc].filter(Boolean).join(' — ');
        this.pushUser(`Оцени по тексту: ${q}`, chat);

        const variants = [
          { mode: 'text', item, description: desc, language: 'ru' },
          { mode: 'text', text: q, language: 'ru' },
          { item, description: desc, language: 'ru' },
          { query: q, language: 'ru' },
          { prompt: q, language: 'ru' }
        ];

        let res = null;
        let per = null;
        let lastRaw = '';
        for (const v of variants) {
          try {
            const r = await this.callWorker(v);
            console.log('Worker response:', JSON.stringify(r, null, 2));
            if (r) {
              if (typeof r.raw === 'string') lastRaw = r.raw;
              // 1) глубокий поиск по любому объекту
              const deep = deepExtractMacros(r);
              console.log('Deep extracted:', deep);
              if (Object.values(deep).some(v=> v!=null)) { per = deep; res = r; break; }
              // 1b) размытый поиск по ключам
              const loose = deepExtractMacrosLoose(r);
              console.log('Loose extracted:', loose);
              if (Object.values(loose).some(v=> v!=null)) { per = loose; res = r; break; }              // 2) классические места
              const candidates = [
                r.per_100g, r.per100, r.base,
                r.result?.per_100g, r.data?.per_100g,
                r.result, r.data, r
              ];
              for (const obj of candidates) {
                const m = extractMacros(obj);
                if (m && (m.calories!=null || m.proteins!=null || m.fats!=null || m.carbohydrates!=null)) { per = m; res = r; break; }
              }
              // 3) строковые поля message/raw
              if (!per && typeof r.message === 'string') {
                const guessed = extractMacrosFromText(r.message);
                if (Object.values(guessed).some(v=> v!=null)) { per = guessed; res = r; }
              }
              if (!per && typeof r.raw === 'string') {
                const guessed = extractMacrosFromText(r.raw);
                if (Object.values(guessed).some(v=> v!=null)) { per = guessed; res = r; }
              }
              if (per) break;
            }
          } catch (e) { 
            console.log('Worker call failed:', e);
            /* try next variant */ 
          }
        }

        if (!per) {
          console.log('No macros found, lastRaw:', lastRaw);
          const hint = lastRaw && typeof lastRaw === 'string' ? (' Сниппет: ' + lastRaw.slice(0,180)) : '';
          throw new Error('Пустой ответ от сервиса (нет макросов).' + hint);
        }
        if (!res) res = { per_100g: per, item };
        if (!res.per_100g) res.per_100g = per || {};
        if (!res.item && item) res.item = item;

  const grams = Number(portionText.value);
        if (grams) {
          res.portion_g = grams;
          const p = extractMacros(res.per_100g);
          res.portion_totals = {
            calories: p.calories!=null? p.calories*grams/100 : null,
            proteins: p.proteins!=null? p.proteins*grams/100 : null,
            fats: p.fats!=null? p.fats*grams/100 : null,
            carbohydrates: p.carbohydrates!=null? p.carbohydrates*grams/100 : null,
          };
        }

        this.state.currentJson = res;
        this.plugin.saveLastSession(this.state);
        this.pushAssistant(`AI-оценка получена.\n${formatMacros(res.per_100g)}`, chat);
        // перерисуем, чтобы карточка сразу показала порцию (если указана)
        this.renderChat(chat, true);
      } catch (e) {
        console.warn('estimate-from-text failed', e);
        new Notice('Не удалось получить оценку от ИИ: '+ (e?.message || 'ошибка сервиса'));
      }
    });

    // Panel 3: Export to note
    const exportRow = panelExport.createEl('div', { cls: 'ca-row' });
    const exportBtn = exportRow.createEl('button', { text: 'Экспорт в заметку' });
    exportBtn.addEventListener('click', async ()=> { await this.finalizeToNote(chat); });

    // Tabs switching
  const setActiveTab = (idx) => {
        const btns = [tabPhoto, tabText, tabExport];
        const panels = [panelPhoto, panelText, panelExport];
        const currentIdx = btns.findIndex(b => b.getAttribute('aria-selected') === 'true');
        if (currentIdx === idx) return; // nothing to do

        // prepare height animation
        const startH = panelsWrap.offsetHeight;
        if (startH) panelsWrap.style.height = startH + 'px';

        // switch active panel
        btns.forEach((b,i)=> b.setAttribute('aria-selected', String(i===idx)));
        panels.forEach((p,i)=> p.classList.toggle('active', i===idx));

        // measure target height and animate
        // force reflow
        // eslint-disable-next-line no-unused-expressions
        panelsWrap.offsetHeight;
        const target = panels[idx].scrollHeight;
        panelsWrap.style.height = target + 'px';
        const onEnd = (e) => {
          if (e.propertyName !== 'height') return;
          panelsWrap.style.height = 'auto';
          panelsWrap.removeEventListener('transitionend', onEnd);
          // после изменения высоты контента пересчитаем max-height сворачиваемой части
          try { updateRestMaxHeight && updateRestMaxHeight(); } catch {}
          requestAnimationFrame(() => { try { updateRestMaxHeight && updateRestMaxHeight(); } catch {} });
          setTimeout(() => { try { updateRestMaxHeight && updateRestMaxHeight(); } catch {} }, 120);
        };
        panelsWrap.addEventListener('transitionend', onEnd);
      };
    tabPhoto.addEventListener('click', ()=> setActiveTab(0));
    tabText.addEventListener('click', ()=> setActiveTab(1));
    tabExport.addEventListener('click', ()=> setActiveTab(2));

  // spacer чтобы нижняя панель/клавиатура не перекрывала кнопки — в самом конце
  restContainer.createEl("div", { cls: "ca-bottom-spacer" });

  // Прокси-скролл: колёсико/свайп по панели двигает чат (когда панель раскрыта)
  try {
    const wheelHandler = (e) => {
      if (!restContainer.classList.contains('is-open')) return;
      e.preventDefault();
      try { chat.scrollTop += e.deltaY; } catch {}
    };
  const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  if (coarse) controls.addEventListener('wheel', wheelHandler, { passive: false });
    let lastY = null;
    const ts = (e) => { lastY = e.touches && e.touches[0] ? e.touches[0].clientY : null; };
    const tm = (e) => {
      if (!restContainer.classList.contains('is-open')) return;
      if (!e.touches || !e.touches[0]) return;
      const y = e.touches[0].clientY;
      if (lastY != null) {
        const dy = lastY - y;
        if (dy !== 0) {
          e.preventDefault();
          try { chat.scrollTop += dy; } catch {}
        }
      }
      lastY = y;
    };
    const te = () => { lastY = null; };
    controls.addEventListener('touchstart', ts, { passive: true });
    controls.addEventListener('touchmove', tm, { passive: false });
    controls.addEventListener('touchend', te, { passive: true });
    // Прокси-скролл с контейнера: если крутим не над чатом — прокрутить чат
    const containerWheel = (e) => {
      if (e.target && e.target.closest('.ca-chat')) return; // обычное поведение над чатом
      e.preventDefault();
      try { chat.scrollTop += e.deltaY; } catch {}
    };
    if (coarse) container.addEventListener('wheel', containerWheel, { passive: false });
    // cleanup on unload
    this.register(() => {
      try { controls.removeEventListener('wheel', wheelHandler, { passive: false }); } catch {}
      try { controls.removeEventListener('touchstart', ts, { passive: true }); } catch {}
      try { controls.removeEventListener('touchmove', tm, { passive: false }); } catch {}
      try { controls.removeEventListener('touchend', te, { passive: true }); } catch {}
      try { container.removeEventListener('wheel', containerWheel, { passive: false }); } catch {}
    });
  } catch {}

  // перерасчитать max-height когда контент уже построен
  const recalcAfter = () => { try { updateRestMaxHeight && updateRestMaxHeight(); } catch {} };
  // сразу после построения
  recalcAfter();
  // и на следующий кадр для надёжности
  requestAnimationFrame(recalcAfter);
  // и при ресайзах
  window.addEventListener('resize', recalcAfter);
  this.register(() => window.removeEventListener('resize', recalcAfter));

  // initial render
  this.renderChat(chat, true);

    // restore saved session
    const saved = this.plugin.getLastSession();
    if (saved) {
      this.state = saved;
      this.renderChat(chat, true);
    }
  }

  onClose() {
    try {
      const container = this.containerEl?.querySelector?.('.ca-container') || this.containerEl;
  const viewContent = container.closest?.('.view-content');
  if (container && this._focusInHandler) container.removeEventListener('focusin', this._focusInHandler, true);
  if (container && this._focusOutHandler) container.removeEventListener('focusout', this._focusOutHandler, true);
  if (window.visualViewport && this._vvResize) window.visualViewport.removeEventListener('resize', this._vvResize);
  if (window.visualViewport && this._vvScroll) window.visualViewport.removeEventListener('scroll', this._vvScroll);
  if (this._winResize) window.removeEventListener('resize', this._winResize);
  if (this._orientation) window.removeEventListener('orientationchange', this._orientation);
  if (this._vvRaf) cancelAnimationFrame(this._vvRaf);
      if (container) container.style.removeProperty('--kb-inset');
  if (this._kbEnsureClear) {
    window.removeEventListener('click', this._kbEnsureClear, true);
    window.removeEventListener('touchend', this._kbEnsureClear, true);
    window.removeEventListener('focus', this._kbEnsureClear, true);
    this._kbEnsureClear = null;
  }
  this._kbFallbackActive = false;
    } catch {}
  }

  /** ---------- UI helpers ---------- */
  renderChat(container, reset = false) {
  if (reset) container.empty();

  const area = container.createEl("div", { cls: "ca-messages" });
  for (const m of this.state.history) {
    const bubble = area.createEl("div", { cls: `ca-msg ${m.role}` });
    bubble.setText(m.text);
  }
  if (this.state.currentJson) {
    const c = this.state.currentJson;
    const card = container.createEl("div", { cls: "ca-card" });
    const title = c.item ?? "—";
    const desc = c.description ?? "—";
    card.createEl("div", { cls: "ca-card-title", text: title });
    card.createEl("div", { cls: "ca-card-sub", text: desc });
    card.createEl("div", { cls: "ca-card-macros", text: formatMacros(c.per_100g) });
    if (c.portion_g && c.portion_totals) {
      const t = c.portion_totals;
      const n = (x)=> (x==null ? "—" : Number(x).toFixed(1));
      card.createEl("div", { cls: "ca-card-portion", text:
        `Порция ${c.portion_g} г → ${n(t.calories)} ккал / Б ${n(t.proteins)} / Ж ${n(t.fats)} / У ${n(t.carbohydrates)}` });
    }
    // Actions: delete current meal
    const actions = card.createEl('div', { cls: 'ca-meal-actions' });
    const delBtn = actions.createEl('button', { text: 'Удалить приём', cls: 'ca-delete-meal-btn' });
    delBtn.addEventListener('click', async () => {
      await this.deleteCurrentMealFromNote();
    });
  }
  // якорение снизу обеспечивается flex-контейнером .ca-chat
  // Автоскролл к последним сообщениям, если пользователь и так «внизу»
  try {
    const nearBottom = Math.abs(container.scrollHeight - container.clientHeight - container.scrollTop) < 60;
    if (nearBottom) container.scrollTop = container.scrollHeight;
  } catch {}
}

  // Удаление текущего приёма:
  // 1) Удаляет блок Приёма и строку из таблицы (по MEAL_ID)
  // 2) Пересобирает таблицу и итоги
  async deleteCurrentMealFromNote() {
    try {
      const cur = this.state.currentJson;
      if (!cur) { new Notice('Нет текущего приёма'); return; }
      // Путь заметки
      const activeFile = this.app.workspace.getActiveFile?.();
      const useActive = this.plugin.settings.exportToActiveNote && activeFile;
      const path = useActive ? activeFile.path : (this.plugin.settings.notePath || DEFAULTS.notePath);
      const { vault } = this.app;
      const file = vault.getAbstractFileByPath(path);
      if (!file) { new Notice('Заметка не найдена'); return; }
      let text = await vault.read(file);

      // Найдём MEAL_ID в текущем json (если нет — попробуем найти по названию и времени)
      let mealId = cur.mealId || null;
      if (!mealId) {
        const m = text.match(/<!--MEAL_ID:([A-Za-z0-9_-]+)-->/);
        if (m) mealId = m[1];
      }

      let changed = false;
      if (mealId) {
        // Удаляем целиком блок приёма, ориентируясь на ближайшие разделители/заголовок
        const res = removeMealBlockById(text, mealId);
        if (res.removed) {
          text = res.text;
          changed = true;
        }
        // Удалим строку из таблицы (если есть)
        const rowRe = new RegExp(`^.*<!--MEAL_ID:${mealId}-->.*$`, 'm');
        const t2 = text.replace(rowRe, '');
        if (t2 !== text) { text = t2; changed = true; }
      }

      if (changed) {
        await vault.modify(file, text);
        // Пересчёт таблиц/итогов (если используется дневной режим)
        await this.updateDailySection(path);
        new Notice('Приём удалён');
      }

      // Очистим текущую карточку
      this.state.currentJson = null;
      const chatEl = this.containerEl.querySelector('.ca-chat');
      if (chatEl) this.renderChat(chatEl, true);
      this.plugin.saveLastSession(this.state);
    } catch (e) {
      console.warn('deleteCurrentMealFromNote failed', e);
      new Notice('Ошибка удаления');
    }
  }

  pushUser(text, chat) {
  this.state.history.push({ role: "user", text });
  const lim = this.plugin.settings.chatHistoryLimit || DEFAULTS.chatHistoryLimit;
  if (this.state.history.length > lim) this.state.history.splice(0, this.state.history.length - lim);
    this.renderChat(chat, true);
    this.plugin.saveLastSession(this.state);
  }
  pushAssistant(text, chat) {
  this.state.history.push({ role: "assistant", text });
  const lim = this.plugin.settings.chatHistoryLimit || DEFAULTS.chatHistoryLimit;
  if (this.state.history.length > lim) this.state.history.splice(0, this.state.history.length - lim);
    this.renderChat(chat, true);
    this.plugin.saveLastSession(this.state);
  }

  resetChat() {
    this.state.history = [];
    this.state.currentJson = null;
    this.plugin.saveLastSession(this.state);
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    if (leaves.length) {
      const view = leaves[0].view;
      if (view && view.renderChat && view.containerEl) {
        const chatEl = view.containerEl.querySelector('.ca-chat');
        if (chatEl) view.renderChat(chatEl, true);
      }
    }
  }

  /** ---------- Worker calls ---------- */
  async analyzePhotoFile(file, chat) {
    try {
      const arr = new Uint8Array(await file.arrayBuffer());
      const b64 = bytesToBase64(arr);
      const mime = file.type || "image/jpeg";

      this.pushUser("(фото) распознай, пожалуйста", chat);

      const res = await this.callWorker({ image_b64: b64, mime });
      if (res.error) throw new Error(res.error);
      this.state.currentJson = res;

      const msg = res.message || "Готово.";
      this.pushAssistant(`**База получена.**\n${formatMacros(res.per_100g)}\n${msg}`, chat);

      if (this.plugin.settings.attachPhoto) {
        await this.savePhotoToVault(file);
      }
    } catch (e) {
      console.error(e);
      new Notice("Ошибка анализа фото: " + e.message);
      this.pushAssistant("❌ Ошибка анализа фото: " + e.message, chat);
    }
  }

  async applyCorrection(instruction, portionG, chat) {
    try {
      if (!instruction && !portionG) {
        new Notice("Введите правку или укажите порцию.");
        return;
      }
      if (instruction) this.pushUser(instruction, chat);

      const body = {
        previous_json: this.state.currentJson,
        instruction: instruction || ""
      };
      if (portionG && portionG > 0) body.portion_g = portionG;

      const res = await this.callWorker(body);
      if (res.error) throw new Error(res.error);

      this.state.currentJson = res;
      let reply = `**Обновил.**\n${formatMacros(res.per_100g)}`;
      if (res.portion_g && res.portion_totals) {
        const t = res.portion_totals, n=(x)=> (x==null ? "—" : Number(x).toFixed(1));
        reply += `\nПорция ${res.portion_g} г → ${n(t.calories)} ккал / Б ${n(t.proteins)} / Ж ${n(t.fats)} / У ${n(t.carbohydrates)}`;
      }
      if (res.message) reply += `\n${res.message}`;
      this.pushAssistant(reply, chat);
    } catch (e) {
      console.error(e);
      new Notice("Ошибка правки: " + e.message);
      this.pushAssistant("❌ Ошибка правки: " + e.message, chat);
    }
  }

  async finalizeToNote(chat) {
    try {
      const body = { mode: "final", previous_json: this.state.currentJson };
      let res;
      try { res = await this.callWorker(body); } catch (e) { res = { error: e?.message || String(e) }; }
      if (res && res.error) {
        // будем использовать локальные данные
        res = Object.assign({}, this.state.currentJson || {});
      }

      const merged = Object.assign({}, this.state.currentJson || {}, res || {});

      // Выбор цели: активная заметка или путь из настроек
      const activeFile = this.app.workspace.getActiveFile?.();
      const useActive = this.plugin.settings.exportToActiveNote && activeFile;
      const path = useActive ? activeFile.path : (this.plugin.settings.notePath || DEFAULTS.notePath);

      if (useActive) {
        await this.insertMealAndUpdateTable(path, merged);
        this.pushAssistant("Приём пищи добавлен в текущую заметку и учтён в таблице.", chat);
      } else {
        const md = res.markdown || "";
        await this.appendToNote(path, md);
        // старый сценарий с дневными итогами
        this.recordEntry(merged);
        await this.updateDailySection(path);
        this.pushAssistant("Итог сохранён в заметку: " + path + " (дневной раздел обновлён)", chat);
      }
      if (this.plugin.settings.autoClearOnFinalize) {
        this.state.currentJson = null;
        this.renderChat(chat, true);
        this.plugin.saveLastSession(this.state);
      }
      new Notice("Отчёт добавлен: " + path);
    } catch (e) {
      console.error(e);
      new Notice("Ошибка финализации: " + e.message);
      this.pushAssistant("❌ Ошибка финализации: " + e.message, chat);
    }
  }

  // Добавляет блок "Приём пищи" прямо перед таблицей и обновляет таблицу в конце заметки
  async insertMealAndUpdateTable(path, resJson) {
    const { vault } = this.app;
    const file = vault.getAbstractFileByPath(path);
    if (!file) return;
    let text = await vault.read(file);

    const startMarker = '<!--MEALS_TABLE_START-->';
    const endMarker = '<!--MEALS_TABLE_END-->';
    const header = '| Время | Блюдо | Порция г | Ккал | Б | Ж | У |';
    const sep = '|-------|-------|---------:|-----:|--:|--:|--:|';

    // Создать таблицу если её нет
    if (!text.includes(startMarker) || !text.includes(endMarker)) {
      // Важно: пустая строка между кнопкой и заголовком таблицы — иначе MD-движок может не распознать таблицу
      const refreshBtn = `<button class="ca-refresh-table-btn">Обновить таблицу</button>`;
      text = text.trimEnd() + `\n\n${startMarker}\n\n${refreshBtn}\n\n${header}\n${sep}\n${endMarker}\n`;
    }

    // Сформировать блок приёма пищи
  const stamp = nowStamp();
  const mealId = `MID-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
    // Сохраняем ID и время в текущем JSON (используется при удалении из панели)
    try {
      resJson.mealId = mealId;
      resJson.ts = stamp;
      this.state.currentJson = Object.assign({}, resJson);
      await this.plugin.saveLastSession(this.state);
    } catch {}
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
      '',
      `<button class="ca-delete-meal-btn" data-meal-id="${mealId}">Удалить приём</button>`
    ].filter(Boolean).join('\n');

    // Вставить блок непосредственно ПЕРЕД таблицей
    const idx = text.indexOf(startMarker);
    text = text.slice(0, idx).trimEnd() + '\n\n' + mealBlock + '\n\n' + text.slice(idx);

    // Обновить таблицу: вставить строку в начало (после заголовка)
    const start = text.indexOf(startMarker);
    const end = text.indexOf(endMarker, start);
    if (start !== -1 && end !== -1) {
      const before = text.slice(0, start);
      const tableBlock = text.slice(start, end);
      const after = text.slice(end);
      const lines = tableBlock.split(/\n/);
      // гарантируем пустую строку после маркера
      if (lines[1] !== '') { lines.splice(1, 0, ''); }
      // если нет кнопки обновления — добавить её перед заголовком
      const hasRefresh = lines.some(l => l.includes('ca-refresh-table-btn'));
      const headerIndex = lines.findIndex(l => l.trim() === header);
      if (!hasRefresh && headerIndex !== -1) {
        lines.splice(headerIndex, 0, '<button class="ca-refresh-table-btn">Обновить таблицу</button>', '');
      }
      const hIdx = lines.findIndex(l=> l.trim()===header);
      const sIdx = lines.findIndex(l=> l.trim()===sep);
  const time = stamp.slice(11,16);
  const row = `| ${time} | ${item.replace(/\\|/g,'/')} | ${n(grams)} | ${n(t?.calories)} | ${n(t?.proteins)} | ${n(t?.fats)} | ${n(t?.carbohydrates)} | <!--MEAL_ID:${mealId}-->`;
  // избегаем дублей по MEAL_ID
  const hasIdAlready = lines.some(l => l.includes(`<!--MEAL_ID:${mealId}-->`));
  if (!hasIdAlready && hIdx !== -1 && sIdx !== -1 && (sIdx === hIdx+1 || sIdx === hIdx+2)) {
        // вставим строку сразу после разделителя
        lines.splice(sIdx+1, 0, row);
        text = before + lines.join('\n') + after;
      }
    }

    await vault.modify(file, text);
  }

  recordEntry(resJson) {
    try {
      if (!resJson) return;
      const stamp = nowStamp();
      const date = stamp.slice(0,10);
      // допускаем разные варианты названий
      let per100 = resJson.per_100g || resJson.per100 || resJson.base || {};
      per100 = extractMacros(per100);
      let totals = resJson.portion_totals;
      if (!totals && per100 && resJson.portion_g) {
        const f = (x)=> {
          const n = toNum(x);
            return n==null?null:n*resJson.portion_g/100;
        };
        totals = {
          calories: f(per100.calories),
          proteins: f(per100.proteins),
          fats: f(per100.fats),
          carbohydrates: f(per100.carbohydrates)
        };
      }
      const entry = {
        ts: stamp,
        date,
        mealId: resJson.mealId || null,
        item: (resJson.item || resJson.description || '—').trim(),
        portion_g: resJson.portion_g || resJson.portion || null,
        per_100g: {
          calories: toNum(per100.calories),
          proteins: toNum(per100.proteins),
          fats: toNum(per100.fats),
          carbohydrates: toNum(per100.carbohydrates)
        },
        totals: totals ? {
          calories: toNum(totals.calories),
          proteins: toNum(totals.proteins),
          fats: toNum(totals.fats),
          carbohydrates: toNum(totals.carbohydrates)
        } : null
      };
      if (!this.plugin.data.entries) this.plugin.data.entries = [];
      this.plugin.data.entries.push(entry);
      if (this.plugin.data.entries.length > 2000) this.plugin.data.entries.splice(0, this.plugin.data.entries.length - 2000);
      this.plugin.saveData(this.plugin.data);
    } catch (err) { console.warn('recordEntry failed', err); }
  }

  getDailyTargets() {
    const t = this.plugin.settings.dailyTargets || DEFAULTS.dailyTargets;
    const num = (v)=> (typeof v === 'number' ? v : Number(v)||0);
    return {
      calories: num(t.calories),
      proteins: num(t.proteins),
      fats: num(t.fats),
      carbohydrates: num(t.carbohydrates)
    };
  }

  async updateDailySection(path) {
    await this.updateDailyRunningTotals(path, true);
  }

  // расширено: создаёт/обновляет дневной заголовок, строку итогов и таблицу приёмов, добавляет последнюю запись
  async updateDailyRunningTotals(path, withTable=false) {
    try {
      const { vault } = this.app;
      const file = vault.getAbstractFileByPath(path);
      if (!file) return;
      let text = await vault.read(file);
      const today = nowStamp().slice(0,10);
      const marker = `<!--DAILY_TOTALS:${today}-->`;
      const heading = `## ${today}`;
      const entries = (this.plugin.data.entries || []).filter(e=> e.date === today);

      // создаём дневной блок при необходимости (две таблицы)
      if (!text.includes(heading)) {
  text += `\n\n${heading}\n${marker}\n**Итого сейчас:** — ккал / Б — / Ж — / У —\n\n### База (на 100 г)\n| Время | Блюдо | Ккал/100г | Б/100г | Ж/100г | У/100г | Порц. | Комментарий |\n|-------|-------|----------:|------:|------:|------:|-----:|-------------|\n\n### Итоги (по порции)\n| Время | Блюдо | Порц. | Ккал | Б | Ж | У | Комментарий |\n|-------|-------|-----:|-----:|--:|--:|--:|-------------|\n`;
      }

      // вставляем новую строку в Базу, не трогая вторую
      if (withTable && entries.length) {
        const last = entries[entries.length-1];
        const src = last.per_100g || {};
        const time = last.ts.slice(11,16);
        const portion = last.portion_g != null ? last.portion_g : '—';
        const fmtv = (x)=> (x==null||isNaN(x)?'—':Number(x).toFixed(1).replace(/\.0$/,''));
        const baseRow = `| ${time} | ${last.item.replace(/\\|/g,'/')} | ${fmtv(src.calories)} | ${fmtv(src.proteins)} | ${fmtv(src.fats)} | ${fmtv(src.carbohydrates)} | ${portion} |  |`;
        // найдём границы секции дня
        const start = text.indexOf(heading);
        const next = text.indexOf('\n## ', start+heading.length);
        let section = next === -1 ? text.slice(start) : text.slice(start, next);
        // удалим старую комбинированную таблицу если есть
        section = section.replace(/\|\s*Время\s*\|\s*Блюдо\s*\|\s*Ккал\/100г[\s\S]*?\n\n/g, '');
        // позиция базовой таблицы
  const baseHeader = '| Время | Блюдо | Ккал/100г | Б/100г | Ж/100г | У/100г | Порц. | Комментарий |';
        const baseIdx = section.indexOf(baseHeader);
        if (baseIdx !== -1) {
          let endBase = section.indexOf('\n\n', baseIdx);
          if (endBase === -1) endBase = section.length;
          const basePart = section.slice(baseIdx, endBase).trimEnd();
          if (!basePart.split(/\n/).includes(baseRow)) {
            section = section.slice(0, endBase).trimEnd() + '\n' + baseRow + '\n' + section.slice(endBase);
            text = next === -1 ? text.slice(0,start) + section : text.slice(0,start) + section + text.slice(next);
          }
        }
      }

      // Теперь пересчитываем суммы ПАРСЯ таблицу (учитывает ручные правки)
      const start2 = text.indexOf(heading);
      const next2 = text.indexOf('\n## ', start2+heading.length);
      let section2 = next2 === -1 ? text.slice(start2) : text.slice(start2, next2);
      // Пересборка таблицы Итоги из таблицы База, затем подсчёт сумм
      const fmtCell = (x)=> (x==null||isNaN(x)?'—':Number(x).toFixed(1).replace(/\.0$/,''));
      // вырежем секцию заново
      const sStart = text.indexOf(heading);
      const sNext = text.indexOf('\n## ', sStart+heading.length);
      let s = sNext === -1 ? text.slice(sStart) : text.slice(sStart, sNext);
      // удалим старую комбинированную таблицу если встретится
      s = s.replace(/\|\s*Время\s*\|\s*Блюдо\s*\|\s*Ккал\/100г[\s\S]*?\n\n/g, '');
      // распарсим базовую таблицу
  const baseHeader = '| Время | Блюдо | Ккал/100г | Б/100г | Ж/100г | У/100г | Порц. | Комментарий |';
      const baseIdx = s.indexOf(baseHeader);
      let baseRows = [];
      if (baseIdx !== -1) {
        let baseEnd = s.indexOf('\n\n', baseIdx);
        if (baseEnd === -1) baseEnd = s.length;
        const basePart = s.slice(baseIdx, baseEnd);
        // парсим строки базовой таблицы
        const lines = basePart.split(/\n/).slice(2); // пропустить заголовок и разделитель
        for (const line of lines) {
          if (!line.startsWith('|')) continue;
          const cols = line.split('|').map(c=>c.trim());
          if (cols.length < 9) continue;
          const [ , time, item, kcal100, prot100, fat100, carb100, portion, comment ] = [''].concat(cols); // align indexes
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
      // построим итоги
  const portionHeader = '| Время | Блюдо | Порц. | Ккал | Б | Ж | У | Комментарий |';
  const portionSep = '|-------|-------|-----:|-----:|--:|--:|--:|-------------|';
      const portionRows = baseRows.map(r => {
        const calcK = (r.kcal100!=null && r.portion!=null)? r.kcal100 * r.portion /100 : null;
        const calcP = (r.prot100!=null && r.portion!=null)? r.prot100 * r.portion /100 : null;
        const calcF = (r.fat100!=null && r.portion!=null)? r.fat100 * r.portion /100 : null;
        const calcC = (r.carb100!=null && r.portion!=null)? r.carb100 * r.portion /100 : null;
        return `| ${r.time} | ${r.item} | ${fmtCell(r.portion)} | ${fmtCell(calcK)} | ${fmtCell(calcP)} | ${fmtCell(calcF)} | ${fmtCell(calcC)} | ${r.comment} |`;
      });
      // заменим/создадим таблицу Итоги
      const portionHeaderPos = s.indexOf(portionHeader);
      if (portionHeaderPos !== -1) {
        const afterHeader = s.indexOf('\n', portionHeaderPos + portionHeader.length) + 1;
        const afterSep = s.indexOf('\n', afterHeader) + 1;
        let portionEnd = s.indexOf('\n\n', afterSep);
        if (portionEnd === -1) portionEnd = s.length;
        const rebuilt = portionHeader + '\n' + portionSep + '\n' + portionRows.join('\n') + '\n';
        s = s.slice(0, portionHeaderPos) + rebuilt + s.slice(portionEnd);
      } else {
        s += `\n${portionHeader}\n${portionSep}\n${portionRows.join('\n')}\n`;
      }
      // подсчёт сумм по rebuilt rows
      const sums = baseRows.reduce((acc, r) => {
        const k = (r.kcal100!=null && r.portion!=null)? r.kcal100 * r.portion /100 : null;
        const p = (r.prot100!=null && r.portion!=null)? r.prot100 * r.portion /100 : null;
        const f = (r.fat100!=null && r.portion!=null)? r.fat100 * r.portion /100 : null;
        const c = (r.carb100!=null && r.portion!=null)? r.carb100 * r.portion /100 : null;
        if (k!=null) acc.calories += k; if (p!=null) acc.proteins += p; if (f!=null) acc.fats += f; if (c!=null) acc.carbohydrates += c; return acc;
      }, { calories:0, proteins:0, fats:0, carbohydrates:0 });
      const fmt = (n)=> (n==null||isNaN(n)?'—':Math.round(n));
      const targets = this.getDailyTargets();
      const pct = (val,t)=> t>0? Math.round(val/t*100): null;
      const pctStr = (p)=> p==null?'' : `${p}%`;
      const totalLine = `${marker}\n**Итого сейчас:** ${fmt(sums.calories)} ккал / Б ${fmt(sums.proteins)} / Ж ${fmt(sums.fats)} / У ${fmt(sums.carbohydrates)}` +
        (targets.calories||targets.proteins||targets.fats||targets.carbohydrates
          ? ` (К ${pctStr(pct(sums.calories,targets.calories))} / Б ${pctStr(pct(sums.proteins,targets.proteins))} / Ж ${pctStr(pct(sums.fats,targets.fats))} / У ${pctStr(pct(sums.carbohydrates,targets.carbohydrates))})` : '' );

  // удалим/вставим Total line
  const pairRe = new RegExp(`${marker}\\n\\*\\*Итого сейчас:[^\\n]*\\n?`,'g');
  s = s.replace(pairRe, '');
  s = s.replace(heading, heading+'\n'+totalLine);
  text = sNext === -1 ? text.slice(0,sStart) + s : text.slice(0,sStart) + s + text.slice(sNext);

      // сохранить если изменилось
      const original = await vault.read(file);
      if (original !== text) await vault.modify(file, text);
    } catch (err) {
      console.warn('updateDailyRunningTotals failed', err);
    }
  }

  async callWorker(payload) {
    const url = this.plugin.settings.workerUrl || DEFAULTS.workerUrl;
    return callWorker(url, payload);
  }

  /** ---------- Vault helpers ---------- */
  async ensureFolder(path) {
    const { vault } = this.app;
    const adapter = vault.adapter;
    const lastSlash = path.lastIndexOf("/");
    if (lastSlash === -1) return; // root
    const folder = path.slice(0, lastSlash);
    if (!(await adapter.exists(folder))) {
      await adapter.mkdir(folder);
    }
  }

  async appendToNote(path, content) {
    const { vault } = this.app;
    await this.ensureFolder(path);
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

  async savePhotoToVault(file) {
    try {
      const folder = this.plugin.settings.photosFolder || DEFAULTS.photosFolder;
      await this.ensureFolder(folder + "/a"); // чтобы точно создалась
      const ext = (file.name?.split(".").pop() || "jpg").toLowerCase();
      const name = `food_${Date.now()}.${ext}`;
      const arr = new Uint8Array(await file.arrayBuffer());
      await this.app.vault.createBinary(`${folder}/${name}`, arr);
  this.state.history.push({ role: "assistant", text: `Фото сохранено: ${folder}/${name}` });
      this.plugin.saveLastSession(this.state);
    } catch (e) {
      console.warn("Не удалось сохранить фото:", e);
    }
  }
}

/** ---------- Settings Tab ---------- */
class CalorieSettingsTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Calorie Assistant — настройки" });

    new Setting(containerEl)
      .setName("Worker URL")
      .setDesc("Адрес Cloudflare Worker (POST).")
      .addText(t => t
        .setPlaceholder(DEFAULTS.workerUrl)
        .setValue(this.plugin.settings.workerUrl || DEFAULTS.workerUrl)
        .onChange(async (v) => { this.plugin.settings.workerUrl = v.trim(); await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName("Заметка по умолчанию")
      .setDesc("Куда писать отчёт (можно с путём). Пример: Food Log.md или Logs/Food.md")
      .addText(t => t
        .setPlaceholder(DEFAULTS.notePath)
        .setValue(this.plugin.settings.notePath || DEFAULTS.notePath)
        .onChange(async (v) => { this.plugin.settings.notePath = v.trim(); await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName("Режим добавления")
      .setDesc("Если включено — отчёты дописываются в конец заметки.")
      .addToggle(t => t
        .setValue(this.plugin.settings.appendMode ?? DEFAULTS.appendMode)
        .onChange(async (v) => { this.plugin.settings.appendMode = v; await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName("Сохранять фото в хранилище")
      .addToggle(t => t
        .setValue(this.plugin.settings.attachPhoto ?? DEFAULTS.attachPhoto)
        .onChange(async (v) => { this.plugin.settings.attachPhoto = v; await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName("На мобильном открывать камеру по умолчанию")
      .setDesc("Если выключено — будет открываться галерея для выбора уже сделанных фото.")
      .addToggle(t => t
        .setValue(this.plugin.settings.cameraDefault ?? DEFAULTS.cameraDefault)
        .onChange(async (v) => { this.plugin.settings.cameraDefault = v; await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName("Папка для фото")
      .setDesc("Будет создана при необходимости.")
      .addText(t => t
        .setPlaceholder(DEFAULTS.photosFolder)
        .setValue(this.plugin.settings.photosFolder || DEFAULTS.photosFolder)
        .onChange(async (v) => { this.plugin.settings.photosFolder = v.trim(); await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName("Порция по умолчанию (г)")
      .addText(t => t
        .setPlaceholder(String(DEFAULTS.defaultPortion))
        .setValue(String(this.plugin.settings.defaultPortion ?? DEFAULTS.defaultPortion))
        .onChange(async (v) => { this.plugin.settings.defaultPortion = Number(v) || 0; await this.plugin.saveSettings(); }));

    containerEl.createEl('h3', { text: 'Дневные цели (для процентов в итогах)' });
    const targets = (this.plugin.settings.dailyTargets = Object.assign({}, DEFAULTS.dailyTargets, this.plugin.settings.dailyTargets||{}));

    const nutrientInput = (label, key) => {
      new Setting(containerEl)
        .setName(label)
        .addText(t => t
          .setPlaceholder('0')
          .setValue(String(targets[key]||0))
          .onChange(async (v)=> { targets[key] = Number(v)||0; this.plugin.settings.dailyTargets = targets; await this.plugin.saveSettings(); }));
    };
    nutrientInput('Калории (ккал)', 'calories');
    nutrientInput('Белки (г)', 'proteins');
    nutrientInput('Жиры (г)', 'fats');
    nutrientInput('Углеводы (г)', 'carbohydrates');
    const hint = containerEl.createEl('div', { text: 'Оставь 0, если не хочешь показывать процент по какому-то показателю.' });
    hint.style.fontSize = '12px';
    hint.style.opacity = '0.7';

    containerEl.createEl('h3', { text: 'Чат' });
    new Setting(containerEl)
      .setName('Максимум сообщений в истории')
      .setDesc('Старые сообщения будут удаляться из панели')
      .addText(t => t
        .setPlaceholder(String(DEFAULTS.chatHistoryLimit))
        .setValue(String(this.plugin.settings.chatHistoryLimit ?? DEFAULTS.chatHistoryLimit))
        .onChange(async v => { this.plugin.settings.chatHistoryLimit = Math.max(5, Number(v)||DEFAULTS.chatHistoryLimit); await this.plugin.saveSettings(); }));
    new Setting(containerEl)
      .setName('Очищать карточку после экспорта')
      .addToggle(t => t
        .setValue(this.plugin.settings.autoClearOnFinalize ?? DEFAULTS.autoClearOnFinalize)
        .onChange(async v => { this.plugin.settings.autoClearOnFinalize = v; await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName('Экспорт в текущую заметку (active file)')
      .setDesc('Если включено — новый приём пищи добавляется в открытую заметку, а в конце заметки ведётся таблица-итог.')
      .addToggle(t => t
        .setValue(this.plugin.settings.exportToActiveNote ?? DEFAULTS.exportToActiveNote)
        .onChange(async v => { this.plugin.settings.exportToActiveNote = v; await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName('Сворачивать панель кнопок при открытии')
      .addToggle(t => t
        .setValue(this.plugin.settings.controlsCollapsed ?? DEFAULTS.controlsCollapsed)
        .onChange(async v => { this.plugin.settings.controlsCollapsed = v; await this.plugin.saveSettings(); }));
  }
}

/** ---------- Plugin ---------- */
module.exports = class CalorieAssistantPlugin extends Plugin {
  async onload() {
    // styles are loaded from styles.css automatically by Obsidian

  // читаем базу
  this.data = (await this.loadData()) || {};
  await this.runMigrations();
    // настройки
    this.settings = Object.assign({}, DEFAULTS, this.data.settings || {});
    if (!this.settings.workerUrl) this.settings.workerUrl = DEFAULTS.workerUrl;

    this.registerView(VIEW_TYPE, (leaf) => new CalorieView(leaf, this));

    this.addCommand({
      id: "open-view",
      name: "Open Calorie Assistant",
      callback: () => this.activateView()
    });

    this.addCommand({
      id: 'cleanup-empty-entries',
      name: 'Calorie Assistant: Очистить пустые старые записи',
      callback: () => {
        const removed = this.cleanupEmptyEntries();
        new Notice(`Удалено пустых записей: ${removed}`);
      }
    });

    this.addRibbonIcon("dice", "Calorie Assistant", () => this.activateView());

    this.addSettingTab(new CalorieSettingsTab(this.app, this));

    // Авто пересчёт при ручном редактировании файла
    this._ignoreModify = false;
  this.registerEvent(this.app.vault.on('modify', async (file) => {
      try {
        if (this._ignoreModify) return;
        const targetPath = this.settings.notePath || DEFAULTS.notePath;
        if (file.path !== targetPath) return;
        const content = await this.app.vault.read(file);
        const today = nowStamp().slice(0,10);
        if (!content.includes(`## ${today}`)) return; // нет секции сегодня — ничего
        // Используем ту же логику что и в view, но без вставки строк: просто пересчёт
  const heading = `## ${today}`;
  const marker = `<!--DAILY_TOTALS:${today}-->`;
        const start = content.indexOf(heading);
        const next = content.indexOf('\n## ', start+heading.length);
        let section = next === -1 ? content.slice(start) : content.slice(start, next);
        // Пересборка таблицы Итоги из Базы при ручном редактировании
  // heading и marker уже определены выше
        // удалим старую комбинированную таблицу
        section = section.replace(/\|\s*Время\s*\|\s*Блюдо\s*\|\s*Ккал\/100г[\s\S]*?\n\n/g, '');
        // Распарсим базу
        const baseHeader = '| Время | Блюдо | Ккал/100г | Б/100г | Ж/100г | У/100г | Порция г | Комментарий |';
        const baseIdx = section.indexOf(baseHeader);
        let baseRows = [];
        if (baseIdx !== -1) {
          let baseEnd = section.indexOf('\n\n', baseIdx); if (baseEnd === -1) baseEnd = section.length;
          const basePart = section.slice(baseIdx, baseEnd);
          const lines = basePart.split(/\n/).slice(2);
          for (const line of lines) {
            if (!line.startsWith('|')) continue;
            const cols = line.split('|').map(c=>c.trim()); if (cols.length < 9) continue;
            baseRows.push({
              time: cols[1], item: cols[2], kcal100: toNum(cols[3]), prot100: toNum(cols[4]), fat100: toNum(cols[5]), carb100: toNum(cols[6]), portion: toNum(cols[7]), comment: cols[8]||''
            });
          }
        }
        const fmtCell = (x)=> (x==null||isNaN(x)?'—':Number(x).toFixed(1).replace(/\.0$/,''));
        const portionHeader = '| Время | Блюдо | Порция г | Ккал | Б | Ж | У | Комментарий |';
        const portionSep = '|-------|-------|---------:|-----:|--:|--:|--:|-------------|';
        const portionRows = baseRows.map(r => {
          const k = (r.kcal100!=null && r.portion!=null)? r.kcal100*r.portion/100 : null;
          const p = (r.prot100!=null && r.portion!=null)? r.prot100*r.portion/100 : null;
          const f = (r.fat100!=null && r.portion!=null)? r.fat100*r.portion/100 : null;
          const c = (r.carb100!=null && r.portion!=null)? r.carb100*r.portion/100 : null;
          return `| ${r.time} | ${r.item} | ${fmtCell(r.portion)} | ${fmtCell(k)} | ${fmtCell(p)} | ${fmtCell(f)} | ${fmtCell(c)} | ${r.comment} |`;
        });
        const headerPos = section.indexOf(portionHeader);
        if (headerPos !== -1) {
          const afterHeader = section.indexOf('\n', headerPos + portionHeader.length) + 1;
          const afterSep = section.indexOf('\n', afterHeader) + 1;
          let portionEnd = section.indexOf('\n\n', afterSep); if (portionEnd === -1) portionEnd = section.length;
          section = section.slice(0, headerPos) + portionHeader + '\n' + portionSep + '\n' + portionRows.join('\n') + '\n' + section.slice(portionEnd);
        }
        const sums = baseRows.reduce((acc,r)=>{
          const k=(r.kcal100!=null && r.portion!=null)? r.kcal100*r.portion/100:null; if (k!=null) acc.calories+=k;
          const p=(r.prot100!=null && r.portion!=null)? r.prot100*r.portion/100:null; if (p!=null) acc.proteins+=p;
          const f=(r.fat100!=null && r.portion!=null)? r.fat100*r.portion/100:null; if (f!=null) acc.fats+=f;
          const c=(r.carb100!=null && r.portion!=null)? r.carb100*r.portion/100:null; if (c!=null) acc.carbohydrates+=c;
          return acc; }, {calories:0,proteins:0,fats:0,carbohydrates:0});
        const fmt = (n)=> (n==null||isNaN(n)?'—':Math.round(n));
        const targets = this.settings.dailyTargets || DEFAULTS.dailyTargets;
        const pct = (val,t)=> t>0? Math.round(val/t*100): null;
        const pctStr = (p)=> p==null?'' : `${p}%`;
        const totalLine = `${marker}\n**Итого сейчас:** ${fmt(sums.calories)} ккал / Б ${fmt(sums.proteins)} / Ж ${fmt(sums.fats)} / У ${fmt(sums.carbohydrates)}` +
          (targets.calories||targets.proteins||targets.fats||targets.carbohydrates
            ? ` (К ${pctStr(pct(sums.calories,targets.calories))} / Б ${pctStr(pct(sums.proteins,targets.proteins))} / Ж ${pctStr(pct(sums.fats,targets.fats))} / У ${pctStr(pct(sums.carbohydrates,targets.carbohydrates))})` : '' );
  const pairRe = new RegExp(`${marker}\\n\\*\\*Итого сейчас:[^\\n]*\\n?`,'g');
  section = section.replace(pairRe, '');
  section = section.replace(heading, heading+'\n'+totalLine);
        const newContent = next === -1 ? content.slice(0,start) + section : content.slice(0,start) + section + content.slice(next);
        if (newContent !== content) {
          this._ignoreModify = true;
          await this.app.vault.modify(file, newContent);
          this._ignoreModify = false;
        }
      } catch (e) { console.warn('auto daily recalc failed', e); }
    }));

    // Синхронизация таблицы приёмов с удалением блоков (MEAL_ID)
    this.registerEvent(this.app.vault.on('modify', async (file) => {
      try {
        if (this._ignoreModify) return;
        const content = await this.app.vault.read(file);
        const startMarker = '<!--MEALS_TABLE_START-->';
        const endMarker = '<!--MEALS_TABLE_END-->';
        const s = content.indexOf(startMarker);
        const e = s === -1 ? -1 : content.indexOf(endMarker, s);
        if (s === -1 || e === -1) return; // нет таблицы — выходим

  const tableBlock = content.slice(s, e);
  // MEAL_ID из таблицы
  const tableIds = new Set(Array.from(tableBlock.matchAll(/<!--MEAL_ID:([A-Za-z0-9_-]+)-->/g)).map(m=>m[1]));
  // Разбиваем контент на части: блоки приёмов вверху (before) и хвост (after)
  let before = content.slice(0, s);
  const after = content.slice(e);
  // MEAL_ID только из части before (где лежат блоки приёмов)
  const blockIds = new Set(Array.from(before.matchAll(/<!--MEAL_ID:([A-Za-z0-9_-]+)-->/g)).map(m=>m[1]));

        const stale = [...tableIds].filter(id => !blockIds.has(id));
        const orphanBlocks = [...blockIds].filter(id => !tableIds.has(id));

  let newTable = tableBlock;
  let newBefore = before;
  let changed = false;

        // Удаляем строки из таблицы, для которых нет блоков
        if (stale.length) {
          for (const id of stale) {
            const re = new RegExp(`^.*<!--MEAL_ID:${id}-->.*$`, 'm');
            const before = newTable;
            newTable = newTable.replace(re, '');
            if (newTable !== before) changed = true;
          }
          newTable = newTable.replace(/\n{3,}/g, '\n\n');
        }

        // Удаляем блоки приёмов, для которых нет строк в таблице (обратная синхронизация)
        if (orphanBlocks.length) {
          for (const id of orphanBlocks) {
            const blockRe = new RegExp(`\n---\n#### Приём пищи[\s\S]*?<!--MEAL_ID:${id}-->[\s\S]*?(?=\n---|$)`, 'g');
            const prev = newBefore;
            newBefore = newBefore.replace(blockRe, '');
            if (newBefore !== prev) changed = true;
          }
          newBefore = newBefore.replace(/\n{3,}/g, '\n\n');
        }

        if (!changed) return;
  const newContent = newBefore + newTable + after;
        if (newContent !== content) {
          this._ignoreModify = true;
          await this.app.vault.modify(file, newContent);
          this._ignoreModify = false;
        }
      } catch (err) {
        console.warn('sync meals table failed', err);
      }
    }));

    // Глобальный обработчик кликов по кнопке "Обновить таблицу"
    const clickHandler = async (evt) => {
      const el = evt.target;
      if (!(el instanceof HTMLElement)) return;
      try {
        const activeFile = this.app.workspace.getActiveFile?.();
        if (!activeFile) return;
        // refresh table
        if (el.classList.contains('ca-refresh-table-btn')) {
          await this.rebuildMealsTable(activeFile.path);
          new Notice('Таблица обновлена');
          return;
        }
        // delete meal inside note
        if (el.classList.contains('ca-delete-meal-btn')) {
          const mealId = el.getAttribute('data-meal-id');
          await this.deleteMealByIdFromNote(activeFile.path, mealId);
          await this.rebuildMealsTable(activeFile.path);
          new Notice('Приём удалён');
          return;
        }
      } catch (err) {
        console.warn('note click handler failed', err);
        new Notice('Ошибка операции');
      }
    };
    document.addEventListener('click', clickHandler, true);
    this.register(() => document.removeEventListener('click', clickHandler, true));
  }

  onunload() {}

  getLastSession() {
    return this.data.lastSession || null;
  }

  // Перестраивает блок таблицы между MEALS_TABLE_START/END, собирая строки из всех блоков приёмов выше
  async rebuildMealsTable(path) {
    const { vault } = this.app;
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

    // Соберём все блоки приёмов выше таблицы
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
    const table = `${startMarker}\n\n<button class="ca-refresh-table-btn">Обновить таблицу</button>\n\n${header}\n${sep}\n${rows.join('\n')}\n${endMarker}`;
    text = text.slice(0, s) + table + text.slice(e + endMarker.length);
    await vault.modify(file, text);
  }

  async saveLastSession(state) {
    this.data.lastSession = state;
    await this.saveData(this.data);
  }

  async saveSettings() {
    this.data.settings = this.settings;
    await this.saveData(this.data);
  }

  async activateView() {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    if (leaves.length > 0) {
      this.app.workspace.revealLeaf(leaves[0]);
      return;
    }
    const rightLeaf = this.app.workspace.getRightLeaf(false);
    await rightLeaf.setViewState({ type: VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(rightLeaf);
  }
  runMigrations = async () => {
    if (!this.data.migrations) this.data.migrations = {};
    if (!this.data.entries) return; // nothing
    if (!this.data.migrations.cleanedNullEntriesV1) {
      const before = this.data.entries.length;
      this.data.entries = this.data.entries.filter(e => {
        const src = (e.totals || e.per_100g || {});
        return Object.values(src).some(v => toNum(v) != null);
      });
      const after = this.data.entries.length;
      this.data.migrations.cleanedNullEntriesV1 = true;
      await this.saveData(this.data);
      if (before !== after) console.log('[CalorieAssistant] migration cleaned', before-after, 'empty entries');
    }
  }

  cleanupEmptyEntries() {
    if (!this.data.entries) return 0;
    const before = this.data.entries.length;
    this.data.entries = this.data.entries.filter(e => {
      const src = (e.totals || e.per_100g || {});
      return Object.values(src).some(v => toNum(v) != null);
    });
    const removed = before - this.data.entries.length;
    this.saveData(this.data);
    return removed;
  }

  // Удаление блока приёма и строки таблицы по MEAL_ID
  async deleteMealByIdFromNote(path, mealId) {
    if (!mealId) return;
    try {
      const { vault } = this.app;
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
};

// Вспомогательная функция: удалить из Markdown весь блок Приёма, окружающий данный MEAL_ID
// Ищет ближайший разделитель \n--- перед заголовком "#### Приём пищи" и следующий \n--- или конец файла
function removeMealBlockById(text, mealId) {
  try {
    const token = `<!--MEAL_ID:${mealId}-->`;
    const idIdx = text.indexOf(token);
    if (idIdx === -1) return { text, removed: false };

    // 1) Точно определяем начало блока: последнее вхождение шаблона начала блока приёма до токена
    // Шаблон: (начало строки или \n)---\n#### Приём пищи ...
    const starts = [];
    const startRe = /(^|\n)---\r?\n#### Приём пищи[^\n]*\n/g;
    let m;
    while ((m = startRe.exec(text)) !== null) {
      const start = m.index + (m[1] ? m[1].length : 0); // позиция непосредственно перед '---'
      if (start < idIdx) starts.push(start);
      else break; // дальше только после токена, можно остановиться
    }
    let startIdx = starts.length ? starts[starts.length - 1] : -1;

    if (startIdx === -1) {
      // Fallback: найдём ближайший заголовок #### Приём пищи перед токеном, затем подняться к предыдущей пустой строке или началу файла
      const headerRe = /(^|\n)#### Приём пищи[^\n]*\n/g;
      let headerIdx = -1;
      while ((m = headerRe.exec(text)) !== null) {
        if (m.index < idIdx) headerIdx = m.index + (m[1] ? m[1].length : 0); else break;
      }
      if (headerIdx !== -1) {
        // Поднимемся до ближайшего разделителя блока '---' перед заголовком, если есть, иначе начала файла/пустой строки
        const uptoHeader = text.slice(0, headerIdx);
        const dashIdx = uptoHeader.lastIndexOf('\n---\r?\n');
        startIdx = dashIdx !== -1 ? dashIdx + 1 : headerIdx; // +1 чтобы включить начальный перевод строки
      } else {
        // Не нашли ничего осмысленного — не рискуем
        return { text, removed: false };
      }
    }

    // 2) Конец блока — следующее начало блока приёма или граница таблицы, иначе конец файла
    let endIdx = text.length;
    startRe.lastIndex = startIdx + 1; // продолжим поиск стартов после текущего начала
    while ((m = startRe.exec(text)) !== null) {
      const s = m.index + (m[1] ? m[1].length : 0);
      if (s > idIdx) { endIdx = s; break; }
    }
    // Не заходим на таблицу приёмов
    const tableMarker = '<!--MEALS_TABLE_START-->';
    const tableStartIdx = text.indexOf(tableMarker, idIdx);
    if (tableStartIdx !== -1 && tableStartIdx < endIdx) {
      endIdx = tableStartIdx;
    }

    // Вырезать блок и почистить лишние пустые строки
    let newText = text.slice(0, startIdx) + text.slice(endIdx);
    newText = newText.replace(/\n{3,}/g, '\n\n').replace(/^\s+$/gm, '');
    return { text: newText, removed: true };
  } catch {
    return { text, removed: false };
  }
}
