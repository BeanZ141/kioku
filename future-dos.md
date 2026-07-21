# Future work — prompt for the next phase

Copy the following prompt into a new Codex task when you are ready to expand this archive:

> Continue the personal photobook archive in this repository. Preserve the current warm uncoated-paper, editorial visual system and do not redesign it into a dashboard or social feed. First inspect the existing Firebase implementation, data model, Storage rules, Cloud Functions, and UI before editing.
>
> Replace the shared-passcode-only v1 access model with secure Google sign-in and account-based permissions. Migrate the existing `archive-v1` media safely so the owner retains full access. Add private albums and read-only invitations: the owner chooses specific albums to share, invitees can see only those albums and cannot upload, edit metadata, or access originals outside them. Design Firestore and Storage rules to enforce this server-side; do not rely on hidden UI or predictable Storage URLs. Document the migration and test authenticated, unauthenticated, owner, invitee, and revoked-invite scenarios.
>
> Add video as a first-class media type without breaking photo browsing: resumable upload, video metadata, duration, poster frame, optimized playback rendition, and the same editorial viewer treatment. Keep original media private. Also propose and implement, where justified, robust backup/export, duplicate detection using content hashes, batch import with a review step, advanced search across tags/captions/camera/date/location, and a clear admin-only import flow. Avoid fake data, preserve all current photo behavior, validate production builds, and visually inspect the result at desktop and mobile widths.
