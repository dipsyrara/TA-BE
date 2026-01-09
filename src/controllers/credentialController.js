const db = require("../config/db");
const bcrypt = require("bcryptjs"); // Pastikan bcrypt sudah di-import
const ipfsService = require("../services/ipfsService");
const walletService = require("../services/walletService");
const { Readable } = require("stream");

// ==========================================
// TAMBAHAN: GET CERTIFICATION TYPES
// ==========================================
exports.getCertificationTypes = async (req, res) => {
  try {
    const query = "SELECT name FROM CERTIFICATION_TYPES ORDER BY name ASC";
    const result = await db.query(query);
    // Map agar return-nya array string simpel: ["AWS", "BNSP", ...]
    const types = result.rows.map((row) => row.name);
    res.json(types);
  } catch (error) {
    console.error("Error fetching cert types:", error);
    res.status(500).json({ message: "Gagal mengambil data sertifikasi" });
  }
};

// ==========================================
// 1. ISSUE CREDENTIAL (Penerbitan)
// ==========================================
exports.issueCredential = async (req, res) => {
  try {
    // 1. Tangkap Data dari Form Dynamic
    const {
      recipient_name,
      recipient_nim, // Nullable (Ijazah)
      mother_name, // Nullable (Ijazah) - Akan di-hash sebagai secret answer
      serial_number,
      program_name, // Nullable (Sertifikat)
      document_type,
      issue_date,
    } = req.body;

    // Ambil ID Institusi dan User ID Penerbit dari Token
    const { instId, userId } = req.user;
    const file = req.file;

    // 2. Validasi Input
    if (!file) {
      return res.status(400).json({ message: "File dokumen wajib diunggah." });
    }
    if (!serial_number || !recipient_name) {
      return res
        .status(400)
        .json({ message: "Nama dan Nomor Seri wajib diisi." });
    }

    console.log(
      `[ISSUE] Memulai penerbitan untuk: ${recipient_name} (${document_type})`
    );

    // --- GENERATE HASH UNTUK KEAMANAN KLAIM ---
    const salt = await bcrypt.genSalt(10);
    const doc_serial_number_hash = await bcrypt.hash(serial_number, salt);

    // Untuk secret answer, kita gunakan mother_name (jika ada) atau default value/program_name
    let secretAnswerRaw = mother_name || serial_number;
    const secret_answer_hash = await bcrypt.hash(secretAnswerRaw, salt);
    // -------------------------------------------

    // 3. Upload File PDF ke IPFS
    console.log("[IPFS] Mengunggah file PDF...");
    const fileStream = Readable.from(file.buffer);
    const assetCid = await ipfsService.uploadFileToIPFS(
      fileStream,
      file.originalname
    );
    // URL ini aman untuk metadata
    const fileUrlIpfs = `ipfs://${assetCid}`;

    // 4. Buat & Upload Metadata JSON ke IPFS
    console.log("[IPFS] Membuat Metadata JSON...");

    // Tentukan atribut berdasarkan jenis dokumen
    const attributes = [
      { trait_type: "Recipient Name", value: recipient_name },
      { trait_type: "Document Type", value: document_type },
      { trait_type: "Issue Date", value: issue_date },
      { trait_type: "Serial Number", value: serial_number },
    ];

    if (recipient_nim)
      attributes.push({ trait_type: "NIM", value: recipient_nim });
    if (program_name)
      attributes.push({
        trait_type: "Certification/Program",
        value: program_name,
      });

    const metadata = {
      name: `${document_type} - ${recipient_name}`,
      description: `Dokumen ${document_type} resmi diterbitkan oleh Institusi ID ${instId}.`,
      image: fileUrlIpfs,
      attributes: attributes,
    };

    const metadataCid = await ipfsService.uploadJsonToIPFS(metadata);
    const tokenUri = `ipfs://${metadataCid}`;
    console.log("[IPFS] Metadata uploaded:", tokenUri);

    // 5. Minting NFT ke Blockchain (Mint-to-Treasury)
    console.log("[BLOCKCHAIN] Memanggil safeMint...");
    const contract = walletService.getContractWithMinter();
    const treasuryAddress = walletService.TREASURY_WALLET_ADDRESS;

    // Panggil fungsi Smart Contract
    const tx = await contract.safeMint(treasuryAddress, tokenUri);
    console.log("[BLOCKCHAIN] Menunggu konfirmasi TX:", tx.hash);

    const receipt = await tx.wait(); // Tunggu sampai mined

    // Ambil Token ID dari Event Transfer
    const transferEvent = receipt.logs.find((e) => e.eventName === "Transfer");
    let tokenId = "0";
    if (transferEvent) {
      tokenId = transferEvent.args[2].toString();
    } else {
      console.warn(
        "Event Transfer tidak ditemukan, menggunakan ID default sementara."
      );
    }

    console.log(`[SUCCESS] NFT Minted! Token ID: ${tokenId}`);

    // 6. Simpan Data ke Database (Tabel CREDENTIALS)
    const insertQuery = `
            INSERT INTO CREDENTIALS (
                inst_id, issuer_id, 
                recipient_name, recipient_nim, mother_name,
                document_type, program_name, serial_number, issue_date,
                file_url, ipfs_hash, token_id, tx_hash, status,
                doc_serial_number_hash, secret_answer_hash
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'issued', $14, $15)
            RETURNING credential_id;
        `;

    // Kita simpan Link Gateway Publik agar Frontend bisa menampilkan file tanpa koneksi IPFS lokal
    const publicFileUrl = `https://ipfs.io/ipfs/${assetCid}`;

    await db.query(insertQuery, [
      instId,
      userId,
      recipient_name,
      recipient_nim || null,
      mother_name || null,
      document_type,
      program_name || null,
      serial_number,
      issue_date,
      publicFileUrl,
      tokenUri, // ipfs_hash (metadata)
      tokenId,
      tx.hash,
      doc_serial_number_hash, // Value $14
      secret_answer_hash, // Value $15
    ]);

    res.status(201).json({
      message: "Dokumen berhasil diterbitkan dan dicatat di Blockchain!",
      data: {
        tokenId,
        txHash: tx.hash,
        ipfsMetadata: tokenUri,
      },
    });
  } catch (error) {
    console.error("[ERROR] Issue Credential:", error);
    if (error.code === "23505") {
      return res.status(400).json({
        message: "Nomor Seri Dokumen sudah terdaftar di institusi ini.",
      });
    }
    res
      .status(500)
      .json({ message: "Gagal menerbitkan dokumen.", error: error.message });
  }
};

// ==========================================
// 2. CLAIM CREDENTIAL (Klaim oleh Mahasiswa)
// ==========================================
exports.claimCredential = async (req, res) => {
  try {
    const { cred_id } = req.params;
    const { userId } = req.user; // User ID Mahasiswa yang login
    const { input_nim, input_mother_name, input_serial } = req.body;

    console.log(`[CLAIM] User ${userId} mencoba klaim Cred ID ${cred_id}`);

    // 1. Cek Data Kredensial di DB
    const credQuery = "SELECT * FROM CREDENTIALS WHERE credential_id = $1";
    const credResult = await db.query(credQuery, [cred_id]);

    if (credResult.rows.length === 0) {
      return res.status(404).json({ message: "Dokumen tidak ditemukan." });
    }

    const credential = credResult.rows[0];

    // 2. Cek Status
    if (credential.status === "claimed") {
      return res.status(400).json({ message: "Dokumen ini sudah diklaim." });
    }

    // 3. Validasi Data (Logika Dinamis)
    let isValid = false;

    if (credential.document_type === "Ijazah Sarjana") {
      // Validasi Ketat: NIM & Nama Ibu
      const dbMother = credential.mother_name
        ? credential.mother_name.toLowerCase().trim()
        : "";
      const inputMother = input_mother_name
        ? input_mother_name.toLowerCase().trim()
        : "";
      const dbNim = credential.recipient_nim
        ? credential.recipient_nim.trim()
        : "";
      const inputNim = input_nim ? input_nim.trim() : "";

      if (dbNim === inputNim && dbMother === inputMother && dbMother !== "") {
        isValid = true;
      }
    } else {
      // Validasi Sertifikat: Nomor Seri
      if (credential.serial_number === input_serial) {
        isValid = true;
      }
    }

    if (!isValid) {
      return res
        .status(403)
        .json({ message: "Verifikasi gagal. Data identitas tidak cocok." });
    }

    // 4. Ambil Wallet Address User
    const userQuery = "SELECT wallet_addr FROM USERS WHERE user_id = $1";
    const userResult = await db.query(userQuery, [userId]);
    const userWallet = userResult.rows[0]?.wallet_addr;

    if (!userWallet) {
      return res.status(400).json({
        message:
          "Harap hubungkan wallet Metamask di profil Anda terlebih dahulu.",
      });
    }

    // 5. Transfer NFT di Blockchain
    console.log(
      `[BLOCKCHAIN] Transfer Token ${credential.token_id} to ${userWallet}...`
    );
    const contract = walletService.getContractWithTreasury();
    const treasuryAddress = walletService.TREASURY_WALLET_ADDRESS;

    const tx = await contract.transferFrom(
      treasuryAddress,
      userWallet,
      credential.token_id
    );
    await tx.wait();

    // 6. Update Status di DB dan Set Owner Baru
    const updateQuery = `
            UPDATE CREDENTIALS 
            SET status = 'claimed', owner_id = $1
            WHERE credential_id = $2
        `;
    await db.query(updateQuery, [userId, cred_id]);

    res.status(200).json({
      message: "Klaim Berhasil! Aset kini ada di wallet Anda.",
      txHash: tx.hash,
    });
  } catch (error) {
    console.error("[ERROR] Claim:", error);
    res
      .status(500)
      .json({ message: "Gagal mengklaim dokumen.", error: error.message });
  }
};

// ==========================================
// 3. SEARCH & VERIFY (Publik)
// ==========================================

// Cari Dokumen (Langkah 1 Verifikasi Publik)
exports.searchCredentials = async (req, res) => {
  try {
    const { name, institution } = req.query;

    const query = `
            SELECT 
                c.credential_id, c.recipient_name, c.issue_date, 
                i.name as institution_name, c.document_type,
                CONCAT(LEFT(c.recipient_nim, 3), '*****', RIGHT(c.recipient_nim, 2)) as masked_nim
            FROM CREDENTIALS c
            JOIN INSTITUTIONS i ON c.inst_id = i.inst_id
            WHERE c.recipient_name ILIKE $1 AND i.name ILIKE $2
            LIMIT 5
        `;

    const result = await db.query(query, [`%${name}%`, `%${institution}%`]);
    res.json(result.rows);
  } catch (error) {
    console.error("[ERROR] Search:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Verifikasi Detail (Langkah 2 - Scan QR/UUID)
exports.verifyCredential = async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
            SELECT c.*, i.name as institution_name 
            FROM CREDENTIALS c
            JOIN INSTITUTIONS i ON c.inst_id = i.inst_id
            WHERE c.credential_id = $1
        `;

    const result = await db.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Dokumen tidak ditemukan." });
    }

    const data = result.rows[0];

    // Validasi On-Chain Realtime (Read-Only)
    const contract = walletService.getReadOnlyContract();
    const ownerOnChain = await contract.ownerOf(data.token_id);

    res.json({
      isValid: true,
      data: data,
      blockchain: {
        tokenId: data.token_id,
        ownerAddress: ownerOnChain,
        txHash: data.tx_hash,
      },
    });
  } catch (error) {
    console.error("[ERROR] Verify:", error);
    res.status(500).json({ message: "Gagal memverifikasi dokumen." });
  }
};

// ==========================================
// 4. DASHBOARD DATA
// ==========================================

// Get Issuer Dashboard (Stats)
exports.getIssuerDashboardData = async (req, res) => {
  try {
    const { userId } = req.user; // ID Issuer dari Token

    // Query 1: Ambil semua dokumen yang diterbitkan issuer ini
    const query = `
      SELECT 
        credential_id, recipient_name, document_type, 
        program_name, issue_date, status, token_id, tx_hash 
      FROM CREDENTIALS 
      WHERE issuer_id = $1 
      ORDER BY created_at DESC
    `;

    const { rows } = await db.query(query, [userId]);

    // Hitung Statistik
    const totalIssued = rows.length;
    const totalClaimed = rows.filter((r) => r.status === "claimed").length;
    const totalPending = rows.filter((r) => r.status === "issued").length;

    res.json({
      stats: {
        totalIssued,
        totalClaimed,
        totalPending,
      },
      recentHistory: rows,
    });
  } catch (error) {
    console.error("[ERROR] Get Dashboard Data:", error);
    res.status(500).json({ message: "Gagal memuat data dashboard." });
  }
};

// --- TAMBAHAN PENTING ---
// Get My Credentials (Untuk Dashboard Holder/Student)
exports.getMyCredentials = async (req, res) => {
  try {
    const { userId } = req.user; // ID User yang sedang login

    // Query: Ambil dokumen dimana owner_id = userId
    // Asumsi: Saat diklaim, kolom 'owner_id' di tabel CREDENTIALS diupdate
    // Atau jika belum diklaim tapi sudah ditujukan, bisa cek recipient_email/nim (tergantung desain DB)
    // Di sini kita pakai logika sederhana: dokumen yang SUDAH DIKLAIM atau DIMILIKI user
    
    // Opsi A: Jika ingin menampilkan yang SUDAH diklaim saja:
    // const query = `SELECT * FROM CREDENTIALS WHERE owner_id = $1 ORDER BY issue_date DESC`;
    
    // Opsi B (Lebih Luwes): Menampilkan juga yang PENDING klaim jika ada relasi NIM/Email di tabel USERS
    // Untuk sekarang, kita pakai Opsi A (berbasis klaim owner_id) + history manual
    
    // Mari gunakan query standar:
    const query = `
        SELECT 
            credential_id, 
            recipient_name, 
            document_type, 
            program_name, -- Bisa null utk ijazah
            issue_date, 
            serial_number,
            status, 
            token_id, 
            tx_hash,
            file_url 
        FROM CREDENTIALS 
        WHERE owner_id = $1 -- Pastikan kolom ini ada di DB dan diisi saat klaim
        ORDER BY created_at DESC
    `;

    const { rows } = await db.query(query, [userId]);

    res.json(rows); // Mengembalikan array kosong [] jika tidak ada data
  } catch (error) {
    console.error("[ERROR] Get My Credentials:", error);
    res.status(500).json({ message: "Gagal memuat aset digital anda." });
  }
};