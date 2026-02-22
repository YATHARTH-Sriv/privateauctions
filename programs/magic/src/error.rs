use anchor_lang::prelude::*;

#[error_code]
pub enum AuctionError {
    #[msg("Auction start time cannot be in the past.")]
    StartInPast,
    #[msg("Auction time range is invalid.")]
    InvalidTimeRange,
    #[msg("Auction has not started yet.")]
    AuctionNotStarted,
    #[msg("Bidding phase has ended.")]
    BiddingClosed,
    #[msg("Reveal phase has not started yet.")]
    RevealNotStarted,
    #[msg("Reveal phase has ended.")]
    RevealClosed,
    #[msg("Bid was already revealed.")]
    AlreadyRevealed,
    #[msg("Reveal payload does not match committed bid hash.")]
    InvalidReveal,
    #[msg("Reveal window is still open.")]
    RevealStillOpen,
    #[msg("Auction was already finalized.")]
    AuctionAlreadyFinalized,
    #[msg("Auction must be finalized before settling.")]
    AuctionNotFinalized,
    #[msg("Math overflow.")]
    MathOverflow,
    #[msg("Permissioned account does not match derived PDA.")]
    PermissionedAccountMismatch,
    #[msg("Permission account does not match derived PDA.")]
    PermissionAccountMismatch,
    #[msg("Caller is not authorized to manage this account.")]
    UnauthorizedAuthority,
    #[msg("Validator account missing or does not match requested validator.")]
    InvalidValidator,
    #[msg("Bid account is not committed yet.")]
    BidNotCommitted,
    #[msg("Bid account was already committed.")]
    BidAlreadyCommitted,
    #[msg("Bid account does not match expected auction/bidder.")]
    BidAccountMismatch,
}
