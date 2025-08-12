<template>
  <div class="bank-select" :class="{ open: dropdownOpen, disabled: disabled }" ref="root">
    <input
      :placeholder="placeholder"
      v-model="inputValue"
      class="bank-select-input"
      :disabled="disabled"
      @keydown.esc.prevent="!disabled && close()"
      @input="!disabled && onInput()"
      @keydown.down.prevent="!disabled && move(1)"
      @keydown.up.prevent="!disabled && move(-1)"
      @keydown.enter.prevent="!disabled && confirmActive()"
      @focus="!disabled && open()"
    />
    <button v-if="inputValue && !disabled" class="clear-btn" type="button" @click="clear" aria-label="清除">×</button>
    <ul v-if="dropdownOpen && !disabled" class="options" role="listbox">
      <li
        v-for="(o,i) in filtered"
        :key="o"
        class="option"
        :class="{ active: i===activeIndex }"
        @mouseenter="activeIndex=i"
        @mousedown.prevent="select(o)"
      >{{ o }}</li>
      <li v-if="!filtered.length" class="option empty">无匹配，回车创建 “{{ inputValue.trim() }}”</li>
    </ul>
  </div>
</template>

<script setup>
import { ref, watch, computed, onMounted, onBeforeUnmount } from 'vue';

const props = defineProps({
  modelValue: { type: String, default: '' },
  options: { type: Array, default: () => [] },
  placeholder: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
});
const emit = defineEmits(['update:modelValue']);

const inputValue = ref(props.modelValue);
watch(() => props.modelValue, v => { if (v !== inputValue.value) inputValue.value = v; });

const dropdownOpen = ref(false);
const activeIndex = ref(-1);
const root = ref(null);

const filtered = computed(() => {
  const kw = inputValue.value.trim().toLowerCase();
  const arr = [...new Set(props.options.filter(Boolean))].sort();
  if (!kw) return arr.slice(0, 50);
  return arr.filter(o => o.toLowerCase().includes(kw)).slice(0, 50);
});

function open() { dropdownOpen.value = true; }
function close() { dropdownOpen.value = false; activeIndex.value = -1; }
function onInput() { open(); emit('update:modelValue', inputValue.value.trim()); activeIndex.value = 0; }
function move(delta) {
  if (!dropdownOpen.value) open();
  if (!filtered.value.length) return;
  activeIndex.value = (activeIndex.value + delta + filtered.value.length) % filtered.value.length;
}
function confirmActive() {
  if (dropdownOpen.value && filtered.value.length && activeIndex.value >= 0) {
    select(filtered.value[activeIndex.value]);
  } else {
    // 创建新值
    emit('update:modelValue', inputValue.value.trim());
    close();
  }
}
function select(val) {
  inputValue.value = val;
  emit('update:modelValue', val);
  close();
}
function clear() {
  inputValue.value = '';
  emit('update:modelValue', '');
  open();
}
function onClickOutside(e) {
  if (root.value && !root.value.contains(e.target)) close();
}

onMounted(() => document.addEventListener('mousedown', onClickOutside));
onBeforeUnmount(() => document.removeEventListener('mousedown', onClickOutside));
</script>

<style scoped>
.bank-select { position: relative; width: 100%; }
.bank-select-input { width:100%; padding:0.5rem 2rem 0.5rem 0.5rem; border:1px solid #d1d5db; border-radius:8px; font-size:1rem; transition:border-color .2s; background:#fff; color:#333; }
.bank-select-input:focus { outline:none; border-color:#007aff; }
.clear-btn { position:absolute; top:50%; right:6px; transform:translateY(-50%); background:rgba(0,0,0,0.05); border:none; width:22px; height:22px; line-height:22px; border-radius:50%; cursor:pointer; font-size:14px; color:#555; }
.clear-btn:hover { background:rgba(0,0,0,0.1); }
.options { position:absolute; z-index:30; top:100%; left:0; right:0; margin:4px 0 0; list-style:none; padding:4px; background:#fff; border:1px solid #e5e7eb; border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,.08); max-height:220px; overflow:auto; }
.option { padding:6px 8px; font-size:0.875rem; border-radius:6px; cursor:pointer; color:#333; }
.option:hover, .option.active { background:#f0f7ff; }
.option.empty { cursor:default; color:#888; font-style:italic; }
.bank-select.disabled .bank-select-input { background:#f3f4f6; cursor:not-allowed; }
</style>
