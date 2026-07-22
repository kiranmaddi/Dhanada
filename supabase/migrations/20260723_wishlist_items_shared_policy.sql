-- Allow viewing wishlist items from wishlists shared with current user
CREATE POLICY "wishlist_items_select_shared"
ON public.wishlist_items
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.wishlist_shares ws
    WHERE ws.wishlist_id = wishlist_items.wishlist_id
    AND ws.shared_with_user_id = auth.uid()
    AND ws.is_active = true
  )
);
