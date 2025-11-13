const db = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const { JWT_SECRET } = process.env;

exports.register = async (req, res) => {
    try {
        const { email, password, fullName, role, inst_id } = req.body;

        if (!email || !password || !fullName || !role) {
            return res.status(400).json({ 
                message: "Email, password, nama lengkap, dan peran (role) harus diisi." 
            });
        }
        
        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);

        let status = 'active';
        if (role === 'Penerbit') {
            status = 'pending_approval';
            if (!inst_id) {
                return res.status(400).json({ 
                    message: "Penerbit harus menyertakan inst_id." 
                });
            }
        }

        const newUserQuery = `
            INSERT INTO USERS (email, password_hash, full_name, "role", inst_id, "status")
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING user_id, email, "role", "status";
        `;
        
        const result = await db.query(newUserQuery, [
            email, 
            password_hash, 
            fullName, 
            role, 
            inst_id, 
            status
        ]);

        res.status(201).json({
            message: "Registrasi berhasil.",
            user: result.rows[0]
        });

    } catch (error) {
        if (error.code === '23505') { 
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
            return res.status(400).json({ message: "Email dan password harus diisi." });
        }

        const userQuery = 'SELECT * FROM USERS WHERE email = $1';
        const result = await db.query(userQuery, [email]);

        if (result.rows.length === 0) {
            return res.status(401).json({ message: "Email atau password salah." });
        }
        
        const user = result.rows[0];

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ message: "Email atau password salah." });
        }

        if (user.status !== 'active') {
             return res.status(403).json({ 
                message: "Akun Anda belum aktif. Hubungi admin institusi." 
            });
        }

        const payload = {
            userId: user.user_id,
            role: user.role 
        };

        const token = jwt.sign(payload, JWT_SECRET, {
            expiresIn: '1d'
        });

        res.status(200).json({
            message: "Login berhasil.",
            token: token,
            user: {
                userId: user.user_id,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        console.error("Error saat login:", error.message);
        res.status(500).json({ message: "Terjadi kesalahan pada server." });
    }
};