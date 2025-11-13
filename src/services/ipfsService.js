// src/services/ipfsService.js

// 1. Impor library @pinata/sdk
const pinataSDK = require('@pinata/sdk');
require('dotenv').config();

const { PINATA_API_KEY, PINATA_SECRET_KEY } = process.env;

if (!PINATA_API_KEY || !PINATA_SECRET_KEY) {
    throw new Error("PINATA_API_KEY atau PINATA_SECRET_KEY tidak ditemukan di .env");
}

// 2. Buat instance-nya menggunakan 'new'
// Ini adalah cara penggunaan yang benar untuk @pinata/sdk
const pinata = new pinataSDK(PINATA_API_KEY, PINATA_SECRET_KEY);

/**
 * Mengunggah file (PDF/JPG) ke IPFS via Pinata.
 */
async function uploadFileToIPFS(fileStream, fileName) {
    try {
        console.log(`Mengunggah file ${fileName} ke IPFS...`);
        
        // 3. Panggil fungsi 'pinFileStreamToIPFS'
        const result = await pinata.pinFileStreamToIPFS(fileStream, {
            pinataMetadata: { name: fileName }
        });
        
        console.log("File berhasil diunggah. CID:", result.IpfsHash);
        return result.IpfsHash; // Ini adalah CID-nya

    } catch (error) {
        console.error("Gagal mengunggah file ke IPFS:", error);
        throw new Error("Gagal mengunggah file ke IPFS.");
    }
}

/**
 * Mengunggah metadata.json ke IPFS via Pinata.
 */
async function uploadJsonToIPFS(metadata) {
    try {
        console.log("Mengunggah metadata.json ke IPFS...");

        // 4. Panggil fungsi 'pinJSONToIPFS'
        const result = await pinata.pinJSONToIPFS(metadata, {
            pinataMetadata: { name: `${metadata.name}-metadata.json` }
        });

        console.log("Metadata JSON berhasil diunggah. CID:", result.IpfsHash);
        return `ipfs://${result.IpfsHash}`;

    } catch (error) {
        console.error("Gagal mengunggah JSON ke IPFS:", error);
        throw new Error("Gagal mengunggah JSON ke IPFS.");
    }
}

module.exports = {
    uploadFileToIPFS,
    uploadJsonToIPFS
};