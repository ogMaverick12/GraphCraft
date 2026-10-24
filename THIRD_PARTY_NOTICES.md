# Third-party notices

GraphCraft itself is MIT: Copyright (c) 2026 ogMaverick12. See `LICENSE`.
No third-party code is vendored into `src/`; the production bundle does
include third-party packages, which are attributed in the generated
distribution notices.

## Authoritative production notices

`dist/THIRD_PARTY_NOTICES.txt` is the authoritative third-party inventory for
the shipped application. It is generated during `npm run build` from the
actual Rollup module graph and the installed package licence files. It records
exact package versions and reproduces the complete local licence texts,
including the mathjs `NOTICE` and both the Lucide ISC and Feather-derived MIT
notices. `dist/LICENSE` is a byte-for-byte copy of the root project licence;
`dist/LICENSE.txt` carries the same bytes so the user-facing status-bar link
always has an unambiguous text MIME type on ordinary static hosts.

Do not maintain a second package/version table here. The maintainable mapping
is `scripts/notices.mjs`; versions and licence texts are read from
`package-lock.json` and `node_modules` at build time so the inventory cannot
silently drift. A bundled package without a mapping, a missing licence or
notice file, a version mismatch, or a dev-only package in production output
fails the build.

## Classification notes

- `tailwindcss` is a direct production dependency used at build time to
  generate the shipped CSS. It is not emitted as a runtime JavaScript module;
  its complete MIT text is still included in the notice bundle as a
  conservative attribution measure.
- `@tailwindcss/vite` is a devDependency only. It is not included in the
  distribution notices or the production bundle.
- `lucide-react` supplies the UI icon components. Its package licence combines
  the ISC licence with the MIT notice for Feather-derived portions; both are
  reproduced unchanged in the generated notice bundle.
- `mathjs` is Apache-2.0. Its full licence and package `NOTICE` are reproduced
  unchanged in the generated notice bundle.

## Validation

- `npm run build` generates `dist/LICENSE`, the byte-identical
  `dist/LICENSE.txt` alias, and `dist/THIRD_PARTY_NOTICES.txt`, or fails with a
  specific package/file error.
- `npm run notices:check` verifies both project-licence copies, required files,
  package metadata and full texts, and that the notice text is identical to a
  fresh deterministic render.
- `.github/workflows/quality.yml` runs the distribution check after the
  production build, then verifies the served notice files' bytes and text MIME
  types in the preview smoke.
- `node scripts/check-licenses.mjs` remains the separate direct-dependency
  allowlist guard; it does not replace the generated distribution inventory.

## Provenance and open questions

- The application favicon and Learn templates are project-authored, with no
  listed third-party asset source; this is an assertion, not an independently
  verifiable provenance record.
- No third-party font files or remote font imports are present. `Inter` is a
  CSS family name with system fallbacks.
- `docs/a11y/lighthouse.html` is a generated Lighthouse report carrying an
  Apache-2.0 notice header. It is not part of `dist/`. If documentation is
  distributed separately, include the applicable Lighthouse notice with it.
- The full lockfile contains dev-only MPL-2.0 entries (mainly `lightningcss`);
  these are not in the production bundle. No GPL/AGPL dependency was found.
- Including the Tailwind MIT text does not resolve the separate legal question
  about copyright in generated CSS. This document and the generated bundle are
  technical attribution records, not legal advice or a compliance
  certification.
