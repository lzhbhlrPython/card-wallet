<template>
  <div class="card-list-container">
    <div class="header">
      <h2>我的卡片</h2>
      <div class="header-actions">
        <button class="primary-button" @click="refreshCards" :disabled="loading || refreshing">
          {{ refreshing ? '刷新中...' : '刷新' }}
        </button>
        <router-link to="/cards/new" class="primary-button">新增卡片</router-link>
      </div>
    </div>
    <div class="filters enhanced">
      <div class="filter-group">
        <label class="filter-label">清算组织</label>
        <!-- 使用通用内联筛选组件 -->
        <InlineFilterSelect
          v-model="networkFilter"
          :options="allNetworksForOptions"
            placeholder="组织"
          :multiple="true"
        />
      </div>
      <div class="filter-group">
        <label class="filter-label">类型</label>
        <InlineFilterSelect
          v-model="cardTypeFilter"
          :options="allCardTypesForOptions"
          placeholder="类型"
          :multiple="true"
        />
      </div>
      <div class="filter-group">
        <label class="filter-label">银行</label>
        <InlineFilterSelect
          v-model="bankFilter"
          :options="allBanksForOptions"
          placeholder="银行"
          :multiple="true"
        />
      </div>
      
      <!-- 新增排序单选框 -->
      <div class="filter-group sort-group">
        <span class="filter-label">排序</span>
        <div class="sort-radios">
          <div class="sort-radio">
            <input type="radio" id="sort-default" value="default" v-model="sortOption" />
            <label for="sort-default">默认</label>
          </div>
          <div class="sort-radio">
            <input type="radio" id="sort-network" value="network" v-model="sortOption" />
            <label for="sort-network">按组织</label>
          </div>
            <div class="sort-radio">
            <input type="radio" id="sort-bank" value="bank" v-model="sortOption" />
            <label for="sort-bank">按银行</label>
          </div>
          <div class="sort-radio">
            <input type="radio" id="sort-type" value="type" v-model="sortOption" />
            <label for="sort-type">按类型</label>
          </div>
          
        </div>
      </div>
    </div>
    <div v-if="loading" class="loading">加载中...</div>
    <div v-else>
      <div v-if="sortedCards.length === 0" class="empty">暂无卡片。</div>
      <div v-else class="cards-grid">
        <CardItem
          v-for="card in sortedCards"
          :key="card.id"
          :card="card"
          @view="viewDetails"
          @edit="goEdit"
          @delete="confirmDelete"
        />
      </div>
    </div>
    <!-- 输入 TOTP（用于查看详情 / 删除） -->
    <TwoFactorPrompt
      :show="showPrompt"
      :title="promptTitle"
      @confirm="handlePromptConfirm"
      @cancel="handlePromptCancel"
    />
    <!-- 详情弹窗 -->
    <div v-if="details" class="overlay">
      <div class="modal" :style="modalStyle(details)">
        <div class="modal-inner">
          <h3>卡片详情</h3>
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
          
            <div>
              <div style="font-weight:600">{{ details.bank }}</div>
              <div style="font-size:12px;color:#666">{{ details.network }} • {{ formatCardType(details.card_type || details.cardType) }}</div>
            </div>
          </div>
          <p class="copy-line">
            <strong>卡号：</strong>
            <span class="mono">{{ formatCardNumber(details.number) }}</span>
            <button class="mini-btn" @click="copy(details.number, '卡号')">复制</button>
          </p>
          <p class="copy-line">
            <strong>持卡人：</strong>
            <span class="mono">{{ details.cardholder || '—' }}</span>
            <button class="mini-btn" v-if="details.cardholder" @click="copy(details.cardholder, '持卡人')">复制</button>
          </p>
          <p class="copy-line">
            <strong>CVV：</strong>
            <span class="mono">{{ details.cvv === '000' ? 'null' : details.cvv }}</span>
            <button class="mini-btn" @click="copy(details.cvv, 'CVV')">复制</button>
          </p>
          <p class="copy-line">
            <strong>有效期：</strong>
            <span class="mono">{{ formatExpiration(details.expiration) }}</span>
            <button class="mini-btn" @click="copy(details.expiration, '有效期')">复制</button>
          </p>
          <p class="copy-line" v-if="details && details.note">
            <strong>备注：</strong>
            <span class="mono" style="white-space:pre-wrap; letter-spacing:0;">{{ details.note }}</span>
          </p>
          <div class="actions">
            <button class="primary-button" @click="details = null">关闭</button>
          </div>
          <div v-if="copyMessage" class="copy-toast">{{ copyMessage }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { useCardsStore } from '@/stores/cards';
import TwoFactorPrompt from '@/components/TwoFactorPrompt.vue';
import InlineFilterSelect from '@/components/InlineFilterSelect.vue';
import CardItem from '@/components/CardItem.vue';
import { useRouter } from 'vue-router';

const router = useRouter();

const cardsStore = useCardsStore();

const loading = ref(true); // 加载状态
const cards = ref([]); // 卡片列表
const showPrompt = ref(false); // 是否显示二次验证弹窗
const promptTitle = ref(''); // 弹窗标题
const pendingAction = ref(null); // 待执行动作 view | delete
const pendingCardId = ref(null); // 待操作的卡片 ID
const details = ref(null); // 当前查看的卡片详情
const refreshing = ref(false); // 恢复刷新状态变量
// 允许多选：数组
const networkFilter = ref([]);
const cardTypeFilter = ref([]);
const bankFilter = ref([]);
 
// 新增排序选项：default | network | bank
const sortOption = ref('default');

// 预先收集全部去重集合
const allNetworks = computed(() => {
  const set = new Set();
  cards.value.forEach(c => { if (c.network) set.add(c.network); });
  return Array.from(set).sort();
});
const allBanks = computed(() => {
  const set = new Set();
  cards.value.forEach(c => { if (c.bank) set.add(c.bank); });
  return Array.from(set).sort();
});

 

const allCardTypes = computed(() => {
  const set = new Set();
  cards.value.forEach(c => { const t = c.card_type || c.cardType; if (t) set.add(t); });
  return Array.from(set);
});
// 可供组件 options（固定顺序）
const CARD_TYPE_ORDER = ['credit','debit','prepaid','transit','ecny_wallet_1','ecny_wallet_2','ecny_wallet_3','ecny_wallet_4'];
const allNetworksForOptions = computed(()=> allNetworks.value.map(v=>({ value:v, label:v })));
const allBanksForOptions = computed(()=> allBanks.value.map(v=>({ value:v, label:v })));
const allCardTypesForOptions = computed(() => {
  const present = new Set(allCardTypes.value);
  return CARD_TYPE_ORDER.filter(t => present.has(t)).map(t => ({ value: t, label: formatCardType(t) }));
});
 

// 过滤后卡片
const filteredCards = computed(() => {
  return cards.value.filter(c => {
    const netOk = !networkFilter.value.length || networkFilter.value.includes(c.network);
    const typeValue = c.card_type || c.cardType || 'credit';
    const typeOk = !cardTypeFilter.value.length || cardTypeFilter.value.includes(typeValue);
    const bankOk = !bankFilter.value.length || bankFilter.value.includes(c.bank);
    return netOk && typeOk && bankOk;
  });
});
// 基于过滤后的结果再排序
const sortedCards = computed(() => {
  const arr = filteredCards.value.slice();
  if (sortOption.value === 'network') {
    arr.sort((a,b)=> (a.network||'').localeCompare(b.network||'', 'zh-CN'));
  } else if (sortOption.value === 'bank') {
    arr.sort((a,b)=> (a.bank||'').localeCompare(b.bank||'', 'zh-CN'));
  } else if (sortOption.value === 'type') {
    const idx = (t) => CARD_TYPE_ORDER.indexOf(t || 'credit');
    arr.sort((a,b)=> idx(a.card_type || a.cardType) - idx(b.card_type || b.cardType));
  }
  return arr;
});

onMounted(async () => {
  // 优先使用本地缓存，提升感知速度
  cards.value = JSON.parse(localStorage.getItem('cards')) || [];
  await loadCards();
});

// 加载卡片列表
async function loadCards(force = false) {
  loading.value = true;
  if (!force) {
    cards.value = JSON.parse(localStorage.getItem('cards')) || cards.value;
  }
  const result = await cardsStore.fetchCards();
  if (result.ok) {
    cards.value = cardsStore.cards;
    localStorage.setItem('cards', JSON.stringify(cards.value));
  } else if (!cards.value.length) {
    cards.value = JSON.parse(localStorage.getItem('cards')) || [];
  }
  loading.value = false;
}

// 刷新卡片列表
async function refreshCards() {
  refreshing.value = true;
  await loadCards(true);
  refreshing.value = false;
}

// 触发查看详情，需要 2FA
function viewDetails(id) {
  promptTitle.value = '查看卡片详情';
  pendingAction.value = 'view';
  pendingCardId.value = id;
  showPrompt.value = true;
}

// 确认删除卡片，需要 2FA
function confirmDelete(id) {
  promptTitle.value = '删除卡片';
  pendingAction.value = 'delete';
  pendingCardId.value = id;
  showPrompt.value = true;
}

// 处理二次验证确认
async function handlePromptConfirm(code) {
  showPrompt.value = false;
  if (pendingAction.value === 'view') {
    const res = await cardsStore.fetchCardDetails(pendingCardId.value, code);
    if (res.ok) {
      details.value = res.data;
    } else {
      alert(res.message);
    }
  } else if (pendingAction.value === 'delete') {
    const res = await cardsStore.deleteCard(pendingCardId.value, code);
    if (!res.ok) alert(res.message);
  }
  pendingAction.value = null;
  pendingCardId.value = null;
  await loadCards(); // 动作完成后刷新列表
}

// 取消二次验证
function handlePromptCancel() {
  showPrompt.value = false;
  pendingAction.value = null;
  pendingCardId.value = null;
}

// 格式化卡号，每4位加空格
function formatCardNumber(num) {
  if (!num) return '';
  const digits = String(num).replace(/\D/g, '').slice(0, 19);
  const parts = [];
  for (let i = 0; i < digits.length; i += 4) parts.push(digits.slice(i, i + 4));
  return parts.join(' ');
}

// 格式化有效期，补全为 MM/YY 格式
function formatExpiration(exp) {
  if (!exp) return '';
  const digits = String(exp).replace(/\D/g, '').slice(0, 4);
  if (digits.length < 3) return digits; // 不足以加 /
  return digits.slice(0, 2) + '/' + digits.slice(2);
}

function formatCardType(v) {
  if (v === 'credit') return '信用卡';
  if (v === 'debit') return '借记卡';
  if (v === 'prepaid') return '预付卡';
  if (v === 'transit') return '公交卡';
  if (v === 'ecny_wallet_1') return '一类钱包';
  if (v === 'ecny_wallet_2') return '二类钱包';
  if (v === 'ecny_wallet_3') return '三类钱包';
  if (v === 'ecny_wallet_4') return '四类钱包';
  return v || '信用卡';
}

const copyMessage = ref('');
function copy(val, label) {
  if (!val) return;
  navigator.clipboard.writeText(String(val)).then(() => {
    copyMessage.value = label + '已复制';
    clearTimeout(copyMessage._t);
    copyMessage._t = setTimeout(() => (copyMessage.value = ''), 1600);
  }).catch(() => alert('复制失败'));
}

// 生成一个基于卡片信息的渐变背景（用于模态框）
function hashString(s){
  let h = 2166136261 >>> 0;
  for(let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}
function modalStyle(details){
  if(!details) return {};
  const seed = String(details.id || details.last4 || details.number || '') + '|' + (details.bank||'');
  const h = hashString(seed);
  const h1 = (h % 360);
  const h2 = ((h >> 8) % 360);
  const sat = 62; const light1 = 48; const light2 = 64;
  const c1 = `hsl(${h1} ${sat}% ${light1}%)`;
  const c2 = `hsl(${h2} ${sat}% ${light2}%)`;
  return { background: `linear-gradient(135deg, ${c1}, ${c2})`, color: '#08233a', boxShadow: '0 8px 30px rgba(10,30,50,0.25)' };
}

// 移除之前的互相裁剪 watch，避免递归更新；保持简单：用户可以选择任意组合，若组合无交集则结果为空即可。
// 若以后需要自动裁剪，可实现一个带内容比较的 watch，只在集合真正变化时才赋值。

function goEdit(id) { router.push(`/cards/${id}/edit`); }
</script>

<style scoped>
/* 页面整体容器 */
.card-list-container {
  display: flex;
  flex-direction: column;
}
/* 头部区域 */
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}
/* 主按钮 */
.primary-button { /* 统一主按钮视觉与高度 */
  background-color: #007aff;
  color: #fff;
  padding: 0.5rem 1rem;
  min-height: 40px;
  line-height: 1;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background-color .2s;
}
.header-actions .primary-button { padding:0.5rem 1rem; min-height:40px; }
.primary-button:hover { background-color:#0060d3; }
.loading {
  text-align: center;
  margin-top: 2rem;
}
.empty {
  text-align: center;
  margin-top: 2rem;
  color: #666;
}
/* 筛选器 */
.filters {
  margin-bottom: 0.75rem;
  display: flex;
  gap: 1rem;
  align-items: center;
  font-size: 0.85rem;
}
.filters.enhanced {
  display: flex;
  align-items: flex-end;
  gap: 1rem;
  padding: 0.75rem 1rem;
  background: #f8f9fb;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}
.filter-group {
  display: flex;
  flex-direction: column;
  min-width: 160px;
}
.filter-label {
  font-size: 0.7rem;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: #6b7280;
  margin-bottom: 0.25rem;
}
.select-wrapper {
  position: relative;
}
.select-wrapper select {
  appearance: none;
  -webkit-appearance: none;
  padding: 0.4rem 2rem 0.4rem 0.6rem;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #fff;
  font-size: 0.85rem;
  line-height: 1.2;
  transition: border-color .2s, box-shadow .2s;
}
.select-wrapper select:focus {
  outline: none;
  border-color: #007aff;
  box-shadow: 0 0 0 2px rgba(0,122,255,0.15);
}
.refresh-button {
  padding: 0.45rem 0.9rem;
  background: #ffffff;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 0.8rem;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  transition: background-color .2s, border-color .2s;
}
.refresh-button:hover:not(:disabled) {
  background: #f3f4f6;
}
.refresh-button:disabled {
  opacity: .6;
  cursor: not-allowed;
}
/* 卡片网格布局 */
.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 1rem;
}
/* 遮罩层 */
.overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
/* 弹窗 */
.modal {
  background: #ffffff;
  padding: 1.5rem;
  border-radius: 12px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.05);
  width: 90%;
  max-width: 400px;
}
.modal-inner {
  background: linear-gradient(180deg, rgba(255,255,255,0.9), rgba(255,255,255,0.85));
  padding: 1rem;
  border-radius: 10px;
}
.modal h3 {
  margin-top: 0;
  margin-bottom: 0.5rem;
}
.modal p {
  margin: 0.25rem 0;
}
.modal .actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 1rem;
}
.header-actions { display:flex; gap:.5rem; align-items:center; }
.primary-button:disabled { opacity:.6; cursor:not-allowed; }
.mono { font-family:'SF Mono','Menlo',monospace; }
.copy-line { display:flex; align-items:center; gap:.5rem; }
.copy-line strong { min-width:52px; }
.mini-btn { background:#1a88ff; border:1px solid #1474d6; color:#fff; font-size:.65rem; padding:3px 8px; border-radius:5px; cursor:pointer; transition:background .15s; }
.mini-btn:hover { background:#0f75e3; }
.mini-btn:active { background:#0b5fb8; }
.copy-toast { position:absolute; bottom:12px; right:16px; background:rgba(0,0,0,.75); color:#fff; padding:4px 10px; font-size:.65rem; border-radius:12px; animation:fadeIn .2s; }
@keyframes fadeIn { from { opacity:0; transform:translateY(4px);} to { opacity:1; transform:translateY(0);} }
/* 适配新组件尺寸（若需要可覆盖） */
.filters .inline-filter-select { min-width:160px; }
/* 排序单选框样式 */
.sort-group { min-width:200px; }
.sort-radios { display:flex; gap:.4rem; flex-wrap:wrap; }
.sort-radio { position:relative; }
.sort-radio input { position:absolute; opacity:0; pointer-events:none; }
.sort-radio label {
  display:inline-flex;
  align-items:center;
  padding:0.32rem .7rem;
  font-size:.7rem;
  letter-spacing:.5px;
  border:1px solid #d1d5db;
  background:#fff;
  border-radius:20px;
  cursor:pointer;
  user-select:none;
  line-height:1;
  transition:background .2s,border-color .2s,color .2s, box-shadow .2s;
}
.sort-radio input:checked + label {
  background:#007aff;
  color:#fff;
  border-color:#007aff;
  box-shadow:0 0 0 2px rgba(0,122,255,.15);
}
.sort-radio label:hover { border-color:#007aff; }
.sort-radio input:focus-visible + label { outline:2px solid #007aff; outline-offset:2px; }
</style>
