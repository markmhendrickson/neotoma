# MCP Storage Setup Guide

## Problem: "Bucket not found" Error

When using the Neotoma MCP server's `ingest()` function, you may encounter the error:

```
Bucket not found
```

This error occurs when the required Supabase Storage buckets haven't been created.

## Quick Fix

### Option 1: Automated Setup (Recommended)

Run the setup script:

```bash
npm run setup:storage
```

This script will:
- Check if the required buckets exist
- Create them automatically if missing
- Configure them as private buckets (for security)

### Option 2: Manual Setup

1. Open your Supabase dashboard
2. Navigate to **Storage** in the left sidebar
3. Create two buckets:

   **Bucket 1: `sources`**
   - Name: `sources`
   - Public: **NO** (private)
   - Click **"Create bucket"**

   **Bucket 2: `files`**
   - Name: `files`
   - Public: **NO** (private)
   - Click **"Create bucket"**

## Required Configuration

### Storage Buckets

The Neotoma MCP server requires two storage buckets:

| Bucket Name | Purpose | Required For |
|------------|---------|--------------|
| `sources` | Source storage | `ingest()` operations, content-addressed storage |
| `files` | General file uploads | File upload endpoints |

Both buckets should be **private** (not public) for security. The system uses the `service_role` key for uploads/downloads and creates signed URLs for client access.

### User ID

The `ingest()` function requires a valid `user_id` parameter (UUID format).

**For testing/development:**
```javascript
user_id: "00000000-0000-0000-0000-000000000000"
```

**For production:**
- Use a real user UUID from your authentication system
- Each user's data is isolated by `user_id`

## Environment Variables

Ensure your `.env` file has:

```bash
# Supabase Configuration (preferred: single variable names)
SUPABASE_PROJECT_ID=your-project-id
SUPABASE_SERVICE_KEY=your-service-role-key-here

# Or alternatively:
# SUPABASE_URL=https://your-project-id.supabase.co
# SUPABASE_SERVICE_KEY=your-service-role-key-here

# Backward compatibility (also supported):
# DEV_SUPABASE_PROJECT_ID=your-project-id
# DEV_SUPABASE_SERVICE_KEY=your-service-role-key-here
```

**Important:** Use the `service_role` key (not the `anon` key) for storage operations.

## Verification

After setup, verify the buckets exist:

1. In Supabase dashboard → Storage
2. You should see both `sources` and `files` buckets listed

## Troubleshooting

### Error: "Bucket not found" persists

1. **Check bucket names:** Ensure buckets are named exactly `sources` and `files` (case-sensitive)
2. **Verify service role key:** Ensure `SUPABASE_SERVICE_KEY` (or `DEV_SUPABASE_SERVICE_KEY` for development) is set correctly
3. **Check permissions:** The service role key should have storage access
4. **Run setup script:** `npm run setup:storage` to verify and create missing buckets

### Error: "Failed to upload to storage"

1. **Check bucket exists:** Run `npm run setup:storage` to verify
2. **Verify file size:** Ensure file is under 50MB limit
3. **Check service role key:** Must have storage write permissions

## Related Documentation

- [Getting Started Guide](./getting_started.md#step-4-create-storage-buckets)
- [Troubleshooting Guide](../operations/troubleshooting.md#issue-file-upload-fails)
- [MCP Specification](../specs/MCP_SPEC.md)
