const { ethers } = require("ethers");
require("dotenv").config();
const artifact = require("../config/contractABI.json");
const contractABI = artifact.abi ? artifact.abi : artifact;
// 1. Ambil Konfigurasi dari .env
const rpcUrl = process.env.RPC_URL;
const contractAddress = process.env.CONTRACT_ADDRESS;
const minterPrivateKey = process.env.MINTER_WALLET_PRIVATE_KEY;
const treasuryPrivateKey = process.env.TREASURY_WALLET_PRIVATE_KEY;
const treasuryAddress =
  process.env.TREASURY_WALLET_ADDRESS ||
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

// Ambil Chain ID dari env atau gunakan default Hardhat (31337)
const chainId = parseInt(process.env.CHAIN_ID || "31337");

// 2. Validasi Konfigurasi Vital
if (!rpcUrl) throw new Error("RPC_URL tidak ditemukan di .env");
if (!contractAddress)
  throw new Error("CONTRACT_ADDRESS tidak ditemukan di .env");
if (!minterPrivateKey)
  throw new Error("MINTER_WALLET_PRIVATE_KEY tidak ditemukan di .env");

// ============================================================
// PERBAIKAN UTAMA DI SINI (STATIC NETWORK DEFINITION)
// ============================================================
// Kita berikan objek network { chainId, name } sebagai parameter kedua.
// Ini mencegah ethers.js melakukan auto-detection yang sering gagal di localhost.
const provider = new ethers.providers.JsonRpcProvider(rpcUrl, {
  chainId: chainId,
  name: "unknown", // Ethers v5 menggunakan 'unknown' untuk custom network/localhost
});

// 4. Inisialisasi Wallet
// Wallet Minter (Backend): Digunakan untuk melakukan transaksi (minting)
const minterWallet = new ethers.Wallet(minterPrivateKey, provider);

// Wallet Treasury (Opsional): Digunakan jika nanti ada fitur transfer dari treasury
let treasuryWallet = null;
if (treasuryPrivateKey) {
  try {
    treasuryWallet = new ethers.Wallet(treasuryPrivateKey, provider);
  } catch (e) {
    console.warn("Treasury Private Key invalid, fitur claim mungkin terbatas.");
  }
}

// Ekspor Alamat Treasury agar bisa dipakai di Controller
exports.TREASURY_WALLET_ADDRESS = treasuryAddress;

// ==========================================
// FUNGSI-FUNGSI CONTRACT
// ==========================================

// A. Contract dengan akses Minter (Write Access - Bayar Gas)
exports.getContractWithMinter = () => {
  return new ethers.Contract(contractAddress, contractABI, minterWallet);
};

// B. Contract dengan akses Treasury (Write Access - Bayar Gas saat Transfer/Claim)
exports.getContractWithTreasury = () => {
  if (!treasuryWallet) {
    throw new Error("Treasury Wallet belum dikonfigurasi dengan benar.");
  }
  return new ethers.Contract(contractAddress, contractABI, treasuryWallet);
};

// C. Contract Read-Only (Cuma baca data, gratis gas)
exports.getReadOnlyContract = () => {
  return new ethers.Contract(contractAddress, contractABI, provider);
};

// Log Debugging saat start (Bisa dihapus nanti)
console.log(`[WALLET] Minter Address: ${minterWallet.address}`);
console.log(`[WALLET] Connected to RPC: ${rpcUrl}`);
