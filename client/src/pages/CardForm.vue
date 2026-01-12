<template>
  <div class="form-container">
    <h2>{{ isEdit ? '编辑卡片' : '新增卡片' }}</h2>
    <form @submit.prevent="onSubmit" class="card-form">
      <div class="field">
        <label for="number">卡号</label>
        <input
          id="number"
          v-model="cardNumber"
          @input="onCardNumberInput"
          @blur="checkCardNumber"
            type="text"
          inputmode="numeric"
          pattern="[0-9 ]+"
          :title="isTUnion ? '交通联合固定19位数字 (31 开头)' : '仅数字与空格，自动分组显示'"
          maxlength="80"
          placeholder="输入卡号 (自动每4位分组)"
          required
        />
      </div>
      <div class="field">
        <label for="cvv">CVV</label>
        <input id="cvv" v-model="cvv" type="text" inputmode="numeric" pattern="\d*" maxlength="4" required :disabled="isECNY" />
        <small v-if="cvv==='000'" style="color:#888;font-size:11px;">该卡不支持网上支付 (CVV=000)</small>
      </div>
      <div class="field">
        <label for="expiration">到期日期 (MM/YY)</label>
        <input
          id="expiration"
          v-model="expiration"
          @input="onExpirationInput"
          type="text"
          placeholder="MM/YY"
          required
          @blur="checkExpiration"
          :disabled="isTUnion || isECNY"
        />
        <small v-if="isTUnion" style="color:#555;font-size:11px;">交通联合卡固定为 12/99</small>
        <small v-else-if="isECNY" style="color:#555;font-size:11px;">数字人民币钱包固定为 12/99</small>
      </div>
      <div class="field">
        <label for="bank">发卡行</label>
        <BankSelect v-model="bank" :options="bankOptions" placeholder="选择或输入银行名称" :disabled="isTUnion" />
        <small class="hint" v-if="!isTUnion">支持模糊搜索；回车可创建新银行。</small>
        <small v-else style="color:#555;font-size:11px;">交通联合卡银行固定为 CHINA T-UNION</small>
        <small v-if="!bankOptions.length && !isTUnion" style="color:#d32f2f;font-size:11px;">还没有加载到银行列表，稍候或刷新页面。</small>
      </div>
      <div class="field">
        <label for="cardType">卡片类型</label>
        <BankSelect
          v-model="cardTypeText"
          :options="cardTypeOptions"
          :placeholder="cardTypePlaceholder"
          :disabled="isTUnion"
          :readonly="true"
          :allow-create="false"
          :allow-clear="false"
        />
      </div>
      <div class="field">
        <label for="note">备注</label>
        <textarea id="note" v-model="note" rows="3" placeholder="可选：例如用途、限额、渠道限制等 (最多1000字)" maxlength="1000" />
      </div>
      <div class="field">
        <label for="cardholder">持卡人</label>
        <input id="cardholder" v-model="cardholder" type="text" placeholder="持卡人姓名（可选，仅详情可见）" />
      </div>
      <div class="actions">
        <button type="submit" class="primary-button">{{ isEdit ? '更新' : '添加' }}</button>
        <router-link to="/cards" class="secondary-button">取消</router-link>
      </div>
      <p v-if="error" class="error">{{ error }}</p>
      <p v-if="warning" class="warn">{{ warning }}</p>
    </form>
    <TwoFactorPrompt
      :show="showPrompt"
      :title="promptTitle"
      @confirm="handlePromptConfirm"
      @cancel="handlePromptCancel"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useCardsStore } from '@/stores/cards';
import TwoFactorPrompt from '@/components/TwoFactorPrompt.vue';
import BankSelect from '@/components/BankSelect.vue';

const cardsStore = useCardsStore();
const router = useRouter();
const route = useRoute();

const cardId = route.params.id;
const isEdit = computed(() => !!cardId);

const cardNumber = ref('');
const cvv = ref('');
const expiration = ref('');
const bank = ref('');
const cardType = ref('');
const cardTypeText = ref('');
const note = ref('');
const cardholder = ref('');
const error = ref('');
const warning = ref(''); // 黄色提示（非阻断）

const isTUnion = computed(()=>/^31\d{17}$/.test(cardNumber.value.replace(/\s+/g,'')));
const isECNY = computed(()=>/^0\d{15}$/.test(cardNumber.value.replace(/\s+/g,'')));

const cardTypeOptions = computed(() => {
  if (isTUnion.value) return ['公交卡'];
  if (isECNY.value) return ['一类钱包', '二类钱包', '三类钱包', '四类钱包'];
  return ['信用卡', '借记卡', '预付卡'];
});

const cardTypePlaceholder = computed(() => {
  if (isTUnion.value) return '公交卡（自动）';
  if (isECNY.value) return '选择账户类型';
  return '选择卡片类型';
});

function cardTypeToText(v) {
  if (v === 'credit') return '信用卡';
  if (v === 'debit') return '借记卡';
  if (v === 'prepaid') return '预付卡';
  if (v === 'transit') return '公交卡';
  if (v === 'ecny_wallet_1') return '一类钱包';
  if (v === 'ecny_wallet_2') return '二类钱包';
  if (v === 'ecny_wallet_3') return '三类钱包';
  if (v === 'ecny_wallet_4') return '四类钱包';
  return '';
}

function textToCardType(v) {
  const s = String(v || '').trim();
  if (!s) return null;
  if (s === '信用卡') return 'credit';
  if (s === '借记卡') return 'debit';
  if (s === '预付卡') return 'prepaid';
  if (s === '公交卡') return 'transit';
  if (s === '一类钱包') return 'ecny_wallet_1';
  if (s === '二类钱包') return 'ecny_wallet_2';
  if (s === '三类钱包') return 'ecny_wallet_3';
  if (s === '四类钱包') return 'ecny_wallet_4';
  return null;
}

watch(cardTypeText, (v) => {
  const t = textToCardType(v);
  if (t) cardType.value = t;
});

watch(cardType, (v) => {
  const txt = cardTypeToText(v);
  if (cardTypeText.value !== txt) cardTypeText.value = txt;
});

const showPrompt = ref(false);
const promptTitle = ref('');
const pendingAction = ref(null);

const bankOptions = computed(() => {
  const set = new Set();
  cardsStore.cards.forEach(c => { if (c.bank) set.add(c.bank); });
  return Array.from(set).sort();
});

onMounted(async () => {
  // 方案A：无条件刷新，确保银行选项最新（避免直接进 /cards/new 时列表未先加载）
  try { await cardsStore.fetchCards(); } catch (e) { /* 忽略 */ }
  if (isEdit.value) {
    promptTitle.value = '输入验证码以加载卡片';
    pendingAction.value = 'load';
    showPrompt.value = true;
  }
});

watch(isTUnion, (v)=>{
  if(v){
    expiration.value='12/99';
    bank.value='CHINA T-UNION';
    cardType.value = 'transit';
    cardTypeText.value = '公交卡';
  }
});
watch(isECNY,(v, prev)=>{
  if(v){
    expiration.value='12/99';
    cvv.value='000';
    // eCNY 账户类型必须选择：从非 eCNY 切入时清空
    if(!prev){
      cardType.value = '';
      cardTypeText.value = '';
    }
  } else {
    // 从 eCNY 切回普通卡：清空，要求重新选择
    if(prev){
      cardType.value = '';
      cardTypeText.value = '';
    }
  }
});

async function handlePromptConfirm(code) {
  showPrompt.value = false;
  if (pendingAction.value === 'load') {
    const res = await cardsStore.fetchCardDetails(cardId, code);
    if (res.ok) {
      const data = res.data;
      cardNumber.value = formatCardNumberRaw(data.number || '');
      expiration.value = normalizeExpiration(data.expiration || '');
      cvv.value = data.cvv;
      bank.value = data.bank;
      cardType.value = data.card_type || data.cardType || '';
      cardTypeText.value = cardTypeToText(cardType.value);
        note.value = data.note || '';
        cardholder.value = data.cardholder || '';
    } else {
      error.value = res.message;
    }
  } else if (pendingAction.value === 'update') {
    const expNorm = normalizeExpiration(expiration.value);
    const res = await cardsStore.updateCard(
      cardId,
      { cardNumber: cardNumber.value, cvv: cvv.value, expiration: expNorm, bank: bank.value, cardType: cardType.value, note: note.value, cardholder: cardholder.value },
      code
    );
    if (res.ok) {
      router.push('/cards');
    } else {
      error.value = res.message;
    }
  }
  pendingAction.value = null;
}

function handlePromptCancel() {
  showPrompt.value = false;
  pendingAction.value = null;
  if (isEdit.value) router.push('/cards');
}

// Luhn 校验函数
function luhnCheck(num) {
  const digits = num.replace(/\D/g, '');
  if (digits.length < 12) return false; // 最少长度控制
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits.charAt(i), 10);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

// 统一网络匹配表（按优先级）
const networkPatterns = [
  { name:'tunion', regex:/^31\d{17}$/ },
  { name:'ecny', regex:/^0\d{15}$/ },
  { name:'mir', regex:/^220[0-4]\d{12}$/ },
  { name:'amex', regex:/^3[47]\d{13}$/ },
  { name:'diners', regex:/^(?:30[0-5]\d{11}|3095\d{10}|36\d{12}|3[89]\d{12})$/ },
  { name:'jcb', regex:/^(?:35(?:2[89]|[3-8]\d))\d{12}$/ },
  { name:'unionpay', regex:/^62\d{14,17}$/ },
  { name:'discover', regex:/^(?:6011\d{12}|65\d{14}|64[4-9]\d{13}|622(?:12[6-9]|1[3-9]\d|[2-8]\d{2}|9(?:0\d|1\d|2[0-5]))\d{10,13})$/ },
  { name:'mastercard', regex:/^(?:5[1-5]\d{14}|2(2[2-9]\d{12}|[3-6]\d{13}|7[01]\d{12}|720\d{12}))$/ },
  { name:'maestro', regex:/^(?:50\d{10,17}|5[6-9]\d{10,17}|6\d{11,18})$/ },
  { name:'visa', regex:/^4\d{12}(?:\d{3}){0,2}$/ },
];

function detectNetwork(num){
  const cleaned = (num||'').replace(/\D/g,'');
  if(!cleaned) return 'unknown';
  for(const p of networkPatterns){
    if(p.regex.test(cleaned)) return p.name;
  }
  return 'unknown';
}

// 重写卡号校验：
function validateCardNumber(value){
  if(!value) return { ok:false, reason:'empty' };
  const digits = value.replace(/\D/g,'');
  if(!digits) return { ok:false, reason:'format' };
  if(!/^\d+$/.test(digits)) return { ok:false, reason:'format' };
  const net = detectNetwork(digits);
  if(net==='tunion') return { ok:true, tunion:true };
  if(net==='ecny') return { ok:true, ecny:true };
  if(net==='unknown') return { ok:true, unknown:true };
  if(digits.length < 12 || digits.length > 19) return { ok:false, reason:'length', network: net };
  if(!luhnCheck(digits)) return { ok:false, reason:'luhn', network: net };
  return { ok:true, network: net };
}

// 修改到期日期校验：过期返回 ok 但标记 expired
function validateExpiration(value) {
  if (isTUnion.value) return { ok: true, expired: false };
  if (isECNY.value) return { ok: true, expired: false };
  if (!value) return { ok: false, reason: 'format' };
  const m = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec(value);
  if (!m) return { ok: false, reason: 'format' };
  const month = parseInt(m[1], 10);
  const yearTwo = parseInt(m[2], 10);
  const fullYear = 2000 + yearTwo;
  const now = new Date();
  const expDate = new Date(fullYear, month, 0, 23, 59, 59, 999);
  if (fullYear > now.getFullYear() + 20) return { ok: false, reason: 'future' };
  if (expDate < now) return { ok: true, expired: true };
  return { ok: true, expired: false };
}

function checkCardNumber() {
  const r = validateCardNumber(cardNumber.value);
  if(!r.ok){
    if(r.reason==='empty') error.value='请输入卡号';
    else if(r.reason==='format') error.value='卡号需为数字';
    else if(r.reason==='length') error.value='已知组织卡号需 12-19 位数字';
    else if(r.reason==='luhn') error.value='卡号未通过校验 (Luhn)';
  } else if(error.value.startsWith('卡号') || error.value.startsWith('已知组织')) {
    error.value='';
  }
}

function checkExpiration() {
  if (!expiration.value) return;
  const r = validateExpiration(expiration.value);
  if (!r.ok) {
    if (r.reason === 'format') error.value = '到期日期格式不正确 (需 MM/YY)';
    else if (r.reason === 'future') error.value = '到期年份过远 (超过 20 年)';
    warning.value = '';
  } else {
    if (r.expired) {
      warning.value = '提示：该卡已过期';
    } else {
      warning.value = '';
    }
    if (error.value.startsWith('到期日期') || error.value.startsWith('到期年份')) error.value = '';
  }
}

function isValidCvv(value){
  // 000 特殊含义允许；否则 3-4 位数字且不能全 0
  if(value === '000') return true;
  return /^[0-9]{3,4}$/.test(value) && !/^0+$/.test(value);
}

// 覆盖原 onSubmit 中 CVV 校验
async function onSubmit(){
  error.value=''; warning.value='';
  expiration.value = normalizeExpiration(expiration.value);

  // 卡片类型：默认空，必须选择；T-Union 自动；eCNY 必选钱包等级
  if (isTUnion.value) {
    cardType.value = 'transit';
    cardTypeText.value = '公交卡';
  } else {
    const typeParsed = textToCardType(cardTypeText.value) || cardType.value;
    if (!typeParsed) { error.value = '卡片类型必填'; return; }
    cardType.value = typeParsed;
  }

  if (isECNY.value) {
    if (!['ecny_wallet_1','ecny_wallet_2','ecny_wallet_3','ecny_wallet_4'].includes(cardType.value)) {
      error.value = 'eCNY 账户类型必选';
      return;
    }
  } else if (!isTUnion.value) {
    if (!['credit','debit','prepaid'].includes(cardType.value)) {
      error.value = '卡片类型不正确';
      return;
    }
  }

  const r = validateCardNumber(cardNumber.value);
  if(!r.ok){
    if(r.reason==='empty') error.value='请输入卡号';
    else if(r.reason==='format') error.value='卡号需为数字';
    else if(r.reason==='length') error.value='已知组织卡号需 12-19 位数字';
    else if(r.reason==='luhn') error.value='卡号未通过校验 (Luhn)';
    return;
  }
  if(r.tunion){ bank.value='CHINA T-UNION'; expiration.value='12/99'; }
  if(r.ecny){ expiration.value='12/99'; cvv.value='000'; }
  if(!isValidCvv(cvv.value)) { error.value='CVV 格式不正确'; return; }
  if(!r.tunion && !r.ecny){
    const expR = validateExpiration(expiration.value);
    if(!expR.ok){
      if(expR.reason==='format') error.value='到期日期格式不正确 (需 MM/YY)';
      else if(expR.reason==='future') error.value='到期年份过远 (超过 20 年)';
      return;
    }
    if(expR.expired) warning.value='提示：该卡已过期';
  }
  if(isEdit.value){
    promptTitle.value='输入验证码以更新卡片'; pendingAction.value='update'; showPrompt.value=true;
  } else {
    const expNorm = normalizeExpiration(expiration.value);
    const res = await cardsStore.addCard({ cardNumber: cardNumber.value, cvv: cvv.value, expiration: expNorm, bank: bank.value, cardType: cardType.value, note: note.value, cardholder: cardholder.value });
    if(res.ok) router.push('/cards'); else error.value=res.message;
  }
}

function formatCardNumberRaw(raw) {
  const digits = raw.replace(/\D/g, '').slice(0, 80); // 允许更长
  const parts = [];
  for (let i = 0; i < digits.length; i += 4) parts.push(digits.slice(i, i + 4));
  return parts.join(' ');
}
function onCardNumberInput(e) {
  cardNumber.value = formatCardNumberRaw(e.target.value);
  // 若有卡号相关错误且当前已通过基本格式校验则清除
  const r = validateCardNumber(cardNumber.value);
  if (r.ok && error.value.startsWith('卡号')) error.value = '';
}
function onExpirationInput(e) {
  let digits = e.target.value.replace(/\D/g, '').slice(0, 4);
  // 自动限制月份第一位不能超过1
  if (digits.length === 1 && parseInt(digits, 10) > 1) digits = '0' + digits; // 比如输入 3 -> 03
  if (digits.length >= 2) {
    let mm = digits.slice(0, 2);
    let first = mm[0];
    let second = mm[1];
    if (first === '0' && second === '0') mm = '01';
    if (first === '1' && parseInt(second, 10) > 2) mm = '12';
    if (digits.length > 2) {
      const yy = digits.slice(2);
      expiration.value = mm + '/' + yy;
    } else {
      expiration.value = mm; // 只显示月份，未出现 /
    }
  } else {
    expiration.value = digits; // 只有1位
  }
}

function normalizeExpiration(raw) {
  if (!raw) return '';
  let digits = String(raw).replace(/\D/g, '').slice(0, 4);
  if (digits.length < 4) return digits; // 不完整时保持原样，便于继续输入
  let mm = digits.slice(0, 2);
  const yy = digits.slice(2);
  if (mm.length === 1) mm = '0' + mm;
  return mm + '/' + yy;
}
</script>

<style scoped>
.form-container {
  max-width: 500px;
  margin: 2rem auto;
  background: #ffffff;
  padding: 2rem;
  border-radius: 12px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.04);
}
.card-form {
  display: flex;
  flex-direction: column;
}
.field {
  margin-bottom: 1rem;
  display: flex;
  flex-direction: column;
}
label {
  margin-bottom: 0.25rem;
  font-size: 0.875rem;
}
input {
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 1rem;
  transition: border-color 0.2s;
}
input:focus {
  outline: none;
  border-color: #007aff;
}
textarea { padding:0.5rem; border:1px solid #d1d5db; border-radius:8px; font-size:0.95rem; resize: vertical; min-height:80px; }
.actions {
  margin-top: 1rem;
  display: flex;
  gap: 0.5rem;
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
  color: white;
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
.error {
  margin-top: 0.5rem;
  color: #d32f2f;
  font-size: 0.875rem;
}
.warn {
  margin-top: 0.5rem;
  color: #b58900;
  font-size: 0.75rem;
}
.bank-input-wrapper { position: relative; }
.bank-input { width:100%; }
.hint { display:block; margin-top:4px; font-size:11px; color:#6b7280; }
/* datalist 下拉在不同浏览器原生差异较大，主要统一输入框样式 */
</style>