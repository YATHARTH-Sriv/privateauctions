use anchor_lang::prelude::*;

use crate::{error::AuctionError, event::AuctionFinalized, state::Auction, AuctionStatus};

pub fn finalize_auction(ctx: Context<FinalizeAuction>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let auction = &mut ctx.accounts.auction;
    require!(now >= auction.reveal_end_ts, AuctionError::RevealStillOpen);
    require!(
        auction.status != AuctionStatus::Finalized,
        AuctionError::AuctionAlreadyFinalized
    );

    auction.status = AuctionStatus::Finalized;
    if auction.highest_bid < auction.reserve_price {
        auction.highest_bidder = None;
    }

    emit!(AuctionFinalized {
        auction: auction.key(),
        winner: auction.highest_bidder,
        highest_bid: auction.highest_bid,
        reserve_price: auction.reserve_price,
        total_bids: auction.total_bids,
        total_revealed: auction.total_revealed,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct FinalizeAuction<'info> {
    #[account(mut, has_one = authority)]
    pub auction: Account<'info, Auction>,
    pub authority: Signer<'info>,
}
