import { useState, useRef } from "react";
import Layout from "../components/Layout";
import axios from "axios";

const TERM_OPTIONS = [3, 5, 7, 9, 12];

export default function FormIntake() {
  const [image, setImage] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiExtracted, setAiExtracted] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef();

  const [form, setForm] = useState({
    full_name: "",
    id_number: "",
    ec_number: "",
    reference_number: "",
    employer: "",
    amount: "",
    term_months: 5,
    currency: "USD",
  });

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImageFile(file);
    setImage(URL.createObjectURL(file));
    setAiExtracted(false);
    setSuccess(false);
    setError("");
    await scanForm(file);
  };

  const scanForm = async (file) => {
    setScanning(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await axios.post("http://localhost:8000/api/orders/scan", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const extracted = res.data.extracted;
      setForm(prev => ({
        ...prev,
        full_name: extracted.full_name || "",
        id_number: extracted.id_number || "",
        ec_number: extracted.ec_number || "",
        reference_number: extracted.reference_number || "",
        employer: extracted.employer || "",
        amount: extracted.amount || "",
        term_months: extracted.term_months || 5,
        currency: extracted.currency || "USD",
      }));
      setAiExtracted(true);
    } catch (err) {
      setError("Scan failed — please fill in the fields manually.");
    } finally {
      setScanning(false);
    }
  };

  const handleRescan = () => {
    fileRef.current.click();
  };

  const handleSave = async () => {
    setError("");
    setSaving(true);
    try {
      await axios.post("http://localhost:8000/api/orders/", {
        ...form,
        amount: parseFloat(form.amount),
        term_months: parseInt(form.term_months),
      });
      setSuccess(true);
      setForm({
        full_name: "", id_number: "", ec_number: "",
        reference_number: "", employer: "",
        amount: "", term_months: 5, currency: "USD",
      });
      setImage(null);
      setAiExtracted(false);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to save order.");
    } finally {
      setSaving(false);
    }
  };

  const monthly = form.amount && form.term_months
    ? (parseFloat(form.amount) / parseInt(form.term_months)).toFixed(2)
    : null;

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">

        {/* Upload area */}
        <div
          onClick={() => fileRef.current.click()}
          className="rounded-xl p-10 text-center cursor-pointer mb-6 transition-all hover:opacity-90"
          style={{
            background: "#4a5280",
            border: "2px dashed rgba(255,255,255,0.2)"
          }}>
          {scanning ? (
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin" />
              <p className="text-white font-semibold">Scanning form...</p>
              <p className="text-gray-400 text-sm">AI is extracting the fields</p>
            </div>
          ) : image ? (
            <div className="flex flex-col items-center gap-3">
              <img src={image} alt="Scanned form"
                className="max-h-40 object-contain rounded-lg" />
              <p className="text-gray-400 text-sm">Click to upload a different form</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-full flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.1)" }}>
                <span className="text-3xl">📷</span>
              </div>
              <p className="text-white font-semibold text-lg">
                Take a photo or upload the form
              </p>
              <p className="text-gray-400 text-sm">
                AI will automatically extract the client information
              </p>
            </div>
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFile}
        />

        {/* Choose file button */}
        {!scanning && (
          <button
            onClick={() => fileRef.current.click()}
            className="w-full py-3 rounded-xl font-semibold text-white mb-6 transition-all hover:opacity-90"
            style={{ background: "#1e3a5f" }}>
            Choose File
          </button>
        )}

        {/* AI notice */}
        {aiExtracted && (
          <div className="mb-4 px-4 py-3 rounded-lg flex items-center gap-2"
            style={{ background: "rgba(212,160,23,0.15)", border: "1px solid rgba(212,160,23,0.3)" }}>
            <span>✨</span>
            <p className="text-yellow-300 text-sm">
              AI extracted these fields — please review before saving
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg"
            style={{ background: "rgba(220,38,38,0.15)", border: "1px solid rgba(220,38,38,0.3)" }}>
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Success */}
        {success && (
          <div className="mb-4 px-4 py-3 rounded-lg"
            style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)" }}>
            <p className="text-green-400 text-sm">✓ Order saved successfully</p>
          </div>
        )}

        {/* Form fields */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          {[
            { label: "Full Name", key: "full_name", type: "text" },
            { label: "ID Number", key: "id_number", type: "text" },
            { label: "EC Number", key: "ec_number", type: "text" },
            { label: "Reference Number", key: "reference_number", type: "text" },
            { label: "Employer / Department", key: "employer", type: "text" },
            { label: "Purchase Amount", key: "amount", type: "number" },
          ].map(({ label, key, type }) => (
            <div key={key}>
              <label className="text-gray-400 text-sm mb-1 block">{label}</label>
              <input
                type={type}
                value={form[key]}
                onChange={e => setForm({ ...form, [key]: e.target.value })}
                className="w-full px-4 py-3 rounded-lg text-white text-sm outline-none"
                style={{ background: "#4a5280", border: "1px solid rgba(255,255,255,0.1)" }}
              />
            </div>
          ))}
        </div>

        {/* Term and currency row */}
        <div className="grid grid-cols-2 gap-4 mb-2">
          <div>
            <label className="text-gray-400 text-sm mb-1 block">Payment Term</label>
            <select
              value={form.term_months}
              onChange={e => setForm({ ...form, term_months: parseInt(e.target.value) })}
              className="w-full px-4 py-3 rounded-lg text-white text-sm outline-none"
              style={{ background: "#4a5280", border: "1px solid rgba(255,255,255,0.1)" }}>
              {TERM_OPTIONS.map(t => (
                <option key={t} value={t}>{t} Months</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-gray-400 text-sm mb-1 block">Currency</label>
            <div className="flex gap-3 mt-2">
              {["USD", "ZWL"].map(c => (
                <button
                  key={c}
                  onClick={() => setForm({ ...form, currency: c })}
                  className="flex-1 py-3 rounded-lg font-semibold text-sm transition-all"
                  style={{
                    background: form.currency === c ? "#1e3a5f" : "#4a5280",
                    color: form.currency === c ? "#ffffff" : "#9ca3af",
                    border: form.currency === c
                      ? "2px solid #3a6abf"
                      : "1px solid rgba(255,255,255,0.1)"
                  }}>
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Monthly instalment preview */}
        {monthly && (
          <div className="mb-6 px-4 py-3 rounded-lg"
            style={{ background: "rgba(255,255,255,0.05)" }}>
            <p className="text-gray-400 text-sm">
              Monthly instalment:
              <span className="text-white font-bold ml-2">
                {form.currency} {monthly}
              </span>
            </p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleRescan}
            className="flex-1 py-3 rounded-xl font-semibold transition-all hover:opacity-90"
            style={{ background: "#8B1A1A", color: "#ffffff" }}>
            Re-scan
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.full_name || !form.ec_number || !form.amount}
            className="flex-1 py-3 rounded-xl font-semibold transition-all hover:opacity-90 disabled:opacity-40"
            style={{ background: "#1e3a5f", color: "#ffffff" }}>
            {saving ? "Saving..." : "Confirm & Save"}
          </button>
        </div>

      </div>
    </Layout>
  );
}