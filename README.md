# kioku archive

An editorial, private photo archive built with React, Vite, Firebase Authentication, Firestore, Storage, and Cloud Functions.

## Run locally

```powershell
npm install
npm run dev
```

Open the local URL and enter `memory`. This is a self-contained demo mode; it uses the curated NVIDIA screenshots in `public/samples` and does not transmit uploads anywhere.

## Connect Firebase

1. Create a Firebase project with **Firestore**, **Storage**, **Cloud Functions**, and **Authentication** enabled. Custom-token Authentication must be available.
2. Copy `.env.example` to `.env.local`, then fill in the public Firebase web-app settings.
3. Install the function dependencies and log in to Firebase. Create one long random upload-signing secret and set the same value in both server runtimes; it never belongs in `.env.local` or a `VITE_` variable:

   ```powershell
   npm --prefix functions install
   firebase login
   firebase use YOUR_PROJECT_ID
   firebase functions:secrets:set ARCHIVE_PASSPHRASE
   firebase functions:secrets:set ARCHIVE_UPLOAD_SECRET
   cd worker
   npx wrangler secret put ARCHIVE_UPLOAD_SECRET
   ```

4. Build and deploy:

   ```powershell
   npm run build
   firebase deploy
   ```

The passcode is verified only inside the callable Cloud Function. It issues a custom Firebase session for the shared `archive-v1` identity; Firestore rules reject unauthenticated requests. The client gets a single-path, 15-minute upload ticket from the function, streams the original to R2, and then calls the processor to write the media record and AVIF derivatives. Never put an upload secret in a `VITE_` variable.

## V1 boundary

Anyone with the passcode has full archive access. This is intentional for v1 and is not equivalent to per-person sharing. The future migration prompt is in `future-dos.md`.
