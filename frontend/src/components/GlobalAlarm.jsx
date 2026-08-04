import React, { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import { AlarmSoundEngine, loadMuteState, saveMuteState } from "../utils/alarmSoundEngine.js";

// Global alarm component that listens for sensor updates on ANY page
// and plays the selected fire/gas alarm sound anywhere in the system.
export const GlobalAlarm = () => {
  const engineRef = useRef(null);
  const [isMuted, setIsMuted] = useState(loadMuteState());
  const [audioLocked, setAudioLocked] = useState(true);

  // Sensor state that drives the alarm (global)
  const sensorsRef = useRef({ fireStatus: false, gasStatus: false });

  if (!engineRef.current) {
    engineRef.current = new AlarmSoundEngine();
  }

  // Sync mute state with engine
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setMute(isMuted);
    if (isMuted) {
      engine.stop();
    } else {
      engine.unlock();
    }
    setAudioLocked(engine.isLocked());
  }, [isMuted]);

  // Effect to start/stop alarm based on global sensor state
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (isMuted) {
      engine.stop();
      return;
    }
    if (sensorsRef.current.fireStatus) {
      engine.start("fire");
    } else if (sensorsRef.current.gasStatus) {
      engine.start("gas");
    } else {
      engine.stop();
    }
    setAudioLocked(engine.isLocked());
  }, [isMuted]);

  // Listen for sensor updates via socket.io (global)
  useEffect(() => {
    const socket = io();
    socket.on("connect", () => {
      // no-op
    });
    socket.on("initial-state", data => {
      if (data && data.sensors) {
        sensorsRef.current = {
          fireStatus: data.sensors.fireStatus === true,
          gasStatus: data.sensors.gasStatus === true
        };
        // Trigger alarm if needed
        const engine = engineRef.current;
        if (engine && !isMuted) {
          if (sensorsRef.current.fireStatus) engine.start("fire");
          else if (sensorsRef.current.gasStatus) engine.start("gas");
          else engine.stop();
        }
      }
    });
    socket.on("sensors-updated", updatedSensors => {
      sensorsRef.current = {
        fireStatus: updatedSensors.fireStatus === true,
        gasStatus: updatedSensors.gasStatus === true
      };
      const engine = engineRef.current;
      if (engine && !isMuted) {
        if (sensorsRef.current.fireStatus) engine.start("fire");
        else if (sensorsRef.current.gasStatus) engine.start("gas");
        else engine.stop();
      }
    });
    socket.on("device-sync", syncData => {
      if (syncData && syncData.sensors) {
        sensorsRef.current = {
          fireStatus: syncData.sensors.fireStatus === true,
          gasStatus: syncData.sensors.gasStatus === true
        };
        const engine = engineRef.current;
        if (engine && !isMuted) {
          if (sensorsRef.current.fireStatus) engine.start("fire");
          else if (sensorsRef.current.gasStatus) engine.start("gas");
          else engine.stop();
        }
      }
    });
    return () => {
      socket.disconnect();
      if (engineRef.current) {
        engineRef.current.stop();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Unlock audio on any user interaction
  useEffect(() => {
    const resumeAudio = () => {
      if (engineRef.current) {
        engineRef.current.unlock();
        setAudioLocked(engineRef.current.isLocked());
      }
    };
    window.addEventListener("click", resumeAudio, { capture: true });
    window.addEventListener("touchstart", resumeAudio, { capture: true });
    window.addEventListener("touchend", resumeAudio, { capture: true });
    return () => {
      window.removeEventListener("click", resumeAudio, { capture: true });
      window.removeEventListener("touchstart", resumeAudio, { capture: true });
      window.removeEventListener("touchend", resumeAudio, { capture: true });
    };
  }, []);

// Provide a global mute toggle via custom event for other components
  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    saveMuteState(next);
    window.dispatchEvent(new CustomEvent("alarm:mute-change", { detail: { muted: next } }));
  };

  // Test alarm playback (for the Dashboard siren tester) - uses the global engine
  const testAlarm = type => {
    const engine = engineRef.current;
    if (!engine) return;
    if (isMuted) {
      engine.setMute(false);
      setIsMuted(false);
      saveMuteState(false);
    }
    engine.unlock();
    // Start the test sound; it will keep looping until stopped
    engine.start(type);
    window.__alarmTestActive = type;
  };

  // Stop a test alarm
  const stopTestAlarm = () => {
    const engine = engineRef.current;
    if (engine) {
      engine.stop();
    }
    window.__alarmTestActive = null;
  };

  // Expose the mute toggle and test functions globally so Dashboard/Settings can access them
  useEffect(() => {
    window.__alarmToggleMute = toggleMute;
    window.__alarmGetMuted = () => isMuted;
    window.__alarmTest = testAlarm;
    window.__alarmStopTest = stopTestAlarm;
    window.__alarmGetTestActive = () => window.__alarmTestActive || null;
    return () => {
      delete window.__alarmToggleMute;
      delete window.__alarmGetMuted;
      delete window.__alarmTest;
      delete window.__alarmStopTest;
      delete window.__alarmGetTestActive;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMuted]);

  // This component renders nothing visually
  return null;
};
