# Citadel Wire custom Nostr protocol

## Kind 3927: Page view counter update

This project uses custom regular event kind `3927` to publish approximate page view counter updates.

### Purpose
- Record a visitor-observed page view total for a specific page.
- Allow the app to query only the most recent events instead of scanning the full event history.
- Derive a display count by reading the 10 most recent events, filtering outliers, and using the highest remaining total.

### Event shape
```json
{
  "kind": 3927,
  "content": "123",
  "tags": [
    ["d", "com.citadelwire.page-views.home"],
    ["u", "https://wire.shakespeare.wtf/"],
    ["t", "view-count"],
    ["t", "citadel-wire"],
    ["alt", "Page view counter update for com.citadelwire.page-views.home"]
  ]
}
```

### Required fields
- `content`: a base-10 non-negative integer string representing the observed total.
- `d` tag: page identifier.
- `u` tag: canonical page URL.
- `alt` tag: human-readable description per NIP-31.

### Query strategy
Query relays for the 10 most recent kind `3927` events filtered by the `d` tag for the page identifier.

### Aggregation strategy
1. Parse integer totals from the most recent events.
2. Remove statistical outliers using an interquartile-range filter.
3. If the sample is extremely flat, keep only totals close to the median.
4. Display the highest remaining total.

### Notes
- This counter is approximate, not authoritative.
- Because Nostr is permissionless, totals may still be influenced by malicious or concurrent publishers.
- The outlier filter reduces obvious bad data but does not guarantee perfect accuracy.

---

## Kind 9703: CITADEL WIRE supporter donation record

This project uses custom regular event kind `9703` to record one confirmed supporter donation.

### Purpose
- Provide an append-only audit record for identified donations.
- Allow clients to aggregate identified donations into Top Supporters rankings.
- Preserve optional donor identity: anonymous donations are valid payments but are not included in the public leaderboard.

### Event shape
```json
{
  "kind": 9703,
  "content": "",
  "tags": [
    ["p", "<supporter-pubkey-hex>"],
    ["amount", "25000000"],
    ["bolt11", "<paid-bolt11-invoice-or-normalized-payment-key>"],
    ["currency", "msat"],
    ["t", "citadel-wire"],
    ["t", "supporter-donation"],
    ["alt", "CITADEL WIRE confirmed supporter donation of 25000 sats"]
  ]
}
```

### Required fields
- `p` tag: the 64-character hex pubkey of the supporter.
- `amount` tag: the donation amount in millisatoshis.
- `bolt11` tag: normalized invoice/payment key used for deduplication.
- `currency` tag: must be `msat`.
- `alt` tag: human-readable description per NIP-31.

### Notes
- These records may be aggregated directly for display ranking.
- Clients should deduplicate records by normalized `bolt11` value when summing totals.
- Because Nostr is permissionless, this model is trust-minimized rather than authoritative; it is designed for this site's donation flow and may include user-published records.

---

## Kind 36497: CITADEL WIRE cumulative supporter total

This project uses custom addressable event kind `36497` to publish one cumulative supporter total per supporter.

### Purpose
- Provide a simple, reliable Top Supporters query.
- Avoid recalculating totals from raw zap receipts on every page load.
- Allow any publisher to publish a precomputed cumulative total for a supporter.
- Let clients prefer the latest addressable total per supporter while still being able to fall back to aggregating kind `9703` donation records.

### Event shape
```json
{
  "kind": 36497,
  "content": "",
  "tags": [
    ["d", "<supporter-pubkey-hex>"],
    ["p", "<supporter-pubkey-hex>"],
    ["amount", "25610000"],
    ["currency", "msat"],
    ["donations", "2"],
    ["last_payment_at", "1777130000"],
    ["name", "MAV21"],
    ["display_name", "MAV21"],
    ["picture", "https://m.primal.net/NIJT.jpg"],
    ["t", "citadel-wire"],
    ["t", "supporter-total"],
    ["alt", "CITADEL WIRE cumulative supporter total"]
  ]
}
```

### Required fields
- `d` tag: supporter pubkey. This makes the event replaceable per supporter.
- `p` tag: supporter pubkey. Must match `d`.
- `amount` tag: cumulative amount in millisatoshis.
- `currency` tag: must be `msat`.
- `picture` tag: supporter avatar URL used by the leaderboard.
- `alt` tag: human-readable description per NIP-31.

### Optional fields
- `donations`: total number of confirmed identified donations.
- `last_payment_at`: Unix timestamp of the latest counted donation.
- `name`: supporter profile name.
- `display_name`: supporter display name.

### Query strategy
Top Supporters queries relays for both cumulative total events and donation record events:

```json
{
  "kinds": [36497, 9703],
  "#t": ["supporter-total", "supporter-donation"],
  "limit": 500
}
```

### Validation strategy
1. For kind `36497`, require `d`, `p`, and `amount` tags.
2. Require `d` to equal `p`.
3. Parse `amount` as millisatoshis.
4. Keep only the latest kind `36497` event per supporter pubkey.
5. If no kind `36497` total exists for a supporter, aggregate their kind `9703` records by summing deduplicated `amount` tags.
6. Fetch profile metadata separately and only display supporters with a profile picture.
7. Sort by total sats descending.

### Notes
- Nostr is permissionless. This relaxed model does not require a single trusted leaderboard publisher.
- Anonymous donations are not represented in kind `36497` because there is no supporter pubkey to rank.
- Updating a supporter total replaces the previous total for that supporter because kind `36497` is addressable by publisher + kind + `d` tag.

---

## Legacy kind 9633: Supporter donation record

Kind `9633` was previously used by this project for self-reported supporter donation records.

### Status
Deprecated. New implementations should use kind `9703` for donation records and kind `36497` for cumulative totals.

### Notes
- Kind `9633` events were self-reported and not authoritative.
- Because anyone could publish them, they must not be used for the public leaderboard without additional trust filtering.
