# Dev Proxy DNS Setup

The dev proxy enables access to dev servers via branch-based domains like `[BRANCH_NAME].dev` (with HTTPS on port 443 or HTTP on port 80) instead of `localhost:[PORT]`.

## Initial Setup

### 1. Generate SSL Certificate (One-time)

Generate a self-signed certificate for HTTPS support:

```bash
./scripts/generate-dev-cert.sh
```

This creates certificates in `.dev-certs/` directory. To trust the certificate in macOS:

1. Open Keychain Access
2. Drag `.dev-certs/dev.crt` into the "System" keychain
3. Double-click the certificate and set "Trust" to "Always Trust"

### 2. DNS Configuration (One-time)

To use branch-based domains, you need to configure your system to resolve `*.dev` domains to `127.0.0.1` (localhost).

### Option 1: Using dnsmasq (Recommended for macOS/Linux)

1. Install dnsmasq:
   ```bash
   # macOS (using Homebrew)
   brew install dnsmasq
   
   # Linux (Ubuntu/Debian)
   sudo apt-get install dnsmasq
   ```

2. Configure dnsmasq:
   ```bash
   # Create/edit dnsmasq config
   echo "address=/.dev/127.0.0.1" | sudo tee -a /etc/dnsmasq.conf
   
   # macOS: Start dnsmasq
   sudo brew services start dnsmasq
   
   # Linux: Restart dnsmasq
   sudo systemctl restart dnsmasq
   ```

3. Configure system DNS resolver:
   ```bash
   # macOS: Create resolver directory
   sudo mkdir -p /etc/resolver
   
   # Add dev domain resolver
   echo "nameserver 127.0.0.1" | sudo tee /etc/resolver/dev
   ```

   For Linux, edit `/etc/NetworkManager/NetworkManager.conf`:
   ```ini
   [main]
   dns=dnsmasq
   ```

### Option 2: Using /etc/hosts (Simple but manual)

Add entries for each branch you want to use:

```bash
# Edit /etc/hosts as root
sudo nano /etc/hosts

# Add entries like:
127.0.0.1  main.dev
127.0.0.1  dev.dev
127.0.0.1  feature-branch.dev
```

**Note:** This approach requires manual updates for each new branch. The dnsmasq approach is preferred for automatic wildcard resolution.

## Verification

After setup, verify DNS resolution:

```bash
# Test DNS resolution
ping -c 1 test-branch.dev
# Should resolve to 127.0.0.1

# Or use nslookup
nslookup test-branch.dev
# Should show 127.0.0.1
```

## Usage

Once DNS is configured, run dev-serve:

```bash
npm run dev:serve
```

The output will show the branch-based URL:
```
[dev-serve] UI available at: https://[BRANCH_NAME].dev (HTTPS) or http://[BRANCH_NAME].dev (HTTP)
[dev-serve] API available at: https://[BRANCH_NAME].dev/api (HTTPS) or http://[BRANCH_NAME].dev/api (HTTP)
```

Access your dev environment at `https://[BRANCH_NAME].dev` (recommended) or `http://[BRANCH_NAME].dev` instead of `localhost:[PORT]`.

**HTTPS Support:** The proxy automatically serves HTTPS on port 443 (default) to avoid browser security warnings. A self-signed certificate is generated on first run via `scripts/generate-dev-cert.sh`.

**Note:** Binding to ports 80 (HTTP) and 443 (HTTPS) requires root privileges, so you may need to run `sudo npm run dev:serve` or use custom ports via `PROXY_HTTP_PORT=8000 PROXY_HTTPS_PORT=8443 npm run dev:serve`.

## Multiple Branches

The proxy supports multiple branches simultaneously. Each branch uses its own set of ports and can be accessed via its domain:

- `https://branch-1.dev` (HTTPS, recommended)
- `https://branch-2.dev`
- `https://branch-3.dev`

Or via HTTP:
- `http://branch-1.dev`
- `http://branch-2.dev`
- `http://branch-3.dev`

The proxy automatically detects available branches by scanning `.branch-ports/` and `.dev-serve/` directories.

## Troubleshooting

### DNS not resolving

- Verify dnsmasq is running: `brew services list` (macOS) or `systemctl status dnsmasq` (Linux)
- Check resolver configuration: `cat /etc/resolver/dev` (macOS)
- Test with: `nslookup test.dev`

### Port conflicts or permission errors

**Ports 80 and 443 (default):** Binding to ports 80 (HTTP) and 443 (HTTPS) requires root privileges. If you get a permission error:

```bash
# Option 1: Run with sudo (recommended)
sudo npm run dev:serve

# Option 2: Use different ports
PROXY_HTTP_PORT=8000 PROXY_HTTPS_PORT=8443 npm run dev:serve
```

**Custom ports:** If your chosen ports are already in use, set environment variables:

```bash
PROXY_HTTP_PORT=9000 PROXY_HTTPS_PORT=9443 npm run dev:serve
```

**Port forwarding (macOS):** You can forward ports using pfctl if you prefer not to run with sudo:

```bash
# Forward HTTP (80 -> 8000)
echo "rdr on lo0 inet proto tcp from any to 127.0.0.1 port 80 -> 127.0.0.1 port 8000" | sudo pfctl -f -
# Forward HTTPS (443 -> 8443)
echo "rdr on lo0 inet proto tcp from any to 127.0.0.1 port 443 -> 127.0.0.1 port 8443" | sudo pfctl -f -
sudo pfctl -e
```

Then run the proxy on custom ports: `PROXY_HTTP_PORT=8000 PROXY_HTTPS_PORT=8443 npm run dev:serve`

### SSL Certificate Issues

**Certificate not trusted:**
- After generating the certificate with `./scripts/generate-dev-cert.sh`, you need to trust it in macOS Keychain Access
- Drag `.dev-certs/dev.crt` into the "System" keychain and set trust to "Always Trust"

**Certificate not found:**
- If the proxy warns about missing certificates, run `./scripts/generate-dev-cert.sh` to generate them
- HTTPS will be disabled until certificates are generated

**Browser security warnings:**
- Self-signed certificates will show security warnings - this is expected
- After trusting the certificate in Keychain Access, refresh the page and accept the certificate in your browser

**ERR_SSL_KEY_USAGE_INCOMPATIBLE error:**
- This error occurs when Chrome rejects the certificate's key usage extensions
- Solution:
  1. Remove the old certificate from Keychain Access (search for "*.dev" and delete it)
  2. Regenerate the certificate: `./scripts/generate-dev-cert.sh`
  3. Trust the new certificate in Keychain Access (drag to System keychain, set to "Always Trust")
  4. Restart the dev proxy server to load the new certificate
  5. Clear Chrome's SSL state: Go to `chrome://net-internals/#hsts` and delete all domain security policies for "dev.dev" or "*.dev"
  6. Close and reopen Chrome completely
  7. Try accessing `https://dev.dev` again

### Branch not found

The proxy scans branch port mappings on startup and periodically. If a branch doesn't appear:

- Ensure the branch's dev server is running
- Check that `.dev-serve/[BRANCH_NAME].json` or `.branch-ports/[BRANCH_NAME].json` exists
- Wait a few seconds for the proxy to rescan (automatic every 5 seconds)

