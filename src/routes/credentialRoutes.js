const express = require("express");
const router = express.Router();
const credentialController = require("../controllers/credentialController");

const { verifyToken, authorizeRole } = require("../middleware/authMiddleware");

const upload = require("../middleware/uploadMiddleware");

router.get("/verify/:id", credentialController.verifyCredential);

router.get("/cert-types", credentialController.getCertificationTypes);

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

router.get("/public/search", credentialController.searchPublicCredentials);
router.post("/public/validate", credentialController.validatePublicSecret);
module.exports = router;
