"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";

export default function SignUpPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    const supabase = createClient();
    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError) {
      setLoading(false);
      setError(authError.message);
      return;
    }

    if (data.user) {
      await supabase.from("profiles").upsert({
        id: data.user.id,
        full_name: fullName.trim() || null,
      });
    }

    setLoading(false);
    setMessage("Check your email to confirm your account.");
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="page">
      <div className="logo">Dhanada</div>
      <p className="subtitle">Create your account</p>

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
            type="text"
            placeholder="Full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
          <input
            className="input"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="input"
            type="password"
            placeholder="Password (min 6 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? "Creating account..." : "Create Account"}
          </button>
        </form>
      </div>

      <div style={{ textAlign: "center", marginTop: 16 }}>
        <Link href="/auth/sign-in" className="link">
          Already have an account? Sign in
        </Link>
      </div>
    </div>
  );
}
