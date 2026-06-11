import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  postureLogs: defineTable({
    userId: v.string(),     // ผูกกับ Clerk User ID
    timestamp: v.number(),  // Unix Timestamp
    pitch: v.number(),
    state: v.number(),      // 0=Good, 1=Warn, 2=Alert
  }).index("by_user", ["userId"]).index("by_user_time", ["userId", "timestamp"]),
  
  deviceSettings: defineTable({
    userId: v.string(),
    warnThreshold: v.number(),
    alertThreshold: v.number(),
  }).index("by_userId", ["userId"]),
});