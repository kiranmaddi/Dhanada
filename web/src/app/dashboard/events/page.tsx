"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";

type AppEvent = {
  id: string;
  event_name: string;
  event_date: string;
  venue: string | null;
  description: string | null;
  invitation_text: string | null;
  is_repetitive: boolean;
  created_at: string;
};

type Wishlist = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
};

type SharedWishlist = {
  wishlist_id: string;
  event_id: string;
};

function formatDate(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

export default function EventsPage() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [creating, setCreating] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [wishlists, setWishlists] = useState<Wishlist[]>([]);
  const [sharedWishlists, setSharedWishlists] = useState<SharedWishlist[]>([]);
  const [loadingWishlists, setLoadingWishlists] = useState(false);
  const [sharingWishlistId, setSharingWishlistId] = useState<string | null>(
    null,
  );

  // Form state
  const [eventName, setEventName] = useState("");
  const [venue, setVenue] = useState("");
  const [description, setDescription] = useState("");
  const [invitationText, setInvitationText] = useState("");
  const [isRepetitive, setIsRepetitive] = useState(false);
  const [eventDate, setEventDate] = useState("");

  // Edit mode
  const editingEvent = events.find((e) => e.id === editingId);
  const startEdit = (ev: AppEvent) => {
    setEventName(ev.event_name);
    setVenue(ev.venue || "");
    setDescription(ev.description || "");
    setInvitationText(ev.invitation_text || "");
    setIsRepetitive(ev.is_repetitive);
    setEventDate(ev.event_date);
    setEditingId(ev.id);
  };
  const cancelEdit = () => {
    setEditingId(null);
  };

  const fetchEvents = useCallback(
    async (ownerId: string) => {
      const { data, error } = await supabase
        .from("events")
        .select(
          "id,event_name,event_date,venue,description,invitation_text,is_repetitive,created_at",
        )
        .eq("owner_id", ownerId)
        .order("event_date", { ascending: true });
      if (!error) setEvents((data ?? []) as AppEvent[]);
    },
    [supabase],
  );

  const fetchWishlists = useCallback(
    async (ownerId: string) => {
      setLoadingWishlists(true);
      const { data, error } = await supabase
        .from("wishlists")
        .select("id,name,description,is_active")
        .eq("owner_id", ownerId)
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      if (!error) setWishlists((data ?? []) as Wishlist[]);
      setLoadingWishlists(false);
    },
    [supabase],
  );

  const fetchSharedWishlists = useCallback(
    async (eventId: string) => {
      const { data, error } = await supabase
        .from("wishlist_event_shares")
        .select("wishlist_id,event_id")
        .eq("event_id", eventId);
      if (!error) setSharedWishlists((data ?? []) as SharedWishlist[]);
    },
    [supabase],
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session?.user) {
        setLoading(false);
        return;
      }
      setUserId(data.session.user.id);
      Promise.all([
        fetchEvents(data.session.user.id),
        fetchWishlists(data.session.user.id),
      ]).finally(() => setLoading(false));
    });
  }, [supabase, fetchEvents, fetchWishlists]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || !eventName.trim() || !eventDate) return;

    if (editingId) {
      // Update mode
      setUpdating(true);
      const { error } = await supabase
        .from("events")
        .update({
          event_name: eventName.trim(),
          event_date: eventDate,
          venue: venue.trim() || null,
          description: description.trim() || null,
          invitation_text: invitationText.trim() || null,
          is_repetitive: isRepetitive,
        })
        .eq("id", editingId);

      setUpdating(false);

      if (error) {
        alert("Update failed: " + error.message);
        return;
      }

      setEvents((cur) =>
        cur.map((ev) =>
          ev.id === editingId
            ? {
                ...ev,
                event_name: eventName.trim(),
                event_date: eventDate,
                venue: venue.trim() || null,
                description: description.trim() || null,
                invitation_text: invitationText.trim() || null,
                is_repetitive: isRepetitive,
              }
            : ev,
        ),
      );

      setEventName("");
      setVenue("");
      setDescription("");
      setInvitationText("");
      setIsRepetitive(false);
      setEventDate("");
      setEditingId(null);
    } else {
      // Create mode
      setCreating(true);

      const { data, error } = await supabase
        .from("events")
        .insert({
          owner_id: userId,
          event_name: eventName.trim(),
          event_date: eventDate,
          venue: venue.trim() || null,
          description: description.trim() || null,
          invitation_text: invitationText.trim() || null,
          is_repetitive: isRepetitive,
        })
        .select(
          "id,event_name,event_date,venue,description,invitation_text,is_repetitive,created_at",
        )
        .single();

      setCreating(false);

      if (error) {
        alert("Create failed: " + error.message);
        return;
      }

      setEventName("");
      setVenue("");
      setDescription("");
      setInvitationText("");
      setIsRepetitive(false);
      setEventDate("");

      if (data)
        setEvents((cur) =>
          [...cur, data as AppEvent].sort(
            (a, b) =>
              new Date(a.event_date).getTime() -
              new Date(b.event_date).getTime(),
          ),
        );
    }
  }

  async function onDelete() {
    if (!editingId || !confirm("Delete this event? This cannot be undone."))
      return;

    setDeleting(true);
    const { error } = await supabase
      .from("events")
      .delete()
      .eq("id", editingId);
    setDeleting(false);

    if (error) {
      alert("Delete failed: " + error.message);
      return;
    }

    setEvents((cur) => cur.filter((ev) => ev.id !== editingId));
    setEventName("");
    setVenue("");
    setDescription("");
    setInvitationText("");
    setIsRepetitive(false);
    setEventDate("");
    setEditingId(null);
  }

  async function onShareWishlist(wishlistId: string, eventId: string) {
    if (!userId) return;
    setSharingWishlistId(wishlistId);
    const { error } = await supabase
      .from("wishlist_event_shares")
      .insert({
        wishlist_id: wishlistId,
        event_id: eventId,
        shared_by_user_id: userId,
        permission: "view",
      })
      .select();

    if (!error) {
      void fetchSharedWishlists(eventId);
    } else {
      console.warn("Share error:", error.message);
    }
    setSharingWishlistId(null);
  }

  if (loading) return <p className="empty">Loading...</p>;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      {/* Left — create/edit form */}
      <div>
        <div className="card">
          <div className="card-title">
            {editingId ? "Edit Event" : "New Event"}
          </div>
          <form onSubmit={onCreate}>
            <input
              className="input"
              placeholder="Event name *"
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              required
            />
            <input
              className="input"
              placeholder="Venue"
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
            />
            <textarea
              className="input"
              placeholder="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
            <textarea
              className="input"
              placeholder="Invitation text"
              value={invitationText}
              onChange={(e) => setInvitationText(e.target.value)}
              rows={3}
            />

            <label className="field-label">Date *</label>
            <input
              className="input"
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              required
            />

            <label className="field-label">Frequency</label>
            <div className="toggle-row">
              <button
                type="button"
                className={`toggle-option${!isRepetitive ? " toggle-active" : ""}`}
                onClick={() => setIsRepetitive(false)}
              >
                Once
              </button>
              <button
                type="button"
                className={`toggle-option${isRepetitive ? " toggle-active" : ""}`}
                onClick={() => setIsRepetitive(true)}
              >
                Repetitive
              </button>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn-primary"
                type="submit"
                disabled={creating || updating}
                style={{ flex: 1 }}
              >
                {editingId
                  ? updating
                    ? "Updating..."
                    : "Update Event"
                  : creating
                    ? "Creating..."
                    : "Create Event"}
              </button>
              {editingId && (
                <button
                  className="remove-btn"
                  type="button"
                  onClick={onDelete}
                  disabled={deleting}
                >
                  {deleting ? "Deleting..." : "Delete"}
                </button>
              )}
            </div>

            {editingId && (
              <button
                type="button"
                className="btn-secondary"
                onClick={cancelEdit}
                style={{ width: "100%", marginTop: 8 }}
              >
                Cancel
              </button>
            )}
          </form>
        </div>
      </div>

      {/* Right — events list */}
      <div>
        <div className="card">
          <div className="card-title">Events ({events.length})</div>
          {events.length === 0 ? (
            <p className="empty">No events yet.</p>
          ) : (
            events.map((ev) => (
              <div
                key={ev.id}
                className="event-item"
                onClick={() => {
                  if (expandedId === ev.id) {
                    setExpandedId(null);
                  } else {
                    setExpandedId(ev.id);
                    void fetchSharedWishlists(ev.id);
                  }
                }}
              >
                <div className="event-header">
                  <div style={{ flex: 1 }}>
                    <span className="list-name">{ev.event_name}</span>
                    <div
                      style={{ display: "flex", gap: 6, alignItems: "center" }}
                    >
                      <span className="date-badge">
                        {formatDate(ev.event_date)}
                      </span>
                      {ev.is_repetitive && (
                        <span className="rep-badge">Recurring</span>
                      )}
                    </div>
                  </div>
                  <button
                    className="add-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      startEdit(ev);
                    }}
                  >
                    Edit
                  </button>
                </div>
                {expandedId === ev.id && (
                  <div className="event-detail">
                    {ev.venue && <p className="detail-row">📍 {ev.venue}</p>}
                    {ev.description && (
                      <p className="detail-row">📝 {ev.description}</p>
                    )}
                    {ev.invitation_text && (
                      <p className="detail-row">✉️ {ev.invitation_text}</p>
                    )}

                    {/* Wishlist sharing section */}
                    <div
                      style={{
                        marginTop: 16,
                        paddingTop: 16,
                        borderTop: "1px solid #333",
                      }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: 8 }}>
                        Share Wishlist
                      </div>
                      {loadingWishlists ? (
                        <p className="empty" style={{ fontSize: 12 }}>
                          Loading...
                        </p>
                      ) : wishlists.length === 0 ? (
                        <p className="empty" style={{ fontSize: 12 }}>
                          No wishlists yet
                        </p>
                      ) : (
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 8,
                          }}
                        >
                          {wishlists.map((wl) => {
                            const isShared = sharedWishlists.some(
                              (sw) => sw.wishlist_id === wl.id,
                            );
                            return (
                              <div
                                key={wl.id}
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  padding: 8,
                                  backgroundColor: "#111",
                                  borderRadius: 6,
                                  fontSize: 13,
                                }}
                              >
                                <span>{wl.name}</span>
                                <button
                                  className={
                                    isShared ? "btn-secondary" : "btn-primary"
                                  }
                                  disabled={
                                    isShared || sharingWishlistId === wl.id
                                  }
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (!isShared) {
                                      void onShareWishlist(wl.id, ev.id);
                                    }
                                  }}
                                  style={{ padding: "4px 12px", fontSize: 12 }}
                                >
                                  {sharingWishlistId === wl.id
                                    ? "Sharing..."
                                    : isShared
                                      ? "Shared"
                                      : "Share"}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
