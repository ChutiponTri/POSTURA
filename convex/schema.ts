// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  postureLogs: defineTable({
    userId: v.string(),
    timestamp: v.number(),  // Unix seconds
    pitch: v.number(),      // degrees
    state: v.number(),      // 1=warn, 2=alert
  })
    .index("by_user", ["userId"])
    .index("by_user_time", ["userId", "timestamp"]),
});