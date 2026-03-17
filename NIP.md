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
