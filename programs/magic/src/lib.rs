use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::ephemeral;

pub mod constant;
pub mod error;
pub mod event;
pub mod handlers;
pub mod helpers;
pub mod state;

use handlers::*;

declare_id!("AjZJtNbxPzGod46tFacPAugCsNte9dnkTbJncc8MUtcA");

#[ephemeral]
#[program]
pub mod magic {
    use super::*;

    pub fn create_auction(
        ctx: Context<CreateAuction>,
        auction_id: u64,
        start_ts: i64,
        end_ts: i64,
        reveal_end_ts: i64,
        reserve_price: u64,
    ) -> Result<()> {
        handlers::create_auction(
            ctx,
            auction_id,
            start_ts,
            end_ts,
            reveal_end_ts,
            reserve_price,
        )
    }

    pub fn submit_sealed_bid(ctx: Context<SubmitSealedBid>, bid_hash: [u8; 32]) -> Result<()> {
        handlers::submit_sealed_bid(ctx, bid_hash)
    }

    pub fn initialize_bid_account(ctx: Context<InitializeBidAccount>) -> Result<()> {
        handlers::initialize_bid_account(ctx)
    }

    pub fn submit_sealed_bid_delegated(
        ctx: Context<SubmitSealedBidDelegated>,
        bid_hash: [u8; 32],
    ) -> Result<()> {
        handlers::submit_sealed_bid_delegated(ctx, bid_hash)
    }

    pub fn reveal_bid(ctx: Context<RevealBid>, amount: u64, nonce: [u8; 32]) -> Result<()> {
        handlers::reveal_bid(ctx, amount, nonce)
    }

    pub fn finalize_auction(ctx: Context<FinalizeAuction>) -> Result<()> {
        handlers::finalize_auction(ctx)
    }

    // --- PER: Permission & Delegation ---

    /// Creates a permission for the auction PDA via CPI to the Permission Program.
    pub fn create_auction_permission(ctx: Context<CreateAuctionPermission>) -> Result<()> {
        handlers::create_auction_permission(ctx)
    }

    /// Creates a permission for the bid PDA via CPI to the Permission Program.
    pub fn create_bid_permission(ctx: Context<CreateBidPermission>) -> Result<()> {
        handlers::create_bid_permission(ctx)
    }

    /// Delegates the auction PDA to an ER validator using the SDK macro.
    pub fn delegate_auction(
        ctx: Context<DelegateAuction>,
        authority: Pubkey,
        auction_id: u64,
    ) -> Result<()> {
        handlers::delegate_auction(ctx, authority, auction_id)
    }

    /// Delegates the bid PDA to an ER validator using the SDK macro.
    pub fn delegate_bid(ctx: Context<DelegateBid>, auction: Pubkey, bidder: Pubkey) -> Result<()> {
        handlers::delegate_bid(ctx, auction, bidder)
    }

    /// Commits and undelegates the auction account back to Solana L1.
    pub fn finalize_and_settle(ctx: Context<FinalizeAndSettle>) -> Result<()> {
        handlers::finalize_and_settle(ctx)
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum AuctionStatus {
    Bidding,
    Finalized,
}
