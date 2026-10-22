# Ville Moments: bandwidth review — 2026-10-22

Supabase email reports organization cached egress above its grace threshold (5.5 GB), with a grace period ending 2026-11-22. The monthly dashboard requires authentication; no exact monthly billing total was read.

The production project's last-24-hour edge log response content lengths total roughly 726 MB for Moments media (390 MB cache hits, 336 MB misses), about 95% of logged response bytes in the inspected groups. These are log-derived transfer measurements, not a billing statement. Three video objects account for about 678 MB. Mobility project logs show about 12 MB of function responses and 41 KB of edge responses in the same default 24-hour window. Development project is paused. No media was deleted and no plan was changed.

Changes:
- A timeline loads its current scene and at most the next photo. Future videos do not get a source URL until selected. The active video requests metadata so seeking and playback continue working.
- Export explicitly opts into loading all scenes; the existing export pipeline stays intact.
- Feed navigation and closing release the prior video's source and cancel pending loading.
- Individual Trip pages use preload=none; posters and schema remain available, and native video controls start playback on demand.
- New photos use a 1600-pixel maximum edge and WebP quality 0.82 instead of 1920/0.90. Existing uploaded files are unchanged.

Validation: 41 gallery/publication/timeline tests passed, JS syntax checks passed. A three-image Pillow WebP comparison of equivalent size/quality settings reduced bytes by 13.0%, 20.3% and 33.7%; browser encoder results vary. No claim is made that this is the reduction in total production egress. Runtime timeline tests cover deferred videos, seek loading, export eager loading and media release.

The main remaining opportunity is smaller streaming variants of existing uploaded videos. Keep originals private, retain author/deletion visibility checks, and measure video quality before changing delivery. The usage already counted in this billing cycle cannot be undone by these changes.
