# maskan

A Swiss real estate platform: a website plus a JSON API that powers a companion
iOS/Android app ([`../real-estate-mobile`](../real-estate-mobile)). Buyers browse
and search listings, save favorites, and contact agents. Agents list and manage
their own properties and see incoming buyer inquiries. Admins manage everything.

## Stack

Node.js, Express, EJS templates (website), a JSON REST API secured with JWT
(mobile app + any future client), better-sqlite3 (file-based SQL database),
express-session for the website's own auth.

## Run it

```bash
npm install
npm start        # or: npm run dev (auto-restarts on change)
```

Then open http://localhost:3000. The database is created and seeded
automatically on first run (`data/app.db`).

## Demo accounts

- **Admin**: `admin@maskan.af` / `admin123` — full control at `/admin`
- **Buyer**: `demo@maskan.af` / `demo1234` — can save listings, send inquiries
- **Agent**: `agent@maskan.af` / `agent1234` — owns 2 seeded listings, manages them at `/agent`, sees buyer messages at `/agent/inquiries`

## Website features

- Property search with filters (city, canton, type, sale/rent, bedrooms, max price)
- Property detail pages with a "contact the agent" inquiry form
- Buyer accounts (register/login) with saved listings
- Agent accounts: create/edit/delete their own listings, view inquiries sent to them
- Admin panel for full CRUD on every property

## JSON API (for the mobile app)

Mounted at `/api`, stateless and JWT-based (independent of the website's session
auth), CORS-enabled. See [`routes/api.js`](routes/api.js) for the full route list:

- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- `GET /api/listings`, `GET /api/listings/:id` (search/filter via query params)
- `POST /api/listings`, `PUT /api/listings/:id`, `DELETE /api/listings/:id` (agent-owned)
- `GET /api/favorites`, `POST /api/listings/:id/favorite`
- `POST /api/listings/:id/inquiries`
- `GET /api/agent/listings`, `GET /api/agent/inquiries`

Set `JWT_SECRET` in the environment for anything beyond local dev — it falls
back to a dev-only default otherwise.

## Deployment

See [`../DEPLOYMENT.md`](../DEPLOYMENT.md) for what's needed to take this to
production (hosting, database, secrets, app store submission for the mobile app).
