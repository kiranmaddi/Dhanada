"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

type Contact = { id: string; name: string; phone: string | null };
type MatchCandidate = {
  contact_id: string;
  contact_name: string;
  contact_phone: string | null;
  matched_user_id: string;
};

type UnifiedContact = {
  contact_id: string;
  contact_name: string;
  contact_phone: string | null;
  linked_user_id: string | null;
  user_name?: string;
  is_linked: boolean;
};

type SharedWishlistFromContact = {
  wishlist_id: string;
  wishlist_name: string;
  owner_id: string;
  owner_name: string;
  permission: string;
  item_count: number;
  created_at: string;
};

type ContactInvitedEvent = {
  event_id: string;
  event_name: string;
  event_date: string;
  venue: string | null;
  description: string | null;
  owner_id: string;
  owner_name: string;
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
  const router = useRouter();

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
  const [connectingContactId, setConnectingContactId] = useState<string | null>(
    null,
  );
  const [allContacts, setAllContacts] = useState<UnifiedContact[]>([]);
  const [selectedContactForWishlists, setSelectedContactForWishlists] =
    useState<UnifiedContact | null>(null);
  const [sharedWishlistsFromContact, setSharedWishlistsFromContact] = useState<
    SharedWishlistFromContact[]
  >([]);
  const [loadingContactWishlists, setLoadingContactWishlists] = useState(false);
  const [contactInvitedEvents, setContactInvitedEvents] = useState<
    ContactInvitedEvent[]
  >([]);
  const [loadingContactEvents, setLoadingContactEvents] = useState(false);

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
    const { data, error } = await supabase
      .from("contacts")
      .select("id,name,phone")
      .eq("owner_id", userId)
      .order("name");

    if (error) {
      return;
    }

    setContacts((data ?? []) as Contact[]);
  }, [supabase, userId]);

  const fetchMatchCandidates = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_contact_match_candidates", {
      max_rows: 25,
    });

    if (error) {
      return;
    }

    setMatchCandidates((data ?? []) as MatchCandidate[]);
  }, [supabase]);

  const fetchContactsWithWishlists = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_contacts_on_app");

    if (error) {
      return;
    }
    // Transform to unified contacts format
    const unified: UnifiedContact[] = (data ?? []).map((contact: any) => ({
      contact_id: contact.contact_id,
      contact_name: contact.contact_name,
      contact_phone: contact.contact_phone,
      linked_user_id: contact.linked_user_id,
      user_name: contact.user_name,
      is_linked: true,
    }));

    setAllContacts(unified);
  }, [supabase]);

  const fetchSharedWishlistsFromContact = useCallback(
    async (contactUserId: string) => {
      setLoadingContactWishlists(true);
      const { data, error } = await supabase.rpc(
        "get_shared_wishlists_from_contact",
        { p_contact_user_id: contactUserId },
      );
      setLoadingContactWishlists(false);

      if (error) {
        alert("Error: Failed to load wishlists");
        return;
      }

      setSharedWishlistsFromContact(
        (data ?? []) as SharedWishlistFromContact[],
      );
    },
    [supabase],
  );

  const fetchContactInvitedEvents = useCallback(
    async (contactId: string) => {
      setLoadingContactEvents(true);
      const { data, error } = await supabase.rpc("get_contact_invited_events", {
        p_contact_user_id: contactId,
      });
      setLoadingContactEvents(false);

      if (error) {
        return;
      }

      setContactInvitedEvents((data ?? []) as ContactInvitedEvent[]);
    },
    [supabase],
  );

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  useEffect(() => {
    void fetchMatchCandidates();
    void fetchContactsWithWishlists();
  }, [fetchMatchCandidates, fetchContactsWithWishlists]);

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
    void fetchContactsWithWishlists();
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
          contacts.map((c) => {
            // Check if this contact is an app user
            const appUser = allContacts.find(
              (ac) =>
                ac.contact_phone === c.phone || ac.contact_name === c.name,
            );
            return (
              <div
                key={c.id}
                className="list-item row"
                style={{
                  cursor: appUser ? "pointer" : "default",
                }}
                onClick={() => {
                  if (appUser && appUser.linked_user_id) {
                    setSelectedContactForWishlists(appUser);
                    void fetchSharedWishlistsFromContact(
                      appUser.linked_user_id,
                    );
                    void fetchContactInvitedEvents(appUser.linked_user_id);
                  }
                }}
              >
                <div style={{ flex: 1 }}>
                  <div className="list-name">{c.name}</div>
                  <div className="list-meta">{c.phone || "No phone"}</div>
                </div>
                {appUser ? (
                  <div
                    style={{
                      display: "inline-block",
                      backgroundColor: "#10b981",
                      color: "white",
                      padding: "4px 8px",
                      borderRadius: "4px",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                    }}
                  >
                    App User
                  </div>
                ) : candidateByContactId.has(c.id) ? (
                  <button
                    className="add-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      void onConnectCandidate(candidateByContactId.get(c.id)!);
                    }}
                    disabled={connectingContactId === c.id}
                  >
                    {connectingContactId === c.id ? "Connecting..." : "Connect"}
                  </button>
                ) : hasValidPhone(c.phone) ? (
                  <button
                    className="add-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      void onInviteContact(c);
                    }}
                    disabled={connectingContactId === c.id}
                  >
                    {connectingContactId === c.id ? "Connecting..." : "Invite"}
                  </button>
                ) : null}
                <button
                  className="add-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    startEditContact(c);
                  }}
                >
                  Edit
                </button>
              </div>
            );
          })
        )}
      </div>

      {selectedContactForWishlists && (
        <div className="card">
          <div
            style={{ display: "flex", alignItems: "center", marginBottom: 16 }}
          >
            <button
              className="btn-secondary"
              onClick={() => setSelectedContactForWishlists(null)}
              style={{ marginRight: 8 }}
            >
              ← Back
            </button>
            <div className="card-title" style={{ marginBottom: 0, flex: 1 }}>
              {selectedContactForWishlists.contact_name}
            </div>
          </div>

          {/* Wishlists Section */}
          <div style={{ marginBottom: 20 }}>
            <h3
              style={{
                color: "#9aa5c5",
                fontSize: "0.8125rem",
                marginBottom: 8,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              Shared Wishlists
            </h3>
            {loadingContactWishlists ? (
              <p className="empty">Loading wishlists...</p>
            ) : sharedWishlistsFromContact.length === 0 ? (
              <p className="empty">No wishlists shared by this contact.</p>
            ) : (
              sharedWishlistsFromContact.map((w) => (
                <div
                  key={w.wishlist_id}
                  className="list-item"
                  style={{ cursor: "pointer" }}
                  onClick={() =>
                    router.push(
                      `/dashboard/wishlist/${w.wishlist_id}?contactId=${selectedContactForWishlists?.contact_id}&ownerName=${encodeURIComponent(w.owner_name)}&ownerId=${w.owner_id}`,
                    )
                  }
                >
                  <div>
                    <div className="list-name">{w.wishlist_name}</div>
                    <div className="list-meta">
                      {w.item_count} {w.item_count === 1 ? "item" : "items"}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Events Section */}
          <div>
            <h3
              style={{
                color: "#9aa5c5",
                fontSize: "0.8125rem",
                marginBottom: 8,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              Invited Events
            </h3>
            {loadingContactEvents ? (
              <p className="empty">Loading events...</p>
            ) : contactInvitedEvents.length === 0 ? (
              <p className="empty">Not invited to any events.</p>
            ) : (
              contactInvitedEvents.map((e) => (
                <div key={e.event_id} className="list-item">
                  <div>
                    <div className="list-name">{e.event_name}</div>
                    <div className="list-meta">
                      📅 {new Date(e.event_date).toLocaleDateString()}
                      {e.venue && ` • 📍 ${e.venue}`}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
}
