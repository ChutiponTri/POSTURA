// convex/tasks.ts
import { internalMutation } from "./_generated/server";

export const processDailySummaries = internalMutation({
  args: {},
  handler: async (ctx) => {
    // 1. คำนวณขอบเขตเวลาของ "เมื่อวาน"
    const now = new Date();
    // เซ็ตเวลาเป็นเที่ยงคืนของวันนี้ แล้วถอยไป 1 วัน
    const todayStartTs = new Date(now.setHours(0, 0, 0, 0)).getTime() / 1000;
    const yesterdayStartTs = todayStartTs - 86400; // ลบไป 24 ชั่วโมง
    
    // จัด format วันที่ เช่น "2026-06-26"
    const dateString = new Date(yesterdayStartTs * 1000).toISOString().split("T")[0];

    // 2. ดึงข้อมูล Raw Logs ของ "เมื่อวาน" ของผู้ใช้ทุกคน
    const yesterdaysLogs = await ctx.db
      .query("postureLogs")
      .withIndex("by_timestamp", (q) => 
        q.gte("timestamp", yesterdayStartTs).lt("timestamp", todayStartTs)
      )
      .collect();

    // 3. จัดกลุ่มข้อมูลตาม userId
    const logsByUser = new Map<string, typeof yesterdaysLogs>();
    for (const log of yesterdaysLogs) {
      if (!logsByUser.has(log.userId)) {
        logsByUser.set(log.userId, []);
      }
      logsByUser.get(log.userId)!.push(log);
    }

    // 4. คำนวณสรุปผลของแต่ละคน แล้วบันทึกลงตาราง dailyPostureSummaries
    for (const [userId, logs] of logsByUser.entries()) {
      const totalSessions = logs.length;
      const badLogs = logs.filter((l) => l.state > 0);
      const alertLogs = logs.filter((l) => l.state === 2);
      
      const badPostureTime = Math.round((badLogs.length * 2) / 60); // หน่วยนาที (สมมติ log ทุก 2 วิ)
      const alertCount = alertLogs.length;
      
      // คำนวณ Score
      const avgScore = totalSessions === 0 
        ? 100 
        : Math.max(0, Math.round(100 - (badLogs.length / totalSessions) * 100 - alertCount * 2));

      await ctx.db.insert("dailyPostureSummaries", {
        userId,
        dateString,
        totalSessions,
        badPostureTime,
        alertCount,
        avgScore,
      });
    }

    // ---------------------------------------------------------
    // 5. ลบ Raw Data ที่เก่ากว่า 7 วันทิ้ง เพื่อคืนพื้นที่ Database
    // ---------------------------------------------------------
    const sevenDaysAgoTs = todayStartTs - (7 * 86400);
    
    const oldLogs = await ctx.db
      .query("postureLogs")
      .withIndex("by_timestamp", (q) => q.lt("timestamp", sevenDaysAgoTs))
      .take(1000); // ดึงมาลบทิ้งทีละ 1000 records เพื่อไม่ให้ Mutation หนักเกินไป

    for (const log of oldLogs) {
      await ctx.db.delete(log._id);
    }
  },
});