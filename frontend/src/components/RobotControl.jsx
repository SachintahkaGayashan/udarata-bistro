import React, { useState, useEffect } from 'react';
import { ArrowUp, ArrowDown, Square, Activity, ShieldAlert, ShieldCheck, Eye } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue } from 'firebase/database';

// Direct Firebase Configuration
const firebaseConfig = {
  databaseURL: "https://test-5b6ed-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export default function RobotControl() {
  const [currentStatus, setCurrentStatus] = useState('STOPPED');
  const [ultrasonicActive, setUltrasonicActive] = useState(true);
  const [qtrSensors, setQtrSensors] = useState([0, 0, 0, 0, 0, 0, 0, 0]);
  const [loading, setLoading] = useState(false);

  // Direct Firebase Realtime Listener for QTR Sensors
  useEffect(() => {
    const qtrRef = ref(db, 'QTR_Sensors/s'); // Direct path to array "s"
    const unsubscribe = onValue(qtrRef, (snapshot) => {
      const data = snapshot.val();
      if (data && Array.isArray(data)) {
        setQtrSensors(data);
      }
    });

    return () => unsubscribe();
  }, []);

  const sendCommand = async (command) => {
    setLoading(true);
    try {
      const res = await fetch('http://localhost:5000/api/robot/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command }),
      });
      if (res.ok) setCurrentStatus(command);
    } catch (err) {
      console.error('Command error:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleUltrasonic = async () => {
    const nextState = !ultrasonicActive;
    try {
      const res = await fetch('http://localhost:5000/api/robot/ultrasonic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextState }),
      });
      if (res.ok) setUltrasonicActive(nextState);
    } catch (err) {
      console.error('Ultrasonic toggle error:', err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-6 space-y-6">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-xl font-bold tracking-wide text-white">AGV TELEMETRY & CONTROL</h1>
            <p className="text-xs text-slate-400">Line Tracking & Obstacle Avoidance Hub</p>
          </div>
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400 animate-pulse" />
            <span className="text-xs text-emerald-400 font-mono">ONLINE</span>
          </div>
        </div>

        {/* QTR-8A Sensor Array Live Telemetry Widget */}
        <div className="bg-slate-950 rounded-lg p-4 border border-slate-800">
          <div className="flex items-center justify-between mb-3 border-b border-slate-800/80 pb-2">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-sky-400" />
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">QTR-8A Reflectance Array</span>
            </div>
            <span className="text-[10px] text-slate-500 font-mono">0-1023 RAW</span>
          </div>

          <div className="grid grid-cols-8 gap-1.5">
            {qtrSensors.map((val, idx) => {
              const heightPercent = Math.min(100, Math.max(0, (val / 1023) * 100));
              return (
                <div key={idx} className="flex flex-col items-center bg-slate-900/60 p-2 rounded border border-slate-800">
                  <span className="text-[10px] text-slate-400 font-mono mb-1">S{idx + 1}</span>
                  
                  {/* Vertical Meter Bar */}
                  <div className="w-3.5 h-20 bg-slate-800 rounded flex items-end overflow-hidden p-0.5 border border-slate-700/50">
                    <div
                      className="w-full bg-gradient-to-t from-sky-500 to-emerald-400 rounded-sm transition-all duration-150"
                      style={{ height: `${heightPercent}%` }}
                    />
                  </div>

                  <span className="text-[9px] text-amber-400 font-mono mt-1.5 truncate max-w-full">{val}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Ultrasonic Safety Control Toggle */}
        <div className="bg-slate-950 rounded-lg p-4 border border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {ultrasonicActive ? (
              <ShieldCheck className="w-6 h-6 text-emerald-400" />
            ) : (
              <ShieldAlert className="w-6 h-6 text-rose-500" />
            )}
            <div>
              <p className="text-sm font-semibold text-slate-200">Obstacle Avoidance</p>
              <p className="text-xs text-slate-500">HC-SR04 (10cm Safety Stop)</p>
            </div>
          </div>
          <button
            onClick={toggleUltrasonic}
            className={`px-4 py-2 rounded-lg font-mono text-xs font-bold transition-all ${
              ultrasonicActive
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                : 'bg-rose-500/10 text-rose-500 border border-rose-500/30'
            }`}
          >
            {ultrasonicActive ? 'ENABLED' : 'DISABLED'}
          </button>
        </div>

        {/* Status Indicator */}
        <div className="bg-slate-950 rounded-lg p-4 text-center border border-slate-800">
          <span className="text-xs text-slate-500 uppercase tracking-widest block mb-1">State</span>
          <span className={`text-2xl font-mono font-bold ${
            currentStatus === 'FORWARD' ? 'text-emerald-400' :
            currentStatus === 'REVERSE' ? 'text-amber-400' : 'text-rose-500'
          }`}>
            {currentStatus}
          </span>
        </div>

        {/* Direct Action Controls */}
        <div className="flex flex-col items-center gap-3">
          <button
            disabled={loading}
            onClick={() => sendCommand('FORWARD')}
            className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg flex items-center justify-center gap-2 transition-all active:scale-[0.99]"
          >
            <ArrowUp className="w-5 h-5" /> FORWARD
          </button>

          <button
            disabled={loading}
            onClick={() => sendCommand('STOP')}
            className="w-full py-3.5 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded-lg flex items-center justify-center gap-2 transition-all active:scale-[0.99]"
          >
            <Square className="w-5 h-5" /> EMERGENCY STOP
          </button>

          <button
            disabled={loading}
            onClick={() => sendCommand('REVERSE')}
            className="w-full py-3.5 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-lg flex items-center justify-center gap-2 transition-all active:scale-[0.99]"
          >
            <ArrowDown className="w-5 h-5" /> REVERSE
          </button>
        </div>

      </div>
    </div>
  );
}