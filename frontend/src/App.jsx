import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import SplashScreen from './components/SplashScreen';
import HomePage from './components/HomePage';
import FireMapPage from './components/FireMapPage';
import FireAlertsPage from './components/FireAlertsPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<SplashScreen />} />
      <Route path="/home" element={<HomePage />} />
      <Route path="/fire-map" element={<FireMapPage />} />
      <Route path="/fire-alerts" element={<FireAlertsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
