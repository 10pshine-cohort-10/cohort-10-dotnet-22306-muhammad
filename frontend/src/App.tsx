import { useCallback, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import axios from "axios";
import AuthPage from "./pages/AuthPage";
import { checkAdminAccess } from "./api/authApi";
import {
  clearSession,
  getValidUserSession,
  subscribeToSessionChanges,
  type UserSession,
} from "./utils/sessionStorage";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<"checking" | "authenticated" | "unauthenticated">("checking");

  useEffect(() => {
    let active = true;
    const syncAuth = () => {
      getValidUserSession()
        .then(async (session) => {
          if (!active) return;
          if (!session) {
            try {
              await clearSession();
            } catch {
              // Ignore cleanup error when already unauthenticated
            }
            if (active) setStatus("unauthenticated");
          } else {
            setStatus("authenticated");
          }
        })
        .catch(() => {
          if (active) setStatus("unauthenticated");
        });
    };

    syncAuth();
    const unsubscribe = subscribeToSessionChanges(syncAuth);

    return () => {
      active = false;
      unsubscribe();
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

  const syncSession = useCallback(() => {
    let cancelled = false;
    getValidUserSession()
      .then(async (session) => {
        if (cancelled) return;
        if (!session) {
          setUser(null);
          try {
            await clearSession();
          } catch {
            // Proceed to login even if persistent cleanup fails
          }
          if (!cancelled) navigate("/login", { replace: true });
        } else {
          setUser(session);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUser(null);
          navigate("/login", { replace: true });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  useEffect(() => {
    const cancelInitial = syncSession();
    const unsubscribe = subscribeToSessionChanges(() => {
      syncSession();
    });
    return () => {
      cancelInitial();
      unsubscribe();
    };
  }, [syncSession]);

  if (!user) return null;

  const testAdminRoute = async () => {
    const requestToken = user.token;
    try {
      const res = await checkAdminAccess();
      setAdminMsg(`Success: ${res.data.message}`);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        if (!err.response) {
          setAdminMsg("Connection error: Unable to reach the server. Please retry.");
        } else if (err.response.status === 401) {
          try {
            await clearSession(requestToken);
          } catch {
            // Invalidate UI state and redirect even if IndexedDB cleanup fails
          }
          const latest = await getValidUserSession();
          if (!latest || latest.token === requestToken) {
            setUser(null);
            navigate("/login", { replace: true });
          } else {
            setUser(latest);
          }
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
    try {
      await clearSession();
      setUser(null);
      navigate("/login", { replace: true });
    } catch {
      setAdminMsg("Logout failed: Unable to clear local session. Please try again.");
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