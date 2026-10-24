import React, { useState, useEffect } from 'react';
import {
  Shield, LogOut, Utensils, ClipboardList, Plus, Trash2, Edit3,
  CheckCircle, AlertTriangle, Scale, Lock, Mail, RefreshCw, X, Save,
  Battery, MapPin, Navigation, Wifi, QrCode, Printer, ArrowRight
} from 'lucide-react';
import { db, auth } from '../firebase';
import { ref, onValue, push, set, update, remove } from 'firebase/database';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { motion, AnimatePresence } from 'framer-motion';

const TABLES = ['Table 01', 'Table 02', 'Table 03', 'Table 04', 'Table 05', 'Table 06'];
const TAG_OPTIONS = ['veg', 'spicy', 'popular'];
const EMPTY_FOOD = { name: '', price: '', category: 'Mains', image: '', desc: '', tags: [], soldOut: false };

// What the robot should be told when an order is dispatched.
// Change ROBOT_DISPATCH_STATUS to whatever word your ESP8266 code expects.
const ROBOT_DISPATCH_STATUS = 'DELIVERING';

// ---- Order status flow ---------------------------------------------------
// PENDING -> PREPARING -> READY -> CONFIRMED & DISPATCHED (robot leaves) -> SERVED
// "CONFIRMED & DISPATCHED" is kept exactly as before so robot code that looks for CONFIRMED still works.
const STAGE_LABELS = ['Pending', 'Preparing', 'Ready', 'On the way', 'Served'];

const NEXT_ACTION = [
  { label: 'Start preparing', status: 'PREPARING' },
  { label: 'Mark ready', status: 'READY' },
  { label: 'Dispatch robot', status: 'CONFIRMED & DISPATCHED' },
  { label: 'Mark served', status: 'SERVED' },
  null,
];

const getStage = (status) => {
  const s = String(status || 'PENDING').toUpperCase();
  if (s.includes('SERVED') || s.includes('COMPLETED')) return 4;
  if (s.includes('CONFIRMED') || s.includes('DISPATCHED')) return 3;
  if (s.includes('READY')) return 2;
  if (s.includes('PREPAR') || s.includes('COOKING')) return 1;
  return 0;
};

const stageBadge = (stage) => {
  if (stage === 0) return 'bg-[#f2b632] text-[#3a1a0b]';
  if (stage === 1) return 'bg-[#b5542a] text-white';
  if (stage === 2) return 'bg-[#2e7d32] text-white';
  if (stage === 3) return 'bg-[#1f5f8b] text-white';
  return 'bg-[#3a1a0b]/15 text-[#3a1a0b]/70';
};

const normalizeTags = (tags) => {
  if (Array.isArray(tags)) return tags.map(t => String(t).trim().toLowerCase()).filter(Boolean);
  if (typeof tags === 'string') return tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
  return [];
};

// shared look
const inp = 'w-full bg-white border-2 border-[#3a1a0b]/25 px-3 py-2.5 text-sm focus:outline-none focus:border-[#3a1a0b]';
const lbl = 'f-cond uppercase tracking-widest text-xs block mb-1';
const btnRed = 'f-cond uppercase tracking-widest text-xs px-5 py-3 bg-[#d92b2b] text-white hover:bg-[#b82020] transition-colors';
const btnBrown = 'f-cond uppercase tracking-widest text-xs px-5 py-3 bg-[#3a1a0b] text-[#f2b632] hover:bg-[#2a1208] transition-colors';
const btnLine = 'f-cond uppercase tracking-widest text-xs px-4 py-3 border-2 border-[#3a1a0b]/30 hover:border-[#3a1a0b] transition-colors';

function Fonts() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Alfa+Slab+One&family=Oswald:wght@400;500;600&family=Montserrat:wght@400;500;600&display=swap');
      .f-slab { font-family: 'Alfa Slab One', Georgia, serif; font-weight: 400; }
      .f-cond { font-family: 'Oswald', 'Arial Narrow', sans-serif; }
      .f-body { font-family: 'Montserrat', system-ui, sans-serif; }
    `}</style>
  );
}

export default function AdminPanel() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const [activeTab, setActiveTab] = useState('orders'); // 'orders', 'menu', 'robot', or 'qr'

  // Data states
  const [orders, setOrders] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [robotWeight, setRobotWeight] = useState(0);
  const [showServed, setShowServed] = useState(false);
  const WEIGHT_LIMIT = 200; // Minimum weight threshold in grams to dispatch the robot

  // Robot Telemetry Detailed State
  const [robotStatusData, setRobotStatusData] = useState({
    battery: 0,
    assignedTable: 'None',
    location: 'Charging Dock',
    roadblock: false,
    status: 'IDLE'
  });

  // Modal states for Food Add/Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFood, setEditingFood] = useState(null);
  const [foodForm, setFoodForm] = useState(EMPTY_FOOD);
  const [customTag, setCustomTag] = useState('');

  // Monitor Authentication State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, [auth]);

  // Fetch Orders, Menu, and Robot Telemetry in Real-time
  useEffect(() => {
    if (!user) return;

    // 1. Listen to Orders
    const ordersRef = ref(db, 'orders');
    const unsubscribeOrders = onValue(ordersRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list = Object.keys(data).map(key => ({ id: key, ...data[key] }));
        setOrders(list.reverse());
      } else {
        setOrders([]);
      }
    });

    // 2. Listen to Menu Items
    const menuRef = ref(db, 'menu');
    const unsubscribeMenu = onValue(menuRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list = Object.keys(data).map(key => ({ id: key, ...data[key] }));
        setMenuItems(list);
      } else {
        setMenuItems([]);
      }
    });

    // 3. Listen to Robot Weight Sensor Telemetry
    const weightRef = ref(db, 'robotStatus/currentWeight');
    const unsubscribeWeight = onValue(weightRef, (snapshot) => {
      const weight = snapshot.val();
      setRobotWeight(weight !== null ? Number(weight) : 0);
    });

    // 4. Listen to Full Robot Status Node (Battery, Location, Roadblock, etc.)
    const robotStatusRef = ref(db, 'robotStatus');
    const unsubscribeRobotStatus = onValue(robotStatusRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setRobotStatusData({
          battery: data.battery || 0,
          assignedTable: data.assignedTable || 'None',
          location: data.location || 'Charging Dock',
          roadblock: data.roadblock || false,
          status: data.status || 'IDLE'
        });
      }
    });

    return () => {
      unsubscribeOrders();
      unsubscribeMenu();
      unsubscribeWeight();
      unsubscribeRobotStatus();
    };
  }, [user, db]);

  // Handle Secure Admin Login
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      console.error(err);
      setLoginError('Invalid email or password. Access denied.');
    }
  };

  // Handle Admin Logout
  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error(err);
    }
  };

  // Move an order to its next status (and send the robot when dispatching)
  const handleAdvanceOrder = async (order) => {
    const stage = getStage(order.status);
    const action = NEXT_ACTION[stage];
    if (!action) return;

    const isDispatch = action.status === 'CONFIRMED & DISPATCHED';

    // Weight rule only applies at the moment the robot is dispatched
    if (isDispatch && robotWeight < WEIGHT_LIMIT) {
      alert(`⚠️ Cannot dispatch! Robot weight sensor reads ${robotWeight}g. Please place the food package onto the robot container first (Required min: ${WEIGHT_LIMIT}g).`);
      return;
    }

    try {
      // one atomic write: order status + (on dispatch) the robot's destination
      const updates = { [`orders/${order.id}/status`]: action.status };
      if (isDispatch) {
        updates['robotStatus/assignedTable'] = order.tableName;
        updates['robotStatus/status'] = ROBOT_DISPATCH_STATUS;
        updates['robotStatus/currentOrderId'] = order.id;
      }
      await update(ref(db), updates);
    } catch (err) {
      console.error(err);
      alert('Failed to update order status.');
    }
  };

  // Delete Order Function
  const handleDeleteOrder = async (orderId) => {
    if (window.confirm('Are you sure you want to delete this order?')) {
      try {
        await remove(ref(db, `orders/${orderId}`));
      } catch (err) {
        console.error(err);
        alert('Failed to delete order.');
      }
    }
  };

  // Save or Update Food Item
  const handleSaveFood = async (e) => {
    e.preventDefault();
    if (!foodForm.name || !foodForm.price) {
      alert('Please fill out name and price.');
      return;
    }

    const { id, ...payload } = foodForm; // never write the id back into the record
    payload.tags = normalizeTags(payload.tags);
    payload.soldOut = !!payload.soldOut;

    try {
      if (editingFood) {
        await update(ref(db, `menu/${editingFood.id}`), payload);
      } else {
        const newFoodRef = push(ref(db, 'menu'));
        await set(newFoodRef, payload);
      }
      setIsModalOpen(false);
      setEditingFood(null);
      setFoodForm(EMPTY_FOOD);
      setCustomTag('');
    } catch (err) {
      console.error(err);
      alert('Failed to save food item.');
    }
  };

  // Toggle "Sold out" straight from the menu card
  const handleToggleSoldOut = async (item) => {
    try {
      await update(ref(db, `menu/${item.id}`), { soldOut: !item.soldOut });
    } catch (err) {
      console.error(err);
      alert('Failed to update item.');
    }
  };

  // Delete Food Item
  const handleDeleteFood = async (id) => {
    if (window.confirm('Are you sure you want to delete this menu item?')) {
      try {
        await remove(ref(db, `menu/${id}`));
      } catch (err) {
        console.error(err);
        alert('Failed to delete item.');
      }
    }
  };

  const toggleFoodTag = (tag) => {
    setFoodForm(f => {
      const tags = normalizeTags(f.tags);
      return { ...f, tags: tags.includes(tag) ? tags.filter(t => t !== tag) : [...tags, tag] };
    });
  };

  // Add a brand-new tag typed by the admin
  const addCustomTag = () => {
    const t = customTag.trim().toLowerCase().replace(/[^a-z0-9\- ]/g, '').replace(/\s+/g, ' ').slice(0, 20);
    if (!t) return;
    setFoodForm(f => {
      const tags = normalizeTags(f.tags);
      return tags.includes(t) ? f : { ...f, tags: [...tags, t] };
    });
    setCustomTag('');
  };

  // preset tags + any tag already used on the menu + tags on this form
  const allTagOptions = [...new Set([
    ...TAG_OPTIONS,
    ...menuItems.flatMap(i => normalizeTags(i.tags)),
    ...normalizeTags(foodForm.tags),
  ])];

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#f3ecdd] flex items-center justify-center text-[#3a1a0b]">
        <Fonts />
        <RefreshCw className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  // ================= SECURE LOGIN SCREEN =================
  if (!user) {
    return (
      <div className="min-h-screen bg-[#f2b632] text-[#3a1a0b] f-body flex items-center justify-center p-4">
        <Fonts />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white border-t-8 border-[#3a1a0b] p-8 max-w-md w-full space-y-6 shadow-2xl"
        >
          <div className="space-y-2">
            <div className="w-11 h-11 rounded-full bg-[#3a1a0b] flex items-center justify-center text-[#f2b632]">
              <Shield className="w-5 h-5" />
            </div>
            <h1 className="f-slab text-3xl">ADMIN LOGIN</h1>
            <p className="text-sm text-[#3a1a0b]/70">Udarata Bistro kitchen &amp; staff panel</p>
          </div>

          {loginError && (
            <div className="p-3 bg-[#d92b2b]/10 border border-[#d92b2b]/40 text-[#b82020] text-sm font-medium">
              {loginError}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className={lbl}>Email</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#3a1a0b]/50 absolute left-3 top-3.5" />
                <input
                  type="email"
                  required
                  placeholder="admin@udaratabistro.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`${inp} pl-10`}
                />
              </div>
            </div>

            <div>
              <label className={lbl}>Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#3a1a0b]/50 absolute left-3 top-3.5" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${inp} pl-10`}
                />
              </div>
            </div>

            <button type="submit" className={`${btnRed} w-full`}>Log in</button>
          </form>
        </motion.div>
      </div>
    );
  }

  const activeOrders = orders.filter(o => getStage(o.status) < 4);
  const shownOrders = showServed ? orders : activeOrders;
  const tabClass = (tab) => `f-cond uppercase tracking-widest text-xs flex items-center gap-2 px-4 py-2.5 border-2 transition-colors whitespace-nowrap ${
    activeTab === tab
      ? 'bg-[#3a1a0b] border-[#3a1a0b] text-[#f2b632]'
      : 'border-[#3a1a0b]/25 hover:border-[#3a1a0b]'
  }`;

  // ================= ADMIN DASHBOARD =================
  return (
    <div className="min-h-screen bg-[#f3ecdd] text-[#3a1a0b] f-body print:bg-white">
      <Fonts />

      {/* Top Navbar */}
      <header className="bg-[#3a1a0b] text-white sticky top-0 z-40 print:hidden">
        <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#f2b632] flex items-center justify-center text-[#3a1a0b]">
              <Shield className="w-4 h-4" />
            </div>
            <div className="leading-tight">
              <h1 className="f-cond uppercase tracking-wide text-lg font-semibold text-[#f2b632]">Kitchen &amp; Admin</h1>
              <p className="text-[11px] text-white/60">{user.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className={`hidden sm:flex items-center gap-2 px-3 py-1.5 text-xs f-cond uppercase tracking-wider ${
              robotWeight >= WEIGHT_LIMIT ? 'bg-[#2e7d32] text-white' : 'bg-[#f2b632] text-[#3a1a0b]'
            }`}>
              <Scale className="w-4 h-4" />
              Robot load {robotWeight}g · {robotWeight >= WEIGHT_LIMIT ? 'ready' : 'empty'}
            </div>
            <button
              onClick={handleLogout}
              className="f-cond uppercase tracking-widest text-xs flex items-center gap-2 px-3 py-2 border border-white/30 hover:bg-white/10 transition-colors"
            >
              <LogOut className="w-4 h-4" /> Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto p-4 md:p-8 space-y-6">

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 print:hidden">
          <button onClick={() => setActiveTab('orders')} className={tabClass('orders')}>
            <ClipboardList className="w-4 h-4" /> Live orders ({activeOrders.length})
          </button>
          <button onClick={() => setActiveTab('robot')} className={tabClass('robot')}>
            <Navigation className="w-4 h-4" /> Robot
          </button>
          <button onClick={() => setActiveTab('menu')} className={tabClass('menu')}>
            <Utensils className="w-4 h-4" /> Foods ({menuItems.length})
          </button>
          <button onClick={() => setActiveTab('qr')} className={tabClass('qr')}>
            <QrCode className="w-4 h-4" /> Table QR codes
          </button>
        </div>

        {/* ================= TAB 1: LIVE ORDERS ================= */}
        {activeTab === 'orders' && (
          <div className="space-y-5">
            <div className="bg-[#f2b632]/30 border border-[#f2b632] px-4 py-3 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3 text-sm">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>The robot can only be dispatched when the load sensor reads <strong>{WEIGHT_LIMIT}g or more</strong>.</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="sm:hidden f-cond uppercase tracking-wider text-xs">Load {robotWeight}g</span>
                <button onClick={() => setShowServed(v => !v)} className="f-cond uppercase tracking-widest text-xs underline">
                  {showServed ? 'Hide served' : 'Show served'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {shownOrders.length === 0 ? (
                <div className="col-span-full text-center py-16 text-[#3a1a0b]/60 space-y-2 border-2 border-dashed border-[#3a1a0b]/20">
                  <ClipboardList className="w-9 h-9 mx-auto opacity-40" />
                  <p className="text-sm">No orders right now.</p>
                </div>
              ) : (
                shownOrders.map((order) => {
                  const stage = getStage(order.status);
                  const action = NEXT_ACTION[stage];
                  const hasNotes = order.items?.some(it => it.note);
                  const isDispatchStep = action?.status === 'CONFIRMED & DISPATCHED';
                  return (
                    <motion.div
                      key={order.id}
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`bg-white border-t-4 shadow-sm p-5 space-y-4 flex flex-col justify-between ${
                        stage === 4 ? 'border-[#3a1a0b]/30 opacity-60' : hasNotes ? 'border-[#d92b2b]' : 'border-[#3a1a0b]'
                      }`}
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="f-slab text-2xl leading-none">{order.tableName}</p>
                            {order.timestamp && (
                              <p className="text-xs text-[#3a1a0b]/60 mt-1">{new Date(order.timestamp).toLocaleTimeString()}</p>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-1.5">
                            <span className={`f-cond uppercase tracking-widest text-[11px] px-2.5 py-1 ${stageBadge(stage)}`}>
                              {STAGE_LABELS[stage]}
                            </span>
                            {hasNotes && (
                              <span className="f-cond uppercase tracking-widest text-[10px] px-2 py-0.5 bg-[#d92b2b] text-white">
                                Has notes
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1 border-t border-dashed border-[#3a1a0b]/30 pt-3">
                          {order.items && order.items.map((item, idx) => (
                            <div key={idx} className="text-sm">
                              <div className="flex justify-between">
                                <span>{item.qty} × {item.name}</span>
                                <span className="text-[#3a1a0b]/60">LKR {item.price * item.qty}</span>
                              </div>
                              {item.note && (
                                <p className="mt-1 px-2 py-1 bg-[#f2b632]/40 border-l-4 border-[#d92b2b] text-xs font-semibold">
                                  NOTE: {item.note}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="border-t border-dashed border-[#3a1a0b]/30 pt-4 space-y-3">
                        <div className="flex justify-between items-baseline">
                          <span className="f-cond uppercase tracking-widest text-xs">Total</span>
                          <span className="f-slab text-xl text-[#d92b2b]">LKR {order.total}</span>
                        </div>

                        <div className="flex gap-2">
                          {action && (
                            <button
                              onClick={() => handleAdvanceOrder(order)}
                              className={`flex-1 flex items-center justify-center gap-2 ${isDispatchStep ? btnRed : btnBrown}`}
                            >
                              {isDispatchStep ? <Navigation className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
                              {action.label}
                            </button>
                          )}
                          {stage === 4 && (
                            <div className="flex-1 py-3 text-xs flex items-center justify-center gap-1.5 text-[#3a1a0b]/60">
                              <CheckCircle className="w-4 h-4" /> Served · table is free
                            </div>
                          )}
                          <button
                            onClick={() => handleDeleteOrder(order.id)}
                            className="px-3 border-2 border-[#d92b2b]/40 text-[#d92b2b] hover:bg-[#d92b2b] hover:text-white transition-colors"
                            title="Delete order"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 2: ROBOT ================= */}
        {activeTab === 'robot' && (
          <div className="space-y-5">
            <div className="flex items-end justify-between flex-wrap gap-3">
              <div>
                <h2 className="f-slab text-3xl">ROBOT STATUS</h2>
                <p className="text-sm text-[#3a1a0b]/70 mt-1">Live readings from the delivery robot.</p>
              </div>
              <span className="f-cond uppercase tracking-widest text-xs flex items-center gap-2 px-3 py-1.5 bg-[#2e7d32] text-white">
                <Wifi className="w-3.5 h-3.5" /> Live
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border-t-4 border-[#3a1a0b] p-5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="f-cond uppercase tracking-widest text-xs">Battery</span>
                  <Battery className="w-5 h-5" />
                </div>
                <p className="f-slab text-4xl">{robotStatusData.battery}%</p>
                <p className={`text-xs font-semibold ${robotStatusData.battery > 20 ? 'text-[#2e7d32]' : 'text-[#d92b2b]'}`}>
                  {robotStatusData.battery > 20 ? 'Good' : 'Low power'}
                </p>
              </div>

              <div className="bg-white border-t-4 border-[#3a1a0b] p-5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="f-cond uppercase tracking-widest text-xs">Going to</span>
                  <Navigation className="w-5 h-5" />
                </div>
                <p className="f-slab text-3xl">{robotStatusData.assignedTable}</p>
                <p className="text-xs font-semibold text-[#3a1a0b]/70">{robotStatusData.status}</p>
              </div>

              <div className="bg-white border-t-4 border-[#3a1a0b] p-5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="f-cond uppercase tracking-widest text-xs">Location</span>
                  <MapPin className="w-5 h-5" />
                </div>
                <p className="f-slab text-2xl leading-tight">{robotStatusData.location}</p>
              </div>

              <div className={`bg-white border-t-4 p-5 space-y-2 ${robotStatusData.roadblock ? 'border-[#d92b2b]' : 'border-[#2e7d32]'}`}>
                <div className="flex items-center justify-between">
                  <span className="f-cond uppercase tracking-widest text-xs">Path</span>
                  {robotStatusData.roadblock
                    ? <AlertTriangle className="w-5 h-5 text-[#d92b2b]" />
                    : <CheckCircle className="w-5 h-5 text-[#2e7d32]" />}
                </div>
                <p className={`f-slab text-2xl ${robotStatusData.roadblock ? 'text-[#d92b2b]' : 'text-[#2e7d32]'}`}>
                  {robotStatusData.roadblock ? 'BLOCKED' : 'CLEAR'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 3: MANAGE FOODS ================= */}
        {activeTab === 'menu' && (
          <div className="space-y-5">
            <div className="flex justify-between items-center flex-wrap gap-3">
              <h2 className="f-slab text-3xl">MENU</h2>
              <button
                onClick={() => { setEditingFood(null); setFoodForm(EMPTY_FOOD); setCustomTag(''); setIsModalOpen(true); }}
                className={`${btnRed} flex items-center gap-2`}
              >
                <Plus className="w-4 h-4" /> Add food item
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {menuItems.map((item) => (
                <div key={item.id} className={`bg-white shadow-sm flex flex-col justify-between ${item.soldOut ? 'opacity-70' : ''}`}>
                  <div>
                    <div className="h-40 bg-[#e4dccb] relative overflow-hidden">
                      <img src={item.image} alt={item.name} className={`w-full h-full object-cover ${item.soldOut ? 'grayscale' : ''}`} />
                      <span className="absolute top-3 right-3 f-cond uppercase tracking-widest text-[10px] px-2 py-1 bg-white">
                        {item.category}
                      </span>
                      {item.soldOut && (
                        <span className="absolute top-3 left-3 f-cond uppercase tracking-widest text-[10px] px-2 py-1 bg-[#d92b2b] text-white">
                          Sold out
                        </span>
                      )}
                    </div>
                    <div className="p-4 space-y-1.5">
                      <h3 className="f-cond uppercase text-lg">{item.name}</h3>
                      <p className="text-xs text-[#3a1a0b]/65 line-clamp-2">{item.desc}</p>
                      {normalizeTags(item.tags).length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {normalizeTags(item.tags).map(t => (
                            <span key={t} className="f-cond uppercase tracking-widest text-[10px] px-2 py-0.5 bg-[#f2b632]/50">
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="f-slab text-lg text-[#d92b2b] pt-1">LKR {item.price}</p>
                    </div>
                  </div>

                  <div className="p-4 pt-3 flex gap-2 border-t border-dashed border-[#3a1a0b]/25">
                    <button onClick={() => handleToggleSoldOut(item)} className={`${btnLine} flex-1 !px-2`}>
                      {item.soldOut ? 'Available' : 'Sold out'}
                    </button>
                    <button
                      onClick={() => { setEditingFood(item); setFoodForm({ ...EMPTY_FOOD, ...item, tags: normalizeTags(item.tags), soldOut: !!item.soldOut }); setCustomTag(''); setIsModalOpen(true); }}
                      className={`${btnLine} flex items-center gap-1.5`}
                    >
                      <Edit3 className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button
                      onClick={() => handleDeleteFood(item.id)}
                      className="px-3 border-2 border-[#d92b2b]/40 text-[#d92b2b] hover:bg-[#d92b2b] hover:text-white transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ================= TAB 4: TABLE QR CODES ================= */}
        {activeTab === 'qr' && (
          <div className="space-y-5">
            <div className="flex justify-between items-end flex-wrap gap-3 print:hidden">
              <div>
                <h2 className="f-slab text-3xl">TABLE QR CODES</h2>
                <p className="text-sm text-[#3a1a0b]/70 mt-1">
                  Each code opens the menu with that table already selected. Print one for every table.
                </p>
              </div>
              <button onClick={() => window.print()} className={`${btnRed} flex items-center gap-2`}>
                <Printer className="w-4 h-4" /> Print
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
              {TABLES.map(table => {
                const link = `${window.location.origin}/?table=${encodeURIComponent(table)}`;
                const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=10&data=${encodeURIComponent(link)}`;
                return (
                  <div key={table} className="bg-white border-2 border-[#3a1a0b] p-5 text-center space-y-3 break-inside-avoid">
                    <p className="f-slab text-2xl">{table}</p>
                    <img src={qrSrc} alt={`QR code for ${table}`} className="w-full max-w-[200px] mx-auto" />
                    <p className="f-cond uppercase tracking-widest text-xs">Scan to see the menu &amp; order</p>
                    <p className="text-[10px] text-[#3a1a0b]/50 break-all print:hidden">{link}</p>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-[#3a1a0b]/60 print:hidden">
              Print these only after the site is on its final address. The images come from the free api.qrserver.com service; to avoid an outside service, install the <span className="font-mono">qrcode.react</span> package.
            </p>
          </div>
        )}

      </main>

      {/* Add / Edit Food Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 print:hidden">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="bg-white border-t-8 border-[#f2b632] max-w-lg w-full p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between">
                <h3 className="f-slab text-2xl">{editingFood ? 'EDIT FOOD' : 'NEW FOOD'}</h3>
                <button onClick={() => setIsModalOpen(false)} className="p-1 hover:bg-[#3a1a0b]/10">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveFood} className="space-y-4">
                <div>
                  <label className={lbl}>Food name</label>
                  <input
                    type="text"
                    required
                    value={foodForm.name}
                    onChange={(e) => setFoodForm({ ...foodForm, name: e.target.value })}
                    className={inp}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={lbl}>Price (LKR)</label>
                    <input
                      type="number"
                      required
                      value={foodForm.price}
                      onChange={(e) => setFoodForm({ ...foodForm, price: Number(e.target.value) })}
                      className={inp}
                    />
                  </div>
                  <div>
                    <label className={lbl}>Category</label>
                    <select
                      value={foodForm.category}
                      onChange={(e) => setFoodForm({ ...foodForm, category: e.target.value })}
                      className={inp}
                    >
                      <option value="Mains">Mains</option>
                      <option value="Appetizers">Appetizers</option>
                      <option value="Beverages">Beverages</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className={lbl}>Image URL</label>
                  <input
                    type="text"
                    value={foodForm.image}
                    onChange={(e) => setFoodForm({ ...foodForm, image: e.target.value })}
                    placeholder="https://images.unsplash.com/..."
                    className={`${inp} text-xs`}
                  />
                </div>

                <div>
                  <label className={lbl}>Description</label>
                  <textarea
                    rows="3"
                    value={foodForm.desc}
                    onChange={(e) => setFoodForm({ ...foodForm, desc: e.target.value })}
                    className={inp}
                  />
                </div>

                {/* Tags */}
                <div className="space-y-2">
                  <label className={lbl}>Tags</label>
                  <div className="flex flex-wrap gap-2">
                    {allTagOptions.map(tag => {
                      const on = normalizeTags(foodForm.tags).includes(tag);
                      return (
                        <button
                          type="button"
                          key={tag}
                          onClick={() => toggleFoodTag(tag)}
                          className={`f-cond uppercase tracking-widest text-xs px-3.5 py-1.5 rounded-full border-2 transition-colors ${
                            on
                              ? 'bg-[#d92b2b] border-[#d92b2b] text-white'
                              : 'border-[#3a1a0b]/25 hover:border-[#3a1a0b]'
                          }`}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={customTag}
                      onChange={(e) => setCustomTag(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomTag(); } }}
                      placeholder="New tag, e.g. gluten-free"
                      maxLength={20}
                      className={`${inp} flex-1`}
                    />
                    <button type="button" onClick={addCustomTag} className={`${btnBrown} flex items-center gap-1.5`}>
                      <Plus className="w-3.5 h-3.5" /> Add tag
                    </button>
                  </div>
                  <p className="text-[11px] text-[#3a1a0b]/60">
                    New tags appear as filter buttons on the customer menu once a dish uses them.
                  </p>
                </div>

                {/* Sold out */}
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={!!foodForm.soldOut}
                    onChange={(e) => setFoodForm({ ...foodForm, soldOut: e.target.checked })}
                    className="w-4 h-4 accent-[#d92b2b]"
                  />
                  <span className="text-sm">Mark as sold out (customers can't order it)</span>
                </label>

                <div className="pt-1 flex gap-3">
                  <button type="button" onClick={() => setIsModalOpen(false)} className={`${btnLine} flex-1`}>
                    Cancel
                  </button>
                  <button type="submit" className={`${btnRed} flex-1 flex items-center justify-center gap-2`}>
                    <Save className="w-4 h-4" /> Save item
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}