use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Bid {
    pub auction: Pubkey,
    pub bidder: Pubkey,
    pub bid_hash: [u8; 32],
    pub committed: bool,
    pub revealed: bool,
    pub amount: u64,
    pub nonce: [u8; 32],
    pub bump: u8,
}
