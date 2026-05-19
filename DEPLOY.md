# DyeFlow Deployment Guide
# LAN Access + Public Internet

## PART 1 — Setup (Run Once)

Open PowerShell in `C:\dyeflow-react` and run:

```powershell
.\setup-shared-db.ps1
```

Then restart the server:
```powershell
npm run dev
```

Then go to `http://localhost:6060/migrate` and click **Migrate to Server**.
This pushes all your existing data from localStorage → server file.

---

## PART 2 — LAN Access (Factory WiFi)

This works TODAY with zero cost.

**Step 1:** Find your PC's local IP
```
ipconfig
# Look for: IPv4 Address . . . . . . 192.168.x.x
```

**Step 2:** Allow port 6060 through Windows Firewall
```powershell
# Run PowerShell as Administrator:
New-NetFirewallRule -DisplayName "DyeFlow ERP" -Direction Inbound -Protocol TCP -LocalPort 6060 -Action Allow
```

**Step 3:** On any phone/tablet/PC connected to same WiFi:
```
http://192.168.1.xxx:6060
```

All devices share the same data via the server file.

**To start the server for LAN (binds to all interfaces):**
```powershell
npm run dev
```
Next.js already listens on all interfaces by default.

---

## PART 3 — Public Internet (VPS Deployment)

### Option A: Hostinger VPS (Cheapest — ~₹300-500/month)
1. Buy **Hostinger VPS 1** plan at hostinger.in
2. Choose Ubuntu 22.04
3. Connect via SSH

### Option B: DigitalOcean Droplet (~$6/month)
1. Create account at digitalocean.com
2. Create Droplet → Ubuntu 22.04 → Basic → $6/month

### Deploy Steps (same for any VPS):

```bash
# 1. Install Node.js on the server
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. Install PM2 (keeps app running)
sudo npm install -g pm2

# 3. Upload your project (from your Windows PC):
# Use FileZilla or WinSCP to upload C:\dyeflow-react to /var/www/dyeflow

# 4. On the server:
cd /var/www/dyeflow
npm install
npm run build

# 5. Set environment variables
cat > .env.local << 'EOF'
GROQ_API_KEY=your_groq_key_here
DATA_DIR=/var/data/dyeflow
EOF

mkdir -p /var/data/dyeflow

# 6. Start with PM2
pm2 start npm --name dyeflow -- start
pm2 startup
pm2 save

# 7. Allow port 6060
sudo ufw allow 6060

# App is now running at: http://YOUR_SERVER_IP:6060
```

### Optional: Custom Domain + HTTPS (Free SSL)

```bash
# Install Nginx
sudo apt install nginx

# Install Certbot for free SSL
sudo apt install certbot python3-certbot-nginx

# Configure Nginx as reverse proxy
sudo nano /etc/nginx/sites-available/dyeflow
```

Nginx config:
```nginx
server {
    server_name yourdomain.com www.yourdomain.com;

    location / {
        proxy_pass http://localhost:6060;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/dyeflow /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Free SSL certificate
sudo certbot --nginx -d yourdomain.com
```

Now your ERP runs at `https://yourdomain.com` — accessible from anywhere!

---

## HOW DATA SYNC WORKS

```
Device A (PC)          Server              Device B (Phone)
    |                    |                       |
    |-- setItem() -----> |                       |
    |   (auto-syncs)     |                       |
    |                    |<-- poll every 5s -----|
    |                    |---- new data -------->|
    |                    |   (UI auto-updates)   |
```

- When any device saves data → instantly writes to `data/dyeflow_db.json` on server
- All other devices poll the server every 5 seconds
- If server is unreachable → data stays in localStorage (offline mode)
- When back online → data syncs again

---

## BACKUP

The entire database is one file: `data/dyeflow_db.json`

To backup:
```powershell
# Windows — schedule this daily
Copy-Item "C:\dyeflow-react\data\dyeflow_db.json" "C:\Backups\dyeflow_$(Get-Date -Format 'yyyyMMdd').json"
```

---

## TROUBLESHOOTING

**Other devices can't connect on LAN:**
- Check firewall: Windows Defender → Allow app → add `node.exe`
- Make sure `npm run dev` is running on main PC
- Both devices must be on same WiFi network

**Data not syncing:**
- Go to `/migrate` page and click "Verify Server" to check server has data
- Check browser console for errors
- Restart `npm run dev`

**On VPS — app not starting:**
```bash
pm2 logs dyeflow
```
