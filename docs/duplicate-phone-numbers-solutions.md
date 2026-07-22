# Duplicate Phone Numbers Issue - Solutions & Prevention

**Date Created:** 2026-07-23  
**Status:** Active Monitoring Required  
**Priority:** High (Data Integrity)

---

## Problem Definition

Duplicate phone numbers in the `profiles` table can cause:
1. **Broken contact mappings** - `contact_user_links` points to wrong user
2. **Lost wishlist access** - Shared wishlists become invisible or incorrectly shared
3. **Inconsistent data** - Multiple users claim ownership of same contact info
4. **Auth conflicts** - Phone-based lookups return ambiguous results

### Example Failure Scenario
```
User A: phone = "+91-9876543210" (verified_at = 2026-07-20)
User B: phone = "+91-9876543210" (verified_at = NULL)  ← Unverified duplicate

Contact "Mom" linked to User A via phone match
Wishlist shared with Contact → User B gets access (wrong person!)
```

---

## Root Causes

### 1. Phone Normalization Issues
- Raw input: `9876543210`, `+91-9876543210`, `00919876543210`, `09876543210`
- Inconsistent normalization leads to hash mismatches
- **Solution:** Always normalize to E.164 format before storing

### 2. No Unique Constraint on Verified Phones
- `profiles.phone_e164` and `profiles.phone_hash` lack uniqueness enforcement
- Database allows multiple verified phones
- **Solution:** Add conditional unique constraint

### 3. Manual Contact Linking Bypasses Validation
- `contact_user_links` created without phone verification
- Can link contact to any arbitrary user
- **Solution:** Require phone match or admin approval

### 4. Deleted Accounts Leave Orphaned Links
- Cascading deletes may not clean up all related records
- Old `contact_user_links` may point to deleted users
- **Solution:** Add cascade delete verification

---

## Current Safeguards (In Place)

✅ **Phone normalization function** (20260620_phone_identity_bridge.sql)
```sql
normalize_phone_e164(raw_phone, default_country_code = '91')
```
Standardizes all formats to `+CC_DIGITS`

✅ **Phone hash function** for de-duplication
```sql
phone_hash_from_e164(e164_phone)
```
Uses SHA256(phone + pepper) for consistent hashing

✅ **RLS policies on contact_user_links**
- Only creator can see/manage their contact links
- Shared users can only see what's explicitly shared

✅ **Cascade delete on wishlists**
- Deleting wishlist auto-removes all shares
- Deleting user removes all their wishlists

---

## Immediate Solutions for Existing Duplicates

### Solution 1: Detect Duplicate Phones (Read-Only Query)

**Purpose:** Find all verified phones with duplicates

```sql
-- Find duplicate verified phones
SELECT 
  phone_e164,
  phone_hash,
  COUNT(*) as count,
  ARRAY_AGG(id ORDER BY created_at) as user_ids,
  ARRAY_AGG(full_name ORDER BY created_at) as names
FROM public.profiles
WHERE phone_verified_at IS NOT NULL 
  AND phone_e164 IS NOT NULL
GROUP BY phone_e164, phone_hash
HAVING COUNT(*) > 1
ORDER BY count DESC;
```

**Expected Output:**
```
phone_e164    | phone_hash | count | user_ids               | names
+919876543210 | abc123...  | 2     | [uuid1, uuid2]        | [User A, User B]
+919111111111 | def456...  | 3     | [uuid3, uuid4, uuid5] | [User C, User D, User E]
```

---

### Solution 2: Find Broken Contact Links

**Purpose:** Identify which contact mappings point to deleted/duplicate users

```sql
-- Find contact_user_links with dead references
SELECT 
  cul.id,
  cul.owner_user_id,
  cul.contact_id,
  c.name as contact_name,
  cul.linked_user_id,
  p.phone_e164 as linked_user_phone,
  p.phone_verified_at,
  cul.created_at,
  CASE 
    WHEN p.id IS NULL THEN 'DELETED_USER'
    WHEN p.phone_verified_at IS NULL THEN 'UNVERIFIED'
    ELSE 'VALID'
  END as status
FROM public.contact_user_links cul
LEFT JOIN public.contacts c ON c.id = cul.contact_id
LEFT JOIN public.profiles p ON p.id = cul.linked_user_id
WHERE p.id IS NULL 
   OR p.phone_verified_at IS NULL
   OR p.phone_e164 IS NULL
ORDER BY cul.created_at DESC;
```

---

### Solution 3: Manual Deduplication (Merge Approach)

**When User A and User B have same phone:**

#### Step 1: Identify the "primary" user (keep this one)
- Usually the one with earliest verified date
- Or the one with active wishlists

```sql
SELECT id, email, full_name, phone_verified_at, created_at
FROM public.profiles
WHERE phone_e164 = '+919876543210'
ORDER BY phone_verified_at ASC NULLS LAST, created_at ASC;
```

#### Step 2: Reassign all contact links to primary user

```sql
-- Primary: uuid1, Duplicate: uuid2
UPDATE public.contact_user_links
SET linked_user_id = 'uuid1-primary'
WHERE linked_user_id = 'uuid2-duplicate'
  AND (owner_user_id, contact_id) NOT IN (
    SELECT owner_user_id, contact_id
    FROM public.contact_user_links
    WHERE linked_user_id = 'uuid1-primary'
  );
```

#### Step 3: Reassign all wishlists to primary user

```sql
UPDATE public.wishlists
SET owner_id = 'uuid1-primary'
WHERE owner_id = 'uuid2-duplicate';
```

#### Step 4: Verify no conflicts, then delete duplicate user

```sql
-- Backup duplicate user info first!
DELETE FROM auth.users WHERE id = 'uuid2-duplicate';
```

---

### Solution 4: Audit Trail for Recently Created Duplicates

**Purpose:** Find suspiciously new accounts with existing phone numbers

```sql
-- Find profiles created in last 7 days with phone matching older accounts
SELECT 
  newer.id as new_user_id,
  newer.email,
  newer.full_name,
  newer.phone_e164,
  newer.created_at,
  older.id as existing_user_id,
  older.email as existing_email,
  older.created_at as existing_since,
  (newer.created_at - older.created_at) as age_difference
FROM public.profiles newer
JOIN public.profiles older ON older.phone_e164 = newer.phone_e164
  AND older.id < newer.id  -- Different users
  AND older.phone_verified_at IS NOT NULL
WHERE newer.created_at > NOW() - INTERVAL '7 days'
  AND newer.phone_e164 IS NOT NULL
ORDER BY newer.created_at DESC;
```

---

## Long-Term Prevention Strategies

### Strategy 1: Add Unique Constraint (Recommended)

**Deploy to Supabase:**

```sql
-- Add unique constraint on verified phones only
ALTER TABLE public.profiles
ADD CONSTRAINT uq_profiles_verified_phone
UNIQUE (phone_e164) WHERE phone_verified_at IS NOT NULL;

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_verified_phone
ON public.profiles(phone_e164)
WHERE phone_verified_at IS NOT NULL;
```

**Impact:**
- ✅ Prevents any new phone duplicates
- ⚠️ May fail if duplicates already exist (run cleanup first!)
- ✅ No performance penalty (conditional index)

---

### Strategy 2: Phone Verification Workflow Enhancement

**Current:** Email-based auth, phone optional  
**Enhanced:**

```typescript
// On phone update in app:
1. Normalize phone to E.164
2. Check if phone already verified by another user
   - If YES: Show error "This phone is already registered"
   - If NO: Send verification SMS/OTP
3. On OTP verification: Set phone_verified_at = NOW()
4. Database trigger fires to auto-link contacts
```

---

### Strategy 3: Require Explicit Phone Linking for Contacts

**Current:** Auto-link based on phone match  
**Enhanced:**

```sql
-- Require explicit confirmation before linking
CREATE TABLE IF NOT EXISTS public.contact_link_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  linked_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

-- User must approve before contact link is active
ALTER TABLE public.contact_user_links
ADD COLUMN verified_at timestamptz;
```

---

### Strategy 4: Phone Verification on Contact Creation

**Current:** Contact phone = raw user input  
**Enhanced:**

```typescript
// When creating contact:
1. Validate phone format with libphonenumber-js
2. Normalize to E.164
3. Check if phone matches any verified user (with permission)
   - If match found: Ask user "Is this YOUR contact or THEIR wishlist?"
   - If no match: Show "Phone is not registered yet, manual add only"
```

---

### Strategy 5: Regular Audit Reports

**Monthly Email to Admin:**

```sql
-- Monthly duplicate detection
WITH duplicates AS (
  SELECT 
    phone_e164,
    COUNT(*) as count,
    ARRAY_AGG(email) as emails
  FROM public.profiles
  WHERE phone_verified_at IS NOT NULL
  GROUP BY phone_e164
  HAVING COUNT(*) > 1
)
SELECT 'ALERT: Found ' || COUNT(*) || ' duplicate phone numbers'
FROM duplicates;
```

---

## Implementation Roadmap

| Phase | Action | Timeline | Risk | 
|-------|--------|----------|------|
| **1 (Current)** | Deploy unique constraint + cleanup script | Immediate | Low if run on backup first |
| **2** | Add phone verification UI to app | Sprint 1 | Medium (UX change) |
| **3** | Implement contact link requests | Sprint 2 | Low (opt-in feature) |
| **4** | Add monthly audit email | Sprint 2 | None (reporting only) |
| **5** | Deprecate auto-linking (with 30-day notice) | Sprint 3 | Medium (breaking change) |

---

## Quick Reference - SQL Commands

### 1. Check Current Status
```sql
-- How many duplicates exist NOW?
SELECT COUNT(*) as duplicate_count
FROM (
  SELECT phone_e164 FROM public.profiles
  WHERE phone_verified_at IS NOT NULL
  GROUP BY phone_e164 HAVING COUNT(*) > 1
) x;
```

### 2. Show Duplicates by Phone
```sql
-- List all duplicates with details
SELECT 
  p.id, p.email, p.full_name, p.phone_e164,
  COUNT(*) OVER (PARTITION BY p.phone_e164) as total_with_this_phone
FROM public.profiles p
WHERE p.phone_verified_at IS NOT NULL
  AND p.phone_e164 IN (
    SELECT phone_e164 FROM public.profiles
    WHERE phone_verified_at IS NOT NULL
    GROUP BY phone_e164 HAVING COUNT(*) > 1
  )
ORDER BY p.phone_e164, p.created_at;
```

### 3. Deploy Unique Constraint (Safe)
```sql
-- Step 1: Create constraint (may fail if duplicates exist)
ALTER TABLE public.profiles
ADD CONSTRAINT uq_profiles_verified_phone
UNIQUE (phone_e164) WHERE phone_verified_at IS NOT NULL;

-- Step 2: If failed, identify which duplicate to delete
-- Use Solution 3 above to manually resolve
```

### 4. Verify Fix Applied
```sql
-- Constraint should exist
SELECT constraint_name
FROM information_schema.constraint_table_usage
WHERE constraint_name = 'uq_profiles_verified_phone';
```

---

## Emergency Recovery Steps

**If duplicate caused data loss or incorrect sharing:**

1. **Identify the incident:**
   ```sql
   SELECT * FROM public.contact_user_links
   WHERE linked_user_id IN (
     SELECT id FROM public.profiles
     WHERE phone_e164 = '+919876543210'
   )
   ORDER BY created_at DESC LIMIT 20;
   ```

2. **Find affected wishlists:**
   ```sql
   SELECT * FROM public.wishlist_shares
   WHERE shared_with_user_id IN (
     SELECT id FROM public.profiles
     WHERE phone_e164 = '+919876543210'
   )
   ORDER BY created_at DESC;
   ```

3. **Restore correct links from backups** (Supabase dashboard)

4. **Notify affected users** with explanation + timeline

---

## Monitoring & Alerts

**Add to monitoring dashboard:**

```sql
-- Alert if any new duplicates appear
SELECT 
  'DUPLICATE_PHONES' as alert_type,
  COUNT(*) as affected_users,
  NOW() as detected_at
FROM (
  SELECT phone_e164 FROM public.profiles
  WHERE phone_verified_at IS NOT NULL
  GROUP BY phone_e164 HAVING COUNT(*) > 1
) x;
```

---

## References

- **Phone normalization:** `20260620_phone_identity_bridge.sql`
- **Contact linking:** `20260620_step1_step2_connections_sharing.sql`
- **Sharing policy:** `20260723_wishlist_items_shared_policy.sql`
- **Contact mapping RPC:** `20260722_get_contacts_on_app.sql`

---

## Related Issues

- [ ] Implement unique constraint on `profiles.phone_e164`
- [ ] Add phone verification UI to mobile app
- [ ] Create monthly duplicate detection job
- [ ] Add audit logging for contact link changes
- [ ] Delete test duplicate account (4be6e8f7-...)

