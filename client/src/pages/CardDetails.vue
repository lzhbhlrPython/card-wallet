<template>
  <div class="details-container" v-if="loaded">
    <h2>卡片详情</h2>
    <div class="detail">
      <span class="label">银行：</span>
      <span class="value">{{ card.bank }}</span>
    </div>
    <div class="detail">
      <span class="label">组织：</span>
      <span class="value">{{ card.network }}</span>
    </div>
    <div class="detail copy-row">
      <span class="label">卡号：</span>
      <span class="value mono">{{ card.number }}</span>
      <button class="mini-btn" @click="copy(card.number, '卡号')">复制</button>
    </div>
    <div class="detail copy-row">
      <span class="label">CVV：</span>
      <span class="value mono">{{ card.cvv === '000' ? 'null' : card.cvv }}</span>
      <button class="mini-btn" @click="copy(card.cvv, 'CVV')" v-if="card.cvv !== '000'">复制</button>
    </div>
    <div class="detail copy-row">
      <span class="label">有效期：</span>
      <span class="value mono">{{ (card.network==='tunion' || card.network==='ecny') ? '12/99' : card.expiration }}</span>
      <button class="mini-btn" @click="copy(card.expiration, '有效期')" v-if="card.network!=='tunion' && card.network!=='ecny'">复制</button>
    </div>
    <div class="detail" v-if="card.note">
      <span class="label">备注：</span>
      <span class="value">{{ card.note }}</span>
    </div>
    <div class="actions">
      <router-link :to="`/cards/${id}/edit`" class="secondary-button">编辑</router-link>
      <router-link to="/cards" class="primary-button">返回</router-link>
    </div>
  </div>
  <TwoFactorPrompt
    :show="!loaded && showPrompt"
    title="输入验证码查看详情"
    @confirm="onConfirm"
    @cancel="onCancel"
  />
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useCardsStore } from '@/stores/cards';
import TwoFactorPrompt from '@/components/TwoFactorPrompt.vue';

const route = useRoute();
const router = useRouter();
const id = route.params.id;
const cardsStore = useCardsStore();

const showPrompt = ref(true);
const loaded = ref(false);
const card = ref({});

async function onConfirm(code) {
  showPrompt.value = false;
  const res = await cardsStore.fetchCardDetails(id, code);
  if (res.ok) {
    card.value = res.data;
    loaded.value = true;
  } else {
    alert(res.message);
    router.push('/cards');
  }
}

function onCancel() {
  showPrompt.value = false;
  router.push('/cards');
}

function copy(text, label) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    // 简单反馈
    toast(label + '已复制');
  }).catch(() => {
    alert('复制失败');
  });
}

const toastMsg = ref('');
const showToast = ref(false);
let toastTimer = null;
function toast(msg) {
  toastMsg.value = msg;
  showToast.value = true;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (showToast.value = false), 1800);
}

onMounted(() => {
  // 弹窗会根据 showPrompt 默认显示
});
</script>

<style scoped>
.details-container {
  max-width: 500px;
  margin: 2rem auto;
  background: #ffffff;
  padding: 2rem 2rem 2.5rem;
  border-radius: 12px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.04);
  color: #333;
}
.detail {
  display: flex;
  align-items: center;
  gap: .5rem;
  margin-bottom: 0.6rem;
}
.label {
  font-weight: 500;
  min-width: 60px;
  color: #555;
}
.value {
  flex: 1;
  word-break: break-all;
}
.mono {
  font-family: 'SF Mono', 'Menlo', monospace;
  letter-spacing: .5px;
}
.copy-row {
  position: relative;
}
.copy-row .mini-btn {
  background: #1a88ff;
  border: 1px solid #1474d6;
  color: #fff;
  font-size: .75rem;
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: background .15s, box-shadow .15s;
  margin-left: auto;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
}
.copy-row .mini-btn:hover {
  background: #0f75e3;
}
.copy-row .mini-btn:active {
  background: #0b5fb8;
}
.actions {
  margin-top: 1.2rem;
  display: flex;
  justify-content: space-between;
}
.primary-button,
.secondary-button {
  padding: 0.5rem 1rem;
  border-radius: 8px;
  font-size: 1rem;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background-color 0.2s;
}
.primary-button {
  background-color: #007aff;
  color: #fff;
  border: none;
}
.primary-button:hover {
  background-color: #0060d3;
}
.secondary-button {
  background: none;
  color: #007aff;
  border: 1px solid #d1d5db;
}
.secondary-button:hover {
  background-color: #f3f4f6;
}
.toast {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: #333;
  color: #fff;
  padding: 8px 16px;
  border-radius: 20px;
  font-size: .8rem;
  opacity: 0;
  animation: fade .2s forwards;
}
@keyframes fade {
  to {
    opacity: 1;
  }
}
</style>