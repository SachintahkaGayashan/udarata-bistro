import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import CustomerMenu from './components/CustomerMenu';
import AdminPanel from './components/AdminPanel';
import RobotFace from './components/RobotFace'; // RobotFace component එක import කිරීම

export default function App() {
  return (
    <Router>
      <Routes>
        {/* Customer Menu View */}
        <Route path="/" element={<CustomerMenu />} />

        {/* Admin & Kitchen Panel View */}
        <Route path="/admin" element={<AdminPanel />} />

        {/* Robot Face / Smartphone Audio-Visual Display View */}
        <Route path="/robot-face" element={<RobotFace />} />
      </Routes>
    </Router>
  );
}