import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AuthPage from "./pages/AuthPage";
import TasksDashboard from "./pages/TasksDashboard";
import {
  getValidUserSession,
  subscribeToSessionChanges,
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
        .then((session) => {
          if (!active || currentGen !== generation) return;
          setStatus(session ? "authenticated" : "unauthenticated");
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

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<AuthPage />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <TasksDashboard />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}