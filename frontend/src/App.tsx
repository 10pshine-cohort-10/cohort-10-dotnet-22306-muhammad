import { useCallback, useEffect, useRef, useState } from "react";
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
  const [status, setStatus] = useState<"checking" | "authenticated" | "unauthenticated" | "error">("checking");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    let generation = 0;

    const syncAuth = () => {
      const currentGen = ++generation;
      getValidUserSession()
        .then(async (session) => {
          if (!active || currentGen !== generation) return;
          if (!session) {
            try {
              await clearSession();
            } catch {
              // Ignore cleanup error when session is confirmed missing
            }
            if (active && currentGen === generation) {
              setStatus("unauthenticated");
            }
          } else {
            setStatus("authenticated");
          }
        })
        .catch(() => {
          if (!active || currentGen !== generation) return;
          setStatus((prev) => (prev === "authenticated" ? "authenticated" : "error"));
        });
    };

    syncAuth();
    const unsubscribe = subscribeToSessionChanges(syncAuth);

    return () => {
      active = false;
      unsubscribe();
    };
  }, [attempt]);

  if (status === "checking") return <p style={{ padding: 24 }}>Loading session...</p>;
  if (status === "error") {
    return (
      <div style={{ padding: 24, fontFamily: "sans-serif" }}>
        <p>Unable to verify your session due to a local storage error.</p>
        <button
          onClick={() => {
            setStatus("checking");
            setAttempt((n) => n + 1);
          }}
        >
          Retry
        </button>
      </div>
    );
  }
  if (status === "unauthenticated") return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function DashboardPlaceholder() {
  const navigate = useNavigate();
  const [user, setUser] = useState<UserSession | null>(null);
  const [lookupError, setLookupError] = useState(false);
  const [adminMsg, setAdminMsg] = useState("");
  const syncGenRef = useRef(0);

  const syncSession = useCallback(
    (isMounted: () => boolean) => {
      const currentGen = ++syncGenRef.current;
      getValidUserSession()
        .then(async (session) => {
          if (!isMounted() || currentGen !== syncGenRef.current) return;
          if (!session) {
            setUser(null);
            try {
              await clearSession();
            } catch {
              // Proceed to login even if persistent cleanup fails
            }
            if (isMounted() && currentGen === syncGenRef.current) {
              navigate("/login", { replace: true });
            }
          } else {
            setLookupError(false);
            setUser(session);
          }
        })
        .catch(() => {
          if (!isMounted() || currentGen !== syncGenRef.current) return;
          setUser((prev) => {
            if (!prev) setLookupError(true);
            return prev;
          });
        });
    },
    [navigate]
  );

  useEffect(() => {
    let active = true;
    const isMounted = () => active;

    syncSession(isMounted);
    const unsubscribe = subscribeToSessionChanges(() => {
      syncSession(isMounted);
    });

    return () => {
      active = false;
      syncGenRef.current += 1;
      unsubscribe();
    };
  }, [syncSession]);

  if (lookupError && !user) {
    return (
      <div style={{ padding: 24, fontFamily: "sans-serif" }}>
        <p>Unable to load your session due to a local storage error.</p>
        <button onClick={() => syncSession(() => true)}>Retry</button>
      </div>
    );
  }

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
          try {
            const latest = await getValidUserSession();
            if (!latest || latest.token === requestToken) {
              setUser(null);
              navigate("/login", { replace: true });
            } else {
              setUser(latest);
            }
          } catch {
            setUser(null);
            navigate("/login", { replace: true });
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