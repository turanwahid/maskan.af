const path = require("path");
const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const bcrypt = require("bcrypt");
const cors = require("cors");
const db = require("./db");
const apiRouter = require("./routes/api");

const app = express();
const PORT = process.env.PORT || 3000;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// JSON REST API — used by the mobile app (and any future clients). Stateless
// JWT auth, independent of the session-based auth used by the EJS website.
app.use("/api", cors(), express.json(), apiRouter);

app.use(
  session({
    store: new SQLiteStore({ db: "sessions.db", dir: path.join(__dirname, "data") }),
    secret: process.env.SESSION_SECRET || "maskan-dev-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 },
  })
);

// Make current user + flash-style message available in every view
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.message = req.session.message || null;
  delete req.session.message;
  next();
});

function flash(req, message) {
  req.session.message = message;
}

function requireAuth(req, res, next) {
  if (!req.session.user) {
    flash(req, { type: "error", text: "Please log in to continue." });
    return res.redirect("/login");
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== "admin") {
    flash(req, { type: "error", text: "Admin access required." });
    return res.redirect("/login");
  }
  next();
}

function requireAgent(req, res, next) {
  if (!req.session.user || (req.session.user.role !== "agent" && req.session.user.role !== "admin")) {
    flash(req, { type: "error", text: "Agent access required." });
    return res.redirect("/login");
  }
  next();
}

const CANTONS = ["ZH", "BE", "LU", "VS", "GE", "BS", "TI", "VD", "SG", "AG"];
const TYPES = ["Apartment", "House", "Villa", "Chalet", "Studio"];

// ---------- Public site ----------

app.get("/", (req, res) => {
  const featured = db
    .prepare("SELECT * FROM properties WHERE featured = 1 ORDER BY created_at DESC LIMIT 6")
    .all();

  res.render("home", { title: "Home", featured, cantons: CANTONS, types: TYPES });
});

app.get("/listings", (req, res) => {
  const { city, canton, type, listing_type, min_price, max_price, bedrooms } = req.query;

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
  if (listing_type) {
    sql += " AND listing_type = @listing_type";
    params.listing_type = listing_type;
  }
  if (min_price) {
    sql += " AND price >= @min_price";
    params.min_price = Number(min_price);
  }
  if (max_price) {
    sql += " AND price <= @max_price";
    params.max_price = Number(max_price);
  }
  if (bedrooms) {
    sql += " AND bedrooms >= @bedrooms";
    params.bedrooms = Number(bedrooms);
  }

  sql += " ORDER BY created_at DESC";

  const listings = db.prepare(sql).all(params);

  let savedIds = new Set();
  if (req.session.user) {
    const rows = db
      .prepare("SELECT property_id FROM saved_listings WHERE user_id = ?")
      .all(req.session.user.id);
    savedIds = new Set(rows.map((r) => r.property_id));
  }

  res.render("listings", {
    title: "Listings",
    listings,
    savedIds,
    cantons: CANTONS,
    types: TYPES,
    query: req.query,
  });
});

app.get("/listings/:id", (req, res) => {
  const property = db.prepare("SELECT * FROM properties WHERE id = ?").get(req.params.id);
  if (!property) return res.status(404).render("404");

  let isSaved = false;
  if (req.session.user) {
    isSaved = Boolean(
      db
        .prepare("SELECT 1 FROM saved_listings WHERE user_id = ? AND property_id = ?")
        .get(req.session.user.id, property.id)
    );
  }

  const agent = db
    .prepare("SELECT id, name, email, phone, agency_name FROM users WHERE id = ?")
    .get(property.owner_id);

  res.render("property", { title: property.title, property, isSaved, agent });
});

// ---------- Auth ----------

app.get("/register", (req, res) => {
  res.render("register", { title: "Sign Up" });
});

app.post("/register", (req, res) => {
  const { name, email, password, role, agency_name } = req.body;

  if (!name || !email || !password || password.length < 6) {
    flash(req, { type: "error", text: "Please fill all fields (password min 6 characters)." });
    return res.redirect("/register");
  }

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) {
    flash(req, { type: "error", text: "An account with that email already exists." });
    return res.redirect("/register");
  }

  const safeRole = role === "agent" ? "agent" : "user";
  const hash = bcrypt.hashSync(password, 10);
  const result = db
    .prepare("INSERT INTO users (name, email, password_hash, role, agency_name) VALUES (?, ?, ?, ?, ?)")
    .run(name, email, hash, safeRole, safeRole === "agent" ? agency_name || null : null);

  req.session.user = { id: result.lastInsertRowid, name, email, role: safeRole };
  flash(req, { type: "success", text: `Welcome, ${name}!` });
  res.redirect(safeRole === "agent" ? "/agent" : "/");
});

app.get("/login", (req, res) => {
  res.render("login", { title: "Log In" });
});

app.post("/login", (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    flash(req, { type: "error", text: "Invalid email or password." });
    return res.redirect("/login");
  }

  req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
  flash(req, { type: "success", text: `Welcome back, ${user.name}!` });
  const destinations = { admin: "/admin", agent: "/agent" };
  res.redirect(destinations[user.role] || "/");
});

app.post("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

// ---------- Saved listings ----------

app.post("/listings/:id/save", requireAuth, (req, res) => {
  const propertyId = req.params.id;
  const userId = req.session.user.id;

  const existing = db
    .prepare("SELECT 1 FROM saved_listings WHERE user_id = ? AND property_id = ?")
    .get(userId, propertyId);

  if (existing) {
    db.prepare("DELETE FROM saved_listings WHERE user_id = ? AND property_id = ?").run(
      userId,
      propertyId
    );
  } else {
    db.prepare("INSERT INTO saved_listings (user_id, property_id) VALUES (?, ?)").run(
      userId,
      propertyId
    );
  }

  res.redirect(req.get("Referrer") || "/listings");
});

app.get("/account/saved", requireAuth, (req, res) => {
  const listings = db
    .prepare(
      `SELECT properties.* FROM properties
       JOIN saved_listings ON saved_listings.property_id = properties.id
       WHERE saved_listings.user_id = ?
       ORDER BY saved_listings.created_at DESC`
    )
    .all(req.session.user.id);

  res.render("saved", { title: "Saved Listings", listings });
});

// ---------- Contact / inquiries ----------

app.post("/listings/:id/inquire", (req, res) => {
  const property = db.prepare("SELECT * FROM properties WHERE id = ?").get(req.params.id);
  if (!property) return res.status(404).render("404");

  const { name, email, phone, message } = req.body;
  if (!name || !email || !message) {
    flash(req, { type: "error", text: "Please fill in your name, email and a message." });
    return res.redirect(`/listings/${property.id}`);
  }

  db.prepare(
    `INSERT INTO inquiries (property_id, agent_id, user_id, name, email, phone, message)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    property.id,
    property.owner_id,
    req.session.user ? req.session.user.id : null,
    name,
    email,
    phone || null,
    message
  );

  flash(req, { type: "success", text: "Your message has been sent to the listing agent." });
  res.redirect(`/listings/${property.id}`);
});

// ---------- Agent dashboard ----------

app.get("/agent", requireAgent, (req, res) => {
  const listings = db
    .prepare("SELECT * FROM properties WHERE owner_id = ? ORDER BY created_at DESC")
    .all(req.session.user.id);

  res.render("agent/dashboard", { title: "Agent Dashboard", listings });
});

app.get("/agent/new", requireAgent, (req, res) => {
  res.render("agent/form", { title: "New Property", property: null, cantons: CANTONS, types: TYPES });
});

app.post("/agent/new", requireAgent, (req, res) => {
  const p = req.body;

  db.prepare(
    `INSERT INTO properties
      (title, description, type, listing_type, price, city, canton, postcode, bedrooms, bathrooms, area_sqm, image_url, featured, owner_id)
     VALUES (@title, @description, @type, @listing_type, @price, @city, @canton, @postcode, @bedrooms, @bathrooms, @area_sqm, @image_url, @featured, @owner_id)`
  ).run({
    title: p.title,
    description: p.description,
    type: p.type,
    listing_type: p.listing_type,
    price: Number(p.price),
    city: p.city,
    canton: p.canton,
    postcode: p.postcode,
    bedrooms: Number(p.bedrooms || 0),
    bathrooms: Number(p.bathrooms || 0),
    area_sqm: Number(p.area_sqm),
    image_url: p.image_url,
    featured: p.featured ? 1 : 0,
    owner_id: req.session.user.id,
  });

  flash(req, { type: "success", text: "Property created." });
  res.redirect("/agent");
});

function loadOwnProperty(req, res, next) {
  const property = db.prepare("SELECT * FROM properties WHERE id = ?").get(req.params.id);
  if (!property) return res.status(404).render("404");
  if (property.owner_id !== req.session.user.id && req.session.user.role !== "admin") {
    flash(req, { type: "error", text: "You can only manage your own listings." });
    return res.redirect("/agent");
  }
  req.property = property;
  next();
}

app.get("/agent/:id/edit", requireAgent, loadOwnProperty, (req, res) => {
  res.render("agent/form", { title: "Edit Property", property: req.property, cantons: CANTONS, types: TYPES });
});

app.post("/agent/:id/edit", requireAgent, loadOwnProperty, (req, res) => {
  const p = req.body;

  db.prepare(
    `UPDATE properties SET
      title = @title, description = @description, type = @type, listing_type = @listing_type,
      price = @price, city = @city, canton = @canton, postcode = @postcode,
      bedrooms = @bedrooms, bathrooms = @bathrooms, area_sqm = @area_sqm,
      image_url = @image_url, featured = @featured
     WHERE id = @id`
  ).run({
    id: req.property.id,
    title: p.title,
    description: p.description,
    type: p.type,
    listing_type: p.listing_type,
    price: Number(p.price),
    city: p.city,
    canton: p.canton,
    postcode: p.postcode,
    bedrooms: Number(p.bedrooms || 0),
    bathrooms: Number(p.bathrooms || 0),
    area_sqm: Number(p.area_sqm),
    image_url: p.image_url,
    featured: p.featured ? 1 : 0,
  });

  flash(req, { type: "success", text: "Property updated." });
  res.redirect("/agent");
});

app.post("/agent/:id/delete", requireAgent, loadOwnProperty, (req, res) => {
  db.prepare("DELETE FROM properties WHERE id = ?").run(req.property.id);
  flash(req, { type: "success", text: "Property deleted." });
  res.redirect("/agent");
});

app.get("/agent/inquiries", requireAgent, (req, res) => {
  const inquiries = db
    .prepare(
      `SELECT inquiries.*, properties.title AS property_title FROM inquiries
       JOIN properties ON properties.id = inquiries.property_id
       WHERE inquiries.agent_id = ?
       ORDER BY inquiries.created_at DESC`
    )
    .all(req.session.user.id);

  res.render("agent/inquiries", { title: "Inquiries", inquiries });
});

// ---------- Admin ----------

app.get("/admin", requireAdmin, (req, res) => {
  const listings = db.prepare("SELECT * FROM properties ORDER BY created_at DESC").all();
  res.render("admin/dashboard", { title: "Admin Dashboard", listings });
});

app.get("/admin/new", requireAdmin, (req, res) => {
  res.render("admin/form", { title: "New Property", property: null, cantons: CANTONS, types: TYPES });
});

app.post("/admin/new", requireAdmin, (req, res) => {
  const p = req.body;

  db.prepare(
    `INSERT INTO properties
      (title, description, type, listing_type, price, city, canton, postcode, bedrooms, bathrooms, area_sqm, image_url, featured, owner_id)
     VALUES (@title, @description, @type, @listing_type, @price, @city, @canton, @postcode, @bedrooms, @bathrooms, @area_sqm, @image_url, @featured, @owner_id)`
  ).run({
    title: p.title,
    description: p.description,
    type: p.type,
    listing_type: p.listing_type,
    price: Number(p.price),
    city: p.city,
    canton: p.canton,
    postcode: p.postcode,
    bedrooms: Number(p.bedrooms || 0),
    bathrooms: Number(p.bathrooms || 0),
    area_sqm: Number(p.area_sqm),
    image_url: p.image_url,
    featured: p.featured ? 1 : 0,
    owner_id: req.session.user.id,
  });

  flash(req, { type: "success", text: "Property created." });
  res.redirect("/admin");
});

app.get("/admin/:id/edit", requireAdmin, (req, res) => {
  const property = db.prepare("SELECT * FROM properties WHERE id = ?").get(req.params.id);
  if (!property) return res.status(404).render("404");
  res.render("admin/form", { title: "Edit Property", property, cantons: CANTONS, types: TYPES });
});

app.post("/admin/:id/edit", requireAdmin, (req, res) => {
  const p = req.body;

  db.prepare(
    `UPDATE properties SET
      title = @title, description = @description, type = @type, listing_type = @listing_type,
      price = @price, city = @city, canton = @canton, postcode = @postcode,
      bedrooms = @bedrooms, bathrooms = @bathrooms, area_sqm = @area_sqm,
      image_url = @image_url, featured = @featured
     WHERE id = @id`
  ).run({
    id: req.params.id,
    title: p.title,
    description: p.description,
    type: p.type,
    listing_type: p.listing_type,
    price: Number(p.price),
    city: p.city,
    canton: p.canton,
    postcode: p.postcode,
    bedrooms: Number(p.bedrooms || 0),
    bathrooms: Number(p.bathrooms || 0),
    area_sqm: Number(p.area_sqm),
    image_url: p.image_url,
    featured: p.featured ? 1 : 0,
  });

  flash(req, { type: "success", text: "Property updated." });
  res.redirect("/admin");
});

app.post("/admin/:id/delete", requireAdmin, (req, res) => {
  db.prepare("DELETE FROM properties WHERE id = ?").run(req.params.id);
  flash(req, { type: "success", text: "Property deleted." });
  res.redirect("/admin");
});

app.use((req, res) => {
  res.status(404).render("404");
});

app.listen(PORT, () => {
  console.log(`maskan running at http://localhost:${PORT}`);
});
