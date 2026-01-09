// src/middleware/uploadMiddleware.js
const multer = require("multer");

// Konfigurasi penyimpanan: Memory Storage
// File disimpan sebagai Buffer di RAM (tidak disimpan ke harddisk server)
const storage = multer.memoryStorage();

// Inisialisasi Multer
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // Batas ukuran file: 10MB
  },
  fileFilter: (req, file, cb) => {
    // Validasi tipe file (Hanya PDF yang diizinkan)
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Format file tidak didukung. Harap unggah PDF."), false);
    }
  },
});

module.exports = upload;
