"use client";
import { useState, useEffect } from "react";
import { useUser, UserButton } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { Activity, Bluetooth, BluetoothConnected, Settings, BarChart2, Home, RotateCcw, BatteryMedium } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, AreaChart, Area } from "recharts";
import { api } from "../../convex/_generated/api";

export default function PosturaApp() {
  const { user } = useUser();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [isConnected, setIsConnected] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // States สำหรับ Settings
  const [warnThresh, setWarnThresh] = useState(15);
  const [alertThresh, setAlertThresh] = useState(25);
  const [bleDevice, setBleDevice] = useState<BluetoothDevice | null>(null);

  // สมมติฐานข้อมูล (เปลี่ยนเป็นใช้ useQuery จาก Convex เมื่อพร้อม)
  // const logs = useQuery(api.posture.getLogs, { userId: user?.id || "" });
  // const saveLogs = useMutation(api.posture.saveLogsBatch);

  const mockTrendData = [
    { time: "09:00", duration: 5, state: 0 },
    { time: "10:00", duration: 15, state: 1 },
    { time: "11:00", duration: 30, state: 2 },
    { time: "12:00", duration: 10, state: 1 },
    { time: "13:00", duration: 5, state: 0 },
    { time: "14:00", duration: 25, state: 2 },
  ];

  // ─── BLE Logic ─────────────────────────────────────────────
  const connectAndSync = async () => {
    try {
      setIsSyncing(true);
      let device = bleDevice;

      // ถ้ายังไม่เคย Pair ให้กดค้นหาใหม่
      if (!device) {
        device = await navigator.bluetooth.requestDevice({
          filters: [{ name: 'POSTURA' }],
          optionalServices: ['4fafc201-1fb5-459e-8fcc-c5c9c331914b']
        });
        // setBleDevice(device); // จำ Device ไว้ใช้ครั้งหน้า
      }

      const server = await device.gatt?.connect();
      setIsConnected(true);

      const service = await server?.getPrimaryService('4fafc201-1fb5-459e-8fcc-c5c9c331914b');
      const rxChar = await service?.getCharacteristic('beb5483e-36e1-4688-b7f5-ea07361b26a8');
      
      // ส่งเวลาปัจจุบันไปให้ M5StickC
      const encoder = new TextEncoder();
      const unixTime = Math.floor(Date.now() / 1000);
      await rxChar?.writeValue(encoder.encode(`SYNC:${unixTime}`));
      
      // สั่งดึงข้อมูล
      await rxChar?.writeValue(encoder.encode("GET"));

      // *หลังจากรับ Notification ข้อมูลครบแล้ว*
      // if (user) await saveLogs({ userId: user.id, logs: parsedLogs });
      // await rxChar?.writeValue(encoder.encode("CLEAR"));

      setTimeout(() => setIsSyncing(false), 2000); // จำลองว่า Sync เสร็จ
    } catch (error) {
      console.error("BLE Error:", error);
      setIsSyncing(false);
      setIsConnected(false);
    }
  };

  const applySettingsToDevice = async () => {
    if (!isConnected || !bleDevice) return alert("Please connect device first!");
    try {
      const server = await bleDevice.gatt?.connect();
      const service = await server?.getPrimaryService('4fafc201-1fb5-459e-8fcc-c5c9c331914b');
      const rxChar = await service?.getCharacteristic('beb5483e-36e1-4688-b7f5-ea07361b26a8');
      const encoder = new TextEncoder();
      
      await rxChar?.writeValue(encoder.encode(`SET_WARN:${warnThresh}`));
      await new Promise(r => setTimeout(r, 200)); // Delay กัน BLE ค้าง
      await rxChar?.writeValue(encoder.encode(`SET_ALERT:${alertThresh}`));
      
      alert("Settings applied to device!");
    } catch (e) {
      console.error(e);
    }
  };

  // ─── UI Renderers ──────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex justify-center">
      {/* Mobile/Tablet Container */}
      <div className="w-full max-w-md bg-white shadow-xl min-h-screen relative flex flex-col">
        
        {/* Header */}
        <header className="px-6 py-5 flex justify-between items-center border-b border-slate-100">
          <div>
            <h1 className="text-xl font-bold text-[#655DDD] tracking-wide">POSTURA</h1>
            <p className="text-xs text-slate-400 font-medium">{user ? `Hi, ${user.firstName}` : 'Welcome'}</p>
          </div>
          <div className="flex items-center gap-4">
            {isConnected && <BatteryMedium className="text-green-500" size={20} />}
            <UserButton afterSignOutUrl="/"/>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto pb-24 p-6 space-y-6">
          
          {/* TAB 1: DASHBOARD */}
          {activeTab === "dashboard" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {/* Sync Card */}
              <div className="bg-gradient-to-br from-[#655DDD] to-[#4a44a6] rounded-3xl p-6 text-white shadow-lg shadow-purple-200 text-center relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-20">
                  <Activity size={100} />
                </div>
                <h2 className="text-lg font-medium opacity-90 mb-1 relative z-10">Device Status</h2>
                <div className="flex justify-center items-center gap-2 mb-6 relative z-10">
                  <span className="relative flex h-3 w-3">
                    {isConnected && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>}
                    <span className={`relative inline-flex rounded-full h-3 w-3 ${isConnected ? 'bg-green-400' : 'bg-slate-400'}`}></span>
                  </span>
                  <span className="font-semibold text-sm">{isConnected ? 'Connected & Ready' : 'Not Connected'}</span>
                </div>
                
                <button 
                  onClick={connectAndSync}
                  disabled={isSyncing}
                  className="bg-white text-[#655DDD] px-6 py-3 rounded-full font-bold w-full flex items-center justify-center gap-2 transition-transform active:scale-95 shadow-md relative z-10"
                >
                  {isSyncing ? <RotateCcw className="animate-spin" size={18} /> : <Bluetooth size={18} />}
                  {isSyncing ? "Syncing..." : (bleDevice ? "Sync Now" : "Pair & Sync")}
                </button>
              </div>

              {/* Today's Summary (Apple Rings Style) */}
              <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm">
                <h3 className="font-bold text-slate-700 mb-4">Today's Posture</h3>
                <div className="flex gap-4">
                  <div className="flex-1 bg-green-50 rounded-2xl p-4 text-center">
                    <p className="text-xs font-semibold text-green-600 mb-1">Good Time</p>
                    <p className="text-2xl font-bold text-slate-800">4<span className="text-sm font-medium text-slate-500">h</span> 12<span className="text-sm font-medium text-slate-500">m</span></p>
                  </div>
                  <div className="flex-1 bg-red-50 rounded-2xl p-4 text-center">
                    <p className="text-xs font-semibold text-red-500 mb-1">Slouch Time</p>
                    <p className="text-2xl font-bold text-slate-800">45<span className="text-sm font-medium text-slate-500">m</span></p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: TRENDS */}
          {activeTab === "trends" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-slate-800">Analysis</h2>
                <select className="bg-slate-100 text-xs font-semibold px-3 py-1 rounded-full outline-none">
                  <option>Today</option>
                  <option>This Week</option>
                </select>
              </div>

              {/* Bar Chart */}
              <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-500 mb-6">Slouch Duration (Minutes)</h3>
                <div className="h-52 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={mockTrendData} margin={{ top: 0, right: 0, left: -25, bottom: 0 }}>
                      <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                      <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                      <Bar dataKey="duration" radius={[4, 4, 0, 0]}>
                        {mockTrendData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.state === 2 ? '#ef4444' : entry.state === 1 ? '#f59e0b' : '#10b981'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Area Chart (Overall Trend) */}
              <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-500 mb-6">Posture Stress Level</h3>
                <div className="h-40 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={mockTrendData} margin={{ top: 0, right: 0, left: -25, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorStress" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#655DDD" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#655DDD" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="time" hide />
                      <YAxis hide />
                      <Area type="monotone" dataKey="duration" stroke="#655DDD" strokeWidth={3} fillOpacity={1} fill="url(#colorStress)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: SETTINGS */}
          {activeTab === "settings" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h2 className="text-xl font-bold text-slate-800">Device Settings</h2>
              
              <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm space-y-6">
                <div>
                  <div className="flex justify-between items-end mb-2">
                    <div>
                      <span className="font-semibold text-slate-700 block">Warning Angle</span>
                      <span className="text-xs text-slate-400">Light vibration</span>
                    </div>
                    <span className="text-xl font-bold text-amber-500">{warnThresh}°</span>
                  </div>
                  <input type="range" min="10" max="25" value={warnThresh} onChange={(e) => setWarnThresh(Number(e.target.value))} className="w-full accent-amber-500 h-2 bg-slate-100 rounded-lg appearance-none" />
                </div>

                <div className="pt-4 border-t border-slate-100">
                  <div className="flex justify-between items-end mb-2">
                    <div>
                      <span className="font-semibold text-slate-700 block">Alert Angle</span>
                      <span className="text-xs text-slate-400">Heavy vibration</span>
                    </div>
                    <span className="text-xl font-bold text-red-500">{alertThresh}°</span>
                  </div>
                  <input type="range" min="20" max="40" value={alertThresh} onChange={(e) => setAlertThresh(Number(e.target.value))} className="w-full accent-red-500 h-2 bg-slate-100 rounded-lg appearance-none" />
                </div>

                <button onClick={applySettingsToDevice} className="w-full mt-4 bg-purple-50 text-[#655DDD] font-bold py-3 rounded-xl hover:bg-purple-100 transition-colors">
                  Save to Device
                </button>
              </div>

              <div className="bg-red-50 rounded-3xl p-4 text-center cursor-pointer hover:bg-red-100 transition-colors">
                <p className="text-red-600 font-bold text-sm">Clear Device Memory</p>
              </div>
            </div>
          )}

        </main>

        {/* Bottom Navigation Bar */}
        <nav className="absolute bottom-0 w-full bg-white border-t border-slate-100 px-6 py-3 pb-6 flex justify-between items-center rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.03)]">
          <button onClick={() => setActiveTab("dashboard")} className={`flex flex-col items-center gap-1 w-16 ${activeTab === 'dashboard' ? 'text-[#655DDD]' : 'text-slate-400 hover:text-slate-600'}`}>
            <Home size={24} strokeWidth={activeTab === 'dashboard' ? 2.5 : 2} />
            <span className="text-[10px] font-bold">Today</span>
          </button>
          
          <button onClick={() => setActiveTab("trends")} className={`flex flex-col items-center gap-1 w-16 ${activeTab === 'trends' ? 'text-[#655DDD]' : 'text-slate-400 hover:text-slate-600'}`}>
            <BarChart2 size={24} strokeWidth={activeTab === 'trends' ? 2.5 : 2} />
            <span className="text-[10px] font-bold">Trends</span>
          </button>
          
          <button onClick={() => setActiveTab("settings")} className={`flex flex-col items-center gap-1 w-16 ${activeTab === 'settings' ? 'text-[#655DDD]' : 'text-slate-400 hover:text-slate-600'}`}>
            <Settings size={24} strokeWidth={activeTab === 'settings' ? 2.5 : 2} />
            <span className="text-[10px] font-bold">Device</span>
          </button>
        </nav>

      </div>
    </div>
  );
}