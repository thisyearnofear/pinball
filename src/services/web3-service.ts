import { ethers } from 'ethers';

// WalletConnect Bridge URL (for v1)
const BRIDGE_URL = 'https://bridge.walletconnect.org';

class Web3Service {
    private provider: ethers.BrowserProvider | null = null;
    private signer: ethers.Signer | null = null;
    private address: string | null = null;
    private walletConnectProvider: any = null;

    async connect(walletType: 'metamask' | 'walletconnect' = 'metamask'): Promise<{ address: string; chainId: number } | null> {
        try {
            if (walletType === 'metamask') {
                return await this.connectMetaMask();
            } else {
                return await this.connectWalletConnect();
            }
        } catch (error) {
            console.error('Failed to connect wallet:', error);
            return null;
        }
    }

    private async connectMetaMask(): Promise<{ address: string; chainId: number } | null> {
        if (!window.ethereum) {
            throw new Error('MetaMask not installed');
        }

        try {
            // Request account access
            await window.ethereum.request({ method: 'eth_requestAccounts' });

            this.provider = new ethers.BrowserProvider(window.ethereum);
            this.signer = await this.provider.getSigner();
            this.address = await this.signer.getAddress();

            const network = await this.provider.getNetwork();
            const chainId = Number(network.chainId);

            return {
                address: this.address,
                chainId,
            };
        } catch (error) {
            console.error('MetaMask connection failed:', error);
            return null;
        }
    }

    private async connectWalletConnect(): Promise<{ address: string; chainId: number } | null> {
        try {
            // Dynamic import to avoid issues if not available
            const WalletConnectProvider = (await import('@walletconnect/web3-provider')).default;

            this.walletConnectProvider = new WalletConnectProvider({
                bridge: BRIDGE_URL,
                qrcode: true,
                rpc: {
                    1: 'https://cloudflare-eth.com/',
                    137: 'https://polygon-rpc.com/',
                    56: 'https://bsc-dataseed.binance.org/',
                },
            });

            // Enable session (shows QR code)
            await this.walletConnectProvider.enable();

            this.provider = new ethers.BrowserProvider(this.walletConnectProvider);
            this.signer = await this.provider.getSigner();
            this.address = await this.signer.getAddress();

            const network = await this.provider.getNetwork();
            const chainId = Number(network.chainId);

            return {
                address: this.address,
                chainId,
            };
        } catch (error) {
            console.error('WalletConnect connection failed:', error);
            return null;
        }
    }

    async disconnect(): Promise<void> {
        if (this.walletConnectProvider) {
            await this.walletConnectProvider.disconnect();
        }
        this.provider = null;
        this.signer = null;
        this.address = null;
        this.walletConnectProvider = null;
    }

    getProvider(): ethers.BrowserProvider | null {
        return this.provider;
    }

    getSigner(): ethers.Signer | null {
        return this.signer;
    }

    getAddress(): string | null {
        return this.address;
    }

    isConnected(): boolean {
        return this.address !== null;
    }

    async switchChain(chainId: number): Promise<void> {
        if (!this.provider) return;

        try {
            await window.ethereum?.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: `0x${chainId.toString(16)}` }],
            });
        } catch (error) {
            console.error('Failed to switch chain:', error);
        }
    }
}

export const web3Service = new Web3Service();

// Type declaration for window.ethereum
declare global {
    interface Window {
        ethereum?: any;
    }
}