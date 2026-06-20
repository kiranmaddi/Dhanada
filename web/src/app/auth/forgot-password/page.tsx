"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.resetPasswordForEmail(
      email,
      {
        redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset-password`,
      },
    );

    setLoading(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    setMessage("Check your email for a password reset link.");
  }

  return (
    <div className="page">
      <div className="logo">Dhanada</div>
      <p className="subtitle">Reset your password</p>

      <div className="card">
        <form onSubmit={onSubmit}>
          {error && <p className="error">{error}</p>}
          {message && (
            <p
              style={{
                color: "#4ade80",
                marginBottom: 10,
                fontSize: "0.875rem",
              }}
            >
              {message}
            </p>
          )}
          <input
            className="input"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? "Sending..." : "Send Reset Link"}
          </button>
        </form>
      </div>

      <div style={{ textAlign: "center", marginTop: 16 }}>
        <Link href="/auth/sign-in" className="link">
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
