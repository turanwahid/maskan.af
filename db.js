const path = require("path");
const bcrypt = require("bcrypt");
const Database = require("better-sqlite3");

const db = new Database(path.join(__dirname, "data", "app.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    phone TEXT,
    agency_name TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS properties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    type TEXT NOT NULL,
    listing_type TEXT NOT NULL DEFAULT 'sale',
    price INTEGER NOT NULL,
    city TEXT NOT NULL,
    canton TEXT NOT NULL,
    postcode TEXT NOT NULL,
    bedrooms INTEGER NOT NULL DEFAULT 0,
    bathrooms INTEGER NOT NULL DEFAULT 0,
    area_sqm INTEGER NOT NULL,
    image_url TEXT NOT NULL,
    featured INTEGER NOT NULL DEFAULT 0,
    owner_id INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS saved_listings (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, property_id)
  );

  CREATE TABLE IF NOT EXISTS inquiries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    agent_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Older databases created before the "phone"/"agency_name" columns existed
const userColumns = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
if (!userColumns.includes("phone")) db.exec("ALTER TABLE users ADD COLUMN phone TEXT");
if (!userColumns.includes("agency_name")) db.exec("ALTER TABLE users ADD COLUMN agency_name TEXT");

function seed() {
  const userCount = db.prepare("SELECT COUNT(*) AS n FROM users").get().n;

  if (userCount === 0) {
    const adminHash = bcrypt.hashSync("admin123", 10);
    const demoHash = bcrypt.hashSync("demo1234", 10);
    const agentHash = bcrypt.hashSync("agent1234", 10);

    db.prepare(
      "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)"
    ).run("Site Admin", "admin@newhome.ch", adminHash, "admin");

    db.prepare(
      "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)"
    ).run("Demo User", "demo@newhome.ch", demoHash, "user");

    db.prepare(
      "INSERT INTO users (name, email, password_hash, role, phone, agency_name) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("Anna Keller", "agent@newhome.ch", agentHash, "agent", "+41 79 555 12 34", "Keller Immobilien");
  }

  const propertyCount = db.prepare("SELECT COUNT(*) AS n FROM properties").get().n;

  if (propertyCount === 0) {
    const admin = db.prepare("SELECT id FROM users WHERE role = 'admin'").get();
    const agent = db.prepare("SELECT id FROM users WHERE role = 'agent'").get();

    const listings = [
      {
        title: "Modern Lakeview Apartment",
        description:
          "Bright 3.5-room apartment with panoramic views over Lake Zurich, floor heating, and a private balcony.",
        type: "Apartment",
        listing_type: "sale",
        price: 1250000,
        city: "Zurich",
        canton: "ZH",
        postcode: "8001",
        bedrooms: 2,
        bathrooms: 2,
        area_sqm: 95,
        image_url: "https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=900&q=80",
        featured: 1,
      },
      {
        title: "Cozy Chalet in the Alps",
        description:
          "Traditional wooden chalet close to the ski slopes, featuring an open fireplace and mountain views.",
        type: "Chalet",
        listing_type: "sale",
        price: 1890000,
        city: "Zermatt",
        canton: "VS",
        postcode: "3920",
        bedrooms: 4,
        bathrooms: 3,
        area_sqm: 180,
        image_url: "https://images.unsplash.com/photo-1518780664697-55e3ad937233?auto=format&fit=crop&w=900&q=80",
        featured: 1,
      },
      {
        title: "Family House near Bubikon",
        description:
          "Spacious detached house with a garden, double garage, and quick access to Zurich by train.",
        type: "House",
        listing_type: "sale",
        price: 1590000,
        city: "Bubikon",
        canton: "ZH",
        postcode: "8608",
        bedrooms: 5,
        bathrooms: 3,
        area_sqm: 210,
        image_url: "https://images.unsplash.com/photo-1568605114967-8130f3a36994?auto=format&fit=crop&w=900&q=80",
        featured: 1,
      },
      {
        title: "Old Town Studio",
        description:
          "Charming studio in Bern's historic old town, freshly renovated with exposed wooden beams.",
        type: "Studio",
        listing_type: "rent",
        price: 1650,
        city: "Bern",
        canton: "BE",
        postcode: "3011",
        bedrooms: 1,
        bathrooms: 1,
        area_sqm: 38,
        image_url: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=900&q=80",
        featured: 0,
      },
      {
        title: "Lakeside Villa Geneva",
        description:
          "Exclusive villa with private lake access, wine cellar, and a landscaped garden.",
        type: "Villa",
        listing_type: "sale",
        price: 4200000,
        city: "Geneva",
        canton: "GE",
        postcode: "1201",
        bedrooms: 6,
        bathrooms: 5,
        area_sqm: 340,
        image_url: "https://images.unsplash.com/photo-1613977257363-707ba9348227?auto=format&fit=crop&w=900&q=80",
        featured: 1,
      },
      {
        title: "Basel City Apartment",
        description:
          "Modern 2.5-room apartment close to the Rhine, ideal for young professionals.",
        type: "Apartment",
        listing_type: "rent",
        price: 2100,
        city: "Basel",
        canton: "BS",
        postcode: "4051",
        bedrooms: 1,
        bathrooms: 1,
        area_sqm: 62,
        image_url: "https://images.unsplash.com/photo-1524230572899-a752b3835840?auto=format&fit=crop&w=900&q=80",
        featured: 0,
      },
      {
        title: "Lucerne Riverside Flat",
        description:
          "3-room flat with a view of the Reuss river, minutes from Lucerne's old town.",
        type: "Apartment",
        listing_type: "rent",
        price: 2450,
        city: "Lucerne",
        canton: "LU",
        postcode: "6003",
        bedrooms: 2,
        bathrooms: 1,
        area_sqm: 78,
        image_url: "https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=900&q=80",
        featured: 0,
      },
      {
        title: "Lugano Hillside House",
        description:
          "Sun-drenched house on the hills above Lugano with a pool and views over Lake Lugano.",
        type: "House",
        listing_type: "sale",
        price: 2650000,
        city: "Lugano",
        canton: "TI",
        postcode: "6900",
        bedrooms: 4,
        bathrooms: 3,
        area_sqm: 220,
        image_url: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=900&q=80",
        featured: 0,
      },
    ];

    const insert = db.prepare(`
      INSERT INTO properties
        (title, description, type, listing_type, price, city, canton, postcode, bedrooms, bathrooms, area_sqm, image_url, featured, owner_id)
      VALUES (@title, @description, @type, @listing_type, @price, @city, @canton, @postcode, @bedrooms, @bathrooms, @area_sqm, @image_url, @featured, @owner_id)
    `);

    const insertMany = db.transaction((rows) => {
      rows.forEach((row, i) => {
        // Give the demo agent a couple of listings so the agent dashboard has data
        const owner_id = i === 0 || i === 3 ? agent.id : admin.id;
        insert.run({ ...row, owner_id });
      });
    });

    insertMany(listings);
  }
}

seed();

module.exports = db;
