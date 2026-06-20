"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";

type Contact = { id: string; name: string; phone: string | null };

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
  const supabase = createClient();

  const [phone, setPhone] = useState(initialPhone);
  const [savingPhone, setSavingPhone] = useState(false);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [addingContact, setAddingContact] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [updatingContact, setUpdatingContact] = useState(false);
  const [deletingContact, setDeletingContact] = useState(false);

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

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

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
              <button className="add-btn" onClick={() => startEditContact(c)}>
                Edit
              </button>
            </div>
          ))
        )}
      </div>
    </>
  );
}
