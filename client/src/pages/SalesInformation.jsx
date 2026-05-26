import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import axios from "axios";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                 "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const MOCK_CARS = [
  { name: "Car 1", driver: "Thabo M.", orders: 34, approved: 30, rejected: 4, value_usd: 8400, value_zwl: 420000 },
  { name: "Car 2", driver: "Zanele D.", orders: 28, approved: 25, rejected: 3, value_usd: 6200, value_zwl: 310000 },
  { name: "Car 3", driver: "Sipho K.", orders: 22, approved: 18, rejected: 4, value_usd: 4900, value_zwl: 245000 },
  { name: "Car 4", driver: "Lerato N.", orders: 19, approved: 15, rejected: 4, value_usd: 3800, value_zwl: 190000 },
  { name: "Car 5", driver: "Mpho S.", orders: 14, approved: 10, rejected: 4, value_usd: 2600, value_zwl: 130000 },
];

function ApprovalBar({ rate }) {
  const color = rate >= 85 ? "#4ade80" : rate >= 75 ? "#facc15" : "#f87171";
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 rounded-full h-2" style={{ background: "rgba(255,255,255,0.1)" }}>
        <div className="h-2 rounded-full transition-all"
          style={{ width: `${rate}%`, background: color }} />
      </div>
      <span className="text-sm font-semibold w-10 text-right" style={{ color }}>
        {rate}%
      </span>
    </div>
  );
}

function BarChart({ data, months, color, prefix }) {
  const max = Math.max(...data);
  return (
    <div className="flex items-end gap-3 h-36 mt-4">
      {data.map((val, i) => (
        <div key={i} className="flex flex-col items-center flex-1 gap-2">
          <div className="w-full rounded-t-md"
            style={{ height: `${(val / max) * 130}px`, background: color }} />
          <p className="text-gray-400 text-xs">{months[i]}</p>
        </div>
      ))}
    </div>
  );
}

export default function SalesInformation() {
  const topCar = MOCK_CARS[0];
  const teamTotalUSD = MOCK_CARS.reduce((s, c) => s + c.value_usd, 0);
  const teamTotalZWL = MOCK_CARS.reduce((s, c) => s + c.value_zwl, 0);
  const avgApproval = Math.round(
    MOCK_CARS.reduce((s, c) => s + Math.round((c.approved / c.orders) * 100), 0) / MOCK_CARS.length
  );

  const monthlyUSD = [3200, 4100, 3800, 5200, 4800, 6100, 5800, 4900, 5400, 6200, 5900, 7400];
  const monthlyZWL = [64000, 82000, 76000, 104000, 96000, 122000, 116000, 98000, 108000, 124000, 118000, 148000];

  return (
    <Layout>
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="rounded-xl p-5" style={{ background: "#4a5280" }}>
          <p className="text-gray-400 text-sm">Top Car This Month</p>
          <p className="text-white text-2xl font-bold mt-1">{topCar.name}</p>
          <p className="text-gray-400 text-sm mt-1">{topCar.driver} — ${topCar.value_usd.toLocaleString()} in sales</p>
        </div>
        <div className="rounded-xl p-5" style={{ background: "#4a5280" }}>
          <p className="text-gray-400 text-sm">Team Total</p>
          <p className="text-white text-2xl font-bold mt-1">${teamTotalUSD.toLocaleString()}</p>
          <p className="text-gray-400 text-sm mt-1">ZW${teamTotalZWL.toLocaleString()} combined</p>
        </div>
        <div className="rounded-xl p-5" style={{ background: "#4a5280" }}>
          <p className="text-gray-400 text-sm">Approval Rate</p>
          <p className="text-white text-2xl font-bold mt-1">{avgApproval}%</p>
          <p className="text-gray-400 text-sm mt-1">Across all cars</p>
        </div>
      </div>

      {/* Charts and breakdown */}
      <div className="grid grid-cols-3 gap-4 mb-4">

        {/* Monthly sales chart */}
<div className="col-span-2 rounded-xl p-6" style={{ background: "#4a5280" }}>
  <p className="text-white font-semibold mb-1">Monthly Sales Performance</p>
  <div className="overflow-x-auto">
    <div className="flex gap-6" style={{ minWidth: "700px" }}>
      <div className="flex-1">
        <p className="text-gray-400 text-xs mb-1">USD</p>
        <BarChart data={monthlyUSD} months={MONTHS} color="#534AB7" prefix="$" />
      </div>
      <div className="flex-1">
        <p className="text-gray-400 text-xs mb-1">ZWL</p>
        <BarChart data={monthlyZWL} months={MONTHS} color="#D4A017" prefix="ZW$" />
      </div>
    </div>
  </div>
</div>

        {/* Rep breakdown */}
        <div className="rounded-xl p-6" style={{ background: "#4a5280" }}>
          <p className="text-white font-semibold mb-4">Car Breakdown</p>
          <div className="flex flex-col gap-4">
            {MOCK_CARS.map((car, i) => {
              const rate = Math.round((car.approved / car.orders) * 100);
              const initials = car.driver.split(" ").map(w => w[0]).join("");
              return (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                    style={{ background: "#2C3454" }}>
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{car.name}</p>
                    <p className="text-gray-400 text-xs truncate">{car.driver}</p>
                  </div>
                  <div className="w-24">
                    <ApprovalBar rate={rate} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Detailed table */}
      <div className="rounded-xl p-6" style={{ background: "#4a5280" }}>
        <p className="text-white font-semibold mb-4">Detailed Car Performance</p>
        <table className="w-full">
          <thead>
            <tr style={{ background: "#2C3454" }}>
              {["Car", "Driver", "Forms Submitted", "Approved", "Rejected", "Approval Rate", "USD Value", "ZWL Value"].map(h => (
                <th key={h} className="text-left px-4 py-3 text-gray-400 text-xs font-medium uppercase">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MOCK_CARS.map((car, i) => {
              const rate = Math.round((car.approved / car.orders) * 100);
              const rateColor = rate >= 85 ? "#4ade80" : rate >= 75 ? "#facc15" : "#f87171";
              const rateBg = rate >= 85 ? "#1a4a1a" : rate >= 75 ? "#4a3a00" : "#4a1a1a";
              return (
                <tr key={i}
                  style={{ background: i % 2 === 0 ? "rgba(255,255,255,0.03)" : "transparent" }}>
                  <td className="px-4 py-3 text-white text-sm font-medium">{car.name}</td>
                  <td className="px-4 py-3 text-gray-300 text-sm">{car.driver}</td>
                  <td className="px-4 py-3 text-gray-300 text-sm">{car.orders}</td>
                  <td className="px-4 py-3 text-gray-300 text-sm">{car.approved}</td>
                  <td className="px-4 py-3 text-gray-300 text-sm">{car.rejected}</td>
                  <td className="px-4 py-3">
                    <span className="px-3 py-1 rounded-full text-xs font-semibold"
                      style={{ background: rateBg, color: rateColor }}>
                      {rate}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-300 text-sm">
                    ${car.value_usd.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-gray-300 text-sm">
                    ZW${car.value_zwl.toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}