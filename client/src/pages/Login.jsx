import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import axios from "axios";

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await axios.post("http://localhost:8000/api/auth/login", form);
      login(res.data.user, res.data.access_token);
      navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.detail || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center"
      style={{ background: "linear-gradient(180deg, #2C3454 0%, #1a2040 100%)" }}>

      <div className="w-full max-w-md px-8">
        <div className="flex gap-8 mb-10">
          <button
            onClick={() => {}}
            className="text-white font-semibold pb-1 border-b-2 border-blue-500">
            Login
          </button>
          <button
            onClick={() => navigate("/register")}
            className="text-gray-400 pb-1 border-b-2 border-transparent hover:text-white transition-colors">
            Sign up
          </button>
        </div>

        <div className="flex flex-col items-center mb-10">
          <img src="/src/assets/ss-logo.png" alt="Sun N Shield Logo" className="w-20 h-20 object-contain mb-4" />
          <h2 className="text-white text-xl font-bold tracking-widest">SUN N' SHIELD</h2>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500 bg-opacity-20 text-red-300 text-sm text-center">
            {error}
          </div>
        )}

        <div className="mb-4">
          <label className="text-gray-400 text-sm mb-1 block">Email</label>
          <input
            type="email"
            value={form.email}
            onChange={e => setForm({ ...form, email: e.target.value })}
            className="w-full px-4 py-3 rounded-lg text-gray-800 text-sm outline-none"
            style={{ background: "#d1d5db" }}
            placeholder="Enter your email"
          />
        </div>

        <div className="mb-2">
          <label className="text-gray-400 text-sm mb-1 block">Password</label>
          <input
            type="password"
            value={form.password}
            onChange={e => setForm({ ...form, password: e.target.value })}
            onKeyDown={e => e.key === "Enter" && handleSubmit()}
            className="w-full px-4 py-3 rounded-lg text-gray-800 text-sm outline-none"
            style={{ background: "#d1d5db" }}
            placeholder="Enter your password"
          />
        </div>

        <div className="text-right mb-8">
          <span className="text-gray-400 text-sm cursor-pointer hover:text-white">
            Forgot Password
          </span>
        </div>

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full py-3 rounded-full text-white font-semibold transition-all duration-200 hover:opacity-90 active:scale-95 disabled:opacity-50"
          style={{ background: "#1e3a5f" }}>
          {loading ? "Logging in..." : "Proceed"}
        </button>
      </div>
    </div>
  );
}