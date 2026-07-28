# SipWise

**⚠️ Disclaimer: This app was developed by AI. Use at your own risk.**

SipWise is a Blood Alcohol Content (BAC) calculator and consumption tracker web application. It helps users monitor their estimated alcohol levels in real-time based on their profile and drink history.

## Features

- **BAC Calculator:** Real-time estimation of Blood Alcohol Content.
- **Drink Logger:** Easily log drinks with preset types (Beer, Wine, Spirits).
- **Quick Drink:** Instantly add your favorite drink from the dashboard.
- **History Tracking:** View a chronological log of your drinks.
- **Sober Notifications:** Automatic local and Web Push alerts when your BAC reaches 0.00%.
- **Calorie Tracking:** Tracks calorie intake for each drink with optional manual override or smart heuristic estimations based on drink type (beer, wine, spirit).
- **Inventory Stock Mode:** Track your stock/inventory of drinks (e.g., vodka bottles, beer cans). Choose from inventory when logging a drink to automatically deduct remaining volumes or quantities. Toggle modes in settings.
- **BAC Graph:** Visual representation of your BAC over time.
- **PWA Support:** Installable on mobile and desktop for offline use.
- **Dual Deployment:** Run fully self-hosted with Docker + PostgreSQL, or use Supabase cloud.

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite
- **Styling:** Vanilla CSS
- **Charts:** Recharts
- **Database:** Supabase (cloud) or PostgreSQL (local)
- **Local Backend:** Hono (Node.js)
- **Deployment:** GitHub Pages or Docker

---

## Getting Started

### Prerequisites

- Node.js (v22 or higher recommended)
- npm
- A Supabase account and project

### Local Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/m1ckyb/sipwise.git
   cd sipwise
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Create a `.env` file in the root directory and add your Supabase credentials:
   ```env
   VITE_SUPABASE_URL=your_supabase_project_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. **Run the development server:**
   ```bash
   npm run dev
   ```
   The app will be available at `http://localhost:5173`.

---

## Local / Self-Hosted Deployment

Run SipWise entirely on your own hardware with Docker Compose. No Supabase account needed.

### Prerequisites

- Docker and Docker Compose
- (Optional) A VAPID key pair for push notifications — generate with `npx web-push generate-vapid-keys`

### Quick Start

1. **Clone and configure:**
   ```bash
   git clone https://github.com/m1ckyb/sipwise.git
   cd sipwise
   cp docker/.env.example docker/.env
   ```
   Edit `docker/.env` — at minimum, set `JWT_SECRET` and your VAPID keys.

2. **Start everything:**
   ```bash
   docker compose --env-file docker/.env up -d
   ```
   SipWise will be available at `http://localhost:8080` (configurable via `PORT` in `docker/.env`).

3. **Create an account** using the Sign Up form in the Profile section.

### How It Works

- **Environment toggle:** Setting `VITE_API_URL=/api` activates local mode. When absent, the app uses Supabase.
- **PostgreSQL** stores users, data, push subscriptions, API keys, and error logs with `sipwise_`-prefixed tables.
- **Nginx** reverse-proxies `/api/*` to the Hono backend on port 3000.
- **`node-cron`** runs a sober alert checker every 5 minutes (replacing Supabase's `pg_cron`).

### External REST API

The local deployment includes a REST API for Home Assistant and other integrations:

```bash
# Generate an API key (requires JWT auth from login)
curl -X POST http://localhost:8080/api/keys \
  -H "Authorization: Bearer <your-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"name": "Home Assistant"}'

# Fetch BAC data (uses API key)
curl http://localhost:8080/api/bac \
  -H "x-api-key: sw_<your-api-key>"

# Add a drink
curl -X POST http://localhost:8080/api/bac \
  -H "x-api-key: sw_<your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{"action":"add_drink","volume":330,"abv":5,"name":"Beer"}'
```

## Inventory Stock Mode

SipWise includes a robust digital inventory system to manage the drinks you have at home. This can be enabled by navigating to **Profile Settings** -> **App Mode** and selecting **Inventory Stock Mode**.

### Key Features:
- **Tracking Types**:
  - **Containers (e.g. Spirits / Wine)**: Tracks total unopened bottles and remaining volume (ml) in the active container. Shows remaining standard shots left (assuming 30ml/shot).
  - **Individual units (e.g. Cans / Bottles)**: Tracks simple unit stock count (deducted in whole numbers).
- **Auto-Deduction**:
  - When active, logging a drink from the **From Stock** tab in the drink logger automatically deducts volume.
  - Logging via custom input, presets, or dashboard quick actions (`↩ Last Drink` / `⚡ Quick Drink`) will automatically trigger stock deduction if the drink name matches an inventory item (case-insensitively and trimmed).
- **Stock Controls & Editing**:
  - Use the `-1` / `+1` buttons on the inventory cards to quick-adjust unopened quantity.
  - Editing a container item allows you to manually adjust the **MLs Left** in the active bottle.
- **Auto Re-credit on Delete**:
  - Deleting a logged drink from your history automatically re-credits that volume back to the corresponding inventory item, correctly incrementing your unopened bottle counts if the active container overflows.

---

## API for Home Assistant & Integrations

You can query your live BAC data via a Supabase Edge Function. This allows integrations like Home Assistant to fetch your exact alcohol status securely using an API key.

1. Open the Supabase Dashboard -> SQL Editor or run CLI migrations.
2. The `api_keys` table is created automatically by the database migrations under `supabase/migrations/`.
3. Once the database is migrated, insert a new row in the `api_keys` table:
   - Provide your Supabase User ID in `user_id`.
   - Provide a securely generated string for `key` (this will be your API Key).

### 2. Deploy Edge Function
Ensure you have the Supabase CLI installed, then run:
```bash
supabase functions deploy api --no-verify-jwt
```
*Note: Make sure your Edge Function has access to the `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL` via the Supabase Dashboard -> Edge Functions -> Secrets.*

### 3. API Usage

Make requests to your Edge Function URL:
**Endpoint:** `https://<YOUR_SUPABASE_PROJECT_REF>.supabase.co/functions/v1/api`

**Headers (Required for all requests):**
- `x-api-key`: Your generated API Key from step 1.

#### GET Request (Fetch BAC & Drinks)
You can append `?limit=10` to limit the number of returned drinks (default is 50).

**Response Example:**
```json
{
  "current_bac": 0.045,
  "time_to_zero_hours": 3.0,
  "is_sober": false,
  "recent_drinks_24h_count": 3,
  "last_drink_time": "2026-06-09T08:00:00.000Z",
  "unit": "%",
  "drinks": [
    {
      "id": "e81e1a5a-8d19-48c5-9c8e-324200b3e7f4",
      "volume": 330,
      "abv": 5.0,
      "name": "Beer",
      "timestamp": 1715000000000,
      "timestamp_iso": "2024-05-06T12:53:20.000Z"
    }
  ]
}
```

#### POST Request (Add Drink)

**Body:**
```json
{
  "action": "add_drink",
  "volume": 330,
  "abv": 5.0,
  "name": "Beer",
  "timestamp": 1715000000000 
}
```
*Note: `timestamp` is optional. If omitted, the current time is used.*

---

## Deployment to GitHub Pages

This project is configured for automated deployment via GitHub Actions.

### 1. Configure `vite.config.ts`

Ensure the `base` property in `vite.config.ts` matches your repository name:
```typescript
export default defineConfig({
  base: '/sipwise/', // Replace with your repository name
  // ... rest of the config
})
```

### 2. Set Up GitHub Secrets

To allow the GitHub Action to build the project, you need to add your Supabase environment variables as Secrets in your GitHub repository:

1. Go to your repository on GitHub.
2. Navigate to **Settings > Secrets and variables > Actions**.
3. Add the following **New repository secrets**:
   - `VITE_SUPABASE_URL`: Your Supabase URL.
   - `VITE_SUPABASE_ANON_KEY`: Your Supabase Anon Key.

### 3. Deploying

- **Automated:** Every push to the `main` branch will trigger the "Build and Deploy" workflow defined in `.github/workflows/deploy.yml`. This will automatically build and publish the site to the `gh-pages` branch.
- **Manual:** You can also deploy manually using the following command:
  ```bash
  npm run deploy
  ```

### 4. Enable GitHub Pages

1. Go to your repository **Settings > Pages**.
2. Under **Build and deployment > Branch**, ensure the branch is set to `gh-pages` and the folder is `/ (root)`.

---

## Development

- `npm run dev`: Start development server.
- `npm run build`: Build for production.
- `npm run lint`: Run ESLint.
- `npm test`: Run unit tests using Vitest.
- `npm run preview`: Preview the production build locally.
