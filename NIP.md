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

## Kind 9633: Supporter donation record

This project uses custom regular event kind `9633` to record supporter donations to the site.

### Purpose
- Record that a Nostr user donated a specific amount of sats to the site.
- Aggregate donations per pubkey to produce a ranked "Top Supporters" leaderboard.
- Published by the visitor's ephemeral key after completing a Lightning donation.

### Event shape
```json
{
  "kind": 9633,
  "content": "5000",
  "tags": [
    ["d", "com.citadelwire.supporters"],
    ["p", "<supporter-pubkey-hex>"],
    ["t", "supporter"],
    ["t", "citadel-wire"],
    ["alt", "Citadel Wire supporter donation of 5000 sats"]
  ]
}
```

### Required fields
- `content`: a base-10 positive integer string representing the donation amount in sats.
- `d` tag: site identifier (`com.citadelwire.supporters`).
- `p` tag: the 64-character hex pubkey of the supporter.
- `alt` tag: human-readable description per NIP-31.

### Query strategy
Query relays for up to 200 kind `9633` events filtered by the `d` tag for `com.citadelwire.supporters`.

### Aggregation strategy
1. Group events by the `p` tag (supporter pubkey).
2. Sum the `content` amounts for each supporter.
3. Sort by total sats descending.
4. Display the top 10.

### Notes
- The donation amount is self-reported and not cryptographically verified.
- Because Nostr is permissionless, anyone can publish fake supporter events.
- This leaderboard is approximate and trust-based.