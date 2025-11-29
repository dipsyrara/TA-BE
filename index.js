const express = require("express");
const cors = require("cors");
require("dotenv").config();

const authRoutes = require("./src/routes/authRoutes");
const adminRoutes = require("./src/routes/adminRoutes");
const userRoutes = require("./src/routes/userRoutes");
const credentialRoutes = require("./src/routes/credentialRoutes");

const app = express();
const PORT = process.env.PORT || 3001; // Backend berjalan di port 3001

// --- KONFIGURASI CORS YANG BENAR ---
const corsOptions = {
  origin: "http://localhost:5173", // Pastikan ini sesuai dengan port Frontend Anda
  credentials: true, // PENTING: Izinkan cookie/token dikirim
  optionsSuccessStatus: 200,
};

// Masukkan corsOptions ke dalam fungsi cors()
app.use(cors(corsOptions));

app.use(express.json());

// Logger sederhana (bagus untuk debugging)
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/users", userRoutes);
app.use("/api/credentials", credentialRoutes);

app.get("/", (req, res) => {
  res.send("Selamat datang di Backend Server Ijazah RWA!");
});

app.listen(PORT, () => {
  console.log(`Server berjalan di http://localhost:${PORT}`);
});
