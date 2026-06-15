import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import axios from "axios";

function BatchBlock({ batch, onRefresh }) {
  const [open, setOpen] = useState(false);
  const [adjusting, setAdjusting] = useState({});
  const [resubmitting, setResubmitting] = useState(false);

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

  const handleExtend = async (bo, newTerm, startDate) => {
    const total = bo.amount * bo.term_months;
    const newInstalment = parseFloat((total / newTerm).toFixed(2));

    // Calculate end date from start date + new term
    const start = new Date(startDate);
    const end = new Date(start);
    end.setMonth(end.getMonth() + newTerm);
    const formatDate = (d) =>
      `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

    setAdjusting(prev => ({ ...prev, [bo.batch_order_id]: true }));
    try {
      await axios.put(`http://localhost:8000/api/repunches/${bo.batch_order_id}/adjust`, {
        adjusted_term_months: newTerm,
        adjusted_instalment: newInstalment,
        new_start_date: formatDate(start),
        new_end_date: formatDate(end),
      });
      onRefresh();
    } catch (err) {
      alert("Failed to save adjustment");
    } finally {
      setAdjusting(prev => ({ ...prev, [bo.batch_order_id]: false }));
    }
  };

  const handleResubmit = async () => {
    setResubmitting(true);
    try {
      const res = await axios.post(`http://localhost:8000/api/repunches/${batch.batch_id}/resubmit`);
      alert(`✓ New batch created: ${res.data.new_batch_number} with ${res.data.orders_count} orders. Go to Submitted Batches to export.`);
      onRefresh();
    } catch (err) {
      alert(err.response?.data?.detail || "Resubmit failed");
    } finally {
      setResubmitting(false);
    }
  };

  return (
    <div className="rounded-xl overflow-hidden mb-3" style={{ background: "#4a5280" }}>
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
            <p className="text-gray-400 text-xs">
              {new Date(batch.created_at).toLocaleDateString("en-ZA")} · {batch.orders.length} rejected records
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="px-3 py-1 rounded-full text-xs font-semibold"
            style={{ background: badgeStyle.bg, color: badgeStyle.text }}>
            {badgeLabel}
          </span>
          <span className="text-gray-400 text-lg">{open ? "∧" : "∨"}</span>
        </div>
      </div>

      {open && (
        <div>
          <div style={{ overflowX: "auto" }}>
            <table className="w-full" style={{ minWidth: "900px" }}>
              <thead>
                <tr style={{ background: "#2C3454" }}>
                  {["Client", "EC Number", "Amount/mo", "Term", "Currency", "Rejection", "Action"].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-gray-400 text-xs font-medium uppercase">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {batch.orders.map((bo, i) => (
                  <RepunchRow
                    key={bo.batch_order_id}
                    bo={bo}
                    shade={i % 2 === 1}
                    onExtend={handleExtend}
                    adjusting={adjusting[bo.batch_order_id]}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-6 py-3 flex items-center justify-between"
            style={{ background: "#3a4270" }}>
            <p className="text-gray-400 text-sm">
              {remainingCount} remaining · {fixedCount} fixed and ready
            </p>
            {fixedCount > 0 && (
              <button
                onClick={handleResubmit}
                disabled={resubmitting}
                className="px-4 py-2 rounded-lg text-white text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50"
                style={{ background: "#1e6b1e" }}>
                {resubmitting ? "Creating batch..." : "→ Resubmit fixed from this batch"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function RepunchRow({ bo, shade, onExtend, adjusting }) {
  const [selectedTerm, setSelectedTerm] = useState(
    bo.adjusted_term_months || (bo.term_months + 2)
  );
  const [newStartDate, setNewStartDate] = useState("");
  const [editId, setEditId] = useState(bo.client.id_number || "");
  const [editEc, setEditEc] = useState(bo.client.ec_number || "");
  const [saving, setSaving] = useState(false);

  const isFixed = bo.status === "ADJUSTED";
  const reason = bo.rejection_reason?.toLowerCase() || "";
  const isInsufficient = reason.includes("insuffi") || reason.includes("salary") || reason.includes("funds");
  const isInvalidId = reason.includes("invalid id") || reason.includes("id number");
  const isInvalidEc = reason.includes("invalid ec") || reason.includes("ec number");

  const currencySymbol = bo.currency === "USD" ? "$" : "ZW$";

  const handleFixData = async () => {
    setSaving(true);
    try {
      await axios.put(`http://localhost:8000/api/repunches/${bo.batch_order_id}/fix-data`, {
        id_number: editId,
        ec_number: editEc,
      });
      onExtend(bo, bo.term_months, new Date().toISOString().split("T")[0]);
    } catch (err) {
      alert("Failed to save fix");
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr style={{ background: shade ? "rgba(255,255,255,0.03)" : "transparent" }}>
      <td className="px-4 py-3 text-white text-sm font-medium">{bo.client.full_name || "—"}</td>
      <td className="px-4 py-3 text-gray-300 text-sm">{bo.client.ec_number}</td>
      <td className="px-4 py-3 text-gray-300 text-sm">
        {currencySymbol}{bo.amount} / mo
      </td>
      <td className="px-4 py-3 text-gray-300 text-sm">
        {isFixed ? bo.adjusted_term_months : bo.term_months} mo
      </td>
      <td className="px-4 py-3">
        <span className="px-2 py-1 rounded text-xs font-semibold"
          style={{
            background: bo.currency === "USD" ? "#1a3a4a" : "#4a3a00",
            color: bo.currency === "USD" ? "#93c5fd" : "#facc15"
          }}>
          {bo.currency}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className="px-2 py-1 rounded text-xs font-semibold"
          style={{ background: "#4a1a1a", color: "#f87171" }}>
          {bo.rejection_reason || "Unknown"}
        </span>
      </td>
      <td className="px-4 py-3">
        {isFixed ? (
          <span className="px-3 py-1 rounded-full text-xs font-semibold"
            style={{ background: "#1a4a1a", color: "#4ade80" }}>
            ✓ Fixed
          </span>
        ) : isInsufficient ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedTerm(t => Math.max(bo.term_months + 1, t - 1))}
                className="w-7 h-7 rounded text-white font-bold transition-all hover:opacity-80"
                style={{ background: "#2C3454" }}>
                −
              </button>
              <span className="text-white text-xs w-28 text-center">
                {selectedTerm} mo · {currencySymbol}{((bo.amount * bo.term_months) / selectedTerm).toFixed(2)}
              </span>
              <button
                onClick={() => setSelectedTerm(t => t + 1)}
                className="w-7 h-7 rounded text-white font-bold transition-all hover:opacity-80"
                style={{ background: "#2C3454" }}>
                +
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={newStartDate}
                onChange={e => setNewStartDate(e.target.value)}
                className="px-2 py-1 rounded text-white text-xs outline-none"
                style={{ background: "#2C3454", border: "1px solid rgba(255,255,255,0.2)" }}
              />
              <button
                onClick={() => onExtend(bo, selectedTerm, newStartDate)}
                disabled={adjusting || !newStartDate}
                className="px-3 py-1 rounded text-xs font-semibold transition-all hover:opacity-80 disabled:opacity-50"
                style={{ background: "#1a3a6a", color: "#93c5fd" }}>
                {adjusting ? "..." : "Save"}
              </button>
            </div>
          </div>
        ) : isInvalidId ? (
          <div className="flex items-center gap-2">
            <input
              value={editId}
              onChange={e => setEditId(e.target.value)}
              className="px-2 py-1 rounded text-white text-xs outline-none w-32"
              style={{ background: "#2C3454", border: "1px solid rgba(255,255,255,0.2)" }}
              placeholder="Fix ID number"
            />
            <button
              onClick={handleFixData}
              disabled={saving}
              className="px-3 py-1 rounded text-xs font-semibold transition-all hover:opacity-80 disabled:opacity-50"
              style={{ background: "#4a3a00", color: "#facc15" }}>
              {saving ? "..." : "Save"}
            </button>
          </div>
        ) : isInvalidEc ? (
          <div className="flex items-center gap-2">
            <input
              value={editEc}
              onChange={e => setEditEc(e.target.value)}
              className="px-2 py-1 rounded text-white text-xs outline-none w-32"
              style={{ background: "#2C3454", border: "1px solid rgba(255,255,255,0.2)" }}
              placeholder="Fix EC number"
            />
            <button
              onClick={handleFixData}
              disabled={saving}
              className="px-3 py-1 rounded text-xs font-semibold transition-all hover:opacity-80 disabled:opacity-50"
              style={{ background: "#4a3a00", color: "#facc15" }}>
              {saving ? "..." : "Save"}
            </button>
          </div>
        ) : (
          <span className="text-xs text-gray-400">Fix manually</span>
        )}
      </td>
    </tr>
  );
}

export default function Repunches() {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalRejected, setTotalRejected] = useState(0);
  const [totalFixed, setTotalFixed] = useState(0);

  useEffect(() => {
    fetchRepunches();
  }, []);

  const fetchRepunches = async () => {
    setLoading(true);
    try {
      const res = await axios.get("http://localhost:8000/api/repunches/");
      setBatches(res.data);
      setTotalRejected(res.data.reduce((s, b) => s + b.total_rejected, 0));
      setTotalFixed(res.data.reduce((s, b) => s + b.fixed_count, 0));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="rounded-xl p-5" style={{ background: "#4a5280" }}>
          <p className="text-gray-400 text-sm">Total repunches</p>
          <p className="text-white text-3xl font-bold mt-1">{totalRejected}</p>
          <p className="text-gray-400 text-sm mt-1">Across {batches.length} batches</p>
        </div>
        <div className="rounded-xl p-5" style={{ background: "#4a5280" }}>
          <p className="text-gray-400 text-sm">Ready to resubmit</p>
          <p className="text-white text-3xl font-bold mt-1">{totalFixed}</p>
          <p className="text-gray-400 text-sm mt-1">Fixed and waiting</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin" />
        </div>
      ) : batches.length === 0 ? (
        <div className="rounded-xl p-10 text-center" style={{ background: "#4a5280" }}>
          <p className="text-white font-semibold text-lg mb-2">No repunches</p>
          <p className="text-gray-400 text-sm">
            Rejected records will appear here once you import a Ndasenda response file
          </p>
        </div>
      ) : (
        batches.map(batch => (
          <BatchBlock key={batch.batch_id} batch={batch} onRefresh={fetchRepunches} />
        ))
      )}
    </Layout>
  );
}