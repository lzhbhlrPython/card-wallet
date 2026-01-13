<template>
  <div v-if="show" class="modal-overlay" @click.self="handleCancel">
    <div class="modal-dialog" :class="typeClass">
      <div class="modal-header">
        <h3 class="modal-title">{{ title }}</h3>
        <button class="modal-close" @click="handleCancel" v-if="!hideClose">×</button>
      </div>
      <div class="modal-body">
        <p>{{ message }}</p>
      </div>
      <div class="modal-footer">
        <button v-if="showCancel" class="modal-btn cancel-btn" @click="handleCancel">
          {{ cancelText }}
        </button>
        <button class="modal-btn confirm-btn" @click="handleConfirm" autofocus>
          {{ confirmText }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  show: { type: Boolean, default: false },
  title: { type: String, default: '提示' },
  message: { type: String, required: true },
  type: { type: String, default: 'info' }, // info, success, warning, error
  confirmText: { type: String, default: '确定' },
  cancelText: { type: String, default: '取消' },
  showCancel: { type: Boolean, default: false },
  hideClose: { type: Boolean, default: false }
});

const emit = defineEmits(['confirm', 'cancel', 'update:show']);

const typeClass = computed(() => {
  return `modal-${props.type}`;
});

function handleConfirm() {
  emit('confirm');
  emit('update:show', false);
}

function handleCancel() {
  emit('cancel');
  emit('update:show', false);
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.modal-dialog {
  background: white;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  max-width: 400px;
  width: 90%;
  animation: slideIn 0.3s ease-out;
}

@keyframes slideIn {
  from {
    transform: translateY(-20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid #e5e7eb;
}

.modal-title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: #1f2937;
}

.modal-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
  color: #6b7280;
  padding: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: background-color 0.2s, color 0.2s;
}

.modal-close:hover {
  background-color: #f3f4f6;
  color: #1f2937;
}

.modal-body {
  padding: 1.5rem;
}

.modal-body p {
  margin: 0;
  color: #4b5563;
  font-size: 0.95rem;
  line-height: 1.6;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  border-top: 1px solid #e5e7eb;
}

.modal-btn {
  padding: 0.5rem 1.25rem;
  border: none;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s, transform 0.1s;
}

.modal-btn:active {
  transform: scale(0.98);
}

.cancel-btn {
  background-color: #f3f4f6;
  color: #4b5563;
}

.cancel-btn:hover {
  background-color: #e5e7eb;
}

.confirm-btn {
  background-color: #007aff;
  color: white;
}

.confirm-btn:hover {
  background-color: #0060d3;
}

/* Type-specific styles */
.modal-success .modal-title {
  color: #10b981;
}

.modal-warning .modal-title {
  color: #f59e0b;
}

.modal-error .modal-title {
  color: #ef4444;
}

.modal-info .modal-title {
  color: #007aff;
}
</style>
