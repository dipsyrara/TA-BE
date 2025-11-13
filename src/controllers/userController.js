const db = require("../config/db");

exports.linkWallet = async (req, res) => {
    try {
        const { walletAddress } = req.body;
        
        const { userId } = req.user;

        if (!walletAddress || !walletAddress.startsWith('0x')) {
            return res.status(400).json({ 
                message: "Alamat wallet tidak valid." 
            });
        }

        const updateQuery = `
            UPDATE USERS
            SET wallet_addr = $1
            WHERE user_id = $2
            RETURNING user_id, email, full_name, wallet_addr;
        `;
        
        const result = await db.query(updateQuery, [walletAddress, userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Pengguna tidak ditemukan." });
        }

        res.status(200).json({
            message: "Alamat wallet berhasil ditautkan.",
            user: result.rows[0]
        });

    } catch (error) {
        if (error.code === '23505') { 
            return res.status(409).json({ 
                message: "Alamat wallet ini sudah digunakan oleh akun lain." 
            });
        }
        console.error("Error saat link wallet:", error.message);
        res.status(500).json({ message: "Terjadi kesalahan pada server." });
    }
};