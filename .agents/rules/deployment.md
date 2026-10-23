# Deployment, CI/CD & Infrastructure Guidelines

## Production Architecture
- **Host VPS**: Ubuntu 22.04 LTS
- **Reverse Proxy**: Apache 2.4 on ports 80 and 443 with `mod_proxy`, `mod_proxy_wstunnel`, and `mod_rewrite`.
- **SSL Certificate**: Let's Encrypt automated certificates via Certbot (`/etc/letsencrypt/live/zenbrave.myapps.tn/`).
- **Domain**: `zenbrave.myapps.tn` (and `chat.myapps.tn`).
- **Docker Relay**: Container `zen-brave-chat` running on `127.0.0.1:3000:3000`.

## Jenkins CI/CD Automation
- **Server**: `https://jenkins.fiscalsuite.tn`
- **Job**: `Zen-Brave-Chat`
- **Trigger**: SCM Polling (`H/5 * * * *`) on GitHub `main` branch.
- **Pipeline Stages**:
  1. Checkout from `https://github.com/Ahmed-lasmar/zen-brave-chat.git`
  2. Build Docker image `ahmedtnlasmar/zen-brave-chat:latest`
  3. Execute automated test suite inside container: `docker run --rm ... npm test`
  4. Push Docker image to Docker Hub with `latest` and commit hash tags
  5. Deploy container to host VPS with restart policy `unless-stopped`
  6. Verify endpoint health (`/health` and `/api/version` == HTTP 200)

## Git Workflow
- Remote: `origin` -> `https://github.com/Ahmed-lasmar/zen-brave-chat.git`
- Branch: `main`
- Sandbox note: When pushing from within the standard sandbox, invoke git through Docker with host mount:
  ```bash
  docker run --rm -v /home/trc-server/antigravity/lively-oppenheimer:/workspace -w /workspace alpine sh -c "apk add -q git && git config --global --add safe.directory '*' && git push origin main"
  ```
