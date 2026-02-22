use anchor_lang::prelude::*;

use crate::AuctionStatus;

#[account]
#[derive(InitSpace)]
pub struct Auction {
    pub auction_id: u64,
    pub authority: Pubkey,
    pub start_ts: i64,
    pub end_ts: i64,
    pub reveal_end_ts: i64,
    pub reserve_price: u64,
    pub highest_bid: u64,
    pub highest_bidder: Option<Pubkey>,
    pub total_bids: u32,
    pub total_revealed: u32,
    pub status: AuctionStatus,
    pub bump: u8,
}
