'use client';

import { useMemo, useCallback } from 'react';
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';
import { useAnchorWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { createHash } from 'crypto';
import { PROGRAM_ID, AUCTION_SEED, BID_SEED } from '@/lib/constants';
import idl from '@/lib/idl/magic.json';

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

    const program = useMemo(() => {
        if (!provider) return null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return new Program(idl as any, provider);
    }, [provider]);

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

        return await program.methods
            .createAuction(auctionId, startTs, endTs, revealEndTs, reservePrice)
            .accounts({
                authority: wallet.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .rpc();
    }, [program, wallet]);

    const initializeBid = useCallback(async (auctionPda: PublicKey) => {
        if (!program || !wallet) throw new Error('Wallet not connected');
        const bidder = wallet.publicKey;
        const [bidPda] = getBidPda(auctionPda, bidder);

        const sig = await program.methods
            .initializeBidAccount()
            .accounts({
                auction: auctionPda,
                bid: bidPda,
                bidder,
                payer: bidder,
                systemProgram: SystemProgram.programId,
            })
            .rpc();

        return { sig, bidPda };
    }, [program, wallet, getBidPda]);

    const submitSealedBid = useCallback(async (auctionPda: PublicKey, amount: BN) => {
        if (!program || !wallet) throw new Error('Wallet not connected');
        const bidder = wallet.publicKey;
        const [bidPda] = getBidPda(auctionPda, bidder);

        const nonce = new Uint8Array(32);
        crypto.getRandomValues(nonce);
        const bidHash = computeBidHash(amount, nonce, bidder, auctionPda);

        const sig = await program.methods
            .submitSealedBid(bidHash)
            .accounts({
                auction: auctionPda,
                bid: bidPda,
                bidder,
            })
            .rpc();

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

        return await program.methods
            .revealBid(new BN(amount), nonce)
            .accounts({
                auction: auctionPda,
                bid: bidPda,
                bidder,
            })
            .rpc();
    }, [program, wallet, getBidPda]);

    const finalizeAuction = useCallback(async (auctionPda: PublicKey) => {
        if (!program || !wallet) throw new Error('Wallet not connected');

        return await program.methods
            .finalizeAuction()
            .accounts({
                auction: auctionPda,
                authority: wallet.publicKey,
            })
            .rpc();
    }, [program, wallet]);

    const fetchAuction = useCallback(async (auctionPda: PublicKey) => {
        if (!program) return null;
        try {
            return await (program.account as Record<string, { fetch: (key: PublicKey) => Promise<unknown> }>).auction.fetch(auctionPda);
        } catch {
            return null;
        }
    }, [program]);

    const fetchBid = useCallback(async (bidPda: PublicKey) => {
        if (!program) return null;
        try {
            return await (program.account as Record<string, { fetch: (key: PublicKey) => Promise<unknown> }>).bid.fetch(bidPda);
        } catch {
            return null;
        }
    }, [program]);

    const fetchAllAuctions = useCallback(async () => {
        if (!program) return [];
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const accounts = await (program.account as any).auction.all();
            return accounts as { publicKey: PublicKey; account: unknown }[];
        } catch {
            return [];
        }
    }, [program]);

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
