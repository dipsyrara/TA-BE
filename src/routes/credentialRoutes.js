const express = require("express");
const router = express.Router();
const credentialController = require("../controllers/credentialController");

// 1. IMPORT MIDDLEWARE AUTH (Sesuai dengan authMiddleware.js Anda)
// Pastikan authMiddleware.js mengekspor { verifyToken, authorizeRole }
const { verifyToken, authorizeRole } = require("../middleware/authMiddleware");

// 2. IMPORT MIDDLEWARE UPLOAD
const upload = require("../middleware/uploadMiddleware");

// ==========================================
// DEFINISI ROUTES
// ==========================================

// 1. POST: Terbitkan Dokumen (Hanya Issuer)
router.post(
  "/issue",
  verifyToken, // Cek Login
  authorizeRole(["issuer"]), // Cek Role Issuer
  upload.single("file"), // Handle Upload File
  credentialController.issueCredential
);

// 2. POST: Klaim Dokumen (Hanya Owner/Mahasiswa)
router.post(
  "/claim/:id",
  verifyToken,
  authorizeRole(["owner"]), // Cek Role Owner
  credentialController.claimCredential
);

// 3. GET: Ambil daftar jenis sertifikasi (Untuk Dropdown Frontend)
router.get("/cert-types", credentialController.getCertificationTypes);

// 4. GET: Dashboard Statistik (Hanya Issuer & Admin)
router.get(
  "/issuer/stats",
  verifyToken,
  authorizeRole(["issuer", "admin"]),
  credentialController.getIssuerDashboardData
);

module.exports = router;
