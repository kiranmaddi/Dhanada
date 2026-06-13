"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

type Contact = { id: string; name: string; phone: string | null };
type AppEvent = {
  id: string;
  event_name: string;
  event_date: string;
  created_at: string;
};
type Invitee = { id: string; contacts: Contact | Contact[] | null };
type GiftRow = {
  id: string;
  event_id: string;
  contact_id: string | null;
  created_at?: string | null;
  contacts?: Contact | Contact[] | null;
  [key: string]: unknown;
};

function formatDate(value: string) {
  if (!value) return "—";
  const d = new Date(value);
  return isNaN(d.getTime()) ? value : d.toLocaleDateString();
}

interface Props {
  userId: string;
  email: string;
  initialFullName: string;
  initialPhone: string;
}

export default function DashboardClient({
  userId,
  email,
  initialFullName,
  initialPhone,
}: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [tab, setTab] = useState<"contacts" | "events">("contacts");

  // Profile
  const [fullName] = useState(initialFullName);
  const [phone, setPhone] = useState(initialPhone);
  const [savingPhone, setSavingPhone] = useState(false);

  // Contacts
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [addingContact, setAddingContact] = useState(false);

  // Events
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [eventName, setEventName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [creatingEvent, setCreatingEvent] = useState(false);

  // Invitees
  const [invitees, setInvitees] = useState<Contact[]>([]);
  const [addingInvitee, setAddingInvitee] = useState(false);

  // Gifts
  const [gifts, setGifts] = useState<GiftRow[]>([]);
  const [giftName, setGiftName] = useState("");
  const [giftAmount, setGiftAmount] = useState("");
  const [giftNotes, setGiftNotes] = useState("");
  const [selectedGiftContactId, setSelectedGiftContactId] = useState<
    string | null
  >(null);
  const [creatingGift, setCreatingGift] = useState(false);

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === selectedEventId) ?? null,
    [events, selectedEventId],
  );

  const fetchContacts = useCallback(async () => {
    const { data } = await supabase
      .from("contacts")
      .select("id,name,phone")
      .eq("owner_id", userId)
      .order("name");
    setContacts((data ?? []) as Contact[]);
  }, [supabase, userId]);

  const fetchEvents = useCallback(async () => {
    const { data } = await supabase
      .from("events")
      .select("id,event_name,event_date,created_at")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false });
    const rows = (data ?? []) as AppEvent[];
    setEvents(rows);
    if (!selectedEventId && rows.length > 0) setSelectedEventId(rows[0].id);
  }, [supabase, userId, selectedEventId]);

  const fetchInvitees = useCallback(
    async (eventId: string) => {
      const { data } = await supabase
        .from("event_invitees")
        .select("id, contacts(id,name,phone)")
        .eq("event_id", eventId);
      const normalized = (data ?? []).flatMap((row) => {
        const c = (row as Invitee).contacts;
        if (!c) return [];
        return Array.isArray(c) ? c : [c];
      });
      setInvitees(normalized as Contact[]);
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

  useEffect(() => {
    fetchContacts();
    fetchEvents();
  }, [fetchContacts, fetchEvents]);

  useEffect(() => {
    if (!selectedEventId) {
      setInvitees([]);
      setGifts([]);
      return;
    }
    fetchInvitees(selectedEventId);
    fetchGifts(selectedEventId);
  }, [selectedEventId, fetchInvitees, fetchGifts]);

  useEffect(() => {
    if (invitees.length === 0) {
      setSelectedGiftContactId(null);
      return;
    }
    if (
      !selectedGiftContactId ||
      !invitees.find((i) => i.id === selectedGiftContactId)
    ) {
      setSelectedGiftContactId(invitees[0].id);
    }
  }, [invitees, selectedGiftContactId]);

  async function onSavePhone() {
    setSavingPhone(true);
    await supabase
      .from("profiles")
      .upsert({ id: userId, phone_number: phone.trim() || null });
    setSavingPhone(false);
  }

  async function onAddContact(e: React.FormEvent) {
    e.preventDefault();
    if (!contactName.trim()) return;
    setAddingContact(true);
    await supabase
      .from("contacts")
      .insert({
        owner_id: userId,
        name: contactName.trim(),
        phone: contactPhone.trim() || null,
      });
    setContactName("");
    setContactPhone("");
    await fetchContacts();
    setAddingContact(false);
  }

  async function onCreateEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!eventName.trim() || !eventDate.trim()) return;
    setCreatingEvent(true);
    const { data } = await supabase
      .from("events")
      .insert({
        owner_id: userId,
        event_name: eventName.trim(),
        event_date: eventDate.trim(),
      })
      .select("id,event_name,event_date,created_at")
      .single();
    setCreatingEvent(false);
    setEventName("");
    setEventDate("");
    if (data) {
      setEvents((cur) => [data as AppEvent, ...cur]);
      setSelectedEventId(data.id);
    } else await fetchEvents();
  }

  async function onAddInvitee(contactId: string) {
    if (!selectedEventId) return;
    if (invitees.some((i) => i.id === contactId)) return;
    setAddingInvitee(true);
    await supabase
      .from("event_invitees")
      .insert({ event_id: selectedEventId, contact_id: contactId });
    await fetchInvitees(selectedEventId);
    setAddingInvitee(false);
  }

  async function onCreateGift(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedEventId || !selectedGiftContactId || !giftName.trim()) return;
    const amount = giftAmount.trim() ? Number(giftAmount.trim()) : null;
    setCreatingGift(true);
    const { data } = await supabase
      .from("gifts")
      .insert({
        event_id: selectedEventId,
        contact_id: selectedGiftContactId,
        gift_name: giftName.trim(),
        amount,
        notes: giftNotes.trim() || null,
      })
      .select("*, contacts(id,name,phone)")
      .single();
    setCreatingGift(false);
    if (data) {
      setGifts((cur) => [data as GiftRow, ...cur]);
      setGiftName("");
      setGiftAmount("");
      setGiftNotes("");
    } else await fetchGifts(selectedEventId);
  }

  async function onSignOut() {
    await supabase.auth.signOut();
    router.push("/auth/sign-in");
    router.refresh();
  }

  return (
    <div className="page-wide">
      <div className="top-bar">
        <div>
          <div className="logo">Dhanada</div>
          <p className="subtitle">{fullName || email}</p>
        </div>
        <button className="btn-secondary" onClick={onSignOut}>
          Sign Out
        </button>
      </div>

      {/* Nav tabs */}
      <nav className="nav">
        <a
          href="#"
          className={`nav-link${tab === "contacts" ? " active" : ""}`}
          onClick={(e) => {
            e.preventDefault();
            setTab("contacts");
          }}
        >
          Contacts
        </a>
        <a
          href="#"
          className={`nav-link${tab === "events" ? " active" : ""}`}
          onClick={(e) => {
            e.preventDefault();
            setTab("events");
          }}
        >
          Events & Gifts
        </a>
      </nav>

      {tab === "contacts" && (
        <>
          {/* Profile phone */}
          <div className="card">
            <div className="card-title">Profile</div>
            <input
              className="input"
              placeholder="Phone number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <button
              className="btn-primary"
              onClick={onSavePhone}
              disabled={savingPhone}
            >
              {savingPhone ? "Saving..." : "Save Phone"}
            </button>
          </div>

          {/* Add contact */}
          <div className="card">
            <div className="card-title">Add Contact</div>
            <form onSubmit={onAddContact}>
              <input
                className="input"
                placeholder="Name"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                required
              />
              <input
                className="input"
                placeholder="Phone (optional)"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
              />
              <button
                className="btn-primary"
                type="submit"
                disabled={addingContact}
              >
                {addingContact ? "Adding..." : "Add Contact"}
              </button>
            </form>
          </div>

          {/* Contact list */}
          <div className="card">
            <div className="card-title">Your Contacts</div>
            {contacts.length === 0 ? (
              <p className="empty">No contacts yet.</p>
            ) : (
              contacts.map((c) => (
                <div key={c.id} className="list-item row">
                  <div style={{ flex: 1 }}>
                    <div className="list-name">{c.name}</div>
                    <div className="list-meta">{c.phone || "No phone"}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {tab === "events" && (
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}
        >
          {/* Left column */}
          <div>
            <div className="card">
              <div className="card-title">Create Event</div>
              <form onSubmit={onCreateEvent}>
                <input
                  className="input"
                  placeholder="Event name"
                  value={eventName}
                  onChange={(e) => setEventName(e.target.value)}
                  required
                />
                <input
                  className="input"
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  required
                />
                <button
                  className="btn-primary"
                  type="submit"
                  disabled={creatingEvent}
                >
                  {creatingEvent ? "Creating..." : "Create Event"}
                </button>
              </form>
            </div>

            <div className="card">
              <div className="card-title">Your Events</div>
              {events.length === 0 ? (
                <p className="empty">No events yet.</p>
              ) : (
                events.map((ev) => (
                  <div
                    key={ev.id}
                    className={`list-item${ev.id === selectedEventId ? " active" : ""}`}
                    style={{
                      cursor: "pointer",
                      padding: "10px 8px",
                      borderRadius: ev.id === selectedEventId ? 8 : 0,
                      background:
                        ev.id === selectedEventId ? "#1c2b4b" : "transparent",
                    }}
                    onClick={() => setSelectedEventId(ev.id)}
                  >
                    <div className="list-name">{ev.event_name}</div>
                    <div className="list-meta">{formatDate(ev.event_date)}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right column */}
          <div>
            <div className="card">
              <div className="card-title">Invitees</div>
              <p className="helper">
                {selectedEvent
                  ? `Event: ${selectedEvent.event_name}`
                  : "Select an event."}
              </p>
              {contacts.map((c) => (
                <div key={c.id} className="list-item row">
                  <div style={{ flex: 1 }}>
                    <div className="list-name">{c.name}</div>
                    <div className="list-meta">{c.phone || "No phone"}</div>
                  </div>
                  <button
                    className="add-btn"
                    disabled={
                      !selectedEventId ||
                      addingInvitee ||
                      invitees.some((i) => i.id === c.id)
                    }
                    onClick={() => onAddInvitee(c.id)}
                  >
                    {invitees.some((i) => i.id === c.id) ? "Added" : "Add"}
                  </button>
                </div>
              ))}
              {contacts.length === 0 && (
                <p className="empty">Add contacts first.</p>
              )}
            </div>

            <div className="card">
              <div className="card-title">Add Gift</div>
              {invitees.length > 0 ? (
                <>
                  <div className="chip-wrap">
                    {invitees.map((inv) => (
                      <button
                        key={inv.id}
                        className={`chip${inv.id === selectedGiftContactId ? " active" : ""}`}
                        onClick={() => setSelectedGiftContactId(inv.id)}
                      >
                        {inv.name}
                      </button>
                    ))}
                  </div>
                  <form onSubmit={onCreateGift}>
                    <input
                      className="input"
                      placeholder="Gift name"
                      value={giftName}
                      onChange={(e) => setGiftName(e.target.value)}
                      required
                    />
                    <input
                      className="input"
                      placeholder="Amount (optional)"
                      value={giftAmount}
                      onChange={(e) => setGiftAmount(e.target.value)}
                      type="number"
                      min="0"
                      step="0.01"
                    />
                    <textarea
                      className="input"
                      placeholder="Notes (optional)"
                      value={giftNotes}
                      onChange={(e) => setGiftNotes(e.target.value)}
                    />
                    <button
                      className="btn-primary"
                      type="submit"
                      disabled={creatingGift || !selectedGiftContactId}
                    >
                      {creatingGift ? "Saving..." : "Add Gift"}
                    </button>
                  </form>
                </>
              ) : (
                <p className="empty">Add invitees to record gifts.</p>
              )}
            </div>

            <div className="card">
              <div className="card-title">Gifts for Event</div>
              {gifts.length === 0 ? (
                <p className="empty">No gifts recorded yet.</p>
              ) : (
                gifts.map((g) => {
                  const linkedContact = g.contacts
                    ? ((Array.isArray(g.contacts)
                        ? g.contacts[0]
                        : g.contacts) as Contact | null)
                    : null;
                  const amount =
                    typeof g.amount === "number"
                      ? g.amount
                      : typeof g.gift_value === "number"
                        ? g.gift_value
                        : null;
                  return (
                    <div key={g.id} className="list-item">
                      <div className="list-name">
                        {String(g.gift_name ?? g.item_name ?? "Unnamed gift")}
                      </div>
                      <div className="list-meta">
                        {linkedContact?.name ? `For ${linkedContact.name}` : ""}
                        {amount !== null ? ` • Rs. ${amount}` : ""}
                      </div>
                      {g.notes || g.note ? (
                        <div className="list-meta">
                          {String(g.notes ?? g.note ?? "")}
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
