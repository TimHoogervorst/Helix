# Platform attachments

Attachment bytes are written through Django's configured `default_storage` and are immutable after staging. A record Revision retains each referenced attachment through `AttachmentRevisionLink`; removal of a Revision releases that reference without deleting the bytes inside the scientific transaction.

Run the cleanup command daily in the backend deployment:

```bash
python manage.py cleanup_platform_attachments
```

The command removes staged uploads older than 24 hours and previously linked objects that have remained unreferenced for 24 hours. It locks each attachment metadata row and checks its Revision links again before deleting bytes. It is safe to run concurrently with uploads and saves.

Uploads use a 100 MiB limit. Deployments may set `PLATFORM_ATTACHMENT_MAX_BYTES` to a smaller positive byte count. Download links always name an authorized record and exact Revision; the endpoint verifies stored size and SHA-256 before returning content as an attachment with `nosniff`.
