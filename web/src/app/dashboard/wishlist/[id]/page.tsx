"use client";

import { use, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

type WishlistItem = {
  id: string;
  wishlist_id: string;
  item_name: string;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
};

type WishlistDetail = {
  id: string;
  name: string;
  owner_id: string;
  is_active: boolean;
  created_at: string;
};

type EventInfo = {
  id: string;
  event_name: string;
  event_date: string;
  venue: string | null;
  description: string | null;
};

type ContactInfo = {
  id: string;
  name: string;
  phone: string | null;
};

export default function WishlistDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const { id: wishlistId } = use(params);

  const contactId = searchParams.get("contactId");
  const ownerName = searchParams.get("ownerName");
  const ownerId = searchParams.get("ownerId");

  const [loading, setLoading] = useState(true);
  const [wishlist, setWishlist] = useState<WishlistDetail | null>(null);
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [eventInfo, setEventInfo] = useState<EventInfo | null>(null);
  const [contactInfo, setContactInfo] = useState<ContactInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch wishlist details, items, event, and contact
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Fetch wishlist
        const { data: wishlistData, error: wishlistErr } = await supabase
          .from("wishlists")
          .select("id,name,owner_id,is_active,created_at")
          .eq("id", wishlistId)
          .single();

        if (wishlistErr) {
          setError(`Failed to load wishlist: ${wishlistErr.message}`);
          setLoading(false);
          return;
        }

        setWishlist(wishlistData as WishlistDetail);

        // Fetch items
        const { data: itemsData, error: itemsErr } = await supabase
          .from("wishlist_items")
          .select("id,wishlist_id,item_name,image_url,is_active,created_at")
          .eq("wishlist_id", wishlistId)
          .order("is_active", { ascending: false })
          .order("created_at", { ascending: false });

        if (!itemsErr) {
          setItems((itemsData ?? []) as WishlistItem[]);
        }

        // Fetch event info from wishlist_shares
        const { data: sharesData } = await supabase
          .from("wishlist_shares")
          .select(
            `
            event_id,
            events!inner (id, event_name, event_date, venue, description)
          `,
          )
          .eq("wishlist_id", wishlistId)
          .limit(1)
          .single();

        if (sharesData && "events" in sharesData && sharesData.events) {
          setEventInfo({
            id: sharesData.events.id,
            event_name: sharesData.events.event_name,
            event_date: sharesData.events.event_date,
            venue: sharesData.events.venue,
            description: sharesData.events.description,
          });
        }

        // Fetch contact info if contactId is provided
        if (contactId) {
          const { data: contactData } = await supabase
            .from("contacts")
            .select("id,name,phone")
            .eq("id", contactId)
            .single();

          if (contactData) {
            setContactInfo(contactData as ContactInfo);
          }
        }
      } catch (err) {
        console.error("Error:", err);
        setError("An unexpected error occurred");
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
  }, [wishlistId, contactId, supabase]);

  if (loading) {
    return (
      <div style={{ padding: 16 }}>
        <p>Loading wishlist...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 16 }}>
        <p style={{ color: "red" }}>{error}</p>
        <button onClick={() => router.back()}>Go Back</button>
      </div>
    );
  }

  if (!wishlist) {
    return (
      <div style={{ padding: 16 }}>
        <p>Wishlist not found.</p>
        <button onClick={() => router.back()}>Go Back</button>
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: 1000,
        margin: "0 auto",
        padding: 16,
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Back Button */}
      <button
        onClick={() => router.push("/dashboard")}
        style={{
          padding: "8px 16px",
          marginBottom: 24,
          backgroundColor: "#f3f4f6",
          border: "1px solid #d1d5db",
          borderRadius: 6,
          cursor: "pointer",
          fontSize: 14,
        }}
      >
        ← Back to Contacts
      </button>

      {/* Contact Info Card */}
      {contactInfo && (
        <div
          style={{
            backgroundColor: "#f9fafb",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            padding: 16,
            marginBottom: 24,
          }}
        >
          <h3 style={{ margin: "0 0 12px 0", fontSize: 16, fontWeight: 600 }}>
            From: {contactInfo.name}
          </h3>
          {contactInfo.phone && (
            <p style={{ margin: 0, fontSize: 14, color: "#6b7280" }}>
              {contactInfo.phone}
            </p>
          )}
        </div>
      )}

      {/* Event Info Card */}
      {eventInfo && (
        <div
          style={{
            backgroundColor: "#eff6ff",
            border: "1px solid #bfdbfe",
            borderRadius: 8,
            padding: 16,
            marginBottom: 24,
          }}
        >
          <h3 style={{ margin: "0 0 8px 0", fontSize: 16, fontWeight: 600 }}>
            📅 {eventInfo.event_name}
          </h3>
          <p style={{ margin: "4px 0", fontSize: 14, color: "#1e40af" }}>
            {new Date(eventInfo.event_date).toLocaleDateString()}
          </p>
          {eventInfo.venue && (
            <p style={{ margin: "4px 0", fontSize: 14, color: "#1e40af" }}>
              📍 {eventInfo.venue}
            </p>
          )}
          {eventInfo.description && (
            <p style={{ margin: "8px 0 0 0", fontSize: 13, color: "#1e40af" }}>
              {eventInfo.description}
            </p>
          )}
        </div>
      )}

      {/* Wishlist Title */}
      <h1 style={{ marginBottom: 24, fontSize: 28, fontWeight: 700 }}>
        {wishlist.name}
      </h1>

      {/* Items Grid */}
      {items.length === 0 ? (
        <p
          style={{
            textAlign: "center",
            padding: "32px 16px",
            color: "#9ca3af",
          }}
        >
          No items in this wishlist yet.
        </p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 16,
          }}
        >
          {items.map((item) => (
            <div
              key={item.id}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                overflow: "hidden",
                backgroundColor: "#f9fafb",
              }}
            >
              {item.image_url && (
                <div
                  style={{
                    aspectRatio: "1",
                    overflow: "hidden",
                    backgroundColor: "#f3f4f6",
                  }}
                >
                  <img
                    src={item.image_url}
                    alt={item.item_name}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                </div>
              )}
              <div style={{ padding: 12 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                  {item.item_name}
                </div>
                <div style={{ fontSize: "0.875rem", color: "#6b7280" }}>
                  {new Date(item.created_at).toLocaleDateString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
