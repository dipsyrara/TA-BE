const axios = require("axios");
const FormData = require("form-data");
require("dotenv").config();

const PINATA_BASE_URL = "https://api.pinata.cloud";

/**
 * Mengunggah File (PDF/Gambar) ke IPFS via Pinata
 * @param {ReadableStream} fileStream - Stream dari file yang diupload (req.file.buffer)
 * @param {string} fileName - Nama file asli
 * @returns {string} CID (Hash) dari file
 */
exports.uploadFileToIPFS = async (fileStream, fileName) => {
  try {
    const data = new FormData();
    data.append("file", fileStream, fileName); // Stream, Nama File

    // Metadata Pinata (Opsional, agar rapi di dashboard Pinata)
    const metadata = JSON.stringify({
      name: `ASSET_${fileName}_${Date.now()}`,
    });
    data.append("pinataMetadata", metadata);

    // Options Pinata
    const options = JSON.stringify({
      cidVersion: 0, // V0 (Qm...) lebih umum untuk NFT
    });
    data.append("pinataOptions", options);

    const res = await axios.post(
      `${PINATA_BASE_URL}/pinning/pinFileToIPFS`,
      data,
      {
        maxBodyLength: "Infinity", // Penting untuk file besar
        headers: {
          Authorization: `Bearer ${process.env.PINATA_JWT}`, // Gunakan JWT
          ...data.getHeaders(), // Header multipart/form-data otomatis
        },
      }
    );

    console.log("File uploaded to IPFS:", res.data.IpfsHash);
    return res.data.IpfsHash;
  } catch (error) {
    console.error(
      "Error uploading file to IPFS:",
      error.response?.data || error.message
    );
    throw new Error("Gagal mengunggah file ke IPFS.");
  }
};

/**
 * Mengunggah JSON Metadata ke IPFS via Pinata
 * @param {object} metadataJson - Objek JSON Metadata NFT standard ERC-721
 * @returns {string} CID dari Metadata JSON
 */
exports.uploadJsonToIPFS = async (metadataJson) => {
  try {
    const data = JSON.stringify({
      pinataOptions: {
        cidVersion: 0,
      },
      pinataMetadata: {
        name: `METADATA_${metadataJson.name}_${Date.now()}`,
      },
      pinataContent: metadataJson, // Isi JSON Metadata
    });

    const res = await axios.post(
      `${PINATA_BASE_URL}/pinning/pinJSONToIPFS`,
      data,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.PINATA_JWT}`,
        },
      }
    );

    console.log("Metadata uploaded to IPFS:", res.data.IpfsHash);
    return res.data.IpfsHash;
  } catch (error) {
    console.error(
      "Error uploading JSON to IPFS:",
      error.response?.data || error.message
    );
    throw new Error("Gagal mengunggah metadata ke IPFS.");
  }
};
