import { pgTable, serial, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  uid: text("uid").notNull().unique(),
  // Internal user id, generated at registration time (replaces old Firebase UID)
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name"),
  isAuthorized: boolean("is_authorized").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow()
});
export const appliances = pgTable("appliances", {
  id: text("id").primaryKey(),
  // 'light', 'fan', 'tv', 'socket'
  name: text("name").notNull(),
  // 'Light', 'Fan', 'TV', 'Smart Socket'
  status: boolean("status").notNull().default(false),
  // true = ON, false = OFF
  updatedAt: timestamp("updated_at").defaultNow()
});
export const sensors = pgTable("sensors", {
  id: integer("id").primaryKey().default(1),
  // Single row for system sensors state
  fireStatus: boolean("fire_status").notNull().default(false),
  // true = fire detected
  gasStatus: boolean("gas_status").notNull().default(false),
  // true = gas leakage detected
  firePumpStatus: boolean("fire_pump_status").notNull().default(false),
  // true = fire suppression pump ON
  fireSensorAvailable: boolean("fire_sensor_available").notNull().default(true),
  // true = physical sensor is plugged in / active
  gasSensorAvailable: boolean("gas_sensor_available").notNull().default(true),
  // true = physical sensor is plugged in / active
  sonicSensorAvailable: boolean("sonic_sensor_available").notNull().default(true),
  // true = physical ultrasonic sensor is plugged in / active
  updatedAt: timestamp("updated_at").defaultNow()
});
export const waterTank = pgTable("water_tank", {
  id: integer("id").primaryKey().default(1),
  // Single row for tank state
  percentage: integer("percentage").notNull().default(0),
  // 0 to 100
  pumpStatus: boolean("pump_status").notNull().default(false),
  // true = pump ON, false = OFF
  tankHeight: integer("tank_height").notNull().default(100),
  // Calibrated total height of tank in cm (2 to 400 cm)
  updatedAt: timestamp("updated_at").defaultNow()
});
export const activityLogs = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  event: text("event").notNull(),
  createdAt: timestamp("created_at").defaultNow()
});
export const schedules = pgTable("schedules", {
  id: serial("id").primaryKey(),
  applianceId: text("appliance_id").notNull(),
  // 'light', 'fan', 'tv', 'socket'
  action: text("action").notNull(),
  // 'ON' or 'OFF'
  time: text("time").notNull(),
  // 'HH:MM' (24-hour format)
  timezone: text("timezone").notNull().default("UTC"),
  // e.g. 'America/Los_Angeles'
  isActive: boolean("is_active").notNull().default(true),
  lastExecuted: timestamp("last_executed"),
  // Tracks when schedule was last executed to prevent duplicate execution
  createdAt: timestamp("created_at").defaultNow()
});
