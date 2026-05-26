import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import axios from "axios";

const STATUS_STYLES = {
  OPEN:      { bg: "#1a3a4a", text: "#93c5fd", label: "Open" },
  SUBMITTED: { bg: "#1a3a4a", text: "#93c5fd", label: "Submitted" },
  APPROVED:  { bg: "#1a4a1a", text: "#4ade80", label: "Approved" },
  PARTIAL:   { bg: "#4a3a00", text: "#facc15", label: "Partial" },
  REJECTED:  { bg: "#4a1a1a", text: "#f87171", label: "Rejected" },
};

export default function SubmittedBatches() {
  const navigate = useNavigate();
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchBatches();
  }, []);

  const fetchBatches = async () => {
    try {
      const res = await axios.get("http://localhost:8000/api/batches/");
      setBatches(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBatch = async () => {
    setCreating(true);
    try {
      await axios.post("http://localhost:8000/api/batches/", {});
      await fetchBatches();
    } catch (err) {
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

  const filtered = batches.filter(b =>
    b.batch_number.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Layout>
      <div className="rounded-xl p-6" style={{ background: "#4a5280" }}>

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-white text-xl font-bold">All Client Submissions</h2>
            <p className="text-gray-400 text-sm mt-1">
              Track approvals, pending reviews, and rejected applications
            </p>
          </div>
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Search batches..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="px-4 py-2 rounded-lg text-white text-sm outline-none w-56"
              style={{ background: "#2C3454", border: "1px solid rgba(255,255,255,0.1)" }}
            />
            <button
              onClick={handleCreateBatch}
              disabled={creating}
              className="px-4 py-2 rounded-lg text-white text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50"
              style={{ background: "#1a4a1a" }}>
              {creating ? "Creating..." : "+ New Batch"}
            </button>
            <button
              onClick={() => {
                const selected = filtered.find(b => b.status === "OPEN" || b.status === "SUBMITTED");
                if (selected) {
                  window.open(`http://localhost:8000/api/batches/${selected.id}/export`, "_blank");
                }
              }}
              className="px-4 py-2 rounded-lg text-white text-sm font-semibold transition-all hover:opacity-90"
              style={{ background: "#1e6b1e" }}>
              Export Batch
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr style={{ background: "#2C3454" }}>
                <th className="text-left px-4 py-3 text-gray-400 text-sm font-medium">Batch No.</th>
                <th className="text-left px-4 py-3 text-gray-400 text-sm font-medium">Submission Date</th>
                <th className="text-left px-4 py-3 text-gray-400 text-sm font-medium">Orders</th>
                <th className="text-left px-4 py-3 text-gray-400 text-sm font-medium">Amount (USD)</th>
                <th className="text-left px-4 py-3 text-gray-400 text-sm font-medium">Amount (ZWL)</th>
                <th className="text-left px-4 py-3 text-gray-400 text-sm font-medium">Status</th>
                <th className="text-left px-4 py-3 text-gray-400 text-sm font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-gray-400">
                    Loading...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-gray-400">
                    No batches found. Create your first batch above.
                  </td>
                </tr>
              ) : (
                filtered.map((batch, i) => {
                  const style = STATUS_STYLES[batch.status] || STATUS_STYLES.OPEN;
                  return (
                    <tr key={batch.id}
                      style={{ background: i % 2 === 0 ? "rgba(255,255,255,0.03)" : "transparent" }}>
                      <td className="px-4 py-4 text-white text-sm font-medium">
                        {batch.batch_number}
                      </td>
                      <td className="px-4 py-4 text-gray-300 text-sm">
                        {batch.submitted_at
                          ? new Date(batch.submitted_at).toLocaleDateString("en-ZA")
                          : "—"}
                      </td>
                      <td className="px-4 py-4 text-gray-300 text-sm">
                        {batch.total_orders}
                      </td>
                      <td className="px-4 py-4 text-gray-300 text-sm">
                        {batch.total_amount_usd > 0 ? `$${batch.total_amount_usd.toLocaleString()}` : "—"}
                      </td>
                      <td className="px-4 py-4 text-gray-300 text-sm">
                        {batch.total_amount_zwl > 0 ? `ZW$${batch.total_amount_zwl.toLocaleString()}` : "—"}
                      </td>
                      <td className="px-4 py-4">
                        <span className="px-3 py-1 rounded-full text-xs font-semibold"
                          style={{ background: style.bg, color: style.text }}>
                          {style.label}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <button
                          onClick={() => navigate(`/submitted-batches/${batch.id}`)}
                          className="px-4 py-1 rounded-full text-sm font-semibold transition-all hover:opacity-80"
                          style={{ background: "rgba(255,255,255,0.1)", color: "#ffffff" }}>
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        {!loading && (
          <p className="text-gray-400 text-sm mt-4">
            Showing {filtered.length} of {batches.length} batches
          </p>
        )}
      </div>
    </Layout>
  );
}