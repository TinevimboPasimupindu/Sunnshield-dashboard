import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import axios from "axios";
import { useAuth } from "../context/AuthContext";

const MONTHS = ["Jun", "Jul", "Aug", "Sep", "Oct", "Nov"];
const FORECAST_USD = [4200, 5100, 4800, 3900, 3200, 2800];
const FORECAST_ZWL = [84200, 91000, 88000, 79000, 72000, 65000];

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

function BarChart({ data, months, color }) {
  const max = Math.max(...data);
  return (
    <div className="flex items-end gap-4 h-40 mt-4">
      {data.map((val, i) => (
        <div key={i} className="flex flex-col items-center flex-1 gap-2">
          <div className="w-full rounded-t-md transition-all"
            style={{
              height: `${(val / max) * 140}px`,
              background: color || "#534AB7"
            }} />
          <p className="text-gray-400 text-xs">{months[i]}</p>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { token } = useAuth();
  const navigate = useNavigate();

  const recentBatches = [
    { name: "Batch #041", status: "Approved" },
    { name: "Batch #042", status: "Partial" },
    { name: "Batch #043", status: "Submitted" },
  ];

  const statusColor = {
    Approved: { bg: "#1a4a1a", text: "#4ade80" },
    Partial: { bg: "#4a3a00", text: "#facc15" },
    Submitted: { bg: "#1a3a4a", text: "#93c5fd" },
    Rejected: { bg: "#4a1a1a", text: "#f87171" },
  };

  return (
    <Layout>
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <StatCard label="Active Clients" value="142" />
        <StatCard label="Expected Monthly Income" value="$4,200" />
        <StatCard label="Expected Monthly Income" value="ZW$84,200" />
        <StatCard label="Approval Rate" value="87%" sub="Across all reps" />
        <StatCard label="Pending Resubmission" value="6"
          subColor="text-yellow-400" sub="Need attention" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Income forecast */}
        <div className="lg:col-span-2 rounded-xl p-6" style={{ background: "#4a5280" }}>
          <p className="text-white font-semibold mb-1">Monthly Income Forecast</p>
          <div className="flex gap-6">
            <div className="flex-1">
              <p className="text-gray-400 text-xs mb-1">USD</p>
              <BarChart data={FORECAST_USD} months={MONTHS} color="#534AB7" />
            </div>
            <div className="flex-1">
              <p className="text-gray-400 text-xs mb-1">ZWL</p>
              <BarChart data={FORECAST_ZWL} months={MONTHS} color="#D4A017" />
            </div>
          </div>
        </div>

        {/* Recent submissions */}
        <div className="rounded-xl p-6" style={{ background: "#4a5280" }}>
          <p className="text-white font-semibold mb-4">Recent Submissions</p>
          <div className="flex flex-col gap-3">
            {recentBatches.map((batch, i) => (
              <div key={i}
                className="flex items-center justify-between py-2 border-b border-white border-opacity-10 last:border-0">
                <p className="text-gray-300 text-sm">{batch.name}</p>
                <span className="text-xs px-3 py-1 rounded-full font-semibold"
                  style={{
                    background: statusColor[batch.status]?.bg,
                    color: statusColor[batch.status]?.text
                  }}>
                  {batch.status}
                </span>
              </div>
            ))}
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