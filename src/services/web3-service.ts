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
     * Prioritizes Farcaster wallet in Farcaster environment
     * Returns null if no wallets available, or connection fails
     */
    async autoConnect(): Promise<{ address: string; chainId: number } | null> {
        // First, try Farcaster wallet if available
        try {
            const farcasterResult = await this.connectFarcasterWallet();
            if (farcasterResult) {
                return farcasterResult;
            }
        } catch (error) {
            console.log('Farcaster wallet not available, trying other options...');
        }
        
        // Fallback to traditional wallet options
        const available = this.getAvailableWallets();
        
        // First check if any wallet is already connected without requesting permission
        if (window.ethereum) {
            try {
                const accounts = await window.ethereum.request({ method: 'eth_accounts' });
                if (accounts && accounts.length > 0) {
                    // Wallet is already connected, use it
                    this.provider = new ethers.BrowserProvider(window.ethereum);
                    this.signer = await this.provider.getSigner();
                    this.address = await this.signer.getAddress();
                    
                    const network = await this.provider.getNetwork();
                    const chainId = Number(network.chainId);
                    
                    console.log('Existing wallet connection found:', this.address, 'Chain ID:', chainId);
                    
                    // Emit connection event
                    this.emit('connected', { address: this.address, chainId });
                    
                    return {
                        address: this.address,
                        chainId,
                    };
                }
            } catch (error) {
                console.log('Error checking existing wallet connection:', error);
            }
        }
        
        // Try to connect with available wallet providers
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

    async connect(walletType: 'metamask' | 'farcaster' = 'metamask'): Promise<{ address: string; chainId: number } | null> {
        try {
            if (walletType === 'farcaster') {
                return await this.connectFarcasterWallet();
            } else {
                return await this.connectMetaMask();
            }
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
        try {
            // For WalletConnect providers
            if (this.walletConnectProvider) {
                await this.walletConnectProvider.disconnect();
            }
            
            // For MetaMask and other browser wallets, we can't programmatically disconnect
            // but we can clear our local state and let the user know they need to disconnect manually
            // from their wallet if they want to completely disconnect
            
            // Clear all local state
            this.provider = null;
            this.signer = null;
            this.address = null;
            this.walletConnectProvider = null;
            
            console.log('Wallet disconnected from application');
            
        } catch (error) {
            console.warn('Error during wallet disconnect:', error);
            // Still clear local state even if disconnect fails
            this.provider = null;
            this.signer = null;
            this.address = null;
            this.walletConnectProvider = null;
        } finally {
            // Always emit disconnection event
            this.emit('disconnected');
        }
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
        if (!this.provider || !window.ethereum) return;

        const chainIdHex = `0x${chainId.toString(16)}`;
        
        try {
            // First, try to switch to the chain
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: chainIdHex }],
            });
        } catch (switchError: any) {
            // If the chain is not added to MetaMask, add it
            if (switchError.code === 4902 || switchError.code === -32603) {
                try {
                    await this.addChainToWallet(chainId);
                    // After adding, try switching again
                    await window.ethereum.request({
                        method: 'wallet_switchEthereumChain',
                        params: [{ chainId: chainIdHex }],
                    });
                } catch (addError) {
                    console.error('Failed to add and switch chain:', addError);
                    throw addError;
                }
            } else {
                console.error('Failed to switch chain:', switchError);
                throw switchError;
            }
        }
    }

    private async addChainToWallet(chainId: number): Promise<void> {
        if (!window.ethereum) throw new Error('No wallet provider available');

        const chainIdHex = `0x${chainId.toString(16)}`;
        
        // Arbitrum One network configuration
        if (chainId === 42161) {
            await window.ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [{
                    chainId: chainIdHex,
                    chainName: 'Arbitrum One',
                    rpcUrls: ['https://arb1.arbitrum.io/rpc'],
                    nativeCurrency: {
                        name: 'Ethereum',
                        symbol: 'ETH',
                        decimals: 18,
                    },
                    blockExplorerUrls: ['https://arbiscan.io'],
                }],
            });
        } else {
            throw new Error(`Unsupported chain ID: ${chainId}`);
        }
    }

    private async connectFarcasterWallet(): Promise<{ address: string; chainId: number } | null> {
        try {
            // Try to load Farcaster SDK and get wallet provider
            const { sdk } = await import("@farcaster/miniapp-sdk");
            
            if (typeof sdk?.wallet?.getEthereumProvider !== "function") {
                throw new Error('Farcaster wallet not available');
            }

            const provider = sdk.wallet.getEthereumProvider();
            
            if (!provider || typeof provider.request !== "function") {
                throw new Error('Invalid Farcaster wallet provider');
            }

            // Check if already connected
            let accounts;
            try {
                accounts = await provider.request({ method: 'eth_accounts' });
            } catch (error) {
                console.log('Error checking Farcaster wallet accounts:', error);
            }
            
            // If not connected or no accounts, request connection
            if (!accounts || accounts.length === 0) {
                try {
                    accounts = await provider.request({ method: 'eth_requestAccounts' });
                } catch (error) {
                    // User rejected the connection request
                    console.log('User rejected Farcaster wallet connection');
                    return null;
                }
            }
            
            if (!accounts || accounts.length === 0) {
                throw new Error('No accounts returned from Farcaster wallet');
            }

            this.provider = new ethers.BrowserProvider(provider);
            this.signer = await this.provider.getSigner();
            this.address = await this.signer.getAddress();

            const network = await this.provider.getNetwork();
            const chainId = Number(network.chainId);

            console.log('Farcaster wallet connected:', this.address, 'Chain ID:', chainId);
            
            // Emit connection event
            this.emit('connected', { address: this.address, chainId });

            return {
                address: this.address,
                chainId,
            };
        } catch (error) {
            console.error('Farcaster wallet connection failed:', error);
            return null;
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