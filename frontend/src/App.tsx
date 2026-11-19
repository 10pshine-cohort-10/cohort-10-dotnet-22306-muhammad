import { useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AuthPage from "./pages/AuthPage";
import { checkAdminAccess } from "./api/authApi";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem("token");
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

function DashboardPlaceholder() {
  const rawUser = localStorage.getItem("user");
  const user = rawUser ? JSON.parse(rawUser) : {};
  const [adminMsg, setAdminMsg] = useState("");

  const testAdminRoute = async () => {
    try {
      const res = await checkAdminAccess();
      setAdminMsg(`Success: ${res.data.message}`);
    } catch {
      setAdminMsg("Access Denied (403 Forbidden): Admin role required.");
    }
  };

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>Main Dashboard</h1>
      <p>
        Logged in as: <strong>{user.fullName}</strong> ({user.role})
      </p>
      <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
        <button onClick={testAdminRoute}>Test Admin-Only Endpoint</button>
        <button
          onClick={() => {
            localStorage.clear();
            window.location.href = "/login";
          }}
        >
          Logout
        </button>
      </div>
      {adminMsg && <p style={{ marginTop: 12 }}>{adminMsg}</p>}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<AuthPage />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPlaceholder />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}