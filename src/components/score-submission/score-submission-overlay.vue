<template>
  <section class="submission-overlay">
    <div class="submission-wrapper">
      <!-- Step 1: Validating Score -->
      <div v-if="step === 'validating'" class="submission-step">
        <div class="submission-spinner">
          <div class="spinner"></div>
        </div>
        <h2 class="submission-title">Validating Your Score</h2>
        <p class="submission-subtitle">{{ score }} points</p>
        <div class="submission-progress">
          <div class="progress-step active">
            <div class="step-dot"></div>
            <div class="step-label">Validating</div>
          </div>
          <div class="progress-step">
            <div class="step-dot"></div>
            <div class="step-label">Signing</div>
          </div>
          <div class="progress-step">
            <div class="step-dot"></div>
            <div class="step-label">Confirming</div>
          </div>
        </div>
      </div>

      <!-- Step 2: Signing Score -->
      <div v-else-if="step === 'signing'" class="submission-step">
        <div class="submission-spinner">
          <div class="spinner spin-faster"></div>
        </div>
        <h2 class="submission-title">Securing Your Score</h2>
        <p class="submission-subtitle">Generating secure signature...</p>
        <div class="submission-progress">
          <div class="progress-step active">
            <div class="step-dot"></div>
            <div class="step-label">Validating</div>
          </div>
          <div class="progress-step active">
            <div class="step-dot"></div>
            <div class="step-label">Signing</div>
          </div>
          <div class="progress-step">
            <div class="step-dot"></div>
            <div class="step-label">Confirming</div>
          </div>
        </div>
      </div>

      <!-- Step 3: Ready for Confirmation -->
      <div v-else-if="step === 'ready'" class="submission-step">
        <div class="submission-icon">
          <div class="icon-check">✓</div>
        </div>
        <h2 class="submission-title">Ready to Submit</h2>
        <p class="submission-subtitle">Approve in your wallet to finalize</p>
        <div class="submission-progress">
          <div class="progress-step active">
            <div class="step-dot"></div>
            <div class="step-label">Validating</div>
          </div>
          <div class="progress-step active">
            <div class="step-dot"></div>
            <div class="step-label">Signing</div>
          </div>
          <div class="progress-step pending">
            <div class="step-dot"></div>
            <div class="step-label">Confirming</div>
          </div>
        </div>
        <p class="submission-hint">👉 Check your wallet for confirmation request</p>
      </div>

      <!-- Error State -->
      <div v-else-if="step === 'error'" class="submission-step error">
        <div class="submission-icon error">
          <div class="icon-error">✕</div>
        </div>
        <h2 class="submission-title">Score Submission Failed</h2>
        <p class="submission-subtitle">{{ errorMessage }}</p>
        <button class="submission-btn retry" @click="$emit('retry')">Try Again</button>
      </div>
    </div>
  </section>
</template>

<script lang="ts">
export default {
  props: {
    score: { type: Number, required: true },
    step: { 
      type: String, 
      default: 'validating',
      validator: (v: string) => ['validating', 'signing', 'ready', 'error'].includes(v)
    },
    errorMessage: { type: String, default: 'An error occurred. Please try again.' },
  },
  emits: ['retry'],
};
</script>

<style lang="scss" scoped>
@import "@/styles/_variables";
@import "@/styles/_mixins";
@import "@/styles/_typography";

.submission-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.85);
  z-index: 15;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(2px);
}

.submission-wrapper {
  text-align: center;
}

.submission-step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  
  &.error {
    gap: 20px;
  }
}

.submission-spinner {
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.spinner {
  width: 100%;
  height: 100%;
  border: 3px solid rgba(0, 255, 136, 0.2);
  border-top-color: #00ff88;
  border-right-color: #00ff88;
  border-radius: 50%;
  animation: spin 1.5s linear infinite;
  
  &.spin-faster {
    animation: spin 0.8s linear infinite;
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.submission-icon {
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(0, 255, 136, 0.15);
  border: 2px solid rgba(0, 255, 136, 0.4);
  
  &.error {
    background: rgba(255, 100, 100, 0.15);
    border-color: rgba(255, 100, 100, 0.4);
  }
}

.icon-check, .icon-error {
  font-size: 40px;
  font-weight: bold;
  color: #00ff88;
  animation: scaleIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  
  &.error {
    color: #ff6464;
  }
}

@keyframes scaleIn {
  0% {
    opacity: 0;
    transform: scale(0.5);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

.submission-title {
  @include titleFont(28px);
  color: #FFF;
  margin: 0;
  letter-spacing: 0.5px;
}

.submission-subtitle {
  color: rgba(255, 255, 255, 0.7);
  font-size: 14px;
  margin: 0;
  line-height: 1.4;
}

.submission-progress {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: center;
  margin: 8px 0;
}

.progress-step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  
  &.active .step-dot {
    background: #00ff88;
    box-shadow: 0 0 12px rgba(0, 255, 136, 0.6);
  }
  
  &.pending .step-dot {
    border-color: rgba(255, 255, 136, 0.5);
    animation: pulse-pending 1.5s ease-in-out infinite;
  }
}

@keyframes pulse-pending {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(255, 255, 136, 0.4);
  }
  50% {
    box-shadow: 0 0 0 6px rgba(255, 255, 136, 0.1);
  }
}

.step-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.3);
  transition: all 0.3s ease;
}

.step-label {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.6);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  transition: color 0.3s ease;
  
  .progress-step.active & {
    color: #00ff88;
  }
  
  .progress-step.pending & {
    color: rgba(255, 255, 136, 0.7);
  }
}

.submission-hint {
  color: rgba(255, 255, 136, 0.8);
  font-size: 13px;
  margin: 0;
  animation: fadeIn 0.6s ease-out 0.3s backwards;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.submission-btn {
  padding: 10px 24px;
  background: rgba(255, 100, 100, 0.15);
  border: 1px solid rgba(255, 100, 100, 0.4);
  color: #ff6464;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s ease;
  
  &:hover {
    background: rgba(255, 100, 100, 0.25);
    border-color: rgba(255, 100, 100, 0.6);
    transform: translateY(-1px);
  }
  
  &:active {
    transform: translateY(0);
  }
}
</style>
