import React, { useState, useEffect } from 'react';
import { ShoppingBag, Plus, Minus, Check, X, Utensils, Search } from 'lucide-react';
import { getDatabase, ref, push, set, onValue } from 'firebase/database';
import { motion, AnimatePresence } from 'framer-motion';

const CATEGORIES = ['All', 'Mains', 'Appetizers', 'Beverages'];
const TABLES = ['Table 01', 'Table 02', 'Table 03', 'Table 04', 'Table 05', 'Table 06'];

const NAV = [
  { id: 'home', label: 'Home' },
  { id: 'menu', label: 'Menu' },
  { id: 'my-orders', label: 'Orders' },
  { id: 'about', label: 'About' },
  { id: 'contact', label: 'Contact' },
];

const FALLBACK_IMG = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80';

// colours: yellow #f2b632 · brown #3a1a0b · red #d92b2b
const PATTERN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='90' height='90' viewBox='0 0 90 90' fill='none' stroke='%23e3a41c' stroke-width='2' stroke-linecap='round'%3E%3Ccircle cx='14' cy='16' r='6'/%3E%3Cpath d='M58 12v14M52 12v8a6 6 0 0 0 12 0v-8'/%3E%3Cpath d='M20 60l10 10M30 60L20 70'/%3E%3Crect x='62' y='56' width='16' height='12' rx='4'/%3E%3Ccircle cx='46' cy='46' r='2'/%3E%3C/svg%3E")`;

// ---- dietary tags: uses item.tags from Firebase (array or "a, b" string), plus a light guess from name/desc
const getTags = (item) => {
  const raw = Array.isArray(item.tags) ? item.tags : typeof item.tags === 'string' ? item.tags.split(',') : [];
  const set = new Set(raw.map(t => String(t).trim().toLowerCase()).filter(Boolean));
  const text = `${item.name || ''} ${item.desc || ''}`.toLowerCase();
  if (/\bveg(etable|etarian|an)?\b/.test(text) && !/chicken|fish|egg|beef|pork|mutton|prawn|seafood|meat/.test(text)) set.add('veg');
  if (/spicy|chil+i|devil+ed|fiery/.test(text)) set.add('spicy');
  return [...set];
};

const tagStyle = (tag) => {
  if (tag === 'veg' || tag === 'vegan') return 'bg-[#2e7d32]/15 text-[#2e7d32]';
  if (tag === 'spicy') return 'bg-[#d92b2b]/15 text-[#d92b2b]';
  return 'bg-[#f2b632]/40 text-[#3a1a0b]';
};

// ---- order progress
// Matches the admin flow: PENDING -> PREPARING -> READY -> CONFIRMED & DISPATCHED -> SERVED
const STEPS = ['Received', 'Preparing', 'Ready', 'On the way', 'Served'];

const getStage = (status) => {
  const s = String(status || 'PENDING').toUpperCase();
  if (s.includes('SERVED') || s.includes('COMPLETED')) return 4;
  if (s.includes('CONFIRMED') || s.includes('DISPATCHED')) return 3;
  if (s.includes('READY')) return 2;
  if (s.includes('PREPAR') || s.includes('COOKING')) return 1;
  return 0;
};

// an order keeps its table busy until it is served
const isActiveOrder = (o) => !!o.status && !/COMPLETED|SERVED/.test(String(o.status).toUpperCase());

const RECENT_MS = 3 * 60 * 60 * 1000; // customers only see their table's orders from the last 3 hours

// QR links look like /?table=Table%2003 (also accepts ?table=3)
const getTableFromUrl = () => {
  try {
    const raw = new URLSearchParams(window.location.search).get('table');
    if (!raw) return '';
    const n = parseInt(String(raw).replace(/\D/g, ''), 10);
    return TABLES.find(t => parseInt(t.replace(/\D/g, ''), 10) === n) || '';
  } catch {
    return '';
  }
};

function OrderProgress({ status }) {
  const stage = getStage(status);
  return (
    <div className="flex items-start">
      {STEPS.map((label, i) => {
        const last = STEPS.length - 1;
        const done = i < stage || stage === last;
        const current = i === stage && stage < last;
        return (
          <React.Fragment key={label}>
            <div className="flex flex-col items-center gap-1 w-12">
              <motion.span
                initial={false}
                animate={{ scale: current ? 1.15 : 1 }}
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] f-cond ${
                  done ? 'bg-[#2e7d32] text-white' : current ? 'bg-[#f2b632] text-[#3a1a0b] ring-4 ring-[#f2b632]/40' : 'bg-[#3a1a0b]/10 text-[#3a1a0b]/50'
                }`}
              >
                {done ? <Check className="w-3 h-3" /> : i + 1}
              </motion.span>
              <span className={`f-cond uppercase tracking-wider text-[10px] ${i <= stage ? 'text-[#3a1a0b]' : 'text-[#3a1a0b]/40'}`}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className="flex-1 h-0.5 mt-3 bg-[#3a1a0b]/10 overflow-hidden">
                <motion.div
                  initial={false}
                  animate={{ width: i < stage ? '100%' : '0%' }}
                  transition={{ duration: 0.5 }}
                  className="h-full bg-[#2e7d32]"
                />
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } },
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.15 } },
};

export default function CustomerMenu() {
  const [cart, setCart] = useState([]);
  // a table from the QR link wins and is locked; otherwise fall back to the saved choice
  const lockedTable = getTableFromUrl();
  const [tableName, setTableName] = useState(() => {
    if (lockedTable) {
      localStorage.setItem('bistro_kandy_table', lockedTable);
      return lockedTable;
    }
    return localStorage.getItem('bistro_kandy_table') || '';
  });
  const [activeCategory, setActiveCategory] = useState('All');
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [menuItems, setMenuItems] = useState([]);
  const [allOrders, setAllOrders] = useState([]);
  const [activeTab, setActiveTab] = useState('home');
  const [showCart, setShowCart] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTags, setActiveTags] = useState([]);

  useEffect(() => {
    const db = getDatabase();

    // Menu Listener
    const menuRef = ref(db, 'menu');
    const unsubMenu = onValue(menuRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const itemsList = Object.keys(data).map(key => ({ id: key, ...data[key] }));
        setMenuItems(itemsList);
      } else {
        setMenuItems([]);
      }
    });

    // Orders Listener
    const ordersRef = ref(db, 'orders');
    const unsubOrders = onValue(ordersRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const ordersList = Object.keys(data).map(key => ({ id: key, ...data[key] }));
        setAllOrders(ordersList);
      } else {
        setAllOrders([]);
      }
    });

    return () => {
      unsubMenu();
      unsubOrders();
    };
  }, []);

  // close the cart drawer once an order goes through
  useEffect(() => {
    if (orderPlaced) setShowCart(false);
  }, [orderPlaced]);

  const handleTableSelection = (table) => {
    setTableName(table);
    if (table) {
      localStorage.setItem('bistro_kandy_table', table);
    } else {
      localStorage.removeItem('bistro_kandy_table');
    }
  };

  const scrollToSection = (id) => {
    setActiveTab(id);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const allTags = [...new Set(menuItems.flatMap(getTags))];

  const toggleTag = (tag) => {
    setActiveTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  const filteredItems = menuItems.filter(item => {
    if (activeCategory !== 'All' && item.category !== activeCategory) return false;
    const q = search.trim().toLowerCase();
    if (q && !`${item.name || ''} ${item.desc || ''} ${item.category || ''}`.toLowerCase().includes(q)) return false;
    if (activeTags.length > 0) {
      const tags = getTags(item);
      if (!activeTags.every(t => tags.includes(t))) return false;
    }
    return true;
  });

  const addToCart = (item) => {
    if (item.soldOut) return;
    setCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        return prev.map(i => i.id === item.id ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, { ...item, qty: 1 }];
    });
  };

  const updateQty = (id, delta) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const newQty = item.qty + delta;
        return newQty > 0 ? { ...item, qty: newQty } : null;
      }
      return item;
    }).filter(Boolean));
  };

  const updateNote = (id, note) => {
    setCart(prev => prev.map(item => item.id === id ? { ...item, note } : item));
  };

  const calculateTotal = () => {
    return cart.reduce((sum, item) => sum + (Number(item.price) * item.qty), 0);
  };

  const handleCheckout = async (e) => {
    e.preventDefault();
    if (!tableName) {
      alert('لطفاً / Please select your table number from the menu cart before ordering!');
      return;
    }
    if (cart.length === 0) {
      alert('Your cart is empty. Please select items to order.');
      return;
    }

    const activeTableOrder = allOrders.find(
      order => order.tableName === tableName && isActiveOrder(order)
    );

    if (activeTableOrder) {
      alert(`⚠️ ${tableName} is currently occupied with an active order (${activeTableOrder.status}). Please choose another table or wait until the current order completes.`);
      return;
    }

    setLoading(true);
    try {
      const db = getDatabase();
      const ordersRef = ref(db, 'orders');
      const newOrderRef = push(ordersRef);

      await set(newOrderRef, {
        tableName: tableName,
        items: cart,
        total: calculateTotal(),
        status: 'PENDING',
        paymentMethod: 'Pay at Counter',
        timestamp: Date.now()
      });

      setOrderPlaced(true);
      setCart([]);
      setTimeout(() => setOrderPlaced(false), 7000);
    } catch (err) {
      console.error('Order error:', err);
      alert('Failed to place order. Please check your network connection.');
    } finally {
      setLoading(false);
    }
  };

  const cartCount = cart.reduce((a, c) => a + c.qty, 0);
  const qtyInCart = (id) => cart.find(i => i.id === id)?.qty || 0;
  // customers only see their own table's recent orders
  const visibleOrders = tableName
    ? allOrders.filter(o => o.tableName === tableName && Date.now() - Number(o.timestamp || 0) < RECENT_MS)
    : [];

  const withImages = menuItems.filter(i => i.image);
  const pickImg = (n) => (withImages.length ? withImages[n % withImages.length].image : FALLBACK_IMG);
  const heroImg = pickImg(0);
  const tiles = [
    { kicker: 'Try it today', title: 'Most popular dish', img: pickImg(0), tall: true },
    { kicker: 'Try it today', title: 'More fun, more taste', img: pickImg(1) },
    { kicker: 'Try it today', title: 'Fresh & spicy', img: pickImg(2) },
  ];

  const statusStyle = (status) => {
    if (!status || status === 'PENDING') return 'bg-[#f2b632] text-[#3a1a0b]';
    if (status.includes('CONFIRMED')) return 'bg-[#2e7d32] text-white';
    return 'bg-[#3a1a0b] text-white';
  };

  const wrap = 'max-w-6xl mx-auto px-4 md:px-6';

  return (
    <div className="min-h-screen bg-white text-[#3a1a0b] f-body scroll-smooth">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Alfa+Slab+One&family=Oswald:wght@400;500;600&family=Montserrat:wght@400;500;600&display=swap');
        .f-slab { font-family: 'Alfa Slab One', Georgia, serif; font-weight: 400; }
        .f-cond { font-family: 'Oswald', 'Arial Narrow', sans-serif; }
        .f-body { font-family: 'Montserrat', system-ui, sans-serif; }
        @keyframes drift { to { background-position: 90px 90px; } }
        .drift { animation: drift 40s linear infinite; }
        @keyframes pulse-ring { 0% { box-shadow: 0 0 0 0 rgba(217,43,43,0.5); } 100% { box-shadow: 0 0 0 16px rgba(217,43,43,0); } }
        .pulse-ring { animation: pulse-ring 2s ease-out infinite; }
        @media (prefers-reduced-motion: reduce) { .drift, .pulse-ring { animation: none; } }
      `}</style>

      {/* HEADER */}
      <motion.header
        initial={{ y: -70, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="sticky top-0 z-40 bg-[#f2b632] border-b border-[#3a1a0b]/10"
        style={{ backgroundImage: PATTERN }}
      >
        <div className={`${wrap} h-16 flex items-center justify-between`}>
          <button onClick={() => scrollToSection('home')} className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-full bg-[#3a1a0b] flex items-center justify-center">
              <Utensils className="w-4 h-4 text-[#f2b632]" />
            </span>
            <span className="f-cond text-xl font-semibold uppercase tracking-wide leading-none">
              Udarata Bistro
            </span>
          </button>

          <div className="flex items-center gap-6">
            <nav className="hidden md:flex items-center gap-6">
              {NAV.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => scrollToSection(tab.id)}
                  className={`f-cond text-sm uppercase tracking-[0.18em] pb-0.5 border-b-2 transition-colors ${
                    activeTab === tab.id ? 'border-[#d92b2b]' : 'border-transparent hover:border-[#3a1a0b]/40'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>

            <button
              onClick={() => setShowCart(true)}
              className="f-cond uppercase tracking-wider text-sm flex items-center gap-2 px-4 py-2 bg-[#d92b2b] text-white hover:bg-[#b82020] transition-colors"
            >
              <ShoppingBag className="w-4 h-4" />
              Order
              {cartCount > 0 && (
                <motion.span
                  key={cartCount}
                  initial={{ scale: 1.8 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                  className="bg-white text-[#d92b2b] text-xs font-semibold px-1.5 rounded-sm"
                >
                  {cartCount}
                </motion.span>
              )}
            </button>
          </div>
        </div>
      </motion.header>

      {/* MOBILE BOTTOM NAVIGATION */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-[#3a1a0b] z-40 px-2 py-3 flex justify-around">
        {NAV.map(tab => (
          <button
            key={tab.id}
            onClick={() => scrollToSection(tab.id)}
            className={`f-cond text-xs uppercase tracking-widest px-2 ${
              activeTab === tab.id ? 'text-[#f2b632]' : 'text-white/70'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* SUCCESS BANNER */}
      <AnimatePresence>
        {orderPlaced && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-[#2e7d32] text-white"
          >
            <div className={`${wrap} py-3 flex items-center gap-3 text-sm`}>
              <Check className="w-4 h-4 flex-shrink-0" />
              <span>Order sent for <strong>{tableName}</strong>. Follow it under Orders.</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* HERO */}
      <section id="home" className="scroll-mt-16 bg-[#f2b632] overflow-hidden drift" style={{ backgroundImage: PATTERN }}>
        <div className={`${wrap} py-10 md:py-14 grid md:grid-cols-2 gap-8 items-center`}>
          <motion.div className="space-y-5" variants={stagger} initial="hidden" animate="show">
            <motion.span
              variants={fadeUp}
              className="inline-block f-cond uppercase tracking-widest text-xs md:text-sm border border-dashed border-[#3a1a0b] px-3 py-1.5"
            >
              A good time for great Sri Lankan taste
            </motion.span>
            <motion.h1 variants={fadeUp} className="f-slab leading-[0.95]">
              <span className="block text-6xl md:text-8xl">SPECIAL</span>
              <span className="block text-4xl md:text-6xl mt-1">FLAVOURS</span>
            </motion.h1>
            <motion.p variants={fadeUp} className="text-sm md:text-base max-w-md leading-relaxed text-[#3a1a0b]/80 font-medium">
              Choose your table, pick your dishes and send the order straight to the kitchen. Pay at the counter when you're done.
            </motion.p>
            <motion.div variants={fadeUp} className="flex flex-wrap gap-3 pt-1">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => scrollToSection('menu')}
                className="f-cond uppercase tracking-widest text-sm px-7 py-3 bg-[#d92b2b] text-white hover:bg-[#b82020] transition-colors"
              >
                Order now
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => scrollToSection('about')}
                className="f-cond uppercase tracking-widest text-sm px-7 py-3 border-2 border-[#3a1a0b] hover:bg-[#3a1a0b] hover:text-[#f2b632] transition-colors"
              >
                About us
              </motion.button>
            </motion.div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.7, rotate: -10 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 90, damping: 14, delay: 0.2 }}
            className="relative flex justify-center"
          >
            <motion.div
              animate={{ y: [0, -12, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
              className="w-72 h-72 md:w-[26rem] md:h-[26rem] rounded-full overflow-hidden border-[10px] border-white shadow-[0_25px_50px_-12px_rgba(58,26,11,0.55)]"
            >
              <img src={heroImg} alt="Featured dish" className="w-full h-full object-cover" />
            </motion.div>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1, rotate: [-8, -3, -8] }}
              transition={{
                scale: { type: 'spring', stiffness: 200, damping: 12, delay: 0.8 },
                rotate: { duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 1 },
              }}
              className="pulse-ring absolute -bottom-2 right-2 md:right-8 w-24 h-24 md:w-28 md:h-28 rounded-full bg-[#d92b2b] text-white flex flex-col items-center justify-center text-center border-2 border-dashed border-white/80"
            >
              <span className="f-slab text-xl md:text-2xl leading-none">TABLE</span>
              <span className="f-cond text-xs tracking-[0.2em] mt-1">ORDERING</span>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* PROMO TILES */}
      <section className={`${wrap} py-10 md:py-14`}>
        <div className="grid md:grid-cols-2 gap-5">
          {tiles.map((t, i) => (
            <motion.button
              key={i}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.55, delay: i * 0.12 }}
              onClick={() => scrollToSection('menu')}
              className={`relative overflow-hidden rounded-md bg-[#1a0e08] text-left group ${
                t.tall ? 'md:row-span-2 h-72 md:h-auto min-h-[24rem]' : 'h-44 md:h-[11.5rem]'
              }`}
            >
              <img
                src={t.img}
                alt=""
                className={`absolute object-cover transition-transform duration-500 group-hover:scale-105 ${
                  t.tall ? 'inset-0 w-full h-full opacity-90' : 'right-0 top-0 h-full w-3/5'
                }`}
              />
              <div className={`absolute inset-0 ${t.tall ? 'bg-gradient-to-b from-black/80 via-black/20 to-transparent' : 'bg-gradient-to-r from-[#1a0e08] from-45% to-transparent'}`} />
              <div className="relative p-5 md:p-7">
                <p className="f-cond text-xs uppercase tracking-widest text-white/70">{t.kicker}</p>
                <p className={`f-cond uppercase text-white leading-tight mt-1 ${t.tall ? 'text-3xl md:text-4xl max-w-[12rem]' : 'text-2xl max-w-[9rem]'}`}>
                  {t.title}
                </p>
              </div>
            </motion.button>
          ))}
        </div>
      </section>

      {/* MENU */}
      <section id="menu" className="scroll-mt-16 pb-12 md:pb-16">
        <div className={wrap}>
          <motion.div
            className="text-center"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.5 }}
          >
            <span className="inline-block f-cond uppercase tracking-widest text-xs bg-[#f2b632] px-3 py-1.5">
              Always tasty
            </span>
            <h2 className="f-slab text-4xl md:text-5xl mt-3">CHOOSE &amp; ENJOY</h2>
            <p className="text-sm text-[#3a1a0b]/70 max-w-md mx-auto mt-3">
              Everything is cooked fresh with local ingredients. Add what you like and we'll bring it to your table.
            </p>
          </motion.div>

          <div className="flex items-center justify-center gap-2 flex-wrap mt-7">
            {CATEGORIES.map(category => (
              <button
                key={category}
                onClick={() => setActiveCategory(category)}
                className={`f-cond uppercase tracking-widest text-sm px-5 py-2 border-2 transition-colors ${
                  activeCategory === category
                    ? 'bg-[#3a1a0b] border-[#3a1a0b] text-[#f2b632]'
                    : 'border-[#3a1a0b]/25 hover:border-[#3a1a0b]'
                }`}
              >
                {category}
              </button>
            ))}
          </div>

          <div className="max-w-xl mx-auto mt-6 space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#3a1a0b]/50" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search dishes…"
                className="w-full pl-10 pr-10 py-3 bg-white border-2 border-[#3a1a0b]/25 text-sm focus:outline-none focus:border-[#3a1a0b]"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#3a1a0b]/60 hover:text-[#3a1a0b]"
                  aria-label="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {allTags.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2">
                {allTags.map(tag => (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={`f-cond uppercase tracking-widest text-xs px-3.5 py-1.5 rounded-full border-2 transition-colors ${
                      activeTags.includes(tag)
                        ? 'bg-[#d92b2b] border-[#d92b2b] text-white'
                        : 'border-[#3a1a0b]/25 hover:border-[#3a1a0b]'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
                {(activeTags.length > 0 || search) && (
                  <button
                    onClick={() => { setActiveTags([]); setSearch(''); }}
                    className="f-cond uppercase tracking-widest text-xs px-2 py-1.5 underline text-[#3a1a0b]/70"
                  >
                    Clear
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-10 mt-8">
            {filteredItems.length === 0 ? (
              <div className="col-span-full py-12 text-center text-sm text-[#3a1a0b]/60 border-2 border-dashed border-[#3a1a0b]/20">
                No dishes match your search or filters.
              </div>
            ) : (
              filteredItems.map(item => {
                const inCart = qtyInCart(item.id);
                return (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-40px' }}
                    transition={{ duration: 0.45 }}
                    className="flex flex-col items-center text-center"
                  >
                    <motion.div
                      whileHover={{ scale: 1.08, rotate: 4 }}
                      transition={{ type: 'spring', stiffness: 260, damping: 16 }}
                      className="w-36 h-36 md:w-44 md:h-44 rounded-full overflow-hidden border-4 border-white shadow-lg bg-[#f1e7d6]"
                    >
                      <img src={item.image || FALLBACK_IMG} alt={item.name} className="w-full h-full object-cover" />
                    </motion.div>
                    <div className="w-28 h-3 rounded-[50%] bg-[#3a1a0b]/20 blur-md mt-2" />
                    <h3 className="f-cond uppercase text-lg md:text-xl mt-3 leading-tight">{item.name}</h3>
                    <p className="text-xs text-[#3a1a0b]/65 mt-1.5 line-clamp-2 max-w-[14rem] leading-relaxed">{item.desc}</p>
                    {getTags(item).length > 0 && (
                      <div className="flex flex-wrap justify-center gap-1.5 mt-2">
                        {getTags(item).map(t => (
                          <span key={t} className={`f-cond uppercase tracking-widest text-[10px] px-2 py-0.5 rounded-sm ${tagStyle(t)}`}>
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="f-slab text-lg text-[#d92b2b] mt-2">LKR {item.price}</p>
                    {inCart > 0 ? (
                      <div className="mt-3 flex items-center bg-[#3a1a0b] text-white">
                        <button onClick={() => updateQty(item.id, -1)} className="px-3 py-2 hover:bg-white/10" aria-label="Decrease">
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="f-cond w-8 text-center">{inCart}</span>
                        <button onClick={() => updateQty(item.id, 1)} className="px-3 py-2 hover:bg-white/10" aria-label="Increase">
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <motion.button
                        whileHover={{ scale: 1.06 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => addToCart(item)}
                        disabled={!!item.soldOut}
                        className="f-cond uppercase tracking-widest text-xs mt-3 px-6 py-2.5 bg-[#d92b2b] text-white hover:bg-[#b82020] transition-colors disabled:bg-[#3a1a0b]/30 disabled:cursor-not-allowed"
                      >
                        {item.soldOut ? 'Sold out' : 'Order now'}
                      </motion.button>
                    )}
                  </motion.div>
                );
              })
            )}
          </div>
        </div>
      </section>

      {/* LIVE ORDERS */}
      <section id="my-orders" className="scroll-mt-16 bg-[#faf3e3] py-10 md:py-12">
        <div className={wrap}>
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-6">
            <div>
              <span className="inline-block f-cond uppercase tracking-widest text-xs bg-[#f2b632] px-3 py-1.5">Kitchen</span>
              <h2 className="f-slab text-3xl md:text-4xl mt-2">LIVE ORDERS</h2>
            </div>
            <div className="flex items-center gap-3">
              <label className="f-cond uppercase tracking-widest text-xs">Table</label>
              <select
                value={tableName}
                onChange={(e) => handleTableSelection(e.target.value)}
                disabled={!!lockedTable}
                className="bg-white border-2 border-[#3a1a0b]/25 px-3 py-1.5 text-sm focus:outline-none focus:border-[#3a1a0b] disabled:bg-[#faf3e3] disabled:opacity-80"
              >
                <option value="">Choose table</option>
                {TABLES.map(tbl => (
                  <option key={tbl} value={tbl}>{tbl}</option>
                ))}
              </select>
            </div>
          </div>

          {visibleOrders.length === 0 ? (
            <p className="py-6 text-sm text-[#3a1a0b]/60 border-2 border-dashed border-[#3a1a0b]/20 text-center">
              {tableName ? 'No recent orders for your table.' : 'Choose your table to see your orders.'}
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {visibleOrders.map((order) => (
                <motion.div
                  key={order.id}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  className="bg-white border-t-4 border-[#3a1a0b] shadow-sm p-4 space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="f-cond uppercase text-xl leading-none">{order.tableName}</p>
                      <p className="text-xs text-[#3a1a0b]/60 mt-1">{new Date(order.timestamp).toLocaleTimeString()}</p>
                    </div>
                    <span className={`f-cond uppercase tracking-widest text-xs px-2.5 py-1 ${statusStyle(order.status)}`}>
                      {order.status || 'PENDING'}
                    </span>
                  </div>

                  <OrderProgress status={order.status} />

                  <div className="space-y-1.5 border-t border-dashed border-[#3a1a0b]/30 pt-3">
                    {order.items?.map((it, idx) => (
                      <div key={idx} className="text-sm">
                        <div className="flex justify-between">
                          <span>{it.qty} × {it.name}</span>
                          <span className="text-[#3a1a0b]/60">LKR {it.price * it.qty}</span>
                        </div>
                        {it.note && (
                          <p className="text-xs italic text-[#d92b2b] mt-0.5">“{it.note}”</p>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-dashed border-[#3a1a0b]/30 pt-3 flex items-baseline justify-between">
                    <span className="f-cond uppercase tracking-widest text-xs">Total</span>
                    <span className="f-slab text-lg text-[#d92b2b]">LKR {order.total}</span>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ABOUT */}
      <section id="about" className="scroll-mt-16 py-12 md:py-16">
        <motion.div
          className={`${wrap} grid md:grid-cols-2 gap-8 md:gap-12 items-center`}
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6 }}
        >
          <div className="space-y-4">
            <span className="inline-block f-cond uppercase tracking-widest text-xs bg-[#f2b632] px-3 py-1.5">Our story</span>
            <h2 className="f-slab text-3xl md:text-4xl leading-tight">A SMALL DINING ROOM IN THE HILL CAPITAL</h2>
            <p className="text-sm leading-relaxed text-[#3a1a0b]/75">
              Udarata Bistro is a six-table restaurant in the middle of Kandy. We cook with locally sourced ingredients and keep the menu short enough that everything on it gets proper attention.
            </p>
            <p className="text-sm leading-relaxed text-[#3a1a0b]/75">
              Ordering is done from your phone at the table, so the kitchen gets your order right away and you can ask for more whenever you like.
            </p>
            <button
              onClick={() => scrollToSection('menu')}
              className="f-cond uppercase tracking-widest text-sm px-7 py-3 bg-[#d92b2b] text-white hover:bg-[#b82020] transition-colors"
            >
              See the menu
            </button>
          </div>
          <div className="aspect-[4/3] bg-[#1a0e08] overflow-hidden rounded-md">
            <img src={pickImg(3)} alt="" className="w-full h-full object-cover" />
          </div>
        </motion.div>
      </section>

      {/* CONTACT + FOOTER */}
      <footer id="contact" className="scroll-mt-16 bg-[#3a1a0b] text-white">
        <div className={`${wrap} py-10 grid grid-cols-1 md:grid-cols-4 gap-8`}>
          <div>
            <p className="f-slab text-2xl text-[#f2b632]">FIND US</p>
            <p className="text-sm text-white/70 mt-2">Udarata Bistro, Kandy</p>
          </div>
          <div>
            <h3 className="f-cond uppercase tracking-widest text-xs text-[#f2b632] mb-2">Address</h3>
            <p className="text-sm leading-relaxed text-white/85">No. 42, Peradeniya Road<br />Kandy, Central Province<br />Sri Lanka</p>
          </div>
          <div>
            <h3 className="f-cond uppercase tracking-widest text-xs text-[#f2b632] mb-2">Call us</h3>
            <p className="text-sm leading-relaxed text-white/85">+94 (0) 81 223 4567<br />+94 (0) 77 987 6543</p>
          </div>
          <div>
            <h3 className="f-cond uppercase tracking-widest text-xs text-[#f2b632] mb-2">Hours</h3>
            <p className="text-sm leading-relaxed text-white/85">Every day<br />10:00 AM – 11:00 PM</p>
          </div>
        </div>
        <div className="border-t border-white/10 py-4 pb-20 md:pb-4 text-center text-xs text-white/50">
          © 2026 Udarata Bistro, Kandy
        </div>
      </footer>

      {/* FLOATING CART BAR */}
      <AnimatePresence>
        {cartCount > 0 && !showCart && (
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            onClick={() => setShowCart(true)}
            className="fixed z-30 left-4 right-4 bottom-16 md:bottom-6 md:left-auto md:right-6 md:w-80 flex items-center justify-between px-4 py-3 bg-[#d92b2b] text-white shadow-xl"
          >
            <span className="f-cond uppercase tracking-widest text-sm">{cartCount} {cartCount === 1 ? 'item' : 'items'}</span>
            <span className="f-cond uppercase tracking-widest text-sm">View order · LKR {calculateTotal()}</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* CART DRAWER */}
      <AnimatePresence>
        {showCart && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCart(false)}
              className="fixed inset-0 bg-black/50 z-50"
            />
            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.25 }}
              className="fixed top-0 right-0 bottom-0 w-full max-w-sm bg-white z-50 flex flex-col"
            >
              <div className="flex items-center justify-between px-5 h-16 bg-[#f2b632]" style={{ backgroundImage: PATTERN }}>
                <h2 className="f-slab text-xl">YOUR ORDER</h2>
                <button onClick={() => setShowCart(false)} className="p-1.5 hover:bg-black/10 rounded" aria-label="Close">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="px-5 py-4 space-y-1.5 border-b border-[#3a1a0b]/10">
                <label className="f-cond uppercase tracking-widest text-xs">Your table</label>
                <select
                  value={tableName}
                  onChange={(e) => handleTableSelection(e.target.value)}
                  disabled={!!lockedTable}
                  className="w-full bg-white border-2 border-[#3a1a0b]/25 px-3 py-2.5 text-sm focus:outline-none focus:border-[#3a1a0b] disabled:bg-[#faf3e3] disabled:opacity-80"
                >
                  <option value="">Choose your table</option>
                  {TABLES.map(tbl => {
                    const isOccupied = allOrders.some(o => o.tableName === tbl && isActiveOrder(o));
                    return (
                      <option key={tbl} value={tbl}>
                        {tbl}{isOccupied ? ' (occupied)' : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                {cart.length === 0 ? (
                  <p className="text-sm text-[#3a1a0b]/60 py-10 text-center">Nothing added yet.</p>
                ) : (
                  cart.map(item => (
                    <div key={item.id} className="space-y-2">
                     <div className="flex items-center gap-3">
                      <img
                        src={item.image || FALLBACK_IMG}
                        alt=""
                        className="w-14 h-14 rounded-full object-cover border-2 border-white shadow bg-[#f1e7d6]"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="f-cond uppercase text-base truncate">{item.name}</p>
                        <p className="text-xs text-[#d92b2b] font-semibold">LKR {Number(item.price) * item.qty}</p>
                      </div>
                      <div className="flex items-center bg-[#3a1a0b] text-white">
                        <button onClick={() => updateQty(item.id, -1)} className="p-2 hover:bg-white/10" aria-label="Decrease">
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="f-cond text-sm w-6 text-center">{item.qty}</span>
                        <button onClick={() => updateQty(item.id, 1)} className="p-2 hover:bg-white/10" aria-label="Increase">
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                     </div>
                     <input
                       type="text"
                       value={item.note || ''}
                       onChange={(e) => updateNote(item.id, e.target.value)}
                       maxLength={80}
                       placeholder="Special request (e.g. no chili)"
                       className="w-full text-xs bg-[#faf3e3] border border-[#3a1a0b]/20 px-3 py-2 focus:outline-none focus:border-[#3a1a0b]"
                     />
                    </div>
                  ))
                )}
              </div>

              <div className="px-5 py-4 border-t border-[#3a1a0b]/10 space-y-3">
                <div className="flex items-baseline justify-between">
                  <span className="f-cond uppercase tracking-widest text-sm">Total</span>
                  <span className="f-slab text-2xl text-[#d92b2b]">LKR {calculateTotal()}</span>
                </div>
                <button
                  disabled={loading || cart.length === 0}
                  onClick={handleCheckout}
                  className="w-full py-3.5 f-cond uppercase tracking-widest text-sm bg-[#d92b2b] text-white hover:bg-[#b82020] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? 'Sending…' : 'Place order'}
                </button>
                <p className="text-xs text-[#3a1a0b]/60 text-center">Pay at the counter.</p>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}