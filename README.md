# Wardrobe COO

Native Android app (Kotlin + Jetpack Compose) for Sacha's Pixel 7. Picks one outfit a day, logs it on one tap, keeps the closet in order.

## Install
Every push to `main` builds a signed APK and publishes it under **Releases**. On the Pixel, open the latest release in Chrome and tap the `.apk`. New versions install over old ones and keep your data.

## Phases
1. **Core loop** (this release): Today, daily pick, OK / Swap / Undo, tap a tile to swap one piece, Closet grid with search, filters and sort, item detail, camera add with batch review.
2. **Smart**: Gemini auto-tagging (photo + care label), weather, Google Calendar, evening line.
3. **Extras**: Profile, Ask sheet, quarterly closet check, fit check, home-screen widget.

## Data
Everything lives on the phone (`wardrobe.json` plus photos) and is included in Android's backup to your Google account.

## Signing
Builds are signed with `app/debug.keystore` (a standard debug key) so each update installs over the last. To switch to a private release key, add repo secrets `KEYSTORE_B64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`; note that changing keys requires one uninstall.
