<template>
  <div class="inline-filter-select" :class="{ open, disabled, multiple: multiple }" ref="root">
    <button
      type="button"
      class="display"
      :disabled="disabled"
      @click="toggle"
      @keydown.down.prevent="openList()"
      @keydown.enter.prevent="toggle()"
    >
      <template v-if="!hasSelection">
        <span class="placeholder">{{ placeholder }}</span>
      </template>
      <template v-else>
        <span v-if="multiple" class="value tags">
          <span v-for="(lab,i) in displayTags" :key="lab + i" class="tag">
            {{ lab }}
          </span>
          <span v-if="hiddenTagCount>0" class="tag extra">+{{ hiddenTagCount }}</span>
        </span>
        <span v-else class="value">{{ displayText }}</span>
      </template>
      <span v-if="hasSelection" class="clear" @click.stop="clear" aria-label="清除">×</span>
      <span class="chevron" aria-hidden="true">⌄</span>
    </button>
    <div v-if="open" class="dropdown" @keydown.esc.stop.prevent="close()">
      <div class="toolbar" v-if="multiple && normNoAll.length">
        <button type="button" class="tb-btn" @click.stop="selectAll">全选</button>
        <button type="button" class="tb-btn" @click.stop="invertSelect">反选</button>
        <button type="button" class="tb-btn" @click.stop="clear">清空</button>
      </div>
      <input
        v-if="searchable"
        ref="searchInput"
        v-model="keyword"
        class="search"
        type="text"
        placeholder="搜索..."
        @keydown.down.prevent="move(1)"
        @keydown.up.prevent="move(-1)"
        @keydown.enter.prevent="confirmActive()"
      />
      <ul class="list" role="listbox">
        <li
          v-for="(opt,i) in filtered"
          :key="opt.value + ':' + i"
          class="item"
          :class="{ active: i===activeIndex, selected: isSelected(opt.value) }"
          @mouseenter="activeIndex=i"
          @mousedown.prevent="select(opt.value)"
        >
          <slot name="option" :option="opt">{{ opt.label }}</slot>
          <span v-if="multiple" class="check" aria-hidden="true">{{ isSelected(opt.value) ? '✔' : '' }}</span>
        </li>
        <li v-if="!filtered.length" class="item empty">无匹配</li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';

const props = defineProps({
  modelValue: { type: [String, Array], default: '' },
  options: { type: Array, default: () => [] }, // string 或 {value,label}
  placeholder: { type: String, default: '全部' },
  searchable: { type: Boolean, default: true },
  disabled: { type: Boolean, default: false },
  clearable: { type: Boolean, default: true },
  maxHeight: { type: Number, default: 260 },
  multiple: { type: Boolean, default: false },
  closeOnSelect: { type: Boolean, default: true }, // multiple=false 时生效
  maxTagCount: { type: Number, default: 2 },
});
const emit = defineEmits(['update:modelValue']);

const open = ref(false);
const keyword = ref('');
const activeIndex = ref(-1);
const root = ref(null);
const searchInput = ref(null);
const multiple = props.multiple;

// 归一化选项（加入 __ALL__）
const norm = computed(() => {
  const base = props.options.map(o => {
    if (o && typeof o === 'object') return { value: String(o.value), label: String(o.label ?? o.value) };
    return { value: String(o), label: String(o) };
  });
  return [{ value: '__ALL__', label: `全部${props.placeholder.replace(/全部|组织|银行/g,'')||''}` }, ...base];
});
// norm 带有 __ALL__ 第一项
const normNoAll = computed(()=> norm.value.filter(o=>o.value!=='__ALL__'));

// 统一选中集合
const selection = computed({
  get(){
    if (props.multiple) {
      if (Array.isArray(props.modelValue)) return props.modelValue.map(String);
      if (props.modelValue) return [String(props.modelValue)];
      return [];
    }
    return props.modelValue ? String(props.modelValue) : '';
  },
  set(v){
    if (props.multiple) {
      const old = Array.isArray(props.modelValue) ? props.modelValue.map(String) : [];
      const next = Array.isArray(v) ? v.map(String) : [];
      if (old.length === next.length && old.every((x,i)=>x===next[i])) return; // 无变化不触发
      emit('update:modelValue', next);
    } else {
      if (props.modelValue === v) return;
      emit('update:modelValue', v);
    }
  }
});

const hasSelection = computed(()=> props.multiple ? selection.value.length>0 : !!selection.value);

function isSelected(val){
  return props.multiple ? selection.value.includes(val) : selection.value === val;
}

// 过滤
const filtered = computed(()=>{
  const kw = keyword.value.trim().toLowerCase();
  const arr = norm.value;
  if(!kw) return arr.slice(0, 400);
  return arr.filter(o => o.label.toLowerCase().includes(kw)).slice(0, 400);
});

// 展示文本
const displayText = computed(()=>{
  if(!hasSelection.value) return '';
  if(!props.multiple) {
    const f = norm.value.find(o=>o.value===selection.value);
    return f ? f.label : selection.value;
  }
  const arr = selection.value.map(v => {
    const f = norm.value.find(o=>o.value===v); return f?f.label:v;
  });
  if (arr.length <= props.maxTagCount) return arr.join(', ');
  return arr.slice(0, props.maxTagCount).join(', ') + ` +${arr.length - props.maxTagCount}`;
});
const displayTags = computed(()=> {
  if(!multiple) return [];
  return selection.value.slice(0, props.maxTagCount).map(v=>{
    const f = norm.value.find(o=>o.value===v); return f?f.label:v;
  });
});
const hiddenTagCount = computed(()=> multiple && selection.value.length>props.maxTagCount ? selection.value.length - props.maxTagCount : 0);

function toggle(){ if(props.disabled) return; open.value ? close() : openList(); }
function openList(){ if(props.disabled) return; open.value=true; activeIndex.value=0; nextTick(()=>{ if(searchInput.value) searchInput.value.focus(); }); }
function close(){ open.value=false; keyword.value=''; activeIndex.value=-1; }
function clear(){ if(!props.clearable) return; props.multiple ? selection.value = [] : selection.value=''; close(); }
function select(value){
  // __ALL__ 约定：清空选择（相当于“全部”）
  if(value === '__ALL__') { selection.value = props.multiple ? [] : ''; if(!props.multiple && props.closeOnSelect) close(); return; }
  if(props.multiple){
    const arr = Array.isArray(selection.value)? [...selection.value]:[];
    const idx = arr.indexOf(value);
    if(idx===-1) arr.push(value); else arr.splice(idx,1);
    selection.value = arr;
  } else {
    selection.value = value === selection.value ? '' : value;
    if(props.closeOnSelect) close();
  }
}
function move(d){ if(!open.value) return; if(!filtered.value.length) return; activeIndex.value = (activeIndex.value + d + filtered.value.length) % filtered.value.length; }
function confirmActive(){ if(open.value && filtered.value.length && activeIndex.value>=0){ select(filtered.value[activeIndex.value].value); } }

function onDocClick(e){ if(root.value && !root.value.contains(e.target)) close(); }

onMounted(()=> document.addEventListener('mousedown', onDocClick));
onBeforeUnmount(()=> document.removeEventListener('mousedown', onDocClick));

watch(()=>props.modelValue, ()=>{/* 同步外部变更 */});
</script>

<style scoped>
.inline-filter-select { position:relative; font-size:0.8rem; }
.display { width:100%; text-align:left; padding:0.4rem 1.9rem 0.4rem 0.6rem; border:1px solid #d1d5db; border-radius:8px; background:#fff; cursor:pointer; font-size:0.8rem; line-height:1.2; position:relative; color:#333; transition:border-color .2s, box-shadow .2s; }
.display:focus { outline:none; border-color:#007aff; box-shadow:0 0 0 2px rgba(0,122,255,.15); }
.placeholder { color:#888; }
.clear { position:absolute; right:1.3rem; top:50%; transform:translateY(-50%); font-size:13px; line-height:1; background:rgba(0,0,0,.05); width:18px; height:18px; border-radius:50%; display:flex; align-items:center; justify-content:center; cursor:pointer; color:#555; }
.clear:hover { background:rgba(0,0,0,.1); }
.chevron { position:absolute; right:6px; top:50%; transform:translateY(-50%); font-size:12px; color:#666; pointer-events:none; transition:transform .2s; }
.open .chevron { transform:translateY(-50%) rotate(180deg); }
.disabled .display { background:#f3f4f6; cursor:not-allowed; color:#999; }
.dropdown { position:absolute; z-index:40; top:100%; left:0; right:0; margin-top:4px; background:#fff; border:1px solid #e5e7eb; border-radius:10px; box-shadow:0 6px 18px -2px rgba(0,0,0,.12); overflow:hidden; }
.search { width:100%; padding:0.45rem 0.6rem; border:none; border-bottom:1px solid #e5e7eb; font-size:0.75rem; outline:none; }
.list { list-style:none; margin:0; padding:4px; max-height: var(--max-h); overflow:auto; }
.inline-filter-select { --max-h:260px; }
.item { padding:6px 8px; border-radius:6px; cursor:pointer; font-size:0.75rem; letter-spacing:.2px; color:#333; display:flex; align-items:center; justify-content:space-between; gap:6px; }
.item.selected { font-weight:600; }
.item:hover, .item.active { background:#f0f7ff; }
.item.empty { cursor:default; color:#888; font-style:italic; }
.check { font-size:0.75rem; color:#007aff; }
.multiple .display { min-height:34px; }
.tags { display:flex; flex-wrap:wrap; gap:4px; }
.tag { background:#eef5ff; color:#145da6; padding:2px 6px; border-radius:6px; font-size:0.65rem; line-height:1.1; max-width:120px; white-space:nowrap; text-overflow:ellipsis; overflow:hidden; }
.tag.extra { background:#dbe9ff; color:#0b5394; }
.toolbar { display:flex; gap:4px; padding:4px; border-bottom:1px solid #e5e7eb; background:#fafcff; }
.tb-btn { background:#fff; border:1px solid #d1d5db; border-radius:6px; padding:2px 8px; font-size:0.65rem; cursor:pointer; transition:background .15s; }
.tb-btn:hover { background:#f0f7ff; }
</style>
