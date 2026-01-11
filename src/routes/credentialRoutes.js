const express = require("express");
const router = express.Router();
const credentialController = require("../controllers/credentialController");

const { verifyToken, authorizeRole } = require("../middleware/authMiddleware");

const upload = require("../middleware/uploadMiddleware");

router.post(
  "/issue",
  verifyToken,
  authorizeRole(["issuer"]),
  upload.single("file"),
  credentialController.issueCredential
);

router.post(
  "/claim",
  verifyToken,
  authorizeRole(["owner"]),
  credentialController.claimCredential
);

router.get("/cert-types", credentialController.getCertificationTypes);

router.get(
  "/issuer/stats",
  verifyToken,
  authorizeRole(["issuer", "admin"]),
  credentialController.getIssuerDashboardData
);

router.get(
  "/my-documents",
  verifyToken,
  authorizeRole(["owner"]),
  credentialController.getMyCredentials
);

module.exports = router;
