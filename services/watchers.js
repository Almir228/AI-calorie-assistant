const { DEFAULTS } = require('../consts');
const { toNum } = require('../utils/macros');
const note = require('./note');

function registerVaultModifyWatchers(plugin) {
  plugin._ignoreModify = false;
  plugin.registerEvent(plugin.app.vault.on('modify', async (file) => {
    try {
      if (plugin._ignoreModify) return;
      const targetPath = plugin.settings.notePath || DEFAULTS.notePath;
      if (file.path !== targetPath) return;
      const content = await plugin.app.vault.read(file);
      const today = new Date().toLocaleString('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).slice(0,10);
      if (!content.includes(`## ${today}`)) return;
      // lightweight recompute is encapsulated in note.updateDailyRunningTotals
      await note.updateDailyRunningTotals(plugin, targetPath, true);
    } catch (e) { console.warn('auto daily recalc failed', e); }
  }));

  plugin.registerEvent(plugin.app.vault.on('modify', async (file) => {
    try {
      if (plugin._ignoreModify) return;
      const content = await plugin.app.vault.read(file);
      const startMarker = '<!--MEALS_TABLE_START-->';
      const endMarker = '<!--MEALS_TABLE_END-->';
      const s = content.indexOf(startMarker);
      const e = s === -1 ? -1 : content.indexOf(endMarker, s);
      if (s === -1 || e === -1) return;

      const tableBlock = content.slice(s, e);
      const tableIds = new Set(Array.from(tableBlock.matchAll(/<!--MEAL_ID:([A-Za-z0-9_-]+)-->/g)).map(m=>m[1]));
      let before = content.slice(0, s);
      const after = content.slice(e);
      const blockIds = new Set(Array.from(before.matchAll(/<!--MEAL_ID:([A-Za-z0-9_-]+)-->/g)).map(m=>m[1]));

      const stale = [...tableIds].filter(id => !blockIds.has(id));
      const orphanBlocks = [...blockIds].filter(id => !tableIds.has(id));

      let newTable = tableBlock;
      let newBefore = before;
      let changed = false;

      if (stale.length) {
        for (const id of stale) {
          const re = new RegExp(`^.*<!--MEAL_ID:${id}-->.*$`, 'm');
          const prev = newTable;
          newTable = newTable.replace(re, '');
          if (newTable !== prev) changed = true;
        }
        newTable = newTable.replace(/\n{3,}/g, '\n\n');
      }

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
        plugin._ignoreModify = true;
        await plugin.app.vault.modify(file, newContent);
        plugin._ignoreModify = false;
      }
    } catch (err) {
      console.warn('sync meals table failed', err);
    }
  }));
}

function registerNoteClickHandlers(plugin) {
  const handler = async (evt) => {
    const el = evt.target;
    if (!(el instanceof HTMLElement)) return;
    try {
      const activeFile = plugin.app.workspace.getActiveFile?.();
      if (!activeFile) return;
      if (el.classList.contains('ca-refresh-table-btn')) {
        await note.rebuildMealsTable(plugin, activeFile.path);
        new plugin.app.Notice('Таблица обновлена');
        return;
      }
      if (el.classList.contains('ca-delete-meal-btn')) {
        const mealId = el.getAttribute('data-meal-id');
        await note.deleteMealByIdFromNote(plugin, activeFile.path, mealId);
        await note.rebuildMealsTable(plugin, activeFile.path);
        new plugin.app.Notice('Приём удалён');
        return;
      }
    } catch (err) {
      console.warn('note click handler failed', err);
      new plugin.app.Notice('Ошибка операции');
    }
  };
  document.addEventListener('click', handler, true);
  plugin.register(() => document.removeEventListener('click', handler, true));
}

module.exports = { registerVaultModifyWatchers, registerNoteClickHandlers };

