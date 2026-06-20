"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";

type AppEvent = { id: string; event_name: string; event_date: string };
type Contact = { id: string; name: string; phone: string | null };
type InviteeRow = { id: string; contacts: Contact | Contact[] | null };

function formatDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

export default function InviteesPage() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [invitees, setInvitees] = useState<Contact[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const selectedEvent = events.find((e) => e.id === selectedEventId) ?? null;

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
      setInvitees(normalized as Contact[]);
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

      const [evRes, cRes] = await Promise.all([
        supabase
          .from("events")
          .select("id,event_name,event_date")
          .eq("owner_id", uid)
          .order("event_date", { ascending: true }),
        supabase
          .from("contacts")
          .select("id,name,phone")
          .eq("owner_id", uid)
          .order("name"),
      ]);

      const evList = (evRes.data ?? []) as AppEvent[];
      setEvents(evList);
      setContacts((cRes.data ?? []) as Contact[]);
      if (evList.length > 0) setSelectedEventId(evList[0].id);
      setLoading(false);
    });
  }, [supabase]);

  useEffect(() => {
    if (!selectedEventId) {
      setInvitees([]);
      return;
    }
    fetchInvitees(selectedEventId);
  }, [selectedEventId, fetchInvitees]);

  async function onAdd(contactId: string) {
    if (!selectedEventId) return;
    if (invitees.some((i) => i.id === contactId)) return;
    setAdding(true);
    const { error } = await supabase
      .from("event_invitees")
      .insert({ event_id: selectedEventId, contact_id: contactId });
    setAdding(false);
    if (error) {
      const msg =
        error.code === "23505" ? "Already an invitee." : error.message;
      alert(msg);
      return;
    }
    await fetchInvitees(selectedEventId);
  }

  async function onRemove(contactId: string) {
    if (!selectedEventId) return;
    await supabase
      .from("event_invitees")
      .delete()
      .eq("event_id", selectedEventId)
      .eq("contact_id", contactId);
    setInvitees((cur) => cur.filter((i) => i.id !== contactId));
  }

  if (loading) return <p className="empty">Loading...</p>;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      {/* Left — event selector + invitees */}
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
              Invitees — {selectedEvent.event_name} ({invitees.length})
            </div>
            {invitees.length === 0 ? (
              <p className="empty">No invitees yet. Add from contacts →</p>
            ) : (
              invitees.map((inv) => (
                <div key={inv.id} className="list-item row">
                  <div style={{ flex: 1 }}>
                    <div className="list-name">{inv.name}</div>
                    <div className="list-meta">{inv.phone || "No phone"}</div>
                  </div>
                  <button
                    className="remove-btn"
                    onClick={() => onRemove(inv.id)}
                  >
                    Remove
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Right — contacts to add */}
      {selectedEvent && (
        <div>
          <div className="card">
            <div className="card-title">Add from Contacts</div>
            {contacts.length === 0 ? (
              <p className="empty">
                No contacts — add them on the Contacts tab.
              </p>
            ) : (
              contacts.map((c) => {
                const alreadyAdded = invitees.some((i) => i.id === c.id);
                return (
                  <div key={c.id} className="list-item row">
                    <div style={{ flex: 1 }}>
                      <div className="list-name">{c.name}</div>
                      <div className="list-meta">{c.phone || "No phone"}</div>
                    </div>
                    <button
                      className="add-btn"
                      disabled={alreadyAdded || adding}
                      onClick={() => onAdd(c.id)}
                    >
                      {alreadyAdded ? "Added" : "Add"}
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
