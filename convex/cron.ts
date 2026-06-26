// convex/crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// ตั้งค่าให้รันฟังก์ชัน processDailySummaries ทุกวัน
crons.daily(
  "process and cleanup posture logs", // ชื่อของ Job
  { hourUTC: 18, minuteUTC: 0 },      // เวลา (อิงตาม UTC)
  internal.tasks.processDailySummaries
);

export default crons;