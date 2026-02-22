'use client';

import { useMemo, useCallback } from 'react';
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';
import { useAnchorWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, SystemProgram, Connection, Transaction } from '@solana/web3.js';
import { createHash } from 'crypto';
import { PROGRAM_ID, AUCTION_SEED, BID_SEED, ER_RPC_URL, VALIDATOR_PUBKEY } from '@/lib/constants';
import idl from '@/lib/idl/magic.json';
import {
    PERMISSION_PROGRAM_ID,
    createDelegatePermissionInstruction,
    permissionPdaFromAccount,
} from "@magicblock-labs/ephemeral-rollups-sdk";

export function useAuctionProgram() {
    const { connection } = useConnection();
    const wallet = useAnchorWallet();

    const provider = useMemo(() => {
        if (!wallet) return null;
        return new AnchorProvider(connection, wallet, {
            commitment: 'confirmed',
            skipPreflight: true,
            preflightCommitment: 'confirmed',
        });
    }, [connection, wallet]);

    const erConnection = useMemo(() => {
        return new Connection(ER_RPC_URL, 'confirmed');
    }, []);

    const erProvider = useMemo(() => {
        if (!wallet) return null;
        return new AnchorProvider(erConnection, wallet, {
            commitment: 'confirmed',
            skipPreflight: true,
            preflightCommitment: 'confirmed',
        });
    }, [erConnection, wallet]);

    const program = useMemo(() => {
        if (!provider) return null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return new Program(idl as any, provider);
    }, [provider]);

    const erProgram = useMemo(() => {
        if (!erProvider) return null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return new Program(idl as any, erProvider);
    }, [erProvider]);

    // --- PDA derivation ---

    const getAuctionPda = useCallback((authority: PublicKey, auctionId: BN) => {
        return PublicKey.findProgramAddressSync(
            [Buffer.from(AUCTION_SEED), authority.toBuffer(), auctionId.toArrayLike(Buffer, 'le', 8)],
            PROGRAM_ID
        );
    }, []);

    const getBidPda = useCallback((auctionPda: PublicKey, bidder: PublicKey) => {
        return PublicKey.findProgramAddressSync(
            [Buffer.from(BID_SEED), auctionPda.toBuffer(), bidder.toBuffer()],
            PROGRAM_ID
        );
    }, []);

    // --- Bid hash ---

    const computeBidHash = useCallback((amount: BN, nonce: Uint8Array, bidder: PublicKey, auction: PublicKey) => {
        const hash = createHash('sha256');
        hash.update(Buffer.from(amount.toArrayLike(Buffer, 'le', 8)));
        hash.update(Buffer.from(nonce));
        hash.update(bidder.toBuffer());
        hash.update(auction.toBuffer());
        return Array.from(hash.digest());
    }, []);

    // --- Instructions ---

    const createAuction = useCallback(async (
        auctionId: BN,
        startTs: BN,
        endTs: BN,
        revealEndTs: BN,
        reservePrice: BN,
    ) => {
        if (!program || !wallet) throw new Error('Wallet not connected');

        const authority = wallet.publicKey;
        const [auctionPda] = getAuctionPda(authority, auctionId);
        const permissionPda = permissionPdaFromAccount(auctionPda);

        // 1. Create Auction
        const createIx = await program.methods
            .createAuction(auctionId, startTs, endTs, revealEndTs, reservePrice)
            .accounts({
                authority,
                systemProgram: SystemProgram.programId,
            })
            .instruction();

        // 2. Create Permission via CPI
        const createPermIx = await program.methods
            .createAuctionPermission()
            .accounts({
                auction: auctionPda,
                permission: permissionPda,
                payer: authority,
                permissionProgram: PERMISSION_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
            })
            .instruction();

        // 3. Delegate Permission to Validator
        const delegatePermIx = createDelegatePermissionInstruction({
            payer: authority,
            authority: [authority, true],
            permissionedAccount: [auctionPda, false],
            ownerProgram: PERMISSION_PROGRAM_ID,
            validator: VALIDATOR_PUBKEY,
        });

        // 4. Delegate Auction PDA to ER
        const delegateAuctionIx = await program.methods
            .delegateAuction(authority, auctionId)
            .accounts({
                payer: authority,
                auction: auctionPda,
                validator: VALIDATOR_PUBKEY,
            })
            .instruction();

        const tx = new Transaction()
            .add(createIx)
            .add(createPermIx)
            .add(delegatePermIx)
            .add(delegateAuctionIx);

        return await provider!.sendAndConfirm(tx, []);
    }, [program, wallet, getAuctionPda, provider]);

    const initializeBid = useCallback(async (auctionPda: PublicKey) => {
        if (!program || !wallet) throw new Error('Wallet not connected');
        const bidder = wallet.publicKey;
        const [bidPda] = getBidPda(auctionPda, bidder);
        const bidPermissionPda = permissionPdaFromAccount(bidPda);

        // 1. Initialize Bid on L1
        const initBidIx = await program.methods
            .initializeBidAccount()
            .accounts({
                auction: auctionPda,
                bid: bidPda,
                bidder,
                payer: bidder,
                systemProgram: SystemProgram.programId,
            })
            .instruction();

        // 2. Create Bid Permission via CPI
        const createBidPermIx = await program.methods
            .createBidPermission()
            .accounts({
                bid: bidPda,
                permission: bidPermissionPda,
                payer: bidder,
                permissionProgram: PERMISSION_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
            })
            .instruction();

        // 3. Delegate Bid Permission
        const delegateBidPermIx = createDelegatePermissionInstruction({
            payer: bidder,
            authority: [bidder, true],
            permissionedAccount: [bidPda, false],
            ownerProgram: PERMISSION_PROGRAM_ID,
            validator: VALIDATOR_PUBKEY,
        });

        // 4. Delegate Bid PDA to ER
        const delegateBidIx = await program.methods
            .delegateBid(auctionPda, bidder)
            .accounts({
                payer: bidder,
                bid: bidPda,
                validator: VALIDATOR_PUBKEY,
            })
            .instruction();

        const tx = new Transaction()
            .add(initBidIx)
            .add(createBidPermIx)
            .add(delegateBidPermIx)
            .add(delegateBidIx);

        const sig = await provider!.sendAndConfirm(tx, []);
        return { sig, bidPda };
    }, [program, wallet, getBidPda, provider]);

    const submitSealedBid = useCallback(async (auctionPda: PublicKey, amount: BN) => {
        if (!program || !wallet) throw new Error('Wallet not connected');
        const bidder = wallet.publicKey;
        const [bidPda] = getBidPda(auctionPda, bidder);

        const nonce = new Uint8Array(32);
        crypto.getRandomValues(nonce);
        const bidHash = computeBidHash(amount, nonce, bidder, auctionPda);

        const delegatedBidIx = await program.methods
            .submitSealedBidDelegated(bidHash)
            .accounts({
                auction: auctionPda,
                bid: bidPda,
                bidder,
            })
            .instruction();

        const tx = new Transaction().add(delegatedBidIx);
        tx.feePayer = bidder;
        tx.recentBlockhash = (await erConnection.getLatestBlockhash()).blockhash;

        // Use wallet adapter to sign the delegated transaction for ER
        // Only the backend wallet can sign, but in frontend we use generic signTransaction
        const signedTx = await wallet.signTransaction(tx);
        const sig = await erConnection.sendRawTransaction(signedTx.serialize());

        const bidKey = `bid_${auctionPda.toBase58()}_${bidder.toBase58()}`;
        localStorage.setItem(bidKey, JSON.stringify({
            amount: amount.toString(),
            nonce: Array.from(nonce),
        }));

        return { sig, bidPda, nonce };
    }, [program, wallet, getBidPda, computeBidHash]);

    const revealBid = useCallback(async (auctionPda: PublicKey) => {
        if (!program || !wallet) throw new Error('Wallet not connected');
        const bidder = wallet.publicKey;
        const [bidPda] = getBidPda(auctionPda, bidder);

        const bidKey = `bid_${auctionPda.toBase58()}_${bidder.toBase58()}`;
        const stored = localStorage.getItem(bidKey);
        if (!stored) throw new Error('No stored bid found — cannot reveal');
        const { amount, nonce } = JSON.parse(stored);

        const revealIx = await program.methods
            .revealBid(new BN(amount), nonce)
            .accounts({
                auction: auctionPda,
                bid: bidPda,
                bidder,
            })
            .instruction();

        const tx = new Transaction().add(revealIx);
        tx.feePayer = bidder;
        tx.recentBlockhash = (await erConnection.getLatestBlockhash()).blockhash;
        const signedTx = await wallet.signTransaction(tx);
        return await erConnection.sendRawTransaction(signedTx.serialize());
    }, [program, wallet, getBidPda, erConnection]);


    const finalizeAuction = useCallback(async (auctionPda: PublicKey) => {
        if (!program || !wallet) throw new Error('Wallet not connected');
        const finalizeIx = await program.methods
            .finalizeAuction()
            .accounts({
                auction: auctionPda,
                authority: wallet.publicKey,
            })
            .instruction();

        const txER = new Transaction().add(finalizeIx);
        txER.feePayer = wallet.publicKey;
        txER.recentBlockhash = (await erConnection.getLatestBlockhash()).blockhash;
        const signedTxER = await wallet.signTransaction(txER);
        await erConnection.sendRawTransaction(signedTxER.serialize());

        // 2. Commit and Settle back to L1
        return await program.methods
            .finalizeAndSettle()
            .accounts({
                auction: auctionPda,
                authority: wallet.publicKey,
                payer: wallet.publicKey,
            })
            .rpc();
    }, [program, wallet, erConnection]);

    const fetchAuction = useCallback(async (auctionPda: PublicKey) => {
        if (!program || !erProgram) return null;
        try {
            // Priority: Try to fetch from ER first (might be delegated), fallback to L1
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return await (erProgram.account as any).auction.fetch(auctionPda);
            } catch {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return await (program.account as any).auction.fetch(auctionPda);
            }
        } catch {
            return null;
        }
    }, [program, erProgram]);

    const fetchBid = useCallback(async (bidPda: PublicKey) => {
        if (!program || !erProgram) return null;
        try {
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return await (erProgram.account as any).bid.fetch(bidPda);
            } catch {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return await (program.account as any).bid.fetch(bidPda);
            }
        } catch {
            return null;
        }
    }, [program, erProgram]);

    const fetchAllAuctions = useCallback(async () => {
        if (!program || !erProgram) return [];
        try {
            const allAuctions = new Map<string, { publicKey: PublicKey; account: unknown }>();

            // 1. Get natively owned accounts on L1 (not currently delegated, or settled)
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const l1Accounts = await (program.account as any).auction.all();
                l1Accounts.forEach((a: any) => {
                    allAuctions.set(a.publicKey.toBase58(), { publicKey: a.publicKey, account: a.account });
                });
            } catch (e) {
                console.warn("L1 fetch error", e);
            }

            // 2. Get delegated accounts directly from the Ephemeral Rollup
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const erAccounts = await (erProgram.account as any).auction.all();
                erAccounts.forEach((a: any) => {
                    // ER state takes precedence for actively delegated accounts
                    allAuctions.set(a.publicKey.toBase58(), { publicKey: a.publicKey, account: a.account });
                });
            } catch (e) {
                console.warn("ER fetch error", e);
            }

            return Array.from(allAuctions.values());
        } catch (e) {
            console.error("Error in fetchAllAuctions", e);
            return [];
        }
    }, [program, erProgram]);

    return {
        program,
        provider,
        wallet: wallet?.publicKey ?? null,
        getAuctionPda,
        getBidPda,
        computeBidHash,
        createAuction,
        initializeBid,
        submitSealedBid,
        revealBid,
        finalizeAuction,
        fetchAuction,
        fetchAllAuctions,
        fetchBid,
    };
}
