# SharePoint Graph Setup — Invoice Site / Documents Library

The Tax Receipts module will process scanned receipt PDFs from:

- **Site:** Invoice SharePoint site
- **Library:** Documents
- **Input folder:** `Inbox`
- **Processed/output folder:** `Processed/FY2025-2026`

These paths are configurable in the app Settings page and in server environment variables.

## Values needed from Boss / Microsoft 365 admin

Required:

1. `MS_TENANT_DOMAIN` — e.g. `yourcompany.onmicrosoft.com`
2. `MS_TENANT_ID` — Microsoft Entra Directory tenant ID
3. `MS_CLIENT_ID` — App Registration application/client ID
4. `MS_CLIENT_SECRET` — client secret, or preferably a certificate credential
5. `MS_CLIENT_SECRET_EXPIRES_ON` — expiry date in `YYYY-MM-DD` format so the app can warn/notify before it expires
6. `SHAREPOINT_SITE_URL` — e.g. `https://YOUR-TENANT.sharepoint.com/sites/Invoice`
6. `SHAREPOINT_DOCUMENT_LIBRARY` — default `Documents`
7. `SHAREPOINT_INPUT_FOLDER` — default `Inbox`
8. `SHAREPOINT_OUTPUT_FOLDER` — default `Processed/FY2025-2026`

Optional but useful after discovery:

- `SHAREPOINT_SITE_ID`
- `SHAREPOINT_DRIVE_ID`

## Recommended Graph permissions

Prefer least privilege:

- Microsoft Graph **Application** permission: `Sites.Selected`
- Then grant the app read/write permission only to the Invoice SharePoint site.

Fallback if necessary, but broader:

- `Sites.ReadWrite.All`

The app needs to:

- List/read files in `Documents/Inbox`
- Download PDFs for OCR
- Create/move/upload processed PDFs into `Documents/Processed/FY2025-2026`
- Read/update custom metadata fields on SharePoint list items backing the document library

## Graph endpoint shape

SharePoint document libraries appear as Graph drives.

Common discovery flow:

```http
GET https://graph.microsoft.com/v1.0/sites/{tenant}.sharepoint.com:/sites/Invoice
GET https://graph.microsoft.com/v1.0/sites/{site-id}/drives
GET https://graph.microsoft.com/v1.0/drives/{drive-id}/root:/Inbox:/children
GET https://graph.microsoft.com/v1.0/drives/{drive-id}/root:/Processed/FY2025-2026
```

Metadata updates use the backing SharePoint list item:

```http
PATCH https://graph.microsoft.com/v1.0/drives/{drive-id}/items/{item-id}/listItem/fields
```

## Security rules

- Never commit `.env` or client secrets.
- Do not store credentials in browser localStorage.
- The Settings page may accept a client secret, but saving must write it only to server-side `.env`/secret storage and clear the browser field afterward.
- The Settings page may display non-secret configuration only, including whether a secret is saved and its expiry date.
- Real metadata writes should be gated behind review/approval until tested.
- Notify Boss when `MS_CLIENT_SECRET_EXPIRES_ON` is within 30 days of expiry.
