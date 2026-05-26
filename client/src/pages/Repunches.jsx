import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import axios from "axios";

const REJECTION_REASONS = ["Insufficient funds", "ID mismatch", "EC not found", "Other"];

const STATUS_STYLES = {
  "Insufficient funds": { bg: "#4a1a1a", text: "#f87171" },
  "ID mismatch":        { bg: "#4a3a00", text: "#facc15" },
  "EC not found":       { bg: "#4a3a00", text: "#facc15" },
  "Other":              { bg: "#4a3a00", text: "#facc15" },
};

function BatchBlock({ batch }) {
  const [open, setOpen] = useState(false);

  const fixedCount = batch.orders.filter(o => o.status === "ADJUSTED").length;
  const remainingCount = batch.orders.filter(o => o.status === "REJECTED").length;
  const allFixed = remainingCount === 0;

  const badgeStyle = allFixed
    ? { bg: "#1a3a6a", text: "#93c5fd" }
    : fixedCount > 0
    ? { bg: "#1a4a1a", text: "#4ade80" }
    : { bg: "#4a1a1a", text: "#f87171" };

  const badgeLabel = allFixed
    ? "All fixed — ready"
    : fixedCount > 0
    ? `${fixedCount} of ${batch.orders.length} fixed`
    : `${remainingCount} need fixing`;

  return (
    <div className="rounded-xl overflow-hidden mb-3"
      style={{ background: "#4a5280" }}>

      {/* Batch header */}
      <div
        className="flex items-center justify-between px-6 py-4 cursor-pointer hover:opacity-90 transition-all"
        style={{ background: "#3a4270" }}
        onClick={() => setOpen(!open)}>
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.1)" }}>
            <span className="text-white text-sm">≡</span>
          </div>
          <div>
            <p className="text-white font-semibold">{batch.batch_number}</p>
            <p className="text-gray-400 text-xs">{batch.orders.length} rejected records</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-gray-400 text-sm">
            {batch.orders.length} rejected
          </span>
          <span className="px-3 py-1 rounded-full text-xs font-semibold"
            style={{ background: badgeStyle.bg, color: badgeStyle.text }}>
            {badgeLabel}
          </span>
          <span className="text-gray-400 text-lg">{open ? "∧" : "∨"}</span>
        </div>
      </div>

      {/* Orders table */}
      {open && (
        <div>
          <table className="w-full">
            <thead>
              <tr style={{ background: "#2C3454" }}>
                {["Client", "EC Number", "Amount", "Term", "Monthly", "Currency", "Rejection", "Action"].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-gray-400 text-xs font-medium uppercase">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {batch.orders.map((order, i) => (
                <RepunchRow key={order.batch_order_id} order={order} shade={i % 2 === 1} />
              ))}
            </tbody>
          </table>

          <div className="px-6 py-3 flex items-center justify-between"
            style={{ background: "#3a4270" }}>
            <p className="text-gray-400 text-sm">
              {remainingCount} remaining · {fixedCount} fixed and ready
            </p>
            <button
              className="px-4 py-2 rounded-lg text-white text-sm font-semibold transition-all hover:opacity-90"
              style={{ background: "#1e6b1e" }}>
              → Resubmit fixed from this batch
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function RepunchRow({ order, shade }) {
  const [term, setTerm] = useState(order.adjusted_term_months || order.term_months);
  const [fixed, setFixed] = useState(order.status === "ADJUSTED");
  const newMonthly = (order.amount / term).toFixed(2);
  const isInsufficient = order.rejection_reason === "Insufficient funds";
  const isDataError = ["ID mismatch", "EC not found"].includes(order.rejection_reason);

  const rejStyle = STATUS_STYLES[order.rejection_reason] || STATUS_STYLES["Other"];

  return (
    <tr style={{ background: shade ? "rgba(255,255,255,0.03)" : "transparent" }}>
      <td className="px-4 py-3 text-white text-sm font-medium">{order.client.full_name}</td>
      <td className="px-4 py-3 text-gray-300 text-sm">{order.client.ec_number}</td>
      <td className="px-4 py-3 text-gray-300 text-sm">
        {order.currency === "USD" ? "$" : "ZW$"}{order.amount}
      </td>
      <td className="px-4 py-3 text-gray-300 text-sm">{order.term_months} mo</td>
      <td className="px-4 py-3 text-gray-300 text-sm">
        {order.currency === "USD" ? "$" : "ZW$"}{newMonthly}
      </td>
      <td className="px-4 py-3">
        <span className="px-2 py-1 rounded text-xs font-semibold"
          style={{
            background: order.currency === "USD" ? "#1a3a4a" : "#4a3a00",
            color: order.currency === "USD" ? "#93c5fd" : "#facc15"
          }}>
          {order.currency}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className="px-2 py-1 rounded text-xs font-semibold"
          style={{ background: rejStyle.bg, color: rejStyle.text }}>
          {order.rejection_reason}
        </span>
      </td>
      <td className="px-4 py-3">
        {fixed ? (
          <span className="px-3 py-1 rounded-full text-xs font-semibold"
            style={{ background: "#1a4a1a", color: "#4ade80" }}>
            Fixed +{term - order.term_months} mo
          </span>
        ) : isInsufficient ? (
          <div className="flex items-center gap-2">
            <select
              value={term}
              onChange={e => setTerm(parseInt(e.target.value))}
              className="px-2 py-1 rounded text-white text-xs outline-none"
              style={{ background: "#2C3454" }}>
              {[5, 7, 9, 12].filter(t => t > order.term_months).map(t => (
                <option key={t} value={t}>{t} mo</option>
              ))}
            </select>
            <button
              onClick={() => setFixed(true)}
              className="px-3 py-1 rounded text-xs font-semibold transition-all hover:opacity-80"
              style={{ background: "#1a3a6a", color: "#93c5fd" }}>
              Extend
            </button>
          </div>
        ) : isDataError ? (
          <button
            onClick={() => setFixed(true)}
            className="px-3 py-1 rounded text-xs font-semibold transition-all hover:opacity-80"
            style={{ background: "#4a3a00", color: "#facc15" }}>
            Fix {order.rejection_reason.includes("ID") ? "ID" : "EC"}
          </button>
        ) : null}
      </td>
    </tr>
  );
}

export default function Repunches() {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalRepunches, setTotalRepunches] = useState(0);
  const [readyCount, setReadyCount] = useState(0);

  useEffect(() => {
    fetchRejectedBatches();
  }, []);

  const fetchRejectedBatches = async () => {
    try {
      const res = await axios.get("http://localhost:8000/api/batches/");
      const allBatches = res.data;

      const batchesWithRejections = [];
      let total = 0;
      let ready = 0;

      for (const batch of allBatches) {
        if (["PARTIAL", "REJECTED"].includes(batch.status)) {
          const detail = await axios.get(`http://localhost:8000/api/batches/${batch.id}/orders`);
          const rejected = detail.data.orders.filter(o =>
            o.status === "REJECTED" || o.status === "ADJUSTED"
          );
          if (rejected.length > 0) {
            batchesWithRejections.push({
              ...batch,
              orders: rejected,
            });
            total += rejected.length;
            ready += rejected.filter(o => o.status === "ADJUSTED").length;
          }
        }
      }

      setBatches(batchesWithRejections);
      setTotalRepunches(total);
      setReadyCount(ready);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      {/* Top buttons */}
      <div className="flex justify-end gap-3 mb-6">
        <button
          className="px-5 py-2 rounded-lg text-white text-sm font-semibold transition-all hover:opacity-90"
          style={{ background: "#1e3a5f", border: "1px solid #3a6abf" }}>
          ↑ Import rejection file
        </button>
        <button
          className="px-5 py-2 rounded-lg text-white text-sm font-semibold transition-all hover:opacity-90"
          style={{ background: "#1e6b1e" }}>
          → Resubmit all fixed
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="rounded-xl p-5" style={{ background: "#4a5280" }}>
          <p className="text-gray-400 text-sm">Total repunches</p>
          <p className="text-white text-3xl font-bold mt-1">{totalRepunches}</p>
          <p className="text-gray-400 text-sm mt-1">Across {batches.length} batches</p>
        </div>
        <div className="rounded-xl p-5" style={{ background: "#4a5280" }}>
          <p className="text-gray-400 text-sm">Ready to resubmit</p>
          <p className="text-white text-3xl font-bold mt-1">{readyCount}</p>
          <p className="text-gray-400 text-sm mt-1">Fixed and waiting</p>
        </div>
      </div>

      {/* Batch list */}
      {loading ? (
        <p className="text-gray-400 text-center py-10">Loading...</p>
      ) : batches.length === 0 ? (
        <div className="rounded-xl p-10 text-center" style={{ background: "#4a5280" }}>
          <p className="text-white font-semibold text-lg mb-2">No repunches</p>
          <p className="text-gray-400 text-sm">
            Rejected forms will appear here once batches are marked as Partial or Rejected
          </p>
        </div>
      ) : (
        batches.map(batch => (
          <BatchBlock key={batch.id} batch={batch} />
        ))
      )}
    </Layout>
  );
}