<template>
  <div class="toast-container">
    <div v-for="t in toasts" :key="t.id" class="toast" :class="`toast--${t.type}`">
      <span class="toast-text">{{ t.text }}</span>
    </div>
  </div>
  
</template>

<script lang="ts">
import { useToasts } from '@/services/toast';

export default {
  setup() {
    const toasts = useToasts();
    return { toasts };
  }
};
</script>

<style scoped lang="scss">
@import "@/styles/_variables";

.toast-container {
  position: fixed;
  right: 16px;
  bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 9999;
}

.toast {
  min-width: 240px;
  max-width: 360px;
  border-radius: 6px;
  padding: 10px 12px;
  color: #fff;
  font-size: 14px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.3);
}

.toast--info { background: rgba(96, 125, 139, 0.9); }
.toast--success { background: rgba(0, 200, 120, 0.95); }
.toast--error { background: rgba(255, 80, 80, 0.95); }

.toast-text { word-break: break-word; }
</style>