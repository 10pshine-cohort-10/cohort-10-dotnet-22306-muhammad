import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import axios from "axios";
import AuthPage from "./pages/AuthPage";
import { checkAdminAccess } from "./api/authApi";
import { clearSession, getValidUserSession, type UserSession } from "./utils/sessionStorage";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<"checking" | "authenticated" | "unauthenticated">("checking");

  useEffect(() => {
    let active = true;
    getValidUserSession()
      .then(async (session) => {
        if (!active) return;
        if (!session) {
          await clearSession();
          if (active) setStatus("unauthenticated");
        } else {
          setStatus("authenticated");
        }
      })
      .catch(() => {
        if (active) setStatus("unauthenticated");
      });
    return () => {
      active = false;
    };
  }, []);

  if (status === "checking") return <p style={{ padding: 24 }}>Loading session...</p>;
  if (status === "unauthenticated") return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function DashboardPlaceholder() {
  const navigate = useNavigate();
  const [user, setUser] = useState<UserSession | null>(null);
  const [adminMsg, setAdminMsg] = useState("");

  useEffect(() => {
    let active = true;
    getValidUserSession()
      .then(async (session) => {
        if (!active) return;
        if (!session) {
          await clearSession();
          if (active) navigate("/login", { replace: true });
        } else {
          setUser(session);
        }
      })
      .catch(() => {
        if (active) navigate("/login", { replace: true });
      });
    return () => {
      active = false;
    };
  }, [navigate]);

  if (!user) return null;

  const testAdminRoute = async () => {
    try {
      const res = await checkAdminAccess();
      setAdminMsg(`Success: ${res.data.message}`);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        if (!err.response) {
          setAdminMsg("Connection error: Unable to reach the server. Please retry.");
        } else if (err.response.status === 401) {
          await clearSession();
          navigate("/login", { replace: true });
        } else if (err.response.status === 403) {
          setAdminMsg("Access Denied (403 Forbidden): Admin role required.");
        } else {
          setAdminMsg(`Request failed (${err.response.status}).`);
        }
      } else {
        setAdminMsg("An unexpected error occurred.");
      }
    }
  };

  const handleLogout = async () => {
    await clearSession();
    navigate("/login", { replace: true });
  };

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>Main Dashboard</h1>
      <p>
        Logged in as: <strong>{user.fullName}</strong> ({user.role})
      </p>
      <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
        <button onClick={testAdminRoute}>Test Admin-Only Endpoint</button>
        <button onClick={handleLogout}>Logout</button>
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