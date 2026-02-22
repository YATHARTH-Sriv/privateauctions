'use client';

import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

export default function Navbar() {
    return (
        <nav className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-xl">
            <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
                        <span className="text-white font-bold text-sm">M</span>
                    </div>
                    <h1 className="text-lg font-semibold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                        Magic Auctions
                    </h1>
                </div>
                <div suppressHydrationWarning>
                    <WalletMultiButton className="!bg-gradient-to-r !from-blue-600 !to-purple-600 !border-0 !rounded-lg !px-5 !py-2 !text-white !text-sm !font-medium !transition-all !duration-300 hover:!from-blue-700 hover:!to-purple-700 hover:!shadow-lg hover:!shadow-blue-500/20" />
                </div>
            </div>
        </nav>
    );
}