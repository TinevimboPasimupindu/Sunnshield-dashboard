import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import axios from "axios";

function StatCard({ label, value, sub, subColor }) {
  return (
    <div className="rounded-xl p-5 flex flex-col gap-1"
      style={{ background: "#4a5280" }}>
      <p className="text-gray-300 text-sm">{label}</p>
      <p className="text-white text-3xl font-bold">{value}</p>
      {sub && <p className={`text-sm ${subColor || "text-gray-400"}`}>{sub}</p>}
    </div>
  );
}

function BarChart({ data, color }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="flex items-end gap-4 h-40 mt-4">
      {data.map((item, i) => (
        <div key={i} className="flex flex-col items-center flex-1 gap-2">
          <div className="w-full rounded-t-md transition-all"
            style={{
              height: `${(item.value / max) * 140}px`,
              background: color,
              minHeight: "4px"
            }} />
          <p className="text-gray-400 text-xs">{item.month}</p>
        </div>
      ))}
    </div>
  );
}

const STATUS_STYLES = {
  OPEN:      { bg: "#1a3a4a", text: "#93c5fd", label: "Open" },
  SUBMITTED: { bg: "#1a3a4a", text: "#93c5fd", label: "Submitted" },
  APPROVED:  { bg: "#1a4a1a", text: "#4ade80", label: "Approved" },
  PARTIAL:   { bg: "#4a3a00", text: "#facc15", label: "Partial" },
  REJECTED:  { bg: "#4a1a1a", text: "#f87171", label: "Rejected" },
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [forecast, setForecast] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [summaryRes, forecastRes] = await Promise.all([
        axios.get("http://localhost:8000/api/dashboard/summary"),
        axios.get("http://localhost:8000/api/dashboard/forecast"),
      ]);
      setSummary(summaryRes.data);
      setForecast(forecastRes.data.forecast);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  const usdForecast = forecast.map(f => ({ month: f.month, value: f.usd }));
  const zwlForecast = forecast.map(f => ({ month: f.month, value: f.zwl }));

  return (
    <Layout>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <StatCard label="Active Clients" value={summary?.active_clients ?? 0} />
        <StatCard label="Expected Monthly (USD)" value={`$${summary?.monthly_income_usd?.toLocaleString() ?? 0}`} />
        <StatCard label="Expected Monthly (ZWL)" value={`ZW$${summary?.monthly_income_zwl?.toLocaleString() ?? 0}`} />
        <StatCard label="Approval Rate" value={`${summary?.approval_rate ?? 0}%`} sub="Across all batches" />
        <StatCard label="Pending Resubmission" value={summary?.pending_resubmission ?? 0}
          sub="Need attention"
          subColor={summary?.pending_resubmission > 0 ? "text-yellow-400" : "text-gray-400"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-xl p-6" style={{ background: "#4a5280" }}>
          <p className="text-white font-semibold mb-1">Monthly Income Forecast</p>
          <div className="flex gap-6">
            <div className="flex-1">
              <p className="text-gray-400 text-xs mb-1">USD</p>
              <BarChart data={usdForecast} color="#534AB7" />
            </div>
            <div className="flex-1">
              <p className="text-gray-400 text-xs mb-1">ZWL</p>
              <BarChart data={zwlForecast} color="#D4A017" />
            </div>
          </div>
        </div>

        <div className="rounded-xl p-6" style={{ background: "#4a5280" }}>
          <p className="text-white font-semibold mb-4">Recent Submissions</p>
          <div className="flex flex-col gap-3">
            {summary?.recent_batches?.length === 0 ? (
              <p className="text-gray-400 text-sm">No batches yet</p>
            ) : (
              summary?.recent_batches?.map((batch, i) => {
                const style = STATUS_STYLES[batch.status] || STATUS_STYLES.OPEN;
                return (
                  <div key={i}
                    className="flex items-center justify-between py-2 border-b border-white border-opacity-10 last:border-0">
                    <p className="text-gray-300 text-sm">{batch.batch_number}</p>
                    <span className="text-xs px-3 py-1 rounded-full font-semibold"
                      style={{ background: style.bg, color: style.text }}>
                      {style.label}
                    </span>
                  </div>
                );
              })
            )}
          </div>
          <button
            onClick={() => navigate("/submitted-batches")}
            className="mt-4 text-sm text-blue-400 hover:text-blue-300 transition-colors">
            View all batches →
          </button>
        </div>
      </div>
    </Layout>
  );
}