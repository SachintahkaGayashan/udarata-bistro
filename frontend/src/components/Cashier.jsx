import React, { useState, useEffect, useMemo } from 'react';
import { Banknote, CreditCard, LogOut, Search, X, CheckCircle, Lock, Wallet } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { ref, onValue, set } from 'firebase/database';
import { db, auth } from '../firebase';

const fmt = (n) => `LKR ${Number(n || 0).toLocaleString('en-US')}`;
const orderNo = (o) => String(o.id || '').slice(-6).toUpperCase();
const itemsSum = (o) => (o.items || []).reduce((s, i) => s + Number(i.price) * Number(i.qty), 0);
const isServed = (o) => String(o.status || '').toUpperCase() === 'SERVED';
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const dayOf = (ts) => {
  const d = new Date(Number(ts));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const COLLECT_WINDOW_MS = 48 * 60 * 60 * 1000; // older unpaid orders are not listed (they are test/old data)
const QUICK = [1000, 2000, 5000];

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Alfa+Slab+One&family=Oswald:wght@400;500;600&family=Montserrat:wght@400;500;600&display=swap');
.f-slab{font-family:'Alfa Slab One',Georgia,serif;font-weight:400}.f-cond{font-family:'Oswald','Arial Narrow',sans-serif}.f-body{font-family:'Montserrat',system-ui,sans-serif}`;

const inp = 'w-full bg-white border-2 border-[#3a1a0b]/25 px-3 py-2.5 text-sm focus:outline-none focus:border-[#3a1a0b]';
const btnBrown = 'f-cond uppercase tracking-widest text-xs px-5 py-3 bg-[#3a1a0b] text-[#f2b632] hover:bg-[#2a1208] transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
const btnRed = 'f-cond uppercase tracking-widest text-xs px-5 py-3 bg-[#d92b2b] text-white hover:bg-[#b82020] transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
const btnLine = 'f-cond uppercase tracking-widest text-xs px-4 py-2.5 border-2 border-[#3a1a0b]/30 hover:border-[#3a1a0b] transition-colors';

export default function Cashier() {
  const [user, setUser] = useState(null);
  const [allowed, setAllowed] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  const [orders, setOrders] = useState([]);
  const [tab, setTab] = useState('collect');
  const [search, setSearch] = useState('');
  const [day, setDay] = useState(todayStr());

  const [payOrder, setPayOrder] = useState(null);
  const [method, setMethod] = useState('CASH');
  const [received, setReceived] = useState('');
  const [saving, setSaving] = useState(false);
  const [payError, setPayError] = useState('');
  const [toast, setToast] = useState('');

  // only accounts with the cashier (or admin) claim may use this page
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (!u) { setAllowed(false); setAuthLoading(false); return; }
      try {
        const res = await u.getIdTokenResult(true);
        setAllowed(res.claims.cashier === true || res.claims.admin === true);
      } catch {
        setAllowed(false);
      }
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user || !allowed) return undefined;
    const unsub = onValue(ref(db, 'orders'), (snap) => {
      const data = snap.val() || {};
      setOrders(Object.keys(data).map(k => ({ id: k, ...data[k] })));
    }, (err) => console.error('orders read error:', err));
    return () => unsub();
  }, [user, allowed]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    setLoggingIn(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      setPassword('');
    } catch {
      setLoginError('Incorrect email or password.');
    } finally {
      setLoggingIn(false);
    }
  };

  const q = search.trim().toLowerCase();
  const toCollect = useMemo(() => orders
    .filter(o => isServed(o) && !o.payment && Date.now() - Number(o.servedAt || o.timestamp || 0) < COLLECT_WINDOW_MS)
    .filter(o => !q || `${o.tableName || ''} ${orderNo(o)}`.toLowerCase().includes(q))
    .sort((a, b) => Number(a.servedAt || a.timestamp || 0) - Number(b.servedAt || b.timestamp || 0)), [orders, q]);

  const inProgress = orders.filter(o => o.status && !isServed(o) && !o.payment && Date.now() - Number(o.timestamp || 0) < 12 * 60 * 60 * 1000).length;

  const paidOnDay = useMemo(() => orders
    .filter(o => o.payment && dayOf(o.payment.paidAt) === day)
    .sort((a, b) => Number(b.payment.paidAt) - Number(a.payment.paidAt)), [orders, day]);
  const sumBy = (m) => paidOnDay.filter(o => !m || o.payment.method === m).reduce((s, o) => s + Number(o.payment.amount || 0), 0);
  const countBy = (m) => paidOnDay.filter(o => o.payment.method === m).length;

  const openPay = (o) => {
    setPayOrder(o);
    setMethod('CASH');
    setReceived('');
    setPayError('');
  };

  const total = payOrder ? Number(payOrder.total) : 0;
  const mismatch = payOrder ? itemsSum(payOrder) !== total : false;
  const receivedNum = Number(received);
  const change = receivedNum - total;
  const cashOk = method === 'CARD' || (received !== '' && Number.isFinite(receivedNum) && receivedNum >= total);

  const confirmPay = async () => {
    if (!payOrder || saving || mismatch || !cashOk) return;
    setSaving(true);
    setPayError('');
    try {
      const payment = {
        method,
        amount: total,
        paidAt: Date.now(),
        by: String(user.email || '').slice(0, 120),
        ...(method === 'CASH' ? { tendered: receivedNum, change: receivedNum - total } : {}),
      };
      await set(ref(db, `orders/${payOrder.id}/payment`), payment);
      setToast(`${payOrder.tableName}: ${fmt(total)} paid by ${method === 'CASH' ? 'cash' : 'card'}${method === 'CASH' ? ` · change ${fmt(receivedNum - total)}` : ''}`);
      setPayOrder(null);
    } catch (err) {
      console.error(err);
      setPayError('Could not save. This order may already be paid, or it has not been served yet.');
    } finally {
      setSaving(false);
    }
  };

  // ---------------- screens ----------------
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#f3ecdd] flex items-center justify-center f-body text-[#3a1a0b]">
        <style>{FONTS}</style>
        <p className="f-cond uppercase tracking-widest text-sm">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#f2b632] flex items-center justify-center p-5 f-body text-[#3a1a0b]">
        <style>{FONTS}</style>
        <form onSubmit={handleLogin} className="bg-white border-t-8 border-[#3a1a0b] shadow-2xl w-full max-w-sm p-7 space-y-4">
          <div className="text-center">
            <img src="/logo.png" alt="SmartBistro" className="w-20 h-20 object-contain mx-auto" />
            <h1 className="f-slab text-3xl mt-2">CASHIER</h1>
            <p className="text-xs text-[#3a1a0b]/70 mt-1">Sign in to take payments</p>
          </div>
          <div>
            <label className="f-cond uppercase tracking-widest text-xs">Email</label>
            <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={inp} />
          </div>
          <div>
            <label className="f-cond uppercase tracking-widest text-xs">Password</label>
            <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inp} />
          </div>
          {loginError && <p className="text-sm text-[#d92b2b]">{loginError}</p>}
          <button type="submit" disabled={loggingIn} className={`${btnBrown} w-full`}>{loggingIn ? 'Signing in…' : 'Sign in'}</button>
        </form>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="min-h-screen bg-[#3a1a0b] flex items-center justify-center p-5 f-body text-white">
        <style>{FONTS}</style>
        <div className="max-w-sm w-full text-center space-y-4">
          <Lock className="w-12 h-12 mx-auto text-[#f2b632]" />
          <h1 className="f-slab text-3xl text-[#f2b632]">ACCESS DENIED</h1>
          <p className="text-sm text-white/80">This account does not have cashier access. Please ask the manager.</p>
          <button onClick={() => signOut(auth)} className={btnLine + ' text-white border-white/40 hover:border-white'}>Sign out</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f3ecdd] text-[#3a1a0b] f-body">
      <style>{FONTS}</style>

      <header className="bg-[#3a1a0b] text-white">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img src="/logo.png" alt="" className="w-10 h-10 object-contain bg-white rounded-full" />
            <div className="min-w-0">
              <p className="f-cond uppercase tracking-widest text-[#f2b632] leading-none">Cashier</p>
              <p className="text-xs text-white/70 truncate">{user.email}</p>
            </div>
          </div>
          <button onClick={() => signOut(auth)} className="f-cond uppercase tracking-widest text-xs flex items-center gap-2 px-3 py-2 border border-white/40 hover:border-white">
            <LogOut className="w-4 h-4" /> Logout
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        <div className="flex gap-2">
          {[['collect', `To collect (${toCollect.length})`], ['summary', 'Daily summary']].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`f-cond uppercase tracking-widest text-sm px-5 py-2.5 border-2 transition-colors ${
                tab === id ? 'bg-[#3a1a0b] border-[#3a1a0b] text-[#f2b632]' : 'border-[#3a1a0b]/25 hover:border-[#3a1a0b]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'collect' && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#3a1a0b]/50" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search table or order no…" className={`${inp} pl-9`} />
              </div>
              <span className="text-xs text-[#3a1a0b]/70">
                {inProgress > 0 ? `${inProgress} more order${inProgress > 1 ? 's' : ''} still being prepared or delivered` : 'No other orders in progress'}
              </span>
            </div>

            {toCollect.length === 0 ? (
              <p className="py-12 text-center text-sm text-[#3a1a0b]/70 border-2 border-dashed border-[#3a1a0b]/20">
                Nothing to collect right now. Served orders appear here so you can take the payment.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {toCollect.map(o => (
                  <div key={o.id} className="bg-white border-t-4 border-[#d92b2b] shadow-sm p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="f-slab text-2xl leading-none">{o.tableName}</p>
                        <p className="text-xs text-[#3a1a0b]/70 mt-1">#{orderNo(o)} · served {new Date(o.servedAt || o.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                      {itemsSum(o) !== Number(o.total) && (
                        <span className="f-cond uppercase tracking-widest text-[10px] px-2 py-1 bg-[#d92b2b] text-white">Check total</span>
                      )}
                    </div>
                    <div className="space-y-1 border-t border-dashed border-[#3a1a0b]/30 pt-3 text-sm">
                      {(o.items || []).map((it, i) => (
                        <div key={i} className="flex justify-between gap-3">
                          <span>{it.qty} × {it.name}</span>
                          <span className="text-[#3a1a0b]/75 whitespace-nowrap">{fmt(Number(it.price) * Number(it.qty))}</span>
                        </div>
                      ))}
                    </div>
                    <div className="border-t border-dashed border-[#3a1a0b]/30 pt-3 flex items-baseline justify-between">
                      <span className="f-cond uppercase tracking-widest text-xs">Total</span>
                      <span className="f-slab text-xl text-[#d92b2b]">{fmt(o.total)}</span>
                    </div>
                    <button onClick={() => openPay(o)} className={`${btnRed} w-full flex items-center justify-center gap-2`}>
                      <Wallet className="w-4 h-4" /> Take payment
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'summary' && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <label className="f-cond uppercase tracking-widest text-xs">Day</label>
              <input type="date" value={day} max={todayStr()} onChange={(e) => e.target.value && setDay(e.target.value)} className={`${inp} !w-auto`} />
              {day !== todayStr() && <button onClick={() => setDay(todayStr())} className={btnLine}>Today</button>}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                ['Total received', fmt(sumBy()), `${paidOnDay.length} payment${paidOnDay.length === 1 ? '' : 's'}`],
                ['Cash', fmt(sumBy('CASH')), `${countBy('CASH')} payment${countBy('CASH') === 1 ? '' : 's'}`],
                ['Card', fmt(sumBy('CARD')), `${countBy('CARD')} payment${countBy('CARD') === 1 ? '' : 's'}`],
                ['Average order', fmt(paidOnDay.length ? Math.round(sumBy() / paidOnDay.length) : 0), 'per payment'],
              ].map(([label, value, sub]) => (
                <div key={label} className="bg-white border-t-4 border-[#3a1a0b] p-4">
                  <p className="f-cond uppercase tracking-widest text-xs text-[#3a1a0b]/70">{label}</p>
                  <p className="f-slab text-xl md:text-2xl mt-1">{value}</p>
                  <p className="text-xs text-[#3a1a0b]/60 mt-1">{sub}</p>
                </div>
              ))}
            </div>

            <div className="bg-white shadow-sm overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="f-cond uppercase tracking-widest text-xs text-left bg-[#3a1a0b] text-[#f2b632]">
                    <th className="px-4 py-3">Time</th>
                    <th className="px-4 py-3">Table</th>
                    <th className="px-4 py-3">Order</th>
                    <th className="px-4 py-3">Method</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3">Cashier</th>
                  </tr>
                </thead>
                <tbody>
                  {paidOnDay.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-[#3a1a0b]/70">No payments on this day.</td></tr>
                  ) : paidOnDay.map(o => (
                    <tr key={o.id} className="border-t border-[#3a1a0b]/10">
                      <td className="px-4 py-2.5 whitespace-nowrap">{new Date(o.payment.paidAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="px-4 py-2.5">{o.tableName}</td>
                      <td className="px-4 py-2.5">#{orderNo(o)}</td>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-1.5">
                          {o.payment.method === 'CASH' ? <Banknote className="w-4 h-4" /> : <CreditCard className="w-4 h-4" />}
                          {o.payment.method === 'CASH' ? 'Cash' : 'Card'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap font-semibold">{fmt(o.payment.amount)}</td>
                      <td className="px-4 py-2.5 text-xs text-[#3a1a0b]/70">{o.payment.by}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>

      {/* PAYMENT DIALOG */}
      <AnimatePresence>
        {payOrder && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border-t-8 border-[#d92b2b] shadow-2xl w-full max-w-md max-h-[92vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#3a1a0b]/10">
                <div>
                  <p className="f-cond uppercase tracking-widest text-xs text-[#3a1a0b]/70">{payOrder.tableName} · #{orderNo(payOrder)}</p>
                  <h2 className="f-slab text-2xl">TAKE PAYMENT</h2>
                </div>
                <button onClick={() => setPayOrder(null)} className="p-1.5 hover:bg-black/10 rounded" aria-label="Close"><X className="w-5 h-5" /></button>
              </div>

              <div className="px-5 py-4 space-y-4">
                <div className="bg-[#faf3e3] px-4 py-3 flex items-baseline justify-between">
                  <span className="f-cond uppercase tracking-widest text-xs">Amount due</span>
                  <span className="f-slab text-3xl text-[#d92b2b]">{fmt(total)}</span>
                </div>

                {mismatch && (
                  <p className="text-sm bg-[#d92b2b]/10 border border-[#d92b2b] text-[#d92b2b] px-3 py-2">
                    The total ({fmt(total)}) does not match the items ({fmt(itemsSum(payOrder))}). Do not take payment. Please call the manager.
                  </p>
                )}

                <div className="grid grid-cols-2 gap-2">
                  {[['CASH', 'Cash', Banknote], ['CARD', 'Card', CreditCard]].map(([id, label, Icon]) => (
                    <button
                      key={id}
                      onClick={() => setMethod(id)}
                      className={`f-cond uppercase tracking-widest text-sm py-3 flex items-center justify-center gap-2 border-2 transition-colors ${
                        method === id ? 'bg-[#3a1a0b] border-[#3a1a0b] text-[#f2b632]' : 'border-[#3a1a0b]/25 hover:border-[#3a1a0b]'
                      }`}
                    >
                      <Icon className="w-4 h-4" /> {label}
                    </button>
                  ))}
                </div>

                {method === 'CASH' ? (
                  <div className="space-y-3">
                    <div>
                      <label className="f-cond uppercase tracking-widest text-xs">Cash received (LKR)</label>
                      <input
                        type="number" inputMode="numeric" min="0" autoFocus
                        value={received} onChange={(e) => setReceived(e.target.value)}
                        className={`${inp} text-lg`} placeholder={String(total)}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => setReceived(String(total))} className={btnLine}>Exact</button>
                      {QUICK.filter(v => v >= total).slice(0, 3).map(v => (
                        <button key={v} onClick={() => setReceived(String(v))} className={btnLine}>{v.toLocaleString('en-US')}</button>
                      ))}
                      <button onClick={() => setReceived('')} className={btnLine}>Clear</button>
                    </div>
                    <div className={`px-4 py-3 flex items-baseline justify-between ${received !== '' && change < 0 ? 'bg-[#d92b2b]/10' : 'bg-[#2e7d32]/10'}`}>
                      <span className="f-cond uppercase tracking-widest text-xs">{received !== '' && change < 0 ? 'Still to pay' : 'Change to give'}</span>
                      <span className={`f-slab text-2xl ${received !== '' && change < 0 ? 'text-[#d92b2b]' : 'text-[#2e7d32]'}`}>
                        {received === '' ? fmt(0) : fmt(Math.abs(change))}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-[#3a1a0b]/80">Charge {fmt(total)} on the card machine first, then confirm below.</p>
                )}

                {payError && <p className="text-sm text-[#d92b2b]">{payError}</p>}

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <button onClick={() => setPayOrder(null)} className={btnLine}>Cancel</button>
                  <button onClick={confirmPay} disabled={saving || mismatch || !cashOk} className={`${btnRed} flex items-center justify-center gap-2`}>
                    <CheckCircle className="w-4 h-4" /> {saving ? 'Saving…' : 'Confirm paid'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] bg-[#2e7d32] text-white px-5 py-3 shadow-xl text-sm max-w-[92vw]"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}