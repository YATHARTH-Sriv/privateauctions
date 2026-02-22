'use client';

import { useState } from 'react';
import { BN } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import { useAuctionProgram } from '@/hooks/useAuctionProgram';
import { toast } from 'sonner';

export default function PlaceBid({ auctionPda }: { auctionPda: string }) {
    const { submitSealedBid, initializeBid, wallet } = useAuctionProgram();
    const [amount, setAmount] = useState('');
    const [loading, setLoading] = useState(false);

    const handleBid = async () => {
        if (!wallet) return toast.error('Connect your wallet first');
        if (!amount) return toast.error('Enter a bid amount');

        setLoading(true);
        try {
            const auction = new PublicKey(auctionPda);

            toast.info('Submitting sealed bid...');
            await submitSealedBid(auction, new BN(amount));
            toast.success('Bid submitted!', { description: 'Your bid is sealed and stored locally for reveal.' });
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            toast.error('Failed to place bid', { description: msg.slice(0, 100) });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <h2 className="text-xl font-semibold bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-transparent">
                Place Sealed Bid
            </h2>

            <div>
                <label className="text-sm text-muted-foreground mb-1 block">Bid Amount (lamports)</label>
                <input
                    type="number"
                    placeholder="e.g. 1000"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                />
            </div>

            <p className="text-xs text-muted-foreground">
                Your bid is hashed on-chain. The amount and nonce are stored locally for later reveal.
            </p>

            <button
                onClick={handleBid}
                disabled={loading || !wallet}
                className="w-full rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-3 text-sm font-medium text-white transition-all duration-300 hover:from-emerald-700 hover:to-teal-700 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {loading ? 'Placing Bid...' : 'Place Sealed Bid'}
            </button>
        </div>
    );
}
