# newhome.ch (demo)

A Swiss real estate listing platform — browse and search properties, save favorites as a logged-in user, and manage listings through an admin panel.

## Stack

Node.js, Express, EJS templates, better-sqlite3 (file-based SQL database), express-session for auth.

## Run it

```bash
npm install
npm start
```

Then open http://localhost:3000

The database is created and seeded automatically on first run (`data/app.db`).

## Demo accounts

- **Admin**: `admin@newhome.ch` / `admin123` — can create, edit, and delete listings at `/admin`
- **User**: `demo@newhome.ch` / `demo1234` — can save/unsave listings

## Features

- Property search with filters (city, canton, type, sale/rent, bedrooms, max price)
- Property detail pages
- User accounts (register/login) with saved listings
- Admin panel for full CRUD on properties
