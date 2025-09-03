const { PluginSettingTab, Setting } = require('obsidian');
const { DEFAULTS } = require('../consts');

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

module.exports = { CalorieSettingsTab };

