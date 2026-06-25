"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase-browser";

type Contact = { id: string; name: string; phone: string | null };
type MatchCandidate = {
  contact_id: string;
  contact_name: string;
  contact_phone: string | null;
  matched_user_id: string;
};

interface Props {
  userId: string;
  email: string;
  initialFullName: string;
  initialPhone: string;
}

function isValidOptionalPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 0 || digits.length === 10;
}

function hasValidPhone(value: string | null | undefined) {
  if (!value) return false;
  return value.replace(/\D/g, "").length === 10;
}

function generateInviteToken() {
  const rand = Math.random().toString(36).slice(2);
  const rand2 = Math.random().toString(36).slice(2);
  return `${Date.now().toString(36)}${rand}${rand2}`;
}

export default function DashboardClient({
  userId,
  email,
  initialFullName,
  initialPhone,
}: Props) {
  const supabase = createClient();

  const [phone, setPhone] = useState(initialPhone);
  const [savingPhone, setSavingPhone] = useState(false);
  const [phoneVerifiedAt, setPhoneVerifiedAt] = useState<string | null>(null);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [addingContact, setAddingContact] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [updatingContact, setUpdatingContact] = useState(false);
  const [deletingContact, setDeletingContact] = useState(false);
  const [matchCandidates, setMatchCandidates] = useState<MatchCandidate[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [connectingContactId, setConnectingContactId] = useState<string | null>(
    null,
  );

  const candidateByContactId = useMemo(
    () =>
      new Map(
        matchCandidates.map((candidate) => [candidate.contact_id, candidate]),
      ),
    [matchCandidates],
  );

  const editingContact = contacts.find((c) => c.id === editingContactId);

  const startEditContact = (contact: Contact) => {
    setContactName(contact.name);
    setContactPhone(contact.phone || "");
    setEditingContactId(contact.id);
  };

  const cancelEditContact = () => {
    setContactName("");
    setContactPhone("");
    setEditingContactId(null);
  };

  const fetchContacts = useCallback(async () => {
    const { data } = await supabase
      .from("contacts")
      .select("id,name,phone")
      .eq("owner_id", userId)
      .order("name");
    setContacts((data ?? []) as Contact[]);
  }, [supabase, userId]);

  const fetchMatchCandidates = useCallback(async () => {
    setLoadingMatches(true);
    const { data, error } = await supabase.rpc("get_contact_match_candidates", {
      max_rows: 25,
    });
    setLoadingMatches(false);

    if (error) {
      console.warn("Match candidates error", error.message);
      return;
    }

    setMatchCandidates((data ?? []) as MatchCandidate[]);
  }, [supabase]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  useEffect(() => {
    void fetchMatchCandidates();
  }, [fetchMatchCandidates]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("phone_verified_at")
        .eq("id", userId)
        .single();

      if (!mounted) return;
      setPhoneVerifiedAt((data?.phone_verified_at as string | null) ?? null);
    })();

    return () => {
      mounted = false;
    };
  }, [supabase, userId]);

  async function onSavePhone() {
    if (!isValidOptionalPhone(phone)) {
      alert("Phone number must be exactly 10 digits if provided.");
      return;
    }

    setSavingPhone(true);
    await supabase
      .from("profiles")
      .upsert({ id: userId, phone_number: phone.trim() || null });
    setSavingPhone(false);
    setPhoneVerifiedAt(null);
    void fetchMatchCandidates();
  }

  async function onAddContact(e: React.FormEvent) {
    e.preventDefault();
    if (!contactName.trim()) return;

    if (!isValidOptionalPhone(contactPhone)) {
      alert("Phone number must be exactly 10 digits if provided.");
      return;
    }

    if (editingContactId) {
      // Update mode
      setUpdatingContact(true);
      const { error } = await supabase
        .from("contacts")
        .update({
          name: contactName.trim(),
          phone: contactPhone.trim() || null,
        })
        .eq("id", editingContactId);

      setUpdatingContact(false);

      if (error) {
        alert("Update failed: " + error.message);
        return;
      }

      setContacts((cur) =>
        cur.map((c) =>
          c.id === editingContactId
            ? {
                ...c,
                name: contactName.trim(),
                phone: contactPhone.trim() || null,
              }
            : c,
        ),
      );

      setContactName("");
      setContactPhone("");
      setEditingContactId(null);
    } else {
      // Create mode
      setAddingContact(true);
      const { error } = await supabase.from("contacts").insert({
        owner_id: userId,
        name: contactName.trim(),
        phone: contactPhone.trim() || null,
      });

      if (error) {
        alert("Add failed: " + error.message);
        setAddingContact(false);
        return;
      }

      setContactName("");
      setContactPhone("");
      await fetchContacts();
      await fetchMatchCandidates();
      setAddingContact(false);
    }
  }

  async function onDeleteContact() {
    if (
      !editingContactId ||
      !confirm("Delete this contact? This cannot be undone.")
    )
      return;

    setDeletingContact(true);
    const { error } = await supabase
      .from("contacts")
      .delete()
      .eq("id", editingContactId);

    setDeletingContact(false);

    if (error) {
      alert("Delete failed: " + error.message);
      return;
    }

    setContacts((cur) => cur.filter((c) => c.id !== editingContactId));
    setContactName("");
    setContactPhone("");
    setEditingContactId(null);
    void fetchMatchCandidates();
  }

  async function onConnectCandidate(candidate: MatchCandidate) {
    setConnectingContactId(candidate.contact_id);

    const { error: linkError } = await supabase
      .from("contact_user_links")
      .upsert(
        {
          owner_user_id: userId,
          contact_id: candidate.contact_id,
          linked_user_id: candidate.matched_user_id,
          linked_via: "manual",
          verified_at: new Date().toISOString(),
        },
        { onConflict: "owner_user_id,contact_id" },
      );

    if (linkError) {
      setConnectingContactId(null);
      alert("Unable to link contact: " + linkError.message);
      return;
    }

    const { data: existing, error: existingError } = await supabase
      .from("user_connections")
      .select("id")
      .or(
        `and(requester_user_id.eq.${userId},addressee_user_id.eq.${candidate.matched_user_id}),and(requester_user_id.eq.${candidate.matched_user_id},addressee_user_id.eq.${userId})`,
      )
      .limit(1);

    if (!existingError && (!existing || existing.length === 0)) {
      await supabase.from("user_connections").insert({
        requester_user_id: userId,
        addressee_user_id: candidate.matched_user_id,
        status: "pending",
      });
    }

    setConnectingContactId(null);
    setMatchCandidates((cur) =>
      cur.filter((row) => row.contact_id !== candidate.contact_id),
    );
  }

  async function onInviteContact(contact: Contact) {
    if (!hasValidPhone(contact.phone)) {
      alert("This contact needs a valid phone number.");
      return;
    }

    setConnectingContactId(contact.id);
    let inviteToken: string | null = null;

    const { data, error } = await supabase.rpc("create_invite_for_contact", {
      p_contact_id: contact.id,
      p_expires_in_hours: 168,
    });

    if (!error) {
      const row = ((data ?? []) as { token: string }[])[0];
      inviteToken = row?.token ?? null;
    }

    if (!inviteToken) {
      const fallbackToken = generateInviteToken();
      const expiresAt = new Date(
        Date.now() + 168 * 60 * 60 * 1000,
      ).toISOString();
      const { error: fallbackError } = await supabase
        .from("app_invites")
        .insert({
          inviter_user_id: userId,
          target_contact_id: contact.id,
          token: fallbackToken,
          status: "sent",
          expires_at: expiresAt,
        });

      if (fallbackError) {
        setConnectingContactId(null);
        alert(
          "Unable to create invite: " +
            (error?.message || fallbackError.message || "Unknown error"),
        );
        return;
      }

      inviteToken = fallbackToken;
    }

    setConnectingContactId(null);

    const baseUrl = window.location.origin.replace(/\/$/, "");
    const signupUrl = `${baseUrl}/auth/sign-up?invite=${encodeURIComponent(inviteToken)}`;
    const message = `Join me on Dhanada, ${contact.name}! Sign up here: ${signupUrl}`;

    if (navigator.share) {
      await navigator.share({ text: message });
      return;
    }

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(message);
      alert("Signup link copied. Share it with your contact.");
      return;
    }

    prompt("Copy and share this signup link:", signupUrl);
  }

  return (
    <>
      <div className="card">
        <div className="card-title">Profile</div>
        <p
          style={{
            color: "var(--text-muted)",
            fontSize: "0.875rem",
            marginBottom: 12,
          }}
        >
          {initialFullName || email}
        </p>
        <input
          className="input"
          placeholder="Phone number (10 digits)"
          value={phone}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
            setPhone(digits);
          }}
          maxLength={10}
          type="tel"
        />
        <button
          className="btn-primary"
          onClick={onSavePhone}
          disabled={savingPhone}
        >
          {savingPhone ? "Saving..." : "Save Phone"}
        </button>
        <p
          style={{
            color: "var(--text-muted)",
            fontSize: "0.85rem",
            marginTop: 10,
            marginBottom: 0,
          }}
        >
          {phoneVerifiedAt
            ? `Phone verified on ${new Date(phoneVerifiedAt).toLocaleDateString()}.`
            : phone.trim()
              ? "Phone not verified yet. Contact matching will use only verified phones."
              : "Add your phone number to enable contact match suggestions."}
        </p>
      </div>

      <div className="card">
        <div className="card-title">
          {editingContactId ? "Edit Contact" : "Add Contact"}
        </div>
        <form onSubmit={onAddContact}>
          <input
            className="input"
            placeholder="Name *"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            required
          />
          <input
            className="input"
            placeholder="Phone (optional - 10 digits)"
            value={contactPhone}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
              setContactPhone(digits);
            }}
            maxLength={10}
            type="tel"
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn-primary"
              type="submit"
              disabled={addingContact || updatingContact}
              style={{ flex: 1 }}
            >
              {editingContactId
                ? updatingContact
                  ? "Updating..."
                  : "Update Contact"
                : addingContact
                  ? "Adding..."
                  : "Add Contact"}
            </button>
            {editingContactId && (
              <button
                className="remove-btn"
                type="button"
                onClick={onDeleteContact}
                disabled={deletingContact}
              >
                {deletingContact ? "Deleting..." : "Delete"}
              </button>
            )}
          </div>

          {editingContactId && (
            <button
              type="button"
              className="btn-secondary"
              onClick={cancelEditContact}
              style={{ width: "100%", marginTop: 8 }}
            >
              Cancel
            </button>
          )}
        </form>
      </div>

      <div className="card">
        <div className="card-title">Your Contacts ({contacts.length})</div>
        {contacts.length === 0 ? (
          <p className="empty">No contacts yet.</p>
        ) : (
          contacts.map((c) => (
            <div key={c.id} className="list-item row">
              <div style={{ flex: 1 }}>
                <div className="list-name">{c.name}</div>
                <div className="list-meta">{c.phone || "No phone"}</div>
              </div>
              {candidateByContactId.has(c.id) && (
                <button
                  className="add-btn"
                  onClick={() =>
                    void onConnectCandidate(candidateByContactId.get(c.id)!)
                  }
                  disabled={connectingContactId === c.id}
                >
                  {connectingContactId === c.id ? "Connecting..." : "Connect"}
                </button>
              )}
              {!candidateByContactId.has(c.id) && hasValidPhone(c.phone) && (
                <button
                  className="add-btn"
                  onClick={() => void onInviteContact(c)}
                  disabled={connectingContactId === c.id}
                >
                  {connectingContactId === c.id ? "Connecting..." : "Connect"}
                </button>
              )}
              <button className="add-btn" onClick={() => startEditContact(c)}>
                Edit
              </button>
            </div>
          ))
        )}
      </div>

      <div className="card">
        <div className="card-title">People You May Know on Dhanada</div>
        {loadingMatches ? (
          <p className="empty">Finding matches...</p>
        ) : matchCandidates.length === 0 ? (
          <p className="empty">No match suggestions right now.</p>
        ) : (
          matchCandidates.map((m) => (
            <div key={m.contact_id} className="list-item row">
              <div style={{ flex: 1 }}>
                <div className="list-name">{m.contact_name}</div>
                <div className="list-meta">{m.contact_phone || "No phone"}</div>
              </div>
              <button
                className="add-btn"
                onClick={() => void onConnectCandidate(m)}
                disabled={connectingContactId === m.contact_id}
              >
                {connectingContactId === m.contact_id
                  ? "Connecting..."
                  : "Connect"}
              </button>
            </div>
          ))
        )}
      </div>
    </>
  );
}
