// Backend/src/routes/vehicle.routes.ts
// Add the daily-snapshot route to the existing vehicle routes.
// PATCH: Add these two lines to your EXISTING vehicle.routes.ts file.
//
// ─── DIFF — add these imports and route ───────────────────────────────────────
//
// 1. At the top of vehicle.routes.ts, add:
//    import { getDailySnapshot } from "../controllers/dailyCounts.controller";
//
// 2. Before the last `export default router;` line, add:
//    router.get("/daily-snapshot", authenticate, getDailySnapshot);
//
// ─────────────────────────────────────────────────────────────────────────────
//
// Full file shown below for clarity (replace your existing vehicle.routes.ts):

import { Router } from "express";
import {
  getStats,
  getInsideVehicles,
  getEvents,
  getCountsByDateRange,
  exportEvents,
} from "../controllers/vehicle.controller";
import { getDailySnapshot } from "../controllers/dailyCounts.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();

router.use(authenticate);

router.get("/stats", getStats);
router.get("/inside", getInsideVehicles);
router.get("/events", getEvents);
router.get("/counts", getCountsByDateRange);
router.get("/export", exportEvents);
router.get("/daily-snapshot", getDailySnapshot);   // ← NEW

export default router;