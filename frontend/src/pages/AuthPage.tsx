import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { loginUser, registerUser } from "../api/authApi";
import { saveSession } from "../utils/sessionStorage";

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = isLogin
        ? await loginUser({ email, password })
        : await registerUser({ fullName, email, password });

      await saveSession(res.data);
      navigate("/dashboard");
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.message || "Authentication failed.");
      } else {
        setError("An unexpected error occurred.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 400, margin: "4rem auto", fontFamily: "sans-serif" }}>
      <h2>{isLogin ? "Log In" : "Sign Up"}</h2>
      {error && <p style={{ color: "red" }}>{error}</p>}
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {!isLogin && (
          <input
            placeholder="Full Name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />
        )}
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password (min 6 chars)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={6}
          required
        />
        <button type="submit" disabled={loading}>
          {loading ? "Please wait..." : isLogin ? "Log In" : "Create Account"}
        </button>
      </form>
      <button
        type="button"
        onClick={() => {
          setIsLogin(!isLogin);
          setError("");
        }}
        style={{ marginTop: 12 }}
      >
        {isLogin ? "Need an account? Sign Up" : "Already have an account? Log In"}
      </button>
    </div>
  );
}