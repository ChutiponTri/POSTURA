"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useUser, UserButton } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import {
  Activity, Bluetooth, BluetoothConnected, Settings, BarChart2,
  Home, RotateCcw, BatteryMedium, TrendingUp, TrendingDown,
  AlertTriangle, CheckCircle, Zap, Clock, Calendar, ChevronRight,
  Award, Target, Info
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  AreaChart, Area, LineChart, Line, RadialBarChart, RadialBar,
  PieChart, Pie, CartesianGrid, ReferenceLine
} from "recharts";
import { api } from "../../convex/_generated/api";

// ─── Types ────────────────────────────────────────────────────────────────────
interface PostureLog {
  timestamp: number;
  pitch: number;
  state: number; // 1=Warn, 2=Alert
}

interface ParsedSession {
  startTs: number;
  endTs: number;
  maxAngle: number;
  avgAngle: number;
  alertCount: number;
  warnCount: number;
}

interface Grade {
  letter: string;
  color: string;
  label: string;
};

// ─── BLE Config ───────────────────────────────────────────────────────────────
const BLE_SERVICE_UUID  = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const BLE_CHAR_RX_UUID  = "beb5483e-36e1-4688-b7f5-ea07361b26a8";
const BLE_CHAR_TX_UUID  = "1cce2a48-18e4-4d89-9a67-4fb7e0340356";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parseCSVPayload(payload: string): PostureLog[] {
  // Format: "timestamp,pitch,state|timestamp,pitch,state|..."
  return payload
    .split("|")
    .filter(Boolean)
    .map((row) => {
      const [ts, pitch, state] = row.split(",").map(Number);
      return { timestamp: ts, pitch, state };
    })
    .filter((l) => !isNaN(l.timestamp));
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function scoreToGrade(score: number): { letter: string; color: string; label: string } {
  if (score >= 90) return { letter: "A", color: "#10b981", label: "Excellent" };
  if (score >= 75) return { letter: "B", color: "#3b82f6", label: "Good" };
  if (score >= 60) return { letter: "C", color: "#f59e0b", label: "Fair" };
  if (score >= 40) return { letter: "D", color: "#f97316", label: "Poor" };
  return { letter: "F", color: "#ef4444", label: "Critical" };
}

// ─── Improved 3D Spine Visualizer with Dynamic Scaling (Head always inside frame) ─────────
// FIX VISUALIZE: Implement dynamic torso shrinking when bending low to prevent head overflow.
function SpineVisualizer({ angle }: { angle: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // ตั้งค่าความละเอียดสูง (HiDPI/Retina) - รักษากรอบเดิม 200x240
    const scale = window.devicePixelRatio || 1;
    const width = 200; // คง format เดิม
    const height = 240; // คง format เดิม
    canvas.width = width * scale;
    canvas.height = height * scale;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(scale, scale);

    const W = width;
    const H = height;
    ctx.clearRect(0, 0, W, H);

    // ค่า config สำหรับการวาด
    const rad = (angle * Math.PI) / 180;
    const cx = W / 2;

    // --- Dynamic Color based on Angle ---
    let colorMain = "#10b981"; // Good (Green)
    let colorDark = "#059669";
    let colorLight = "#a7f3d0";
    if (angle > 25) { // Alert
      colorMain = "#ef4444";
      colorDark = "#b91c1c";
      colorLight = "#fca5a5";
    } else if (angle > 15) { // Warning
      colorMain = "#f59e0b";
      colorDark = "#d97706";
      colorLight = "#fde68a";
    }

    // --- Static Geometry Definitions ---
    const hipsBaseY = H - 35; // Hips/Pivot point at the bottom, stable.
    const neckLength = 10;
    const headRadius = 16;
    
    // FIX: Dynamic scaling factor to shrink upper body when bending low.
    // Base length logic to fit within the 200x240 frame (Pivot at y=205).
    const maxUpperBodyLength = 120; // Total length when upright ≈ 120
    
    // --- FIX: Dynamic Shrink Logic ---
    // available horizontal space from pivot (cx=100) to edge is ~100px.
    // available vertical space down from pivot is ~35px.
    // The previous implementation used fixed torso=90. Total length was ~116px.
    // At high angles, sin(rad)*L > 100, cos(rad)*L > 35. Overflows occur.
    
    // We base torso height on angle to "crunch" the spine as it gets horizontal.
    let defaultTorsoHeight = 90;
    let dynamicTorsoHeight = defaultTorsoHeight;

    // If angle is significant slouch (>= 30 degrees), start shrinking to fit frame side boundary.
    if (angle >= 30) {
      // Calculate reduction. At 90 degrees flat, sin(rad)=1.
      // We need Total length (torso + neck + headRadius*2) to fit ~90px from center cx=100.
      // So Total Length should be max ~90px. Neck+HeadR*2 ≈ 42. So torso should be ~48.
      // That's a ~42px reduction from 90. We use a milder linear shrink for smooth effect.
      
      const reductionThreshold = 30; // Threshold angle to start shrinking
      const shrinkFactor = 0.5;      // px to shrink per degree beyond threshold.
      const reduction = (angle - reductionThreshold) * shrinkFactor;
      
      // Limit torso from being too small, but shrink enough to fit frame side (W=200).
      dynamicTorsoHeight = defaultTorsoHeight - Math.min(35, reduction);
    }
    
    // Safety check: Ensure even when bent flat, cos(rad)*L doesn't go below canvas y=240.
    // Pivot at y=205. Available space down = 35px. Need to shrink more if cos is significant.
    // But with shoulders pointing "up" in object space, bending is forward slouch.
    // The head moves to larger x and *smaller* y (higher up) relative to shoulders.
    // Neck base position: cx + torsoHeight*sin(rad), hipsBaseY - torsoHeight*cos(rad).
    // Let's ensure hipsBaseY - L*cos(rad) > 0 and cx + L*sin(rad) < W.
    // At W=200 cx=100, horizontal space 100px. L should be < 100.
    // current L = dynamicTorso(say 55) + neck(10) + headRadius(16)*2 ≈ 97px. Tight, but fits!

    // 1. Draw static Hip/Legs base (does not rotate)
    ctx.beginPath();
    ctx.ellipse(cx, hipsBaseY + 12, 28, 7, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.06)"; // Basic floor shadow
    ctx.fill();

    const baseGrad = ctx.createLinearGradient(cx - 20, hipsBaseY, cx + 20, hipsBaseY);
    baseGrad.addColorStop(0, "#e2e8f0"); // slate-200
    baseGrad.addColorStop(0.5, "#cbd5e1"); // slate-300
    baseGrad.addColorStop(1, "#e2e8f0");
    
    // Hip disc
    ctx.beginPath();
    ctx.ellipse(cx, hipsBaseY, 24, 9, 0, 0, Math.PI * 2);
    ctx.fillStyle = baseGrad;
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.1)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Leg stumps
    ctx.fillStyle = baseGrad;
    ctx.fillRect(cx - 16, hipsBaseY, 12, 20);
    ctx.fillRect(cx + 4, hipsBaseY, 12, 20);

    // 2. Setup Rotation around Hips ( physiologique pivot )
    ctx.save();
    ctx.translate(cx, hipsBaseY); // Move pivot to hips
    ctx.rotate(rad);              // Rotate the whole upper body
    ctx.translate(-cx, -hipsBaseY); // Move canvas back

    // 3. Draw Rotating Upper Body (Pseudo-3D Torso)
    // FIX: Use DYNAMIC torso height
    const shouldersY = hipsBaseY - dynamicTorsoHeight;
    const waistWidth = 24;
    const shoulderWidth = 34;

    // Body silhouette (trapezoid-mannequin style) with curved sides
    const bodyGrad = ctx.createLinearGradient(cx - shoulderWidth / 2, shouldersY, cx + shoulderWidth / 2, shouldersY);
    bodyGrad.addColorStop(0, colorDark);
    bodyGrad.addColorStop(0.3, colorMain); // Highlight in center-left for dimension
    bodyGrad.addColorStop(1, colorLight);

    ctx.beginPath();
    ctx.moveTo(cx - waistWidth / 2, hipsBaseY); // Bottom Waist Left
    // Curve sides slightly to look more organic
    ctx.bezierCurveTo(cx - waistWidth / 2, hipsBaseY - 10, cx - shoulderWidth / 2, shouldersY + 10, cx - shoulderWidth / 2, shouldersY); // Left side
    ctx.lineTo(cx + shoulderWidth / 2, shouldersY); // Shoulders line
    ctx.bezierCurveTo(cx + shoulderWidth / 2, shouldersY + 10, cx + waistWidth / 2, hipsBaseY - 10, cx + waistWidth / 2, hipsBaseY); // Right side
    ctx.closePath();
    ctx.fillStyle = bodyGrad;
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // 4. Draw Spine Vertebrae discs for visual depth
    const vertebrae = 7;
    for (let i = 0; i < vertebrae; i++) {
      // FIX: Use DYNAMIC torso height for spine positioning
      const y = hipsBaseY - (i * (dynamicTorsoHeight - 8)) / (vertebrae - 1) - 4;
      const discW = 7 - i * 0.4; // Discs get slightly smaller
      const discH = 2.5;

      // Color discs dynamically based on local angle logic
      const discGrad = ctx.createRadialGradient(cx - 1.5, y - 1, 1, cx, y, discW);
      discGrad.addColorStop(0, angle > 10 ? colorLight : "white");
      discGrad.addColorStop(1, colorMain);

      ctx.beginPath();
      ctx.ellipse(cx, y, discW, discH, 0, 0, Math.PI * 2);
      ctx.fillStyle = discGrad;
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.15)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // 5. Draw Neck & Head (Positioned relative to dynamic shoulders)
    const neckTopY = shouldersY - neckLength;
    const headX = cx;
    const headY = neckTopY - headRadius - 2;

    // Neck
    ctx.fillStyle = "#cbd5e1"; // slate-300
    ctx.fillRect(cx - 5, shouldersY, 10, neckLength);
    ctx.strokeStyle = "rgba(0,0,0,0.1)";
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - 5, shouldersY, 10, neckLength);

    // Head (spherical gradient)
    const headGrad = ctx.createRadialGradient(headX - headRadius * 0.3, headY - headRadius * 0.3, 2, headX, headY, headRadius);
    headGrad.addColorStop(0, colorLight);
    headGrad.addColorStop(0.7, colorMain);
    headGrad.addColorStop(1, colorDark);

    ctx.beginPath();
    ctx.arc(headX, headY, headRadius, 0, Math.PI * 2);
    ctx.fillStyle = headGrad;
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Eye (orient profile view, pointing right/forward)
    ctx.fillStyle = "#1e293b"; // slate-800
    ctx.beginPath();
    ctx.arc(headX + headRadius * 0.45, headY - headRadius * 0.15, 2.8, 0, Math.PI * 2);
    ctx.fill();

    // Hair/Shading (simple profile arc)
    ctx.strokeStyle = colorDark;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(headX, headY, headRadius * 0.8, -Math.PI / 2 - Math.PI / 4, Math.PI / 2, true);
    ctx.stroke();

    ctx.restore(); // Restore Rotation

    // ==========================================
    // 3. UI Overlay (ตัวเลของศา)
    // ==========================================
    
    // วาดกรอบสี่เหลี่ยมโค้งมนเล็กๆ ด้านบนหัว
    const labelX = cx;
    const labelY = 25; // Clearly placed at top-center of the canvas, fixed position.
    const labelW = 54;
    const labelH = 24;

    ctx.beginPath();
    ctx.roundRect(labelX - labelW/2, labelY - labelH/2, labelW, labelH, 6);
    ctx.fillStyle = "rgba(255,255,255,0.92)"; // Nearly opaque white
    ctx.fill();
    ctx.strokeStyle = colorMain;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // เขียนองศา
    // Use slightly darker colors for better contrast
    ctx.fillStyle = angle > 25 ? "#b91c1c" : angle > 15 ? "#b45309" : "#047857";
    ctx.font = "bold 16px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${Math.round(angle)}°`, labelX, labelY + 1);

  }, [angle]);

  // คง format เดิมของ JSX
  return (
    <div className="flex flex-col items-center justify-center p-2 bg-slate-50/50 rounded-2xl border border-slate-100 shadow-inner">
      <canvas
        ref={canvasRef}
        // Fixed display dimensions to fit 200x240 frame
        className="mx-auto"
        style={{ width: "200px", height: "240px", filter: "drop-shadow(0 6px 12px rgba(101,93,221,0.1))" }}
      />
      <div className="flex gap-4 mt-1 text-[11px] font-medium text-slate-500 bg-white px-3 py-1 rounded-full shadow-sm border border-slate-100">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-inner" />Good</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-inner" />Warn</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-inner" />Alert</span>
      </div>
    </div>
  );
}

// ─── PostureScore Ring ────────────────────────────────────────────────────────
function PostureRing({ score, grade }: { score: number | null; grade: ReturnType<typeof scoreToGrade> }) {
  const r = 44;
  const circ = 2 * Math.PI * r;
  const dash = ((score ?? 0) / 100) * circ;

  return (
    <div className="relative inline-flex items-center justify-center w-28 h-28">
      <svg viewBox="0 0 112 112" className="absolute inset-0 w-full h-full -rotate-90">
        <circle cx="56" cy="56" r={r} fill="none" stroke="#f1f5f9" strokeWidth="8" />
        <circle
          cx="56" cy="56" r={r} fill="none"
          stroke={grade.color} strokeWidth="8"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 1s ease" }}
        />
      </svg>
      <div className="relative text-center">
        {score === null
          ? <>
              <div className="text-xl font-bold" style={{ color: "#cbd5e1" }}>—</div>
              <div className="text-[9px] font-semibold" style={{ color: "#cbd5e1" }}>Sync first</div>
            </>
          : <>
              <div className="text-2xl font-bold" style={{ color: grade.color }}>{score}</div>
              <div className="text-[10px] text-slate-400 font-semibold">{grade.label}</div>
            </>
        }
      </div>
    </div>
  );
}

const calculatePostureMetrics = (logs: PostureLog[]) => {
  const totalRecords = logs.length;
  const badLogs = logs.filter(log => log.state > 0);
  const alertLogs = logs.filter(log => log.state === 2);

  const score =
    totalRecords === 0
      ? 100
      : Math.max(
          0,
          Math.round(
            100 -
            (badLogs.length / totalRecords) * 100 -
            alertLogs.length * 2
          )
        );

  return {
    score,
    grade: scoreToGrade(score),
  };
};

// ─── Main Component ───────────────────────────────────────────────────────────
export default function PosturaApp() {
  const { user } = useUser();

  const [activeTab, setActiveTab] = useState("dashboard");

  // BLE State
  const [isConnected, setIsConnected] = useState(false);
  const [connStatus, setConnStatus] = useState<"idle" | "connecting" | "live" | "pulling" | "error">("idle");
  const [bleDevice, setBleDevice] = useState<BluetoothDevice | null>(null);
  const [rxCharRef, setRxCharRef] = useState<BluetoothRemoteGATTCharacteristic | null>(null);
  const [txCharRef, setTxCharRef] = useState<BluetoothRemoteGATTCharacteristic | null>(null);

  // live angle from real-time notifications (state 0 = good posture too, via periodic ping from firmware)
  const pendingPayloadRef = useRef("");

  // Device Settings
  const [warnThresh, setWarnThresh] = useState(15);
  const [alertThresh, setAlertThresh] = useState(25);

  // Live & Historical Data
  const [liveAngle, setLiveAngle] = useState(0);
  const [sessionLogs, setSessionLogs] = useState<PostureLog[]>([]);
  const [hasSynced, setHasSynced] = useState(false);
  const [syncedRecordCount, setSyncedRecordCount] = useState(0);

  // Convex
  const saveLogs = useMutation(api.posture.saveLogsBatch);

  // 1. หาเวลาเริ่มต้นของวันนี้
  const todayStartTs = new Date().setHours(0, 0, 0, 0) / 1000;

  // 2. ดึง Raw Logs เฉพาะวันนี้ (อัปเดตเมื่อมี Live event)
  const todayHistoricalLogs = useQuery(
    api.posture.getTodayLogs,
    user ? { userId: user.id, startTs: todayStartTs } : "skip"
  );

  // 3. ดึง Summary 7 วัน (จะอัปเดตแค่วันละครั้ง ตาม Cron Job หรือตอนจบวัน)
  const weeklySummary = useQuery(
    api.posture.getWeeklySummary,
    user ? { userId: user.id } : "skip"
  );

  // ── Derived metrics ──────────────────────────────────────────────────────────
  
  // 1. จัดการข้อมูลเฉพาะของ "วันนี้"
  const todayLogs = [...(todayHistoricalLogs ?? []), ...sessionLogs].sort((a, b) => a.timestamp - b.timestamp);
  const uniqueTodayLogs = Array.from(new Map(todayLogs.map(item => [item.timestamp, item])).values());

  const totalRecords = uniqueTodayLogs.length;
  const badLogs = uniqueTodayLogs.filter((l) => l.state > 0);
  const badTimeMin = Math.round((badLogs.length * 2) / 60);
  const alertLogs = uniqueTodayLogs.filter((l) => l.state === 2);

  const [postureScore, setPostureScore] = useState<number>(100);
  const [grade, setGrade] = useState<Grade>({ letter: "A", color: "#10b981", label: "Excellent" });

  // Hourly bar data for today
  const hourlyData = Array.from({ length: 24 }, (_, h) => {
    const hLogs = uniqueTodayLogs.filter((l) => {
      const d = new Date(l.timestamp * 1000);
      return d.getHours() === h;
    });
    const bad = hLogs.filter((l) => l.state > 0).length;
    const total = hLogs.length;
    return {
      hour: `${h}:00`,
      bad,
      good: total - bad,
      score: total === 0 ? null : Math.round(((total - bad) / total) * 100),
    };
  }).filter((d) => d.good + d.bad > 0);

  // 2. จัดการข้อมูล "ย้อนหลัง 7 วัน" (ดึงจาก DB 6 วัน + รวมข้อมูลสดวันนี้ 1 วัน)
  const weeklyData = Array.from({ length: 7 }, (_, i) => {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - (6 - i));
    const dateString = targetDate.toISOString().split("T")[0];
    const label = targetDate.toLocaleDateString("en", { weekday: "short" });

    if (i === 6) {
      // สำหรับ "วันนี้" ให้ใช้ข้อมูล Real-time
      return { day: label, score: totalRecords === 0 ? null : postureScore, sessions: totalRecords };
    } else {
      // สำหรับ "อดีต" ให้หาจากค่าสรุปใน DB
      const pastSummary = (weeklySummary ?? []).find(s => s.dateString === dateString);
      return { day: label, score: pastSummary ? pastSummary.avgScore : null, sessions: pastSummary ? pastSummary.totalSessions : 0 };
    }
  });

  const worstHours = [...hourlyData]
    .filter((d) => d.score !== null)
    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
    .slice(0, 3);

  const streakDays = weeklyData.filter((d) => d.score !== null && d.score >= 70).length;
  const goodDaysCount = weeklyData.filter((d) => d.score !== null && d.score >= 70).length;


  // firmware only records bad events — "0 records after sync" means perfect posture
  // "0 records before any sync" means unknown (no data yet)
  // const postureScore = !hasSynced && totalRecords === 0
  //   ? null  // unknown — haven't synced yet today
  //   : totalRecords === 0
  //     ? 100  // synced, no bad events = perfect
  //     : Math.max(0, Math.round(100 - (badLogs.length / totalRecords) * 100 - alertLogs.length * 2));

  // const grade = scoreToGrade(postureScore ?? 100);

  // ── BLE Core ─────────────────────────────────────────────────────────────────
  //
  // Protocol:
  //   TX characteristic (notify): device → web
  //     • Real-time: "ts,pitch,state" for every bad-posture event as it happens
  //     • Historical batch: "ts,pitch,state|ts,pitch,state|..." ended by "EOF"
  //     • Live heartbeat: "LIVE:pitch" sent by firmware every few seconds regardless of posture
  //   RX characteristic (write): web → device
  //     • SYNC:<unix>  — set device RTC
  //     • GET          — request stored logs (triggers historical batch above)
  //     • SET_WARN:<n> — set warning threshold
  //     • SET_ALERT:<n>— set alert threshold
  //     • CLEAR        — erase stored logs from device flash
  //
  // On connect we:
  //   1. startNotifications() immediately — live updates from this point on
  //   2. SYNC:<time>  — calibrate device RTC
  //   3. GET          — pull historical logs stored on device
  //   After EOF, historical pull is done; notifications keep streaming live events.

  useEffect(() => {
    if (todayHistoricalLogs && todayHistoricalLogs.length > 0) {
      setLiveAngle(todayHistoricalLogs[todayHistoricalLogs.length - 1].pitch);
      setSessionLogs(todayHistoricalLogs);
    }
  }, [todayHistoricalLogs]);

  useEffect(() => {
    // 1. ดึงจำนวนข้อมูลเฉพาะที่เกิดขึ้นในเซสชัน Live เท่านั้น
    const liveTotal = sessionLogs.length;
    
    // 2. กรองหา event ที่ผิดปกติ (state 1 และ 2) จากเซสชันปัจจุบัน
    const liveBadLogs = sessionLogs.filter((l) => l.state > 0); 
    const liveAlertLogs = sessionLogs.filter((l) => l.state === 2); 

    let newScore = 100; // ค่าเริ่มต้น

    if (liveTotal > 0) {
      // 3. คำนวณคะแนนโดยอิงจากสัดส่วนข้อมูล Live ล้วนๆ
      newScore = Math.max(
        0,
        Math.round(100 - (liveBadLogs.length / liveTotal) * 100 - liveAlertLogs.length * 2)
      );
    }

    // 4. อัปเดต State ให้ UI ขยับตาม
    setPostureScore(newScore);
    setGrade(scoreToGrade(newScore));

    console.log(newScore);

  // โค้ดจะทำงานอัตโนมัติทุกครั้งที่รับค่า Live Event ใหม่เข้ามา
  }, [sessionLogs]);

  const handleNotification = useCallback((event: Event) => {
    const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
    if (!value) return;
    const text = new TextDecoder().decode(value);

    // ── Live heartbeat: "LIVE:12.5" — device sends current pitch every ~2s ──
    // NOTE: firmware as-shipped doesn't send this, but if you add a periodic
    // notify in handleRunning() we handle it here cleanly.
    if (text.startsWith("LIVE:")) {
      // ดึงข้อความหลังคำว่า "LIVE:" แล้วแยกด้วยลูกน้ำ
      const dataParts = text.substring(5).split(",");
      const pitch = parseFloat(dataParts[0]);
      
      // ดึง state ออกมา (ถ้าไม่มีให้ fallback เป็น 0)
      const liveState = dataParts.length > 1 ? parseInt(dataParts[1]) : 0; 

      if (!isNaN(pitch)) {
        setLiveAngle(pitch);

        const currentTs = Math.floor(Date.now() / 1000); 
        const newLiveLog: PostureLog[] = [{ 
          timestamp: currentTs, 
          pitch: pitch, 
          state: liveState // ใช้ State จริงจากฮาร์ดแวร์
        }];

        if (user && newLiveLog.length > 0) {
          saveLogs({ userId: user.id, logs: newLiveLog });
        }

        setSessionLogs((prev) => {
          if (prev.find((l) => l.timestamp === currentTs)) return prev;

          return [...prev, ...newLiveLog].sort(
            (a, b) => a.timestamp - b.timestamp
          );
        });
      }
      return;
    }

    // ── End of historical batch ──────────────────────────────────────────────
    if (text === "EOF") {
      setConnStatus("live");
      setHasSynced(true);
      const newLogs = parseCSVPayload(pendingPayloadRef.current);
      pendingPayloadRef.current = "";
      setSyncedRecordCount(newLogs.length);
      // setSessionLogs((prev: PostureLog[]) => {
      //   // merge with any already-received live events (dedup by timestamp)
      //   const existingTs = new Set(prev.map((l: PostureLog) => l.timestamp));
      //   const merged = [...prev, ...newLogs.filter((l) => !existingTs.has(l.timestamp))];
      //   merged.sort((a, b) => a.timestamp - b.timestamp);
      //   console.log("EOF", merged);
      //   return merged;
      // });
      // if (newLogs.length > 0) {
        // setLiveAngle(newLogs[newLogs.length - 1].pitch);
      // }
      // if (user && newLogs.length > 0) {
        // saveLogs({ userId: user.id, logs: newLogs });
      // }
      return;
    }

    // ── Historical batch chunk (accumulate until EOF) ────────────────────────
    // Chunks look like: "ts,pitch,state|ts,pitch,state|"
    if (text.includes("|")) {
      pendingPayloadRef.current += text;
      return;
    }

    // ── Live single event: "ts,pitch,state" ─────────────────────────────────
    // Firmware can also call pTxCharacteristic->notify() for immediate events.
    const parts = text.split(",");
    if (parts.length === 3) {
      const [ts, pitch, state] = parts.map(Number);
      if (!isNaN(ts)) {
        setLiveAngle(pitch);
        const newLog: PostureLog = { timestamp: ts, pitch, state };
        setSessionLogs((prev: PostureLog[]) => {
          if (prev.find((l: PostureLog) => l.timestamp === ts)) return prev;
          const merged = [...prev, newLog].sort((a: PostureLog, b: PostureLog) => a.timestamp - b.timestamp);
          console.log("Single live", merged);
          return merged;
        });
        if (user && state > 0) {
          saveLogs({ userId: user.id, logs: [newLog] });
        }
      }
    }
  }, [user, saveLogs]);

  const connect = async () => {
    try {
      setConnStatus("connecting");

      let device = bleDevice;
      if (!device) {
        device = await navigator.bluetooth.requestDevice({
          filters: [{ name: "POSTURA" }],
          optionalServices: [BLE_SERVICE_UUID],
        });
        setBleDevice(device);
        device.addEventListener("gattserverdisconnected", () => {
          setIsConnected(false);
          setConnStatus("idle");
          setTxCharRef(null);
          setRxCharRef(null);
        });
      }

      const server = await device.gatt?.connect();
      setIsConnected(true);

      const service = await server?.getPrimaryService(BLE_SERVICE_UUID);
      const rxChar = await service?.getCharacteristic(BLE_CHAR_RX_UUID);
      const txChar = await service?.getCharacteristic(BLE_CHAR_TX_UUID);
      setRxCharRef(rxChar ?? null);
      setTxCharRef(txChar ?? null);

      // Step 1: subscribe to all future notifications (live + historical)
      await txChar?.startNotifications();
      txChar?.addEventListener("characteristicvaluechanged", handleNotification);

      // Step 2: sync device RTC to current time
      const encoder = new TextEncoder();
      await rxChar?.writeValue(encoder.encode(`SYNC:${Math.floor(Date.now() / 1000)}`));
      await new Promise((r) => setTimeout(r, 200));

      // Step 3: pull stored logs — device will stream them as notifications
      setConnStatus("pulling");
      pendingPayloadRef.current = "";
      await rxChar?.writeValue(encoder.encode("GET"));
      // connStatus → "live" once EOF is received in handleNotification

    } catch (err) {
      console.error("BLE Error:", err);
      setConnStatus("error");
      setIsConnected(false);
    }
  };

  const disconnect = async () => {
    try {
      if (txCharRef) {
        await txCharRef.stopNotifications();
        txCharRef.removeEventListener("characteristicvaluechanged", handleNotification);
      }
      bleDevice?.gatt?.disconnect();
    } catch (_) {}
    setIsConnected(false);
    setConnStatus("idle");
    setTxCharRef(null);
    setRxCharRef(null);
  };

  const applySettingsToDevice = async () => {
    const rx = rxCharRef;
    if (!isConnected || !rx) {
      alert("Please connect and sync first.");
      return;
    }
    try {
      const encoder = new TextEncoder();
      await rx.writeValue(encoder.encode(`SET_WARN:${warnThresh}`));
      await new Promise((r) => setTimeout(r, 250));
      await rx.writeValue(encoder.encode(`SET_ALERT:${alertThresh}`));
      alert("Settings saved to device ✓");
    } catch (e) {
      console.error(e);
    }
  };

  const recalibrateDevice = async () => {
    const rx = rxCharRef;
    if (!isConnected || !rx) return alert("Please connect first.");
    
    // ถามยืนยันเพื่อให้ผู้ใช้เตรียมตัวนั่ง/ยืนหลังตรง
    if (!confirm("Stand straight and keep still. Start calibration?")) return;
    
    try {
      const encoder = new TextEncoder();
      await rx.writeValue(encoder.encode("CALIB"));
      alert("Calibration started. Please hold still for 3 seconds.");
    } catch (e) {
      console.error(e);
      alert("Failed to send calibration command.");
    }
  };

  const clearDeviceMemory = async () => {
    const rx = rxCharRef;
    if (!isConnected || !rx) return alert("Connect first.");
    if (!confirm("Clear all data stored on the POSTURA device?")) return;
    const encoder = new TextEncoder();
    await rx.writeValue(encoder.encode("CLEAR"));
    setSessionLogs([]);
    alert("Device memory cleared.");
  };

  // ─── Tab: Dashboard ──────────────────────────────────────────────────────────
  const renderDashboard = () => (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Hero Sync Card */}
      <div className="bg-linear-to-br from-[#655DDD] to-[#4a44a6] rounded-3xl p-5 text-white shadow-lg shadow-purple-200 relative overflow-hidden">
        <div className="absolute -top-4 -right-4 opacity-10">
          <Activity size={120} />
        </div>
        {/* Status row */}
        <div className="flex items-center justify-between mb-4 relative z-10">
          <div>
            <p className="text-xs font-semibold opacity-70 uppercase tracking-widest mb-0.5">Live Status</p>
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                {isConnected && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />}
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isConnected ? "bg-green-400" : "bg-slate-400"}`} />
              </span>
              <span className="font-bold text-sm">
                {connStatus === "connecting" ? "Connecting…"
                  : connStatus === "pulling" ? "Loading history…"
                  : connStatus === "live" ? "Live · Monitoring"
                  : connStatus === "error" ? "Connection failed"
                  : "Not connected"}
              </span>
            </div>
          </div>
          {isConnected && <BatteryMedium size={20} className="opacity-80" />}
        </div>

        {/* 3D Spine + Score side by side */}
        <div className="flex items-center justify-between relative z-10 mb-4">
          <SpineVisualizer angle={liveAngle} />
          <div className="flex flex-col items-center flex-1 gap-3">
            <PostureRing score={postureScore} grade={grade} />
            <div className="text-center">
              <p className="text-[11px] opacity-60 uppercase tracking-widest">Today's Score</p>
              <p className="text-xs font-bold">{grade.label}</p>
            </div>
          </div>
        </div>

        {/* Connect / Disconnect button */}
        {!isConnected ? (
          <button
            onClick={connect}
            disabled={connStatus === "connecting"}
            className="bg-white text-[#655DDD] px-5 py-3 rounded-full font-bold w-full flex items-center justify-center gap-2 transition-transform active:scale-95 shadow-md relative z-10 disabled:opacity-60"
          >
            {connStatus === "connecting"
              ? <><RotateCcw className="animate-spin" size={17} /><span>Connecting…</span></>
              : <><Bluetooth size={17} /><span>{bleDevice ? "Reconnect" : "Pair & Connect"}</span></>
            }
          </button>
        ) : (
          <div className="flex gap-3 relative z-10">
            {connStatus === "pulling" && (
              <div className="flex-1 bg-white/20 rounded-full px-4 py-3 flex items-center justify-center gap-2">
                <RotateCcw className="animate-spin opacity-80" size={16} />
                <span className="text-sm font-semibold opacity-90">Loading history…</span>
              </div>
            )}
            {connStatus === "live" && (
              <div className="flex-1 bg-white/20 rounded-full px-4 py-3 flex items-center justify-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-300 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-300" />
                </span>
                <span className="text-sm font-semibold opacity-90">
                  {sessionLogs.length === 0 ? "Perfect posture ✓" : `${sessionLogs.length} events today`}
                </span>
              </div>
            )}
            <button
              onClick={disconnect}
              className="bg-white/20 hover:bg-white/30 rounded-full px-4 py-3 font-semibold text-sm transition-colors"
            >
              Disconnect
            </button>
          </div>
        )}

        {connStatus === "error" && (
          <p className="text-red-300 text-xs text-center mt-2 relative z-10">
            Could not connect. Make sure POSTURA is on and nearby.
          </p>
        )}
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-green-50 rounded-2xl p-3 text-center">
          <p className="text-[10px] font-bold text-green-600 mb-1">Status</p>
          {!hasSynced
            ? <p className="text-sm font-bold text-slate-400">—</p>
            : badTimeMin === 0
              ? <p className="text-sm font-bold text-green-600">Perfect</p>
              : <p className="text-lg font-bold text-slate-800">{Math.max(0, postureScore ?? 0)}<span className="text-xs text-slate-400">pts</span></p>
          }
        </div>
        <div className="bg-red-50 rounded-2xl p-3 text-center">
          <p className="text-[10px] font-bold text-red-500 mb-1">Slouch</p>
          <p className="text-lg font-bold text-slate-800">{badTimeMin}<span className="text-xs text-slate-400">m</span></p>
        </div>
        <div className="bg-amber-50 rounded-2xl p-3 text-center">
          <p className="text-[10px] font-bold text-amber-600 mb-1">Alerts</p>
          <p className="text-lg font-bold text-slate-800">{alertLogs.length}</p>
        </div>
      </div>

      {/* Streak Card */}
      <div className="bg-white border border-slate-100 rounded-2xl p-4 flex items-center gap-4 shadow-sm">
        <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center">
          <Award size={24} className="text-amber-500" />
        </div>
        <div className="flex-1">
          <p className="font-bold text-slate-700 text-sm">
            {streakDays === 7 ? "Perfect Week! 🎉" : `${streakDays}-day streak`}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">Days with score ≥ 70 this week</p>
        </div>
        <div className="text-2xl font-bold text-amber-500">{streakDays}</div>
      </div>

      {/* Worst Hours Warning */}
      {worstHours.length > 0 && (
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <h3 className="font-bold text-slate-700 text-sm mb-3 flex items-center gap-2">
            <AlertTriangle size={15} className="text-amber-500" /> Worst hours today
          </h3>
          <div className="space-y-2">
            {worstHours.map((h) => (
              <div key={h.hour} className="flex items-center gap-3">
                <span className="text-xs text-slate-400 w-12">{h.hour}</span>
                <div className="flex-1 bg-slate-100 rounded-full h-2">
                  <div
                    className="h-2 rounded-full transition-all"
                    style={{
                      width: `${100 - (h.score ?? 0)}%`,
                      backgroundColor: (h.score ?? 0) < 40 ? "#ef4444" : "#f59e0b",
                    }}
                  />
                </div>
                <span className="text-xs font-bold text-slate-600 w-8 text-right">{h.score}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // ─── Tab: Trends ────────────────────────────────────────────────────────────
  const renderTrends = () => (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-slate-800">Analysis</h2>
        <div className="bg-slate-100 text-xs font-semibold px-3 py-1.5 rounded-full text-slate-500">
          Last 7 days
        </div>
      </div>

      {/* Weekly Trend */}
      <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-500 mb-1">Weekly posture score</h3>
        <div className="flex items-baseline gap-1 mb-4">
          <span className="text-3xl font-bold text-slate-800">{postureScore ?? "—"}</span>
          <span className="text-sm text-slate-400">/100 today</span>
          <span
            className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full`}
            style={{ background: `${grade.color}20`, color: grade.color }}
          >
            {grade.letter} · {grade.label}
          </span>
        </div>
        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={weeklyData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
              <defs>
                <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#655DDD" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#655DDD" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#94a3b8" }} />
              <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#94a3b8" }} />
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <Tooltip
                contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.08)", fontSize: 12 }}
                formatter={(v: unknown) => [`${v ?? ""}`, "Score"]}
              />
              <ReferenceLine y={70} stroke="#10b981" strokeDasharray="4 4" strokeWidth={1.5} label={{ value: "Target 70", position: "insideTopRight", fontSize: 9, fill: "#10b981" }} />
              <Area type="monotone" dataKey="score" stroke="#655DDD" strokeWidth={2.5} fillOpacity={1} fill="url(#scoreGrad)" dot={{ r: 4, fill: "#655DDD", strokeWidth: 2, stroke: "#fff" }} connectNulls />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Hourly Bar Chart */}
      <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-500 mb-4">Hourly breakdown (today)</h3>
        <div className="flex gap-3 text-[10px] text-slate-400 mb-3">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-[#655DDD]" />Good posture</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-red-400" />Slouching</span>
        </div>
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={hourlyData} margin={{ top: 0, right: 0, left: -28, bottom: 0 }}>
              <XAxis dataKey="hour" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: "#94a3b8" }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: "#94a3b8" }} />
              <Tooltip
                cursor={{ fill: "#f8fafc" }}
                contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 4px 6px rgba(0,0,0,0.08)", fontSize: 12 }}
              />
              <Bar dataKey="good" stackId="a" fill="#655DDD" radius={[0, 0, 0, 0]} name="Good" />
              <Bar dataKey="bad" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} name="Slouch" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Pitch Angle Over Session */}
      {sessionLogs.length > 0 && (
        <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-500 mb-4">Angle during last sync</h3>
          <div className="h-36 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={sessionLogs.slice(-60).map((l: PostureLog, i: number) => ({ i, angle: l.pitch, state: l.state }))}
                margin={{ top: 4, right: 4, left: -28, bottom: 0 }}
              >
                <XAxis hide />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: "#94a3b8" }} domain={[0, 45]} />
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <Tooltip
                  contentStyle={{ borderRadius: "12px", border: "none", fontSize: 11 }}
                  formatter={(v: unknown) => [`${v ?? ""}°`, "Pitch"]}
                />
                <ReferenceLine y={warnThresh} stroke="#f59e0b" strokeDasharray="4 2" strokeWidth={1.5} />
                <ReferenceLine y={alertThresh} stroke="#ef4444" strokeDasharray="4 2" strokeWidth={1.5} />
                <Line type="monotone" dataKey="angle" stroke="#655DDD" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex gap-4 text-[10px] text-slate-400 mt-2">
            <span className="flex items-center gap-1"><span className="w-4 border-t-2 border-dashed border-amber-400" />Warn {warnThresh}°</span>
            <span className="flex items-center gap-1"><span className="w-4 border-t-2 border-dashed border-red-400" />Alert {alertThresh}°</span>
          </div>
        </div>
      )}

      {/* Insights */}
      <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm">
        <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
          <Zap size={15} className="text-[#655DDD]" /> Insights
        </h3>
        <div className="space-y-3">
          {(postureScore ?? 0) >= 85 && (
            <div className="flex gap-3 items-start">
              <CheckCircle size={16} className="text-green-500 mt-0.5 shrink-0" />
              <p className="text-sm text-slate-600">Great posture day! No bad posture events recorded.</p>
            </div>
          )}
          {(badTimeMin ?? 0) > 30 && (
            <div className="flex gap-3 items-start">
              <AlertTriangle size={16} className="text-amber-500 mt-0.5 shrink-0" />
              <p className="text-sm text-slate-600">You spent {badTimeMin}m in poor posture. Try standing up every 30 minutes.</p>
            </div>
          )}
          {alertLogs.length > 5 && (
            <div className="flex gap-3 items-start">
              <Info size={16} className="text-red-400 mt-0.5 shrink-0" />
              <p className="text-sm text-slate-600">You triggered {alertLogs.length} critical alerts. Consider lowering your monitor or adjusting your chair.</p>
            </div>
          )}
          {totalRecords === 0 && (
            <div className="flex gap-3 items-start">
              <Info size={16} className="text-slate-400 mt-0.5 shrink-0" />
              <p className="text-sm text-slate-500">No data yet. Pair and sync your POSTURA device to see insights.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // ─── Tab: Progress ───────────────────────────────────────────────────────────
  const renderProgress = () => {
    // ใช้ weeklyData ตัวใหม่ในการคำนวณ (ซึ่งรวมค่า real-time ของวันนี้แล้ว)
    const validDays = weeklyData.filter((d) => d.score !== null);
    const avgScore = validDays.length > 0 
      ? validDays.reduce((sum, d) => sum + (d.score ?? 0), 0) / validDays.length 
      : 0;

    const goals = [
      { id: "score", label: "Score ≥ 80 today", done: (postureScore ?? 0) >= 80, value: postureScore ?? 0, max: 80 },
      { id: "streak", label: "3-day streak", done: streakDays >= 3, value: streakDays, max: 3 },
      { id: "good", label: "No slouch today", done: hasSynced && badTimeMin === 0, value: hasSynced ? (badTimeMin === 0 ? 1 : 0) : 0, max: 1 },
      { id: "alert", label: "< 5 alerts today", done: alertLogs.length < 5, value: Math.max(0, 5 - alertLogs.length), max: 5 },
    ];

    return (
      <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <h2 className="text-xl font-bold text-slate-800">Progress</h2>

        {/* Overall Week Summary */}
        <div className="bg-linear-to-br from-[#655DDD] to-[#4a44a6] rounded-3xl p-5 text-white">
          <p className="text-xs font-semibold opacity-70 uppercase tracking-widest mb-3">This week</p>
          <div className="flex gap-5">
            <div>
              <p className="text-3xl font-bold">{Math.round(avgScore)}</p>
              <p className="text-xs opacity-70">Avg score</p>
            </div>
            <div className="border-l border-white/20 pl-5">
              <p className="text-3xl font-bold">{streakDays}</p>
              <p className="text-xs opacity-70">Day streak</p>
            </div>
            <div className="border-l border-white/20 pl-5">
              <p className="text-3xl font-bold">{goodDaysCount}</p>
              <p className="text-xs opacity-70">Good days</p>
            </div>
          </div>
        </div>

        {/* Daily Goals */}
        <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm">
          <h3 className="font-bold text-slate-700 text-sm mb-4 flex items-center gap-2">
            <Target size={15} className="text-[#655DDD]" /> Daily Goals
          </h3>
          <div className="space-y-4">
            {goals.map((g) => (
              <div key={g.id} className="flex items-center gap-3">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${g.done ? "bg-green-100" : "bg-slate-100"}`}>
                  {g.done
                    ? <CheckCircle size={14} className="text-green-500" />
                    : <div className="w-2 h-2 rounded-full bg-slate-300" />
                  }
                </div>
                <div className="flex-1">
                  <p className="text-sm text-slate-700 font-medium">{g.label}</p>
                  <div className="mt-1 h-1.5 bg-slate-100 rounded-full">
                    <div
                      className="h-1.5 rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, (g.value / g.max) * 100)}%`,
                        backgroundColor: g.done ? "#10b981" : "#655DDD",
                      }}
                    />
                  </div>
                </div>
                <span className="text-xs text-slate-400 shrink-0">{Math.min(g.value, g.max)}/{g.max}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 7-day Score Calendar */}
        <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm">
          <h3 className="font-bold text-slate-700 text-sm mb-4 flex items-center gap-2">
            <Calendar size={15} className="text-[#655DDD]" /> Score calendar
          </h3>
          <div className="grid grid-cols-7 gap-2">
            {weeklyData.map((d, i) => {
              const g = d.score !== null ? scoreToGrade(d.score) : null;
              return (
                <div key={i} className="flex flex-col items-center gap-1">
                  <span className="text-[9px] text-slate-400 font-semibold">{d.day}</span>
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold"
                    style={g ? { background: `${g.color}20`, color: g.color } : { background: "#f8fafc", color: "#cbd5e1" }}
                  >
                    {g ? g.letter : "—"}
                  </div>
                  {d.score !== null && <span className="text-[9px] text-slate-400">{d.score}</span>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Posture Tips */}
        <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm">
          <h3 className="font-bold text-slate-700 text-sm mb-4">Tips for you</h3>
          <div className="space-y-3">
            {[
              { icon: "🖥️", tip: "Position your monitor at eye level to reduce forward head posture." },
              { icon: "⏰", tip: "Take a 2-minute standing break every 30 minutes." },
              { icon: "💪", tip: "Strengthen your core — it supports your spine naturally." },
              { icon: "🪑", tip: "Sit with your hips slightly higher than your knees." },
            ].map((t, i) => (
              <div key={i} className="flex gap-3 items-start">
                <span className="text-lg leading-none">{t.icon}</span>
                <p className="text-sm text-slate-600 leading-relaxed">{t.tip}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // ─── Tab: Settings ───────────────────────────────────────────────────────────
  const renderSettings = () => (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <h2 className="text-xl font-bold text-slate-800">Device Settings</h2>

      <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm space-y-6">
        <div>
          <div className="flex justify-between items-end mb-2">
            <div>
              <span className="font-semibold text-slate-700 block text-sm">Warning angle</span>
              <span className="text-xs text-slate-400">Light vibration</span>
            </div>
            <span className="text-xl font-bold text-amber-500">{warnThresh}°</span>
          </div>
          <input
            type="range" min="10" max="25" value={warnThresh}
            onChange={(e: { target: HTMLInputElement }) => setWarnThresh(Number(e.target.value))}
            className="w-full accent-amber-500 h-2 bg-slate-100 rounded-lg appearance-none"
          />
          <div className="flex justify-between text-[10px] text-slate-300 mt-1">
            <span>10°</span><span>25°</span>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100">
          <div className="flex justify-between items-end mb-2">
            <div>
              <span className="font-semibold text-slate-700 block text-sm">Alert angle</span>
              <span className="text-xs text-slate-400">Strong vibration</span>
            </div>
            <span className="text-xl font-bold text-red-500">{alertThresh}°</span>
          </div>
          <input
            type="range" min="20" max="40" value={alertThresh}
            onChange={(e: { target: HTMLInputElement }) => setAlertThresh(Number(e.target.value))}
            className="w-full accent-red-500 h-2 bg-slate-100 rounded-lg appearance-none"
          />
          <div className="flex justify-between text-[10px] text-slate-300 mt-1">
            <span>20°</span><span>40°</span>
          </div>
        </div>

        {/* Preview */}
        <div className="bg-slate-50 rounded-2xl p-4">
          <p className="text-xs font-semibold text-slate-500 mb-3">Preview</p>
          <div className="flex items-end gap-1 h-10">
            {[0, 5, 10, 15, 20, 25, 30, 35, 40].map((deg) => (
              <div
                key={deg}
                className="flex-1 rounded-t"
                style={{
                  height: `${(deg / 40) * 100}%`,
                  backgroundColor: deg >= alertThresh ? "#ef4444" : deg >= warnThresh ? "#f59e0b" : "#10b981",
                  opacity: 0.7,
                }}
              />
            ))}
          </div>
          <div className="flex justify-between text-[9px] text-slate-300 mt-1">
            <span>0°</span><span className="text-amber-400">Warn {warnThresh}°</span><span className="text-red-400">Alert {alertThresh}°</span><span>40°</span>
          </div>
        </div>

        {/* ─── Buttons Area ─── */}
        <div className="space-y-3 pt-2">
          <button
            onClick={applySettingsToDevice}
            className="w-full bg-purple-50 text-[#655DDD] font-bold py-3 rounded-xl hover:bg-purple-100 transition-colors text-sm"
          >
            Save to Device
          </button>

          <button
            onClick={recalibrateDevice}
            className="w-full border-2 border-slate-100 text-slate-600 font-bold py-3 rounded-xl hover:bg-slate-50 transition-colors text-sm flex items-center justify-center gap-2"
          >
            {/* ดึงไอคอน Target มาใช้ ถ้าคุณมีการ import Target จาก lucide-react ไว้แล้ว */}
            <Target size={16} className="text-slate-400" />
            Recalibrate Device
          </button>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm space-y-3">
        <h3 className="font-bold text-slate-700 text-sm">Data</h3>
        <button
          onClick={clearDeviceMemory}
          className="w-full bg-red-50 text-red-600 font-bold py-3 rounded-xl hover:bg-red-100 transition-colors text-sm"
        >
          Clear Device Memory
        </button>
        <p className="text-xs text-slate-400 text-center">
          This removes all logs stored on the hardware. Cloud data is preserved.
        </p>
      </div>

      {/* About */}
      <div className="bg-slate-50 rounded-2xl p-4 text-center">
        <p className="text-xs text-slate-400">POSTURA · Firmware v1.0</p>
        <p className="text-xs text-slate-300 mt-1">M5StickC Plus · BLE 5.0</p>
      </div>
    </div>
  );

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex justify-center">
      <div className="w-full max-w-md bg-white shadow-xl min-h-screen flex flex-col">

        {/* Header */}
        <header className="px-6 py-4 flex justify-between items-center border-b border-slate-100 sticky top-0 bg-white/95 backdrop-blur z-20">
          <div>
            <h1 className="text-xl font-bold text-[#655DDD] tracking-wide">POSTURA</h1>
            <p className="text-xs text-slate-400 font-medium">
              {user ? `Hi, ${user.firstName}` : "Welcome"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {isConnected && (
              <div className="flex items-center gap-1.5 bg-green-50 px-2 py-1 rounded-full">
                <BluetoothConnected size={13} className="text-green-500" />
                <span className="text-[10px] font-bold text-green-600">Live</span>
              </div>
            )}
            <UserButton />
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto pb-32 p-5 space-y-5">
          {activeTab === "dashboard" && renderDashboard()}
          {activeTab === "trends" && renderTrends()}
          {activeTab === "progress" && renderProgress()}
          {activeTab === "settings" && renderSettings()}
        </main>

        {/* Bottom Nav */}
        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white/95 backdrop-blur border-t border-slate-100 px-4 py-3 pb-7 flex justify-around items-center rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.06)] z-30">
          {[
            { id: "dashboard", icon: Home, label: "Today" },
            { id: "trends", icon: BarChart2, label: "Trends" },
            { id: "progress", icon: Award, label: "Progress" },
            { id: "settings", icon: Settings, label: "Device" },
          ].map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex flex-col items-center gap-1 min-w-14 transition-colors ${
                activeTab === id ? "text-[#655DDD]" : "text-slate-400 hover:text-slate-600"
              }`}
            >
              <Icon size={22} strokeWidth={activeTab === id ? 2.5 : 2} />
              <span className="text-[10px] font-bold">{label}</span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}