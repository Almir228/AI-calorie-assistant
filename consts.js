module.exports = {
  VIEW_TYPE: 'calorie-assistant-view',
  DEFAULTS: {
    workerUrl: 'https://holy-sky-7222.almirmunasipov5.workers.dev',
    notePath: 'Food Log.md',
    appendMode: true,
    attachPhoto: true,
    photosFolder: 'Food Photos',
    cameraDefault: false,
    defaultPortion: 0,
    dailyTargets: { calories: 0, proteins: 0, fats: 0, carbohydrates: 0 },
    chatHistoryLimit: 30,
    autoClearOnFinalize: true,
    controlsCollapsed: false,
    fileSectionCollapsed: false,
    exportToActiveNote: true
  }
};
