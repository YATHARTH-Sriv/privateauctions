'use client';

import { useState } from 'react';
import { BN } from '@coral-xyz/anchor';
import { useAuctionProgram } from '@/hooks/useAuctionProgram';
import { toast } from 'sonner';

export default function CreateAuction({ onCreated }: { onCreated?: (pda: string) => void }) {
    const { createAuction, getAuctionPda, wallet } = useAuctionProgram();
    const [loading, setLoading] = useState(false);
    const [auctionId, setAuctionId] = useState('');
    const [durationMin, setDurationMin] = useState('2');
    const [revealMin, setRevealMin] = useState('2');
    const [reservePrice, setReservePrice] = useState('0');

    const handleCreate = async () => {
        if (!wallet) return toast.error('Connect your wallet first');
        if (!auctionId) return toast.error('Enter an auction ID');

        setLoading(true);
        try {
            const id = new BN(auctionId);
            const now = Math.floor(Date.now() / 1000);
            const biddingDuration = parseInt(durationMin) * 60;
            const revealDuration = parseInt(revealMin) * 60;

            const startTs = new BN(now + 30); // starts in 30 seconds (buffer for devnet confirmation)
            const endTs = new BN(now + 30 + biddingDuration);
            const revealEndTs = new BN(now + 30 + biddingDuration + revealDuration);
            const reserve = new BN(reservePrice || '0');

            await createAuction(id, startTs, endTs, revealEndTs, reserve);
            const [pda] = getAuctionPda(wallet, id);
            toast.success('Auction created!', { description: pda.toBase58().slice(0, 16) + '...' });
            onCreated?.(pda.toBase58());
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            toast.error('Failed to create auction', { description: msg.slice(0, 80) });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="rounded-xl border border-border bg-card p-6 space-y-5">
            <h2 className="text-xl font-semibold bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">
                Create Auction
            </h2>

            <div className="grid gap-4">
                <div>
                    <label className="text-sm text-muted-foreground mb-1 block">Auction ID</label>
                    <input
                        type="number"
                        placeholder="e.g. 1"
                        value={auctionId}
                        onChange={(e) => setAuctionId(e.target.value)}
                        className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                    />
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="text-sm text-muted-foreground mb-1 block">Bidding (min)</label>
                        <input
                            type="number"
                            value={durationMin}
                            onChange={(e) => setDurationMin(e.target.value)}
                            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                        />
                    </div>
                    <div>
                        <label className="text-sm text-muted-foreground mb-1 block">Reveal (min)</label>
                        <input
                            type="number"
                            value={revealMin}
                            onChange={(e) => setRevealMin(e.target.value)}
                            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                        />
                    </div>
                </div>

                <div>
                    <label className="text-sm text-muted-foreground mb-1 block">Reserve Price (lamports)</label>
                    <input
                        type="number"
                        placeholder="0"
                        value={reservePrice}
                        onChange={(e) => setReservePrice(e.target.value)}
                        className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                    />
                </div>
            </div>

            <button
                onClick={handleCreate}
                disabled={loading || !wallet}
                className="w-full rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-3 text-sm font-medium text-white transition-all duration-300 hover:from-blue-700 hover:to-purple-700 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {loading ? 'Creating...' : 'Create Auction'}
            </button>
        </div>
    );
}
