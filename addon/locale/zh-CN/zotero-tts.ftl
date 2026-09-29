# Zotero-TTS — 简体中文。en-US 文件是源头；这里的每条消息、属性和变量都与它一一对应
# (test/l10n.test.ts)。用词沿用 Zotero 自己的中文：朗读、语音、语音模式、设置。


## Provider sections

ztts-field-api-key =
    .value = API 密钥
ztts-field-model =
    .value = 模型
ztts-field-voices =
    .value = 语音
# 语音框的占位提示：留空时提供什么（issue #113）
ztts-voices-input-builtin =
    .placeholder = 内置语音
ztts-voices-input-server =
    .placeholder = 服务器自带的语音
ztts-field-extra-headers =
    .value = 额外请求头
ztts-help-extra-headers =
    .value = ?
    .help = 仅用于经 Cloudflare Access 访问的服务器（见 README 里的 Cloudflare 教程）：把服务令牌写成 CF-Access-Client-Id: …; CF-Access-Client-Secret: …。其他情况留空。
# 说 OpenAI 接口的三节（issue #113）
ztts-help-openai =
    .value = ?
    .help = 密钥和模型来自 platform.openai.com，按字符计费。语音留空则用 OpenAI 自带的语音；按句高亮，不逐词。
ztts-help-mimo =
    .value = ?
    .help = 密钥来自 platform.xiaomimimo.com，目前免费。语音留空则用 MiMo 内置的中英文语音；按句高亮，不逐词。
ztts-help-compatible =
    .value = ?
    .help = 任何提供 OpenAI 接口的服务器，如 Chatterbox-TTS-Server 或 OpenAI 的代理；密钥仅在服务器要求时填，测试连接会列出它的模型。语音留空则用服务器自带的语音；按句高亮，不逐词。
ztts-test-connection =
    .label = 测试连接
ztts-field-region =
    .value = 区域
ztts-field-account-id =
    .value = 账户 ID
ztts-field-api-token =
    .value = API 令牌
ztts-help-cloudflare =
    .value = ?
    .help = Account ID 和 API token 都在 Cloudflare 控制台的 Workers AI 页面（Use REST API）。按句高亮，不逐词；每天 10,000 个免费 Neurons，Aura 语音够读几页，MeloTTS 够读几个小时。
ztts-help-speechify =
    .value = ?
    .help = 密钥在 platform.speechify.ai 的 API keys 页面；逐词高亮，没有普通话，只有粤语。每月免费 50,000 字符，约十五页；之后每月 10 美元 100 万字符。
ztts-help-fish =
    .value = ?
    .help = 密钥在 fish.audio 账号的 Developers 页面；所有语音都逐词高亮。免费模型会保留你的文本、不保证速度；付费模型按文本字节计费，一个汉字算三个字节。
ztts-fish-free-only =
    .label = 只用免费模型
ztts-help-fish-free-only =
    .value = ?
    .help = 开启：用免费的 S2.1 Pro，不需要 API 余额，但不保证速度，Fish Audio 可能保留文本。关闭：每百万字节 15 美元，从 API 余额扣，这个余额和网站上的点数是分开的。
ztts-heading-fish-sources =
    .value = 语音来源
ztts-fish-include-official =
    .label = 官方语音
ztts-fish-include-own =
    .label = 我的语音
ztts-fish-include-manual =
    .label = 手动语音
ztts-field-fish-voices = 语音（<label data-l10n-name="model-ids">Model IDs</label>）
ztts-fish-model-ids-input =
    .placeholder = Fish Audio 上的 IDs
ztts-help-fish-model-ids =
    .value = ?
    .help = 在 fish.audio/app/discovery 打开音色页面，复制它的 Model ID。多个 ID 用逗号或空格分隔；音色链接也可以。
ztts-help-fish-speech =
    .value = ?
    .help = 本机或局域网里的 fish-speech API 服务器（见 README 里的教程）；需要 24 GB 显存，按句高亮，不逐词。用 --api-key 启动的服务器，在“额外请求头”里填 "Authorization: Bearer …"。
ztts-field-address =
    .value = 地址
ztts-heading-system-voices = 系统语音
ztts-help-system-voices =
    .value = ?
    .help = 系统自带的语音，和其他服务商一样有语音浏览器、试听、收藏和缓存。Windows 逐词高亮，macOS 按句高亮；不支持 Linux。

## The provider switch, written by ui/provider-rows.ts

## Zotero 自带的语音（issue #111）：每档一个开关，没有字段

ztts-help-zotero =
    .value = ?
    .help = Zotero 自己的标准和高级语音，需要登录 Zotero 账户；每档消耗各自的额度，通过“添加更多时长”在 zotero.org 购买。关掉一档，它就从播放器和语音浏览器里消失；重新打开会恢复它上次的语音。
ztts-zotero-standard = 标准
ztts-zotero-premium = 高级
ztts-zotero-not-signed-in = 未登录 Zotero 账户。
ztts-zotero-log-in = 登录
ztts-zotero-tier-empty = Zotero 没有列出{ $tier }语音。
ztts-zotero-tier-ok = 已登录：{ $tier }语音 { $count } 个。
ztts-zotero-time-left = 剩余时间：{ $time }
ztts-zotero-time-range = 剩余时间：{ $low } – { $high }，视语音而定
ztts-zotero-time-over = { $time }+
ztts-zotero-credits-left = 剩余 { $credits } 额度
ztts-zotero-credits-unlimited = 剩余时间：不限
ztts-zotero-no-time = { $tier }没有剩余时间，请先添加时长。
ztts-duration-m = { $minutes }分钟
ztts-duration-hm = { $hours }小时{ $minutes }分钟
ztts-duration-dhm = { $days }天{ $hours }小时{ $minutes }分钟
ztts-duration-d = { $days }天
ztts-reminder-used-up = { $tier }的剩余时间已用完，已自动关闭。请添加时长后，在 Zotero-TTS 设置里重新启用。
ztts-reminder-daily-limit = { $tier }已达到今天的限额，已自动关闭。明天可以在 Zotero-TTS 设置里重新启用。
ztts-reminder-short = { $tier }的剩余时间不够这个语音使用，可以换一个更便宜的语音，或添加更多时长。
ztts-reminder-others = 另外 { $count } 个标签页的朗读也已停止。
ztts-reminder-close = 关闭
ztts-zotero-add-more-time = 添加更多时长

# 密钥、网关请求头、WebDAV 密码后面的眼睛：露出内容，便于查看、选中和复制，再点收起。服务启用后变灰，内容一律遮住。
ztts-secret-show = 显示内容
ztts-secret-hide = 隐藏内容

ztts-switch-enable = 启用
ztts-switch-disable = 停用
ztts-switch-checking = 正在检查…
ztts-switch-testing = 正在测试…


## Voice browser

ztts-heading-voice-browser = 语音浏览器
ztts-favorites-only =
    .label = 播放器中只提供收藏的语音
    .bold = 收藏的语音
ztts-voices-speed =
    .value = 速度
    .tooltiptext = 试听按此速度播放；开启“所有文档使用同一速度”后，松开滑块即把它设为全局速度
ztts-volume =
    .value = 音量
ztts-volume-percent =
    .value = %
ztts-help-volume =
    .value = ?
    .help = 所有语音和试听的音量；100% 是 Zotero 本来的音量，也是最大值。下面的音量键每次调 10%。
ztts-help-default-voice =
    .value = ?
    .help = 新文档先用默认语音；在播放器里换声音只影响当前文档。


## Reading

ztts-heading-reading = 朗读
ztts-open-expanded =
    .label = 打开时展开播放器
ztts-help-open-expanded =
    .value = ?
    .help = 悬浮面板每次打开时都显示语音服务、语言和声音三行。点“选项”或按 Shift+O 可在本次打开期间收起或展开。
ztts-one-speed =
    .label = 所有文档使用同一速度
ztts-help-one-speed =
    .value = ?
    .help = 所有文档、所有打开的标签页都用同一个速度。关闭时：Zotero 按文档语言各记一个速度。
ztts-sentence-pause =
    .label = 句与句之间停顿
ztts-paragraph-pause =
    .label = 段落之间停顿
ztts-pause-ms =
    .value = 毫秒
ztts-help-sentence-pause =
    .value = ?
    .help = 同一段里句与句之间的停顿，按 1 倍速计；读得越快越短。
ztts-help-paragraph-pause =
    .value = ?
    .help = 段落开头的整段停顿，按 1 倍速计，代替该处的句间停顿；读得越快越短。
ztts-skipped-lines =
    .label = Zotero 漏读页首一行时，补读这一行
ztts-help-skipped-lines =
    .value = ?
    .help = 句子跨页时，朗读下一页被 Zotero 漏掉的第一行。若页眉被读了出来就关掉；对之后打开的文档生效。
ztts-split-sentences =
    .label = Zotero 把一句话切成两句时，合成一句朗读
ztts-help-split-sentences =
    .value = ?
    .help = Zotero 把一句话拆成两句时，合成一句朗读，中间不停顿。若两个段落被连成一句就关掉；对之后打开的文档生效。
ztts-prefetch =
    .label = 预取后面的
ztts-prefetch-ahead =
    .value = 句
ztts-help-prefetch =
    .value = ?
    .help = 提前合成后面的句子，播放不用等服务器。付费服务商上，跳过的句子也会计费。
ztts-cache-audio =
    .label = 缓存已合成的音频
ztts-help-cache-audio =
    .value = ?
    .help = 把合成过的句子留在内存里（64 MB，Zotero 重启时清空），重听即刻播放、不再计费。预取开启时不能关闭。


## Highlight

ztts-heading-highlight = 高亮
ztts-highlight-sentence =
    .label = 句子
ztts-highlight-word =
    .label = 单词
ztts-highlight-opacity =
    .value = 不透明度 (%)
ztts-help-highlight-switches =
    .value = ?
    .help = 都开启时，单词色叠在句子色上；最后一个开着的不能关。没有单词时间的语音总是按句高亮。
ztts-preview-line = 第一句已经读完。<span data-l10n-name="before">朗读正停在</span><span data-l10n-name="word">这个</span><span data-l10n-name="after">词上。</span>下一句接着来。
ztts-restore-colors =
    .label = 恢复默认颜色


## Keyboard shortcuts

ztts-heading-shortcuts = 键盘快捷键
ztts-key-speed-reset =
    .value = 速度重置为 1.0×
ztts-key-slower =
    .value = 减速 (−0.05×)
ztts-key-faster =
    .value = 加速 (+0.05×)
ztts-key-quieter =
    .value = 音量减 (−10%)
ztts-key-louder =
    .value = 音量加 (+10%)
ztts-key-previous-sentence =
    .value = 上一句
ztts-key-next-sentence =
    .value = 下一句
ztts-key-previous-paragraph =
    .value = 上一段
ztts-key-next-paragraph =
    .value = 下一段
ztts-key-play =
    .value = 播放 / 暂停 / 继续
ztts-key-options =
    .value = 播放器选项
ztts-key-stop =
    .value = 停止所有朗读
ztts-key-word-highlight =
    .value = 单词高亮 开 / 关
ztts-clear =
    .label = 清除
ztts-help-key-skip =
    .value = ?
    .help = 仅在播放器打开时生效；否则这个键照常翻页、滚动。
ztts-help-key-play =
    .value = ?
    .help = 任何状态下都可用：暂停、继续，或从选中的文字、上次停下的地方、当前页开始朗读。
ztts-help-key-return =
    .value = ?
    .help = 仅在播放器打开时生效：回到正在朗读的句子，并把当前文档切到 A。暂停的音频保持暂停。
ztts-help-key-options =
    .value = ?
    .help = 仅在播放器打开时生效：展开或收起悬浮面板的语音服务、语言和声音三行。
ztts-help-key-stop =
    .value = ?
    .help = 关闭所有标签页里的播放器，各自保留阅读位置。没有播放器打开时，这个键保持原来的作用。
ztts-help-key-word-highlight =
    .value = ?
    .help = 打开或关闭“高亮”里的“单词”开关，对所有标签页生效；关闭时高亮句子。
ztts-help-key-volume =
    .value = ?
    .help = 把上面的音量调 10%。仅在播放器打开时生效；否则这个键保持原来的作用。
ztts-restore-shortcuts =
    .label = 恢复默认快捷键


## Backup

ztts-heading-backup = 备份
ztts-backup-to-file =
    .value = 存成文件
ztts-backup-settings =
    .label = 备份设置…
ztts-restore-settings =
    .label = 恢复设置…
ztts-export-positions =
    .label = 导出朗读位置…
ztts-import-positions =
    .label = 导入朗读位置…
ztts-help-positions =
    .value = ?
    .help = 每篇文档上次读到的位置，单独存成一个文件；导入时保留较新的位置。设置备份从不包含阅读位置。


## WebDAV

ztts-heading-webdav = WebDAV
ztts-field-webdav-url =
    .value = WebDAV 地址
ztts-field-username =
    .value = 用户名
ztts-field-password =
    .value = 密码


## Sync

ztts-heading-sync = 同步
ztts-sync-positions =
    .label = 在电脑之间同步朗读位置
ztts-help-sync-positions =
    .value = ?
    .help = 通过上面的 WebDAV 文件夹，和其他电脑以及手机上的 OpenReader 共享每篇文档读到的位置。关闭时，位置只留在这台电脑上。
ztts-sync-settings =
    .label = 在电脑之间同步设置
ztts-help-sync-settings =
    .value = ?
    .help = 让共用上面这个文件夹的电脑保持相同设置。本机或局域网地址的语音服务器、系统语音开关和这个 WebDAV 连接各台电脑独立。
# The line under each switch (ui/sync-status-rows.ts): what the last sync did on this computer
ztts-positions-status-waiting = 朗读位置同步：等待第一次同步。
ztts-positions-status-none = 朗读位置已于 { $time } 同步；这台电脑没有新内容。
ztts-positions-status-taken = 朗读位置已于 { $time } 同步：从你的其他电脑取回 { $count } 个。
ztts-positions-status-last = 朗读位置已于 { $time } 同步；最近一次从其他电脑取回是 { $when }。
ztts-positions-status-failed = 朗读位置同步于 { $time } 失败：{ $detail }
# 其他设备到达的位置在本机这份文档里找不到时的提示（改从本机上次的句子继续）
ztts-shared-position-unresolved = 在这份文档里没有找到其他设备到达的位置，将从这台电脑上次停下的句子继续。
ztts-sync-status-waiting = 设置同步：等待第一次同步。
ztts-sync-status-none = 设置已于 { $time } 同步；这台电脑没有新内容。
ztts-sync-status-applied = 设置已于 { $time } 同步：来自 { $from } 的 { $count } 项已在这里应用。
ztts-sync-status-last = 设置已于 { $time } 同步；这里最近一次改动是 { $when } 来自 { $from } 的 { $count } 项。
ztts-sync-status-failed = 设置同步于 { $time } 失败：{ $detail }
ztts-sync-status-deferred = 另有 { $count } 项等朗读停止后再应用。
ztts-sync-status-held = { $provider } 在这台电脑上保持停用：{ $reason }
ztts-sync-other-computer = 另一台电脑


## Backup — this computer's copy on the server (ui/webdav-rows.ts)

ztts-backup-on-server =
    .value = 本机在服务器上的副本
ztts-field-this-computer =
    .value = 本机名称
ztts-help-this-computer =
    .value = ?
    .help = 本机备份在服务器上的名字，各台电脑互不覆盖；改名会另起一份。
ztts-auto-upload =
    .label = 在服务器上保留本机设置的备份
ztts-help-auto-upload =
    .value = ?
    .help = 任一设置改动几秒后，刷新服务器上本机的备份。这是备份不是同步：除非你自己恢复，任何电脑上都不会变。
ztts-upload-now =
    .label = 立即备份到服务器
ztts-restore-from-server =
    .label = 从服务器恢复设置…


## About

ztts-heading-about = 关于
ztts-about-version = 版本 { $version }
ztts-about-date = 日期 { $date }
ztts-about-time = 时间 { $time }
ztts-about-author = 作者 { $author }
ztts-about-email = 邮箱 { $email }
ztts-about-star = 如果你喜欢 Zotero-TTS，欢迎到 <label data-l10n-name="github">GitHub</label> 给它点个 ⭐——让更多人发现它。


## What TypeScript writes into the pane (issue #43)
#
# 句与句之间不加空格：ztts-join 把两句直接相连。数量以文本传入的地方
# 原样显示（1914），以数字传入的地方（标签页、服务商）可按 [1] 选词。

ztts-join = { $first }{ $second }

## Connection results

ztts-connected = 已连接。
ztts-connected-model = 已连接。模型 { $model } 可用。
ztts-connected-model-missing = 已连接，但此服务器没有列出模型“{ $model }”。
ztts-voices-available = { $count } 个语音可用。
ztts-synthesis-works = 合成正常。
ztts-word-timestamps = 有单词时间戳。
ztts-no-word-timestamps = 没有单词时间戳：{ $detail }。
ztts-no-word-timestamps-detail = 服务器没有返回
ztts-synthesis-failed = 已连接，但合成失败：{ $detail }
ztts-timestamp-check-failed = 已连接，但单词时间戳检查失败：{ $detail }
ztts-no-reply = { $seconds } 秒内没有回应
ztts-no-audio = { $seconds } 秒内没有收到音频
ztts-no-voice-list = { $seconds } 秒内没有收到语音列表
ztts-local-server-down = 该地址上没有运行本地 TTS 服务器。
ztts-no-key = 此服务商没有设置 API 密钥。
ztts-key-rejected = 服务器拒绝了 API 密钥。({ $detail })
ztts-cannot-connect = 无法连接：{ $detail }
ztts-connection-failed = 连接失败：{ $detail }
ztts-providers-checked = 已检查 { $count } 个服务商：全部正常。
ztts-providers-turned-off = 已停用 { $named }（共 { $count } 个）：恢复的设置在这台电脑上不可用，见各自旁边的提示。
ztts-system-unsupported = 系统语音只在 Windows 和 macOS 上可用；此构建没有 Linux 的语音助手程序。

## The voice browser

# Zotero 自己的词（reader.ftl）：标准 / 高级
ztts-tier-standard = Zotero 标准
ztts-tier-premium = Zotero 高级
# 系统语音在播放器第一个下拉框和语音浏览器第一列里的条目名（issue #110），与本页标题一致
ztts-provider-system = 系统
ztts-listing-voices = 正在列出语音…
ztts-no-voices = 没有语音。请在上方启用一个服务商。
ztts-no-providers-on = 没有打开任何服务商：请在上方启用一个。
ztts-listing-failed = 列出语音失败：{ $problems }
ztts-plugin-voices-problem = 插件的语音：{ $detail }
ztts-fish-list-limited = Fish Audio 的平台列表上限为 1,000 个语音；可从 Fish Audio discovery 获取 Model IDs 来添加其他语音。
ztts-fish-list-stale = Fish Audio 的语音列表可能已过时：{ $detail }
ztts-fish-list-stale-no-detail = Fish Audio 的语音列表可能已过时。
ztts-default-voice = 默认语音：{ $voice }
ztts-default-voice-speed = 默认语音：{ $voice } | 全局速度：{ $speed }
ztts-default-speed = 全局速度：{ $speed }
ztts-no-default = 没有默认语音和全局速度：Zotero 按语言各记各的
ztts-zotero-own-choice = 请选择默认声音
ztts-not-listed-now = { $id }（当前未列出）
ztts-status-not-a-favorite = { $line }——不是收藏的语音，而当前只提供收藏的语音：朗读无法用它开始
ztts-status-trouble = { $line }——{ $problems }
ztts-default-cleared = 已清除默认语音：{ $label } 不再是收藏的语音，而当前只提供收藏的语音
ztts-sample-failed = 试听失败：{ $detail }
ztts-sample-stopped = 试听失败：音频已收到，但播放中断：{ $detail }
ztts-zotero-sample-unavailable = 这里无法播放 Zotero 自己的语音
ztts-play-sample = 试听
ztts-play-zotero-sample = 试听 Zotero 自己的示例
ztts-favorite = 收藏
ztts-row-default = 默认语音：朗读从它开始。点击可清除
ztts-row-pick = 点击设为默认语音
ztts-row-blocked = 开启“播放器中只提供收藏的语音”时，只有收藏的语音才能设为默认
ztts-media-unknown = 未知错误
ztts-media-code = 媒体错误 { $code }
ztts-media-aborted = 播放被中止
ztts-media-network = 网络错误
ztts-media-decode = 解码或输出失败
ztts-media-format = 不支持的格式

## The reading guard's dialog and the favorites-only refusal

ztts-reading-tabs =
    此改动会影响以下 { $count } 个标签页中的朗读：
    { $list }

    关闭{ $count ->
        [1] 该标签页
       *[other] 这些标签页
    }中的播放器后再试。
ztts-reading-tabs-close =
    此改动会影响以下 { $count } 个标签页中的朗读：
    { $list }

    { $count ->
        [1] 关闭其中的播放器后，改动即可生效。标签页会保留，并记住读到的位置。
       *[other] 关闭其中的播放器后，改动即可生效。这些标签页都会保留，并记住各自读到的位置。
    }
ztts-close-and-continue = 关闭并继续
ztts-cancel = 取消
ztts-ok = 确定
ztts-item = 条目 { $id }
ztts-unmarked-default =
    { $name } 是默认语音，但不是收藏的语音。

    只提供收藏的语音时，朗读无法用它开始。请先把它标为 ♥，或把一个收藏的语音设为默认，再开启此项。

## The shortcut recorder

ztts-recording = 请按新的按键…（Esc 取消）
ztts-key-not-set = 未设置
ztts-key-invalid = { $text }（无效）
ztts-key-conflict = 已被“{ $action }”使用。
ztts-key-needs-modifier-or-arrow = 请加上修饰键（Ctrl、Alt、Shift 或 Cmd）或使用方向键：单独的按键会输入字符。
ztts-key-needs-modifier = 请加上修饰键（Ctrl、Alt、Shift 或 Cmd）：单独的按键会输入字符。
ztts-action-speed-reset = 重置速度
ztts-action-slower = 减速
ztts-action-faster = 加速
ztts-action-quieter = 音量减
ztts-action-louder = 音量加
ztts-action-previous-sentence = 上一句
ztts-action-next-sentence = 下一句
ztts-action-previous-paragraph = 上一段
ztts-action-next-paragraph = 下一段
ztts-action-play = 播放 / 暂停 / 继续
ztts-action-return = 返回朗读位置并开启自动滚动
ztts-action-options = 播放器选项
ztts-action-stop = 停止所有朗读
ztts-action-word-highlight = 单词高亮 开 / 关
# The toast the volume keys show, where the speed's shows `1.3×`
ztts-volume-toast = 音量 { $percent }%
ztts-stopped-toast = 已停止 { $count } 个标签页的朗读
ztts-highlight-toast-both = 高亮：单词和句子
ztts-highlight-toast-word = 高亮：单词
ztts-highlight-toast-sentence = 高亮：句子
ztts-highlight-toast-word-no-timing = 高亮：单词（此语音没有单词时间，仍按整句高亮）
ztts-zotero-highlight-hint = 在 Zotero-TTS 设置的“高亮”一节里选择

## Backup and Sync

ztts-picker-backup = 备份 Zotero-TTS 设置
ztts-picker-restore = 恢复 Zotero-TTS 设置
ztts-backup-saved = 已保存到 { $path }。文件包含全部设置，其中有 API 密钥、网关请求头和 WebDAV 密码——请妥善保管。
ztts-backup-failed = 备份失败：{ $detail }
ztts-restore-confirm = 用 { $path } 中的 { $count } 项设置替换当前设置？
ztts-restored = 已从 { $path } 恢复 { $count } 项设置。
ztts-skipped = 跳过 { $count } 项：{ $keys }。
ztts-checking-providers = 正在检查它启用的服务商…
ztts-providers-uncheckable = 无法检查服务商：{ $detail }
ztts-restore-failed = 恢复失败：{ $detail }
ztts-positions-saved = 已把 { $count } 个朗读位置保存到 { $path }。
ztts-export-failed = 导出失败：{ $detail }
ztts-positions-merged = 已从 { $path } 合并 { $count } 个朗读位置；其中 { $taken } 个更新，已采用。
ztts-import-failed = 导入失败：{ $detail }
ztts-webdav-testing = 正在测试…
ztts-webdav-uploading = 正在上传…
ztts-webdav-looking = 正在查找…
ztts-webdav-connected = 已连接到 { $url }。
ztts-upload-failed = 上传失败：{ $detail }
ztts-webdav-uploaded = 已把 { $count } 项设置备份到 { $file }。文件包含全部设置，其中有 API 密钥、网关请求头和 WebDAV 密码——请把文件夹设为私有。
ztts-webdav-none = { $url } 上还没有设置备份。
ztts-webdav-pick-title = 恢复哪台电脑的设置？
ztts-shared-file = 共享文件（1.11 之前）
ztts-date-unknown = 日期未知
ztts-settings-file-label = { $who } — { $when }
ztts-webdav-restore-confirm = 用 { $url } 上的 { $count } 项设置替换当前设置？
ztts-webdav-restore-confirm-machine = 用 { $url } 上 { $machine } 的 { $count } 项设置替换当前设置？
ztts-webdav-restore-confirm-saved = 用 { $url } 上的 { $count } 项设置（保存于 { $time }）替换当前设置？
ztts-webdav-restore-confirm-machine-saved = 用 { $url } 上 { $machine } 的 { $count } 项设置（保存于 { $time }）替换当前设置？
ztts-webdav-machine-file = 本机在服务器上的备份是 { $file }。

## The reader: the line shown when Read Aloud does not start with the remembered voice

ztts-substitute = Zotero-TTS：这里没有提供 { $missing }，改用 { $instead } 朗读。
ztts-substitute-none = Zotero-TTS：这里没有提供 { $missing }，也没有 Zotero-TTS 的其他语音。由 Zotero 选择语音。
ztts-substitute-paid = Zotero-TTS：这里没有提供 { $missing }，也没有 Zotero-TTS 的其他语音。由 Zotero 选择语音，可能会消耗额度。

## Scrolling (issue #155: its own section, out of Highlight)

ztts-heading-scrolling = 滚动
ztts-default-auto-scroll =
    .value = 默认滚动方式
ztts-follow-auto =
    .label = 自动滚动
ztts-follow-manual =
    .label = 手动滚动
ztts-help-default-auto-scroll =
    .value = ?
    .help = 新文档标签页以 A（自动）还是 M（手动）开始；播放器的 A/M 只改变当前标签页。

ztts-auto-scroll =
    .value = 自动滚动方式
ztts-auto-scroll-line =
    .label = 每行都滚动
ztts-auto-scroll-sentence =
    .label = 每句都滚动
ztts-auto-scroll-outside =
    .label = 超出视图时滚动
ztts-help-auto-scroll-line =
    .value = ?
    .help = 高亮的单词换到新的一行时，把这一行滚到阅读线；没有高亮单词时改为每句滚动。
ztts-help-auto-scroll-sentence =
    .value = ?
    .help = 每个新句子都滚到阅读线，即使它已经可见。
ztts-help-auto-scroll-outside =
    .value = ?
    .help = 句子没有完整可见时才滚到阅读线。
ztts-reading-line =
    .value = 阅读线
ztts-reading-line-before =
    .value = 距顶部
ztts-reading-line-after =
    .value = %
ztts-help-reading-line =
    .value = ?
    .help = 自动滚动把句子停在视图的这个高度：0% 贴顶，50% 居中，100% 贴底。分页 EPUB 按页翻，不受影响。

ztts-key-auto-scroll =
    .value = 自动滚动模式
ztts-help-key-auto-scroll =
    .value = ?
    .help = 循环切换自动滚动方式：每行、每句、超出视图时。选择会保存，对所有文档生效。
ztts-action-auto-scroll = 自动滚动模式
ztts-key-previous-voice =
    .value = 上一个声音
ztts-key-next-voice =
    .value = 下一个声音
ztts-help-key-voice =
    .value = ?
    .help = 切换到播放器列表里的上一个或下一个声音，朗读不中断；准备新声音可能消耗服务额度。
ztts-action-previous-voice = 上一个声音
ztts-action-next-voice = 下一个声音
ztts-voice-preparing = 正在准备声音：{ $voice }
ztts-voice-failed = 无法切换到 { $voice }。已保留原来的声音，请重试。
ztts-voice-unavailable = 声音列表尚未就绪。请打开播放器后重试。
ztts-auto-scroll-toast-line = 自动滚动：每行都滚动
ztts-auto-scroll-toast-sentence = 自动滚动：每句都滚动
ztts-auto-scroll-toast-outside = 自动滚动：超出视图时滚动
# The annotate keys (issue #145): Zotero's own H and U, bindable
ztts-key-highlight-sentence =
    .value = 高亮句子
ztts-key-underline-sentence =
    .value = 下划线句子
ztts-help-key-annotate =
    .value = ?
    .help = 给正在朗读的句子加高亮或下划线注释，并打开注释弹窗；刚开始读一句时，标注刚读完的上一句。弹窗打开时按另一个键，可在两者之间切换。
ztts-action-highlight-sentence = 高亮句子
ztts-action-underline-sentence = 下划线句子

ztts-strip-angle-brackets =
    .label = 朗读时去掉包围文字的括号
ztts-bracket-pairs =
    .aria-label = 要去掉的括号对
ztts-help-strip-angle-brackets =
    .value = ?
    .help = 去掉括住文字的括号，保留里面的文字；括号对用空格分隔，例如 <> [] () 【】。取消勾选才能编辑列表；重新打开播放器后生效。
ztts-bracket-use-defaults = 使用默认值
ztts-bracket-error-empty = 请至少输入一组括号对，多组之间用空格分隔。是否改用默认列表 <> []？
ztts-bracket-error-entry = 括号对“{ $entry }”无效。每组必须恰好包含两个不同的标点或符号。是否改用默认列表 <> []？
ztts-bracket-error-duplicate = 括号对“{ $entry }”重复。每组只能输入一次。是否改用默认列表 <> []？


ztts-player-heading = 播放器
ztts-player-layout = 布局
ztts-player-bottom = 底部栏
ztts-player-floating = 悬浮面板
ztts-player-top = 顶部栏
ztts-player-provider = 语音服务
ztts-player-locale = 语言
ztts-player-voice = 声音
ztts-player-play = 播放
ztts-player-pause = 暂停
ztts-player-speed = 速度
ztts-player-volume = 音量
ztts-player-automatic = 自动滚动。点击切换为手动，直到你主动切回自动。
ztts-player-manual = 手动滚动。点击返回朗读位置并切换为自动。
ztts-player-search = 搜索
ztts-player-empty = 没有匹配结果
ztts-player-loading = 正在加载声音…
ztts-player-no-voices = 没有可用声音，请在 Zotero-TTS 设置中启用语音服务。
ztts-player-favorite = 收藏
ztts-player-unfavorite = 取消收藏
ztts-player-retry = 重试
ztts-player-buffering = 正在缓冲…
ztts-player-unavailable = 此文档无法朗读。
ztts-player-failed = Zotero-TTS 的播放器没能在这里加载。要先用 Zotero 自己的播放器朗读，请在“工具 → 插件”中关闭 Zotero-TTS。
ztts-player-unavailable-choice = 此声音或语言已不可用，请选择其他选项。
ztts-player-invalid-value = 不支持所选值。
ztts-player-playback-error = 播放失败，请检查语音服务连接后重试。
ztts-player-quota-error = 语音服务已达到使用限制或余额不足。
ztts-player-zotero-short = { $tier }的剩余时间不够这个语音使用。
ztts-player-daily-limit = { $tier }已达到今天的限额。
ztts-player-favorite-guard = 此更改会移除正在使用的语音。请先关闭受影响标签页的播放器，再进行更改。

ztts-player-options = 选项
ztts-player-previous-paragraph = 上一段
ztts-player-previous-sentence = 上一句
ztts-player-next-sentence = 下一句
ztts-player-next-paragraph = 下一段

ztts-playback-preparing = 正在准备…
ztts-playback-failed = 无法准备音频，请重试播放。

ztts-action-player-layout = 播放器布局
ztts-key-player-layout =
    .value = 播放器布局
ztts-help-key-player-layout =
    .value = ?
    .help = 播放器打开时，循环切换顶部栏 → 底部栏 → 悬浮面板；所有播放器共用此布局。

ztts-document-voice-unavailable = 保存的声音（{ $voice }）不可用，请在播放器中选择声音后继续。
ztts-default-voice-required = 请先在 Zotero-TTS 设置中选择默认声音。

ztts-remaining-time =
    .label = 显示预计剩余朗读时间
ztts-help-remaining-time =
    .value = ?
    .help = 按当前语速估算全文和当前目录部分（或所选内容）还需听多久。手动暂停和网络等待期间不倒数。
ztts-time-estimating = 估算中…
ztts-time-unavailable = 暂无法估算
ztts-time-finished = 已读完
ztts-time-document = 全文
ztts-time-selection = 所选内容
ztts-time-minutes = <{ $minutes } 分钟
ztts-time-summary = { $name } { $time }

ztts-time-section = 小节
ztts-time-pair = { $document } · { $section }

# Independent follow actions (#153)
ztts-key-locate =
    .value = 返回朗读位置
ztts-action-locate = 返回朗读位置
ztts-help-key-locate =
    .value = ?
    .help = 仅在播放器打开时生效：定位一次正在朗读的句子，不改变 A/M，也不恢复暂停的音频。
ztts-key-following =
    .value = 切换 A/M
ztts-action-following = 切换 A/M
ztts-help-key-following =
    .value = ?
    .help = 像播放器的 A/M 按钮一样，在自动和手动滚动之间切换当前文档；切到 A 时也会定位当前句。
