const { ethers } = require("ethers");
require("dotenv").config();
const artifact = require("../config/contractABI.json");
const contractABI = artifact.abi ? artifact.abi : artifact;

const rpcUrl = process.env.RPC_URL;
const contractAddress = process.env.CONTRACT_ADDRESS;
const minterPrivateKey = process.env.MINTER_WALLET_PRIVATE_KEY;
const treasuryPrivateKey = process.env.TREASURY_WALLET_PRIVATE_KEY;
const treasuryAddress = process.env.TREASURY_WALLET_ADDR;
if (!treasuryAddress)
  throw new Error("TREASURY_WALLET_ADDR wajib diisi di .env");
const chainId = parseInt(process.env.CHAIN_ID || "31337");

if (!rpcUrl) throw new Error("RPC_URL tidak ditemukan di .env");
if (!contractAddress)
  throw new Error("CONTRACT_ADDRESS tidak ditemukan di .env");
if (!minterPrivateKey)
  throw new Error("MINTER_WALLET_PRIVATE_KEY tidak ditemukan di .env");

const provider = new ethers.providers.JsonRpcProvider(rpcUrl, {
  chainId: chainId,
  name: "unknown",
});

const minterWallet = new ethers.Wallet(minterPrivateKey, provider);

let treasuryWallet = null;
if (treasuryPrivateKey) {
  try {
    treasuryWallet = new ethers.Wallet(treasuryPrivateKey, provider);
  } catch (e) {
    console.warn("Treasury Private Key invalid, fitur claim mungkin terbatas.");
  }
}

exports.TREASURY_WALLET_ADDR = treasuryAddress;

exports.getContractWithMinter = () => {
  return new ethers.Contract(contractAddress, contractABI, minterWallet);
};

exports.getContractWithTreasury = () => {
  if (!treasuryWallet) {
    throw new Error("Treasury Wallet belum dikonfigurasi dengan benar.");
  }
  return new ethers.Contract(contractAddress, contractABI, treasuryWallet);
};

exports.getReadOnlyContract = () => {
  return new ethers.Contract(contractAddress, contractABI, provider);
};

console.log(`[WALLET] Minter Address: ${minterWallet.address}`);
console.log(`[WALLET] Connected to RPC: ${rpcUrl}`);
