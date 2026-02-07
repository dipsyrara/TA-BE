const db = require("../config/db");
const { ethers } = require("ethers");
require("dotenv").config();

exports.linkWallet = async (req, res) => {
  try {
    const { walletAddress } = req.body;
    const { userId } = req.user;

    // 1. Validasi Input
    if (!walletAddress || !walletAddress.startsWith("0x")) {
      return res.status(400).json({
        message: "Alamat wallet tidak valid.",
      });
    }

    // 2. Update Database
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

    // ---------------------------------------------------------
    // 3. LOGIKA AUTO-FAUCET (Versi Ethers v5)
    // ---------------------------------------------------------
    if (process.env.CHAIN_ID === "31337") {
      try {
        // [FIX v5]: Gunakan ethers.providers.JsonRpcProvider
        const provider = new ethers.providers.JsonRpcProvider(
          process.env.RPC_URL
        );

        const adminWallet = new ethers.Wallet(
          process.env.MINTER_WALLET_PRIVATE_KEY,
          provider
        );

        const userBalance = await provider.getBalance(walletAddress);

        // [FIX v5]: Gunakan ethers.utils.parseEther
        const minBalance = ethers.utils.parseEther("1.0");

        if (userBalance.lt(minBalance)) {
          // .lt adalah 'less than' (BigNumber)
          console.log(
            `[FAUCET] Saldo kosong. Mengirim 10 ETH ke: ${walletAddress}...`
          );

          const tx = await adminWallet.sendTransaction({
            to: walletAddress,
            // [FIX v5]: Gunakan ethers.utils.parseEther
            value: ethers.utils.parseEther("10.0"),
          });

          await tx.wait();
          console.log(`[FAUCET] Sukses! Hash: ${tx.hash}`);
        } else {
          console.log("[FAUCET] Saldo user sudah cukup. Skip transfer.");
        }
      } catch (faucetError) {
        console.error(
          "[FAUCET ERROR] Gagal mengirim ETH:",
          faucetError.message
        );
      }
    }
    // ---------------------------------------------------------

    res.status(200).json({
      message: "Alamat wallet berhasil ditautkan.",
      user: result.rows[0],
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        message: "Alamat wallet ini sudah digunakan oleh akun lain.",
      });
    }
    console.error("Error saat link wallet:", error.message);
    res.status(500).json({ message: "Terjadi kesalahan pada server." });
  }
};
