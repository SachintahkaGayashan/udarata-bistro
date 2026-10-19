import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { ref, onValue } from 'firebase/database';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { Shield, Lock, Mail, Battery, MapPin, Volume2, Bot, AlertCircle, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';

export default function RobotFace() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // Robot State
  const [robotData, setRobotData] = useState({
    battery: 100,
    assignedTable: 'Table 1',
    status: 'ARRIVED', // IDLE, MOVING, ARRIVED, OBSTACLE
    message: 'Please take your order!'
  });

  // Monitor Authentication State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, [auth]);

  // Real-time Firebase Sync
  useEffect(() => {
    if (!user) return;

    const robotRef = ref(db, 'robotStatus');
    const unsubscribeRobot = onValue(robotRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setRobotData({
          battery: data.battery ?? 100,
          assignedTable: data.assignedTable ?? 'Table 1',
          status: data.status ?? 'ARRIVED',
          message: data.message ?? 'Please take your order!'
        });
      }
    });

    return () => unsubscribeRobot();
  }, [user]);

  // Text-to-Speech Function (Audio Output)
  const speakMessage = (text) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel(); // Stop ongoing speech
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.pitch = 1.0;
      utterance.rate = 0.9; // Slightly slower for clear understanding
      utterance.lang = 'en-US';
      window.speechSynthesis.speak(utterance);
    }
  };

  // Trigger Audio whenever status/message changes
  useEffect(() => {
    if (user && robotData.message) {
      speakMessage(robotData.message);
    }
  }, [robotData.message, robotData.status, user]);

  // Handle Login
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      console.error(err);
      setLoginError('Invalid Email or Password.');
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-emerald-400">
        <RefreshCw className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  // ================= 🔒 LOGIN SCREEN FOR SMARTPHONE =================
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute w-[300px] h-[300px] bg-emerald-500/10 rounded-full blur-[90px] pointer-events-none" />

        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-slate-900/90 backdrop-blur-2xl border border-slate-800 rounded-3xl p-6 w-full max-w-sm space-y-6 shadow-2xl relative z-10"
        >
          <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto text-emerald-400">
            <Bot className="w-7 h-7" />
          </div>

          <div className="text-center space-y-1">
            <h1 className="text-xl font-black text-white tracking-tight">Robot Display Unit</h1>
            <p className="text-xs text-slate-400">Secure Audio & Visual Interface</p>
          </div>

          {loginError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs text-center font-medium">
              {loginError}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Admin Email</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                <input
                  type="email"
                  required
                  placeholder="admin@udaratabistro.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 text-slate-950 font-extrabold rounded-xl shadow-lg text-xs"
            >
              Unlock Robot Display
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  // ================= 🤖 ROBOT FACE / DISPLAY UI =================
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-6 relative overflow-hidden select-none">
      
      {/* Top Status Bar */}
      <div className="flex items-center justify-between bg-slate-900/80 border border-slate-800/80 px-4 py-2.5 rounded-2xl backdrop-blur-md z-10">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-bold text-slate-300 font-mono">AGV-01</span>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono font-bold">
          <div className="flex items-center gap-1.5 text-emerald-400">
            <Battery className="w-4 h-4" />
            <span>{robotData.battery}%</span>
          </div>
          <button 
            onClick={() => signOut(auth)} 
            className="text-[10px] text-slate-500 hover:text-slate-300 underline"
          >
            Lock
          </button>
        </div>
      </div>

      {/* Main Animated Expression / Face Area */}
      <div className="flex-1 flex flex-col items-center justify-center my-6 space-y-8 z-10">
        
        {/* Animated Robot Eyes */}
        <div className="flex gap-8 items-center justify-center">
          <motion.div 
            animate={{ scaleY: [1, 0.1, 1] }} 
            transition={{ repeat: Infinity, duration: 4, repeatDelay: 3 }}
            className="w-16 h-28 bg-gradient-to-b from-emerald-400 to-teal-500 rounded-full shadow-[0_0_35px_rgba(52,211,153,0.6)]" 
          />
          <motion.div 
            animate={{ scaleY: [1, 0.1, 1] }} 
            transition={{ repeat: Infinity, duration: 4, repeatDelay: 3 }}
            className="w-16 h-28 bg-gradient-to-b from-emerald-400 to-teal-500 rounded-full shadow-[0_0_35px_rgba(52,211,153,0.6)]" 
          />
        </div>

        {/* Current Table Location Badge */}
        <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 px-5 py-2 rounded-2xl text-emerald-400 font-mono font-black text-lg shadow-lg">
          <MapPin className="w-5 h-5 animate-bounce" />
          <span>{robotData.assignedTable}</span>
        </div>

        {/* Warning / Message Speech Box */}
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-slate-900/90 border border-slate-800 p-5 rounded-3xl text-center max-w-xs w-full shadow-2xl space-y-2 relative"
        >
          <div className="flex items-center justify-center gap-2 text-amber-400 text-xs font-extrabold uppercase tracking-widest">
            <AlertCircle className="w-4 h-4" />
            <span>Notice</span>
          </div>
          <p className="text-base font-extrabold text-white leading-snug">
            "{robotData.message}"
          </p>
        </motion.div>
      </div>

      {/* Bottom Audio Trigger Bar */}
      <div className="z-10">
        <button
          onClick={() => speakMessage(robotData.message)}
          className="w-full py-3.5 bg-slate-900 border border-slate-800 hover:border-emerald-500/50 rounded-2xl text-slate-300 font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-xl active:scale-95"
        >
          <Volume2 className="w-4 h-4 text-emerald-400 animate-pulse" /> Replay Voice Message
        </button>
      </div>

      {/* Ambient Lighting */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none" />
    </div>
  );
}