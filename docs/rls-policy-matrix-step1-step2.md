# Step 1 + Step 2 RLS Policy Matrix

Scope:

- Step 1: invite + connection + contact-user linking.
- Step 2: explicit record sharing with strict visibility.

All rules assume authenticated users only.

## Core Rules

- Default visibility is private.
- Sharing is explicit and per-record.
- Recipient can read shared metadata, but only owner can modify share grants.
- Sharing insert requires accepted connection via `are_connected(owner_user_id, shared_with_user_id)`.

## Table Matrix

| Table                | SELECT                 | INSERT                         | UPDATE                 | DELETE             |
| -------------------- | ---------------------- | ------------------------------ | ---------------------- | ------------------ |
| `app_invites`        | inviter or invitee     | inviter only                   | inviter or invitee     | none (not enabled) |
| `contact_user_links` | owner or linked user   | owner only                     | owner only             | owner only         |
| `user_connections`   | requester or addressee | requester only                 | requester or addressee | none (not enabled) |
| `event_shares`       | owner or recipient     | owner only + must be connected | owner only             | owner only         |
| `wishlist_shares`    | owner or recipient     | owner only + must be connected | owner only             | owner only         |
| `gift_shares`        | owner or recipient     | owner only + must be connected | owner only             | owner only         |

## Additive Shared-Read Policies on Core Tables

These policies are additive to existing owner policies and allow friend-view reads:

- `events`: visible when an active `event_shares` row exists for `shared_with_user_id = auth.uid()`.
- `wishlists`: visible when an active `wishlist_shares` row exists for `shared_with_user_id = auth.uid()`.
- `gifts`: visible when either:
  - active `gift_shares` row exists for the viewer, or
  - its parent `event_id` is actively shared to the viewer in `event_shares`.

## Visibility Guarantees

- A user cannot discover unrelated users or rows by phone/contact lookup alone.
- Recipient sees only records explicitly shared to them.
- Unshare (`is_active = false` or delete share row) revokes visibility immediately.
- Block/reject in `user_connections` prevents new share grants due to connection check.

## Next Implementation Hook (UI)

- Invite button creates `app_invites` token row.
- Accept flow creates/updates `user_connections` to `accepted`.
- Share toggles create/update `event_shares` / `wishlist_shares` / `gift_shares`.
- Friend-view screens query core tables directly; RLS filters results automatically.
