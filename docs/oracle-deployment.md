# Deploying to Oracle Cloud Infrastructure

This guide deploys the repository's **single Express application** to an OCI
Compute VM. Express serves the public web app, admin panel, and API from the
same Node.js process; there is no separate frontend build or upload step.
MongoDB can be hosted on MongoDB Atlas or another reachable MongoDB service.

## 1. Create and configure a VM

Create an OCI Compute instance running Ubuntu 22.04 or later and configure SSH
access with your public key. Allow inbound TCP traffic for SSH (22), HTTP (80),
and HTTPS (443) in the VCN security rules. Restrict SSH to trusted source
addresses where possible.

Connect to the VM:

```bash
ssh ubuntu@<your-vm-public-ip>
```

Install Node.js 20, Git, Nginx, and PM2:

```bash
sudo apt update
sudo apt install -y ca-certificates curl git nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install --global pm2
```

## 2. Install the application

Use the actual repository URL and a deployment directory of your choice:

```bash
git clone https://github.com/boco-cyber/coptic-catechism.git
cd coptic-catechism/backend
npm ci --omit=dev
cp .env.example .env
nano .env
```

Set at least the following values in `backend/.env`:

```dotenv
MONGODB_URI=<mongodb-connection-string>
NODE_ENV=production
PORT=5000
SESSION_SECRET=<long-random-secret>
CORS_ORIGINS=https://your-domain.example
```

Set `CORS_ORIGINS` to the origin(s) allowed to make credentialed cross-origin
requests. If the site and API use the same origin, cross-origin access may not
be needed. Keep `.env` private and do not commit it.

## 3. Seed data and create an admin

For a new database, run the seed scripts from `backend/` as appropriate:

```bash
npm run seed
npm run seed:arabic
```

These scripts write to the configured database. Do not re-run them against a
populated production database without reviewing their behavior and the
intended effect on existing data.

Create an admin account interactively:

```bash
node src/seeds/createAdmin.js <username>
```

The script prompts for the password. The admin panel is available at
`https://your-domain.example/admin/login.html` after the service is running.

## 4. Run the service

From `backend/`:

```bash
pm2 start src/server.js --name coptic-catechism
pm2 save
pm2 startup
```

Follow the command printed by `pm2 startup` to enable startup after reboot.
The service listens on port `5000` by default. Check it locally on the VM:

```bash
curl http://127.0.0.1:5000/health
```

## 5. Configure Nginx

Create `/etc/nginx/sites-available/coptic-catechism`:

```nginx
server {
    listen 80;
    server_name your-domain.example;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable the site and verify the configuration:

```bash
sudo ln -s /etc/nginx/sites-available/coptic-catechism /etc/nginx/sites-enabled/coptic-catechism
sudo nginx -t
sudo systemctl reload nginx
```

Because the Node process serves both static files and API routes, Nginx proxies
the entire site to port `5000`; it does not need a separate frontend directory.

## 6. Enable HTTPS

Point the domain's DNS record at the VM, then install and run Certbot:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.example
```

Certbot configures TLS in Nginx. The Express app must run with
`NODE_ENV=production` and a strong `SESSION_SECRET` so admin sessions use
secure cookies behind the reverse proxy.

## Verify and operate

- Public site: `https://your-domain.example/`
- Arabic site: `https://your-domain.example/ar/`
- Health check: `https://your-domain.example/health`
- API: `https://your-domain.example/api/books`
- Admin: `https://your-domain.example/admin/login.html`

Useful service commands:

```bash
pm2 status
pm2 logs coptic-catechism
sudo systemctl status nginx
```

Keep the VM, Node.js, Nginx, and application dependencies updated. Restrict
MongoDB network access to the VM where supported, and back up the database
before performing content imports or reseeds.
