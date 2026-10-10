# FARM password reset email setup

Password-reset requests are handled by the NestJS API on Render. Firebase
Authentication generates the one-time reset link, and the backend sends it
through GoDaddy SMTP. The Firebase reset page in the app verifies and consumes
the reset code, then synchronizes the new password to the FARM backend.

## Render environment

Set these on the `farm-backend` Render service. Store credential values in
Render's environment settings; do not commit them to this repository.

| Variable | Value |
| --- | --- |
| `SMTP_HOST` | `smtpout.secureserver.net` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | `support@farmapp.africa` |
| `SMTP_PASS` | GoDaddy mailbox password |
| `SMTP_FROM` | `FARM Support <support@farmapp.africa>` |
| `FIREBASE_PROJECT_ID` | Firebase project ID |
| `FIREBASE_CLIENT_EMAIL` | Service-account client email |
| `FIREBASE_PRIVATE_KEY` | Service-account private key; preserve newlines or use `\n` |
| `FIREBASE_PASSWORD_RESET_CONTINUE_URL` | `https://farmapp-e2145.firebaseapp.com/admin-reset-password` |

Port 465 uses implicit SSL/TLS. Make sure the mailbox permits SMTP relay.

## Firebase and app links

1. In Firebase Console, confirm Email/Password is enabled and
   `farmapp-e2145.firebaseapp.com` is an authorized domain.
2. Confirm the Android application ID `farmapp.africa` and iOS bundle ID
   `com.mycompany.farm` match the registered Firebase applications. Add the
   Android signing certificate SHA-1 and SHA-256 fingerprints in Firebase
   project settings.
3. Enable Firebase Hosting links for those registered apps. The Android
   manifest already accepts the Firebase action-link host. The iOS Runner
   entitlement includes `applinks:farmapp-e2145.firebaseapp.com`; verify that
   the domain's Apple App Site Association file advertises
   `com.mycompany.farm` before testing iOS Universal Links.
4. The app validates the one-time code with Firebase Auth. Firebase rejects
   expired or already-used codes.
5. If the reset continuation URL changes, update both the Render variable and
   the app's accepted reset-link continuation in `lib/main.dart`.

## Security and delivery

- Requests return the same success response whether an account exists or not.
- Per-email requests are limited to one every three minutes using an atomic
  SHA-256-derived Redis key; endpoint rate limiting also applies. Redis is
  already required by the backend deployment. If lookup or delivery fails,
  the per-email key is cleared so the user can retry immediately.
- The backend stores no reset code or full email link and does not log email
  content. Firebase's generated action code is single-use and expires.
- Rotate any SMTP password previously shared outside the credential manager
  before configuring `SMTP_PASS`.

After configuring Render, deploy/restart the backend and test with an existing
account and an unknown address. Complete the reset from both Android and iOS,
then verify login with the new password and rejection of the old password.
