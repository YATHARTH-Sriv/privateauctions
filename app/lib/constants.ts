import { PublicKey } from "@solana/web3.js";

// RPC Endpoints
export const DEVNET_RPC_URL = "https://rpc.magicblock.app/devnet";
export const LOCALNET_RPC_URL = "http://127.0.0.1:8899";
export const ER_RPC_URL = "https://tee.magicblock.app";

// Program
export const PROGRAM_ID = new PublicKey("DahAM1GyX34r7kBuSAwKGpgLCG7XkyVrwheCo8P53VWC");

// MagicBlock
export const VALIDATOR_PUBKEY = new PublicKey("FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA"); // TEE (Asia)

// Seeds
export const AUCTION_SEED = "auction";
export const BID_SEED = "bid";
