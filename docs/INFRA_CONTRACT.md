# Pump API Infra Contract

This repository builds and publishes the Pump backend image consumed by the production infrastructure repository.

## Image

Published image:

- `ghcr.io/thesaiteja24/pump-api:latest`
- `ghcr.io/thesaiteja24/pump-api:<git-sha>`

The same image is used for:

- API container
- reminder worker container
- one-shot migration job

The infrastructure repository decides which command each service runs.

## Runtime endpoints

The backend exposes:

- health: `/api/v1/health`
- OpenAPI JSON: `/docs/json`
- docs UI and login flow:
  - `/docs`
  - `/docs/login`
  - `/docs/login/callback`
- account page:
  - `/delete-account`

## Reverse proxy requirements

For `pump.thesaiteja.dev`, the proxy must route these backend paths to the Pump API service:

- `/api/v1*`
- `/docs*`
- `/delete-account`

All other `pump.thesaiteja.dev` paths can later route to the Pump web frontend.

## Runtime environment

The production infrastructure must provide runtime env files on the server. This repository does not ship production secrets.

Minimum expected env contract is documented in [.env.example](../.env.example).

The Pump API service and Pump reminder worker are expected to share the same runtime env file.

## Container health

The image healthcheck uses:

- `http://127.0.0.1:${PORT:-3000}/api/v1/health`

The infrastructure must set `PORT` consistently with the container command binding.

## Deployment verification

Recommended smoke checks after deploy:

- `GET /api/v1/health`
- `GET /docs/json`
