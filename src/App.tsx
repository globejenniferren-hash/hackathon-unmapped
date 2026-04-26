import { Link, Navigate, Route, Routes } from "react-router-dom";
import { GovernmentDashboard } from "./pages/GovernmentDashboard";

function Home() {
  return (
    <div style={{ minHeight: "100vh", background: "#f0f4f8", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "2rem 1.25rem" }}>
        <h1 style={{ fontSize: "1.5rem" }}>UNMAPPED (demo)</h1>
        <p style={{ color: "#4a5a68" }}>Youth flow lives in the Lovable build; this repo hosts a reliable government view.</p>
        <p>
          <Link to="/dashboard" style={{ color: "#0f766e", fontWeight: 600 }}>
            Open government dashboard
          </Link>
        </p>
        <p style={{ fontSize: "0.85rem", color: "#5c6b7a" }}>Path: <code>/dashboard</code></p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/dashboard" element={<GovernmentDashboard />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
