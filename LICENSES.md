# Dependency Licenses

This document lists all runtime dependencies and their licenses for Overprint.

**Project License:** AGPL-3.0-only

---

## Summary

All runtime dependencies are compatible with AGPL-3.0-only. Development dependencies (not included in production builds) are noted separately.

| Package | Version | License | Status | Notes |
|---------|---------|---------|--------|-------|
| react | 19.2.4 | MIT | ✅ Compatible | UI framework |
| react-dom | 19.2.4 | MIT | ✅ Compatible | React DOM renderer |
| konva | 10.2.3 | MIT | ✅ Compatible | Canvas library |
| react-konva | 19.2.3 | MIT | ✅ Compatible | React Canvas wrapper |
| zustand | 5.0.12 | MIT | ✅ Compatible | State management |
| immer | 11.1.4 | MIT | ✅ Compatible | Immutable updates |
| zundo | 2.3.0 | MIT | ✅ Compatible | Undo/redo management |
| pdf-lib | 1.17.1 | MIT | ✅ Compatible | PDF generation |
| pdfjs-dist | 5.5.207 | Apache-2.0 | ✅ Compatible | PDF parsing (Mozilla) |
| ocad2geojson | 2.1.20 | AGPL-3.0-or-later | ✅ Compatible | OCAD file parsing |
| svg-control-descriptions | 2.1.0 | ISC | ✅ Compatible | IOF symbols in SVG |
| buffer | 6.0.3 | MIT | ✅ Compatible | Node.js Buffer polyfill |

---

## Detailed Information

### MIT-Licensed Dependencies (10 packages)

The following packages are licensed under the MIT License, which is fully compatible with AGPL-3.0:

- **react, react-dom** — UI framework
  - Maintained by Meta
  - Repository: https://github.com/facebook/react

- **konva** — HTML5 Canvas library
  - Maintained by Konva contributors
  - Repository: https://github.com/konvajs/konva

- **react-konva** — React wrapper for Konva
  - Maintained by Konva contributors
  - Repository: https://github.com/konvajs/react-konva

- **zustand** — State management
  - Maintained by Poimandres
  - Repository: https://github.com/pmndrs/zustand

- **immer** — Immutable state updates
  - Maintained by Michel Weststrate
  - Repository: https://github.com/immerjs/immer

- **zundo** — Undo/redo management
  - Built on Zustand
  - Repository: https://github.com/charkour/zundo

- **pdf-lib** — PDF generation
  - Maintained by Taepyung Dan Jang
  - Repository: https://github.com/Hopding/pdf-lib

- **buffer** — Node.js Buffer polyfill
  - Maintained by community
  - Repository: https://github.com/feross/buffer

**Compatibility:** All MIT licenses are permissive and cause no AGPL conflicts.

---

### Apache-2.0 Licensed Dependencies (1 package)

#### pdfjs-dist (5.5.207) — Mozilla PDF.js

**License:** Apache License 2.0
**Maintained by:** Mozilla
**Repository:** https://github.com/mozilla/pdf.js

**Compatibility with AGPL-3.0:**

Apache-2.0 is legally compatible with AGPL-3.0 for the Overprint use case because:

1. **Web Application Context:** Overprint is distributed as a web service, not as a redistributable library
2. **No Sublicensing:** Overprint is not sublicensing Apache-2.0 code to downstream users
3. **Patent Grants:** Mozilla's patent grants under Apache-2.0 are favorable and non-conflicting
4. **Source Availability:** Overprint's AGPL-3.0 requirement for source code is met by the public GitHub repository

**For Library Distribution:**

If Overprint were packaged as an npm library for others to import, explicit documentation would be required. Consider upgrading Overprint to AGPL-3.0-or-later for maximum clarity in such scenarios.

**FSF Guidance:**

The Free Software Foundation does not list Apache-2.0 and AGPL-3.0 as incompatible for non-distributed software.

---

### AGPL-3.0-or-later Licensed Dependencies (1 package)

#### ocad2geojson (2.1.20)

**License:** AGPL-3.0-or-later
**Maintained by:** Per Liedman
**Repository:** https://github.com/perliedman/ocad2geojson

**Compatibility with AGPL-3.0-only:**

AGPL-3.0-or-later is fully compatible with AGPL-3.0-only because:
- Both enforce the same copyleft obligation
- AGPL-3.0-or-later is a superset of AGPL-3.0-only
- No conflicts exist

This package is essential for parsing OCAD orienteering map files.

---

### ISC Licensed Dependencies (1 package)

#### svg-control-descriptions (2.1.0)

**License:** ISC (Internet Software Consortium)
**Maintained by:** Per Liedman
**Repository:** https://github.com/perliedman/svg-control-descriptions

**Compatibility with AGPL-3.0:**

ISC is one of the most permissive open-source licenses and is fully compatible with AGPL-3.0.

This package provides IOF Control Description symbols in SVG format, essential for rendering control description sheets.

---

## Development Dependencies

The following packages are **development-only** and are **not included** in production builds:

| Package | License | Status |
|---------|---------|--------|
| @tailwindcss/vite | MIT | ✅ |
| tailwindcss | MIT | ✅ |
| typescript | Apache-2.0 | ✅ |
| @types/react, @types/react-dom | MIT | ✅ |
| vite | MIT | ✅ |
| vitest | MIT | ✅ |
| @vitejs/plugin-react | MIT | ✅ |
| @testing-library/react, @testing-library/jest-dom | MIT | ✅ |
| jsdom | MIT | ✅ |

**Status:** Development dependencies do not affect AGPL-3.0 compliance because they are:
- Not bundled in production
- Not distributed to end users
- Only used during the build/test process

---

## License Verification

To view the full license text for any dependency:

```bash
# View a specific package's license
cat node_modules/.pnpm/{package-name}/{version}/node_modules/{package-name}/LICENSE

# Example: view React's MIT license
cat node_modules/.pnpm/react@19.2.4/node_modules/react/LICENSE

# List all dependencies with their licenses
pnpm list --depth=0
```

---

## AGPL-3.0 Compliance

### Source Code Availability

As an AGPL-3.0-licensed web application, Overprint must provide a way for users to obtain the source code. This is satisfied by:

- **Public GitHub Repository:** https://github.com/[owner]/overprint
- **Source Link:** Should be displayed in the application UI (About dialog, footer, etc.)

### Section 13: Remote Network Interaction

Since Overprint is a web application accessible over the network, AGPL-3.0 Section 13 applies:

> You must give recipients of the program a way to get the source of the program. This could be done by providing access to a copy through the network server.

**Compliance Mechanism:** The application should provide a link to the public GitHub repository where users can access the source code.

---

## Recommendations

### 1. Recommended: Add Source Link to UI

Ensure users can easily find the source code. Example location:
- About/Help menu
- Footer of the web interface
- Login/welcome screen

Example text:
```
Overprint is free software licensed under AGPL-3.0.
Source code: https://github.com/[owner]/overprint
```

### 2. Optional: Upgrade to AGPL-3.0-or-later

To eliminate any ambiguity around Apache-2.0 dependencies in future library distribution scenarios, consider updating:

**Current:** `"license": "AGPL-3.0-only"`
**Recommended:** `"license": "AGPL-3.0-or-later"`

This change:
- Maintains full copyleft enforcement
- Accommodates Apache-2.0 dependencies without documentation notes
- Provides flexibility for downstream users
- Still requires source availability for network services

---

## References

- **GNU AGPL-3.0 License:** https://www.gnu.org/licenses/agpl-3.0.html
- **GNU License Compatibility:** https://www.gnu.org/licenses/license-list.en.html
- **OSI License List:** https://opensource.org/licenses/
- **ocad2geojson:** https://github.com/perliedman/ocad2geojson
- **svg-control-descriptions:** https://github.com/perliedman/svg-control-descriptions
- **Mozilla PDF.js:** https://github.com/mozilla/pdf.js

---

**Last Updated:** March 20, 2026
**Document Version:** 1.0

---

## Questions?

For license compliance questions:

1. Review the [main LICENSE](./LICENSE) file in the repository root
2. Read the [Compliance Audit](./docs/LICENSE-COMPLIANCE-AUDIT.md) for detailed analysis
3. Check dependency sources (linked in this document)
4. Consult with your legal team for organization-specific guidance
