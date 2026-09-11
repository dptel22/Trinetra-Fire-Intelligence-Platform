import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import SplashScreen from './components/SplashScreen';
import HomePage from './components/HomePage';

const FireMapPage = lazy(() => import('./components/FireMapPage'));
const FireAlertsPage = lazy(() => import('./components/FireAlertsPage'));
const ArchivePage = lazy(() => import('./components/ArchivePage'));

function RouteLoading() {
  return (
    <main
      aria-live="polite"
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        color: 'var(--text-primary, #eceff4)',
        backgroundColor: 'var(--bg-dark, #0a0e12)',
        fontFamily: 'var(--font-heading, sans-serif)'
      }}
    >
      Loading TRINETRA…
    </main>
  );
}

export default function App() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <Routes>
        <Route path="/" element={<SplashScreen />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/fire-map" element={<FireMapPage />} />
        <Route path="/fire-alerts" element={<FireAlertsPage />} />
        <Route path="/archive" element={<ArchivePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
