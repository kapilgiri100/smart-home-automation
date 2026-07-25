import jwt from "jsonwebtoken";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";

const JWT_SECRET = process.env.JWT_SECRET || "dev-only-insecure-secret-change-me";

export const requireAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized: Missing token" });
  }

  const token = authHeader.split("Bearer ")[1];

  // Bypass for Demo/Developer tokens to bypass pop-up blocks in dynamic iframe environments
  if (token.startsWith("demo-token-")) {
    const demoUid = token.replace("demo-token-", "");
    const email = "demo-user@example.com";
    const name = "Demo Investigator";

    try {
      // Ensure the demo user exists and is authorized in PostgreSQL
      await db.insert(users)
        .values({
          uid: demoUid,
          email: email,
          passwordHash: "", // demo accounts never log in with a password
          displayName: name,
          isAuthorized: true, // Automatically authorized so users don't get stuck on the passcode page
        })
        .onConflictDoNothing({
          target: users.uid,
        });

      req.user = {
        uid: demoUid,
        email: email,
        name: name,
      };

      return next();
    } catch (dbError) {
      console.error("Error inserting demo user into Postgres:", dbError);
      return res.status(500).json({ error: "Failed to initialize demo session" });
    }
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    req.user = {
      uid: decoded.uid,
      email: decoded.email,
      name: decoded.name,
    };

    next();
  } catch (error) {
    console.error("Error verifying auth token:", error.message);
    return res.status(401).json({ error: "Unauthorized: Invalid or expired token" });
  }
};

export const requireAuthorized = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const dbUser = await db.select().from(users).where(eq(users.uid, req.user.uid)).limit(1);
    if (!dbUser[0] || !dbUser[0].isAuthorized) {
      return res.status(403).json({ error: "Forbidden: Account not authorized" });
    }
    next();
  } catch (error) {
    console.error("Error in requireAuthorized:", error);
    return res.status(500).json({ error: "Internal server error during authorization check" });
  }
};
