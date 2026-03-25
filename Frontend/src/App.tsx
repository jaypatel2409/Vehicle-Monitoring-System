// Frontend/src/App.tsx
// PATCH: Add the /daily-counts route.
//
// Find the section in your existing App.tsx that lists protected routes
// (the section with /dashboard, /monitoring, /reports, /settings, /gate/:gate)
// and add:
//
//   import DailyCounts from "./pages/DailyCounts";          ← add import
//
//   <Route path="/daily-counts" element={<DailyCounts />} />  ← add route
//
// ─── FULL REPLACEMENT FILE ────────────────────────────────────────────────────
// Replace your entire App.tsx with the content below.
// The ONLY changes from your Session 3 App.tsx:
//   1. Added DailyCounts import
//   2. Added /daily-counts route

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import DashboardLayout from "./components/layout/DashboardLayout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import VehicleMonitoring from "./pages/VehicleMonitoring";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import GateVehicles from "./pages/GateVehicles";
import DailyCounts from "./pages/DailyCounts";   // ← NEW

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  return !isAuthenticated ? <>{children}</> : <Navigate to="/dashboard" replace />;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />

      {/* Protected */}
      <Route
        path="/"
        element={
          <PrivateRoute>
            <DashboardLayout />
          </PrivateRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="monitoring" element={<VehicleMonitoring />} />
        <Route path="reports" element={<Reports />} />
        <Route path="settings" element={<Settings />} />
        <Route path="gate/:gate" element={<GateVehicles />} />
        <Route path="daily-counts" element={<DailyCounts />} />  {/* ← NEW */}
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}