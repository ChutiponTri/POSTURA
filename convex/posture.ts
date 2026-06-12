// convex/posture.ts
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ── Save a batch of logs from BLE sync ────────────────────────────────────────
export const saveLogsBatch = mutation({
  args: {
    userId: v.string(),
    logs: v.array(
      v.object({
        timestamp: v.number(),
        pitch: v.number(),
        state: v.number(),
      })
    ),
  },
  handler: async (ctx, { userId, logs }) => {
    // Deduplicate: only insert if timestamp not already stored for this user
    const existing = await ctx.db
      .query("postureLogs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const existingTs = new Set(existing.map((e) => e.timestamp));

    const toInsert = logs.filter((l) => !existingTs.has(l.timestamp));

    for (const log of toInsert) {
      await ctx.db.insert("postureLogs", {
        userId,
        timestamp: log.timestamp,
        pitch: log.pitch,
        state: log.state,
      });
    }

    return { inserted: toInsert.length, skipped: logs.length - toInsert.length };
  },
});

// ── Get logs for last N days ───────────────────────────────────────────────────
export const getLogs = query({
  args: {
    userId: v.string(),
    limitDays: v.optional(v.number()),
  },
  handler: async (ctx, { userId, limitDays = 7 }) => {
    const cutoff = Math.floor(Date.now() / 1000) - limitDays * 86400;

    const logs = await ctx.db
      .query("postureLogs")
      .withIndex("by_user_time", (q) =>
        q.eq("userId", userId).gte("timestamp", cutoff)
      )
      .order("asc")
      .collect();

    return logs.map((l) => ({
      timestamp: l.timestamp,
      pitch: l.pitch,
      state: l.state,
    }));
  },
});

// ── Delete all logs for user (optional admin use) ─────────────────────────────
export const clearLogs = mutation({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const logs = await ctx.db
      .query("postureLogs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const log of logs) {
      await ctx.db.delete(log._id);
    }
    return { deleted: logs.length };
  },
});