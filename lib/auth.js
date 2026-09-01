const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "maskan-dev-jwt-secret";

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: "30d" }
  );
}

function getToken(req) {
  const header = req.headers.authorization;
  return header && header.startsWith("Bearer ") ? header.slice(7) : null;
}

function authenticateToken(req, res, next) {
  const token = getToken(req);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });
  try {
    req.apiUser = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

function optionalAuth(req, res, next) {
  const token = getToken(req);
  if (token) {
    try {
      req.apiUser = jwt.verify(token, JWT_SECRET);
    } catch {
      // ignore invalid token on optional routes
    }
  }
  next();
}

function requireAgent(req, res, next) {
  if (!req.apiUser || (req.apiUser.role !== "agent" && req.apiUser.role !== "admin")) {
    return res.status(403).json({ error: "Agent access required" });
  }
  next();
}

module.exports = { signToken, authenticateToken, optionalAuth, requireAgent };
