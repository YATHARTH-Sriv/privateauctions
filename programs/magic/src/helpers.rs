use anchor_lang::prelude::*;
use sha2::{Digest, Sha256};

/// Computes the SHA-256 bid hash from amount, nonce, bidder pubkey, and auction pubkey.
pub fn compute_bid_hash(
    amount: u64,
    nonce: &[u8; 32],
    bidder: &Pubkey,
    auction: &Pubkey,
) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(amount.to_le_bytes());
    hasher.update(nonce.as_ref());
    hasher.update(bidder.as_ref());
    hasher.update(auction.as_ref());
    let digest = hasher.finalize();
    let mut output = [0_u8; 32];
    output.copy_from_slice(&digest);
    output
}
