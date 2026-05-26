import { useNavigate } from "react-router-dom";

export default function SplashScreen() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center"
      style={{ background: "linear-gradient(180deg, #2C3454 0%, #1a2040 100%)" }}>

      <div className="flex flex-col items-center mb-12">
        <div className="mb-6">
          <img src="/src/assets/ss-logo.png" alt="Sun N Shield Logo" className="w-32 h-32 object-contain mb-6" />
        </div>
        <h1 className="text-5xl font-bold text-white tracking-widest mb-2">
          SUN N' SHIELD
        </h1>
        <p className="text-gray-400 text-lg tracking-widest">Apparel</p>
      </div>

      <button
        onClick={() => navigate("/login")}
        className="px-12 py-4 rounded-full text-white font-semibold text-lg transition-all duration-200 hover:opacity-90 active:scale-95"
        style={{ background: "#1e3a5f", border: "2px solid #3a5a8f" }}>
        Login / Register
      </button>
    </div>
  );
}