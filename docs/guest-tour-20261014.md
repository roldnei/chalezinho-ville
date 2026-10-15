# Guest journey review — 14 October 2026

Production baseline: c46909aa966c30c4313690e692ecc0f49d9338d9.
Scope: guest-facing pages, signup, account, Trips and WhatsApp consultation. Review is **in progress**, not a completed authenticated end-to-end test.

## Confirmed in the live browser

- Trips offer → Ville Amore, 3–5 November 2026, two guests: R$1,151.00 preserved through the consultation and generated WhatsApp message. Message was not sent.
- Date changes → 10–12 November: expired offer correctly rejected. “Ver somente hospedagem” returned available lodging and opened Ville Essenza at R$1,157.00.
- All three chalet detail pages inspected, including asynchronously loaded offer and amenity sections.
- Signup screen displays an irrelevant PagBank warning in the WhatsApp release.
- “Other dates” (`mode=stay`) unexpectedly reopened the previous consultation.
- Privacy and hosting document links fail. Public endpoint returns `booking_terms_unavailable`. Production policy_documents lacks published_by (selected by handler); all three booking document types exist only as drafts. Do not make drafts public as a technical workaround.

## Changes in this revision

- Chalet names on home are headings, eliminating the duplicate detail-page button.
- Hide online-payment identification notice only in WhatsApp release.
- Remove the single-option Escapada selector and repeated quote countdown note from WhatsApp consultation.
- After preparing the WhatsApp link, replace the previous continuation button with the actual opening action; restore continuation on invalidation.
- Lodging-only offer copy no longer exposes pricing-provider implementation details or promises a prepared experience.
- Static chalet copy agrees with WhatsApp finalization before dynamic scripts load.
- Explicit fresh dates and incompatible chalet/offer entries do not restore stale consultation; search dates/guest count are retained in URL for valid refresh.

## Validation

- Auth/confirmation/guest release/public consultation: 24 tests passed before the additional navigation fix.
- Public consultation and stay-offer UI: 19 tests passed after navigation fix, including stale-selection regression and price-change reconfirmation.
- Account and Trips mobile browser suites: 9 tests passed. These use isolated fixtures, not a real new production user.
- Syntax checks passed for the initial changes; final syntax/diff checks run before commit.

## Outstanding

- Real signup, delivery, email-link opening and authenticated account/avatar review require a test mailbox and user participation for credential creation in the cloud browser. No new production user created or email sent in this tour yet.
- Resolve document schema mismatch and review/publish the intended document versions separately. Draft text must not silently become binding production content.
- Physical Android/iOS mail-client behavior remains unverified.
