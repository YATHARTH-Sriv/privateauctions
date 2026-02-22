'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useAuctionProgram } from '@/hooks/useAuctionProgram';

interface AuctionData {
    authority: PublicKey;
    auctionId: { toNumber: () => number };
    startTs: { toNumber: () => number };
    endTs: { toNumber: () => number };
    revealEndTs: { toNumber: () => number };
    reservePrice: { toNumber: () => number };
    totalBids: number;
    totalRevealed: number;
    highestBid: { toNumber: () => number };
    highestBidder: PublicKey | null;
    status: { finalized?: object; bidding?: object };
    bump: number;
}

function getPhase(auction: AuctionData, nowUnix: number): { label: string; color: string } {
    if (auction.status?.finalized) return { label: 'Finalized', color: 'text-green-400' };
    if (nowUnix < auction.startTs.toNumber()) return { label: 'Pending', color: 'text-yellow-400' };
    if (nowUnix < auction.endTs.toNumber()) return { label: 'Bidding', color: 'text-blue-400' };
    if (nowUnix < auction.revealEndTs.toNumber()) return { label: 'Revealing', color: 'text-purple-400' };
    return { label: 'Reveal Ended', color: 'text-orange-400' };
}

function formatTime(ts: number): string {
    return new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function Countdown({ targetTs }: { targetTs: number }) {
    const [remaining, setRemaining] = useState('');
    useEffect(() => {
        const tick = () => {
            const diff = targetTs - Math.floor(Date.now() / 1000);
            if (diff <= 0) { setRemaining('now'); return; }
            const m = Math.floor(diff / 60);
            const s = diff % 60;
            setRemaining(`${m}m ${s}s`);
        };
        tick();
        const interval = setInterval(tick, 1000);
        return () => clearInterval(interval);
    }, [targetTs]);
    return <span className="font-mono text-sm">{remaining}</span>;
}

export default function AuctionCard({ auctionPda, onSelect }: { auctionPda: string; onSelect?: () => void }) {
    const { fetchAuction } = useAuctionProgram();
    const [auction, setAuction] = useState<AuctionData | null>(null);
    const [error, setError] = useState('');
    const [nowUnix, setNowUnix] = useState(() => Math.floor(Date.now() / 1000));

    // Update clock in effect (not during render)
    useEffect(() => {
        const interval = setInterval(() => setNowUnix(Math.floor(Date.now() / 1000)), 1000);
        return () => clearInterval(interval);
    }, []);

    const refresh = useCallback(async () => {
        try {
            const data = await fetchAuction(new PublicKey(auctionPda));
            setAuction(data as AuctionData | null);
            setError('');
        } catch {
            setError('Auction not found');
        }
    }, [auctionPda, fetchAuction]);

    // Fetch on mount and poll — use setTimeout to avoid sync setState in effect
    useEffect(() => {
        const timer = setTimeout(() => { refresh(); }, 0);
        const interval = setInterval(refresh, 5000);
        return () => { clearTimeout(timer); clearInterval(interval); };
    }, [refresh]);

    // All hooks must be called before any early return
    const phase = useMemo(() => {
        if (!auction) return { label: '', color: '' };
        return getPhase(auction, nowUnix);
    }, [auction, nowUnix]);

    const nextDeadline = useMemo(() => {
        if (!auction) return 0;
        if (nowUnix < auction.startTs.toNumber()) return auction.startTs.toNumber();
        if (nowUnix < auction.endTs.toNumber()) return auction.endTs.toNumber();
        return auction.revealEndTs.toNumber();
    }, [nowUnix, auction]);

    if (error) return (
        <div className="rounded-xl border border-destructive/30 bg-card p-4 text-sm text-destructive">{error}</div>
    );
    if (!auction) return (
        <div className="rounded-xl border border-border bg-card p-6 animate-pulse">
            <div className="h-4 bg-muted rounded w-3/4 mb-3" />
            <div className="h-3 bg-muted rounded w-1/2" />
        </div>
    );

    return (
        <div
            onClick={onSelect}
            className="rounded-xl border border-border bg-card p-6 space-y-4 cursor-pointer transition-all duration-200 hover:border-ring hover:shadow-md"
        >
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-lg">Auction #{auction.auctionId.toNumber()}</h3>
                    <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full border ${phase.color} border-current/20 bg-current/5`}>
                        {phase.label}
                    </span>
                </div>
                <button onClick={(e) => { e.stopPropagation(); refresh(); }}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                    ↻ refresh
                </button>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">Total Bids</p>
                    <p className="text-lg font-bold">{auction.totalBids}</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">Revealed</p>
                    <p className="text-lg font-bold">{auction.totalRevealed}</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">Highest Bid</p>
                    <p className="text-lg font-bold">{auction.highestBid.toNumber()}</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">Reserve</p>
                    <p className="text-lg font-bold">{auction.reservePrice.toNumber()}</p>
                </div>
            </div>

            {/* Timeline */}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Start: {formatTime(auction.startTs.toNumber())}</span>
                <span>End: {formatTime(auction.endTs.toNumber())}</span>
                <span>Reveal End: {formatTime(auction.revealEndTs.toNumber())}</span>
            </div>

            {/* Countdown */}
            {!auction.status?.finalized && (
                <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Next phase in:</span>
                    <Countdown targetTs={nextDeadline} />
                </div>
            )}

            {/* Winner */}
            {auction.status?.finalized && auction.highestBidder && (
                <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-3">
                    <p className="text-xs text-green-400 mb-1">Winner</p>
                    <p className="font-mono text-sm text-green-300 truncate">{auction.highestBidder.toBase58()}</p>
                </div>
            )}
        </div>
    );
}
