# Production deployment on AWS EC2

BoardForge deploys to one Ubuntu EC2 instance with Docker Compose. Caddy terminates HTTPS and proxies the web and API containers; PostgreSQL is reachable only inside the Docker network. GitHub Actions transfers an immutable source archive, builds the containers on EC2 and runs a public health check.

## 1. AWS and DNS prerequisites

Create an Ubuntu 24.04 LTS EC2 instance. A `t3.medium` is a sensible minimum for building both images on the instance; use at least 25 GB of gp3 storage. Attach an Elastic IP so DNS does not change after a restart.

The EC2 security group must allow:

| Port | Source | Purpose |
| --- | --- | --- |
| TCP 22 | Your administration IP, plus GitHub Actions connectivity | SSH deployment |
| TCP 80 | `0.0.0.0/0` and `::/0` | HTTPS certificate issuance and redirect |
| TCP 443 | `0.0.0.0/0` and `::/0` | Web and API HTTPS |
| UDP 443 | `0.0.0.0/0` and `::/0` | HTTP/3 (optional) |

Do not expose ports 3000, 4000 or 5432. Point two DNS A records at the Elastic IP, for example `play.example.com` and `api.example.com`. Caddy obtains their TLS certificates automatically after deployment.

> Restricting port 22 to fixed GitHub-hosted runner addresses is operationally awkward because their ranges change. For the hackathon, use a tightly controlled SSH key, disable password authentication, and consider a self-hosted runner or AWS Systems Manager after submission.

## 2. GitHub production secrets

Create a GitHub environment named `production`, then add these **environment secrets** under **Settings → Environments → production**. Repository secrets also work, but environment secrets support approvals and tighter access.

| Secret | Required | Example or purpose |
| --- | --- | --- |
| `EC2_HOST` | Yes | Elastic IP or deploy hostname |
| `EC2_USER` | Yes | Usually `ubuntu` |
| `EC2_SSH_PRIVATE_KEY` | Yes | Entire private key matching the EC2 authorized key |
| `EC2_SSH_PORT` | No | Defaults to `22` |
| `APP_DOMAIN` | Yes | Web hostname only, without `https://` |
| `API_DOMAIN` | Yes | API hostname only, without `https://` |
| `POSTGRES_PASSWORD` | Yes | Long, randomly generated database password |
| `OPENAI_API_KEY` | Yes | OpenAI project/service-account key used only by the server container |
| `OPENAI_MODEL` | No | Defaults to `gpt-5.6-terra` |
| `OPENAI_REVIEW_MODEL` | No | Defaults to `gpt-5.6-luna` |

Never place the OpenAI key, database password or SSH private key in source files, Compose files, build arguments, workflow output or the frontend. `NEXT_PUBLIC_API_URL` is not secret; the workflow derives it from `API_DOMAIN` and embeds it into the Next.js build.

Generate a database password locally with a password manager or `openssl rand -base64 36`. Avoid characters that require URL escaping in this password because it is embedded in `DATABASE_URL`; a long hexadecimal value is safest.

## 3. Configure the instance

Run **Actions → Configure EC2 → Run workflow** once. It installs Docker Engine and the Compose plugin, enables Docker at boot, creates `/opt/boardforge`, configures a persistent 4 GB swap file to protect container builds from memory exhaustion, and configures UFW for SSH, HTTP and HTTPS.

The workflow assumes a fresh Ubuntu host and a user with passwordless `sudo`, as provided by the standard Ubuntu EC2 image. Confirm that the workflow succeeds before deploying.

The configuration workflow is idempotent and can be rerun on an existing instance. If a deployment previously failed with `signal: killed` during `pnpm install` or `next build`, rerun **Configure EC2** to add the swap file, then rerun **Deploy production**. Production images are built sequentially to keep peak memory usage bounded.

## 4. Deploy

Every successful `CI` run on `main` triggers **Deploy production**. It:

1. checks out the exact commit verified by CI;
2. transfers a Git archive and a mode-`0600` runtime environment file over SSH;
3. builds and starts `compose.production.yaml` on EC2;
4. preserves PostgreSQL and Caddy data in named volumes;
5. verifies the public API health endpoint and homepage over HTTPS.

The deployment can also be started manually from the Actions tab. Releases live under `/opt/boardforge/releases/<commit-sha>` and `/opt/boardforge/current` points to the active source release.

## 5. Operational checks

On the instance:

```bash
cd /opt/boardforge/current
docker compose --project-name boardforge \
  --env-file /opt/boardforge/shared/.env.production \
  -f compose.production.yaml ps

docker compose --project-name boardforge \
  --env-file /opt/boardforge/shared/.env.production \
  -f compose.production.yaml logs --tail=200
```

From any machine:

```bash
curl --fail https://api.example.com/health
curl --fail https://play.example.com/
```

Test room creation and joining from two separate browsers or phones before submitting. Keep the instance, DNS and OpenAI project active and free to access until the hackathon judging period ends.

## Rollback

Choose a previous SHA from `/opt/boardforge/releases`, then run its Compose definition with the shared environment file. Database migrations are currently forward-only, so take an EBS snapshot before schema-changing deployments.

```bash
cd /opt/boardforge/releases/PREVIOUS_SHA
docker compose --project-name boardforge \
  --env-file /opt/boardforge/shared/.env.production \
  -f compose.production.yaml up --detach --build --remove-orphans
ln -sfn /opt/boardforge/releases/PREVIOUS_SHA /opt/boardforge/current
```
