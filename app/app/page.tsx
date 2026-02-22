'use client';

import { useState, useEffect, useCallback } from 'react';
import { Toaster } from 'sonner';
import { Wallet } from '../components/Wallet';
import Navbar from '../components/Navbar';
import CreateAuction from '../components/CreateAuction';
import AuctionCard from '../components/AuctionCard';
import PlaceBid from '../components/PlaceBid';
import RevealBid from '../components/RevealBid';
import FinalizeAuction from '../components/FinalizeAuction';
import { useAuctionProgram } from '../hooks/useAuctionProgram';

function AuctionDashboard() {
  const { fetchAllAuctions, program } = useAuctionProgram();
  const [auctions, setAuctions] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [lookupPda, setLookupPda] = useState('');
  const [loading, setLoading] = useState(true);

  const loadAuctions = useCallback(async () => {
    setLoading(true);
    const accounts = await fetchAllAuctions();
    const pdas = accounts.map((a) => a.publicKey.toBase58());
    setAuctions(pdas);
    if (pdas.length > 0 && !selected) setSelected(pdas[0]);
    setLoading(false);
  }, [fetchAllAuctions, selected]);

  // Load auctions when program becomes available
  useEffect(() => {
    if (program) {
      const timer = setTimeout(() => { loadAuctions(); }, 0);
      return () => clearTimeout(timer);
    }
  }, [program, loadAuctions]);

  const handleCreated = (pda: string) => {
    setAuctions((prev) => [pda, ...prev.filter((p) => p !== pda)]);
    setSelected(pda);
  };

  const handleLookup = () => {
    if (lookupPda.length >= 32) {
      if (!auctions.includes(lookupPda)) {
        setAuctions((prev) => [lookupPda, ...prev]);
      }
      setSelected(lookupPda);
      setLookupPda('');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero */}
      <div className="relative overflow-hidden border-b border-border/40">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-600/5 via-purple-600/5 to-transparent" />
        <div className="max-w-6xl mx-auto px-6 py-12 relative">
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-3">
            Sealed-Bid Auctions
          </h1>
          <p className="text-muted-foreground text-lg max-w-xl">
            Create and participate in private sealed-bid auctions on Solana.
            Bids are hashed until the reveal phase.
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 py-8 grid md:grid-cols-[1fr_400px] gap-8">
        {/* Left: Auction list */}
        <div className="space-y-6">
          {/* Lookup + Refresh */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Paste auction PDA to look up..."
              value={lookupPda}
              onChange={(e) => setLookupPda(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
              className="flex-1 rounded-lg border border-input bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all"
            />
            <button
              onClick={handleLookup}
              className="rounded-lg border border-input bg-muted px-4 py-2.5 text-sm font-medium hover:bg-accent transition-colors"
            >
              Look Up
            </button>
            <button
              onClick={loadAuctions}
              className="rounded-lg border border-input bg-muted px-3 py-2.5 text-sm hover:bg-accent transition-colors"
              title="Refresh all auctions"
            >
              ↻
            </button>
          </div>

          {/* Auction cards */}
          {loading ? (
            <div className="rounded-xl border border-border bg-card p-6 animate-pulse">
              <div className="h-4 bg-muted rounded w-3/4 mb-3" />
              <div className="h-3 bg-muted rounded w-1/2" />
            </div>
          ) : auctions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-12 text-center">
              <p className="text-muted-foreground text-sm">
                No auctions found on-chain. Create one to get started.
              </p>
            </div>
          ) : (
            auctions.map((pda) => (
              <AuctionCard
                key={pda}
                auctionPda={pda}
                onSelect={() => setSelected(pda)}
              />
            ))
          )}
        </div>

        {/* Right: Actions sidebar */}
        <div className="space-y-6">
          <CreateAuction onCreated={handleCreated} />

          {selected && (
            <>
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground mb-1">Selected Auction</p>
                <p className="text-sm font-mono truncate">{selected}</p>
              </div>
              <PlaceBid auctionPda={selected} />
              <RevealBid auctionPda={selected} />
              <FinalizeAuction auctionPda={selected} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <Wallet>
      <Toaster theme="dark" richColors position="bottom-right" />
      <AuctionDashboard />
    </Wallet>
  );
}
