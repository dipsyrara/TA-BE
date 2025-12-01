// src/controllers/adminController.js
const db = require("../config/db");

// Get Issuers (Pending & Active) for the Admin's Institution
exports.getIssuersByInstitution = async (req, res) => {
  try {
    // Ambil instId dari decoded token (req.user)
    // Pastikan namanya sama dengan di authController (instId)
    const { instId } = req.user;

    if (!instId) {
      return res
        .status(400)
        .json({ message: "Admin tidak terikat dengan institusi manapun." });
    }

    const query = `
      SELECT user_id, full_name, email, status, created_at 
      FROM USERS 
      WHERE inst_id = $1 AND role = 'issuer'
      ORDER BY created_at DESC
    `;

    const result = await db.query(query, [instId]);

    res.status(200).json({
      data: result.rows,
    });
  } catch (error) {
    console.error("Error fetching issuers:", error.message);
    res.status(500).json({ message: "Server error." });
  }
};

// Approve Issuer (Yang sudah ada, sedikit penyesuaian query jika perlu)
exports.approveIssuer = async (req, res) => {
  try {
    const { id } = req.params; // user_id dari issuer

    // Update status jadi active
    const query = `
        UPDATE USERS 
        SET status = 'active' 
        WHERE user_id = $1 AND role = 'issuer'
        RETURNING user_id, email, status
    `;

    const result = await db.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Issuer tidak ditemukan." });
    }

    res.status(200).json({
      message: "Akun Penerbit berhasil diaktifkan.",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Error approving issuer:", error.message);
    res.status(500).json({ message: "Server error." });
  }
};

exports.deleteIssuer = async (req, res) => {
  try {
    const { id } = req.params; // ID user yang mau dihapus
    const { instId } = req.user; // ID institusi admin yang sedang login

    // Query hapus: Pastikan ID cocok DAN institusinya sama (Security Check)
    const query = `
        DELETE FROM USERS 
        WHERE user_id = $1 AND inst_id = $2 AND role = 'issuer'
        RETURNING user_id
    `;

    const result = await db.query(query, [id, instId]);

    if (result.rowCount === 0) {
      return res.status(404).json({
        message:
          "Gagal menghapus. User tidak ditemukan atau bukan bagian dari institusi Anda.",
      });
    }

    res.status(200).json({ message: "Akun penerbit berhasil dihapus." });
  } catch (error) {
    console.error("Error deleting issuer:", error.message);
    res.status(500).json({ message: "Server error." });
  }
};
