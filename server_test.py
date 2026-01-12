#!/usr/bin/env python3
"""
server_test.py

批量生成多种卡组织测试数据，调用后端 /cards 接口验证服务端工作情况。

支持的卡组织：visa, mastercard, unionpay, mir, amex, ecny, tunion, jcb, discover, diners, maestro

使用示例：
  export TOKEN="<你的JWT>"
  python server_test.py --token $TOKEN --base-url http://localhost:3000
  python server_test.py --token $TOKEN --only visa,mastercard,unionpay --verbose

可选参数：
  --token / -t      JWT (也可用环境变量 TOKEN)
  --base-url / -u   服务端基础 URL (默认 http://localhost:3000)
  --only            仅测试指定逗号分隔列表的网络
  --skip            跳过指定网络
  --dry-run         只打印将发送的数据，不真正请求
  --verbose / -v    打印详细响应
  --list            列出可用网络后退出
  --rounds N        重复执行 N 轮（每轮对选定网络各创建 1 张）
  --fps             启用 FPS 账户轮巡测试（每轮创建 1 条 FPS 账户）
  --fps-banks       自定义 FPS 银行逗号分隔列表，优先于接口 /fps/banks
"""
from __future__ import annotations
import os, sys, json, random, argparse, time
from typing import List, Dict, Callable

try:
    import requests  # type: ignore
except Exception:  # pragma: no cover
    requests = None  # fallback later
    
RANDOM = random.SystemRandom()

SUPPORTED = [
    'visa','mastercard','unionpay','mir','amex','ecny','tunion','jcb','discover','diners','maestro'
]

# FPS 内置备用银行列表（接口获取失败时使用）
FPS_BANK_FALLBACK = [
    'HSBC', 'HANG SENG', 'STANDARD CHARTERED', 'BOC', 'ICBC', 'CCB', 'BANK OF COMMUNICATIONS', 'CITIBANK', 'DBS', 'BANK OF EAST ASIA', 'CHINA CITIC BANK', 'CHONG HING BANK', 'DAH SING BANK', 'FUBON BANK', 'PUBLIC BANK', 'OCBC WING HANG', 'SHANGHAI COMMERCIAL BANK', 'CMB WING LUNG BANK', 'NANYANG COMMERCIAL BANK', 'TAI SANG BANK'
]

# ---- Luhn 校验与生成（与服务端算法严格一致） ----

def luhn_verify(digits: str) -> bool:
    sum_ = 0
    alt = False  # 与服务器相同：从最右侧（含校验位）开始 alt=False
    for ch in reversed(digits):
        n = int(ch)
        if alt:
            n *= 2
            if n > 9:
                n -= 9
        sum_ += n
        alt = not alt
    return sum_ % 10 == 0

def generate_luhn(prefix: str, length: int) -> str:
    """生成指定前缀与长度且通过服务器 Luhn 校验的数字串。"""
    if len(prefix) >= length:
        raise ValueError('prefix length must be less than total length')
    body_len = length - len(prefix) - 1
    body = ''.join(str(RANDOM.randint(0,9)) for _ in range(body_len))
    stem = prefix + body
    # 暴力尝试 0-9 作为校验位，匹配服务端逻辑
    for d in '0123456789':
        candidate = stem + d
        if luhn_verify(candidate):
            return candidate
    raise RuntimeError('Failed to generate Luhn number')

# ---- 各网络卡号生成逻辑 ----

def gen_visa():
    return generate_luhn('4', 16)

def gen_mastercard():
    """Mastercard: 51-55 或 222100–272099 (全部 16 位)。"""
    if RANDOM.random() < 0.5:
        prefix = RANDOM.choice(['51','52','53','54','55'])
        return generate_luhn(prefix, 16)
    bin_num = RANDOM.randint(222100, 272099)
    prefix = f"{bin_num:06d}"  # 确保 6 位
    return generate_luhn(prefix, 16)

def gen_unionpay():
    # 62 开头 16 位
    return generate_luhn('62', 16)

def gen_mir():
    prefix = RANDOM.choice(['2200','2201','2202','2203','2204'])
    return generate_luhn(prefix, 16)

def gen_amex():
    prefix = RANDOM.choice(['34','37'])
    return generate_luhn(prefix, 15)

# eCNY 特例，不做 Luhn；0 + 15 digits

def gen_ecny():
    return '0' + ''.join(str(RANDOM.randint(0,9)) for _ in range(15))

# T-Union: 31 + 17 digits (19位) 特例

def gen_tunion():
    return '31' + ''.join(str(RANDOM.randint(0,9)) for _ in range(17))

# JCB 3528-3589

def gen_jcb():
    first4 = str(RANDOM.randint(3528, 3589))
    return generate_luhn(first4, 16)

# Discover 6011

def gen_discover():
    return generate_luhn('6011', 16)

# Diners Club: 300-305 / 3095 / 36 / 38-39 (14 位)

def gen_diners():
    prefix = RANDOM.choice(['300','301','302','303','304','305','3095','36','38','39'])
    return generate_luhn(prefix, 14)

# Maestro: 50 / 56-58 / 6X -> 16 位

def gen_maestro():
    prefix = RANDOM.choice(['50','56','57','58','67'])
    return generate_luhn(prefix, 16)

GEN_MAP: Dict[str, Callable[[], str]] = {
    'visa': gen_visa,
    'mastercard': gen_mastercard,
    'unionpay': gen_unionpay,
    'mir': gen_mir,
    'amex': gen_amex,
    'ecny': gen_ecny,
    'tunion': gen_tunion,
    'jcb': gen_jcb,
    'discover': gen_discover,
    'diners': gen_diners,
    'maestro': gen_maestro,
}
# 还原默认卡片测试辅助函数

def random_cvv(length=3):
    return ''.join(str(RANDOM.randint(0,9)) for _ in range(length))

def random_expiration():
    mm = RANDOM.randint(1,12)
    yy = RANDOM.randint(27,35)
    return f"{mm:02d}/{yy}"

def build_payload(network: str):
    number = GEN_MAP[network]()
    if network == 'amex':
        cvv = random_cvv(4)
    elif network == 'ecny':
        cvv = '000'
    else:
        cvv = random_cvv(3)
    exp = '12/99' if network in ('tunion','ecny') else random_expiration()
    bank = '' if network in ('tunion',) else f"Test Bank {network.upper()}"
    note = f"Auto test {network}"
    # cardType: must be English enum value
    if network == 'tunion':
        card_type = 'transit'
    elif network == 'ecny':
        card_type = RANDOM.choice(['ecny_wallet_1','ecny_wallet_2','ecny_wallet_3','ecny_wallet_4'])
    else:
        card_type = RANDOM.choice(['credit','debit','prepaid'])
    # 随机 cardholder（用于测试新字段）
    names = ['ZHANG SAN','LI SI','WANG WU','TEST USER','ALICE','BOB','CHARLIE','DAVID']
    return {
        'cardNumber': number,
        'cvv': cvv,
        'expiration': exp,
        'bank': bank,
        'cardType': card_type,
        'note': note,
        'cardholder': RANDOM.choice(names)
    }

def post_card(session, base_url: str, token: str, payload: dict, verbose=False):
    url = base_url.rstrip('/') + '/cards'
    headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}
    if requests:
        r = session.post(url, headers=headers, json=payload, timeout=10)
        ok = r.status_code == 200
        try:
            data = r.json()
        except Exception:
            data = {'raw': r.text}
        if verbose or not ok:
            print(f"[{payload['note']}] status={r.status_code} resp={data}")
        return ok, data
    else:  # urllib 回退
        import urllib.request, urllib.error
        req = urllib.request.Request(url, method='POST', headers=headers, data=json.dumps(payload).encode())
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                body = resp.read().decode()
                try:
                    data = json.loads(body)
                except Exception:
                    data = {'raw': body}
                ok = resp.status == 200
                if verbose or not ok:
                    print(f"[{payload['note']}] status={resp.status} resp={data}")
                return ok, data
        except urllib.error.HTTPError as e:
            body = e.read().decode()
            print(f"[{payload['note']}] ERROR status={e.code} body={body}")
            return False, {'error': body}
        except Exception as e:
            print(f"[{payload['note']}] ERROR {e}")
            return False, {'error': str(e)}

def fetch_cards(session, base_url: str, token: str):
    url = base_url.rstrip('/') + '/cards'
    headers = {'Authorization': f'Bearer {token}'}
    if requests:
        r = session.get(url, headers=headers, timeout=10)
        try:
            return r.status_code, r.json()
        except Exception:
            return r.status_code, r.text
    else:
        import urllib.request, urllib.error
        req = urllib.request.Request(url, method='GET', headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                body = resp.read().decode()
                try:
                    return resp.status, json.loads(body)
                except Exception:
                    return resp.status, body
        except urllib.error.HTTPError as e:
            return e.code, e.read().decode()
        except Exception as e:
            return 0, str(e)
# ---------------- FPS 测试辅助 ----------------

def random_fps_id():
    length = RANDOM.randint(8,12)
    return ''.join(str(RANDOM.randint(0,9)) for _ in range(length))

def build_fps_payload(bank: str):
    return {
        'fpsId': random_fps_id(),
        'recipient': 'TEST USER',
        'bank': bank,
        'note': f'Auto test FPS {bank}'
    }

def fetch_fps_banks(session, base_url: str, token: str, override: str|None, verbose=False):
    if override:
        banks = [b.strip() for b in override.split(',') if b.strip()]
        if banks:
            return banks
    url = base_url.rstrip('/') + '/fps/banks'
    headers = {'Authorization': f'Bearer {token}'}
    if requests:
        try:
            r = session.get(url, headers=headers, timeout=10)
            if r.status_code == 200 and isinstance(r.json(), list) and r.json():
                return r.json()
        except Exception as e:
            if verbose:
                print('获取 /fps/banks 失败，使用内置列表: ', e)
    else:
        import urllib.request, urllib.error
        req = urllib.request.Request(url, method='GET', headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                body = resp.read().decode()
                data = json.loads(body)
                if isinstance(data, list) and data:
                    return data
        except Exception as e:
            if verbose:
                print('获取 /fps/banks 失败，使用内置列表: ', e)
    return FPS_BANK_FALLBACK[:]

def post_fps(session, base_url: str, token: str, payload: dict, verbose=False):
    url = base_url.rstrip('/') + '/fps'
    headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}
    if requests:
        r = session.post(url, headers=headers, json=payload, timeout=10)
        ok = r.status_code == 200
        try:
            data = r.json()
        except Exception:
            data = {'raw': r.text}
        if verbose or not ok:
            print(f"[FPS {payload['fpsId']}] status={r.status_code} resp={data}")
        return ok, data
    else:
        import urllib.request, urllib.error
        req = urllib.request.Request(url, method='POST', headers=headers, data=json.dumps(payload).encode())
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                body = resp.read().decode()
                try:
                    data = json.loads(body)
                except Exception:
                    data = {'raw': body}
                ok = resp.status == 200
                if verbose or not ok:
                    print(f"[FPS {payload['fpsId']}] status={resp.status} resp={data}")
                return ok, data
        except urllib.error.HTTPError as e:
            body = e.read().decode()
            print(f"[FPS {payload['fpsId']}] ERROR status={e.code} body={body}")
            return False, {'error': body}
        except Exception as e:
            print(f"[FPS {payload['fpsId']}] ERROR {e}")
            return False, {'error': str(e)}

def fetch_fps(session, base_url: str, token: str):
    url = base_url.rstrip('/') + '/fps'
    headers = {'Authorization': f'Bearer {token}'}
    if requests:
        try:
            r = session.get(url, headers=headers, timeout=10)
            return r.status_code, r.json()
        except Exception as e:
            return 0, {'error': str(e)}
    else:
        import urllib.request, urllib.error
        req = urllib.request.Request(url, method='GET', headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                body = resp.read().decode()
                try:
                    return resp.status, json.loads(body)
                except Exception:
                    return resp.status, body
        except urllib.error.HTTPError as e:
            return e.code, e.read().decode()
        except Exception as e:
            return 0, str(e)

def parse_args():
    p = argparse.ArgumentParser(description='批量测试 /cards 创建接口')
    p.add_argument('--token','-t', help='JWT (可用环境变量 TOKEN)')
    p.add_argument('--base-url','-u', default='http://localhost:3000')
    p.add_argument('--only', help='仅测试这些网络 (逗号分隔)')
    p.add_argument('--skip', help='跳过这些网络 (逗号分隔)')
    p.add_argument('--dry-run', action='store_true')
    p.add_argument('--verbose','-v', action='store_true')
    p.add_argument('--list', action='store_true', help='列出支持网络后退出')
    p.add_argument('--rounds', type=int, default=1, help='重复轮数')
    p.add_argument('--fps', action='store_true', help='启用 FPS 账户轮巡测试')
    p.add_argument('--fps-banks', help='自定义 FPS 银行列表 (逗号分隔)')
    return p.parse_args()

def main():
    args = parse_args()
    if args.list:
        print('支持网络:', ', '.join(SUPPORTED))
        return 0
    token = args.token or os.getenv('TOKEN')
    if not token:
        print('错误: 需要 --token 或环境变量 TOKEN')
        return 1
    only = [s.strip().lower() for s in args.only.split(',')] if args.only else SUPPORTED
    skip = set(s.strip().lower() for s in args.skip.split(',')) if args.skip else set()
    targets = [n for n in only if n in SUPPORTED and n not in skip]
    if not targets:
        print('没有需要测试的网络 (检查 --only / --skip)')
        return 0
    if requests:
        session = requests.Session()
    else:
        class Dummy: pass
        session = Dummy()
    print(f"开始测试：{targets}，轮数={args.rounds}")
    results = []
    fps_results = []
    if args.fps:
        banks = fetch_fps_banks(session, args.base_url, token, args.fps_banks, verbose=args.verbose)
        if not banks:
            print('FPS 银行列表为空，跳过 FPS 测试')
        else:
            print(f"FPS 测试启用，将为每轮每个银行各创建 1 条，共 {len(banks)} 条/轮")
    for r in range(1, args.rounds+1):
        print(f"\n== 第 {r} 轮 ==")
        for net in targets:
            payload = build_payload(net)
            if args.dry_run:
                print('[DRY]', net, payload)
                continue
            ok, data = post_card(session, args.base_url, token, payload, verbose=args.verbose)
            results.append((net, ok, data))
            time.sleep(0.05)  # 减少突发
        if args.fps and banks:
            for bank in banks:
                fps_payload = build_fps_payload(bank)
                if args.dry_run:
                    print('[DRY][FPS]', fps_payload)
                else:
                    ok, data = post_fps(session, args.base_url, token, fps_payload, verbose=args.verbose)
                    fps_results.append((fps_payload['fpsId'], ok, data, bank))
                    time.sleep(0.02)
    if not args.dry_run:
        status, cards = fetch_cards(session, args.base_url, token)
        print('\n当前 /cards 列表 (status={}):'.format(status))
        if isinstance(cards, list):
            # 仅显示最后一轮创建的数量
            slice_len = len(targets)
            print(f"显示最近 {slice_len} 条：")
            for c in cards[-slice_len:]:
                print(' -', c)
        else:
            print(cards)
    if not args.dry_run and args.fps:
        status_fps, fps_list = fetch_fps(session, args.base_url, token)
        print(f"\n当前 /fps 列表 (status={status_fps}):")
        if isinstance(fps_list, list):
            show = min(len(fps_list), len(fps_results)) or len(fps_list)
            print(f"显示最近 {show} 条：")
            for item in fps_list[-show:]:
                print(' -', item)
        else:
            print(fps_list)
    # 汇总
    success = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print(f"\n完成：成功 {success}/{total}")
    if success != total:
        for net, ok, data in results:
            if not ok:
                print(f"失败 {net}: {data}")
    if args.fps:
        fps_success = sum(1 for _, ok, _, _ in fps_results if ok)
        fps_total = len(fps_results)
        print(f"FPS 创建：成功 {fps_success}/{fps_total}")
        if fps_success != fps_total and args.verbose:
            for fid, ok, data, bank in fps_results:
                if not ok:
                    print('失败 FPS', fid, bank, data)
    return 0

if __name__ == '__main__':
    sys.exit(main())
