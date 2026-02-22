'use client';

import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import React, { FC, ReactNode, useMemo } from 'react';
import { DEVNET_RPC_URL } from '@/lib/constants';

import '@solana/wallet-adapter-react-ui/styles.css';

interface WalletProps {
    children: ReactNode;
}

export const Wallet: FC<WalletProps> = ({ children }) => {
    // Switch to DEVNET_RPC_URL for devnet, or LOCALNET_RPC_URL for local testing
    const endpoint = DEVNET_RPC_URL;

    const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], []);

    return (
        <div suppressHydrationWarning>
            <ConnectionProvider endpoint={endpoint}>
                <WalletProvider wallets={wallets} autoConnect>
                    <WalletModalProvider>{children}</WalletModalProvider>
                </WalletProvider>
            </ConnectionProvider>
        </div>
    );
};