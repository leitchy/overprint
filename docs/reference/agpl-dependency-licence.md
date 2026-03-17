# Overprint Licence: AGPL-3.0

## Summary

Overprint is licensed AGPL-3.0, matching its primary dependency `ocad2geojson`. This document explains the licence choice, what it means in practice, and compliance requirements.

**Bottom line**: Overprint is free, open-source software. The AGPL-3.0 ensures it stays that way — anyone can use, modify, and redistribute it, provided they share their source code under the same terms.

## Why AGPL-3.0?

The `ocad2geojson` library (used for OCAD file parsing) is licensed AGPL-3.0. Rather than maintain a split licensing story (MIT source + AGPL-constrained bundle), we adopted AGPL-3.0 for the whole project. This gives a single, clear licence with no ambiguity.

AGPL-3.0 is a strong copyleft licence — it ensures:
- Overprint remains free and open-source
- Forks and derivative works must also share their source
- The "network use" provision (Section 13) means even SaaS deployments must offer source access

## What AGPL-3.0 means in practice

### For users
- Use Overprint freely for any purpose (personal, commercial, educational)
- The source code is always available

### For contributors
- Contributions to Overprint are made under AGPL-3.0
- You retain copyright on your contributions but grant AGPL-3.0 rights

### For forks / derivative works
- Must be distributed under AGPL-3.0 (or a compatible licence)
- Must make source code available
- Must preserve copyright and licence notices

### The "network use" provision
AGPL-3.0 Section 13 extends copyleft to network use: if someone runs a modified version as a web service, users of that service must be offered the source.

For Overprint specifically:
- Overprint is a **client-side application** — all code runs in the user's browser
- Hosting Overprint on a static CDN counts as *distribution*, not network use — standard source-availability rules apply
- The network-use clause would matter if someone built a server-side fork that processed OCAD files as a service

## Dependency licence compatibility

All current dependencies are AGPL-3.0 compatible:

| Dependency | Licence | Compatible? |
|---|---|---|
| React, React DOM | MIT | Yes |
| Zustand | MIT | Yes |
| Konva, react-konva | MIT | Yes |
| PDF.js (pdfjs-dist) | Apache-2.0 | Yes |
| pdf-lib | MIT | Yes |
| immer | MIT | Yes |
| ocad2geojson | AGPL-3.0 | Yes (same licence) |

Licences compatible with AGPL-3.0 (safe to add as dependencies):
- MIT, BSD 2-Clause / 3-Clause, ISC
- Apache-2.0
- LGPL-2.1 / LGPL-3.0
- GPL-3.0
- AGPL-3.0

**Watch out for**: GPL-2.0-only (not compatible with AGPL-3.0), proprietary/commercial licences, SSPL.

## Compliance checklist

- [ ] `LICENSE` file at repo root contains full AGPL-3.0 text
- [ ] `package.json` has `"license": "AGPL-3.0-only"`
- [ ] Include AGPL-3.0 licence notice in built output (configure Vite `rollup-plugin-license` or similar)
- [ ] Add "Source code" link in Overprint's UI (footer or about dialog) pointing to the GitHub repository
- [ ] Add a `THIRD-PARTY-NOTICES` file listing bundled dependencies and their licences
- [ ] Note licence in `CONTRIBUTING.md`
- [ ] Consider `license-checker` in CI to flag incompatible new dependencies

## References
- [AGPL-3.0 full text](https://www.gnu.org/licenses/agpl-3.0.en.html)
- [GNU FAQ: AGPL and linking](https://www.gnu.org/licenses/gpl-faq.html#GPLModuleLicense)
- [ocad2geojson licence](https://github.com/perliedman/ocad2geojson/blob/main/LICENSE)
- [ADR-010: OCAD support via ocad2geojson](../adrs/ADR-010-ocad-support-via-ocad2geojson.md)
