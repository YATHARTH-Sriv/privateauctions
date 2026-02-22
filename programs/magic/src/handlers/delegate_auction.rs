use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::delegate;
use ephemeral_rollups_sdk::cpi::DelegateConfig;

use crate::constant::AUCTION_SEED;

pub fn delegate_auction(
    ctx: Context<DelegateAuction>,
    authority: Pubkey,
    auction_id: u64,
) -> Result<()> {
    let validator = ctx.accounts.validator.as_ref().map(|v| v.key());
    ctx.accounts.delegate_auction(
        &ctx.accounts.payer,
        &[AUCTION_SEED, authority.as_ref(), &auction_id.to_le_bytes()],
        DelegateConfig {
            validator,
            commit_frequency_ms: 0,
        },
    )?;
    Ok(())
}

#[delegate]
#[derive(Accounts)]
#[instruction(authority: Pubkey, auction_id: u64)]
pub struct DelegateAuction<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: Checked by the delegate program
    pub validator: Option<AccountInfo<'info>>,
    /// CHECK: The auction PDA to delegate
    #[account(
        mut,
        del,
        seeds = [AUCTION_SEED, authority.as_ref(), &auction_id.to_le_bytes()],
        bump,
    )]
    pub auction: AccountInfo<'info>,
}
