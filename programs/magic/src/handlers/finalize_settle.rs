use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::commit;
use ephemeral_rollups_sdk::ephem::commit_and_undelegate_accounts;

use crate::{
    constant::AUCTION_SEED, error::AuctionError, event::AuctionSettled, state::Auction,
    AuctionStatus,
};

pub fn finalize_and_settle(ctx: Context<FinalizeAndSettle>) -> Result<()> {
    let auction = &ctx.accounts.auction;
    require!(
        auction.status == AuctionStatus::Finalized,
        AuctionError::AuctionNotFinalized
    );

    // Exit the account to flush serialized state before commit
    ctx.accounts.auction.exit(&crate::ID)?;

    // Commit and undelegate the auction account back to Solana L1
    commit_and_undelegate_accounts(
        &ctx.accounts.payer,
        vec![&ctx.accounts.auction.to_account_info()],
        &ctx.accounts.magic_context,
        &ctx.accounts.magic_program,
    )?;

    emit!(AuctionSettled {
        auction: ctx.accounts.auction.key(),
    });
    Ok(())
}

#[commit]
#[derive(Accounts)]
pub struct FinalizeAndSettle<'info> {
    #[account(
        mut,
        seeds = [AUCTION_SEED, auction.authority.as_ref(), &auction.auction_id.to_le_bytes()],
        bump = auction.bump,
        has_one = authority
    )]
    pub auction: Account<'info, Auction>,
    pub authority: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
}
