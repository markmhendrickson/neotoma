# Email Delivery Troubleshooting Guide

## Quick Checklist

When signup emails aren't arriving:

1. ✅ **Check Supabase Configuration** - Run: `./scripts/check_supabase_email_status.sh`
2. ✅ **Check Supabase Logs** - Dashboard → Authentication → Logs
3. ✅ **Check SendGrid Activity** - SendGrid Dashboard → Activity Feed
4. ✅ **Check Email Client** - Spam folder, filters, blocked senders

## 1. Check Supabase Authentication Logs

### Via Supabase CLI (Recommended)

**Install Supabase CLI:**
```bash
brew install supabase/tap/supabase
```

**Authenticate:**
```bash
supabase login
```

**View auth logs:**
```bash
# List projects
supabase projects list

# View auth logs
supabase projects logs --project-ref {PROJECT_ID} --type auth

# Filter for email events
supabase projects logs --project-ref {PROJECT_ID} --type auth | grep -i email

# View recent signup events
supabase projects logs --project-ref {PROJECT_ID} --type auth | grep -i signup
```

**Query database via CLI:**
```bash
# Connect to database
supabase db connect --project-ref {PROJECT_ID}

# Query recent users
supabase db query "SELECT id, email, created_at, email_confirmed_at FROM auth.users ORDER BY created_at DESC LIMIT 5" --project-ref {PROJECT_ID}
```

### Via Dashboard (Fallback)

If CLI is not available:

1. Go to: `https://supabase.com/dashboard/project/{PROJECT_ID}/auth/logs`
2. Filter by:
   - Event type: `signup` or `email`
   - Time range: Last hour/day
3. Look for:
   - `email_sent` events (success)
   - Error messages (delivery failures)
   - Bounce notifications

### Check Recent Signups

**Via CLI (Recommended):**
```bash
# Query users via Supabase CLI
supabase db query "SELECT id, email, created_at, email_confirmed_at FROM auth.users WHERE email_confirmed_at IS NULL ORDER BY created_at DESC LIMIT 10" --project-ref {PROJECT_ID}
```

**Via Dashboard (Fallback):**
1. Go to: `https://supabase.com/dashboard/project/{PROJECT_ID}/auth/users`
2. Look for:
   - Users with `Email Confirmed = false`
   - Recent `created_at` timestamps
   - Missing `email_confirmed_at` values

## 2. Check SendGrid Activity Feed

1. Log into SendGrid: `https://app.sendgrid.com/activity`
2. Check Activity Feed for:
   - Recent email sends (should match signup attempts)
   - Delivery status:
     - ✅ **Delivered** - Email reached inbox
     - ⚠️ **Bounced** - Invalid email or server rejection
     - ❌ **Dropped** - SendGrid blocked (spam, invalid sender)
     - ⏳ **Deferred** - Temporary delay
3. Verify sender email:
   - Go to Settings → Sender Authentication
   - Verify `contact@neotoma.io` is verified
   - Check domain authentication (SPF/DKIM)

## 3. Common Issues and Fixes

### Issue: Emails Not Being Sent

**Symptoms:**
- No events in Supabase logs
- No activity in SendGrid

**Check:**
1. SMTP configuration: `./scripts/check_supabase_email_status.sh`
2. Email confirmation enabled: Dashboard → Authentication → Email
3. External email enabled: Should be `true`

**Fix:**
- Run: `./scripts/configure_supabase_smtp.sh`
- Verify SendGrid API key is valid
- Check sender email is verified in SendGrid

### Issue: Emails Sent But Not Delivered

**Symptoms:**
- `email_sent` in Supabase logs
- Activity in SendGrid but status is "bounced" or "dropped"

**Check:**
1. SendGrid Activity Feed for bounce reasons
2. Sender email verification status
3. Domain authentication (SPF/DKIM)

**Fix:**
- Verify sender email in SendGrid
- Set up domain authentication
- Check recipient email is valid

### Issue: Emails Going to Spam

**Symptoms:**
- Emails sent and delivered
- Not appearing in inbox

**Check:**
1. Spam/junk folder
2. Email filters
3. SendGrid reputation score

**Fix:**
- Set up domain authentication (SPF/DKIM)
- Use verified sender email
- Warm up sender reputation (gradual volume increase)

### Issue: Site URL Mismatch

**Symptoms:**
- Emails arrive but confirmation links don't work
- Links point to wrong port/domain

**Check:**
```bash
./scripts/check_supabase_email_status.sh
```

**Fix:**
```bash
# Update to match your frontend port
./scripts/update_supabase_site_url.sh http://localhost:5195
```

## 4. Testing Email Delivery

### Test Signup Flow

1. Use a test email address
2. Sign up via frontend
3. Immediately check:
   - Supabase Dashboard → Authentication → Logs (should show `email_sent`)
   - SendGrid Activity Feed (should show send attempt)
   - Email inbox (check spam folder)

### Test SMTP Configuration

```bash
# Check current configuration
./scripts/check_supabase_email_status.sh

# Reconfigure if needed
./scripts/configure_supabase_smtp.sh
```

## 5. Scripts Reference

- `./scripts/check_supabase_email_status.sh` - Check email configuration
- `./scripts/check_supabase_auth_logs.sh` - Check authentication logs (API)
- `./scripts/update_supabase_site_url.sh` - Update site URL
- `./scripts/configure_supabase_smtp.sh` - Configure SendGrid SMTP

## 6. Quick Fixes

### Disable Email Confirmation (Development)

For local testing, disable email confirmation:

1. Dashboard → Authentication → Email
2. Disable "Enable email confirmations"
3. Users will be immediately authenticated after signup

### Reconfigure SMTP

If SMTP settings are incorrect:

```bash
# Reconfigure with SendGrid credentials from 1Password
./scripts/configure_supabase_smtp.sh
```

### Update Site URL

If confirmation links point to wrong URL:

```bash
# Update to match your frontend port
./scripts/update_supabase_site_url.sh http://localhost:5195
```

## 7. Dashboard Links

Replace `{PROJECT_ID}` with your Supabase project ID:

- **Auth Logs:** `https://supabase.com/dashboard/project/{PROJECT_ID}/auth/logs`
- **Users:** `https://supabase.com/dashboard/project/{PROJECT_ID}/auth/users`
- **Email Settings:** `https://supabase.com/dashboard/project/{PROJECT_ID}/auth/providers`
- **SendGrid Activity:** `https://app.sendgrid.com/activity`

## Related Documents

- `docs/developer/supabase_email_setup.md` - Email configuration guide
- `scripts/configure_supabase_smtp.sh` - SMTP configuration script
