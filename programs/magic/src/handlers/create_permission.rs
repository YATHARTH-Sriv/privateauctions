use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::access_control::{
    instructions::CreatePermissionCpiBuilder,
    structs::{Member, MembersArgs, AUTHORITY_FLAG},
};
use ephemeral_rollups_sdk::consts::PERMISSION_PROGRAM_ID;

use crate::{
    constant::{AUCTION_SEED, BID_SEED},
    state::{Auction, Bid},
};

/// Creates a permission for the auction PDA via CPI to the Permission Program.
/// The program can sign because it owns the auction PDA.
pub fn create_auction_permission(ctx: Context<CreateAuctionPermission>) -> Result<()> {
    let auction = &ctx.accounts.auction;
    let authority = auction.authority;

    let members = vec![Member {
        pubkey: authority,
        flags: AUTHORITY_FLAG,
    }];

    CreatePermissionCpiBuilder::new(&ctx.accounts.permission_program)
        .permission(&ctx.accounts.permission)
        .permissioned_account(&ctx.accounts.auction.to_account_info())
        .payer(&ctx.accounts.payer)
        .system_program(&ctx.accounts.system_program)
        .args(MembersArgs {
            members: Some(members),
        })
        .invoke_signed(&[&[
            AUCTION_SEED,
            auction.authority.as_ref(),
            &auction.auction_id.to_le_bytes(),
            &[auction.bump],
        ]])?;

    Ok(())
}

#[derive(Accounts)]
pub struct CreateAuctionPermission<'info> {
    #[account(
        seeds = [AUCTION_SEED, auction.authority.as_ref(), &auction.auction_id.to_le_bytes()],
        bump = auction.bump,
    )]
    pub auction: Account<'info, Auction>,
    /// CHECK: Permission PDA derived from auction, checked by permission program.
    #[account(mut)]
    pub permission: UncheckedAccount<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: Must match MagicBlock Permission Program.
    #[account(address = PERMISSION_PROGRAM_ID)]
    pub permission_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

/// Creates a permission for the bid PDA via CPI to the Permission Program.
/// The program must sign because it owns the bid PDA.
pub fn create_bid_permission(ctx: Context<CreateBidPermission>) -> Result<()> {
    let bid = &ctx.accounts.bid;

    let members = vec![Member {
        pubkey: bid.bidder,
        flags: AUTHORITY_FLAG,
    }];

    CreatePermissionCpiBuilder::new(&ctx.accounts.permission_program)
        .permission(&ctx.accounts.permission)
        .permissioned_account(&ctx.accounts.bid.to_account_info())
        .payer(&ctx.accounts.payer)
        .system_program(&ctx.accounts.system_program)
        .args(MembersArgs {
            members: Some(members),
        })
        .invoke_signed(&[&[
            BID_SEED,
            bid.auction.as_ref(),
            bid.bidder.as_ref(),
            &[bid.bump],
        ]])?;

    Ok(())
}

#[derive(Accounts)]
pub struct CreateBidPermission<'info> {
    #[account(
        seeds = [BID_SEED, bid.auction.as_ref(), bid.bidder.as_ref()],
        bump = bid.bump,
    )]
    pub bid: Account<'info, Bid>,
    /// CHECK: Permission PDA derived from bid, checked by permission program.
    #[account(mut)]
    pub permission: UncheckedAccount<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: Must match MagicBlock Permission Program.
    #[account(address = PERMISSION_PROGRAM_ID)]
    pub permission_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}
