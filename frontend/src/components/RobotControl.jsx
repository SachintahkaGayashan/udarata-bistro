import React, { useState, useEffect } from 'react';
import { ArrowUp, ArrowDown, Square, Activity, ShieldAlert, ShieldCheck, Eye, Lock, Mail, LogOut } from 'lucide-react';
import { ref, onValue } from 'firebase/database';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../firebase';

const API_BASE = import.meta.env.VITE_ROBOT_API || 'http://localhost:5000';

export default function RobotControl() {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const [currentStatus, setCurrentStatus] = useState('STOPPED');
  const [ultrasonicActive, setUltrasonicActive] = useState(true);
  const [qtrSensors, setQtrSensors] = useState([0, 0, 0, 0, 0, 0, 0, 0]);
  const [loading, setLoading] = useState(false);

  // Auth state + admin claim check
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const token = await u.getIdTokenResult(true);
        setIsAdmin(token.claims.admin === true);
      } else {
        setIsAdmin(false);
      }
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  // QTR sensor listener (admin only)
  useEffect(() => {
    if (!user || !isAdmin) return;
    const qtrRef = ref(db, 'QTR_Sensors/s');
    const unsub = onValue(qtrRef, (snapshot) => {
      const data = snapshot.val();
      if (data && Array.isArray(data)) setQtrSensors(data);
    });
    return () => unsub();
  }, [user, isAdmin]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      console.error(err);
      setLoginError('Invalid email or password.');
    }
  };

  const authedPost = async (path, body) => {
    const token = await auth.currentUser.getIdToken();
    return fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  };

  const sendCommand = async (command) => {
    setLoading(true);
    try {
      const res = await authedPost('/api/robot/command', { command });
      if (res.ok) setCurrentStatus(command);
      else console.error('Command rejected:', res.status);
    } catch (err) {
      console.error('Command error:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleUltrasonic = async () => {
    const nextState = !ultrasonicActive;
    try {
      const res = await authedPost('/api/robot/ultrasonic', { enabled: nextState });
      if (res.ok) setUltrasonicActive(nextState);
    } catch (err) {
      console.error('Ultrasonic toggle error:', err);
    }
  };

  // ---------- Screens ----------
  if (authLoading) {
    return <div className="min-h-screen bg-slate-950 text-slate-400 flex items-center justify-center">Loading…</div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <form onSubmit={handleLogin} className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
          <h1 className="text-lg font-bold">AGV CONTROL LOGIN</h1>
          {loginError && <p className="text-sm text-rose-400">{loginError}</p>}
          <div className="relative">
            <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="Email" className="w-full bg-slate-950 border border-slate-700 rounded pl-9 pr-3 py-2.5 text-sm" />
          </div>
          <div className="relative">
            <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="Password" className="w-full bg-slate-950 border border-slate-700 rounded pl-9 pr-3 py-2.5 text-sm" />
          </div>
          <button type="submit" className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 rounded font-semibold">Log in</button>
        </form>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="max-w-sm text-center space-y-4">
          <ShieldAlert className="w-10 h-10 text-rose-500 mx-auto" />
          <p className="text-sm">ඔබට මෙම පිටුවට ප්‍රවේශය නැත (admin පමණයි).</p>
          <button onClick={() => signOut(auth)} className="px-4 py-2 border border-slate-700 rounded text-sm">Logout</button>
        </div>
      </div>
    );
  }

  // ---------- Control UI (admin only) ----------
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-xl font-bold tracking-wide text-white">AGV TELEMETRY & CONTROL</h1>
            <p className="text-xs text-slate-400">{user.email}</p>
          </div>
          <div className="flex items-center gap-3">
            <Activity className="w-4 h-4 text-emerald-400 animate-pulse" />
            <button onClick={() => signOut(auth)} className="flex items-center gap-1 text-xs text-slate-400 hover:text-white">
              <LogOut className="w-4 h-4" /> Logout
            </button>
          </div>
        </div>

        {/* QTR-8A Sensor Array */}
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

        {/* Ultrasonic toggle */}
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

        {/* State */}
        <div className="bg-slate-950 rounded-lg p-4 text-center border border-slate-800">
          <span className="text-xs text-slate-500 uppercase tracking-widest block mb-1">State</span>
          <span className={`text-2xl font-mono font-bold ${
            currentStatus === 'FORWARD' ? 'text-emerald-400' :
            currentStatus === 'REVERSE' ? 'text-amber-400' : 'text-rose-500'
          }`}>
            {currentStatus}
          </span>
        </div>

        {/* Controls */}
        <div className="flex flex-col items-center gap-3">
          <button
            disabled={loading}
            onClick={() => sendCommand('FORWARD')}
            className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg flex items-center justify-center gap-2 transition-all active:scale-[0.99] disabled:opacity-50"
          >
            <ArrowUp className="w-5 h-5" /> FORWARD
          </button>

          <button
            disabled={loading}
            onClick={() => sendCommand('STOP')}
            className="w-full py-3.5 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded-lg flex items-center justify-center gap-2 transition-all active:scale-[0.99] disabled:opacity-50"
          >
            <Square className="w-5 h-5" /> EMERGENCY STOP
          </button>

          <button
            disabled={loading}
            onClick={() => sendCommand('REVERSE')}
            className="w-full py-3.5 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-lg flex items-center justify-center gap-2 transition-all active:scale-[0.99] disabled:opacity-50"
          >
            <ArrowDown className="w-5 h-5" /> REVERSE
          </button>
        </div>

      </div>
    </div>
  );
}