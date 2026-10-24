import { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { ref, onValue } from 'firebase/database';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { Lock, Mail, Battery, MapPin, Volume2, Bot, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';

// Dark screen on purpose: it's mounted on the robot, so it should be easy on the eyes
// and readable from a distance. Warm yellow echoes the restaurant site.
const YELLOW = '#f2b632';

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
    status: 'ARRIVED',
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
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.pitch = 1.0;
      utterance.rate = 0.9;
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

  const fonts = (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Alfa+Slab+One&family=Oswald:wght@400;500;600&display=swap');
      .f-slab { font-family: 'Alfa Slab One', Georgia, serif; font-weight: 400; }
      .f-cond { font-family: 'Oswald', 'Arial Narrow', sans-serif; }
    `}</style>
  );

  if (authLoading) {
    return (
      <div className="w-screen h-screen bg-[#1a0e08] flex items-center justify-center" style={{ color: YELLOW }}>
        {fonts}
        <RefreshCw className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  // ================= LOGIN SCREEN =================
  if (!user) {
    return (
      <div className="w-screen h-screen bg-[#1a0e08] text-white flex items-center justify-center p-6">
        {fonts}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#2a1810] border-t-4 p-6 w-full max-w-sm space-y-5"
          style={{ borderColor: YELLOW }}
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full flex items-center justify-center text-[#1a0e08]" style={{ background: YELLOW }}>
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h1 className="f-slab text-xl leading-none">ROBOT DISPLAY</h1>
              <p className="f-cond uppercase tracking-widest text-[11px] text-white/60 mt-1">Staff login</p>
            </div>
          </div>

          {loginError && (
            <div className="p-3 bg-[#d92b2b]/20 border border-[#d92b2b]/50 text-sm text-center">
              {loginError}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="f-cond uppercase tracking-widest text-[11px] text-white/70 block mb-1">Email</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-white/40 absolute left-3 top-3" />
                <input
                  type="email"
                  required
                  placeholder="admin@udaratabistro.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-[#1a0e08] border border-white/20 pl-9 pr-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#f2b632]"
                />
              </div>
            </div>

            <div>
              <label className="f-cond uppercase tracking-widest text-[11px] text-white/70 block mb-1">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-white/40 absolute left-3 top-3" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[#1a0e08] border border-white/20 pl-9 pr-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#f2b632]"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 f-cond uppercase tracking-widest text-sm text-[#1a0e08] hover:brightness-110 transition"
              style={{ background: YELLOW }}
            >
              Unlock display
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  // ================= LANDSCAPE ROBOT FACE =================
  return (
    <div className="fixed inset-0 w-screen h-screen bg-[#1a0e08] text-white flex items-center justify-between px-8 py-4 overflow-hidden select-none z-50">
      {fonts}

      {/* LEFT: robot id & battery */}
      <div className="flex flex-col justify-center gap-3 w-40">
        <div className="flex items-center gap-2 px-3 py-2 bg-[#2a1810]">
          <span className="w-2.5 h-2.5 rounded-full bg-[#4caf50] animate-pulse" />
          <span className="f-cond uppercase tracking-widest text-sm">AGV-01</span>
        </div>

        <div className="flex items-center gap-2 px-3 py-2 bg-[#2a1810]" style={{ color: robotData.battery > 20 ? YELLOW : '#ff6b5e' }}>
          <Battery className="w-5 h-5" />
          <span className="f-cond text-base font-medium">{robotData.battery}%</span>
        </div>

        <button
          onClick={() => signOut(auth)}
          className="f-cond uppercase tracking-widest text-[11px] text-white/40 hover:text-white/80 underline text-left px-1"
        >
          Lock session
        </button>
      </div>

      {/* CENTER: eyes & table */}
      <div className="flex flex-col items-center justify-center gap-6">
        <div className="flex gap-14 items-center justify-center">
          {[0, 1].map(i => (
            <motion.div
              key={i}
              animate={{ scaleY: [1, 0.1, 1] }}
              transition={{ repeat: Infinity, duration: 0.35, repeatDelay: 3.5 }}
              className="w-16 h-28 rounded-full"
              style={{ background: YELLOW, boxShadow: '0 0 36px rgba(242,182,50,0.45)' }}
            />
          ))}
        </div>

        <div className="flex items-center gap-2 px-6 py-2 f-slab text-2xl" style={{ background: YELLOW, color: '#1a0e08' }}>
          <MapPin className="w-5 h-5" />
          <span>{robotData.assignedTable}</span>
        </div>
      </div>

      {/* RIGHT: message & replay */}
      <div className="flex flex-col justify-center gap-3 max-w-xs w-full">
        <motion.div
          key={robotData.message}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#2a1810] border-l-4 p-4 space-y-1"
          style={{ borderColor: YELLOW }}
        >
          <p className="f-cond uppercase tracking-widest text-[11px]" style={{ color: YELLOW }}>Message</p>
          <p className="f-cond text-xl leading-snug">{robotData.message}</p>
        </motion.div>

        <button
          onClick={() => speakMessage(robotData.message)}
          className="w-full py-3 border border-white/25 hover:border-[#f2b632] f-cond uppercase tracking-widest text-xs flex items-center justify-center gap-2 transition-colors active:scale-95"
        >
          <Volume2 className="w-4 h-4" style={{ color: YELLOW }} /> Replay voice
        </button>
      </div>
    </div>
  );
}