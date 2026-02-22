import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { createHash, randomBytes } from "crypto";
import { expect } from "chai";
import {
    Connection,
    Keypair,
    PublicKey,
    Transaction,
    LAMPORTS_PER_SOL,
    SystemProgram,
} from "@solana/web3.js";
import {
    PERMISSION_PROGRAM_ID,
    MAGIC_PROGRAM_ID,
    MAGIC_CONTEXT_ID,
    createCreatePermissionInstruction,
    createDelegatePermissionInstruction,
    permissionPdaFromAccount,
    AUTHORITY_FLAG,
    TX_LOGS_FLAG,
} from "@magicblock-labs/ephemeral-rollups-sdk";
import { Magic } from "../target/types/magic";

const MAGICBLOCK_LOCAL_ER_RPC = "http://localhost:7799";
const MAGICBLOCK_LOCAL_VALIDATOR = new PublicKey(
    "mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev"
);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const WAIT_BUFFER_MS = 2_000;

async function waitUntilUnix(targetUnix: number, extraBufferMs = WAIT_BUFFER_MS) {
    while (Math.floor(Date.now() / 1000) < targetUnix) {
        await sleep(250);
    }
    if (extraBufferMs > 0) {
        await sleep(extraBufferMs);
    }
}

async function waitUntilOnchainUnix(
    connection: Connection,
    targetUnix: number,
    extraBufferMs = WAIT_BUFFER_MS
) {
    while (true) {
        const slot = await connection.getSlot("processed");
        const chainTime = await connection.getBlockTime(slot);
        if (chainTime !== null && chainTime >= targetUnix) {
            break;
        }
        await sleep(300);
    }
    if (extraBufferMs > 0) {
        await sleep(extraBufferMs);
    }
}

async function waitForAuctionFinalizedOnL1(
    program: Program<Magic>,
    auctionPda: PublicKey,
    timeoutMs = 20_000
) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        try {
            const auction = await program.account.auction.fetch(auctionPda);
            if ("finalized" in auction.status) {
                return auction;
            }
        } catch {
            // keep polling
        }
        await sleep(500);
    }
    throw new Error("Timed out waiting for finalized auction state on L1");
}

async function sendViaErWithSigners(params: {
    erConnection: Connection;
    instruction: anchor.web3.TransactionInstruction;
    feePayer: PublicKey;
    providerWallet: anchor.Wallet;
    signers: Keypair[];
}): Promise<string> {
    const tx = new Transaction().add(params.instruction);
    tx.feePayer = params.feePayer;
    tx.recentBlockhash = (await params.erConnection.getLatestBlockhash()).blockhash;
    for (const signer of params.signers) {
        tx.partialSign(signer);
    }
    const signedByAuthority = await params.providerWallet.signTransaction(tx);
    return params.erConnection.sendRawTransaction(signedByAuthority.serialize());
}

const u64Le = (value: anchor.BN): Buffer =>
    value.toArrayLike(Buffer, "le", 8);

const computeBidHash = (
    amount: anchor.BN,
    nonce: Buffer,
    bidder: PublicKey,
    auction: PublicKey
): number[] => {
    const digest = createHash("sha256")
        .update(u64Le(amount))
        .update(nonce)
        .update(bidder.toBuffer())
        .update(auction.toBuffer())
        .digest();
    return Array.from(digest);
};

/**
 * Fund a keypair by transferring SOL from the provider wallet.
 * Uses transfer instead of airdrop to avoid devnet rate limits.
 */
async function fundWallet(
    provider: anchor.AnchorProvider,
    to: PublicKey,
    lamports: number
): Promise<void> {
    const tx = new Transaction().add(
        SystemProgram.transfer({
            fromPubkey: provider.wallet.publicKey,
            toPubkey: to,
            lamports,
        })
    );
    await provider.sendAndConfirm(tx);
}

// ===========================================================================
// Suite 1: Core Auction Lifecycle on Devnet
// ===========================================================================

describe("magic — core auction lifecycle (devnet)", function () {
    this.timeout(120_000); // devnet transactions take longer

    anchor.setProvider(anchor.AnchorProvider.env());
    const program = anchor.workspace.magic as Program<Magic>;
    const provider = anchor.getProvider() as anchor.AnchorProvider;
    const authority = provider.wallet.publicKey;

    it("runs a full sealed-bid auction lifecycle", async () => {
        const bidder = Keypair.generate();
        await fundWallet(provider, bidder.publicKey, 0.5 * LAMPORTS_PER_SOL);

        const now = Math.floor(Date.now() / 1000);
        const auctionId = new anchor.BN(Date.now());
        const startTs = new anchor.BN(now + 2);
        const endTs = new anchor.BN(now + 8);
        const revealEndTs = new anchor.BN(now + 14);
        const reservePrice = new anchor.BN(50);

        const [auctionPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("auction"), authority.toBuffer(), u64Le(auctionId)],
            program.programId
        );

        // --- Create Auction ---
        await program.methods
            .createAuction(auctionId, startTs, endTs, revealEndTs, reservePrice)
            .accounts({
                auction: auctionPda,
                authority,
                systemProgram: SystemProgram.programId,
            } as any)
            .rpc();

        let auction = await program.account.auction.fetch(auctionPda);
        expect(auction.auctionId.toNumber()).to.equal(auctionId.toNumber());
        expect(auction.status).to.deep.equal({ bidding: {} });
        console.log("    ✅ Auction created:", auctionPda.toBase58());

        // Wait for bidding to start
        await waitUntilOnchainUnix(provider.connection, startTs.toNumber());

        // --- Submit Sealed Bid ---
        const [bidPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("bid"), auctionPda.toBuffer(), bidder.publicKey.toBuffer()],
            program.programId
        );

        const bidAmount = new anchor.BN(100);
        const nonce = randomBytes(32);
        const bidHash = computeBidHash(bidAmount, nonce, bidder.publicKey, auctionPda);

        await program.methods
            .submitSealedBid(bidHash)
            .accounts({
                auction: auctionPda,
                bid: bidPda,
                bidder: bidder.publicKey,
                systemProgram: SystemProgram.programId,
            } as any)
            .signers([bidder])
            .rpc();

        const bid = await program.account.bid.fetch(bidPda);
        expect(bid.revealed).to.equal(false);
        expect(bid.amount.toNumber()).to.equal(0);
        console.log("    ✅ Sealed bid submitted");

        // Wait for reveal phase
        await waitUntilOnchainUnix(provider.connection, endTs.toNumber());

        // --- Reveal Bid ---
        await program.methods
            .revealBid(bidAmount, Array.from(nonce))
            .accounts({
                auction: auctionPda,
                bid: bidPda,
                bidder: bidder.publicKey,
            } as any)
            .signers([bidder])
            .rpc();

        const revealedBid = await program.account.bid.fetch(bidPda);
        expect(revealedBid.revealed).to.equal(true);
        expect(revealedBid.amount.toNumber()).to.equal(100);
        console.log("    ✅ Bid revealed: amount =", revealedBid.amount.toNumber());

        // Wait for reveal window to close
        await waitUntilOnchainUnix(provider.connection, revealEndTs.toNumber());

        // --- Finalize Auction ---
        await program.methods
            .finalizeAuction()
            .accounts({
                auction: auctionPda,
                authority,
            } as any)
            .rpc();

        auction = await program.account.auction.fetch(auctionPda);
        expect(auction.highestBid.toNumber()).to.equal(100);
        expect(auction.highestBidder?.toBase58()).to.equal(bidder.publicKey.toBase58());
        expect(auction.totalBids).to.equal(1);
        expect(auction.totalRevealed).to.equal(1);
        expect(auction.status).to.deep.equal({ finalized: {} });
        console.log("    ✅ Auction finalized — winner:", auction.highestBidder?.toBase58());
    });

    it("rejects bid with invalid hash on reveal", async () => {
        const bidder = Keypair.generate();
        await fundWallet(provider, bidder.publicKey, 0.5 * LAMPORTS_PER_SOL);

        const now = Math.floor(Date.now() / 1000);
        const auctionId = new anchor.BN(Date.now() + 1);
        const startTs = new anchor.BN(now + 2);
        const endTs = new anchor.BN(now + 8);
        const revealEndTs = new anchor.BN(now + 14);
        const reservePrice = new anchor.BN(50);

        const [auctionPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("auction"), authority.toBuffer(), u64Le(auctionId)],
            program.programId
        );

        await program.methods
            .createAuction(auctionId, startTs, endTs, revealEndTs, reservePrice)
            .accounts({ auction: auctionPda, authority, systemProgram: SystemProgram.programId } as any)
            .rpc();

        await waitUntilOnchainUnix(provider.connection, startTs.toNumber());

        const [bidPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("bid"), auctionPda.toBuffer(), bidder.publicKey.toBuffer()],
            program.programId
        );

        const bidAmount = new anchor.BN(100);
        const nonce = randomBytes(32);
        const bidHash = computeBidHash(bidAmount, nonce, bidder.publicKey, auctionPda);

        await program.methods
            .submitSealedBid(bidHash)
            .accounts({ auction: auctionPda, bid: bidPda, bidder: bidder.publicKey, systemProgram: SystemProgram.programId } as any)
            .signers([bidder])
            .rpc();

        await waitUntilOnchainUnix(provider.connection, endTs.toNumber());

        // Try to reveal with WRONG amount — should fail
        try {
            await program.methods
                .revealBid(new anchor.BN(999), Array.from(nonce))
                .accounts({ auction: auctionPda, bid: bidPda, bidder: bidder.publicKey } as any)
                .signers([bidder])
                .rpc();
            expect.fail("Should have thrown InvalidReveal error");
        } catch (err: any) {
            expect(err.error.errorCode.code).to.equal("InvalidReveal");
            console.log("    ✅ Invalid reveal correctly rejected");
        }
    });

    it("picks the highest bidder among multiple bids", async () => {
        const bidder1 = Keypair.generate();
        const bidder2 = Keypair.generate();
        await fundWallet(provider, bidder1.publicKey, 0.5 * LAMPORTS_PER_SOL);
        await fundWallet(provider, bidder2.publicKey, 0.5 * LAMPORTS_PER_SOL);

        const now = Math.floor(Date.now() / 1000);
        const auctionId = new anchor.BN(Date.now() + 2);
        const startTs = new anchor.BN(now + 2);
        const endTs = new anchor.BN(now + 8);
        const revealEndTs = new anchor.BN(now + 14);
        const reservePrice = new anchor.BN(50);

        const [auctionPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("auction"), authority.toBuffer(), u64Le(auctionId)],
            program.programId
        );

        await program.methods
            .createAuction(auctionId, startTs, endTs, revealEndTs, reservePrice)
            .accounts({ auction: auctionPda, authority, systemProgram: SystemProgram.programId } as any)
            .rpc();

        await waitUntilOnchainUnix(provider.connection, startTs.toNumber());

        // Bidder 1: bids 80
        const [bid1Pda] = PublicKey.findProgramAddressSync(
            [Buffer.from("bid"), auctionPda.toBuffer(), bidder1.publicKey.toBuffer()],
            program.programId
        );
        const amount1 = new anchor.BN(80);
        const nonce1 = randomBytes(32);
        const hash1 = computeBidHash(amount1, nonce1, bidder1.publicKey, auctionPda);

        await program.methods
            .submitSealedBid(hash1)
            .accounts({ auction: auctionPda, bid: bid1Pda, bidder: bidder1.publicKey, systemProgram: SystemProgram.programId } as any)
            .signers([bidder1])
            .rpc();

        // Bidder 2: bids 200
        const [bid2Pda] = PublicKey.findProgramAddressSync(
            [Buffer.from("bid"), auctionPda.toBuffer(), bidder2.publicKey.toBuffer()],
            program.programId
        );
        const amount2 = new anchor.BN(200);
        const nonce2 = randomBytes(32);
        const hash2 = computeBidHash(amount2, nonce2, bidder2.publicKey, auctionPda);

        await program.methods
            .submitSealedBid(hash2)
            .accounts({ auction: auctionPda, bid: bid2Pda, bidder: bidder2.publicKey, systemProgram: SystemProgram.programId } as any)
            .signers([bidder2])
            .rpc();

        await waitUntilOnchainUnix(provider.connection, endTs.toNumber());

        await program.methods
            .revealBid(amount1, Array.from(nonce1))
            .accounts({ auction: auctionPda, bid: bid1Pda, bidder: bidder1.publicKey } as any)
            .signers([bidder1])
            .rpc();

        await program.methods
            .revealBid(amount2, Array.from(nonce2))
            .accounts({ auction: auctionPda, bid: bid2Pda, bidder: bidder2.publicKey } as any)
            .signers([bidder2])
            .rpc();

        await waitUntilOnchainUnix(provider.connection, revealEndTs.toNumber());

        await program.methods
            .finalizeAuction()
            .accounts({ auction: auctionPda, authority } as any)
            .rpc();

        const auction = await program.account.auction.fetch(auctionPda);
        expect(auction.highestBid.toNumber()).to.equal(200);
        expect(auction.highestBidder?.toBase58()).to.equal(bidder2.publicKey.toBase58());
        expect(auction.totalBids).to.equal(2);
        expect(auction.totalRevealed).to.equal(2);
        console.log("    ✅ Highest bidder:", bidder2.publicKey.toBase58(), "with bid 200");
    });

    it("enforces reserve price — no winner if all bids below reserve", async () => {
        const bidder = Keypair.generate();
        await fundWallet(provider, bidder.publicKey, 0.5 * LAMPORTS_PER_SOL);

        const now = Math.floor(Date.now() / 1000);
        const auctionId = new anchor.BN(Date.now() + 3);
        const startTs = new anchor.BN(now + 2);
        const endTs = new anchor.BN(now + 8);
        const revealEndTs = new anchor.BN(now + 14);
        const reservePrice = new anchor.BN(500); // high reserve

        const [auctionPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("auction"), authority.toBuffer(), u64Le(auctionId)],
            program.programId
        );

        await program.methods
            .createAuction(auctionId, startTs, endTs, revealEndTs, reservePrice)
            .accounts({ auction: auctionPda, authority, systemProgram: SystemProgram.programId } as any)
            .rpc();

        await waitUntilOnchainUnix(provider.connection, startTs.toNumber());

        const [bidPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("bid"), auctionPda.toBuffer(), bidder.publicKey.toBuffer()],
            program.programId
        );

        const amount = new anchor.BN(100); // below reserve
        const nonce = randomBytes(32);
        const hash = computeBidHash(amount, nonce, bidder.publicKey, auctionPda);

        await program.methods
            .submitSealedBid(hash)
            .accounts({ auction: auctionPda, bid: bidPda, bidder: bidder.publicKey, systemProgram: SystemProgram.programId } as any)
            .signers([bidder])
            .rpc();

        await waitUntilOnchainUnix(provider.connection, endTs.toNumber());

        await program.methods
            .revealBid(amount, Array.from(nonce))
            .accounts({ auction: auctionPda, bid: bidPda, bidder: bidder.publicKey } as any)
            .signers([bidder])
            .rpc();

        await waitUntilOnchainUnix(provider.connection, revealEndTs.toNumber());

        await program.methods
            .finalizeAuction()
            .accounts({ auction: auctionPda, authority } as any)
            .rpc();

        const auction = await program.account.auction.fetch(auctionPda);
        expect(auction.highestBidder).to.be.null;
        expect(auction.status).to.deep.equal({ finalized: {} });
        console.log("    ✅ Reserve enforced — no winner (bid 100 < reserve 500)");
    });
});

// ===========================================================================
// Suite 2: Private Bidding with MagicBlock PER (Localnet)
// ===========================================================================

describe("magic — private bidding with MagicBlock PER", function () {
    this.timeout(180_000);
    const VALIDATOR = MAGICBLOCK_LOCAL_VALIDATOR;
    const ER_RPC = MAGICBLOCK_LOCAL_ER_RPC;

    anchor.setProvider(anchor.AnchorProvider.env());
    const program = anchor.workspace.magic as Program<Magic>;
    const provider = anchor.getProvider() as anchor.AnchorProvider;
    const authority = provider.wallet.publicKey;

    it("creates permission + delegates to TEE for private bidding", async () => {
        // Ensure local PER endpoint is actually up; fail fast if not running.
        await new Connection(ER_RPC, "confirmed").getVersion();

        const auctionId = new anchor.BN(Date.now());
        const now = Math.floor(Date.now() / 1000);
        const startTs = new anchor.BN(now + 3);
        const endTs = new anchor.BN(now + 8);
        const revealEndTs = new anchor.BN(now + 13);
        const reservePrice = new anchor.BN(50);

        const [auctionPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("auction"), authority.toBuffer(), u64Le(auctionId)],
            program.programId
        );

        console.log("    📋 Auction PDA:", auctionPda.toBase58());
        console.log("    🌐 Validator:", VALIDATOR.toBase58());

        // Step 1: Create auction
        console.log("\n    📝 Step 1: Creating auction on localnet...");
        await program.methods
            .createAuction(auctionId, startTs, endTs, revealEndTs, reservePrice)
            .accounts({ auction: auctionPda, authority, systemProgram: SystemProgram.programId } as any)
            .rpc();
        console.log("    ✅ Auction created");

        // Step 2: Create permission via our program's CPI wrapper
        console.log("\n    🔐 Step 2: Creating permission...");
        const permissionPda = permissionPdaFromAccount(auctionPda);

        await program.methods
            .createAuctionPermission()
            .accounts({
                auction: auctionPda,
                permission: permissionPda,
                payer: authority,
                permissionProgram: PERMISSION_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
            } as any)
            .rpc();
        console.log("    ✅ Permission created:", permissionPda.toBase58());

        // Step 3: Prepare bidder + bid account on L1 (required before delegated ER writes)
        const bidder = Keypair.generate();
        await fundWallet(provider, bidder.publicKey, 0.5 * LAMPORTS_PER_SOL);
        const [bidPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("bid"), auctionPda.toBuffer(), bidder.publicKey.toBuffer()],
            program.programId
        );
        const bidPermissionPda = permissionPdaFromAccount(bidPda);

        console.log("\n    🧱 Step 3: Initializing bid account on L1...");
        await program.methods
            .initializeBidAccount()
            .accounts({
                auction: auctionPda,
                bid: bidPda,
                bidder: bidder.publicKey,
                payer: bidder.publicKey,
                systemProgram: SystemProgram.programId,
            } as any)
            .signers([bidder])
            .rpc();
        console.log("    ✅ Bid account initialized:", bidPda.toBase58());

        // Step 4: Create bid permission via on-chain CPI (program must sign for bid PDA)
        console.log("\n    🔐 Step 4: Creating bid permission...");
        await program.methods
            .createBidPermission()
            .accounts({
                bid: bidPda,
                permission: bidPermissionPda,
                payer: bidder.publicKey,
                permissionProgram: PERMISSION_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
            } as any)
            .signers([bidder])
            .rpc();
        console.log("    ✅ Bid permission created:", bidPermissionPda.toBase58());

        // Step 5: Delegate auction permission to validator
        console.log("\n    🔗 Step 5: Delegating auction permission...");
        const delegatePermIx = createDelegatePermissionInstruction({
            payer: authority,
            authority: [authority, true],
            permissionedAccount: [auctionPda, false],
            ownerProgram: PERMISSION_PROGRAM_ID,
            validator: VALIDATOR,
        });

        const tx1 = new Transaction().add(delegatePermIx);
        await provider.sendAndConfirm(tx1);
        console.log("    ✅ Auction permission delegated");

        // Step 6: Delegate bid permission to validator
        console.log("\n    🔗 Step 6: Delegating bid permission...");
        const delegateBidPermIx = createDelegatePermissionInstruction({
            payer: bidder.publicKey,
            authority: [bidder.publicKey, true],
            permissionedAccount: [bidPda, false],
            ownerProgram: PERMISSION_PROGRAM_ID,
            validator: VALIDATOR,
        });
        const txBidPerm = new Transaction().add(delegateBidPermIx);
        await provider.sendAndConfirm(txBidPerm, [bidder]);
        console.log("    ✅ Bid permission delegated");

        // Step 7: Delegate auction PDA to ER (SDK #[delegate] macro auto-generates accounts)
        console.log("\n    🔗 Step 7: Delegating auction PDA to ER...");
        await program.methods
            .delegateAuction(authority, auctionId)
            .accounts({
                payer: authority,
                auction: auctionPda,
                validator: VALIDATOR,
            } as any)
            .rpc();
        console.log("    ✅ Auction PDA delegated");

        // Step 8: Delegate bid PDA to ER
        console.log("\n    🔗 Step 8: Delegating bid PDA to ER...");
        await program.methods
            .delegateBid(auctionPda, bidder.publicKey)
            .accounts({
                payer: bidder.publicKey,
                bid: bidPda,
                validator: VALIDATOR,
            } as any)
            .signers([bidder])
            .rpc();
        console.log("    ✅ Bid PDA delegated");

        // Step 9: Submit private bid over local PER endpoint
        console.log("\n    🤫 Step 9: Submitting private bid via local PER...");
        const erConnection = new Connection(ER_RPC, "confirmed");

        const waitTime = Math.max(startTs.toNumber() - Math.floor(Date.now() / 1000), 0);
        console.log(`    ⏳ Waiting ${waitTime}s for bidding to start...`);
        await waitUntilOnchainUnix(provider.connection, startTs.toNumber());

        const bidAmount = new anchor.BN(100);
        const nonce = randomBytes(32);
        const bidHash = computeBidHash(bidAmount, nonce, bidder.publicKey, auctionPda);

        const delegatedBidIx = await program.methods
            .submitSealedBidDelegated(bidHash)
            .accounts({
                auction: auctionPda,
                bid: bidPda,
                bidder: bidder.publicKey,
            } as any)
            .signers([bidder])
            .instruction();

        const delegatedBidTx = new Transaction().add(delegatedBidIx);
        delegatedBidTx.feePayer = authority;
        delegatedBidTx.recentBlockhash = (await erConnection.getLatestBlockhash()).blockhash;
        delegatedBidTx.partialSign(bidder);
        const fullySignedDelegatedBidTx = await provider.wallet.signTransaction(delegatedBidTx);
        const perSig = await erConnection.sendRawTransaction(fullySignedDelegatedBidTx.serialize());
        console.log("    ✅ Private bid submitted via ER! Sig:", perSig);

        // Step 10: Verify delegated state is reflected on PER
        const erProvider = new anchor.AnchorProvider(erConnection, provider.wallet, { commitment: "confirmed" });
        const erProgram = new Program<Magic>(program.idl, erProvider);
        const erAuction = await erProgram.account.auction.fetch(auctionPda);
        const erBid = await erProgram.account.bid.fetch(bidPda);
        console.log("    ✅ ER auction readable. totalBids:", erAuction.totalBids);
        expect(erAuction.auctionId.toString()).to.equal(auctionId.toString());
        expect(erAuction.totalBids).to.equal(1);
        expect(erBid.committed).to.equal(true);

        // Step 11: Reveal private bid on ER
        console.log("\n    👀 Step 11: Revealing private bid on ER...");
        await waitUntilOnchainUnix(erConnection, endTs.toNumber());
        const revealIx = await program.methods
            .revealBid(bidAmount, Array.from(nonce))
            .accounts({
                auction: auctionPda,
                bid: bidPda,
                bidder: bidder.publicKey,
            } as any)
            .instruction();
        await sendViaErWithSigners({
            erConnection,
            instruction: revealIx,
            feePayer: authority,
            providerWallet: provider.wallet as anchor.Wallet,
            signers: [bidder],
        });
        const erBidAfterReveal = await erProgram.account.bid.fetch(bidPda);
        expect(erBidAfterReveal.revealed).to.equal(true);
        expect(erBidAfterReveal.amount.toNumber()).to.equal(100);
        console.log("    ✅ Bid revealed on ER");

        // Step 12: Finalize auction on ER
        console.log("\n    🧮 Step 12: Finalizing auction on ER...");
        await waitUntilOnchainUnix(erConnection, revealEndTs.toNumber());
        await erProgram.methods
            .finalizeAuction()
            .accounts({
                auction: auctionPda,
                authority,
            } as any)
            .rpc();
        const erFinalizedAuction = await erProgram.account.auction.fetch(auctionPda);
        expect(erFinalizedAuction.status).to.deep.equal({ finalized: {} });
        expect(erFinalizedAuction.highestBid.toNumber()).to.equal(100);
        expect(erFinalizedAuction.highestBidder?.toBase58()).to.equal(
            bidder.publicKey.toBase58()
        );
        console.log("    ✅ Auction finalized on ER");

        // Step 13: Commit + undelegate auction back to L1 (#[commit] auto-generates magic accounts)
        console.log("\n    📦 Step 13: Commit + undelegate auction to L1...");
        await erProgram.methods
            .finalizeAndSettle()
            .accounts({
                auction: auctionPda,
                authority,
                payer: authority,
            } as any)
            .rpc();
        console.log("    ✅ Auction committed/undelegated");

        // Step 14: Verify final state visible on base layer
        console.log("\n    ✅ Step 14: Verifying settled state on L1...");
        const l1Auction = await waitForAuctionFinalizedOnL1(program, auctionPda);
        expect(l1Auction.status).to.deep.equal({ finalized: {} });
        expect(l1Auction.totalBids).to.equal(1);
        expect(l1Auction.totalRevealed).to.equal(1);
        expect(l1Auction.highestBid.toNumber()).to.equal(100);
        expect(l1Auction.highestBidder?.toBase58()).to.equal(
            bidder.publicKey.toBase58()
        );
        console.log("    ✅ L1 settled state verified");

        console.log("\n    🎉 Private bidding infrastructure verified!");
    });
});

// ===========================================================================
// Suite 3: SDK Helper Tests (no validator needed)
// ===========================================================================

describe("per hooks — SDK helpers", () => {
    const provider = anchor.AnchorProvider.env();

    it("builds MagicBlock permission + delegation instructions for devnet validator", () => {
        const authority = provider.wallet.publicKey;
        const permissionedAccount = Keypair.generate().publicKey;
        const ownerProgram = Keypair.generate().publicKey;

        const createPermissionIx = createCreatePermissionInstruction(
            { permissionedAccount, payer: authority },
            { members: [{ pubkey: authority, flags: AUTHORITY_FLAG | TX_LOGS_FLAG }] }
        );

        expect(createPermissionIx.programId.equals(PERMISSION_PROGRAM_ID)).to.equal(true);
        expect(createPermissionIx.keys[0].isSigner).to.equal(true);
        expect(
            createPermissionIx.keys[1].pubkey.equals(permissionPdaFromAccount(permissionedAccount))
        ).to.equal(true);
        console.log("    ✅ SDK permission instruction builder works");
    });

    it("derives correct permission PDA", () => {
        const account = Keypair.generate().publicKey;
        const pda = permissionPdaFromAccount(account);
        expect(pda).to.be.instanceOf(PublicKey);
        console.log("    ✅ Permission PDA derived:", pda.toBase58());
    });
});
