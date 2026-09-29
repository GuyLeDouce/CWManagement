# File and Photo Storage

## Decision

`StoredFile` owns metadata; `StorageService` owns bytes. Business services and database rows never contain provider-specific URLs or credentials. Opaque keys use `{projectId}/{uuid}` and downloads always pass through an authenticated, project-scoped server route.

## Adapters

The implemented local adapter writes beneath `STORAGE_LOCAL_ROOT` and is refused when `NODE_ENV=production`. It is suitable for local development and tests only. Railway container storage is not durable and must not be used for production uploads.

`STORAGE_DRIVER` defaults to `local` outside production and `unconfigured` in production. Set `s3` for the implemented private S3-compatible adapter. Configure `STORAGE_S3_BUCKET`, `STORAGE_S3_REGION`, `STORAGE_S3_ACCESS_KEY_ID`, `STORAGE_S3_SECRET_ACCESS_KEY`, optionally `STORAGE_S3_ENDPOINT` (HTTPS) and `STORAGE_S3_PATH_STYLE=true`. The official AWS JavaScript SDK handles signed requests. Keep credentials in Railway variables and bucket access private; downloads remain authorized server streams, not public URLs. Validate against the selected provider before rollout.

StoredFile.storageProvider records the adapter used for each upload. Existing rows default to local, preserving their original meaning. Changing STORAGE_DRIVER affects new uploads only. Production refuses legacy local reads rather than silently losing or relocating evidence. See PRODUCTION_RECOVERY.md for inventory/copy/hash verification and deliberate metadata migration. The application does not assert that production has no existing files.

New staff and warranty uploads use the same verified JPEG/PNG/WebP/PDF policy as trade uploads. Other document formats require conversion to PDF in this initial hardened path. Storage keys remain opaque project/UUID values. No public-read ACL or browser bucket credential is used.

## Security and lifecycle

Uploads enforce FILE_UPLOAD, project access, size limits and opaque keys. Publishing CLIENT files additionally requires CLIENT_CONTENT_PUBLISH. Internal downloads require FILE_VIEW_INTERNAL and project access. Client downloads require an active explicit project grant, CLIENT visibility and nonarchived status. Visibility alone never grants access. Stored keys are excluded from client DTOs. Safe raster images display inline; other formats download with nosniff and sandbox headers. Approved selection/accepted CO attachments cannot be archived or unpublished through services. Archive retains bytes for recoverability; retention deletion is future work.

## Trade files and uploads

TRADE visibility also requires an explicit TradeFileShare or the same uploading Contact plus active TradeProjectAccess. Protected downloads reject INTERNAL, CLIENT, other-trade and other-project files before reading bytes. Staff needs TRADE_CONTENT_PUBLISH to classify/share files. Purchasing issue shares only TRADE-classified attachments with the exact vendor recipient.

Trade uploads accept verified JPEG/PNG/WebP/PDF signatures, matching extensions/MIME, safe plain filenames and configured size limits. They use existing opaque StorageService keys, TRADE_UPLOAD origin, uploader Contact and optional validated work/instruction/deficiency references. Authorization runs before writing bytes and again inside the metadata transaction; failed metadata writes remove bytes. Issued/acknowledged/message/completion evidence shares are locked. Database triggers prevent rewriting, reclassifying or archiving retained files. Replacement drawings use new files with revision labels/upload dates; old evidence remains retained. No antivirus engine or full drawing version graph is provided.
