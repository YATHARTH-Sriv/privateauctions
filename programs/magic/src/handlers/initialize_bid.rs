use anchor_lang::prelude::*;

use crate::{
    constant::BID_SEED,
    state::{Auction, Bid},
};

pub fn initialize_bid_account(ctx: Context<InitializeBidAccount>) -> Result<()> {
    let bid = &mut ctx.accounts.bid;
    bid.auction = ctx.accounts.auction.key();
    bid.bidder = ctx.accounts.bidder.key();
    bid.bid_hash = [0_u8; 32];
    bid.committed = false;
    bid.revealed = false;
    bid.amount = 0;
    bid.nonce = [0_u8; 32];
    bid.bump = ctx.bumps.bid;
    Ok(())
}

#[derive(Accounts)]
pub struct InitializeBidAccount<'info> {
    pub auction: Account<'info, Auction>,
    #[account(
        init,
        payer = payer,
        space = 8 + Bid::INIT_SPACE,
        seeds = [BID_SEED, auction.key().as_ref(), bidder.key().as_ref()],
        bump
    )]
    pub bid: Account<'info, Bid>,
    /// The bidder identity tied to this bid PDA.
    pub bidder: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}
