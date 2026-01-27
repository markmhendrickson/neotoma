# Supabase Email Configuration Guide

## Problem: Emails Ending Up in Spam

Supabase's default email sending service often has deliverability issues, especially for new projects. Emails may end up in spam folders.

## Solution 1: Disable Email Confirmation (Development)

**For local development**, disable email confirmation so users can sign up immediately:

1. Go to Supabase Dashboard → **Authentication** → **Email**
2. Find **"Enable email confirmations"** toggle
3. **Turn it OFF** (disable)
4. Click **"Save"**

**Result:** Users will be immediately authenticated after signup (session created automatically).

## Solution 2: Configure Custom SMTP (Production)

**For production**, use a custom SMTP provider for better deliverability:

### Option A: Use SendGrid (Recommended)

1. **Create SendGrid account:**
   - Sign up at https://sendgrid.com
   - Verify your sender email address
   - Create an API key with "Mail Send" permissions

2. **Configure in Supabase:**
   - Go to Supabase Dashboard → **Authentication** → **Email**
   - Scroll to **"SMTP Settings"**
   - Enable **"Custom SMTP"**
   - Fill in:
     - **Host:** `smtp.sendgrid.net`
     - **Port:** `587`
     - **Username:** `apikey`
     - **Password:** Your SendGrid API key
     - **Sender email:** Your verified sender email
     - **Sender name:** Neotoma (or your app name)

3. **Click "Save"**

### Option B: Use AWS SES

1. **Set up AWS SES:**
   - Verify your sender email/domain
   - Create SMTP credentials

2. **Configure in Supabase:**
   - **Host:** `email-smtp.{region}.amazonaws.com` (e.g., `email-smtp.us-east-1.amazonaws.com`)
   - **Port:** `587`
   - **Username:** Your SES SMTP username
   - **Password:** Your SES SMTP password
   - **Sender email:** Your verified email
   - **Sender name:** Neotoma

### Option C: Use Resend (Modern Alternative)

1. **Create Resend account:**
   - Sign up at https://resend.com
   - Verify your domain
   - Get API key

2. **Configure in Supabase:**
   - **Host:** `smtp.resend.com`
   - **Port:** `587`
   - **Username:** `resend`
   - **Password:** Your Resend API key
   - **Sender email:** Your verified email
   - **Sender name:** Neotoma

## Solution 3: Check Spam Folder & Mark as Not Spam

**Immediate workaround:**

1. Check your spam/junk folder for the confirmation email
2. Mark it as "Not Spam" / "Not Junk"
3. Future emails from Supabase should go to inbox

**Note:** This only helps for your specific email address. Other users will still have emails go to spam.

## Solution 4: Use Custom Domain with SPF/DKIM (Best for Production)

**For best deliverability**, use your own domain:

1. **Add custom domain in Supabase:**
   - Go to **Settings** → **Auth** → **URL Configuration**
   - Add your custom domain

2. **Configure DNS records:**
   - Add SPF record: `v=spf1 include:supabase.co ~all`
   - Add DKIM records (provided by Supabase)
   - Add DMARC record (optional but recommended)

3. **Update email sender:**
   - Use `noreply@yourdomain.com` instead of Supabase's default

## Recommended Setup by Environment

### Development
- **Disable email confirmation** (easiest for testing)
- Users sign up and are immediately authenticated

### Staging
- **Use custom SMTP** (SendGrid/Resend)
- Keep email confirmation enabled
- Test deliverability

### Production
- **Use custom SMTP** with verified domain
- **Enable email confirmation** (security best practice)
- Monitor deliverability rates

## Testing Email Deliverability

After configuring custom SMTP:

1. **Send test email:**
   - Use Supabase's "Send test email" feature
   - Check inbox (not spam)

2. **Test signup flow:**
   - Create a new account
   - Check email delivery time
   - Verify email doesn't go to spam

3. **Monitor metrics:**
   - Check SMTP provider dashboard for delivery rates
   - Monitor bounce rates
   - Check spam complaint rates

## Troubleshooting

### Emails Still Going to Spam

1. **Check SPF/DKIM records:**
   - Use https://mxtoolbox.com/spf.aspx
   - Verify DNS records are correct

2. **Warm up your domain:**
   - Start with low email volume
   - Gradually increase over time
   - Build sender reputation

3. **Email content:**
   - Avoid spam trigger words
   - Keep HTML simple
   - Include plain text version

4. **Sender reputation:**
   - Use a dedicated IP (if using SendGrid/AWS SES)
   - Monitor bounce rates
   - Remove invalid email addresses

## Quick Reference: Supabase Email Settings

**Location:** Supabase Dashboard → Authentication → Email

**Key Settings:**
- **Enable email confirmations:** ON (production) / OFF (development)
- **Secure email change:** ON (recommended)
- **Email OTP expiration:** 3600 seconds (1 hour)
- **Custom SMTP:** Configure for production

## Related Documentation

- [Supabase Auth Email Configuration](https://supabase.com/docs/guides/auth/auth-email)
- [Supabase Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [SendGrid Setup Guide](https://docs.sendgrid.com/for-developers/sending-email/getting-started-smtp)
- [AWS SES Setup Guide](https://docs.aws.amazon.com/ses/latest/dg/send-email-smtp.html)
