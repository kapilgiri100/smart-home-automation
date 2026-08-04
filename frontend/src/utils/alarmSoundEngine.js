// ============================================================
// Shared Alarm Sound Engine
// Extract of the Web Audio based alarm sound engine + custom
// audio file support. Handles both synthesized tones and
// user-uploaded custom sounds. Also manages a global mute state.
// ============================================================

import { findSoundById, loadSettings } from "./alarmSounds.js";

const MUTE_KEY = "alarmSounds.muted";

export const loadMuteState = () => {
  try {
    return localStorage.getItem(MUTE_KEY) === "true";
  } catch (e) {
    return false;
  }
};

export const saveMuteState = muted => {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "true" : "false");
  } catch (e) {
    console.warn("Failed to save mute state:", e);
  }
};

export class AlarmSoundEngine {
  ctx = null;
  intervalId = null;
  isMuted = false;
  audioEl = null;
  constructor() {
    this.isMuted = loadMuteState();
  }
  initCtx() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        try {
          this.ctx = new AudioContextClass();
        } catch (e) {
          console.warn("Failed to initialize AudioContext", e);
        }
      }
    }
  }
  unlock() {
    if (this.ctx && this.ctx.state === "running") {
      return;
    }
    if (this.ctx) {
      try {
        this.ctx.close().catch(() => { });
      } catch (e) { }
      this.ctx = null;
    }
    this.initCtx();
    if (!this.ctx) return;
    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch(err => {
        console.warn("Failed to resume AudioContext during unlock:", err);
      });
    }
    try {
      const osc = this.ctx.createOscillator();
      const gainNode = this.ctx.createGain();
      gainNode.gain.setValueAtTime(0.0001, this.ctx.currentTime);
      osc.connect(gainNode);
      gainNode.connect(this.ctx.destination);
      osc.start(0);
      osc.stop(0.01);
    } catch (e) {
      console.warn("Failed to play silent beep for unlock:", e);
    }
  }
  isLocked() {
    return !this.ctx || this.ctx.state === "suspended";
  }
  setMute(mute) {
    this.isMuted = mute;
    saveMuteState(mute);
    if (mute) {
      this.stop();
    }
  }
  start(type) {
    this.stop();
    if (this.isMuted) return;

    // Check if a custom sound is selected for this alert type
    const settings = loadSettings();
    const soundId = type === "fire" ? settings.fireSoundId : settings.gasSoundId;
    const sound = findSoundById(soundId);
    if (sound && sound.type === "custom" && sound.data) {
      try {
        const audioEl = new Audio(sound.data);
        audioEl.loop = true;
        audioEl.volume = 1.0;
        audioEl.play().catch(err => {
          console.warn("Custom alarm sound autoplay blocked:", err);
        });
        this.audioEl = audioEl;
        return;
      } catch (e) {
        console.error("Failed to play custom alarm sound:", e);
      }
    }

    this.initCtx();
    let toggle = false;
    this.intervalId = setInterval(() => {
      if (this.isMuted) {
        this.stop();
        return;
      }
      if (!this.ctx || this.ctx.state === "suspended") return;
      try {
        const now = this.ctx.currentTime;
        if (type === "fire") {
          const osc1 = this.ctx.createOscillator();
          const osc2 = this.ctx.createOscillator();
          const gainNode = this.ctx.createGain();
          osc1.type = "sawtooth";
          osc1.frequency.setValueAtTime(toggle ? 2800 : 2900, now);
          osc2.type = "square";
          osc2.frequency.setValueAtTime(toggle ? 2830 : 2930, now);

          gainNode.gain.setValueAtTime(0.15, now);
          gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
          osc1.connect(gainNode);
          osc2.connect(gainNode);
          gainNode.connect(this.ctx.destination);
          osc1.start(now);
          osc1.stop(now + 0.23);
          osc2.start(now);
          osc2.stop(now + 0.23);
          toggle = !toggle;
        } else if (type === "gas") {
          const osc = this.ctx.createOscillator();
          const gainNode = this.ctx.createGain();
          osc.type = "square";
          osc.frequency.setValueAtTime(1500, now);

          gainNode.gain.setValueAtTime(0.14, now);
          gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

          osc.connect(gainNode);
          gainNode.connect(this.ctx.destination);
          osc.start(now);
          osc.stop(now + 0.14);
        }
      } catch (err) {
        console.error("Synthesizer sound error:", err);
      }
    }, 250);
  }
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.audioEl) {
      try {
        this.audioEl.pause();
        this.audioEl.src = "";
        this.audioEl = null;
      } catch (e) {
        console.warn("Failed to stop custom alarm sound:", e);
      }
    }
  }
}
