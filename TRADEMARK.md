# Caputchin trademark and brand-usage guidelines

This file is a copy of the canonical guidelines published at <https://caputchin.com/legal/trademark>.

**Status:** "Caputchin" is currently an unregistered mark, claimed under common law via continuous use in commerce. Wordmark registration in EU + US is planned but has not been filed yet. Today, our enforcement layer is common-law trademark + these guidelines. We can send cease-and-desist letters and file platform takedowns; we cannot yet point to a registration certificate.

## Underlying principle

Trademark protects users from being misled about who builds and operates Caputchin. It does not give Caputchin veto over every use of the word "caputchin". The distinguishing line throughout these guidelines is between **marketed product names** (what a reasonable user reads as the brand of the thing they're using) and **code identifiers** (npm package names, GitHub repo names, CLI binary names — read by developers who already know they are picking a third-party tool). Marketed product names that incorporate "Caputchin" risk implying first-party origin; code identifiers that incorporate "caputchin" are fine when they're plainly third-party.

## Marks covered

The following are marks of Caputchin (claimed under common law; registration pending):

| Mark | Form |
|---|---|
| `Caputchin` | Wordmark — the name of the product. |
| The capuchin-monkey logo | Figurative mark. |
| `@caputchin` | npm scope under which Caputchin first-party packages publish. |
| `caputchin/caputchin` | Terraform Registry and OpenTofu Registry namespace for the official provider. |
| `caputchin-game` | GitHub topic that gates marketplace discovery. |
| `caputchin.com` and subdomains | Primary product domain. |

Stylized writing (`caputchin`, `CAPUTCHIN`, `Caputchin.com`) all refer to the same mark. References below to "the marks" mean all of them.

## What you can do without asking

You do not need permission for any of the following:

- **Factual reference.** Calling Caputchin by name when describing what it is, comparing it to alternatives, writing tutorials, posting screenshots, or referencing the product in blog posts, talks, papers, or social media. Trademark law does not restrict accurate factual use.
- **Integration attribution.** Adding "powered by Caputchin", "uses Caputchin", "Caputchin-compatible", "works with Caputchin", or "integrates with Caputchin" to a product, page, or README, provided the description is accurate. Linking the attribution to <https://caputchin.com> is encouraged.
- **Source-redistribution attribution.** Preserving copyright lines, license headers, and `TRADEMARK.md` files when redistributing source code under our licenses.
- **Code identifiers — third-party packages, repos, and CLI commands.** Third-party plugins, extensions, helpers, adapters, and tools may use "caputchin" in their npm package name, GitHub repository name, or CLI binary name when all of the following are true: (a) the project is plainly third-party in its README and package description, (b) it does not claim "official", "certified", "endorsed", "by Caputchin", or similar status, (c) it does not publish under the `@caputchin` npm scope (locked to first-party), and (d) it does not adopt the capuchin-monkey logo as its primary branding. Examples permitted: `caputchin-react-helper`, `terraform-provider-caputchin-experimental`, `caputchin-stripe-bridge`, the GitHub repo `johndoe/caputchin-redis-adapter`. A brief non-affiliation note in the README (`"Not affiliated with or endorsed by Caputchin."`) is requested but not legally required.
- **Plugin and tooling naming, suffix and descriptive forms.** Naming a third-party plugin or tool `X for Caputchin`, `X (Caputchin)`, `X — Caputchin integration`, `X — works with Caputchin`, or `X — compatible with Caputchin`. The third-party name comes first; "Caputchin" appears only as a descriptor of what the plugin connects to.
- **Game publishing.** Publishing a game to the Caputchin marketplace, including using the `caputchin-game` GitHub topic and the `caputchin.json` manifest schema.
- **Forking this repo as a starter template** for a new game, provided the resulting game is named after itself (not as a "Caputchin" product) and any "Caputchin" attribution in the README refers to the platform the game targets, not to authorship.

## What we ask you to get permission for

We ask that the following uses get our written permission first. Some are backed by trademark law and false-advertising law independently of registration status (logo modification, implying endorsement, advertising for competing products, registering confusingly similar marks); the rest are policy we are publishing now and will formalize on registration.

- **Marketed product, service, or company names that incorporate "Caputchin" or "Caputchin-*" as the brand label.** This is the case where a reasonable end user would read "Caputchin" as the source of the thing. Examples that need permission: a product marketed as `Caputchin Pro`, `Caputchin Plus`, `Caputchin Enterprise`, `Caputchin Cloud`, `Caputchin Studio`, or a company named `Caputchin Solutions Inc.`. The restriction is on the **marketing label**, not on the code identifier; a project published as the npm package `caputchin-helper` is fine (see code-identifier rule above), but marketing that same package as the product `Caputchin Helper` needs permission.
- **Standalone brand-looking domain names.** Registering `caputchin.io`, `caputchin-official.com`, `get-caputchin.com`, `caputchin-pro.com`, `caputchinclone.io`, or any domain where "caputchin" forms the primary portion of the second-level domain. Paths under third-party domains are unaffected — `johnsmith.dev/caputchin-guide`, `mysite.com/blog/caputchin-tutorial`, and similar are factual reference, no permission needed.
- **The `@caputchin` npm scope.** Reserved for first-party packages. Third-party packages publish under their own scope or as unscoped names.
- **Logo modification or appropriation as primary branding.** Distorting, recoloring, redrawing, or otherwise modifying the capuchin-monkey logo. Using the unmodified logo as the primary visual mark of a third-party product. Small "powered by Caputchin" attribution use of the unmodified logo at integration boundaries is fine without asking.
- **Implying endorsement, partnership, or official status when none exists.** Phrases like "official Caputchin partner", "certified by Caputchin", "endorsed by Caputchin", "authorized Caputchin reseller", or "Caputchin official integration" are reserved for parties Caputchin has explicitly designated.
- **Using the marks in advertising, marketing, or promotional contexts for a competing product.** Even where individual elements above would otherwise be fine, using "Caputchin" to drive comparison-shopping traffic toward a substitute CAPTCHA / verification product needs prior agreement.
- **Trademark, service mark, or domain registration** of "Caputchin" or confusingly similar variants in any jurisdiction.

The MIT license under which this code is distributed grants no rights to use the marks. Trademark rights are separate from copyright and the MIT license is silent on them.

## Code identifier vs marketed product name — disambiguation

The distinction is the surface a reasonable user reads as "the brand of this product":

| Surface | Treated as | Example |
|---|---|---|
| npm package name | Code identifier | `caputchin-react-helper` — fine |
| GitHub repo name | Code identifier | `johndoe/caputchin-stripe-bridge` — fine |
| CLI binary name | Code identifier | `caputchin-deploy` (third-party tool) — fine |
| README title / hero text / marketing label | Marketed product name | "Caputchin Stripe Bridge" as a product brand — please ask; "stripe-bridge for Caputchin (third-party)" — fine |
| Logo / favicon / wordmark used as primary branding | Marketed product name | Adopting the capuchin-monkey logo on a landing page — please ask |
| Domain name (second-level) | Marketed product name | `caputchin-bridge.com` — please ask |

When the same project has both — e.g., npm package `caputchin-react-helper` whose README hero says "ReactCaputchinKit, a third-party helper for Caputchin" — the code identifier is fine; the README hero is a marketed name and should not lead with "Caputchin" as the product brand.

## Asking for permission

Submit requests to `legal@caputchin.com` with:

- Who you are (individual, company, project).
- The proposed use of the marks (name, context, scope, geography).
- A mockup or sample where possible.

Response target is two weeks. We say yes more often than no for honest integrations; we say no consistently for naming that risks user confusion about who builds and operates Caputchin.

## When in doubt

If the proposed use would cause a reasonable user to believe Caputchin built, operated, endorsed, or stands behind a third-party product, please ask first. If the use is plainly informational, integrative, factual, or is a code identifier in a context where the audience knows they are picking a third-party tool, go ahead — no need to ask.
