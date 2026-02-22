use anchor_lang::prelude::*;

#[event]
pub struct AuctionCreated {
    pub auction: Pubkey,
    pub authority: Pubkey,
    pub start_ts: i64,
    pub end_ts: i64,
    pub reveal_end_ts: i64,
    pub reserve_price: u64,
}

#[event]
pub struct BidCommitted {
    pub auction: Pubkey,
    pub bidder: Pubkey,
}

#[event]
pub struct BidRevealed {
    pub auction: Pubkey,
    pub bidder: Pubkey,
    pub amount: u64,
}

#[event]
pub struct AuctionFinalized {
    pub auction: Pubkey,
    pub winner: Option<Pubkey>,
    pub highest_bid: u64,
    pub reserve_price: u64,
    pub total_bids: u32,
    pub total_revealed: u32,
}

#[event]
pub struct AuctionSettled {
    pub auction: Pubkey,
}
