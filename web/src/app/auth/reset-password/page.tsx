"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function prepareResetSession() {
      const supabase = createClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (!isMounted) {
        return;
      }

      if (userError) {
        setError(userError.message);
        return;
      }

      if (!user) {
        setError("Invalid or expired reset link. Please request a new one.");
        return;
      }

      setSessionReady(true);
    }

    void prepareResetSession();

    return () => {
      isMounted = false;
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!sessionReady) {
      setError("Reset link is not ready yet. Please try again in a moment.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setMessage("Password updated successfully. Redirecting to sign in...");

    setTimeout(() => {
      router.push("/auth/sign-in");
      router.refresh();
    }, 1200);
  }

  return (
    <div className="page">
      <div className="logo">Dhanada</div>
      <p className="subtitle">Set a new password</p>

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
            type="password"
            placeholder="New password (min 6 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            disabled={loading || !sessionReady}
          />
          <input
            className="input"
            type="password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={6}
            disabled={loading || !sessionReady}
          />

          <button
            className="btn-primary"
            type="submit"
            disabled={loading || !sessionReady}
          >
            {loading ? "Updating..." : "Update Password"}
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
