import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { eq, desc } from "drizzle-orm";

// dotenv is loaded inside db/index.js (first import) to ensure env vars are available before pool creation
import { db, runWithRetry, createTables } from "./db/index.js";
import { appliances, sensors, waterTank, activityLogs, users, schedules } from "./db/schema.js";
import { requireAuth, requireAuthorized } from "./middleware/auth.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-only-insecure-secret-change-me";
const signToken = (user) =>
  jwt.sign({ uid: user.uid, email: user.email, name: user.displayName || null }, JWT_SECRET, { expiresIn: "30d" });
const toPublicUser = (u) => ({
  uid: u.uid,
  email: u.email,
  displayName: u.displayName || null,
  photoURL: null,
  isAuthorized: u.isAuthorized,
});
const PORT = parseInt(process.env.PORT || "3000");
const app = express();
const httpServer = createServer(app);

// Use cors and body-parser middleware
app.use(express.json());

// Initialize Socket.IO with CORS support
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT"]
  }
});

// Reliable 24-hour HH:MM in a given timezone (hourCycle h23 avoids AM/PM ICU bugs)
function getCurrentTimeHHMM(timeZone) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timeZone || "UTC",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date());
  const hour = parts.find(p => p.type === "hour")?.value ?? "00";
  const minute = parts.find(p => p.type === "minute")?.value ?? "00";
  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

function normalizeTimeHHMM(time) {
  if (!time || typeof time !== "string") return time;
  const [hourStr, minuteStr = "00"] = time.split(":");
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr, 10);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return time;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

// Helper to log system events securely to PostgreSQL
async function addActivityLog(eventText) {
  try {
    await runWithRetry(() => db.insert(activityLogs).values({
      event: eventText,
      createdAt: new Date()
    }));
    // Broadcast newly added log to all dashboard clients
    io.emit("new-activity", {
      event: eventText,
      createdAt: new Date().toISOString()
    });
    console.log(`[LOG]: ${eventText}`);
  } catch (error) {
    console.error("Failed to write activity log:", error);
  }
}

// Tank-Full Safety Guard for the Overhead Fill Pump (id "tv")
// When the water tank is FULL (>= 80%), the fill pump must NOT be turned ON,
// even manually. This prevents overflow/water wastage. The stored state is
// forced back to OFF with a logged [SAFETY] notice.
const FILL_PUMP_SHUTOFF_LEVEL = 80;

// Returns true when the tank is currently full (>= shutdown level) and the
// requested action is to turn the fill pump ON. Used to block manual/auto ON.
async function isFillPumpTurnOnBlocked(requestedOn) {
  if (!requestedOn) return false; // Turning OFF is always allowed
  const tank = await db.select().from(waterTank).where(eq(waterTank.id, 1)).limit(1);
  const level = tank[0]?.percentage ?? 50;
  return level >= FILL_PUMP_SHUTOFF_LEVEL;
}

// REST APIs
// 0.1 Register - creates a new Postgres-backed account and returns a JWT
app.post("/api/auth/register", async (req, res) => {
  try {
    const { email, password, displayName } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters long" });
    }

    const emailLower = String(email).trim().toLowerCase();
    const existing = await db.select().from(users).where(eq(users.email, emailLower)).limit(1);
    if (existing[0]) {
      return res.status(409).json({ error: "This email is already registered" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const uid = crypto.randomUUID();

    const isMainAdmin = emailLower === "aabashgiri8@gmail.com";
    const allUsers = await db.select().from(users).limit(1);
    const isFirstUser = allUsers.length === 0;

    await db.insert(users).values({
      uid,
      email: emailLower,
      passwordHash,
      displayName: displayName || null,
      isAuthorized: isMainAdmin || isFirstUser,
    });

    const created = await db.select().from(users).where(eq(users.uid, uid)).limit(1);
    const token = signToken(created[0]);
    res.status(201).json({ token, user: toPublicUser(created[0]) });
  } catch (error) {
    console.error("Register endpoint error:", error);
    res.status(500).json({ error: "Failed to register account" });
  }
});

// 0.2 Login - verifies email/password against Postgres and returns a JWT
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const emailLower = String(email).trim().toLowerCase();
    const found = await db.select().from(users).where(eq(users.email, emailLower)).limit(1);
    const dbUser = found[0];

    if (!dbUser || !dbUser.passwordHash) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const valid = await bcrypt.compare(password, dbUser.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = signToken(dbUser);
    res.json({ token, user: toPublicUser(dbUser) });
  } catch (error) {
    console.error("Login endpoint error:", error);
    res.status(500).json({ error: "Failed to log in" });
  }
});

// 1. Auth Profile - fetches DB user context
app.get("/api/auth/profile", requireAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: "Unauthorized"
      });
    }
    // Fetch user from DB
    const dbUser = await db.select().from(users).where(eq(users.uid, req.user.uid)).limit(1);
    res.json({
      uid: req.user.uid,
      email: req.user.email,
      name: req.user.name,
      dbUser: dbUser[0] || null
    });
  } catch (error) {
    console.error("Profile endpoint error:", error);
    res.status(500).json({
      error: error.message
    });
  }
});

// 1.1. Authorize User Account - validates passcode
app.post("/api/auth/authorize", requireAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: "Unauthorized"
      });
    }
    const {
      passcode
    } = req.body;
    if (!passcode) {
      return res.status(400).json({
        error: "Passcode is required"
      });
    }
    const expectedPasscode = process.env.AUTH_PASSCODE || "IOTSAFE2026";
    if (passcode.trim() === expectedPasscode) {
      await db.update(users).set({
        isAuthorized: true
      }).where(eq(users.uid, req.user.uid));
      const updatedUser = await db.select().from(users).where(eq(users.uid, req.user.uid)).limit(1);

      // Log this authorization event
      await addActivityLog(`Account authorized: ${req.user.email}`);
      res.json({
        success: true,
        dbUser: updatedUser[0]
      });
    } else {
      res.status(400).json({
        error: "Invalid authorization passcode"
      });
    }
  } catch (error) {
    console.error("Authorize endpoint error:", error);
    res.status(500).json({
      error: error.message
    });
  }
});

// 2. Appliances
app.get("/api/appliances", async (req, res) => {
  try {
    const list = await db.select().from(appliances);
    res.json(list);
  } catch (error) {
    console.error("Get appliances error:", error);
    res.status(500).json({
      error: "Failed to fetch appliances"
    });
  }
});
app.put("/api/appliances/:id", async (req, res) => {
  try {
    const {
      id
    } = req.params;
    const {
      status,
      name
    } = req.body;
    const updateFields = {};
    if (typeof status === "boolean") updateFields.status = status;
    if (typeof name === "string") updateFields.name = name;
    updateFields.updatedAt = new Date();

    // Tank-Full Safety Guard: block turning the Overhead Fill Pump ON when the tank is full
    if (id === "tv" && typeof status === "boolean" && status && await isFillPumpTurnOnBlocked(true)) {
      await addActivityLog(`[SAFETY] Tank is FULL (${FILL_PUMP_SHUTOFF_LEVEL}%+). Overhead Fill Pump kept OFF.`);
      io.emit("appliance-updated", {
        id: "tv",
        status: false
      });
      return res.json({
        success: true,
        appliance: {
          id: "tv",
          name: "Overhead Fill Pump",
          status: false
        }
      });
    }

    // Update appliance in Postgres
    await db.update(appliances).set(updateFields).where(eq(appliances.id, id));
    const applianceRecord = await db.select().from(appliances).where(eq(appliances.id, id)).limit(1);
    const applianceName = applianceRecord[0]?.name || id;
    if (typeof status === "boolean") {
      // Log the toggle event
      const logMessage = `${applianceName} turned ${status ? "ON" : "OFF"}`;
      await addActivityLog(logMessage);
    } else if (typeof name === "string") {
      await addActivityLog(`Appliance renamed to: ${name}`);
    }

    // Broadcast update to all Socket.IO clients
    io.emit("appliance-updated", {
      id,
      status: applianceRecord[0]?.status,
      name: applianceRecord[0]?.name
    });
    res.json({
      success: true,
      appliance: applianceRecord[0]
    });
  } catch (error) {
    console.error("Update appliance error:", error);
    res.status(500).json({
      error: "Failed to update appliance"
    });
  }
});

// 3. Sensors
app.get("/api/sensors", async (req, res) => {
  try {
    const data = await db.select().from(sensors).where(eq(sensors.id, 1)).limit(1);
    res.json(data[0] || {
      fireStatus: false,
      gasStatus: false,
      firePumpStatus: false,
      fireSensorAvailable: true,
      gasSensorAvailable: true,
      sonicSensorAvailable: true
    });
  } catch (error) {
    console.error("Get sensors error:", error);
    res.status(500).json({
      error: "Failed to fetch sensors data"
    });
  }
});
app.put("/api/sensors/availability", async (req, res) => {
  try {
    const {
      fireSensorAvailable,
      gasSensorAvailable,
      sonicSensorAvailable
    } = req.body;
    const updateFields = {};
    if (typeof fireSensorAvailable === "boolean") updateFields.fireSensorAvailable = fireSensorAvailable;
    if (typeof gasSensorAvailable === "boolean") updateFields.gasSensorAvailable = gasSensorAvailable;
    if (typeof sonicSensorAvailable === "boolean") updateFields.sonicSensorAvailable = sonicSensorAvailable;
    updateFields.updatedAt = new Date();

    // If a hazard sensor is disabled, force its detection status to false immediately to clear any alerts
    if (fireSensorAvailable === false) {
      updateFields.fireStatus = false;
      updateFields.firePumpStatus = false;

      // Deactivate Fire Suppression Pump appliance
      await db.update(appliances).set({
        status: false,
        updatedAt: new Date()
      }).where(eq(appliances.id, "socket"));
      io.emit("appliance-updated", {
        id: "socket",
        status: false
      });
    }
    if (gasSensorAvailable === false) {
      updateFields.gasStatus = false;
    }
    await db.update(sensors).set(updateFields).where(eq(sensors.id, 1));
    const current = await db.select().from(sensors).where(eq(sensors.id, 1)).limit(1);

    // If sonic sensor is disabled, default water level to 50% and turn off automatic water pump controls
    if (sonicSensorAvailable === false) {
      await db.update(waterTank).set({
        percentage: 50,
        pumpStatus: false,
        updatedAt: new Date()
      }).where(eq(waterTank.id, 1));
      await db.update(appliances).set({
        status: false,
        updatedAt: new Date()
      }).where(eq(appliances.id, "tv"));
      io.emit("appliance-updated", {
        id: "tv",
        status: false
      });
      const currentWater = await db.select().from(waterTank).where(eq(waterTank.id, 1)).limit(1);
      io.emit("water-updated", currentWater[0]);
    }
    io.emit("sensors-updated", current[0]);

    // Broadcast full flat device sync for ESP32 and web clients
    const allAppliances = await db.select().from(appliances);
    const updatedWater = await db.select().from(waterTank).where(eq(waterTank.id, 1)).limit(1);
    const flatStates = {
      fire: current[0]?.fireStatus || false,
      gas: current[0]?.gasStatus || false,
      pump: updatedWater[0]?.pumpStatus || false,
      firePump: current[0]?.firePumpStatus || false,
      fireAvail: current[0]?.fireSensorAvailable !== false,
      gasAvail: current[0]?.gasSensorAvailable !== false,
      sonicAvail: current[0]?.sonicSensorAvailable !== false
    };
    allAppliances.forEach(app => {
      flatStates[app.id] = app.status;
    });
    io.emit("device-sync", {
      sensors: current[0],
      waterTank: updatedWater[0],
      appliances: allAppliances,
      states: flatStates
    });
    await addActivityLog(`Sensor availability updated: Fire=${fireSensorAvailable !== false ? "YES" : "NO"}, Gas=${gasSensorAvailable !== false ? "YES" : "NO"}, Sonic=${sonicSensorAvailable !== false ? "YES" : "NO"}`);
    res.json({
      success: true,
      sensors: current[0]
    });
  } catch (error) {
    console.error("Put sensors availability error:", error);
    res.status(500).json({
      error: "Failed to update sensors availability"
    });
  }
});

// 4. Water Tank
app.get("/api/water", async (req, res) => {
  try {
    const data = await db.select().from(waterTank).where(eq(waterTank.id, 1)).limit(1);
    res.json(data[0] || {
      percentage: 50,
      pumpStatus: false
    });
  } catch (error) {
    console.error("Get water tank error:", error);
    res.status(500).json({
      error: "Failed to fetch water tank data"
    });
  }
});
app.put("/api/water", async (req, res) => {
  try {
    const {
      percentage,
      pumpStatus,
      tankHeight
    } = req.body;
    const updateFields = {};
    if (typeof percentage === "number") updateFields.percentage = percentage;
    if (typeof pumpStatus === "boolean") updateFields.pumpStatus = pumpStatus;
    if (typeof tankHeight === "number") {
      if (tankHeight < 2 || tankHeight > 400) {
        return res.status(400).json({
          error: "Tank height must be between 2 cm and 400 cm (HC-SR04 sensor operational capacity limits)"
        });
      }
      updateFields.tankHeight = tankHeight;
    }
    updateFields.updatedAt = new Date();
    await db.update(waterTank).set(updateFields).where(eq(waterTank.id, 1));
    const current = await db.select().from(waterTank).where(eq(waterTank.id, 1)).limit(1);
    if (typeof tankHeight === "number") {
      await addActivityLog(`Ultrasonic sensor calibrated: Tank height set to ${tankHeight} cm.`);
    }
    io.emit("water-updated", current[0]);
    res.json({
      success: true,
      waterTank: current[0]
    });
  } catch (error) {
    console.error("Put water tank error:", error);
    res.status(500).json({
      error: "Failed to update water tank data"
    });
  }
});

// 5. Activity Logs
app.get("/api/activity", async (req, res) => {
  try {
    const logs = await db.select().from(activityLogs).orderBy(desc(activityLogs.createdAt)).limit(50);
    res.json(logs);
  } catch (error) {
    console.error("Get activity logs error:", error);
    res.status(500).json({
      error: "Failed to fetch activity logs"
    });
  }
});
app.post("/api/activity", async (req, res) => {
  try {
    const {
      event
    } = req.body;
    if (!event) {
      return res.status(400).json({
        error: "Event text is required"
      });
    }
    await addActivityLog(event);
    res.json({
      success: true
    });
  } catch (error) {
    console.error("Post activity error:", error);
    res.status(500).json({
      error: "Failed to create activity log"
    });
  }
});

// 5.5. Schedules APIs
app.get("/api/schedules", async (req, res) => {
  try {
    const list = await db.select().from(schedules);
    res.json(list);
  } catch (error) {
    console.error("Get schedules error:", error);
    res.status(500).json({
      error: "Failed to fetch schedules"
    });
  }
});
app.post("/api/schedules", async (req, res) => {
  try {
    const {
      applianceId,
      action,
      time,
      timezone
    } = req.body;
    if (!applianceId || !action || !time) {
      return res.status(400).json({
        error: "Missing required fields: applianceId, action, time"
      });
    }
    const normalizedTime = normalizeTimeHHMM(time);
    const newSched = {
      applianceId,
      action,
      time: normalizedTime,
      timezone: timezone || "UTC",
      isActive: true,
      createdAt: new Date()
    };
    const inserted = await db.insert(schedules).values(newSched).returning();

    // Log
    const appRec = await db.select().from(appliances).where(eq(appliances.id, applianceId)).limit(1);
    const name = appRec[0]?.name || applianceId;
    await addActivityLog(`New schedule created for ${name} at ${time} (${action})`);

    // Broadcast update
    io.emit("schedule-created", inserted[0]);
    res.json(inserted[0]);
  } catch (error) {
    console.error("Create schedule error:", error);
    res.status(500).json({
      error: "Failed to create schedule"
    });
  }
});
app.put("/api/schedules/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const {
      isActive,
      time,
      action,
      applianceId,
      timezone
    } = req.body;
    const updateFields = {};
    if (typeof isActive === "boolean") {
      updateFields.isActive = isActive;
      // Reset lastExecuted when re-enabling schedule so it runs at the next matching time
      if (isActive === true) {
        updateFields.lastExecuted = null;
      }
    }
    if (typeof time === "string") {
      updateFields.time = normalizeTimeHHMM(time);
      // Reset lastExecuted when changing the scheduled time
      updateFields.lastExecuted = null;
    }
    if (typeof action === "string") {
      updateFields.action = action;
      // Reset lastExecuted when changing the action (ON/OFF)
      updateFields.lastExecuted = null;
    }
    if (typeof applianceId === "string") updateFields.applianceId = applianceId;
    if (typeof timezone === "string") updateFields.timezone = timezone;

    await db.update(schedules).set(updateFields).where(eq(schedules.id, id));
    const updated = await db.select().from(schedules).where(eq(schedules.id, id)).limit(1);

    // Broadcast update
    io.emit("schedule-updated", updated[0]);
    res.json(updated[0]);
  } catch (error) {
    console.error("Update schedule error:", error);
    res.status(500).json({
      error: "Failed to update schedule"
    });
  }
});
app.delete("/api/schedules/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const record = await db.select().from(schedules).where(eq(schedules.id, id)).limit(1);
    await db.delete(schedules).where(eq(schedules.id, id));
    if (record[0]) {
      const appRec = await db.select().from(appliances).where(eq(appliances.id, record[0].applianceId)).limit(1);
      const name = appRec[0]?.name || record[0].applianceId;
      await addActivityLog(`Schedule deleted for ${name} at ${record[0].time}`);
    }

    // Broadcast update
    io.emit("schedule-deleted", {
      id
    });
    res.json({
      success: true
    });
  } catch (error) {
    console.error("Delete schedule error:", error);
    res.status(500).json({
      error: "Failed to delete schedule"
    });
  }
});

// ESP32 Liveness & Heartbeat Status state
let lastDeviceHeartbeat = null;
let isDeviceOnline = false;

// Background interval to monitor ESP32 liveness (runs every 4 seconds)
setInterval(() => {
  const now = Date.now();
  const currentlyOnline = lastDeviceHeartbeat !== null && now - lastDeviceHeartbeat < 10000;
  if (currentlyOnline !== isDeviceOnline) {
    isDeviceOnline = currentlyOnline;
    io.emit("device-online-status", {
      online: isDeviceOnline
    });
    console.log(`[DEVICE LIVENESS]: ESP32 status changed. Online = ${isDeviceOnline}`);
  }
}, 4000);

// 6. Device Update API (for physical/simulated ESP32 REST updates)
app.post("/api/device/update", async (req, res) => {
  try {
    const {
      fireStatus,
      gasStatus,
      waterLevel,
      appliancesState,
      isPhysicalToggle
    } = req.body;

    // Update ESP32 heartbeat timestamp and transition online immediately if needed
    lastDeviceHeartbeat = Date.now();
    if (!isDeviceOnline) {
      isDeviceOnline = true;
      io.emit("device-online-status", {
        online: true
      });
      console.log("[DEVICE LIVENESS]: ESP32 is now ONLINE");
    }

    // Fetch sensor configuration to check availability
    const sensorConfig = await db.select().from(sensors).where(eq(sensors.id, 1)).limit(1);
    const fireAvail = sensorConfig[0]?.fireSensorAvailable !== false;
    const gasAvail = sensorConfig[0]?.gasSensorAvailable !== false;
    const sonicAvail = sensorConfig[0]?.sonicSensorAvailable !== false;

    // 1. Process Fire status
    if (typeof fireStatus === "boolean") {
      const targetFireStatus = fireAvail ? fireStatus : false;
      const prevFire = sensorConfig[0]?.fireStatus || false;
      const currentPumpStatus = sensorConfig[0]?.firePumpStatus || false;

      // Fetch current socket appliance state to make sure it's in sync
      const socketApp = await db.select().from(appliances).where(eq(appliances.id, "socket")).limit(1);
      const isSocketOn = socketApp[0]?.status || false;

      // We trigger an update if the fire status changes, OR if a fire is currently active but the pump or appliance is OFF
      if (targetFireStatus !== prevFire || targetFireStatus && (!currentPumpStatus || !isSocketOn)) {
        await db.update(sensors).set({
          fireStatus: targetFireStatus,
          firePumpStatus: targetFireStatus,
          updatedAt: new Date()
        }).where(eq(sensors.id, 1));

        // Sync with Fire Extinguisher Pump appliance
        await db.update(appliances).set({
          status: targetFireStatus,
          updatedAt: new Date()
        }).where(eq(appliances.id, "socket"));
        io.emit("appliance-updated", {
          id: "socket",
          status: targetFireStatus
        });
        await addActivityLog(targetFireStatus ? "Fire Detected! Fire Extinguisher Pump Activated." : "Fire Cleared. Fire Extinguisher Pump Stopped.");
      }
    }

    // 2. Process Gas status
    if (typeof gasStatus === "boolean") {
      const targetGasStatus = gasAvail ? gasStatus : false;
      const prevGas = sensorConfig[0]?.gasStatus || false;
      if (targetGasStatus !== prevGas) {
        await db.update(sensors).set({
          gasStatus: targetGasStatus,
          updatedAt: new Date()
        }).where(eq(sensors.id, 1));
        await addActivityLog(targetGasStatus ? "LPG Gas Leakage Detected! Alarm Activated." : "LPG Gas Leakage Cleared.");
      }
    }

    // 3. Process Water Level with hysteresis (prevents rapid pump toggling):
    //    - Pump OFF -> turns ON  only when water level <= 20%
    //    - Pump ON  -> turns OFF only when water level >= 80%
    //    This creates a natural deadband, so fluctuations near thresholds don't chattering.
    if (typeof waterLevel === "number") {
      if (sonicAvail) {
        const currentTank = await db.select().from(waterTank).where(eq(waterTank.id, 1)).limit(1);
        const prevPumpStatus = currentTank[0]?.pumpStatus || false;
        let nextPumpStatus = prevPumpStatus;

        // Automatic Water Level control rules with hysteresis (state-aware):
        // If pump is currently ON, only turn it OFF when tank reaches 80% or above.
        // If pump is currently OFF, only turn it ON when tank drops to 20% or below.
        if (prevPumpStatus) {
          // Pump is ON — only turn OFF when tank is sufficiently full
          if (waterLevel >= 80) {
            nextPumpStatus = false;
            await addActivityLog(`Water Tank Reached 80%. Overhead Filling Pump Stopped.`);
          }
        } else {
          // Pump is OFF — only turn ON when tank is critically low
          if (waterLevel <= 20) {
            nextPumpStatus = true;
            await addActivityLog(`Water Tank Low (${waterLevel}%). Overhead Filling Pump Started.`);
          }
        }
        await db.update(waterTank).set({
          percentage: waterLevel,
          pumpStatus: nextPumpStatus,
          updatedAt: new Date()
        }).where(eq(waterTank.id, 1));

        // Sync with Overhead Fill Pump appliance
        await db.update(appliances).set({
          status: nextPumpStatus,
          updatedAt: new Date()
        }).where(eq(appliances.id, "tv"));
        io.emit("appliance-updated", {
          id: "tv",
          status: nextPumpStatus
        });
      } else {
        // If ultrasonic is not available, we keep it safe and don't trigger automation.
        // We set water tank percentage to 50% so it looks healthy without triggering alarms.
        await db.update(waterTank).set({
          percentage: 50,
          updatedAt: new Date()
        }).where(eq(waterTank.id, 1));
      }
    }

    // 4. Process optional Appliance states (ESP32 physical switches sync)
    // ONLY process and override database state if this is an explicit physical toggle event
    if (isPhysicalToggle && appliancesState && typeof appliancesState === "object") {
      for (const [key, value] of Object.entries(appliancesState)) {
        if (typeof value === "boolean") {
          const prevApp = await db.select().from(appliances).where(eq(appliances.id, key)).limit(1);
          if (prevApp[0] && prevApp[0].status !== value) {
            // Tank-Full Safety Guard: never turn the fill pump ON when the tank is full
            if (key === "tv" && value && await isFillPumpTurnOnBlocked(true)) {
              await addActivityLog(`[SAFETY] Tank is FULL (${FILL_PUMP_SHUTOFF_LEVEL}%+). Overhead Fill Pump kept OFF.`);
              continue;
            }
            await db.update(appliances).set({
              status: value,
              updatedAt: new Date()
            }).where(eq(appliances.id, key));
            await addActivityLog(`Physical Switch: ${prevApp[0].name} turned ${value ? "ON" : "OFF"}`);
            io.emit("appliance-updated", {
              id: key,
              status: value
            });

            // Sync secondary relational tables so the water widget & fire pump
            // status stay in perfect harmony with the physical switch.
            if (key === "tv") {
              await db.update(waterTank).set({
                pumpStatus: value,
                updatedAt: new Date()
              }).where(eq(waterTank.id, 1));
              const updatedWater = await db.select().from(waterTank).where(eq(waterTank.id, 1)).limit(1);
              io.emit("water-updated", updatedWater[0]);
            } else if (key === "socket") {
              await db.update(sensors).set({
                firePumpStatus: value,
                updatedAt: new Date()
              }).where(eq(sensors.id, 1));
              const updatedSensors = await db.select().from(sensors).where(eq(sensors.id, 1)).limit(1);
              io.emit("sensors-updated", updatedSensors[0]);
            }
          }
        }
      }
    }

    // Broadcast full updated state to browser clients
    const updatedSensors = await db.select().from(sensors).where(eq(sensors.id, 1)).limit(1);
    const updatedWater = await db.select().from(waterTank).where(eq(waterTank.id, 1)).limit(1);
    const allAppliances = await db.select().from(appliances);

    // Create a flat states object for simple, robust ESP32 string-matching parsing
    const flatStates = {
      fire: updatedSensors[0]?.fireStatus || false,
      gas: updatedSensors[0]?.gasStatus || false,
      pump: updatedWater[0]?.pumpStatus || false,
      firePump: updatedSensors[0]?.firePumpStatus || false,
      fireAvail: updatedSensors[0]?.fireSensorAvailable !== false,
      gasAvail: updatedSensors[0]?.gasSensorAvailable !== false,
      sonicAvail: updatedSensors[0]?.sonicSensorAvailable !== false
    };
    allAppliances.forEach(app => {
      flatStates[app.id] = app.status;
    });
    io.emit("device-sync", {
      sensors: updatedSensors[0],
      waterTank: updatedWater[0],
      appliances: allAppliances,
      states: flatStates
    });
    res.json({
      success: true,
      sensors: updatedSensors[0],
      waterTank: updatedWater[0],
      appliances: allAppliances,
      states: flatStates
    });
  } catch (error) {
    console.error("Device update endpoint error:", error);
    res.status(500).json({
      error: error.message
    });
  }
});

// Socket.IO Connection Setup
io.on("connection", socket => {
  console.log(`Client connected: ${socket.id}`);

  // Send initial state on connection
  async function sendInitialState() {
    try {
      const allApps = await db.select().from(appliances);
      const currentSensors = await db.select().from(sensors).where(eq(sensors.id, 1)).limit(1);
      const currentWater = await db.select().from(waterTank).where(eq(waterTank.id, 1)).limit(1);
      const allSchedules = await db.select().from(schedules);
      socket.emit("initial-state", {
        appliances: allApps,
        sensors: currentSensors[0] || {
          fireStatus: false,
          gasStatus: false,
          firePumpStatus: false
        },
        waterTank: currentWater[0] || {
          percentage: 50,
          pumpStatus: false
        },
        schedules: allSchedules,
        deviceOnline: isDeviceOnline
      });
    } catch (err) {
      console.error("Failed to query initial state for socket client:", err);
    }
  }
  sendInitialState();

  // Handle toggle-appliance event from browser
  socket.on("toggle-appliance", async data => {
    try {
      const {
        id,
        status
      } = data;

      // Sync relational secondary tables so they stay in perfect harmony
      if (id === "tv") {
        // Tank-Full Safety Guard: never turn the fill pump ON when the tank is full (>= 80%)
        if (await isFillPumpTurnOnBlocked(status)) {
          await addActivityLog(`[SAFETY] Tank is FULL (${FILL_PUMP_SHUTOFF_LEVEL}%+). Overhead Fill Pump kept OFF.`);
          io.emit("appliance-updated", {
            id: "tv",
            status: false
          });
          io.emit("water-updated", (await db.select().from(waterTank).where(eq(waterTank.id, 1)).limit(1))[0]);
          return;
        }
        await db.update(appliances).set({
          status,
          updatedAt: new Date()
        }).where(eq(appliances.id, id));
        const appRec = await db.select().from(appliances).where(eq(appliances.id, id)).limit(1);
        const name = appRec[0]?.name || id;
        await addActivityLog(`${name} turned ${status ? "ON" : "OFF"}`);

        // Overhead Fill Pump 1
        await db.update(waterTank).set({
          pumpStatus: status,
          updatedAt: new Date()
        }).where(eq(waterTank.id, 1));
        const updatedWater = await db.select().from(waterTank).where(eq(waterTank.id, 1)).limit(1);
        io.emit("water-updated", updatedWater[0]);
      } else if (id === "socket") {
        // Fire suppression Pump 2
        // If fire is currently active, we block turning off the pump!
        const currentSensor = await db.select().from(sensors).where(eq(sensors.id, 1)).limit(1);
        const activeFire = currentSensor[0]?.fireStatus || false;
        let targetStatus = status;
        if (activeFire && !status) {
          targetStatus = true;
          // Force back to true since fire is active
          await db.update(appliances).set({
            status: true,
            updatedAt: new Date()
          }).where(eq(appliances.id, "socket"));
          io.emit("appliance-updated", {
            id: "socket",
            status: true
          });
          await addActivityLog("Attempted to deactivate Fire Extinguisher Pump while fire is still active! Blocked by auto-safety system.");
        } else {
          await db.update(appliances).set({
            status,
            updatedAt: new Date()
          }).where(eq(appliances.id, id));
          const appRec = await db.select().from(appliances).where(eq(appliances.id, id)).limit(1);
          const name = appRec[0]?.name || id;
          await addActivityLog(`${name} turned ${status ? "ON" : "OFF"}`);
        }
        await db.update(sensors).set({
          firePumpStatus: targetStatus,
          updatedAt: new Date()
        }).where(eq(sensors.id, 1));
        const updatedSensors = await db.select().from(sensors).where(eq(sensors.id, 1)).limit(1);
        io.emit("sensors-updated", updatedSensors[0]);
      } else {
        await db.update(appliances).set({
          status,
          updatedAt: new Date()
        }).where(eq(appliances.id, id));
        const appRec = await db.select().from(appliances).where(eq(appliances.id, id)).limit(1);
        const name = appRec[0]?.name || id;
        await addActivityLog(`${name} turned ${status ? "ON" : "OFF"}`);
      }

      // Broadcast to other clients
      io.emit("appliance-updated", {
        id,
        status
      });
    } catch (err) {
      console.error("Socket toggle-appliance error:", err);
    }
  });

  // Handle device sensor updates from browser/embedded simulator
  socket.on("device-sensor-update", async data => {
    try {
      const {
        fireStatus,
        gasStatus,
        waterLevel,
        appliancesState,
        isPhysicalToggle
      } = data;

      // Update liveness heartbeat timestamp so simulator acts as an active online device
      lastDeviceHeartbeat = Date.now();
      if (!isDeviceOnline) {
        isDeviceOnline = true;
        io.emit("device-online-status", {
          online: true
        });
        console.log("[DEVICE LIVENESS]: Simulator/Device is now ONLINE");
      }

      // Fetch sensor configuration to check availability
      const sensorConfig = await db.select().from(sensors).where(eq(sensors.id, 1)).limit(1);
      const fireAvail = sensorConfig[0]?.fireSensorAvailable !== false;
      const gasAvail = sensorConfig[0]?.gasSensorAvailable !== false;
      const sonicAvail = sensorConfig[0]?.sonicSensorAvailable !== false;

      // 1. Process Fire status
      if (typeof fireStatus === "boolean") {
        const targetFireStatus = fireAvail ? fireStatus : false;
        const prevFire = sensorConfig[0]?.fireStatus || false;
        const currentPumpStatus = sensorConfig[0]?.firePumpStatus || false;

        // Fetch current socket appliance state to make sure it's in sync
        const socketApp = await db.select().from(appliances).where(eq(appliances.id, "socket")).limit(1);
        const isSocketOn = socketApp[0]?.status || false;

        // We trigger an update if the fire status changes, OR if a fire is currently active but the pump or appliance is OFF
        if (targetFireStatus !== prevFire || targetFireStatus && (!currentPumpStatus || !isSocketOn)) {
          await db.update(sensors).set({
            fireStatus: targetFireStatus,
            firePumpStatus: targetFireStatus,
            updatedAt: new Date()
          }).where(eq(sensors.id, 1));

          // Sync with Fire Extinguisher Pump appliance ('socket')
          await db.update(appliances).set({
            status: targetFireStatus,
            updatedAt: new Date()
          }).where(eq(appliances.id, "socket"));
          io.emit("appliance-updated", {
            id: "socket",
            status: targetFireStatus
          });
          await addActivityLog(targetFireStatus ? "Fire Detected! Fire Extinguisher Pump Activated." : "Fire Cleared. Fire Extinguisher Pump Stopped.");
        }
      }

      // 2. Process Gas status
      if (typeof gasStatus === "boolean") {
        const targetGasStatus = gasAvail ? gasStatus : false;
        const prevGas = sensorConfig[0]?.gasStatus || false;
        if (targetGasStatus !== prevGas) {
          await db.update(sensors).set({
            gasStatus: targetGasStatus,
            updatedAt: new Date()
          }).where(eq(sensors.id, 1));
          await addActivityLog(targetGasStatus ? "LPG Gas Leakage Detected! Alarm Activated." : "LPG Gas Leakage Cleared.");
        }
      }

      // 3. Process Water Level with hysteresis (prevents rapid pump toggling):
      //    - Pump OFF -> turns ON  only when water level <= 20%
      //    - Pump ON  -> turns OFF only when water level >= 80%
      //    This creates a natural deadband, so fluctuations near thresholds don't chattering.
      if (typeof waterLevel === "number") {
        if (sonicAvail) {
          const currentTank = await db.select().from(waterTank).where(eq(waterTank.id, 1)).limit(1);
          const prevPumpStatus = currentTank[0]?.pumpStatus || false;
          let nextPumpStatus = prevPumpStatus;
          // Hysteresis: state-aware control
          if (prevPumpStatus) {
            // Pump is ON — only turn OFF when tank is sufficiently full
            if (waterLevel >= 80) {
              nextPumpStatus = false;
              await addActivityLog(`Water Tank Reached 80%. Overhead Filling Pump Stopped.`);
            }
          } else {
            // Pump is OFF — only turn ON when tank is critically low
            if (waterLevel <= 20) {
              nextPumpStatus = true;
              await addActivityLog(`Water Tank Low (${waterLevel}%). Overhead Filling Pump Started.`);
            }
          }
          await db.update(waterTank).set({
            percentage: waterLevel,
            pumpStatus: nextPumpStatus,
            updatedAt: new Date()
          }).where(eq(waterTank.id, 1));

          // Sync with Overhead Fill Pump appliance ('tv')
          await db.update(appliances).set({
            status: nextPumpStatus,
            updatedAt: new Date()
          }).where(eq(appliances.id, "tv"));
          io.emit("appliance-updated", {
            id: "tv",
            status: nextPumpStatus
          });
        } else {
          // If ultrasonic is not available, we keep it safe and don't trigger automation.
          // We set water tank percentage to 50% so it looks healthy without triggering alarms.
          await db.update(waterTank).set({
            percentage: 50,
            updatedAt: new Date()
          }).where(eq(waterTank.id, 1));
        }
      }

      // 4. Process optional Appliance states (ESP32 physical switches sync)
      // ONLY process and override database state if this is an explicit physical toggle event
      if (isPhysicalToggle && appliancesState && typeof appliancesState === "object") {
        for (const [key, value] of Object.entries(appliancesState)) {
          if (typeof value === "boolean") {
            const prevApp = await db.select().from(appliances).where(eq(appliances.id, key)).limit(1);
            if (prevApp[0] && prevApp[0].status !== value) {
              // Tank-Full Safety Guard: never turn the fill pump ON when the tank is full
              if (key === "tv" && value && await isFillPumpTurnOnBlocked(true)) {
                await addActivityLog(`[SAFETY] Tank is FULL (${FILL_PUMP_SHUTOFF_LEVEL}%+). Overhead Fill Pump kept OFF.`);
                continue;
              }
              await db.update(appliances).set({
                status: value,
                updatedAt: new Date()
              }).where(eq(appliances.id, key));
              await addActivityLog(`Physical Switch: ${prevApp[0].name} turned ${value ? "ON" : "OFF"}`);
              io.emit("appliance-updated", {
                id: key,
                status: value
              });

              // Sync secondary relational tables so the water widget & fire pump
              // status stay in perfect harmony with the physical switch.
              if (key === "tv") {
                await db.update(waterTank).set({
                  pumpStatus: value,
                  updatedAt: new Date()
                }).where(eq(waterTank.id, 1));
                const updatedWater = await db.select().from(waterTank).where(eq(waterTank.id, 1)).limit(1);
                io.emit("water-updated", updatedWater[0]);
              } else if (key === "socket") {
                await db.update(sensors).set({
                  firePumpStatus: value,
                  updatedAt: new Date()
                }).where(eq(sensors.id, 1));
                const updatedSensors = await db.select().from(sensors).where(eq(sensors.id, 1)).limit(1);
                io.emit("sensors-updated", updatedSensors[0]);
              }
            }
          }
        }
      }

      // Broadcast updated parameters to all clients
      const updatedSensors = await db.select().from(sensors).where(eq(sensors.id, 1)).limit(1);
      const updatedWater = await db.select().from(waterTank).where(eq(waterTank.id, 1)).limit(1);
      const allAppliances = await db.select().from(appliances);
      io.emit("device-sync", {
        sensors: updatedSensors[0],
        waterTank: updatedWater[0],
        appliances: allAppliances
      });
    } catch (err) {
      console.error("Socket device-sensor-update error:", err);
    }
  });
  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// Health check endpoint for Render and monitoring
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    dbConnected: !!db
  });
});

// Serve the built frontend (../frontend/dist) when it exists.
// In development, run the frontend separately with `npm run dev` inside /frontend —
// its Vite dev server proxies /api and /socket.io to this backend (see frontend/vite.config.js).
//
// IMPORTANT: The catch-all "GET *" handler for SPA routes (like /settings, /activity)
// is registered HERE — AFTER all API routes, but BEFORE the server starts listening.
// This ensures that:
//   1. API routes are tried first (e.g., /api/auth/login)
//   2. Static files are served (e.g., /assets/index-xxx.js)
//   3. All other GET requests (React Router paths) get index.html (SPA fallback)
async function startStaticServing() {
  // Try multiple possible locations for the frontend dist folder
  const possiblePaths = [
    path.join(process.cwd(), "..", "frontend", "dist"),           // Render (root=/opt/render/project/src/backend)
    path.join(process.cwd(), "..", "..", "frontend", "dist"),     // Fallback
    path.join(process.cwd(), "frontend", "dist"),                 // Local monorepo
  ];

  let distPath = null;
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      distPath = p;
      break;
    }
  }

  if (distPath) {
    console.log("[INFO]: Serving frontend from", distPath);
    app.use(express.static(distPath));

    // SPA catch-all: any GET request that is NOT an /api route gets index.html
    // This is critical for React Router to work on page refresh
    app.get(/^\/(?!api\/|socket\.io\/).*/, (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  } else {
    console.log("[INFO]: No frontend build found. Running in API/Socket.IO-only mode.");
    console.log("[INFO]:   Run 'cd frontend && npm run build' to build the frontend.");
  }
}

// Generic API 404 handler — returns JSON for unmatched API routes instead of empty body
app.use("/api", (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.path}` });
});

// Background schedule evaluate loop (runs every 60 seconds)
async function checkSchedules() {
  try {
    const now = new Date();
    const activeSchedules = await runWithRetry(() => db.select().from(schedules).where(eq(schedules.isActive, true)));

    for (const sched of activeSchedules) {
      // Format current time into schedule's specific timezone (always 24-hour HH:MM)
      const timeStr = getCurrentTimeHHMM(sched.timezone || "UTC");
      const schedTime = normalizeTimeHHMM(sched.time);

      // Check if it's time to execute this schedule
      if (timeStr === schedTime) {
        // Check if this schedule has already been executed in this minute
        // If lastExecuted is within the last 60 seconds, skip (already ran)
        const lastExec = sched.lastExecuted ? new Date(sched.lastExecuted) : null;
        const timeSinceLastExec = lastExec ? now - lastExec : Infinity;

        if (timeSinceLastExec < 60000) {
          // Already executed within the last minute, skip
          continue;
        }

        // Get appliance record
        const appRecord = await runWithRetry(() =>
          db.select().from(appliances).where(eq(appliances.id, sched.applianceId)).limit(1)
        );

        if (appRecord[0]) {
          const targetStatus = sched.action === "ON";

          // Tank-Full Safety Guard: block scheduled ON for fill pump when tank is full
          if (sched.applianceId === "tv" && targetStatus && await isFillPumpTurnOnBlocked(true)) {
            await addActivityLog(`[SAFETY] Scheduled ON for Overhead Fill Pump blocked — Tank is FULL (${FILL_PUMP_SHUTOFF_LEVEL}%+).`);
            continue;
          }

          // ALWAYS execute the scheduled action (regardless of current status)
          // This ensures the device reaches the desired state
          await runWithRetry(() =>
            db.update(appliances).set({
              status: targetStatus,
              updatedAt: new Date()
            }).where(eq(appliances.id, sched.applianceId))
          );

          // Update the lastExecuted timestamp to prevent re-execution
          await runWithRetry(() =>
            db.update(schedules).set({
              lastExecuted: new Date()
            }).where(eq(schedules.id, sched.id))
          );

          const name = appRecord[0].name || sched.applianceId;
          const actionText = targetStatus ? "ON" : "OFF";
          await addActivityLog(`[SCHEDULED] ${name} turned ${actionText} at ${timeStr} (${sched.timezone})`);

          // Broadcast to all Socket.IO clients
          io.emit("appliance-updated", {
            id: sched.applianceId,
            status: targetStatus
          });
        }
      }
    }
  } catch (error) {
    console.error("Error evaluating background schedules:", error);
  }
}

// Self-healing database initializer to automatically sync appliance names and tables
async function initializeDatabase() {
  try {
    console.log("[DB INIT]: Running database self-healing checks...");

    // 1. Ensure sensors row exists
    const sensorRows = await runWithRetry(() => db.select().from(sensors).where(eq(sensors.id, 1)).limit(1));
    if (sensorRows.length === 0) {
      console.log("[DB INIT]: Seeding default sensors row...");
      await runWithRetry(() => db.insert(sensors).values({
        id: 1,
        fireStatus: false,
        gasStatus: false,
        firePumpStatus: false
      }));
    }

    // 2. Ensure water tank row exists
    const waterRows = await runWithRetry(() => db.select().from(waterTank).where(eq(waterTank.id, 1)).limit(1));
    if (waterRows.length === 0) {
      console.log("[DB INIT]: Seeding default water tank row...");
      await runWithRetry(() => db.insert(waterTank).values({
        id: 1,
        percentage: 50,
        pumpStatus: false
      }));
    }

    // 3. Seed / Update standard 6 appliances (4 manual + 2 automated)
    const defaultApps = [{
      id: "light",
      name: "Light Bulb 1"
    }, {
      id: "fan",
      name: "Light Bulb 2"
    }, {
      id: "bulb3",
      name: "Light Bulb 3"
    }, {
      id: "bulb4",
      name: "Light Bulb 4"
    }, {
      id: "tv",
      name: "Overhead Fill Pump"
    }, {
      id: "socket",
      name: "Fire Extinguisher Pump"
    }];
    for (const app of defaultApps) {
      const existing = await runWithRetry(() => db.select().from(appliances).where(eq(appliances.id, app.id)).limit(1));
      if (existing.length === 0) {
        console.log(`[DB INIT]: Seeding appliance ${app.id}...`);
        await runWithRetry(() => db.insert(appliances).values({
          id: app.id,
          name: app.name,
          status: false
        }));
      } else {
        // Update names to match the new 4-relay specification
        if (existing[0].name !== app.name) {
          console.log(`[DB INIT]: Renaming appliance ${app.id} to ${app.name}...`);
          await runWithRetry(() => db.update(appliances).set({
            name: app.name
          }).where(eq(appliances.id, app.id)));
        }
      }
    }
    console.log("[DB INIT]: Self-healing database checks completed successfully!");
  } catch (error) {
    console.error("[DB INIT]: Error during database initialization:", error);
  }
}

// Evaluate schedules every 60 seconds
setInterval(checkSchedules, 60000);

// START THE SERVER IMMEDIATELY - even before DB is ready.
// The API routes are already registered, and runWithRetry() will retry DB queries.
// This ensures Render's health check succeeds and users get immediate responses.
httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`[SERVER]: Server is running at http://0.0.0.0:${PORT}`);
  // Check schedules immediately on boot
  checkSchedules();
});

// Then serve static frontend and initialize DB in the background
startStaticServing().then(async () => {
  try {
    // Step 1: Auto-create database tables (if they don't exist)
    // This is critical for Render deployments where PostgreSQL starts empty
    console.log("[STARTUP]: Starting database initialization...");
    await createTables();

    // Step 2: Initialize and heal database records (seed default data)
    await initializeDatabase();
    console.log("[STARTUP]: Database fully initialized!");
  } catch (error) {
    console.error("[STARTUP]: Database initialization failed:", error?.message);
    console.error("[STARTUP]: The server is still running. DB queries will retry automatically.");
  }
}).catch(err => {
  console.error("[STARTUP]: Static serving setup failed:", err?.message);
  // Server is already listening, so this is not fatal
});
