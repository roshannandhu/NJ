# NJ India — phone app (React Native / Expo)

The native phone app. It talks to the **same cloud backend** as the PC web app,
so quotations, warranties and catalogue changes stay in sync automatically (one
database; the app polls `/api/sync/version` and refreshes when anything changes).

## What's here (Phase 3 scaffold)
- **Login** with a configurable server address (your deployed cloud URL) — token
  is saved so you stay signed in.
- **Bottom tabs:** Quotations, Warranties, Account.
- **Live sync:** lists auto-refresh within ~5s when another device makes a change;
  pull-to-refresh too.

Read-only views first (list quotations/warranties). Creating quotations + PDF
generation on the phone are the next increment — see "Roadmap" below.

## Run it (development)
Prerequisites: Node.js, and the Expo Go app on your phone (App Store / Play Store).

```
cd mobile
npm install
npx expo start
```
Scan the QR code with Expo Go. On the login screen, enter:
- **Server address:** your deployed URL (e.g. `https://nj-india-api.onrender.com`)
  — to test against a PC on the same WiFi instead, use `http://<PC-LAN-IP>:8000`
  and run the backend with `--host 0.0.0.0`.
- **Username / password:** the cloud admin you created at deploy time.

> The backend must be reachable from the phone. The cloud deployment already
> allows cross-origin requests (`CORS allow_origins=["*"]`).

## Build a real store app (Phase 4)
Uses Expo Application Services (EAS):
```
npm install -g eas-cli
eas login
eas build -p android        # produces an .aab for Google Play
eas build -p ios            # needs a Mac + Apple Developer account
```
Then submit via `eas submit` / the store consoles.

## Roadmap (next increments)
1. Quotation **create** flow (catalogue browse → cart → save) against the cloud API.
2. **PDF** generation/share with `expo-print` + the native share sheet, reusing
   the desktop document layout.
3. Catalogue + settings screens.
4. Push notifications on new records (optional).
