const db = require("../config/db");
const bcrypt = require("bcryptjs");
const ipfsService = require("../services/ipfsService");
const walletService = require("../services/walletService");
const { Readable } = require("stream");

exports.getCertificationTypes = async (req, res) => {
  try {
    const query = "SELECT name FROM CERTIFICATION_TYPES ORDER BY name ASC";
    const result = await db.query(query);

    const types = result.rows.map((row) => row.name);
    res.json(types);
  } catch (error) {
    console.error("Error fetching cert types:", error);
    res.status(500).json({ message: "Gagal mengambil data sertifikasi" });
  }
};

exports.issueCredential = async (req, res) => {
  try {
    const {
      recipient_name,
      recipient_nim,
      mother_name,
      serial_number,
      program_name,
      document_type,
      issue_date,
    } = req.body;

    const { instId, userId } = req.user;
    const file = req.file;

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

    const salt = await bcrypt.genSalt(10);
    const doc_serial_number_hash = await bcrypt.hash(serial_number, salt);

    let secretAnswerRaw = mother_name || serial_number;
    const secret_answer_hash = await bcrypt.hash(secretAnswerRaw, salt);

    console.log("[IPFS] Mengunggah file PDF...");
    const fileStream = Readable.from(file.buffer);
    const assetCid = await ipfsService.uploadFileToIPFS(
      fileStream,
      file.originalname
    );

    const fileUrlIpfs = `ipfs://${assetCid}`;

    console.log("[IPFS] Membuat Metadata JSON...");

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

    console.log("[BLOCKCHAIN] Memanggil safeMint...");
    const contract = walletService.getContractWithMinter();
    const treasuryAddress = walletService.TREASURY_WALLET_ADDRESS;

    const tx = await contract.safeMint(treasuryAddress, tokenUri);
    console.log("[BLOCKCHAIN] Menunggu konfirmasi TX:", tx.hash);

    const receipt = await tx.wait();

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
      tokenUri,
      tokenId,
      tx.hash,
      doc_serial_number_hash,
      secret_answer_hash,
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

exports.claimCredential = async (req, res) => {
  try {
    const { userId } = req.user;

    const {
      doc_type,
      full_name,
      identity_number,
      cert_title,
      doc_serial,
      mother_name,
      wallet_address,
    } = req.body;

    console.log(`[CLAIM START] User ${userId} mencari dokumen:`, req.body);

    let credential = null;

    if (doc_type === "ijazah") {
      const query = `
        SELECT * FROM CREDENTIALS 
        WHERE document_type = 'Ijazah Sarjana' 
          AND recipient_name ILIKE $1 
          AND recipient_nim = $2
          AND serial_number = $3
      `;

      const result = await db.query(query, [
        full_name.trim(),
        identity_number.trim(),
        doc_serial.trim(),
      ]);

      if (result.rows.length > 0) credential = result.rows[0];
    } else {
      const query = `
        SELECT * FROM CREDENTIALS 
        WHERE document_type != 'Ijazah Sarjana' 
          AND recipient_name ILIKE $1 
          AND program_name ILIKE $2
          AND serial_number = $3
      `;

      const result = await db.query(query, [
        full_name.trim(),
        cert_title.trim(),
        doc_serial.trim(),
      ]);

      if (result.rows.length > 0) credential = result.rows[0];
    }

    if (!credential) {
      console.log("[CLAIM FAIL] Dokumen tidak ditemukan di DB.");
      return res.status(404).json({
        message:
          "Dokumen tidak ditemukan. Pastikan ejaan Nama, Judul Sertifikasi, dan Nomor Seri SAMA PERSIS dengan dokumen fisik.",
      });
    }

    console.log("[CLAIM FOUND] Dokumen ditemukan:", credential.credential_id);

    if (credential.status === "claimed") {
      return res
        .status(400)
        .json({ message: "Dokumen ini sudah diklaim oleh user lain." });
    }

    if (doc_type === "ijazah") {
      const dbMother = credential.mother_name
        ? credential.mother_name.toLowerCase().trim()
        : "";
      const inputMother = mother_name ? mother_name.toLowerCase().trim() : "";

      if (dbMother !== inputMother) {
        return res
          .status(403)
          .json({ message: "Verifikasi gagal. Nama Ibu Kandung tidak cocok." });
      }
    }

    let targetWallet = wallet_address;

    if (!targetWallet) {
      const userQ = await db.query(
        "SELECT wallet_addr FROM USERS WHERE user_id = $1",
        [userId]
      );
      targetWallet = userQ.rows[0]?.wallet_addr;
    }

    if (!targetWallet) {
      return res.status(400).json({ message: "Wallet Address diperlukan." });
    }

    console.log(
      `[BLOCKCHAIN] Transfer Token ${credential.token_id} to ${targetWallet}...`
    );

    const contract = walletService.getContractWithTreasury();
    const treasuryAddress = walletService.TREASURY_WALLET_ADDRESS;

    const tx = await contract.transferFrom(
      treasuryAddress,
      targetWallet,
      credential.token_id
    );
    await tx.wait();

    const updateQuery = `
      UPDATE CREDENTIALS 
      SET status = 'claimed', owner_id = $1, wallet_address = $2
      WHERE credential_id = $3
    `;
    await db.query(updateQuery, [
      userId,
      targetWallet,
      credential.credential_id,
    ]);

    res.status(200).json({
      message: "Klaim Berhasil! Aset kini ada di wallet Anda.",
      txHash: tx.hash,
      data: credential,
    });
  } catch (error) {
    console.error("[ERROR] Claim:", error);

    if (error.reason) {
      return res
        .status(500)
        .json({ message: `Blockchain Error: ${error.reason}` });
    }
    res.status(500).json({
      message: "Terjadi kesalahan server saat klaim.",
      error: error.message,
    });
  }
};

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

exports.getIssuerDashboardData = async (req, res) => {
  try {
    const { userId } = req.user;

    const query = `
      SELECT 
        credential_id, recipient_name, document_type, 
        program_name, issue_date, status, token_id, tx_hash 
      FROM CREDENTIALS 
      WHERE issuer_id = $1 
      ORDER BY created_at DESC
    `;

    const { rows } = await db.query(query, [userId]);

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

exports.getMyCredentials = async (req, res) => {
  try {
    const { userId } = req.user;

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

    res.json(rows);
  } catch (error) {
    console.error("[ERROR] Get My Credentials:", error);
    res.status(500).json({ message: "Gagal memuat aset digital anda." });
  }
};
