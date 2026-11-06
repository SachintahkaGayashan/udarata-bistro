import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import CustomerMenu from './components/CustomerMenu';
import AdminPanel from './components/AdminPanel';
import RobotFace from './components/RobotFace';

// /table01 ... /table06 open the menu with that table already chosen.
// Anything else that is not a known page goes back to the home page.
function TableRoute() {
  const { slug } = useParams();
  return /^table[\s\-_]*0*\d+$/i.test(slug || '') ? <CustomerMenu /> : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <Router>
      <Routes>
        {/* Customer Menu View */}
        <Route path="/" element={<CustomerMenu />} />

        {/* Table QR links, e.g. /table01 */}
        <Route path="/:slug" element={<TableRoute />} />

        {/* Admin & Kitchen Panel View */}
        <Route path="/admin" element={<AdminPanel />} />

        {/* Robot Face / Smartphone Audio-Visual Display View */}
        <Route path="/robot-face" element={<RobotFace />} />
      </Routes>
    </Router>
  );
}