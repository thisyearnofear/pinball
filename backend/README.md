# Pinball Backend (Score Signer)

Minimal Fastify service for validating and signing scores for on-chain submission.

## Endpoints
- POST /api/scores/sign
  - Body: { tournamentId: number, address: string, score: number, name?: string, metadata?: string }
  - Returns: { signature: string }

## Security
- SCORE_SIGNER_PK must be kept secret and only configured as an environment variable on the VPS.
- Configure ALLOWED_ORIGINS for CORS.
- Add anti-cheat checks in src/routes/scores.ts.

## Local development
- cd backend
- cp .env.example .env
- Edit .env with a test PK and address (DO NOT COMMIT REAL KEYS)
- npm install
- npm run dev

## Production build
- npm run build
- npm run start

## Systemd service example
Create /etc/systemd/system/pinball-backend.service

[Unit]
Description=Pinball Backend
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/pinball/backend
EnvironmentFile=/etc/pinball-backend/.env
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target

Then:
- sudo systemctl daemon-reload
- sudo systemctl enable pinball-backend
- sudo systemctl start pinball-backend

## Nginx reverse proxy
server {
  listen 80;
  server_name api.your-domain.tld;

  location / {
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_pass http://127.0.0.1:8080;
  }
}

# Then add SSL via certbot
sudo certbot --nginx -d api.your-domain.tld
