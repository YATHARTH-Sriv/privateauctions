'use client';

import { useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useAuctionProgram } from '@/hooks/useAuctionProgram';
import { toast } from 'sonner';

export default function FinalizeAuction({ auctionPda }: { auctionPda: string }) {
    const { finalizeAuction, wallet } = useAuctionProgram();
    const [loading, setLoading] = useState(false);

    const handleFinalize = async () => {
        if (!wallet) return toast.error('Connect your wallet first');

        setLoading(true);
        try {
            const auction = new PublicKey(auctionPda);
            await finalizeAuction(auction);
            toast.success('Auction finalized!');
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            toast.error('Failed to finalize', { description: msg.slice(0, 80) });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <h2 className="text-xl font-semibold bg-gradient-to-r from-rose-500 to-pink-500 bg-clip-text text-transparent">
                Finalize Auction
            </h2>

            <p className="text-sm text-muted-foreground">
                Only the auction authority can finalize. The reveal window must have ended.
            </p>

            <button
                onClick={handleFinalize}
                disabled={loading || !wallet}
                className="w-full rounded-lg bg-gradient-to-r from-rose-600 to-pink-600 px-4 py-3 text-sm font-medium text-white transition-all duration-300 hover:from-rose-700 hover:to-pink-700 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {loading ? 'Finalizing...' : 'Finalize Auction'}
            </button>
        </div>
    );
}
