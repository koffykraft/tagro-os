# TAGRO OS v1 — System Deployment Guide

## Setup and Installation

### 1. Clone & Set Up the Repository Layout
```bash
mkdir tagro-os && cd tagro-os
npm init -y
npm install wrangler --save-dev
```

### 2. Create the Production Event Database Cloud Store
```bash
npx wrangler kv:namespace create "TAGRO_LEDGER_KV"
```
*Copy the generated namespace hash ID string and replace the placeholder inside your wrangler.toml file.*

### 3. Local Sandbox Verification Testing
```bash
npx wrangler dev
```

### 4. Direct Production Live Sync Push Deployment
```bash
npx wrangler deploy
```
