use anchor_lang::prelude::*;

use crate::{
    constant::BID_SEED,
    error::AuctionError,
    event::BidRevealed,
    helpers::compute_bid_hash,
    state::{Auction, Bid},
};

pub fn reveal_bid(ctx: Context<RevealBid>, amount: u64, nonce: [u8; 32]) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let auction = &mut ctx.accounts.auction;

    require!(now >= auction.end_ts, AuctionError::RevealNotStarted);
    require!(now < auction.reveal_end_ts, AuctionError::RevealClosed);

    let bid = &mut ctx.accounts.bid;
    require!(bid.committed, AuctionError::BidNotCommitted);
    require!(!bid.revealed, AuctionError::AlreadyRevealed);

    let expected = compute_bid_hash(amount, &nonce, &bid.bidder, &auction.key());
    require!(bid.bid_hash == expected, AuctionError::InvalidReveal);

    bid.revealed = true;
    bid.amount = amount;
    bid.nonce = nonce;

    auction.total_revealed = auction
        .total_revealed
        .checked_add(1)
        .ok_or(AuctionError::MathOverflow)?;

    if amount > auction.highest_bid {
        auction.highest_bid = amount;
        auction.highest_bidder = Some(bid.bidder);
    }

    emit!(BidRevealed {
        auction: auction.key(),
        bidder: bid.bidder,
        amount,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct RevealBid<'info> {
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
