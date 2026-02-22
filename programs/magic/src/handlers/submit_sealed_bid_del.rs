use anchor_lang::prelude::*;

use crate::{
    constant::BID_SEED,
    error::AuctionError,
    event::BidCommitted,
    state::{Auction, Bid},
};

pub fn submit_sealed_bid_delegated(
    ctx: Context<SubmitSealedBidDelegated>,
    bid_hash: [u8; 32],
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let auction = &mut ctx.accounts.auction;

    require!(now >= auction.start_ts, AuctionError::AuctionNotStarted);
    require!(now < auction.end_ts, AuctionError::BiddingClosed);

    let bid = &mut ctx.accounts.bid;
    require!(!bid.committed, AuctionError::BidAlreadyCommitted);
    require!(
        bid.auction == auction.key(),
        AuctionError::BidAccountMismatch
    );
    require!(
        bid.bidder == ctx.accounts.bidder.key(),
        AuctionError::BidAccountMismatch
    );

    bid.bid_hash = bid_hash;
    bid.committed = true;
    bid.revealed = false;
    bid.amount = 0;
    bid.nonce = [0_u8; 32];

    auction.total_bids = auction
        .total_bids
        .checked_add(1)
        .ok_or(AuctionError::MathOverflow)?;

    emit!(BidCommitted {
        auction: auction.key(),
        bidder: bid.bidder,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct SubmitSealedBidDelegated<'info> {
    #[account(mut)]
    pub auction: Account<'info, Auction>,
    #[account(
        mut,
        seeds = [BID_SEED, auction.key().as_ref(), bidder.key().as_ref()],
        bump = bid.bump,
        has_one = bidder,
        has_one = auction
    )]
    pub bid: Account<'info, Bid>,
    pub bidder: Signer<'info>,
}
