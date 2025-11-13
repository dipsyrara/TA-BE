// src/controllers/credentialController.js
const db = require("../config/db");
const bcrypt = require("bcryptjs");
const ipfsService = require("../services/ipfsService");
const walletService = require("../services/walletService");
const { Readable } = require('stream');

exports.issueCredential = async (req, res) => {
    try {
        const {
            inst_id, recipient_name, recipient_nim, issue_date,
            document_type, doc_serial_number, secret_answer 
        } = req.body;

        const issued_by_user_id = req.user.userId;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ message: "File kredensial (PDF/Gambar) wajib diunggah." });
        }
        if (!recipient_nim || !doc_serial_number || !secret_answer) {
             return res.status(400).json({ message: "NIM, No. Seri, dan Jawaban Rahasia wajib diisi." });
        }
        
        console.log("Memulai proses penerbitan untuk NIM:", recipient_nim);

        const salt = await bcrypt.genSalt(10);
        const doc_serial_number_hash = await bcrypt.hash(doc_serial_number, salt);
        const secret_answer_hash = await bcrypt.hash(secret_answer, salt);

        console.log("Menyimpan ke tabel CREDENTIALS...");
        const credQuery = `
            INSERT INTO CREDENTIALS (
                inst_id, issued_by_user_id, document_type, recipient_name,
                recipient_nim, issue_date, doc_serial_number_hash, secret_answer_hash
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING cred_id;
        `;
        const credResult = await db.query(credQuery, [
            inst_id, issued_by_user_id, document_type, recipient_name,
            recipient_nim, issue_date, doc_serial_number_hash, secret_answer_hash
        ]);
        
        const newCredentialId = credResult.rows[0].cred_id;

        const fileStream = Readable.from(file.buffer);
        
        console.log("Mengunggah file aset ke IPFS...");
        const assetFileCid = await ipfsService.uploadFileToIPFS(fileStream, file.originalname);

        const metadata = {
            name: `Ijazah: ${recipient_name}`,
            description: `Ijazah digital resmi untuk ${recipient_name} dari institusi.`,
            image: `ipfs://${assetFileCid}`, 
            attributes: [
                { "trait_type": "NIM", "value": recipient_nim },
                { "trait_type": "Tipe Dokumen", "value": document_type },
                { "trait_type": "Tanggal Terbit", "value": issue_date }
            ]
        };
        
        console.log("Mengunggah metadata.json ke IPFS...");
        const tokenUri = await ipfsService.uploadJsonToIPFS(metadata); 

        console.log("Memanggil smart contract (safeMint)...");
        const contract = walletService.getContractWithMinter();
        
        const treasuryAddress = walletService.TREASURY_WALLET_ADDRESS; 
        
        const tx = await contract.safeMint(treasuryAddress, tokenUri);
        console.log("Menunggu konfirmasi transaksi (tx):", tx.hash);
        
        const receipt = await tx.wait(); 

        const transferEvent = receipt.logs.find(e => e.eventName === 'Transfer');
        if (!transferEvent) {
             throw new Error("Gagal menemukan event 'Transfer' di transaksi.");
        }
        const tokenId = transferEvent.args[2].toString(); 
        console.log("NFT berhasil di-mint. TokenID:", tokenId);

        console.log("Menyimpan ke tabel NFTS...");
        const nftQuery = `
            INSERT INTO NFTS (
                cred_id, token_id, token_uri, asset_file_cid,
                mint_tx_hash, "status"
            ) VALUES ($1, $2, $3, $4, $5, 'in_treasury');
        `;
        await db.query(nftQuery, [
            newCredentialId, tokenId, tokenUri, assetFileCid, tx.hash
        ]);

        res.status(201).json({
            message: "Kredensial berhasil diterbitkan (Mint-to-Treasury).",
            tokenId: tokenId,
            tokenUri: tokenUri,
            transactionHash: tx.hash,
            status: "in_treasury"
        });

    } catch (error) {
        console.error("Error saat issue credential:", error);
        res.status(500).json({ message: "Gagal menerbitkan kredensial.", error: error.message });
    }
}; // <-- '}' YANG HILANG SEKARANG ADA DI SINI, MENUTUP 'issueCredential'

exports.claimCredential = async (req, res) => {
    try {
        const { cred_id } = req.params; 
        const { userId, role } = req.user; 
    
        const { recipient_nim, doc_serial_number, secret_answer } = req.body;

        if (!recipient_nim || !doc_serial_number || !secret_answer) {
            return res.status(400).json({ 
                message: "NIM, No. Seri, dan Jawaban Rahasia wajib diisi." 
            });
        }
        
        console.log(`Menerima permintaan klaim untuk cred_id: ${cred_id} dari user: ${userId}`);

        console.log("Memvalidasi 3-faktor off-chain...");
        const credQuery = 'SELECT * FROM CREDENTIALS WHERE cred_id = $1';
        const credResult = await db.query(credQuery, [cred_id]);

        if (credResult.rows.length === 0) {
            return res.status(404).json({ message: "Kredensial tidak ditemukan." });
        }

        const credential = credResult.rows[0];

        if (credential.recipient_nim !== recipient_nim) {
            return res.status(403).json({ message: "Validasi gagal. Data tidak cocok." });
        }
        const isSerialMatch = await bcrypt.compare(doc_serial_number, credential.doc_serial_number_hash);
        if (!isSerialMatch) {
            return res.status(403).json({ message: "Validasi gagal. Data tidak cocok." });
        }
        const isSecretMatch = await bcrypt.compare(secret_answer, credential.secret_answer_hash);
        if (!isSecretMatch) {
            return res.status(403).json({ message: "Validasi gagal. Data tidak cocok." });
        }
        
        console.log("Validasi 3-faktor berhasil.");

        const userQuery = 'SELECT wallet_addr FROM USERS WHERE user_id = $1';
        const userResult = await db.query(userQuery, [userId]);
        const userWalletAddress = userResult.rows[0]?.wallet_addr;

        if (!userWalletAddress) {
            return res.status(400).json({ 
                message: "Kamu harus menautkan wallet Metamask di profilmu sebelum bisa mengklaim." 
            });
        }

        const nftQuery = 'SELECT token_id, "status" FROM NFTS WHERE cred_id = $1';
        const nftResult = await db.query(nftQuery, [cred_id]);

        if (nftResult.rows.length === 0) {
            return res.status(404).json({ message: "Data NFT untuk kredensial ini tidak ditemukan." });
        }
        
        const { token_id, status } = nftResult.rows[0];

        if (status === 'claimed') {
            return res.status(409).json({ message: "Kredensial ini sudah pernah diklaim." });
        }
       
        console.log(`Memanggil smart contract (transferFrom) untuk TokenID: ${token_id}...`);
        
        const contract = walletService.getContractWithTreasury(); 
        const treasuryAddress = walletService.TREASURY_WALLET_ADDRESS;
        
        const tx = await contract.transferFrom(
            treasuryAddress,    
            userWalletAddress,  
            token_id           
        );

        console.log("Menunggu konfirmasi transaksi (tx):", tx.hash);
        await tx.wait(); 

        console.log("NFT berhasil ditransfer.");

        console.log("Memperbarui status di tabel NFTS menjadi 'claimed'...");
        const updateNftQuery = `
            UPDATE NFTS
            SET "status" = 'claimed', 
                owner_user_id = $1, 
                transfer_tx_hash = $2,
                updated_at = CURRENT_TIMESTAMP
            WHERE cred_id = $3;
        `;
        await db.query(updateNftQuery, [userId, tx.hash, cred_id]);
        
        res.status(200).json({
            message: "Kredensial berhasil diklaim!",
            tokenId: token_id,
            ownerAddress: userWalletAddress,
            transactionHash: tx.hash,
            status: "claimed" 
        });

    } catch (error) {
        console.error("Error saat claim credential:", error);
        res.status(500).json({ message: "Gagal mengklaim kredensial.", error: error.message });
    }
};

exports.searchCredentials = async (req, res) => {
    try {
        const { name, institution } = req.query; 

        if (!name || !institution) {
            return res.status(400).json({ 
                message: "Parameter 'name' (nama siswa) dan 'institution' (nama institusi) wajib diisi." 
            });
        }
        
        const searchQuery = `
            SELECT
                c.cred_id,
                c.recipient_name,
                c.issue_date,
                i.name AS institution_name,
                CONCAT(LEFT(c.recipient_nim, 6), '***') AS recipient_nim_samar
            FROM CREDENTIALS c
            JOIN INSTITUTIONS i ON c.inst_id = i.inst_id
            WHERE
                c.recipient_name ILIKE $1 AND i.name ILIKE $2;
        `;
        
        const results = await db.query(searchQuery, [`%${name}%`, `%${institution}%`]);

        res.status(200).json(results.rows);

    } catch (error) {
        console.error("Error saat search credentials:", error.message);
        res.status(500).json({ message: "Terjadi kesalahan pada server." });
    }
};

exports.getTokenByNIM = async (req, res) => {
    try {
        const { nim } = req.query;

        if (!nim) {
            return res.status(400).json({ message: "Parameter 'nim' wajib diisi." });
        }
        
        const tokenQuery = `
            SELECT n.public_uuid, n.token_id
            FROM NFTS n
            JOIN CREDENTIALS c ON n.cred_id = c.cred_id
            WHERE c.recipient_nim = $1;
        `;
        
        const result = await db.query(tokenQuery, [nim]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Data token tidak ditemukan untuk NIM tersebut." });
        }

        res.status(200).json(result.rows[0]);

    } catch (error) {
        console.error("Error saat get token by NIM:", error.message);
        res.status(500).json({ message: "Terjadi kesalahan pada server." });
    }
};

exports.verifyCredential = async (req, res) => {
    try {
        const { uuid } = req.params; 

        const dbQuery = `
            SELECT
                c.recipient_name,
                c.recipient_nim,
                c.issue_date,
                c.document_type,
                i.name AS institution_name,
                n.token_id,
                n.token_uri,
                n.asset_file_cid,
                n."status",
                u.wallet_addr AS owner_wallet_from_db
            FROM NFTS n
            JOIN CREDENTIALS c ON n.cred_id = c.cred_id
            JOIN INSTITUTIONS i ON c.inst_id = i.inst_id
            LEFT JOIN USERS u ON n.owner_user_id = u.user_id
            WHERE n.public_uuid = $1;
        `;
        
        const dbResult = await db.query(dbQuery, [uuid]);
        
        if (dbResult.rows.length === 0) {
            return res.status(404).json({ message: "Kredensial tidak ditemukan." });
        }

        const credentialData = dbResult.rows[0];
        const tokenId = credentialData.token_id;

        console.log(`Verifikasi on-chain untuk TokenID: ${tokenId}...`);
        
        const contract = walletService.getReadOnlyContract();
        
        let ownerAddressOnChain;
        try {
            ownerAddressOnChain = await contract.ownerOf(tokenId);
        } catch (onChainError) {
            console.error("Gagal mengambil data on-chain:", onChainError.message);
            return res.status(500).json({ 
                message: "Gagal memvalidasi kepemilikan di blockchain." 
            });
        }
        
        res.status(200).json({
            isValid: true,
            source: {
                offChain: credentialData, 
                onChain: {
                    ownerAddress: ownerAddressOnChain 
                }
            }
        });

    } catch (error) {
        console.error("Error saat verify credential:", error.message);
        res.status(500).json({ message: "Terjadi kesalahan pada server." });
    }
};
