"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import { createClient } from "@/lib/supabase-browser";

type InvitePreview = {
  invite_id: string;
  inviter_user_id: string;
  inviter_display_name: string;
  status: string;
  is_valid: boolean;
  expires_at: string | null;
};

const INSTALL_URL =
  process.env.NEXT_PUBLIC_DHANADA_INSTALL_URL || "https://dhanada.app/install";

export default function InviteLandingPage() {
  const params = useParams<{ token: string }>();
  const token = String(params?.token || "").trim();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState("");
  const [isAuthed, setIsAuthed] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimMessage, setClaimMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    (async () => {
      if (!token) {
        if (!mounted) return;
        setError("Invalid invite link.");
        setLoading(false);
        return;
      }

      const [{ data: sessionData }, previewResult] = await Promise.all([
        supabase.auth.getSession(),
        supabase.rpc("get_invite_preview_public", { p_token: token }),
      ]);

      if (!mounted) return;

      setIsAuthed(Boolean(sessionData.session?.user));

      if (previewResult.error) {
        setError(previewResult.error.message);
        setLoading(false);
        return;
      }

      const rows = (previewResult.data ?? []) as InvitePreview[];
      if (!rows.length) {
        setError("Invite not found.");
        setLoading(false);
        return;
      }

      setPreview(rows[0]);
      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [supabase, token]);

  async function onClaimInvite() {
    setClaiming(true);
    setClaimMessage("");

    const { data, error: claimError } = await supabase.rpc("claim_invite", {
      p_token: token,
    });

    setClaiming(false);

    if (claimError) {
      setClaimMessage(`Unable to claim invite: ${claimError.message}`);
      return;
    }

    const row = ((data ?? []) as { connection_status?: string }[])[0];
    const connStatus = row?.connection_status || "pending";
    setClaimMessage(
      `Invite claimed successfully. Connection status: ${connStatus}.`,
    );
  }

  function onOpenApp() {
    if (!token) return;
    window.location.href = `dhanada://invite/${token}`;
  }

  if (loading) {
    return (
      <div className="page">
        <div className="logo">Dhanada</div>
        <p className="subtitle">Loading invitation...</p>
      </div>
    );
  }

  if (error || !preview) {
    return (
      <div className="page">
        <div className="logo">Dhanada</div>
        <div className="card">
          <div className="card-title">Invitation</div>
          <p className="error">{error || "This invite is not available."}</p>
          <Link className="link" href="/auth/sign-up">
            Create account
          </Link>
        </div>
      </div>
    );
  }

  const expired = Boolean(
    preview.expires_at && new Date(preview.expires_at) <= new Date(),
  );
  const usable = preview.is_valid && !expired;

  return (
    <div className="page">
      <div className="logo">Dhanada</div>
      <p className="subtitle">You are invited to connect on Dhanada</p>

      <div className="card">
        <div className="card-title">Invitation Details</div>
        <p className="helper">
          <strong>{preview.inviter_display_name}</strong> invited you.
        </p>
        <p className="helper">
          Status: {usable ? "Valid" : "Unavailable"}
          {preview.expires_at
            ? ` • Expires ${new Date(preview.expires_at).toLocaleDateString()}`
            : ""}
        </p>

        {!usable && (
          <p className="error">
            This invite is expired or already unavailable.
          </p>
        )}

        <button className="btn-primary" onClick={onOpenApp} disabled={!usable}>
          Open Dhanada App
        </button>

        <a
          href={INSTALL_URL}
          className="btn-secondary"
          style={{
            marginTop: 8,
            display: "block",
            textAlign: "center",
            textDecoration: "none",
          }}
        >
          Install Dhanada
        </a>
      </div>

      <div className="card">
        <div className="card-title">Claim Invitation</div>

        {!isAuthed ? (
          <>
            <p className="helper">
              Sign in or create an account first, then claim this invite.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <Link
                className="btn-primary"
                href={`/auth/sign-in?invite=${encodeURIComponent(token)}`}
              >
                Sign In
              </Link>
              <Link
                className="btn-secondary"
                href={`/auth/sign-up?invite=${encodeURIComponent(token)}`}
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textDecoration: "none",
                }}
              >
                Sign Up
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className="helper">
              You are signed in. Claim to connect with the inviter.
            </p>
            <button
              className="btn-primary"
              onClick={onClaimInvite}
              disabled={!usable || claiming}
            >
              {claiming ? "Claiming..." : "Claim Invite"}
            </button>
          </>
        )}

        {claimMessage && (
          <p
            style={{
              marginTop: 10,
              color: claimMessage.startsWith("Unable") ? "#f87171" : "#4ade80",
              fontSize: "0.9rem",
            }}
          >
            {claimMessage}
          </p>
        )}
      </div>
    </div>
  );
}
