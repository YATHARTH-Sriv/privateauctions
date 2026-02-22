'use client';

import { useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useAuctionProgram } from '@/hooks/useAuctionProgram';
import { toast } from 'sonner';

export default function RevealBid({ auctionPda }: { auctionPda: string }) {
    const { revealBid, wallet } = useAuctionProgram();
    const [loading, setLoading] = useState(false);

    const bidKey = wallet ? `bid_${auctionPda}_${wallet.toBase58()}` : '';
    const stored = typeof window !== 'undefined' && bidKey ? localStorage.getItem(bidKey) : null;
    const hasBid = !!stored;
    const storedData = stored ? JSON.parse(stored) as { amount: string; nonce: number[] } : null;

    const handleReveal = async () => {
        if (!wallet) return toast.error('Connect your wallet first');
        if (!hasBid) return toast.error('No stored bid found for this auction');

        setLoading(true);
        try {
            const auction = new PublicKey(auctionPda);
            await revealBid(auction);
            toast.success('Bid revealed!', { description: `Amount: ${storedData?.amount}` });
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            toast.error('Failed to reveal bid', { description: msg.slice(0, 80) });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <h2 className="text-xl font-semibold bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent">
                Reveal Bid
            </h2>

            {hasBid ? (
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3">
                    <p className="text-xs text-amber-400 mb-1">Stored Bid</p>
                    <p className="text-sm font-mono">{storedData?.amount} lamports</p>
                </div>
            ) : (
                <p className="text-sm text-muted-foreground">
                    No bid found in localStorage for this auction. You may not have placed a bid from this browser.
                </p>
            )}

            <button
                onClick={handleReveal}
                disabled={loading || !wallet || !hasBid}
                className="w-full rounded-lg bg-gradient-to-r from-amber-600 to-orange-600 px-4 py-3 text-sm font-medium text-white transition-all duration-300 hover:from-amber-700 hover:to-orange-700 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {loading ? 'Revealing...' : 'Reveal Bid'}
            </button>
        </div>
    );
}
