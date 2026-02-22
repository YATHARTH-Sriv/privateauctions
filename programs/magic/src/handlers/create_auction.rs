use anchor_lang::prelude::*;

use crate::{
    constant::AUCTION_SEED, error::AuctionError, event::AuctionCreated, state::Auction,
    AuctionStatus,
};

pub fn create_auction(
    ctx: Context<CreateAuction>,
    auction_id: u64,
    start_ts: i64,
    end_ts: i64,
    reveal_end_ts: i64,
    reserve_price: u64,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;

    require!(start_ts >= now, AuctionError::StartInPast);
    require!(end_ts > start_ts, AuctionError::InvalidTimeRange);
    require!(reveal_end_ts > end_ts, AuctionError::InvalidTimeRange);

    let auction = &mut ctx.accounts.auction;
    auction.auction_id = auction_id;
    auction.authority = ctx.accounts.authority.key();
    auction.start_ts = start_ts;
    auction.end_ts = end_ts;
    auction.reveal_end_ts = reveal_end_ts;
    auction.reserve_price = reserve_price;
    auction.highest_bid = 0;
    auction.highest_bidder = None;
    auction.total_bids = 0;
    auction.total_revealed = 0;
    auction.status = AuctionStatus::Bidding;
    auction.bump = ctx.bumps.auction;

    emit!(AuctionCreated {
        auction: auction.key(),
        authority: auction.authority,
        start_ts,
        end_ts,
        reveal_end_ts,
        reserve_price,
    });
    Ok(())
}

#[derive(Accounts)]
#[instruction(auction_id: u64)]
pub struct CreateAuction<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Auction::INIT_SPACE,
        seeds = [AUCTION_SEED, authority.key().as_ref(), &auction_id.to_le_bytes()],
        bump
    )]
    pub auction: Account<'info, Auction>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}
