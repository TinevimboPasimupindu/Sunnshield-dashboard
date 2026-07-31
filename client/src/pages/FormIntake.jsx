import { useState, useRef } from "react";
import Layout from "../components/Layout";
import axios from "axios";

const REQUIRED_KEYS = ["ec_number", "id_number", "reference_number", "start_date", "end_date", "amount"];

const emptyForm = {
  ec_number: "",
  id_number: "",
  reference_number: "",
  start_date: "",
  end_date: "",
  amount: "",
  currency: "USD",
};

export default function FormIntake() {
  // mode: "single" | "batch-currency" | "batch-processing" | "batch-summary" | "batch-review" | "batch-done"
  const [mode, setMode] = useState("single");

  // Single-photo flow state
  const [image, setImage] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiExtracted, setAiExtracted] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef();
  const [form, setForm] = useState(emptyForm);

  // Batch flow state
  const batchFileRef = useRef();
  const [batchCurrency, setBatchCurrency] = useState("USD");
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [batchSavedCount, setBatchSavedCount] = useState(0);
  const [needsReview, setNeedsReview] = useState([]); // [{ file, image, extracted }]
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewForm, setReviewForm] = useState(emptyForm);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewError, setReviewError] = useState("");

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
    setAiExtracted(false);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await axios.post("http://localhost:8000/api/orders/scan", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const extracted = res.data.extracted;
      console.log("Extracted:", extracted);

      setForm({
        ec_number: extracted.ec_number || "",
        id_number: extracted.id_number || "",
        reference_number: extracted.reference_number || "",
        start_date: extracted.start_date || "",
        end_date: extracted.end_date || "",
        amount: extracted.amount !== null ? String(extracted.amount) : "",
        currency: extracted.currency || "USD",
      });
      setAiExtracted(true);
    } catch (err) {
      setError("Scan failed — please fill in the fields manually.");
    } finally {
      setScanning(false);
    }
  };

  const handleSave = async () => {
    setError("");
    setSaving(true);
    try {
      await axios.post("http://localhost:8000/api/orders/", {
        ...form,
        amount: parseFloat(form.amount),
      });
      setSuccess(true);
      setForm(emptyForm);
      setImage(null);
      setAiExtracted(false);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to save order.");
    } finally {
      setSaving(false);
    }
  };

  // ---------- Batch flow ----------

  const isComplete = (extracted) =>
    REQUIRED_KEYS.every(
      (key) => extracted[key] !== null && extracted[key] !== undefined && extracted[key] !== ""
    );

  const extractedToForm = (extracted) => ({
    ec_number: extracted.ec_number || "",
    id_number: extracted.id_number || "",
    reference_number: extracted.reference_number || "",
    start_date: extracted.start_date || "",
    end_date: extracted.end_date || "",
    amount: extracted.amount !== null && extracted.amount !== undefined ? String(extracted.amount) : "",
    currency: batchCurrency,
  });

  const chooseBatchCurrency = (c) => {
    setBatchCurrency(c);
    batchFileRef.current.click();
  };

  const handleBatchFile = async (e) => {
    const files = Array.from(e.target.files || []).slice(0, 100);
    e.target.value = "";
    if (files.length === 0) return;
    await runBatch(files);
  };

  const runBatch = async (files) => {
    setMode("batch-processing");
    setBatchProgress({ current: 0, total: files.length });

    let saved = 0;
    const review = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setBatchProgress({ current: i + 1, total: files.length });

      let extracted = {
        ec_number: null,
        id_number: null,
        reference_number: null,
        start_date: null,
        end_date: null,
        amount: null,
      };

      try {
        const formData = new FormData();
        formData.append("file", file);
        const scanRes = await axios.post("http://localhost:8000/api/orders/scan", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        extracted = scanRes.data.extracted || extracted;
      } catch (err) {
        review.push({ file, image: URL.createObjectURL(file), extracted });
        continue;
      }

      if (isComplete(extracted)) {
        try {
          await axios.post("http://localhost:8000/api/orders/", {
            ec_number: extracted.ec_number,
            id_number: extracted.id_number,
            reference_number: extracted.reference_number,
            start_date: extracted.start_date,
            end_date: extracted.end_date,
            amount: parseFloat(extracted.amount),
            currency: batchCurrency,
          });
          saved++;
        } catch (err) {
          review.push({ file, image: URL.createObjectURL(file), extracted });
        }
      } else {
        review.push({ file, image: URL.createObjectURL(file), extracted });
      }
    }

    setBatchSavedCount(saved);
    setNeedsReview(review);
    setReviewIndex(0);
    if (review.length > 0) {
      setReviewForm(extractedToForm(review[0].extracted));
    }
    setMode("batch-summary");
  };

  const startReview = () => {
    setReviewError("");
    setMode("batch-review");
  };

  const goToNextReviewItem = () => {
    const next = reviewIndex + 1;
    if (next < needsReview.length) {
      setReviewIndex(next);
      setReviewForm(extractedToForm(needsReview[next].extracted));
      setReviewError("");
    } else {
      setMode("batch-done");
    }
  };

  const handleReviewSave = async () => {
    setReviewError("");
    setReviewSaving(true);
    try {
      await axios.post("http://localhost:8000/api/orders/", {
        ...reviewForm,
        amount: parseFloat(reviewForm.amount),
      });
      setBatchSavedCount((c) => c + 1);
      goToNextReviewItem();
    } catch (err) {
      setReviewError(err.response?.data?.detail || "Failed to save order.");
    } finally {
      setReviewSaving(false);
    }
  };

  const handleReviewSkip = () => {
    setReviewError("");
    goToNextReviewItem();
  };

  const resetBatch = () => {
    setMode("single");
    setBatchProgress({ current: 0, total: 0 });
    setBatchSavedCount(0);
    setNeedsReview([]);
    setReviewIndex(0);
    setReviewForm(emptyForm);
    setReviewError("");
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">

        {/* Hidden file inputs — always mounted */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFile}
        />
        <input
          ref={batchFileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleBatchFile}
        />

        {mode === "single" && (
          <>
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

            {!scanning && (
              <div className="flex gap-3 mb-6">
                <button
                  onClick={() => fileRef.current.click()}
                  className="flex-1 py-3 rounded-xl font-semibold text-white transition-all hover:opacity-90"
                  style={{ background: "#1e3a5f" }}>
                  Choose File
                </button>
                <button
                  onClick={() => setMode("batch-currency")}
                  className="flex-1 py-3 rounded-xl font-semibold text-white transition-all hover:opacity-90"
                  style={{ background: "#4a5280", border: "1px solid rgba(255,255,255,0.2)" }}>
                  Upload Batch
                </button>
              </div>
            )}

            {aiExtracted && (
              <div className="mb-4 px-4 py-3 rounded-lg flex items-center gap-2"
                style={{ background: "rgba(212,160,23,0.15)", border: "1px solid rgba(212,160,23,0.3)" }}>
                <span>✨</span>
                <p className="text-yellow-300 text-sm">
                  AI extracted these fields — please review before saving
                </p>
              </div>
            )}

            {error && (
              <div className="mb-4 px-4 py-3 rounded-lg"
                style={{ background: "rgba(220,38,38,0.15)", border: "1px solid rgba(220,38,38,0.3)" }}>
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            {success && (
              <div className="mb-4 px-4 py-3 rounded-lg"
                style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)" }}>
                <p className="text-green-400 text-sm">✓ Order saved successfully</p>
              </div>
            )}

            {/* Form fields */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              {[
                { label: "EC Number", key: "ec_number" },
                { label: "ID Number", key: "id_number" },
                { label: "Reference Number", key: "reference_number" },
                { label: "Amount (monthly instalment)", key: "amount", type: "number" },
                { label: "From Date (DD/MM/YYYY)", key: "start_date" },
                { label: "To Date (DD/MM/YYYY)", key: "end_date" },
              ].map(({ label, key, type }) => (
                <div key={key}>
                  <label className="text-gray-400 text-sm mb-1 block">{label}</label>
                  <input
                    type={type || "text"}
                    value={form[key]}
                    onChange={e => setForm({ ...form, [key]: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg text-white text-sm outline-none"
                    style={{ background: "#4a5280", border: "1px solid rgba(255,255,255,0.1)" }}
                  />
                </div>
              ))}
            </div>

            {/* Currency selector */}
            <div className="mb-6">
              <label className="text-gray-400 text-sm mb-2 block">Currency</label>
              <div className="flex gap-3">
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

            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => fileRef.current.click()}
                className="flex-1 py-3 rounded-xl font-semibold transition-all hover:opacity-90"
                style={{ background: "#8B1A1A", color: "#ffffff" }}>
                Re-scan
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.ec_number || !form.id_number || !form.amount}
                className="flex-1 py-3 rounded-xl font-semibold transition-all hover:opacity-90 disabled:opacity-40"
                style={{ background: "#1e3a5f", color: "#ffffff" }}>
                {saving ? "Saving..." : "Confirm & Save"}
              </button>
            </div>
          </>
        )}

        {mode === "batch-currency" && (
          <div
            className="rounded-xl p-10 text-center"
            style={{ background: "#4a5280", border: "1px solid rgba(255,255,255,0.1)" }}>
            <div className="flex flex-col items-center gap-4">
              <p className="text-white font-semibold text-lg">
                Select the currency for this batch
              </p>
              <p className="text-gray-400 text-sm">
                All auto-saved forms in this batch will be saved as this currency
              </p>
              <div className="flex gap-3 w-full max-w-sm">
                {["USD", "ZWL"].map(c => (
                  <button
                    key={c}
                    onClick={() => chooseBatchCurrency(c)}
                    className="flex-1 py-3 rounded-lg font-semibold text-sm transition-all"
                    style={{
                      background: batchCurrency === c ? "#1e3a5f" : "#4a5280",
                      color: batchCurrency === c ? "#ffffff" : "#9ca3af",
                      border: batchCurrency === c
                        ? "2px solid #3a6abf"
                        : "1px solid rgba(255,255,255,0.1)"
                    }}>
                    {c}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setMode("single")}
                className="text-gray-400 text-sm underline">
                Cancel
              </button>
            </div>
          </div>
        )}

        {mode === "batch-processing" && (
          <div
            className="rounded-xl p-10 text-center"
            style={{ background: "#4a5280", border: "2px dashed rgba(255,255,255,0.2)" }}>
            <div className="flex flex-col items-center gap-4">
              <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin" />
              <p className="text-white font-semibold text-lg">
                Scanning {batchProgress.current} of {batchProgress.total} forms...
              </p>
              <div className="w-full max-w-sm h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.1)" }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${batchProgress.total ? (batchProgress.current / batchProgress.total) * 100 : 0}%`,
                    background: "#1e3a5f",
                  }}
                />
              </div>
              <p className="text-gray-400 text-sm">Please keep this tab open until processing finishes</p>
            </div>
          </div>
        )}

        {mode === "batch-summary" && (
          <div
            className="rounded-xl p-10 text-center"
            style={{ background: "#4a5280", border: "1px solid rgba(255,255,255,0.1)" }}>
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-full flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.1)" }}>
                <span className="text-3xl">✅</span>
              </div>
              <p className="text-white font-semibold text-lg">
                {batchSavedCount} saved automatically, {needsReview.length} need review
              </p>
              <div className="flex gap-3 w-full max-w-sm">
                {needsReview.length > 0 ? (
                  <button
                    onClick={startReview}
                    className="flex-1 py-3 rounded-xl font-semibold text-white transition-all hover:opacity-90"
                    style={{ background: "#1e3a5f" }}>
                    Review Now
                  </button>
                ) : (
                  <button
                    onClick={resetBatch}
                    className="flex-1 py-3 rounded-xl font-semibold text-white transition-all hover:opacity-90"
                    style={{ background: "#1e3a5f" }}>
                    Done
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {mode === "batch-review" && needsReview[reviewIndex] && (
          <>
            <div className="mb-4 flex items-center justify-between">
              <p className="text-white font-semibold">
                Reviewing {reviewIndex + 1} of {needsReview.length}
              </p>
              <p className="text-gray-400 text-sm">{batchSavedCount} saved so far</p>
            </div>

            <div
              className="rounded-xl p-6 text-center mb-6"
              style={{ background: "#4a5280", border: "1px solid rgba(255,255,255,0.1)" }}>
              <img
                src={needsReview[reviewIndex].image}
                alt="Form needing review"
                className="max-h-56 object-contain rounded-lg mx-auto"
              />
            </div>

            <div className="mb-4 px-4 py-3 rounded-lg flex items-center gap-2"
              style={{ background: "rgba(212,160,23,0.15)", border: "1px solid rgba(212,160,23,0.3)" }}>
              <span>⚠️</span>
              <p className="text-yellow-300 text-sm">
                Some fields were missing or unreadable — please fill them in and confirm
              </p>
            </div>

            {reviewError && (
              <div className="mb-4 px-4 py-3 rounded-lg"
                style={{ background: "rgba(220,38,38,0.15)", border: "1px solid rgba(220,38,38,0.3)" }}>
                <p className="text-red-400 text-sm">{reviewError}</p>
              </div>
            )}

            {/* Form fields */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              {[
                { label: "EC Number", key: "ec_number" },
                { label: "ID Number", key: "id_number" },
                { label: "Reference Number", key: "reference_number" },
                { label: "Amount (monthly instalment)", key: "amount", type: "number" },
                { label: "From Date (DD/MM/YYYY)", key: "start_date" },
                { label: "To Date (DD/MM/YYYY)", key: "end_date" },
              ].map(({ label, key, type }) => (
                <div key={key}>
                  <label className="text-gray-400 text-sm mb-1 block">{label}</label>
                  <input
                    type={type || "text"}
                    value={reviewForm[key]}
                    onChange={e => setReviewForm({ ...reviewForm, [key]: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg text-white text-sm outline-none"
                    style={{
                      background: "#4a5280",
                      border: reviewForm[key]
                        ? "1px solid rgba(255,255,255,0.1)"
                        : "1px solid rgba(220,38,38,0.5)"
                    }}
                  />
                </div>
              ))}
            </div>

            {/* Currency selector */}
            <div className="mb-6">
              <label className="text-gray-400 text-sm mb-2 block">Currency</label>
              <div className="flex gap-3">
                {["USD", "ZWL"].map(c => (
                  <button
                    key={c}
                    onClick={() => setReviewForm({ ...reviewForm, currency: c })}
                    className="flex-1 py-3 rounded-lg font-semibold text-sm transition-all"
                    style={{
                      background: reviewForm.currency === c ? "#1e3a5f" : "#4a5280",
                      color: reviewForm.currency === c ? "#ffffff" : "#9ca3af",
                      border: reviewForm.currency === c
                        ? "2px solid #3a6abf"
                        : "1px solid rgba(255,255,255,0.1)"
                    }}>
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleReviewSkip}
                disabled={reviewSaving}
                className="flex-1 py-3 rounded-xl font-semibold transition-all hover:opacity-90 disabled:opacity-40"
                style={{ background: "#8B1A1A", color: "#ffffff" }}>
                Skip for now
              </button>
              <button
                onClick={handleReviewSave}
                disabled={reviewSaving || !reviewForm.ec_number || !reviewForm.id_number || !reviewForm.amount}
                className="flex-1 py-3 rounded-xl font-semibold transition-all hover:opacity-90 disabled:opacity-40"
                style={{ background: "#1e3a5f", color: "#ffffff" }}>
                {reviewSaving ? "Saving..." : "Confirm & Save"}
              </button>
            </div>
          </>
        )}

        {mode === "batch-done" && (
          <div
            className="rounded-xl p-10 text-center"
            style={{ background: "#4a5280", border: "1px solid rgba(255,255,255,0.1)" }}>
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-full flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.1)" }}>
                <span className="text-3xl">🎉</span>
              </div>
              <p className="text-white font-semibold text-lg">
                Batch complete — {batchSavedCount} orders saved
              </p>
              <button
                onClick={resetBatch}
                className="py-3 px-8 rounded-xl font-semibold text-white transition-all hover:opacity-90"
                style={{ background: "#1e3a5f" }}>
                Done
              </button>
            </div>
          </div>
        )}

      </div>
    </Layout>
  );
}
