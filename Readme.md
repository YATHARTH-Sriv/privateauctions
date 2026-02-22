# MagicAuctions: Private Sealed-Bid Auctions on Solana

MagicAuctions is a decentralized, trustless sealed-bid auction platform built on Solana. It leverages **MagicBlock's Ephemeral Rollups (ER)** and **Permissioned Execution Framework (PER)** to provide absolute privacy during the bidding phase, preventing front-running, bid shadowing, and collusion.

---

## The Problem: Why Privacy?

On a public blockchain like Solana, all state and transaction data are transparent by default. This makes building a fair **sealed-bid auction** natively impossible:
1. **Front-running & MEV:** Competitors can watch the mempool or recent blocks to see your bid amount and outbid you by a fraction of a lamport at the last second.
2. **Bid Shadowing:** Participants can monitor the highest current bid and adjust their strategy, defeating the purpose of a blind auction.
3. **Collusion:** Whales can coordinate based on visible on-chain data to artificially suppress the final sale price of an asset.

To achieve a true sealed-bid auction, we need a way to hide the bid amount from everyone—including the auctioneer—until the bidding phase concludes.

## The Solution: Why MagicBlock?

We utilize **MagicBlock's Ephemeral Rollups** backed by **Trusted Execution Environments (TEEs)** to solve the public state problem. 

Instead of processing bids directly on Solana L1, MagicAuctions seamlessly delegates the active `Auction` and `Bid` accounts (PDAs) to a MagicBlock TEE Validator. 

**How it protects privacy:**
- When a user submits a `submit_sealed_bid_delegated` transaction, they send it directly to the local TEE RPC (`https://tee.magicblock.app`).
- The TEE securely processes the bid, verifies the amount, and stores the bid privately within the secure enclave.
- The TEE **only** commits the cryptographic hash of the bid, the total number of bids, and the final revealed winner back to the Solana L1 base layer.
- At no point is the raw bid amount exposed to the public Solana ledger during the active bidding window.

---

## Smart Contract Architecture (`programs/magic/src`)

Our Anchor smart contract represents a complete, production-ready lifecycle for private auctions.

### Core Lifecycle Instructions
1. **`create_auction`**: Initializes an auction PDA with a start time, end time, reveal deadline, and a reserve price.
2. **`initialize_bid_account`**: Pre-allocates a `Bid` PDA for a user on L1. This is required before delegating the account to the ER.
3. **`submit_sealed_bid` / `submit_sealed_bid_delegated`**: The core bidding logic. Users submit a cryptographic hash (`SHA256(amount + nonce + bidder_pubkey + auction_pubkey)`). In the delegated TEE environment, this occurs entirely off-L1.
4. **`reveal_bid`**: After the bidding phase ends, users reveal their bid by providing their raw amount and secret nonce. The contract hashes these values and strictly verifies them against the submitted hash.
5. **`finalize_auction`**: Closes the auction, formally transferring the highest bid amount to the auction authority and refunding the losers. Enforces the reserve price.

### MagicBlock PER Integration (Hooks & Delegation)
The contract natively integrates MagicBlock's `ephemeral-rollups-sdk`:
- **`create_auction_permission` / `create_bid_permission`**: Uses CPI to the MagicBlock `PermissionProgram` to grant delegation authority to our program PDAs.
- **`delegate_auction` / `delegate_bid`**: Uses the `#[delegate]` SDK macro to effortlessly transfer ownership of the PDAs from Solana L1 to the Ephemeral Rollup validator.
- **`finalize_and_settle`**: Commits the state from the ER back to L1, securely undelegating the accounts so that final SOL transfers can occur natively on Solana.

---

##  Testing & Verification (`tests/magic.ts`)

Our comprehensive integration test suite rigorously verifies both the standard L1 logic and the complex, cross-chain MagicBlock Ephemeral Rollup flows. 

### What the Tests Cover:
1. **Standard L1 Core Lifecycle**: Verifies auction creation, cryptographic hash generation, bid submission, strict reveal validation (rejects invalid nonces/hashes), tie-breaking logic, and reserve price enforcement.
2. **Private Bidding with MagicBlock PER**: Simulates the exact production deployment flow interacting with a live local Ephemeral Validator.
    * It tests CPI permission creation for PDAs.
    * It verifies the delegation sequence shifting L1 accounts to the TEE.
    * It submits private bids directly to the fast ER RPC.
    * It tests the commit/undelegate phase, proving that state mutated in the TEE is securely settled back to L1.

### 📜 Test Execution Output

```text
  magic — core auction lifecycle (devnet)
     Auction created: ERMhjJReHcgWtDri3ZbfyhJpAmnrrXhjPnYExUj6wzRM
     Sealed bid submitted
     Bid revealed: amount = 100
     Auction finalized — winner: HhHb8avweTSg8tZHtMxBo9Gi7wfw8B9woLLYj6TPSQBJ
    runs a full sealed-bid auction lifecycle (16992ms)
     Invalid reveal correctly rejected
    rejects bid with invalid hash on reveal (11071ms)
     Highest bidder: wT95tXL1UE3ng62HGf6sZFeYYPzGvrhLo2FSPGxknQs with bid 200
    picks the highest bidder among multiple bids (16922ms)
     Reserve enforced — no winner (bid 100 < reserve 500)
    enforces reserve price — no winner if all bids below reserve (17224ms)

  magic — private bidding with MagicBlock PER
     Auction PDA: 12fnqGEAFRZWUdZheKE9Lv88n26KcBo9d8e8KVdVJXPS
     Validator: mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev

     Step 1: Creating auction on localnet...
     Auction created

     Step 2: Creating permission...
     Permission created: 3zuAmewLGtZoSitmWCfUxyke7VXaPemEHsNSRKEP2U9m

     Step 3: Initializing bid account on L1...
     Bid account initialized: ByGqxir7qGHXh7YCpGqqmpvjBJDskhesrTrGvZniWfjn

     Step 4: Creating bid permission...
     Bid permission created: FDnjjdsm6LuCtBkj8fT8rqcgqakrshGsiJSMgnjy3Z6J

     Step 5: Delegating auction permission...
     Auction permission delegated

     Step 6: Delegating bid permission...
     Bid permission delegated

     Step 7: Delegating auction PDA to ER...
     Auction PDA delegated

     Step 8: Delegating bid PDA to ER...
     Bid PDA delegated

     Step 9: Submitting private bid via local PER...
     Waiting 0s for bidding to start...
     Private bid submitted via ER! Sig: 2gA2YjYdY49Qhs9j3c3Qy1bhdQ9i3u2wtGH9TSyNyHDhmgXSAPXzsDLSsHoxZSeavMVhSiCHn3KtdSgeAaQyQFyh
     ER auction readable. totalBids: 1

     Step 11: Revealing private bid on ER...
     Bid revealed on ER

     Step 12: Finalizing auction on ER...
     Auction finalized on ER

     Step 13: Commit + undelegate auction to L1...
     Auction committed/undelegated

     Step 14: Verifying settled state on L1...
     L1 settled state verified

    Private bidding infrastructure verified!
    creates permission + delegates to TEE for private bidding (15008ms)

  per hooks — SDK helpers
     SDK permission instruction builder works
    builds MagicBlock permission + delegation instructions for devnet validator
    Permission PDA derived: 5phzZj7AzbcguczbMb6ESH7cAnYFzfosUbbT8AYDvUL4
    derives correct permission PDA

```
