const db = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const { JWT_SECRET } = process.env;

exports.register = async (req, res) => {
  try {
    const { fullName, full_name, email, password, role } = req.body;

    const nameToSave = fullName || full_name;

    if (!email || !password || !nameToSave || !role) {
      return res.status(400).json({
        message: "Semua field (Nama, Email, Password, Role) harus diisi.",
      });
    }

    const validRoles = ["issuer", "owner"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        message: "Role tidak valid. Gunakan 'issuer' atau 'owner'.",
      });
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    let status = "active";
    let finalInstId = null;

    if (role === "issuer") {
      status = "pending_approval";

      const emailParts = email.split("@");
      if (emailParts.length !== 2) {
        return res.status(400).json({ message: "Format email tidak valid." });
      }
      const emailDomain = emailParts[1];

      const adminQuery = `
            SELECT inst_id, email FROM USERS 
            WHERE role = 'admin' AND email LIKE $1 
            LIMIT 1
      `;

      const adminCheck = await db.query(adminQuery, [`%@${emailDomain}`]);

      if (adminCheck.rows.length === 0) {
        return res.status(404).json({
          message: `Institusi dengan domain @${emailDomain} belum terdaftar. Hubungi Admin Institusi.`,
        });
      }

      finalInstId = adminCheck.rows[0].inst_id;
      console.log(`Issuer detected from Institution ID: ${finalInstId}`);
    }

    const newUserQuery = `
        INSERT INTO USERS (email, password_hash, full_name, "role", inst_id, "status")
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING user_id, email, "role", "status";
    `;

    const result = await db.query(newUserQuery, [
      email,
      password_hash,
      nameToSave,
      role,
      finalInstId,
      status,
    ]);

    res.status(201).json({
      message:
        role === "issuer"
          ? "Registrasi berhasil. Menunggu persetujuan Admin."
          : "Registrasi berhasil.",
      user: result.rows[0],
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ message: "Email sudah terdaftar." });
    }
    console.error("Error saat register:", error.message);
    res.status(500).json({ message: "Terjadi kesalahan pada server." });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email dan password harus diisi." });
    }

    const userQuery = "SELECT * FROM USERS WHERE email = $1";
    const result = await db.query(userQuery, [email]);

    if (result.rows.length === 0) {
      return res.status(401).json({ message: "Email atau password salah." });
    }

    const user = result.rows[0];

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: "Email atau password salah." });
    }

    if (user.status !== "active") {
      return res.status(403).json({
        message: "Akun belum aktif. Hubungi admin institusi.",
      });
    }

    const payload = {
      userId: user.user_id,
      role: user.role,
      instId: user.inst_id,
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "1d" });

    res.status(200).json({
      message: "Login berhasil.",
      token: token,
      user: {
        userId: user.user_id,
        email: user.email,
        role: user.role,
        instId: user.inst_id,
        fullName: user.full_name,
      },
    });
  } catch (error) {
    console.error("Error saat login:", error.message);
    res.status(500).json({ message: "Terjadi kesalahan pada server." });
  }
};
