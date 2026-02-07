const axios = require("axios");
const FormData = require("form-data");
require("dotenv").config();

const PINATA_BASE_URL = "https://api.pinata.cloud";

/**
 *
 * @param {ReadableStream} fileStream
 * @param {string} fileName
 * @returns {string}
 */
exports.uploadFileToIPFS = async (fileStream, fileName) => {
  try {
    const data = new FormData();
    data.append("file", fileStream, fileName);

    const metadata = JSON.stringify({
      name: `ASSET_${fileName}_${Date.now()}`,
    });
    data.append("pinataMetadata", metadata);

    const options = JSON.stringify({
      cidVersion: 0,
    });
    data.append("pinataOptions", options);

    const res = await axios.post(
      `${PINATA_BASE_URL}/pinning/pinFileToIPFS`,
      data,
      {
        maxBodyLength: "Infinity",
        headers: {
          Authorization: `Bearer ${process.env.PINATA_JWT}`,
          ...data.getHeaders(),
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
 *
 * @param {object} metadataJson
 * @returns {string}
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
      pinataContent: metadataJson,
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
