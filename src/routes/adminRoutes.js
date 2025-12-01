// src/routes/adminRoutes.js
const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const { verifyToken, checkRole } = require("../middleware/authMiddleware");

// GET: Ambil daftar penerbit (Pending & Active)
router.get(
  "/issuers",
  verifyToken,
  checkRole(["admin"]), // Hanya admin institusi
  adminController.getIssuersByInstitution
);

// POST: Approve penerbit
router.post(
  "/approve-issuer/:id",
  verifyToken,
  checkRole(["admin"]),
  adminController.approveIssuer
);

router.delete(
  "/delete-issuer/:id",
  verifyToken,
  checkRole(["admin"]),
  adminController.deleteIssuer
);

module.exports = router;
