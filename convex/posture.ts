import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// ดึงข้อมูล Logs ของผู้ใช้
export const getLogs = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("postureLogs")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(100); // ดึง 100 รายการล่าสุด
  },
});

// บันทึกข้อมูลที่ Sync มาจาก Bluetooth แบบ Batch
export const saveLogsBatch = mutation({
  args: {
    userId: v.string(),
    logs: v.array(v.object({
      timestamp: v.number(),
      pitch: v.number(),
      state: v.number(),
    }))
  },
  handler: async (ctx, args) => {
    for (const log of args.logs) {
      await ctx.db.insert("postureLogs", {
        userId: args.userId,
        timestamp: log.timestamp,
        pitch: log.pitch,
        state: log.state,
      });
    }
  },
});

// บันทึกการตั้งค่า
export const saveSettings = mutation({
  args: { userId: v.string(), warnThreshold: v.number(), alertThreshold: v.number() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("deviceSettings")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { warnThreshold: args.warnThreshold, alertThreshold: args.alertThreshold });
    } else {
      await ctx.db.insert("deviceSettings", {
        userId: args.userId,
        warnThreshold: args.warnThreshold,
        alertThreshold: args.alertThreshold,
      });
    }
  },
});