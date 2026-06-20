"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase-browser";

type AppEvent = { id: string; event_name: string; event_date: string };
type Contact = { id: string; name: string; phone: string | null };
type InviteeRow = { id: string; contacts: Contact | Contact[] | null };
type GiftType = "cash" | "gift";
type GiftRow = {
  id: string;
  event_id: string;
  contact_id: string | null;
  contacts?: Contact | Contact[] | null;
  [key: string]: unknown;
};

function formatDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

function giftDisplayName(gift: GiftRow): string {
  const candidates = [
    gift.item_description,
    gift.gift_name,
    gift.item_name,
    gift.name,
  ];
  const hit = candidates.find(
    (v) => typeof v === "string" && (v as string).trim(),
  );
  if (typeof hit === "string") return hit;

  const giftType = gift.gift_type;
  if (giftType === "cash" || giftType === "monetary") return "Cash Gift";
  if (giftType === "gift" || giftType === "item") return "Gift Article";

  return "Unnamed gift";
}

function giftDisplayAmount(gift: GiftRow): string {
  const raw = gift.value_amount ?? gift.amount ?? gift.gift_value;
  if (raw == null) return "";
  const n = Number(raw);
  return Number.isFinite(n) ? `₹${n.toLocaleString()}` : "";
}

function contactForGift(gift: GiftRow): Contact | null {
  const c = gift.contacts;
  if (!c) return null;
  return Array.isArray(c) ? (c[0] ?? null) : c;
}

function normalizeGiftType(value: unknown): GiftType {
  if (value === "monetary" || value === "cash") return "cash";
  if (value === "item" || value === "gift" || value === "gift_article")
    return "gift";
  return "gift";
}

function isValidOptionalPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 0 || digits.length === 10;
}

export default function GiftsPage() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [invitees, setInvitees] = useState<Contact[]>([]);
  const [gifts, setGifts] = useState<GiftRow[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(
    null,
  );
  const [creating, setCreating] = useState(false);

  const [giftName, setGiftName] = useState("");
  const [giftAmount, setGiftAmount] = useState("");
  const [giftNotes, setGiftNotes] = useState("");
  const [giftType, setGiftType] = useState<GiftType>("cash");

  // Search & inline add
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [addingNewContact, setAddingNewContact] = useState(false);

  // Edit gift
  const [editingGiftId, setEditingGiftId] = useState<string | null>(null);
  const [updatingGift, setUpdatingGift] = useState(false);
  const [deletingGift, setDeletingGift] = useState(false);

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === selectedEventId) ?? null,
    [events, selectedEventId],
  );

  const selectedContact = useMemo(
    () => contacts.find((c) => c.id === selectedContactId) ?? null,
    [contacts, selectedContactId],
  );

  const filteredInvitees = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");
    return contacts
      .filter((inv) => {
        const nameMatch = inv.name.toLowerCase().includes(q);
        const phoneDigits = inv.phone ? inv.phone.replace(/\D/g, "") : "";
        const phoneMatch = qDigits.length > 0 && phoneDigits.includes(qDigits);
        return nameMatch || phoneMatch;
      })
      .slice(0, 10);
  }, [searchQuery, contacts]);

  const fetchInvitees = useCallback(
    async (eventId: string) => {
      const { data } = await supabase
        .from("event_invitees")
        .select("id, contacts(id,name,phone)")
        .eq("event_id", eventId);

      const normalized = (data ?? []).flatMap((row) => {
        const c = (row as InviteeRow).contacts;
        if (!c) return [];
        return Array.isArray(c) ? c : [c];
      });
      const list = Array.from(
        new Map(
          (normalized as Contact[]).map((contact) => [contact.id, contact]),
        ).values(),
      );
      setInvitees(list);
    },
    [supabase],
  );

  const fetchGifts = useCallback(
    async (eventId: string) => {
      const { data } = await supabase
        .from("gifts")
        .select("*, contacts(id,name,phone)")
        .eq("event_id", eventId)
        .order("created_at", { ascending: false });
      setGifts((data ?? []) as GiftRow[]);
    },
    [supabase],
  );

  const linkInviteeIfMissing = useCallback(
    async (eventId: string, contactId: string) => {
      const { error } = await supabase
        .from("event_invitees")
        .insert({ event_id: eventId, contact_id: contactId });
      if (error && error.code !== "23505") {
        console.warn("Could not link invitee", error.message);
      }
    },
    [supabase],
  );

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session?.user) {
        setLoading(false);
        return;
      }
      const uid = data.session.user.id;
      setUserId(uid);

      const { data: evData } = await supabase
        .from("events")
        .select("id,event_name,event_date")
        .eq("owner_id", uid)
        .order("event_date", { ascending: true });

      const { data: contactsData } = await supabase
        .from("contacts")
        .select("id,name,phone")
        .eq("owner_id", uid)
        .order("name", { ascending: true });

      const evList = (evData ?? []) as AppEvent[];
      setEvents(evList);
      setContacts((contactsData ?? []) as Contact[]);
      setLoading(false);
    });
  }, [supabase]);

  useEffect(() => {
    if (!selectedEventId) {
      setInvitees([]);
      setGifts([]);
      setSelectedContactId(null);
      return;
    }
    setSelectedContactId(null);
    fetchInvitees(selectedEventId);
    fetchGifts(selectedEventId);
  }, [selectedEventId, fetchInvitees, fetchGifts]);

  async function onAddNewContact() {
    if (!userId || !selectedEventId) return;
    if (!newContactName.trim()) {
      alert("Contact name is required.");
      return;
    }

    if (!isValidOptionalPhone(newContactPhone)) {
      alert("Phone number must be exactly 10 digits if provided.");
      return;
    }

    setAddingNewContact(true);

    try {
      const { data: contactData, error: contactError } = await supabase
        .from("contacts")
        .insert({
          owner_id: userId,
          name: newContactName.trim(),
          phone: newContactPhone.trim() || null,
        })
        .select("id,name,phone")
        .single();

      if (contactError || !contactData) {
        throw new Error(contactError?.message || "Failed to create contact");
      }

      const { error: inviteeError } = await supabase
        .from("event_invitees")
        .insert({
          event_id: selectedEventId,
          contact_id: contactData.id,
        });

      if (inviteeError) {
        throw new Error(inviteeError.message);
      }

      setContacts((cur) => {
        const exists = cur.some((c) => c.id === contactData.id);
        return exists ? cur : [contactData as Contact, ...cur];
      });

      await fetchInvitees(selectedEventId);
      setSelectedContactId(contactData.id);
      setNewContactName("");
      setNewContactPhone("");
      setSearchQuery("");
      setShowSearchDropdown(false);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Failed to add contact";
      alert(msg);
    } finally {
      setAddingNewContact(false);
    }
  }

  async function onCreateGift(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedEventId || !selectedContactId) return;

    if (giftType === "cash" && !giftAmount.trim()) {
      alert("Amount is required for Cash gifts.");
      return;
    }

    if (giftType === "gift" && !giftName.trim()) {
      alert("Gift name is required for Gift Article.");
      return;
    }

    const amount = giftAmount.trim() ? Number(giftAmount.trim()) : null;
    if (giftAmount.trim() && !Number.isFinite(amount)) {
      alert("Amount must be a number.");
      return;
    }

    setCreating(true);

    await linkInviteeIfMissing(selectedEventId, selectedContactId);

    const base = {
      event_id: selectedEventId,
      contact_id: selectedContactId,
      gift_type: giftType,
      owner_id: userId,
    };

    // Store gift name or amount in item_description; amount in value_amount
    const itemDesc =
      giftType === "gift"
        ? giftName.trim() || "Gift"
        : giftNotes.trim() || null;

    const payloads = [
      {
        ...base,
        value_amount: giftType === "cash" ? amount : null,
        item_description: itemDesc,
      },
    ];

    let inserted: GiftRow | null = null;
    let lastError: { code?: string; message?: string } | null = null;
    for (const payload of payloads) {
      const { data, error } = await supabase
        .from("gifts")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(payload as any)
        .select("*, contacts(id,name,phone)")
        .single();
      if (!error) {
        inserted = data as GiftRow;
        break;
      }
      lastError = { code: error.code, message: error.message };
      const lower = (error.message ?? "").toLowerCase();
      if (
        !(
          lower.includes("column") ||
          lower.includes("schema cache") ||
          error.code === "42703" ||
          error.code === "PGRST204"
        )
      )
        break;
    }

    setCreating(false);
    if (!inserted) {
      alert(lastError?.message || "Create gift failed.");
      return;
    }

    setGiftType("cash");
    setGiftName("");
    setGiftAmount("");
    setGiftNotes("");
    setGifts((cur) => [inserted as GiftRow, ...cur]);
  }

  async function onUpdateGift(e: React.FormEvent) {
    e.preventDefault();
    if (!editingGiftId || !selectedContactId || !selectedEventId) return;

    if (giftType === "cash" && !giftAmount.trim()) {
      alert("Amount is required for Cash gifts.");
      return;
    }

    if (giftType === "gift" && !giftName.trim()) {
      alert("Gift name is required for Gift Article.");
      return;
    }

    const amount = giftAmount.trim() ? Number(giftAmount.trim()) : null;
    if (giftAmount.trim() && !Number.isFinite(amount)) {
      alert("Amount must be a number.");
      return;
    }

    setUpdatingGift(true);

    await linkInviteeIfMissing(selectedEventId, selectedContactId);

    const base = {
      contact_id: selectedContactId,
      gift_type: giftType,
    };

    // Store gift name or notes in item_description; amount in value_amount
    const itemDesc =
      giftType === "gift"
        ? giftName.trim() || "Gift"
        : giftNotes.trim() || null;

    const payloads = [
      {
        ...base,
        value_amount: giftType === "cash" ? amount : null,
        item_description: itemDesc,
      },
    ];

    let updated: GiftRow | null = null;
    let lastError: { code?: string; message?: string } | null = null;

    for (const payload of payloads) {
      const { data, error } = await supabase
        .from("gifts")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(payload as any)
        .eq("id", editingGiftId)
        .select("*, contacts(id,name,phone)")
        .single();

      if (!error) {
        updated = data as GiftRow;
        break;
      }

      lastError = { code: error.code, message: error.message };
      const lower = (error.message ?? "").toLowerCase();
      if (
        !(
          lower.includes("column") ||
          lower.includes("schema cache") ||
          error.code === "42703" ||
          error.code === "PGRST204"
        )
      )
        break;
    }

    setUpdatingGift(false);

    if (!updated) {
      alert(lastError?.message || "Update gift failed.");
      return;
    }

    setGiftType("cash");
    setGiftName("");
    setGiftAmount("");
    setGiftNotes("");
    setEditingGiftId(null);
    setGifts((cur) => cur.map((g) => (g.id === editingGiftId ? updated : g)));
  }

  async function onDeleteGift() {
    if (!editingGiftId || !confirm("Delete this gift? This cannot be undone."))
      return;

    setDeletingGift(true);
    const { error } = await supabase
      .from("gifts")
      .delete()
      .eq("id", editingGiftId);

    setDeletingGift(false);

    if (error) {
      alert("Delete failed: " + error.message);
      return;
    }

    setGifts((cur) => cur.filter((g) => g.id !== editingGiftId));
    setGiftType("cash");
    setGiftName("");
    setGiftAmount("");
    setGiftNotes("");
    setEditingGiftId(null);
  }

  function startEditGift(gift: GiftRow) {
    const contact = contactForGift(gift);
    if (contact) {
      setSelectedContactId(contact.id);
    }

    const amount = gift.value_amount ?? gift.amount ?? gift.gift_value;
    const itemDesc = String(gift.item_description ?? "");

    setGiftName(itemDesc);
    setGiftAmount(amount ? String(amount) : "");
    setGiftNotes("");
    setGiftType(normalizeGiftType(gift.gift_type));
    setEditingGiftId(gift.id);
  }

  function cancelEditGift() {
    setGiftType("cash");
    setGiftName("");
    setGiftAmount("");
    setGiftNotes("");
    setEditingGiftId(null);
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      {/* Left — event selector + form */}
      <div>
        <div className="card">
          <div className="card-title">Select Event</div>
          {events.length === 0 ? (
            <p className="empty">No events yet — create one in Events.</p>
          ) : (
            events.map((ev) => (
              <div
                key={ev.id}
                className={`event-item${ev.id === selectedEventId ? " event-item-active" : ""}`}
                onClick={() => setSelectedEventId(ev.id)}
                style={{ cursor: "pointer" }}
              >
                <div className="event-header">
                  <span className="list-name">{ev.event_name}</span>
                  <span className="date-badge">
                    {formatDate(ev.event_date)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {selectedEvent && (
          <div className="card">
            <div className="card-title">
              {editingGiftId
                ? `Edit Gift — ${selectedEvent.event_name}`
                : `Add Gift — ${selectedEvent.event_name}`}
            </div>
            {contacts.length === 0 ? (
              <p className="empty">No contacts found. Add contacts first.</p>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (editingGiftId) {
                    onUpdateGift(e);
                  } else {
                    onCreateGift(e);
                  }
                }}
              >
                <label className="field-label">
                  Search Contact by Name or Phone
                </label>
                <div style={{ position: "relative", marginBottom: 12 }}>
                  <input
                    className="input"
                    placeholder="Type name or phone number..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setShowSearchDropdown(true);
                    }}
                    onFocus={() => setShowSearchDropdown(true)}
                  />
                  {showSearchDropdown && (
                    <div className="search-dropdown">
                      {filteredInvitees.length > 0 ? (
                        <>
                          {filteredInvitees.map((inv) => (
                            <div
                              key={inv.id}
                              className="search-dropdown-item"
                              onClick={() => {
                                setSelectedContactId(inv.id);
                                setSearchQuery("");
                                setShowSearchDropdown(false);
                              }}
                            >
                              <div className="list-name">{inv.name}</div>
                              {inv.phone && (
                                <div className="list-meta">{inv.phone}</div>
                              )}
                            </div>
                          ))}
                        </>
                      ) : searchQuery.trim() ? (
                        <div className="search-no-match">
                          <p>No contact found</p>
                          <div style={{ marginTop: 8 }}>
                            <input
                              className="input"
                              style={{ marginBottom: 8 }}
                              placeholder="New contact name *"
                              value={newContactName}
                              onChange={(e) =>
                                setNewContactName(e.target.value)
                              }
                            />
                            <input
                              className="input"
                              style={{ marginBottom: 8 }}
                              placeholder="Phone (optional - 10 digits)"
                              value={newContactPhone}
                              onChange={(e) => {
                                const digits = e.target.value
                                  .replace(/\D/g, "")
                                  .slice(0, 10);
                                setNewContactPhone(digits);
                              }}
                              maxLength={10}
                              type="tel"
                            />
                            <button
                              type="button"
                              className="add-btn"
                              onClick={onAddNewContact}
                              disabled={addingNewContact}
                            >
                              {addingNewContact ? "Adding..." : "Add & Invite"}
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>

                {selectedContact && (
                  <div className="card-title">
                    Selected: <strong>{selectedContact.name}</strong>
                    {selectedContact.phone && ` • ${selectedContact.phone}`}
                  </div>
                )}
                <input
                  className="input"
                  placeholder="Gift Type"
                  value={giftType === "cash" ? "Cash" : "Gift Article"}
                  readOnly
                />
                <div className="toggle-row">
                  <button
                    type="button"
                    className={`toggle-option${giftType === "cash" ? " toggle-active" : ""}`}
                    onClick={() => setGiftType("cash")}
                  >
                    Cash
                  </button>
                  <button
                    type="button"
                    className={`toggle-option${giftType === "gift" ? " toggle-active" : ""}`}
                    onClick={() => setGiftType("gift")}
                  >
                    Gift Article
                  </button>
                </div>

                {giftType === "gift" ? (
                  <input
                    className="input"
                    placeholder="Gift name *"
                    value={giftName}
                    onChange={(e) => setGiftName(e.target.value)}
                    required
                  />
                ) : (
                  <input
                    className="input"
                    placeholder="Amount *"
                    value={giftAmount}
                    onChange={(e) => setGiftAmount(e.target.value)}
                    type="number"
                    min="0"
                    step="0.01"
                    required
                  />
                )}
                <textarea
                  className="input"
                  placeholder="Notes (optional)"
                  value={giftNotes}
                  onChange={(e) => setGiftNotes(e.target.value)}
                  rows={3}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="btn-primary"
                    type="submit"
                    disabled={creating || updatingGift || !selectedContactId}
                    style={{ flex: 1 }}
                  >
                    {editingGiftId
                      ? updatingGift
                        ? "Updating..."
                        : "Update Gift"
                      : creating
                        ? "Saving..."
                        : "Add Gift"}
                  </button>
                  {editingGiftId && (
                    <button
                      className="remove-btn"
                      type="button"
                      onClick={onDeleteGift}
                      disabled={deletingGift}
                    >
                      {deletingGift ? "Deleting..." : "Delete"}
                    </button>
                  )}
                </div>
                {editingGiftId && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={cancelEditGift}
                    style={{ width: "100%", marginTop: 8 }}
                  >
                    Cancel
                  </button>
                )}
              </form>
            )}
          </div>
        )}
      </div>

      {/* Right — gifts list */}
      {selectedEvent && (
        <div>
          <div className="card">
            <div className="card-title">
              Gifts ({gifts.length}) — {selectedEvent.event_name}
            </div>
            {gifts.length === 0 ? (
              <p className="empty">No gifts recorded yet.</p>
            ) : (
              gifts.map((gift) => {
                const contact = contactForGift(gift);
                const amount = giftDisplayAmount(gift);
                const notesRaw = gift.notes ?? gift.note;
                const notes = notesRaw != null ? String(notesRaw) : null;
                return (
                  <div key={gift.id} className="list-item row">
                    <div style={{ flex: 1 }}>
                      <div className="list-name">
                        {contact ? `From ${contact.name}` : ""}
                        {amount ? ` • ${amount}` : ""}
                      </div>
                      <div className="list-meta">{giftDisplayName(gift)}</div>
                      {notes && <div className="list-meta">{notes}</div>}
                    </div>
                    <button
                      className="add-btn"
                      onClick={() => startEditGift(gift)}
                    >
                      Edit
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
