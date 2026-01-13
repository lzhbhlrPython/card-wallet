<template>
  <div class="document-item">
    <div class="document-top">
      <p class="type-icon-wrapper">
        <span class="type-icon">{{ typeIcon }}</span>
      </p>
      <span class="holder-name">{{ document.holder_name }}</span>
    </div>
    <div class="document-middle">
      <span class="document-number">{{ document.masked_number }}</span>
    </div>
    <div class="document-bottom">
      <div class="left-info">
        <span class="document-type">{{ typeLabel }}</span>
      </div>
    </div>
    <div class="actions">
      <button class="secondary-button" @click="$emit('view', document.id)">详情</button>
      <button class="secondary-button" @click="$emit('edit', document.id)">编辑</button>
      <button class="danger-button" @click="$emit('delete', document.id)">删除</button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  document: { type: Object, required: true }
});

const typeIcon = computed(() => {
  const type = props.document.document_type;
  if (type === 'passport') return '🛂';
  if (type === 'id_card') return '🪪';
  if (type === 'travel_permit') return '🎫';
  if (type === 'drivers_license') return '🚗';
  return '📄';
});

const typeLabel = computed(() => {
  const type = props.document.document_type;
  if (type === 'passport') return '护照';
  if (type === 'id_card') return '身份证';
  if (type === 'travel_permit') return '通行证';
  if (type === 'drivers_license') return '驾驶证';
  return type;
});
</script>

<style scoped>
.document-item {
  background: #ffffff;
  border-radius: 12px;
  padding: 1rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}
.document-top { 
  display: flex; 
  align-items: center; 
  justify-content: space-between; 
  margin-bottom: 0.5rem; 
}
.type-icon-wrapper { 
  margin: 0; 
  display: flex; 
  align-items: center; 
}
.type-icon { 
  font-size: 24px; 
  line-height: 1;
}
.holder-name { 
  font-weight: 500; 
  font-size: 0.9rem; 
  color: #333; 
}
.document-middle { 
  margin-bottom: 0.5rem; 
  font-size: 1.2rem; 
  letter-spacing: 2px; 
  font-family: 'SF Mono', 'Menlo', monospace; 
}
.document-bottom { 
  font-size: 0.9rem; 
  color: #333; 
  display: flex; 
  align-items: center; 
  justify-content: space-between; 
  gap: 0.5rem; 
}
.left-info { 
  display: flex; 
  align-items: center; 
}
.document-type { 
  white-space: nowrap; 
  font-weight: 400; 
  color: #666; 
  font-size: 0.8rem; 
}
.actions { 
  margin-top: 0.5rem; 
  display: flex; 
  justify-content: space-between; 
}
.secondary-button, .danger-button { 
  padding: 0.25rem 0.5rem; 
  border: 1px solid #d1d5db; 
  border-radius: 6px; 
  background: none; 
  cursor: pointer; 
  font-size: 0.85rem; 
  transition: background-color .2s; 
}
.secondary-button:hover { 
  background: #f3f4f6; 
}
.danger-button { 
  color: #d32f2f; 
  border-color: #d32f2f; 
}
.danger-button:hover { 
  background: #fdecea; 
}
</style>
