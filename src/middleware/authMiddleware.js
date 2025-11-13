const jwt = require("jsonwebtoken");
require("dotenv").config();

const { JWT_SECRET } = process.env;

const verifyToken = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ 
            message: "Akses ditolak. Token tidak disediakan." 
        });
    }

    const token = authHeader.split(" ")[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; 
        next();
    } catch (ex) {
        res.status(403).json({ message: "Token tidak valid." });
    }
};

const checkRole = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user || !req.user.role) {
            return res.status(403).json({ message: "Forbidden. Peran pengguna tidak diketahui." });
        }

        const { role } = req.user;

        if (!allowedRoles.includes(role)) {
            return res.status(403).json({ 
                message: `Akses ditolak. Peran '${role}' tidak diizinkan.` 
            });
        }

        next();
    };
};

module.exports = {
    verifyToken,
    checkRole
};