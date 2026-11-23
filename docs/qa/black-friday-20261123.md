# Black Friday display — 23 November 2026

Home adds a prominent Black Friday link to the existing date showcase. Every available chalet showcase card carries a corner photo stamp and a separate -15% badge in the card's free area. Ville Moments escape cards use the same stamp. Both apartment catalog cards and their date suggestion cards also carry the campaign.

This release changes presentation only: no quote arithmetic, commercial payment terms, rates, database records, reservations, channel feeds or payment integrations were modified. Existing quote totals and booking link parameters are preserved.

The Ville Moments opening catalog explicitly orders CH1, CH2, CH3, AP_CENTRO and AP_MORRO. The opening photo remains on Signature until the visitor selects a property or starts playback. Chalet choices occupy the first row; apartment buttons occupy the second, with shorter labels and their dedicated property URLs.

Validation: 19 tests passed (intro, escape feed, apartment mobile gallery/showcase and lodging-only PMS). Updated existing test fixtures to include the current price presentation dependency and explicit feed entry. Production-profile build passed. Browser review at 390px confirmed the home CTA, showcase photo stamp and separate discount, the full Moments escape stamp, readable property choices, and campaign stamps on both apartments. The first 24–26 November quotes remained R$1,549.70 / R$1,194.40 / R$1,281.80 in cash, matching the supplied reference.

No automatic campaign expiration was configured.

## Photo layout correction

Replaced the two separate promotional boxes with one compact badge. The three-chalet layout reserves the existing copy area; wide-photo cards place the badge beside the price. Period columns no longer stretch each other's photo rows. Cards with one or two chalets retain a consistent 3:4 portrait photo area while keeping the configured image zoom and object position.

Browser review at 390px: photos are 296 × 394.66px for both one- and two-chalet periods; three-chalet thumbnails remain 88 × 126px. Badge height is 48.64px, with no price overlap in the 17 rendered cards. The same Essenza photo was visually checked in both wide layouts. All 12 showcase tests passed, including dates, values, links and availability. No price or calendar changes.
