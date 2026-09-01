const express = require("express");
const bcrypt = require("bcrypt");
const db = require("../db");
const { signToken, authenticateToken, optionalAuth, requireAgent } = require("../lib/auth");

const router = express.Router();

const CANTONS = ["ZH", "BE", "LU", "VS", "GE", "BS", "TI", "VD", "SG", "AG"];
const TYPES = ["Apartment", "House", "Villa", "Chalet", "Studio"];

function publicUser(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    phone: u.phone,
    agencyName: u.agency_name,
  };
}

function publicProperty(p, favoriteIds) {
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    type: p.type,
    listingType: p.listing_type,
    price: p.price,
    city: p.city,
    canton: p.canton,
    postcode: p.postcode,
    bedrooms: p.bedrooms,
    bathrooms: p.bathrooms,
    areaSqm: p.area_sqm,
    imageUrl: p.image_url,
    featured: Boolean(p.featured),
    ownerId: p.owner_id,
    createdAt: p.created_at,
    isFavorite: favoriteIds ? favoriteIds.has(p.id) : false,
  };
}

function favoriteIdsFor(userId) {
  if (!userId) return new Set();
  return new Set(
    db.prepare("SELECT property_id FROM saved_listings WHERE user_id = ?").all(userId).map((r) => r.property_id)
  );
}

// ---------- Meta ----------

router.get("/meta", (req, res) => {
  res.json({ cantons: CANTONS, types: TYPES });
});

// ---------- Auth ----------

router.post("/auth/register", (req, res) => {
  const { name, email, password, role, phone, agencyName } = req.body || {};

  if (!name || !email || !password || password.length < 6) {
    return res.status(400).json({ error: "Name, email and a password (min 6 characters) are required." });
  }

  const safeRole = role === "agent" ? "agent" : "user";
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) {
    return res.status(409).json({ error: "An account with that email already exists." });
  }

  const hash = bcrypt.hashSync(password, 10);
  const result = db
    .prepare(
      "INSERT INTO users (name, email, password_hash, role, phone, agency_name) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(name, email, hash, safeRole, phone || null, safeRole === "agent" ? agencyName || null : null);

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

router.post("/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  res.json({ token: signToken(user), user: publicUser(user) });
});

router.get("/auth/me", authenticateToken, (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.apiUser.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ user: publicUser(user) });
});

// ---------- Listings ----------

router.get("/listings", optionalAuth, (req, res) => {
  const {
    city,
    canton,
    type,
    listingType,
    minPrice,
    maxPrice,
    bedrooms,
    ownerId,
    page = 1,
    pageSize = 20,
  } = req.query;

  let sql = "SELECT * FROM properties WHERE 1=1";
  const params = {};

  if (city) {
    sql += " AND city LIKE @city";
    params.city = `%${city}%`;
  }
  if (canton) {
    sql += " AND canton = @canton";
    params.canton = canton;
  }
  if (type) {
    sql += " AND type = @type";
    params.type = type;
  }
  if (listingType) {
    sql += " AND listing_type = @listingType";
    params.listingType = listingType;
  }
  if (minPrice) {
    sql += " AND price >= @minPrice";
    params.minPrice = Number(minPrice);
  }
  if (maxPrice) {
    sql += " AND price <= @maxPrice";
    params.maxPrice = Number(maxPrice);
  }
  if (bedrooms) {
    sql += " AND bedrooms >= @bedrooms";
    params.bedrooms = Number(bedrooms);
  }
  if (ownerId) {
    sql += " AND owner_id = @ownerId";
    params.ownerId = Number(ownerId);
  }
  sql += " ORDER BY created_at DESC";

  const all = db.prepare(sql).all(params);
  const size = Math.min(Number(pageSize) || 20, 50);
  const start = (Math.max(Number(page) || 1, 1) - 1) * size;
  const pageRows = all.slice(start, start + size);
  const favoriteIds = favoriteIdsFor(req.apiUser && req.apiUser.id);

  res.json({
    listings: pageRows.map((p) => publicProperty(p, favoriteIds)),
    total: all.length,
    page: Number(page) || 1,
    pageSize: size,
  });
});

router.get("/listings/:id", optionalAuth, (req, res) => {
  const property = db.prepare("SELECT * FROM properties WHERE id = ?").get(req.params.id);
  if (!property) return res.status(404).json({ error: "Listing not found" });

  const favoriteIds = favoriteIdsFor(req.apiUser && req.apiUser.id);
  const owner = db
    .prepare("SELECT id, name, email, phone, agency_name FROM users WHERE id = ?")
    .get(property.owner_id);

  res.json({
    listing: publicProperty(property, favoriteIds),
    agent: owner
      ? { id: owner.id, name: owner.name, email: owner.email, phone: owner.phone, agencyName: owner.agency_name }
      : null,
  });
});

router.post("/listings", authenticateToken, requireAgent, (req, res) => {
  const p = req.body || {};

  if (!p.title || !p.description || !p.type || !p.price || !p.city || !p.canton || !p.postcode || !p.areaSqm || !p.imageUrl) {
    return res.status(400).json({ error: "Missing required listing fields." });
  }

  const result = db
    .prepare(
      `INSERT INTO properties
        (title, description, type, listing_type, price, city, canton, postcode, bedrooms, bathrooms, area_sqm, image_url, featured, owner_id)
       VALUES (@title, @description, @type, @listing_type, @price, @city, @canton, @postcode, @bedrooms, @bathrooms, @area_sqm, @image_url, @featured, @owner_id)`
    )
    .run({
      title: p.title,
      description: p.description,
      type: p.type,
      listing_type: p.listingType === "rent" ? "rent" : "sale",
      price: Number(p.price),
      city: p.city,
      canton: p.canton,
      postcode: p.postcode,
      bedrooms: Number(p.bedrooms || 0),
      bathrooms: Number(p.bathrooms || 0),
      area_sqm: Number(p.areaSqm),
      image_url: p.imageUrl,
      featured: p.featured ? 1 : 0,
      owner_id: req.apiUser.id,
    });

  const created = db.prepare("SELECT * FROM properties WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json({ listing: publicProperty(created) });
});

function ownedProperty(req, res, next) {
  const property = db.prepare("SELECT * FROM properties WHERE id = ?").get(req.params.id);
  if (!property) return res.status(404).json({ error: "Listing not found" });
  if (property.owner_id !== req.apiUser.id && req.apiUser.role !== "admin") {
    return res.status(403).json({ error: "You do not own this listing." });
  }
  req.property = property;
  next();
}

router.put("/listings/:id", authenticateToken, requireAgent, ownedProperty, (req, res) => {
  const p = req.body || {};
  const current = req.property;

  db.prepare(
    `UPDATE properties SET
      title=@title, description=@description, type=@type, listing_type=@listing_type,
      price=@price, city=@city, canton=@canton, postcode=@postcode,
      bedrooms=@bedrooms, bathrooms=@bathrooms, area_sqm=@area_sqm,
      image_url=@image_url, featured=@featured
     WHERE id=@id`
  ).run({
    id: current.id,
    title: p.title ?? current.title,
    description: p.description ?? current.description,
    type: p.type ?? current.type,
    listing_type: p.listingType ? (p.listingType === "rent" ? "rent" : "sale") : current.listing_type,
    price: p.price !== undefined ? Number(p.price) : current.price,
    city: p.city ?? current.city,
    canton: p.canton ?? current.canton,
    postcode: p.postcode ?? current.postcode,
    bedrooms: p.bedrooms !== undefined ? Number(p.bedrooms) : current.bedrooms,
    bathrooms: p.bathrooms !== undefined ? Number(p.bathrooms) : current.bathrooms,
    area_sqm: p.areaSqm !== undefined ? Number(p.areaSqm) : current.area_sqm,
    image_url: p.imageUrl ?? current.image_url,
    featured: p.featured !== undefined ? (p.featured ? 1 : 0) : current.featured,
  });

  const updated = db.prepare("SELECT * FROM properties WHERE id = ?").get(current.id);
  res.json({ listing: publicProperty(updated) });
});

router.delete("/listings/:id", authenticateToken, requireAgent, ownedProperty, (req, res) => {
  db.prepare("DELETE FROM properties WHERE id = ?").run(req.property.id);
  res.status(204).end();
});

// ---------- Favorites ----------

router.get("/favorites", authenticateToken, (req, res) => {
  const rows = db
    .prepare(
      `SELECT properties.* FROM properties
       JOIN saved_listings ON saved_listings.property_id = properties.id
       WHERE saved_listings.user_id = ?
       ORDER BY saved_listings.created_at DESC`
    )
    .all(req.apiUser.id);

  const favoriteIds = new Set(rows.map((r) => r.id));
  res.json({ listings: rows.map((p) => publicProperty(p, favoriteIds)) });
});

router.post("/listings/:id/favorite", authenticateToken, (req, res) => {
  const propertyId = Number(req.params.id);
  const property = db.prepare("SELECT id FROM properties WHERE id = ?").get(propertyId);
  if (!property) return res.status(404).json({ error: "Listing not found" });

  const existing = db
    .prepare("SELECT 1 FROM saved_listings WHERE user_id = ? AND property_id = ?")
    .get(req.apiUser.id, propertyId);

  if (existing) {
    db.prepare("DELETE FROM saved_listings WHERE user_id = ? AND property_id = ?").run(req.apiUser.id, propertyId);
    return res.json({ favorited: false });
  }

  db.prepare("INSERT INTO saved_listings (user_id, property_id) VALUES (?, ?)").run(req.apiUser.id, propertyId);
  res.json({ favorited: true });
});

// ---------- Inquiries ----------

router.post("/listings/:id/inquiries", optionalAuth, (req, res) => {
  const property = db.prepare("SELECT * FROM properties WHERE id = ?").get(req.params.id);
  if (!property) return res.status(404).json({ error: "Listing not found" });

  const { name, email, phone, message } = req.body || {};
  if (!name || !email || !message) {
    return res.status(400).json({ error: "Name, email and message are required." });
  }

  const result = db
    .prepare(
      `INSERT INTO inquiries (property_id, agent_id, user_id, name, email, phone, message)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(property.id, property.owner_id, req.apiUser ? req.apiUser.id : null, name, email, phone || null, message);

  res.status(201).json({ id: result.lastInsertRowid });
});

// ---------- Agent ----------

router.get("/agent/listings", authenticateToken, requireAgent, (req, res) => {
  const rows = db
    .prepare("SELECT * FROM properties WHERE owner_id = ? ORDER BY created_at DESC")
    .all(req.apiUser.id);
  res.json({ listings: rows.map((p) => publicProperty(p)) });
});

router.get("/agent/inquiries", authenticateToken, requireAgent, (req, res) => {
  const rows = db
    .prepare(
      `SELECT inquiries.*, properties.title AS property_title FROM inquiries
       JOIN properties ON properties.id = inquiries.property_id
       WHERE inquiries.agent_id = ?
       ORDER BY inquiries.created_at DESC`
    )
    .all(req.apiUser.id);

  res.json({
    inquiries: rows.map((r) => ({
      id: r.id,
      propertyId: r.property_id,
      propertyTitle: r.property_title,
      name: r.name,
      email: r.email,
      phone: r.phone,
      message: r.message,
      status: r.status,
      createdAt: r.created_at,
    })),
  });
});

module.exports = router;
