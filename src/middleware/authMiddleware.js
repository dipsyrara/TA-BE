const jwt = require("jsonwebtoken");
require("dotenv").config();

const verifyToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];

  if (!authHeader) {
    return res
      .status(403)
      .json({ message: "Akses ditolak. Header otentikasi tidak ditemukan." });
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return res
      .status(403)
      .json({ message: "Akses ditolak. Token tidak ditemukan." });
  }

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    req.user = verified;

    next();
  } catch (err) {
    console.error("[AUTH ERROR]", err.message);
    return res
      .status(403)
      .json({ message: "Token tidak valid atau kadaluarsa." });
  }
};

const authorizeRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res
        .status(401)
        .json({ message: "Unauthorized: User data not found." });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        message: `Forbidden: Role '${req.user.role}' tidak diizinkan mengakses fitur ini.`,
      });
    }

    next();
  };
};

module.exports = { verifyToken, authorizeRole };
