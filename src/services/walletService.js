// src/services/walletService.js

// 1. Impor 'ethers' (tanpa {})
const ethers = require("ethers");
require("dotenv").config();

// 2. Muat variabel lingkungan
const {
    SEPOLIA_RPC_URL,
    MINTER_WALLET_PRIVATE_KEY,
    TREASURY_WALLET_PRIVATE_KEY,
    CONTRACT_ADDRESS
} = process.env;

// !! PENTING !! (ABI kamu tetap sama)
const CONTRACT_ABI = [
    // ... Salin-tempel isi ABI dari Zikra di sini ...
    "function safeMint(address to, string memory uri) public",
    "function transferFrom(address from, address to, uint256 tokenId) public",
    "function ownerOf(uint256 tokenId) public view returns (address)"
];

// 3. Siapkan Provider Ethers.js (SINTAKSIS v5)
if (!SEPOLIA_RPC_URL) {
    throw new Error("SEPOLIA_RPC_URL tidak ditemukan di .env");
}
// PERUBAHAN DI SINI: tambahkan '.providers'
const provider = new ethers.providers.JsonRpcProvider(SEPOLIA_RPC_URL);


// 4. Siapkan Signer (Wallet)
// (Sintaksis ini sama untuk v5 dan v6)
if (!MINTER_WALLET_PRIVATE_KEY) {
    throw new Error("MINTER_WALLET_PRIVATE_KEY tidak ditemukan di .env");
}
const minterSigner = new ethers.Wallet(MINTER_WALLET_PRIVATE_KEY, provider);
console.log("Wallet Minter berhasil dimuat. Alamat:", minterSigner.address);

if (!TREASURY_WALLET_PRIVATE_KEY) {
    throw new Error("TREASURY_WALLET_PRIVATE_KEY tidak ditemukan di .env");
}
const treasurySigner = new ethers.Wallet(TREASURY_WALLET_PRIVATE_KEY, provider);
console.log("Wallet Treasury berhasil dimuat. Alamat:", treasurySigner.address);


// 5. Ekspor Fungsi Layanan
// (Sintaksis ini sama untuk v5 dan v6)

function getContractWithMinter() {
    if (CONTRACT_ABI.length === 0) {
        throw new Error("CONTRACT_ABI masih kosong. Minta ABI dari Zikra.");
    }
    return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, minterSigner);
}

function getContractWithTreasury() {
    if (CONTRACT_ABI.length === 0) {
        throw new Error("CONTRACT_ABI masih kosong. Minta ABI dari Zikra.");
    }
    return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, treasurySigner);
}

function getReadOnlyContract() {
     if (CONTRACT_ABI.length === 0) {
        throw new Error("CONTRACT_ABI masih kosong. Minta ABI dari Zikra.");
    }
    return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
}

module.exports = {
    getContractWithMinter,
    getContractWithTreasury,
    getReadOnlyContract,
    TREASURY_WALLET_ADDRESS: treasurySigner.address 
};