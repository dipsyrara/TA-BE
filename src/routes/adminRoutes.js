const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const { verifyToken, authorizeRole } = require("../middleware/authMiddleware");

router.get(
  "/issuers",
  verifyToken,
  authorizeRole(["admin"]),
  adminController.getIssuersByInstitution
);

router.post(
  "/approve-issuer/:id",
  verifyToken,
  authorizeRole(["admin"]),
  adminController.approveIssuer
);

router.delete(
  "/delete-issuer/:id",
  verifyToken,
  authorizeRole(["admin"]),
  adminController.deleteIssuer
);

module.exports = router;
