<template>
  <div v-if="show" class="overlay">
    <div class="modal">
      <h3>{{ title }}</h3>
      <p>请输入您身份验证器应用程序中的 6 位数字代码。</p>
      <input
        v-model="code"
        type="text"
        inputmode="numeric"
        pattern="\d*"
        maxlength="6"
        autofocus
        class="code-input"
        @keyup.enter="confirm"
      />
      <div class="actions">
        <button class="secondary-button" @click="cancel">取消</button>
        <button class="primary-button" @click="confirm">确认</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, defineProps, defineEmits } from 'vue';

const props = defineProps({
  show: Boolean,
  title: {
    type: String,
    default: 'Two‑Factor Authentication',
  },
});
const emit = defineEmits(['confirm', 'cancel']);

const code = ref('');

watch(
  () => props.show,
  value => {
    if (!value) {
      code.value = '';
    }
  }
);

function confirm() {
  emit('confirm', code.value);
  code.value = '';
}
function cancel() {
  emit('cancel');
  code.value = '';
}
</script>

<style scoped>
.overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal {
  background: #ffffff;
  padding: 1.5rem;
  border-radius: 12px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.05);
  width: 90%;
  max-width: 400px;
  text-align: center;
}
.code-input {
  margin-top: 1rem;
  padding: 0.5rem;
  width: 100%;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 1.25rem;
  text-align: center;
}
.actions {
  margin-top: 1rem;
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
.primary-button {
  background-color: #007aff;
  color: white;
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.2s;
}
.primary-button:hover {
  background-color: #0060d3;
}
.secondary-button {
  background: none;
  border: 1px solid #d1d5db;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.2s;
}
.secondary-button:hover {
  background-color: #f3f4f6;
}
</style>