# Deploying to Oracle Cloud Infrastructure (OCI)

## Overview

Oracle Cloud's **Always Free** tier gives you:
- **2 AMD VMs** (1/8 OCPU, 1 GB RAM each) or **1 ARM VM** (4 OCPUs, 24 GB RAM)
- 200 GB block storage
- 10 TB/month outbound data

This is more than enough for the Coptic Catechism app.

## Architecture on OCI

```
Internet
   │
   ├── yourapp.com (frontend) ──► OCI VM or Object Storage (static)
   │
   └── api.yourapp.com (backend) ──► OCI VM (Node.js + Express)
                                         │
                                         └──► MongoDB Atlas (free tier)
```

## Step 1: Create an OCI Account

1. Go to https://cloud.oracle.com/
2. Sign up for a free account
3. Choose your home region (closest to your users)

## Step 2: Create an ARM VM (Recommended)

The ARM Ampere A1 instance is the best free-tier option:

1. Go to **Compute → Instances → Create Instance**
2. Shape: **VM.Standard.A1.Flex** (ARM)
   - OCPUs: 2 (of your 4 free)
   - Memory: 12 GB (of your 24 free)
3. Image: **Ubuntu 22.04** (or 24.04)
4. Add your SSH public key
5. Under **Networking**: Create a new VCN or use default
6. Click **Create**

## Step 3: Configure Networking

### Open ports in Security List:
1. Go to **Networking → Virtual Cloud Networks → your VCN → Security Lists**
2. Add Ingress Rules:
   - Port 80 (HTTP)
   - Port 443 (HTTPS)
   - Port 5000 (API, or use Nginx reverse proxy)

### Configure iptables on the VM:
```bash
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 5000 -j ACCEPT
sudo netfilter-persistent save
```

## Step 4: Set Up the Server

SSH into your VM:
```bash
ssh ubuntu@<your-vm-public-ip>
```

Install dependencies:
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install Nginx (reverse proxy)
sudo apt install -y nginx

# Install PM2 (process manager)
sudo npm install -g pm2

# Install Git
sudo apt install -y git
```

## Step 5: Deploy the Backend

```bash
# Clone your repo
git clone https://github.com/yourusername/coptic-catechism.git
cd coptic-catechism/backend

# Install dependencies
npm install --production

# Create .env
cp .env.example .env
nano .env  # Add your MongoDB Atlas URI

# Seed the database
npm run seed
# Then copy PDFs to data/ and run:
npm run seed:questions

# Start with PM2
pm2 start src/server.js --name catechism-api
pm2 save
pm2 startup  # Follow the instructions to auto-start on boot
```

## Step 6: Configure Nginx

```bash
sudo nano /etc/nginx/sites-available/catechism
```

```nginx
server {
    listen 80;
    server_name yourapp.com api.yourapp.com;

    # API
    location /api {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }

    # Health check
    location /health {
        proxy_pass http://localhost:5000;
    }

    # Frontend (static files)
    location / {
        root /var/www/catechism;
        try_files $uri /index.html;
    }
}
```

Enable and restart:
```bash
sudo ln -s /etc/nginx/sites-available/catechism /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## Step 7: Deploy the Frontend

Build locally and copy to server:
```bash
# On your local machine
cd frontend
npm run build

# Copy to server
scp -r build/* ubuntu@<vm-ip>:/var/www/catechism/
```

Or build on the server:
```bash
cd ~/coptic-catechism/frontend
npm install
npm run build
sudo cp -r build/* /var/www/catechism/
```

## Step 8: Set Up SSL (HTTPS)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourapp.com -d api.yourapp.com
```

## Step 9: MongoDB Atlas Setup

1. Go to https://www.mongodb.com/cloud/atlas
2. Create a free M0 cluster
3. Under **Network Access**: Add your OCI VM's public IP
4. Under **Database Access**: Create a user
5. Get the connection string and add it to your `.env`

## Monitoring

```bash
# Check API status
pm2 status
pm2 logs catechism-api

# Check Nginx
sudo systemctl status nginx
sudo tail -f /var/log/nginx/error.log

# System resources
htop
```

## Cost: $0/month

Everything above uses free-tier resources:
- OCI VM: Always Free
- MongoDB Atlas: M0 Free Cluster (512 MB)
- SSL: Let's Encrypt (free)
- DNS: Use Cloudflare free tier for DNS management
