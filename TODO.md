# Task: Global Alarm Sound (plays on any page)

## Feature: Configurable Alert Sound System
- [x] 1. Create shared sound manager module (`alarmSounds.js`) - preset + custom sounds, localStorage
- [x] 2. Add "Alert Sounds" section to Settings page (list, preview, upload, assign fire/gas)
- [x] 3. Create shared alarm sound engine (`alarmSoundEngine.js`) - synthesized + custom file playback, global mute
- [x] 4. Create `GlobalAlarm` component - listens for sensor updates via socket on ANY page, plays alarm sound
- [x] 5. Mount `GlobalAlarm` in `App.jsx` so it's active on all authenticated pages
- [x] 6. Update `Dashboard.jsx` to use the global engine (mute, enable-audio, siren tester)
- [x] 7. Verify build (1728 modules, built successfully)

## Result
The alarm sound now rings globally on any page (Dashboard, Settings, Activity Logs, Schedules, About, etc.), not just on the Dashboard. The mute toggle and siren tester remain on the Dashboard and stay in sync with the global engine.
