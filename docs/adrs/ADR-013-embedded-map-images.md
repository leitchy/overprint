# ADR-013: Embedded Map Images in .overprint Format

**Status:** Accepted
**Date:** 2026-03-21

## Context

The `.overprint` file format stores event metadata, courses, controls, and georeferencing data as JSON. The map image itself is loaded separately by the user. This means sharing an `.overprint` file requires also sharing the map image, and the user must load both files in the correct order.

For GPS field use, this is particularly problematic — the user needs a single file that works immediately on their phone.

## Decision

Add an optional `embeddedMapImage` field to the `.overprint` file envelope. When present, it contains the map image as a base64-encoded PNG data URL. On load, the image is automatically decoded and displayed.

### Format

```json
{
  "formatId": "overprint",
  "version": "0.1.0",
  "event": { ... },
  "embeddedMapImage": "data:image/png;base64,iVBORw0KGgo..."
}
```

### UI

- **File > Save Event** — saves without the map (lightweight, existing behaviour)
- **File > Save with Map** — renders the current map to PNG, embeds as base64

### Trade-offs

| Aspect | Without embedding | With embedding |
|---|---|---|
| File size | ~10-50 KB | ~1-15 MB (map dependent) |
| Portability | Requires separate map file | Fully self-contained |
| Share workflow | Send 2 files | Send 1 file |
| Map quality | Original resolution | Re-rendered as PNG at current resolution |
| PDF source data | Preserved in mapImageStore | Lost (PNG only) |

## Consequences

- `serializeEvent()` accepts optional `embeddedMapImage` parameter
- `deserializeEvent()` returns `{ event, embeddedMapImage }` (breaking change to return type — all callers updated)
- `loadEventFile()` auto-loads embedded image into mapImageStore
- Base64 encoding adds ~33% size overhead on top of the PNG
- For OCAD/OMAP maps, the embedded image is the rendered raster — vector data is not preserved
- Forward-compatible: older versions of Overprint will ignore the `embeddedMapImage` field
