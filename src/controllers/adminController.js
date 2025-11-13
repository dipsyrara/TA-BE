const db = require("../config/db");

exports.approveIssuer = async (req, res) => {
    try {
        const { id } = req.params;
    
        const updateQuery = `
            UPDATE USERS
            SET "status" = 'active'
            WHERE user_id = $1 AND "role" = 'Penerbit'
            RETURNING user_id, email, full_name, "status";
        `;
        
        const result = await db.query(updateQuery, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ 
                message: "Penerbit tidak ditemukan atau peran tidak sesuai." 
            });
        }

        res.status(200).json({
            message: "Penerbit berhasil disetujui (diaktifkan).",
            user: result.rows[0]
        });

    } catch (error) {
        console.error("Error saat approve issuer:", error.message);
        res.status(500).json({ message: "Terjadi kesalahan pada server." });
    }
};