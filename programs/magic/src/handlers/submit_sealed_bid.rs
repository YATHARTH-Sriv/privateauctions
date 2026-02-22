use anchor_lang::prelude::*;

use crate::{
    constant::BID_SEED,
    error::AuctionError,
    event::BidCommitted,
    state::{Auction, Bid},
};

pub fn submit_sealed_bid(ctx: Context<SubmitSealedBid>, bid_hash: [u8; 32]) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let auction = &mut ctx.accounts.auction;

    require!(now >= auction.start_ts, AuctionError::AuctionNotStarted);
    require!(now < auction.end_ts, AuctionError::BiddingClosed);

    let bid = &mut ctx.accounts.bid;
    bid.auction = auction.key();
    bid.bidder = ctx.accounts.bidder.key();
    bid.bid_hash = bid_hash;
    bid.committed = true;
    bid.revealed = false;
    bid.amount = 0;
    bid.nonce = [0_u8; 32];
    bid.bump = ctx.bumps.bid;

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
pub struct SubmitSealedBid<'info> {
    #[account(mut)]
    pub auction: Account<'info, Auction>,
    #[account(
        init,
        payer = bidder,
        space = 8 + Bid::INIT_SPACE,
        seeds = [BID_SEED, auction.key().as_ref(), bidder.key().as_ref()],
        bump
    )]
    pub bid: Account<'info, Bid>,
    #[account(mut)]
    pub bidder: Signer<'info>,
    pub system_program: Program<'info, System>,
}
