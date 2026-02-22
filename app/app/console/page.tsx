import { Wallet } from '@/components/Wallet';
import Navbar from '@/components/Navbar';
import ConsoleDashboard from '@/components/ConsoleDashboard';
import { Toaster } from 'sonner';

export default function ConsolePage() {
    return (
        <Wallet>
            <Toaster theme="dark" richColors position="bottom-right" />
            <div className="min-h-screen bg-background">
                <Navbar />

                <div className="relative overflow-hidden border-b border-border/40">
                    <div className="absolute inset-0 bg-gradient-to-b from-amber-600/5 via-orange-600/5 to-transparent" />
                    <div className="max-w-6xl mx-auto px-6 py-12 relative">
                        <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-amber-400 via-orange-400 to-red-400 bg-clip-text text-transparent mb-3">
                            Compliance Console
                        </h1>
                        <p className="text-muted-foreground text-lg max-w-xl">
                            Operator view for Ephemeral Rollup delegations, permission accounts, and TEE integrity status.
                        </p>
                    </div>
                </div>

                <div className="max-w-6xl mx-auto px-6 py-8">
                    <ConsoleDashboard />
                </div>
            </div>
        </Wallet>
    );
}
