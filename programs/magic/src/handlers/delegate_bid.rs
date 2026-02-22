use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::delegate;
use ephemeral_rollups_sdk::cpi::DelegateConfig;

use crate::constant::BID_SEED;

pub fn delegate_bid(ctx: Context<DelegateBid>, auction: Pubkey, bidder: Pubkey) -> Result<()> {
    let validator = ctx.accounts.validator.as_ref().map(|v| v.key());
    ctx.accounts.delegate_bid(
        &ctx.accounts.payer,
        &[BID_SEED, auction.as_ref(), bidder.as_ref()],
        DelegateConfig {
            validator,
            commit_frequency_ms: 0,
        },
    )?;
    Ok(())
}

#[delegate]
#[derive(Accounts)]
#[instruction(auction: Pubkey, bidder: Pubkey)]
pub struct DelegateBid<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: Checked by the delegate program
    pub validator: Option<AccountInfo<'info>>,
    /// CHECK: The bid PDA to delegate
    #[account(
        mut,
        del,
        seeds = [BID_SEED, auction.as_ref(), bidder.as_ref()],
        bump,
    )]
    pub bid: AccountInfo<'info>,
}
