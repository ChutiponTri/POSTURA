// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  postureLogs: defineTable({
    userId: v.string(),
    timestamp: v.number(),  
    pitch: v.number(),      
    state: v.number(),      
  })
    .index("by_user", ["userId"])
    .index("by_user_time", ["userId", "timestamp"])
    // 👇 เพิ่ม Index นี้ เพื่อให้ Cron Job ดึงข้อมูลตามเวลาได้รวดเร็ว
    .index("by_timestamp", ["timestamp"]), 

  dailyPostureSummaries: defineTable({
    userId: v.string(),
    dateString: v.string(), 
    totalSessions: v.number(),
    badPostureTime: v.number(), 
    alertCount: v.number(),
    avgScore: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_date", ["userId", "dateString"]),
});