import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import SplashScreen from "./pages/SplashScreen";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import FormIntake from "./pages/FormIntake";
import Repunches from "./pages/Repunches";
import SubmittedBatches from "./pages/SubmittedBatches";
import SalesInformation from "./pages/SalesInformation";

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? children : <Navigate to="/login" />;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return !user ? children : <Navigate to="/dashboard" />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<PublicRoute><SplashScreen /></PublicRoute>} />
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/form-intake" element={<ProtectedRoute><FormIntake /></ProtectedRoute>} />
      <Route path="/repunches" element={<ProtectedRoute><Repunches /></ProtectedRoute>} />
      <Route path="/submitted-batches" element={<ProtectedRoute><SubmittedBatches /></ProtectedRoute>} />
      <Route path="/sales-information" element={<ProtectedRoute><SalesInformation /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}