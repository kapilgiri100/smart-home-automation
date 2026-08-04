// ============================================================
// Alarm Sound Manager
// Manages built-in synthesized sounds + user-uploaded custom
// sounds (stored as data URLs in localStorage). Provides helper
// functions to add, remove, select, and preview sounds.
// ============================================================

const STORAGE_KEY_CUSTOM = "alarmSounds.custom";
const STORAGE_KEY_SETTINGS = "alarmSounds.settings";

// Built-in synthesized sounds (no audio files needed)
export const BUILT_IN_SOUNDS = [
  {
    id: "builtin-fire",
    name: "Fire Siren (Default)",
    type: "synthesized",
    kind: "fire"
  },
  {
    id: "builtin-gas",
    name: "Gas Beep (Default)",
    type: "synthesized",
    kind: "gas"
  }
];

// Load custom sounds from localStorage
export const loadCustomSounds = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CUSTOM);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn("Failed to load custom sounds:", e);
    return [];
  }
};

// Persist custom sounds to localStorage
const saveCustomSounds = sounds => {
  try {
    localStorage.setItem(STORAGE_KEY_CUSTOM, JSON.stringify(sounds));
  } catch (e) {
    console.warn("Failed to save custom sounds (may exceed storage limit):", e);
  }
};

// Load the selected sound settings (fireSoundId, gasSoundId)
export const loadSettings = () => {
  const defaults = {
    fireSoundId: "builtin-fire",
    gasSoundId: "builtin-gas"
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SETTINGS);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    return { ...defaults, ...parsed };
  } catch (e) {
    console.warn("Failed to load sound settings:", e);
    return defaults;
  }
};

// Persist settings
const saveSettings = settings => {
  try {
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
  } catch (e) {
    console.warn("Failed to save sound settings:", e);
  }
};

// Get all available sounds (built-in + custom)
export const getAllSounds = () => {
  return [...BUILT_IN_SOUNDS, ...loadCustomSounds()];
};

// Find a sound by id
export const findSoundById = id => {
  return getAllSounds().find(s => s.id === id) || null;
};

// Add a custom sound from an uploaded File. Returns a Promise.
export const addCustomSound = file => {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error("No file provided."));
      return;
    }
    const allowed = ["audio/mpeg", "audio/wav", "audio/x-wav", "audio/ogg", "audio/mp4", "audio/mp3"];
    if (!allowed.includes(file.type)) {
      reject(new Error("Unsupported audio format. Please use mp3, wav, or ogg."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const sound = {
        id: `custom-${Date.now()}`,
        name: file.name.replace(/\.[^/.]+$/, "") || "Custom Sound",
        type: "custom",
        data: dataUrl,
        mimeType: file.type
      };
      const current = loadCustomSounds();
      current.push(sound);
      saveCustomSounds(current);
      resolve(sound);
    };
    reader.onerror = () => {
      reject(new Error("Failed to read the audio file."));
    };
    reader.readAsDataURL(file);
  });
};

// Remove a custom sound by id
export const removeCustomSound = id => {
  const current = loadCustomSounds();
  const next = current.filter(s => s.id !== id);
  saveCustomSounds(next);
  // If the removed sound was selected, reset to default
  const settings = loadSettings();
  let changed = false;
  if (settings.fireSoundId === id) {
    settings.fireSoundId = "builtin-fire";
    changed = true;
  }
  if (settings.gasSoundId === id) {
    settings.gasSoundId = "builtin-gas";
    changed = true;
  }
  if (changed) saveSettings(settings);
};

// Set the fire selected sound id
export const setFireSound = id => {
  const settings = loadSettings();
  settings.fireSoundId = id;
  saveSettings(settings);
};

// Set the gas selected sound id
export const setGasSound = id => {
  const settings = loadSettings();
  settings.gasSoundId = id;
  saveSettings(settings);
};
