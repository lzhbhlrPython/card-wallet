<template>
  <div class="card-item">
    <div class="card-top">
      <p class="network-logo-wrapper">
        <img :src="logoUrl(card.network)" :alt="`卡组织 ${card.network}`" class="network-logo" />
      </p>
      <span class="bank-name">{{ card.bank || '未知银行' }}</span>
    </div>
    <div class="card-middle">
      <span class="card-number">{{ maskedLast4 }}</span>
    </div>
    <div class="card-bottom">
      <span class="expiration" v-if="card.network !== 'tunion' && card.network !== 'ecny'">有效期 {{ card.expiration }}</span>
    </div>
    <div class="actions">
      <button class="secondary-button" @click="$emit('view', card.id)">详情</button>
      <button class="secondary-button" @click="$emit('edit', card.id)">编辑</button>
      <button class="danger-button" @click="$emit('delete', card.id)">删除</button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  card: { type: Object, required: true }
});

function logoUrl(network) {
  return `http://localhost:3000/logos/${network || 'unknown'}.svg`;
}

const maskedLast4 = computed(() => {
  const card = props.card;
  let source = '';
  if (card.number) {
    source = String(card.number).replace(/\D/g, '');
  } else if (card.last4 != null) {
    source = String(card.last4).replace(/\D/g, '');
  }
  const last4 = source ? source.slice(-4) : '';
  return '•••• ' + last4;
});
</script>

<style scoped>
.card-item {
  background: #ffffff;
  border-radius: 12px;
  padding: 1rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}
.card-top { display:flex; align-items:center; justify-content:space-between; margin-bottom:0.5rem; }
.network-logo { height:24px; object-fit:contain; }
.bank-name { font-weight:500; font-size:0.9rem; color:#333; }
.card-middle { margin-bottom:0.5rem; font-size:1.2rem; letter-spacing:2px; font-family:'SF Mono','Menlo',monospace; }
.card-bottom { font-size:0.85rem; color:#666; }
.actions { margin-top:0.5rem; display:flex; justify-content:space-between; }
.secondary-button, .danger-button { padding:0.25rem 0.5rem; border:1px solid #d1d5db; border-radius:6px; background:none; cursor:pointer; font-size:0.85rem; transition:background-color .2s; }
.secondary-button:hover { background:#f3f4f6; }
.danger-button { color:#d32f2f; border-color:#d32f2f; }
.danger-button:hover { background:#fdecea; }
</style>
