"""
產生語言包：以「正體中文（台灣）」為主檔，
- zh-HK：OpenCC 香港字形 + 香港慣用語對照
- zh-CN：OpenCC 台灣→簡體（含詞彙轉換）+ GitHub 簡中慣用語對照
"""
import json, os
from zhconv import tw2sp, t2hk

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', 'src', 'locales')

# ---------------------------------------------------------------
# 台灣用語主檔：舊詞庫 + 修正 + 擴充
# ---------------------------------------------------------------
with open(os.path.join(SRC, 'base-entries.json'), encoding='utf-8') as f:
    TW = json.load(f)
with open(os.path.join(SRC, 'zh-TW.extra.json'), encoding='utf-8') as f:
    TW.update(json.load(f))
TW = {k.strip(): v for k, v in TW.items() if k.strip()}
# 樣板（含 {n}、{date}、{repo}、{user} 佔位符）：[台灣, 日語]
with open(os.path.join(SRC, 'templates.json'), encoding='utf-8') as f:
    TEMPLATES = json.load(f)
TW.update({k: v[0] for k, v in TEMPLATES.items()})
for k in ['Hovercard']:
    TW.pop(k, None)

# ---------------------------------------------------------------
# 規則（樣板以台灣用語撰寫，其他語言自動轉換）
# [pattern, flags, template]
# ---------------------------------------------------------------
N = r'(\d[\d,.]*[kKmM]?)'
RULES = [
    [rf'^{N} commits?$', 'i', '$1 次提交'],
    [rf'^{N} stars?$', 'i', '$1 個星標'],
    [rf'^{N} forks?$', 'i', '$1 個分叉'],
    [rf'^{N} watching$', 'i', '$1 人關注'],
    [rf'^{N} watchers?$', 'i', '$1 位關注者'],
    [rf'^{N} followers?$', 'i', '$1 位追蹤者'],
    [rf'^{N} following$', 'i', '追蹤 $1 人'],
    [rf'^{N} branch(?:es)?$', 'i', '$1 個分支'],
    [rf'^{N} tags?$', 'i', '$1 個標籤'],
    [rf'^{N} releases?$', 'i', '$1 個發行版本'],
    [rf'^{N} packages?$', 'i', '$1 個套件'],
    [rf'^{N} contributors?$', 'i', '$1 位貢獻者'],
    [rf'^\+ {N} contributors?$', 'i', '還有 $1 位貢獻者'],
    [rf'^{N} Open$', '', '$1 個開啟中'],
    [rf'^{N} Closed$', '', '$1 個已關閉'],
    [rf'^{N} comments?$', 'i', '$1 則留言'],
    [rf'^{N} participants?$', 'i', '$1 位參與者'],
    [rf'^{N} files? changed$', 'i', '已變更 $1 個檔案'],
    [rf'^{N} contributions? in the last year$', 'i', '過去一年共 $1 次貢獻'],
    [rf'^{N} contributions? in (\d{{4}})$', 'i', '$2 年共 $1 次貢獻'],
    [rf'^{N} contributions?$', 'i', '$1 次貢獻'],
    [rf'^{N} results?$', 'i', '$1 筆結果'],
    [rf'^{N} repositor(?:y|ies)$', 'i', '$1 個儲存庫'],
    [rf'^{N} issues?$', 'i', '$1 個議題'],
    [rf'^{N} pull requests?$', 'i', '$1 個合併請求'],
    [rf'^{N} discussions?$', 'i', '$1 個討論'],
    [rf'^{N} workflow runs?$', 'i', '$1 次工作流程執行'],
    [rf'^{N} hidden items?$', 'i', '$1 個隱藏項目'],
    [rf'^{N} lines? \({N} loc\) · (.+)$', 'i', '$1 行（$2 行程式碼）· $3'],
    [rf'^{N} lines?$', 'i', '$1 行'],
    [rf'^{N} members?$', 'i', '$1 位成員'],
    [rf'^{N} people$', 'i', '$1 人'],
    [rf'^{N} more$', 'i', '還有 $1 個'],
    [rf'^{N} reviews?$', 'i', '$1 則審查'],
    [rf'^{N} replies$|^{N} reply$', 'i', '$1$2 則回覆'],
    [rf'^{N} tasks?$', 'i', '$1 項任務'],
    [rf'^{N} of {N} tasks?$', 'i', '已完成 $1／$2 項任務'],
    [rf'^{N} of {N}$', '', '$1／$2'],
    [rf'^{N} jobs? completed$', 'i', '已完成 $1 項作業'],
    [rf'^{N} successful checks?$', 'i', '$1 項檢查成功'],
    [rf'^{N} failing checks?$', 'i', '$1 項檢查失敗'],
    [rf'^{N} skipped checks?$', 'i', '$1 項檢查已略過'],
    [rf'^{N} in progress checks?$', 'i', '$1 項檢查進行中'],
    [rf'^{N} new commits? pushed$', 'i', '已推送 $1 個新提交'],
    [rf'^{N} unread$', 'i', '$1 則未讀'],
    [rf'^{N} notifications?$', 'i', '$1 則通知'],
    [rf'^{N} downloads?$', 'i', '$1 次下載'],
    [rf'^{N} assets?$', 'i', '$1 個資源檔'],
    [rf'^{N} files?$', 'i', '$1 個檔案'],
    [r'^Edited (\d+) times?$', 'i', '已編輯 $1 次'],
    [r'^Page (\d+)$', 'i', '第 $1 頁'],
    [r'^Showing (\d[\d,]*) changed files? with (\d[\d,]*) additions? and (\d[\d,]*) deletions?\.?$', 'i',
     '顯示 $1 個已變更的檔案，共新增 $2 行、刪除 $3 行'],
    [r'^(\d+) seconds? ago$', 'i', '$1 秒前'],
    [r'^(\d+) minutes? ago$', 'i', '$1 分鐘前'],
    [r'^(\d+) hours? ago$', 'i', '$1 小時前'],
    [r'^(\d+) days? ago$', 'i', '$1 天前'],
    [r'^(\d+) weeks? ago$', 'i', '$1 週前'],
    [r'^(\d+) months? ago$', 'i', '$1 個月前'],
    [r'^(\d+) years? ago$', 'i', '$1 年前'],
    [r'^an? minute ago$', 'i', '1 分鐘前'],
    [r'^an? hour ago$', 'i', '1 小時前'],
    [r'^a day ago$', 'i', '1 天前'],
    [r'^a month ago$', 'i', '1 個月前'],
    [r'^a year ago$', 'i', '1 年前'],
    [r'^last week$', 'i', '上週'],
    [r'^last month$', 'i', '上個月'],
    [r'^last year$', 'i', '去年'],
    [r'^Updated (.+)$', '', '更新於 $1'],
    [r'^Joined (.+)$', '', '加入於 $1'],
    [r'^Sign in to (.+)$', '', '登入 $1'],
    [r'^Created (.+)$', '', '建立於 $1'],
    [r'^Last edited (.+)$', '', '最後編輯於 $1'],
    [r'^Merged (.+)$', '', '已合併 $1'],
    [r'^Copy (.+) to clipboard$', '', '複製 $1 到剪貼簿'],
]

# ---------------------------------------------------------------
# 香港慣用語（在 OpenCC 香港字形之後套用，長詞優先）
# ---------------------------------------------------------------
HK_TERMS = {
    '使用者名稱': '用戶名稱', '使用者': '用戶', '帳號': '帳戶', '軟體': '軟件', '網路圖': '網絡圖', '網路': '網絡',
    '儲存庫': '存儲庫', '專案': '項目', '釘選': '置頂', '電子郵件': '電郵', '大頭貼': '頭像',
    '個人檔案': '個人資料', '協助工具': '無障礙功能', '意見回饋': '意見反映', '佇列中': '排隊中', '佇列': '隊列',
    '影片': '影片', '程式碼': '程式碼', '列印': '列印', '資料夾': '資料夾', '支援': '支援',
    '品質': '質素', '相依套件': '依賴項目', '相依性': '依賴關係', '相依者': '依賴者',
    '快取': '快取', '執行器': '執行器', '剪貼簿': '剪貼簿', '最佳符合': '最佳配對',
    '追蹤者': '追隨者', '追蹤中': '正在追隨', '取消追蹤': '取消追隨', '追蹤': '追隨',
    '檢舉': '舉報', '登出': '登出', '預設': '預設', '回報': '報告', '弱點': '漏洞',
}

# ---------------------------------------------------------------
# GitHub 簡體中文慣用語（在 OpenCC 台灣→簡體之後套用，長詞優先）
# ---------------------------------------------------------------
CN_TERMS = {
    '保存库': '仓库', '储存库': '仓库', '合并请求': '拉取请求', '分叉': '复刻', '星标': '星标',
    '预设': '默认', '撰写': '编写', '登入': '登录', '登出': '退出登录', '储存': '保存', '贴上': '粘贴',
    '钉选': '置顶', '封存': '归档', '大头贴': '头像', '权杖': '令牌', '快取': '缓存', '伫列': '队列',
    '执行': '运行', '汇入': '导入', '汇出': '导出', '原始码': '源代码', '套件': '软件包', '范本': '模板',
    '检视': '查看', '资料夹': '文件夹', '协助工具': '无障碍', '追踪': '关注', '检举': '举报',
    '二进位': '二进制', '相依': '依赖', '弱点': '漏洞', '深入了解': '了解更多', '个人档案': '个人资料',
    '帐号': '账号', '账户': '账户', '议题': '议题', '留言': '评论', '重定基底': '变基', '追溯': '追溯',
    '成品': '制品', '作业': '作业', '讯息': '消息', '支援': '支持', '回报': '报告', '回馈': '反馈',
    '最佳符合': '最佳匹配', '游标': '光标', '程序码': '代码', '储存': '保存', '复制网址': '复制 URL',
    '网址': 'URL', '资源档': '资源文件', '原始档': '原始文件', '档案': '文件', '电子邮件': '电子邮箱',
    '使用者': '用户', '签出': '检出', '机密': '机密', '主题模式': '主题模式', '通行金钥': '通行密钥',
    '金钥': '密钥', '个人文件': '个人资料', '拷贝（Clone）': '克隆', '电子邮箱通知': '邮件通知', '源文件': '原始文件', '拷贝': '复制', '自订': '自定义', '指针': '指标', '工作流程': '工作流', '发行版本': '发行版', '变更': '更改', '标示': '标记', '已读': '已读', '开启中': '打开', '开启': '打开', '关闭': '关闭',
}

def apply_terms(s, terms):
    keys = sorted(terms, key=len, reverse=True)
    out, i = [], 0
    while i < len(s):
        for k in keys:
            if s.startswith(k, i):
                out.append(terms[k]); i += len(k); break
        else:
            out.append(s[i]); i += 1
    return ''.join(out)

def to_hk(s): return apply_terms(t2hk(s), HK_TERMS)
def to_cn(s): return apply_terms(tw2sp(s), CN_TERMS)

def build():
    locales = {}
    for lid, name, html, fn in [
        ('zh-TW', '正體中文（台灣）', 'zh-TW', None),
        ('zh-HK', '繁體中文（香港）', 'zh-HK', to_hk),
        ('zh-CN', '简体中文', 'zh-CN', to_cn),
    ]:
        entries = {k: (fn(v) if fn else v) for k, v in TW.items()}
        rules = [[p, fl, (fn(t) if fn else t)] for p, fl, t in RULES]
        # 人工覆寫（merge.py 寫入 src/locales/overrides/<語言>.json），優先於自動轉換
        ov = os.path.join(SRC, 'overrides', lid + '.json')
        if fn and os.path.exists(ov):
            with open(ov, encoding='utf-8') as f:
                entries.update({k: v for k, v in json.load(f).items() if v})
        locales[lid] = {'name': name, 'htmlLang': html, 'entries': entries, 'rules': rules}
    # 日語：獨立翻譯的詞庫（src/locales/ja.json）+ 日語規則樣板
    from ja_rules import JA_TEMPLATES
    assert len(JA_TEMPLATES) == len(RULES), '日語規則數量必須與 RULES 一致'
    with open(os.path.join(SRC, 'ja.json'), encoding='utf-8') as f:
        ja = json.load(f)
    ja.update({k: v[1] for k, v in TEMPLATES.items()})
    missing = [k for k in TW if k not in ja]
    if missing:
        print('ja 缺少', len(missing), '條，將顯示原文：', missing[:10])
    locales['ja'] = {'name': '日本語', 'htmlLang': 'ja',
                     'entries': {k: v for k, v in ja.items() if v},
                     'rules': [[p, fl, t] for (p, fl, _), t in zip(RULES, JA_TEMPLATES)]}
    return locales

if __name__ == '__main__':
    L = build()
    for k in ['Pull requests', 'Repositories', 'Your profile', 'Fork', 'Follow', 'Default branch', 'Clone',
              'Pinned', 'Personal access tokens', 'Download raw file', 'Rebase and merge', 'Email notifications']:
        print(f"{k:28} | {L['zh-TW']['entries'][k]} | {L['zh-HK']['entries'][k]} | {L['zh-CN']['entries'][k]}")
    print(len(L['zh-TW']['entries']), 'entries')
