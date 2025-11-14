<template>
  <div class="wallet-connection">
    <div v-if="!isConnected" class="connection-options">
      <h3>Connect Wallet</h3>
      <button @click="connectMetaMask" class="connect-btn metamask">
        <img src="https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg" alt="MetaMask" class="wallet-icon">
        MetaMask
      </button>
      <button @click="connectWalletConnect" class="connect-btn walletconnect">
        <img src="https://walletconnect.com/static/walletconnect-logo.png" alt="WalletConnect" class="wallet-icon">
        WalletConnect
      </button>
    </div>

    <div v-else class="connected-info">
      <div class="address-display">
        <span class="label">Connected:</span>
        <span class="address">{{ shortAddress }}</span>
        <span class="chain-id">(Chain: {{ chainId }})</span>
      </div>
      <button @click="disconnect" class="disconnect-btn">Disconnect</button>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { web3Service } from '@/services/web3-service';

export default defineComponent({
  name: 'WalletConnection',
  data() {
    return {
      isConnected: false,
      address: '',
      chainId: 0,
    };
  },
  computed: {
    shortAddress(): string {
      if (!this.address) return '';
      return `${this.address.slice(0, 6)}...${this.address.slice(-4)}`;
    },
  },
  methods: {
    async connectMetaMask() {
      try {
        const result = await web3Service.connect('metamask');
        if (result) {
          this.isConnected = true;
          this.address = result.address;
          this.chainId = result.chainId;
        }
      } catch (error) {
        console.error('MetaMask connection failed:', error);
        alert('Failed to connect to MetaMask. Please make sure MetaMask is installed.');
      }
    },

    async connectWalletConnect() {
      try {
        const result = await web3Service.connect('walletconnect');
        if (result) {
          this.isConnected = true;
          this.address = result.address;
          this.chainId = result.chainId;
        }
      } catch (error) {
        console.error('WalletConnect connection failed:', error);
        alert('Failed to connect via WalletConnect. Please try again.');
      }
    },

    async disconnect() {
      try {
        await web3Service.disconnect();
        this.isConnected = false;
        this.address = '';
        this.chainId = 0;
      } catch (error) {
        console.error('Disconnect failed:', error);
      }
    },
  },

  mounted() {
    // Check if already connected on component mount
    this.isConnected = web3Service.isConnected();
    if (this.isConnected) {
      this.address = web3Service.getAddress() || '';
      // Note: chainId would need to be stored or re-fetched
    }
  },
});
</script>

<style scoped>
.wallet-connection {
  padding: 20px;
  background: rgba(0, 0, 0, 0.8);
  border-radius: 10px;
  color: white;
  font-family: 'Courier New', monospace;
}

.connection-options h3 {
  margin-top: 0;
  margin-bottom: 15px;
  color: #00ff00;
}

.connect-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 12px;
  margin: 5px 0;
  border: 2px solid #00ff00;
  border-radius: 5px;
  background: transparent;
  color: white;
  cursor: pointer;
  transition: all 0.3s ease;
  font-size: 16px;
}

.connect-btn:hover {
  background: #00ff00;
  color: black;
}

.wallet-icon {
  width: 24px;
  height: 24px;
  margin-right: 10px;
}

.connected-info {
  text-align: center;
}

.address-display {
  margin-bottom: 15px;
  font-size: 14px;
}

.label {
  color: #00ff00;
  margin-right: 5px;
}

.address {
  font-weight: bold;
  color: #ffff00;
}

.chain-id {
  color: #888;
  font-size: 12px;
  margin-left: 5px;
}

.disconnect-btn {
  padding: 8px 16px;
  border: 1px solid #ff4444;
  border-radius: 5px;
  background: transparent;
  color: #ff4444;
  cursor: pointer;
  transition: all 0.3s ease;
}

.disconnect-btn:hover {
  background: #ff4444;
  color: white;
}
</style>