import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import axios from "axios";

const STATUS_STYLES = {
  OPEN:        { bg: "#1a3a4a", text: "#93c5fd", label: "Open" },
  SUBMITTED:   { bg: "#2a2a4a", text: "#a78bfa", label: "Submitted" },
  IN_PROGRESS: { bg: "#4a3a00", text: "#facc15", label: "In Progress" },
  APPROVED:    { bg: "#1a4a1a", text: "#4ade80", label: "Approved" },
};

export default function SubmittedBatches() {
  const navigate = useNavigate();
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [importing, setImporting] = useState(false);
  const [openMenu, setOpenMenu] = useState(null);
  const globalFileRef = useRef();

  useEffect(() => { fetchBatches(); }, []);

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

  const handleExport = (batchId) => {
    window.open(`http://localhost:8000/api/batches/${batchId}/export`, "_blank");
  };

  const handleMarkSubmitted = async (batchId) => {
    try {
      await axios.put(`http://localhost:8000/api/batches/${batchId}/status?status=SUBMITTED`);
      await fetchBatches();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (batchId) => {
    if (!window.confirm("Are you sure you want to delete this batch?")) return;
    try {
      await axios.delete(`http://localhost:8000/api/batches/${batchId}`);
      await fetchBatches();
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to delete batch");
    }
  };

  const handleGlobalImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await axios.post(
        "http://localhost:8000/api/batches/import-global",
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      alert(`✓ Processed: ${res.data.approved} approved, ${res.data.rejected} rejected across ${res.data.batches_updated} batch(es)${res.data.not_found.length > 0 ? `. ${res.data.not_found.length} EC numbers not found.` : ""}`);
      await fetchBatches();
    } catch (err) {
      alert("Import failed — check the file format");
    } finally {
      setImporting(false);
      e.target.value = "";
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
              onClick={() => globalFileRef.current.click()}
              disabled={importing}
              className="px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50"
              style={{ background: "#4a3a00", color: "#facc15" }}>
              {importing ? "Processing..." : "↑ Import Response"}
            </button>
          </div>
        </div>

        <input
          ref={globalFileRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={handleGlobalImport}
        />

        {/* Table */}
        <div style={{ maxHeight: "600px", overflowY: "auto" }}>
          <div className="rounded-lg overflow-visible">
            <table className="w-full">
            <thead>
              <tr style={{ background: "#2C3454" }}>
                <th className="text-left px-4 py-3 text-gray-400 text-sm font-medium">Batch No.</th>
                <th className="text-left px-4 py-3 text-gray-400 text-sm font-medium">Date</th>
                <th className="text-left px-4 py-3 text-gray-400 text-sm font-medium">Orders</th>
                <th className="text-left px-4 py-3 text-gray-400 text-sm font-medium">USD</th>
                <th className="text-left px-4 py-3 text-gray-400 text-sm font-medium">ZWL</th>
                <th className="text-left px-4 py-3 text-gray-400 text-sm font-medium">Status</th>
                <th className="text-left px-4 py-3 text-gray-400 text-sm font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-10 text-gray-400">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-10 text-gray-400">No batches found.</td></tr>
              ) : (
                filtered.map((batch, i) => {
                  const style = STATUS_STYLES[batch.status] || STATUS_STYLES.OPEN;
                  return (
                    <tr key={batch.id}
                      style={{ background: i % 2 === 0 ? "rgba(255,255,255,0.03)" : "transparent" }}>
                      <td className="px-4 py-4 text-white text-sm font-medium">{batch.batch_number}</td>
                      <td className="px-4 py-4 text-gray-300 text-sm">
                        {new Date(batch.created_at).toLocaleDateString("en-ZA")}
                      </td>
                      <td className="px-4 py-4 text-gray-300 text-sm">{batch.total_orders}</td>
                      <td className="px-4 py-4 text-gray-300 text-sm">
                        {batch.total_amount_usd > 0 ? `$${batch.total_amount_usd}` : "—"}
                      </td>
                      <td className="px-4 py-4 text-gray-300 text-sm">
                        {batch.total_amount_zwl > 0 ? `ZW$${batch.total_amount_zwl}` : "—"}
                      </td>
                      <td className="px-4 py-4">
                        <span className="px-3 py-1 rounded-full text-xs font-semibold"
                          style={{ background: style.bg, color: style.text }}>
                          {style.label}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex gap-2 flex-wrap items-center">
                          {/* Export */}
                          {batch.total_orders > 0 && (
                            <button
                              onClick={() => handleExport(batch.id)}
                              className="px-3 py-1 rounded text-xs font-semibold transition-all hover:opacity-80"
                              style={{ background: "#1e6b1e", color: "#fff" }}>
                              Export
                            </button>
                          )}
                          {/* Mark submitted */}
                          {batch.status === "OPEN" && batch.total_orders > 0 && (
                            <button
                              onClick={() => handleMarkSubmitted(batch.id)}
                              className="px-3 py-1 rounded text-xs font-semibold transition-all hover:opacity-80"
                              style={{ background: "#1e3a5f", color: "#fff" }}>
                              Mark Submitted
                            </button>
                          )}
                          {/* 3 dot menu */}
                          <div className="relative">
                            <button
                              onClick={() => setOpenMenu(openMenu === batch.id ? null : batch.id)}
                              className="px-2 py-1 rounded text-lg text-gray-400 hover:text-white transition-colors">
                              ⋮
                            </button>
                            {openMenu === batch.id && (
                              <div className="absolute right-0 top-8 z-10 rounded-lg shadow-lg overflow-hidden"
                                style={{ background: "#2C3454", border: "1px solid rgba(255,255,255,0.1)", minWidth: "140px" }}>
                                <button
                                  onClick={() => { handleDelete(batch.id); setOpenMenu(null); }}
                                  className="w-full text-left px-4 py-3 text-sm text-red-400 hover:bg-red-900 hover:bg-opacity-30 transition-colors">
                                  🗑 Delete batch
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        </div>

        {!loading && (
          <p className="text-gray-400 text-sm mt-4">
            Showing {filtered.length} of {batches.length} batches
          </p>
        )}
      </div>
    </Layout>
  );
}