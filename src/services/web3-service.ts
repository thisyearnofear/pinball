import { ethers } from 'ethers';
import { EventEmitter } from 'events';

// WalletConnect Bridge URL (for v1)
const BRIDGE_URL = 'https://bridge.walletconnect.org';

class Web3Service extends EventEmitter {
    private provider: ethers.BrowserProvider | null = null;
    private signer: ethers.Signer | null = null;
    private address: string | null = null;
    private walletConnectProvider: any = null;

    constructor() {
        super();
    }

    /**
     * Get available wallet options for the current environment
     * Returns wallets in priority order
     */
    getAvailableWallets(): Array<'metamask'> {
        // For now, only expose MetaMask/browser extension wallets
        // WalletConnect v1 has too many compatibility issues with Vite/browser
        // Users should install a wallet extension
        const available: Array<'metamask'> = [];
        
        // Check if MetaMask or compatible extension is available
        if (window.ethereum && typeof window.ethereum.request === 'function') {
            available.push('metamask');
        }
        
        return available;
    }

    /**
     * Auto-connect to the best available wallet
     * Returns null if no wallets available, or connection fails
     */
    async autoConnect(): Promise<{ address: string; chainId: number } | null> {
        const available = this.getAvailableWallets();
        
        for (const walletType of available) {
            try {
                const result = await this.connect(walletType);
                if (result) {
                    return result;
                }
            } catch (error) {
                console.log(`Failed to auto-connect with ${walletType}, trying next...`);
            }
        }
        
        return null;
    }

    async connect(walletType: 'metamask' = 'metamask'): Promise<{ address: string; chainId: number } | null> {
        try {
            return await this.connectMetaMask();
        } catch (error) {
            console.error(`Failed to connect with ${walletType}:`, error);
            return null;
        }
    }

    private async connectMetaMask(): Promise<{ address: string; chainId: number } | null> {
        if (!window.ethereum) {
            console.error('MetaMask not installed - window.ethereum is undefined');
            throw new Error('MetaMask not installed');
        }

        // Check if it's a valid EIP-1193 provider
        if (typeof window.ethereum.request !== 'function') {
            console.error('window.ethereum is not a valid EIP-1193 provider');
            throw new Error('Invalid Ethereum provider');
        }

        try {
            // Request account access
            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            
            if (!accounts || accounts.length === 0) {
                throw new Error('No accounts returned from wallet');
            }

            this.provider = new ethers.BrowserProvider(window.ethereum);
            this.signer = await this.provider.getSigner();
            this.address = await this.signer.getAddress();

            const network = await this.provider.getNetwork();
            const chainId = Number(network.chainId);

            console.log('MetaMask connected:', this.address, 'Chain ID:', chainId);
            
            // Emit connection event
            this.emit('connected', { address: this.address, chainId });

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
            // Try to use web3modal or WalletConnect if available
            // Otherwise fall back to browser defaults
            console.log('Attempting WalletConnect connection...');
            
            // For now, WalletConnect v1 has compatibility issues with Vite/browser
            // Try to use any available provider extension
            if (window.ethereum) {
                // If we have a provider available (MetaMask, Brave, etc), use it
                try {
                    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
                    if (accounts && accounts.length > 0) {
                        this.provider = new ethers.BrowserProvider(window.ethereum);
                        this.signer = await this.provider.getSigner();
                        this.address = await this.signer.getAddress();
                        const network = await this.provider.getNetwork();
                        const chainId = Number(network.chainId);
                        console.log('Secondary provider connected:', this.address);
                        this.emit('connected', { address: this.address, chainId });
                        return { address: this.address, chainId };
                    }
                } catch (e) {
                    console.log('Secondary provider request failed');
                }
            }

            // If no fallback provider available, show error message
            console.error('WalletConnect v1 has compatibility issues in browser. Please use MetaMask or other browser extension.');
            throw new Error('WalletConnect unavailable - please use a browser wallet extension');
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
        
        // Emit disconnection event
        this.emit('disconnected');
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

    setProvider(provider: ethers.BrowserProvider, signer: ethers.Signer, address: string): void {
        this.provider = provider;
        this.signer = signer;
        this.address = address;
        this.emit('connected', { address, chainId: 1 });
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