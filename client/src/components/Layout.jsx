import { useAuth } from "../context/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";

const navItems = [
  { label: "Dashboard", path: "/dashboard" },
  { label: "Form Intake", path: "/form-intake" },
  { label: "Repunches", path: "/repunches" },
  { label: "Submitted Batches", path: "/submitted-batches" },
  { label: "Sales Information", path: "/sales-information" },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <div className="flex min-h-screen" style={{ background: "#3a4060" }}>

      {/* Sidebar */}
      <div className="w-72 flex flex-col justify-between py-6 px-6"
        style={{ background: "#2C3454" }}>
        <div>
          <div className="mb-10">
            <img src="/src/assets/ss-logo.png" alt="Logo"
              className="w-10 h-10 object-contain inline-block mr-3" />
            <div className="inline-block">
              <p className="text-white font-bold text-lg leading-tight">SUN N' SHIELD</p>
              <p className="text-gray-400 text-xs">SSB Management System</p>
            </div>
          </div>

          <nav className="flex flex-col gap-2">
            {navItems.map(item => {
              const isActive = location.pathname === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className="text-left px-4 py-3 rounded-lg text-base font-semibold transition-all duration-150"
                  style={{
                    color: isActive ? "#ffffff" : "#9ca3af",
                    background: isActive ? "rgba(255,255,255,0.15)" : "transparent",
                    borderLeft: isActive ? "4px solid #ffffff" : "4px solid transparent",
                    boxShadow: isActive ? "0 4px 12px rgba(0,0,0,0.3)" : "none",
                  }}>
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>

        <button
          onClick={handleLogout}
          className="px-6 py-3 rounded-lg font-bold text-white transition-colors"
          style={{ background: "#8B1A1A" }}>
          LOG OUT
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col">
        {/* Top bar */}
        <div className="px-8 py-4 flex items-center justify-between"
          style={{ background: "#2C3454" }}>
          <p className="text-white font-semibold text-lg">
            Welcome {user?.first_name}
          </p>
        </div>

        {/* Page content */}
        <div className="flex-1 p-8 overflow-auto">
          {children}
        </div>
      </div>
    </div>
  );
}