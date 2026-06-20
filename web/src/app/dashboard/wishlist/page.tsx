"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase-browser";

type Wishlist = {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
};

type WishlistItem = {
  id: string;
  wishlist_id: string;
  item_name: string;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
};

type EventRow = {
  id: string;
  event_name: string;
  event_date: string;
};

type EventLink = {
  id: string;
  wishlist_id: string;
  event_id: string;
  is_active: boolean;
};

function activeFirst<T extends { is_active: boolean; created_at: string }>(
  rows: T[],
) {
  return [...rows].sort((a, b) => {
    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

function formatDate(value: string) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString();
}

export default function WishListPage() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const [wishlists, setWishlists] = useState<Wishlist[]>([]);
  const [selectedWishlistId, setSelectedWishlistId] = useState<string | null>(
    null,
  );
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [links, setLinks] = useState<EventLink[]>([]);

  const [creatingList, setCreatingList] = useState(false);
  const [creatingItem, setCreatingItem] = useState(false);

  const [wishlistName, setWishlistName] = useState("");
  const [itemName, setItemName] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);

  const selectedWishlist = useMemo(
    () => wishlists.find((w) => w.id === selectedWishlistId) ?? null,
    [wishlists, selectedWishlistId],
  );

  const fetchWishlists = useCallback(
    async (ownerId: string) => {
      const { data, error } = await supabase
        .from("wishlists")
        .select("id,name,is_active,created_at")
        .eq("owner_id", ownerId)
        .order("is_active", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) {
        alert("Wishlist error: " + error.message);
        return;
      }

      const rows = activeFirst((data ?? []) as Wishlist[]);
      setWishlists(rows);
      if (!selectedWishlistId && rows.length > 0) {
        setSelectedWishlistId(rows[0].id);
      }
    },
    [supabase, selectedWishlistId],
  );

  const fetchItems = useCallback(
    async (wishlistId: string) => {
      const { data, error } = await supabase
        .from("wishlist_items")
        .select("id,wishlist_id,item_name,image_url,is_active,created_at")
        .eq("wishlist_id", wishlistId)
        .order("is_active", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) {
        alert("Wishlist item error: " + error.message);
        return;
      }

      setItems(activeFirst((data ?? []) as WishlistItem[]));
    },
    [supabase],
  );

  const fetchEvents = useCallback(
    async (ownerId: string) => {
      const { data, error } = await supabase
        .from("events")
        .select("id,event_name,event_date")
        .eq("owner_id", ownerId)
        .order("event_date", { ascending: true });

      if (error) {
        alert("Events error: " + error.message);
        return;
      }

      setEvents((data ?? []) as EventRow[]);
    },
    [supabase],
  );

  const fetchLinks = useCallback(
    async (wishlistId: string) => {
      const { data, error } = await supabase
        .from("event_wishlists")
        .select("id,wishlist_id,event_id,is_active")
        .eq("wishlist_id", wishlistId);

      if (error) {
        alert("Wishlist-event link error: " + error.message);
        return;
      }

      setLinks((data ?? []) as EventLink[]);
    },
    [supabase],
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user?.id;
      if (!uid) {
        setLoading(false);
        return;
      }
      setUserId(uid);
      Promise.all([fetchWishlists(uid), fetchEvents(uid)]).finally(() =>
        setLoading(false),
      );
    });
  }, [supabase, fetchEvents, fetchWishlists]);

  useEffect(() => {
    if (!selectedWishlistId) {
      setItems([]);
      setLinks([]);
      return;
    }
    fetchItems(selectedWishlistId);
    fetchLinks(selectedWishlistId);
  }, [selectedWishlistId, fetchItems, fetchLinks]);

  async function uploadImage(ownerId: string, file: File) {
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${ownerId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error } = await supabase.storage
      .from("wishlist-images")
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (error) throw error;

    const { data } = supabase.storage
      .from("wishlist-images")
      .getPublicUrl(path);
    return data.publicUrl;
  }

  async function onCreateWishlist(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || !wishlistName.trim()) return;

    setCreatingList(true);

    const { data, error } = await supabase
      .from("wishlists")
      .insert({
        owner_id: userId,
        name: wishlistName.trim(),
        is_active: true,
      })
      .select("id,name,is_active,created_at")
      .single();

    setCreatingList(false);

    if (error) {
      alert("Create wishlist failed: " + error.message);
      return;
    }

    setWishlistName("");

    if (data) {
      const next = activeFirst([data as Wishlist, ...wishlists]);
      setWishlists(next);
      setSelectedWishlistId(data.id);
    }
  }

  async function onToggleWishlistActive(wishlist: Wishlist) {
    const { error } = await supabase
      .from("wishlists")
      .update({ is_active: !wishlist.is_active })
      .eq("id", wishlist.id);

    if (error) {
      alert("Update wishlist failed: " + error.message);
      return;
    }

    setWishlists((curr) =>
      activeFirst(
        curr.map((w) =>
          w.id === wishlist.id ? { ...w, is_active: !w.is_active } : w,
        ),
      ),
    );
  }

  async function onCreateItem(e: React.FormEvent) {
    e.preventDefault();

    if (!userId || !selectedWishlistId || !itemName.trim()) return;

    setCreatingItem(true);

    let imageUrl: string | null = null;
    if (imageFile) {
      try {
        imageUrl = await uploadImage(userId, imageFile);
      } catch (error) {
        setCreatingItem(false);
        const message =
          error instanceof Error ? error.message : "Image upload failed.";
        alert(message);
        return;
      }
    }

    const { data, error } = await supabase
      .from("wishlist_items")
      .insert({
        owner_id: userId,
        wishlist_id: selectedWishlistId,
        item_name: itemName.trim(),
        image_url: imageUrl,
        is_active: true,
      })
      .select("id,wishlist_id,item_name,image_url,is_active,created_at")
      .single();

    setCreatingItem(false);

    if (error) {
      alert("Create item failed: " + error.message);
      return;
    }

    setItemName("");
    setImageFile(null);

    if (data) {
      setItems((curr) => activeFirst([data as WishlistItem, ...curr]));
    }
  }

  async function onToggleItemActive(item: WishlistItem) {
    const { error } = await supabase
      .from("wishlist_items")
      .update({ is_active: !item.is_active })
      .eq("id", item.id);

    if (error) {
      alert("Update item failed: " + error.message);
      return;
    }

    setItems((curr) =>
      activeFirst(
        curr.map((i) =>
          i.id === item.id ? { ...i, is_active: !i.is_active } : i,
        ),
      ),
    );
  }

  async function onToggleEventShare(eventId: string) {
    if (!userId || !selectedWishlistId) return;

    const existing =
      links.find(
        (link) =>
          link.event_id === eventId && link.wishlist_id === selectedWishlistId,
      ) ?? null;

    if (!existing) {
      const { data, error } = await supabase
        .from("event_wishlists")
        .insert({
          owner_id: userId,
          wishlist_id: selectedWishlistId,
          event_id: eventId,
          is_active: true,
        })
        .select("id,wishlist_id,event_id,is_active")
        .single();

      if (error) {
        alert("Share link failed: " + error.message);
        return;
      }

      if (data) {
        setLinks((curr) => [...curr, data as EventLink]);
      }
      return;
    }

    const { error } = await supabase
      .from("event_wishlists")
      .update({ is_active: !existing.is_active })
      .eq("id", existing.id);

    if (error) {
      alert("Update share link failed: " + error.message);
      return;
    }

    setLinks((curr) =>
      curr.map((link) =>
        link.id === existing.id
          ? { ...link, is_active: !link.is_active }
          : link,
      ),
    );
  }

  if (loading) {
    return <p className="empty">Loading...</p>;
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <div>
        <div className="card">
          <div className="card-title">Create Wish List</div>
          <form onSubmit={onCreateWishlist}>
            <input
              className="input"
              placeholder="Wishlist name *"
              value={wishlistName}
              onChange={(e) => setWishlistName(e.target.value)}
              required
            />
            <button
              className="btn-primary"
              type="submit"
              disabled={creatingList}
            >
              {creatingList ? "Creating..." : "Create Wishlist"}
            </button>
          </form>
        </div>

        <div className="card">
          <div className="card-title">Your Wish Lists ({wishlists.length})</div>
          {wishlists.length === 0 ? (
            <p className="empty">No wishlists yet.</p>
          ) : (
            wishlists.map((wishlist) => {
              const activeClass =
                wishlist.id === selectedWishlistId ? " event-item-active" : "";
              return (
                <div
                  key={wishlist.id}
                  className={`event-item${activeClass}`}
                  onClick={() => setSelectedWishlistId(wishlist.id)}
                >
                  <div className="event-header">
                    <span className="list-name">{wishlist.name}</span>
                    <span
                      className={`status-badge ${wishlist.is_active ? "status-active" : "status-inactive"}`}
                    >
                      {wishlist.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <button
                      type="button"
                      className="add-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        void onToggleWishlistActive(wishlist);
                      }}
                    >
                      Make {wishlist.is_active ? "Inactive" : "Active"}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {selectedWishlist && (
          <div className="card">
            <div className="card-title">
              Share "{selectedWishlist.name}" with Event Invitees
            </div>
            <p className="helper">
              Provision only. Actual sharing flow can be added later. Only
              active wishlists/items should be considered for sharing.
            </p>
            {events.length === 0 ? (
              <p className="empty">No events yet.</p>
            ) : (
              events.map((event) => {
                const link =
                  links.find(
                    (l) =>
                      l.event_id === event.id &&
                      l.wishlist_id === selectedWishlist.id,
                  ) ?? null;
                const linked = link?.is_active ?? false;
                return (
                  <div key={event.id} className="list-item row">
                    <div style={{ flex: 1 }}>
                      <div className="list-name">{event.event_name}</div>
                      <div className="list-meta">
                        {formatDate(event.event_date)}
                      </div>
                    </div>
                    <button
                      className="add-btn"
                      type="button"
                      onClick={() => void onToggleEventShare(event.id)}
                    >
                      {linked ? "Shared" : "Share"}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      <div>
        {selectedWishlist ? (
          <>
            <div className="card">
              <div className="card-title">
                Add Item to "{selectedWishlist.name}"
              </div>
              <form onSubmit={onCreateItem}>
                <input
                  className="input"
                  placeholder="Item name *"
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  required
                />
                <input
                  className="input"
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    setImageFile(file);
                  }}
                />
                <button
                  className="btn-primary"
                  type="submit"
                  disabled={creatingItem}
                >
                  {creatingItem ? "Saving..." : "Add Item"}
                </button>
              </form>
            </div>

            <div className="card">
              <div className="card-title">Items ({items.length})</div>
              {items.length === 0 ? (
                <p className="empty">No items yet for this wishlist.</p>
              ) : (
                items.map((item) => (
                  <div
                    key={item.id}
                    className="list-item row"
                    style={{ alignItems: "flex-start" }}
                  >
                    {item.image_url ? (
                      <img
                        src={item.image_url}
                        alt={item.item_name}
                        className="wishlist-thumb"
                      />
                    ) : (
                      <div className="wishlist-thumb wishlist-thumb-empty">
                        No image
                      </div>
                    )}
                    <div style={{ flex: 1 }}>
                      <div className="list-name">{item.item_name}</div>
                      <div className="list-meta">
                        {item.is_active ? "Active" : "Inactive"}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="add-btn"
                      onClick={() => void onToggleItemActive(item)}
                    >
                      Make {item.is_active ? "Inactive" : "Active"}
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        ) : (
          <div className="card">
            <p className="empty">Select or create a wishlist first.</p>
          </div>
        )}
      </div>
    </div>
  );
}
