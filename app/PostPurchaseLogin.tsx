"use client";
import { useState } from "react";

// Separate login for /post-purchase. Posts the password to
// /api/session, which sets the post_purchase_session cookie and
// reloads into the board. Grants post-purchase analytics access only — never
// canvas/admin. Styled in the canvas dark palette to match the board.
export default function PostPurchaseLogin() {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!pw) return;
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "x-post-purchase-secret": pw },
      });
      if (res.ok) {
        window.location.reload();
        return;
      }
      setErr("Incorrect password");
    } catch {
      setErr("Something went wrong. Try again.");
    }
    setLoading(false);
  }

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#1a1a1a",
        color: "#fff",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
        padding: "24px",
      }}
    >
      <form
        onSubmit={submit}
        style={{
          width: "100%",
          maxWidth: "340px",
          background: "#2e2e2e",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "14px",
          padding: "28px 24px",
        }}
      >
        <div style={{ fontSize: "18px", fontWeight: 650, marginBottom: "4px" }}>Post-purchase Analytics</div>
        <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.55)", marginBottom: "20px" }}>
          Enter the post-purchase password.
        </div>
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="Password"
          autoFocus
          style={{
            width: "100%",
            boxSizing: "border-box",
            background: "rgba(255,255,255,0.06)",
            border: `1px solid ${err ? "rgba(248,113,113,0.6)" : "rgba(255,255,255,0.14)"}`,
            borderRadius: "8px",
            padding: "13px 14px",
            color: "#fff",
            fontSize: "15px",
            outline: "none",
            marginBottom: err ? "8px" : "16px",
          }}
        />
        {err && (
          <div style={{ fontSize: "12.5px", color: "#f87171", marginBottom: "16px" }}>{err}</div>
        )}
        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            background: loading ? "rgba(255,255,255,0.6)" : "#ffffff",
            border: "none",
            borderRadius: "8px",
            padding: "13px",
            color: "#1a1a1a",
            fontSize: "15px",
            fontWeight: 650,
            cursor: loading ? "default" : "pointer",
          }}
        >
          {loading ? "Checking…" : "Enter"}
        </button>
      </form>
    </main>
  );
}
