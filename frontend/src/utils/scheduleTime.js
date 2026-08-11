// Shared helpers for schedule time display (12h) and storage (24h)

export const formatScheduleTime = time24 => {
  if (!time24 || typeof time24 !== "string") return time24;
  const parsed = parseTime24To12(time24);
  return `${parsed.hour12}:${parsed.minute} ${parsed.period}`;
};

export const parseTime24To12 = time24 => {
  const [hourStr, minuteStr = "00"] = time24.split(":");
  const hour = parseInt(hourStr, 10);
  if (Number.isNaN(hour)) {
    return { hour12: 12, minute: "00", period: "AM" };
  }
  return {
    hour12: hour % 12 || 12,
    minute: String(minuteStr).padStart(2, "0").slice(0, 2),
    period: hour >= 12 ? "PM" : "AM"
  };
};

export const convert12ToTime24 = (hour12, minute, period) => {
  let hour = parseInt(hour12, 10);
  const min = String(minute).padStart(2, "0").slice(0, 2);
  if (Number.isNaN(hour) || hour < 1 || hour > 12) hour = 12;

  if (period === "AM") {
    if (hour === 12) hour = 0;
  } else if (hour !== 12) {
    hour += 12;
  }

  return `${String(hour).padStart(2, "0")}:${min}`;
};

export const normalizeTime24 = time24 => {
  if (!time24 || typeof time24 !== "string") return time24;
  const [hourStr, minuteStr = "00"] = time24.split(":");
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr, 10);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return time24;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};
