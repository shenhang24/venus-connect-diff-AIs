let language = 'zh';
const workspaceTranslations={"语义大标签依据模型理解；项目按稳定身份共享引用，依据不足保留待归纳，不用同词频次代替归属。":"Broad domains use model interpretation; projects share stable identity references. Insufficient evidence remains pending, without word-frequency assignment.","当前作业：":"Current operation: ","资料库最近保存：":"Latest library save: ","语义导航维护":"Semantic navigation maintenance","主归纳已暂停，":"Main classification is paused; ","主归纳未启用，":"Main classification is disabled; ","主归纳等待，":"Main classification is waiting; ","索引维护正在收口":"index maintenance is finishing","等待原索引模型核验退出":"waiting to verify the original index model has exited","索引维护运行中":"index maintenance is running","索引维护收口":"Index maintenance finishing","索引维护运行":"Index maintenance running","原全库断点保留；本次只处理所列语义标签。索引模型尚未停稳前不恢复其他模型作业。":"The library checkpoint is retained. This operation handles only the listed semantic labels. Other model jobs cannot resume until this index model has stopped.","重置任务":"Reset task","重新开始":"Start again","保留原文、已有成果、人工修改和已用预算。":"Keep originals, saved results, manual edits and spent budgets.","取消当前任务并保留断点":"Cancel current task and retain checkpoint","查看失败位置与保留结果":"Inspect failed range and preserved result","核验执行所有者":"Verify execution owner","等待原进程正常退出":"Wait for the original process to exit","恢复已验证控制副本":"Restore validated control backup","隔离此资料并继续其余任务":"Defer this source and continue the rest","冷却后重试一次":"Retry once after cooldown","打开已有连接设置":"Open existing connection settings","检测已有登录连接":"Check existing signed-in connection","恢复此隔离资料":"Resume this deferred source","连接检测结果":"Connection check result","保留原文和返回；此资料仍未完成，不计入完成总数。":"Keep original text and returns; this source remains unfinished and is not counted as complete.","具体隔离原因":"Specific deferral reason","正在启动原归纳器":"Starting the original classifier","正在从断点恢复":"Resuming from checkpoint","正在保存断点并取消":"Saving checkpoint before cancellation","等待自动恢复":"Waiting for automatic recovery","等待断点恢复":"Waiting for checkpoint recovery","需要按方案处理":"Action plan required","执行器身份待核验":"Worker identity needs verification","调度所有者冲突":"Scheduler ownership conflict","等待原模型进程退出":"Waiting for the original model to exit","继续当前核对":"Continue current verification","核验断点并查看方案":"Verify checkpoint and show plan","保存断点后暂停":"Pause after saving checkpoint","断点核验通过；已有结果保留":"Checkpoint verified; saved results retained","断点需要按方案处理":"Checkpoint requires the displayed action plan","请求已登记；以真实执行状态为准":"Request recorded; follow actual execution status","请求未执行；请查看具体原因":"Request not executed; see the reason","系统会按保存断点有限重试；不会重复已有结果。":"Bounded retries resume the saved checkpoint without repeating saved results.","先核验失败位置的原文与保存返回；不追加已用纠正预算。":"Verify the source and preserved return at the failed range; spent correction budgets remain spent.","需要处理已报告的权限或登录问题；系统不会绕过限制。":"Resolve the reported permission or sign-in issue; restrictions are not bypassed.","等待模型容量恢复；保留断点，不盲目重试。":"Wait for model capacity recovery; retain checkpoints without blind retries.","自动恢复次数已用完；请核验保留的错误和断点。":"Automatic recovery attempts are exhausted; inspect the preserved error and checkpoint.","可先核验断点，再继续当前有效任务。":"Verify the checkpoint, then continue the current active task.",'已核对原执行器存活及分段落盘；旧流程记录单独保留。':'The original executor and saved segment were verified; legacy workflow records remain separate.','归纳正在保存断点并暂停':'Classification is saving its checkpoint and pausing','全库归纳正在处理':'Library classification is running','由原归纳执行器接续；旧派发器保持关闭。':'The original classification executor is continuing; the legacy dispatcher remains disabled.','自动项目：':'Automatic projects: ','候选：':'Candidates: ','同标签：3 份独立来源列为候选，5 份自动成为项目。':'Same tag: 3 independent sources nominate a project; 5 promote it.','已连接':'Connected','尚未检测':'Not checked','删除':'Delete','更新同步／断点继续':'Update sync / resume','待归属':'Awaiting project assignment'};
export function resolveLanguage(systemLanguage, browserLanguages = []) {
  const requested = systemLanguage || browserLanguages.find(Boolean) || 'en';
  return /^zh(?:-|$)/i.test(requested) ? 'zh' : 'en';
}
export function setLanguage(value) { language = resolveLanguage(value); }
export function uiLocale() { return language === 'zh' ? 'zh-CN' : 'en'; }
export function uiError(message) {
  if(language !== 'en') return message;
  return workspaceTranslations[message] || translations[message] || 'Operation failed. Service details: ' + message;
}
export async function initializeLanguage() {
  let systemLanguage;
  try { const response = await fetch('/api/ui-language'); if(response.ok) systemLanguage=(await response.json()).systemDisplayLanguage; } catch {}
  language = resolveLanguage(systemLanguage, navigator.languages || [navigator.language]);
  document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  // This runs before any private content is loaded. Runtime content is never walked.
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while(walker.nextNode()) {
    const node=walker.currentNode;
    if(!node.parentElement.closest('script,style')) node.nodeValue=tr(node.nodeValue);
  }
  for(const element of document.querySelectorAll('[title],[aria-label],[placeholder]'))
    for(const attribute of ['title','aria-label','placeholder'])
      if(element.hasAttribute(attribute))element.setAttribute(attribute,tr(element.getAttribute(attribute)));
}

// Translate developer-owned literals before inserting private values into them.
// Titles, file names, quotations, Markdown and analysis bodies never pass here.
const translations = {
  '只读原始 Vault，独立于知识和技能；仅提取本地覆盖缺口，不复审已保存概念。':'Reads original Vault independently of knowledge and skills. Extracts only local coverage gaps; saved concepts are not re-reviewed.',
  '/ 启明星':'/ Morning Star',
  '默认显示完整项目星云及全部所属节点；点击节点聚焦，查看全图显示整个星云。项目筛选仍生效，文字随距离缩小、隐藏。':'Show the full project nebula and all its nodes by default. Select a node to focus; Fit all frames the entire nebula. Project filters remain active; labels shrink and hide with distance.',
  '所属项目':'Project', '全部项目':'All projects', '跨项目主题':'Topics across projects', '全部主题':'All topics', '未归属项目':'Unassigned project', '按来源项目映射归属':'Assigned by source project mapping', '暂无可靠项目归属':'No verified project assignment',
  '试验布局':'Test layout','24 域公转与共享节点':'24-domain orbits and shared nodes','原有连链试验':'Legacy chain test',
  '保存任意来源的原始 Markdown，保留原文。':'Preserve original Markdown from any source.',
  '供 AI 检索、衔接上下文与回答；不覆盖当前指示。':'For AI retrieval, context and answers; never overrides current instructions.',
  '记录已认可方法、适用范围与限制；区分未确认建议，不代替当前授权。':'Record endorsed methods, scope and limits. Unconfirmed suggestions are distinct and do not grant authorization.',
  '帮助人理解交流中真正获得的认识；未确认问题单独记录，可忽略。':'Help people understand insights gained through discussion; unconfirmed questions are separate and ignorable.',
  '用户已认可的适用方法':'User-endorsed method within scope','未确认或待复核的方法参考':'Unconfirmed or review-needed method reference','适用范围':'Scope','限制':'Limits','返回用户认可依据':'View user endorsement evidence',
  '来源角色：':'Source role: ','用户':'User','助手':'Assistant','引用资料或角色未明':'Reference material or unknown role',
  '提问原句':'Original question','回答原句':'Original answer','用户认可原句':'User endorsement quotation','结论原句':'Conclusion quotation',
  'AI 知识点':'AI Knowledge','AI 技能':'AI Skills','概念云':'Concept Cloud','AI 知识网络':'AI Knowledge Network','AI 技能网络':'AI Skill Network','概念网络':'Concept Network',
  '四个并列资料目录':'Four parallel content directories','概念云 · 内容目录':'Concept Cloud · Contents','查看提炼范围与模板':'Extraction scope and template','从对话中形成概念':'Concepts formed through discussion','概念云 · 提炼范围与模板':'Concept Cloud · Scope and template',
  '新建概念':'New concept','原文定位引句':'Exact source quotation','手动保存，不调用模型；来源须是 Vault 原文。':'Save manually without a model call. Cite a Vault original.',
  '直接整理 Vault 中形成的认识、理由和技术线。':'Organize insights, reasoning and technical ideas directly from Vault discussions.',
  '每篇包括：新标题、情境与目的的简短综述、解释认识及意义的正文，以及独立 Reference。操作日志、执行状态和排障碎片不作为概念。':'Each concept has a new title, brief context and purpose, an explanation of the insight and its meaning, and a separate Reference section. Operational logs, execution status and troubleshooting fragments are excluded.',
  '概念随后续分段与新增资料一并提炼；本批完成后自动补提历史缺失概念。':'Extract concepts with future segments and new sources. After this batch completes, fill missing historical concepts automatically.',
  '概念云入口已就绪；增量提炼与历史补提接入待后端重新加载，本页不会自行启动新调用。':'The Concept Cloud entry is ready. Incremental extraction and historical catch-up require a backend reload; this page does not start new calls.',
  '只读取 Vault 原始对话，不经过 AI 知识点或 AI 技能；不外网验证、不改写原文。':'Read Vault originals directly, without requiring AI Knowledge or AI Skills. No web verification or rewriting originals.',
  '待处理原文：':'Pending sources: ',' 篇；剩余字符：':' sources; remaining characters: ','；预计分段调用：':'; estimated segment calls: ',
  '历史缺失概念预计分段调用：':'Estimated historical concept calls: ','；本批完成后，五路中最多使用一路补提。':'; after this batch, catch-up uses at most one of the five slots.',
  '概念随现有后续分段一并提炼，不额外增加当次模型调用；本批完成后再仅补历史概念。查看范围不触发调用。':'Concepts share future segment calls. After the batch, catch-up extracts only missing concepts. Viewing this scope makes no model call.',
  '当前后端尚未加载概念存储与增量接入；模板可查看，历史补提尚未启动。':'The running backend has not loaded concept storage and incremental extraction. The template is available; historical catch-up has not started.',
  '返回 Vault 原文查看讨论情境。概念不表示用户已掌握某项技能。':'Return to the Vault original for context. A concept does not establish user skill proficiency.',
  '仅补历史概念，不重跑 AI 知识点或 AI 技能':'Historical concepts only; AI Knowledge and AI Skills are preserved','分段联合分析：知识、关系、分类、技能与概念':'Segment analysis: knowledge, relations, classification, skills and concepts',
  '运行 API 密钥（仅本机，不保存）':'Runtime API key (local only, not saved)',
  '仅六个只读工具。密钥不进入网址、日志或浏览器存储。ChatGPT 添加 MCP 时认证选择 None。':'Six read-only tools only. The key is not placed in URLs, logs or browser storage. Select None for MCP authentication in ChatGPT.',
  '启动 Tunnel':'Start Tunnel',
  '停止 Tunnel':'Stop Tunnel',
  '刷新连接状态':'Refresh connection status',
  'ChatGPT 注册与实际工具调用：尚未验证；不等同于 Tunnel READY。':'ChatGPT registration and actual tool calls: not verified; separate from Tunnel READY.',
  '创建运行密钥：仅 Tunnels Read + Use':'Create runtime key: Tunnels Read + Use only',
  '官方 Tunnel 设置':'Official Tunnel settings',
  '本机独立连接页':'Local connection page',
  '启动中':'Starting',
  '未启动':'Not started',
  '本机连接控制器未运行。请打开“连接Venus私人隧道.cmd”，再刷新状态。':'The local connection controller is not running. Open the Venus private tunnel launcher, then refresh the status.',
  '请先输入运行 API 密钥':'Enter the runtime API key first',
  '连接失败':'Connection failed',
  '知识浏览范围':'Knowledge scope',
  '已存知识总数：':'Total saved knowledge: ',
  '当前范围：':'Current scope: ',
  '全部知识':'All knowledge',
  '全部知识点':'All knowledge points',
  '匹配：':'Matches: ',
  '上一页':'Previous page',
  '下一页':'Next page',
  '<label class="field">知识来源<select id="vault-select" aria-label="知识来源">':'<label class="field">Knowledge source<select id="vault-select" aria-label="Knowledge source">',
  'MCP 连接':'MCP connection',
  '本地只读 HTTP 接口：可用':'Local read-only HTTP interface: available',
  '本地只读 HTTP 接口：本次未确认':'Local read-only HTTP interface: not confirmed in this check',
  '<p>stdio MCP：由连接它的宿主启动；本页未检测进程状态。</p><p>Tunnel 客户端：未核实。平台插件注册：未核实。云端工具调用：未验证。</p><p>本机命令：</p>':'<p>stdio MCP: started by its connecting host; this page has not checked its process state.</p><p>Tunnel client: unverified. Platform plugin registration: unverified. Cloud tool invocation: unverified.</p><p>Local command:</p>',
  '<p>本机配置模板：<code>I:\\Venus\\codex-plugin\\readonly.mcp.json</code></p><p>ChatGPT 连接路径：Plugins → + → Add custom MCP server → Tunnel。需要先配置官方 Tunnel 客户端。</p><p>本地 HTTP 可用不等于远程 MCP 已接通。此入口不会创建凭据、注册插件或开放公网。</p>':'<p>Local configuration template: <code>I:\\Venus\\codex-plugin\\readonly.mcp.json</code></p><p>ChatGPT connection: Plugins → + → Add custom MCP server → Tunnel. Configure the official Tunnel client first.</p><p>Local HTTP availability does not establish a remote MCP connection. This panel does not create credentials, register plugins or expose a public port.</p>',
  '当前分段 ':'Section ',' · 已保存 ':' · Saved ','MD 分段进度':'MD section progress',
  '大标签按归属节点去重计数：白0–2，绿3–9，蓝10–24，紫25–49，橙50–99，金100以上。三倍基础直径，每个连接再增加1%。':'Large labels count unique member nodes: white 0–2, green 3–9, blue 10–24, purple 25–49, orange 50–99, gold 100+. Their diameter starts at three times the base, then grows 1% per connection.',
  '归属连接':'Membership connections','按归属节点去重计数；颜色不代表技能程度。':'Unique member nodes determine the count; color does not indicate proficiency.',
  ' 项归纳中':' items being classified',
  '流程：导入原文 → 分段联合分析（知识提取 / 关系比较 / 主分类归纳 / 技能整合）→ 校验依据并落盘 → 下一段或下一篇。存量主分类随现有调用分批回填。最多五份文件并行，每份内部按段续接，无需逐篇启动。':'Workflow: import → combined section analysis (knowledge / relationships / main domains / skills) → validate evidence and save → next section or file. Existing content receives domain labels in batches within current calls. Up to five files run concurrently, with sequential sections inside each file.',
  '主分类覆盖 ':'Main-domain coverage ','待归纳 ':'Pending classification ','依据不足 ':'Insufficient evidence ',
  '主分类':'Main domains','主分类存量归纳':'Classifying existing domains','显示直径按基础直径乘以（1＋连接数×增长比例），默认每条有效连接增加1%，线性累加。重复关系不重复计数，不使用旧半径上限截断。主分类核心为普通星点基础直径的三倍。':'Diameter = base diameter × (1 + connection count × growth). Default growth is 1% per unique relationship, added linearly. Duplicate relationships do not count twice; the old radius cap is not applied. Main-domain cores have three times the base star diameter.',
  '已保存并安排受影响资料复核；人工正文受到保护，旧版本可回退':'Saved and queued affected sources for review; manual text is protected and prior versions can be restored','编辑已保存，受影响资料等待增量复核':'Edit saved; affected sources queued for incremental review',
  '分析':'Analysis','归纳':'Summary',
  '活动文件':'Active files',
  '原文已入库':'Original saved','分段分析并逐段校验保存':'Analyze, validate and save sections','保存全文归纳并完成':'Save full-source summary and complete','阶段 ':'Stage ','文件阶段进度':'File workflow stages',
  '补充':'Updated','单段分析条数超出约定':'The model returned too many items for one section','等待重试':'Waiting to retry',
  '分段联合分析：知识、关系、分类与技能':'Combined section analysis: knowledge, relationships, classification and skills','本段字符范围：':'Current section character range: ',' 段已保存 · ':' sections saved · ',
  '槽位 ':'Slot ',' 字符已落盘':' characters saved',' 个槽位正在处理 · ':' active slots · ',
  '流程：导入原文 → 分段联合分析（知识提取 / 关系比较 / 分类归纳 / 技能整合）→ 校验依据并落盘 → 下一段或下一篇。主标签专门归纳目前尚未接入，不计为完成阶段。最多五份文件并行，按入库顺序派发；每份内部按段续接，无需逐篇启动。':'Workflow: import → combined section analysis (knowledge / relationships / classification / skills) → validate evidence and save → next section or file. Dedicated main-label grouping is not connected yet. Up to five files run concurrently in import order; sections within each file run sequentially without manual starts.',
  '涉及':'Mentioned','实践':'Practiced','验证':'Verified','用户观点':'User view','助手建议':'Assistant suggestion','已确认决定':'Confirmed decision','有据知识':'Evidenced knowledge','待核对':'Needs review',
  '仅可合并独立的连续 Vault 原文':'Only separate continuing Vault sources can be merged','原始对话 ID 不一致，不能自动合并':'Original conversation IDs differ; automatic merge rejected','来源已变化，请重新核对':'Source changed; review it again','合并后超过单份资料大小上限':'Merged source exceeds the size limit','当前资料未合并':'This source is not merged','内容已变化，请重新核对':'Content changed; review it again','合并正文经人工修改，请先保存修改后再还原':'Merged content was edited; save changes before restoring','内容不存在':'Content not found','派生内容必须包含来源':'Derived content requires sources','原文不能为空':'Source text cannot be empty','单份资料最多 1600 万字符':'Each source is limited to 16 million characters','只能写入知识点或技能':'Only knowledge or skills can be written','需要稳定的字母数字 ID':'A stable alphanumeric ID is required','不能改变内容目录':'The content collection cannot be changed','内容已变化，请重新读取后修订':'Content changed; reload before editing','标题与正文不能为空':'Title and body cannot be empty','不能以自身作为来源':'An item cannot cite itself','技能至少需要一个知识点依据':'A skill requires at least one supporting knowledge item','技能程度须为涉及、实践或验证':'Skill level must be Mentioned, Practiced or Verified','内容已变化，请重新读取':'Content changed; reload it','正文不能为空':'Body cannot be empty','首版关系连接同一网络的不同节点':'Relationships must connect different nodes in the same network','关系类型不存在':'Relationship type not found','需要关系理由':'A relationship reason is required','强度范围为 0–1':'Strength must be between 0 and 1','关系已变化，请重读':'Relationship changed; reload it','需要名称与十六进制颜色':'A name and hexadecimal color are required','关系类型已存在':'Relationship type already exists','任务状态无效':'Invalid task state','尚无关系版本':'No relationship history yet','版本名无效':'Invalid version name','版本不存在':'Version not found','版本不匹配':'Version does not match','布局参数无效':'Invalid layout settings','布局包含无效节点或坐标':'Layout contains invalid nodes or coordinates','内容或分类已变化，请重新读取':'Content or classification changed; reload it','需要资料归纳与 1–16 个有依据标签':'A summary and 1–16 evidenced labels are required','每个标签须包含名称、理由和逐字存在的依据引文':'Each label requires a name, reason and exact supporting quote','分类方式无效':'Invalid classification method','显示参数超出范围':'Display setting out of range','最大半径不能小于基础半径':'Maximum radius cannot be smaller than base radius',
  '自动阅读':'Reading automatically','已完成':'Completed','段':'sections','自动归纳、知识关系与技能整合完成':'Summary, knowledge relationships and skills saved','继续当前文件：已分析':'Continuing this file: analyzed','本文件完成后处理下一份':'Next file starts after this entire file is complete','条待核对说明':'review notes',
  'Vault 原始资料':'Vault sources','知识点':'Knowledge','技能':'Skills','Vault 网络':'Vault network','知识网络':'Knowledge network','技能网络':'Skills network',
  '展开或收起文件列表':'Toggle file list','文件列表':'Files','收起或展开来源侧栏':'Toggle evidence sidebar','连接中':'Connecting','导入资料':'Import','重新加载 Venus 后台':'Restart the Venus service','重启 Venus':'Restart Venus','保存已提交内容并关闭 Venus 后台':'Save submitted content and shut down Venus','关闭 Venus':'Shut down Venus',
  '工作区工具栏':'Workspace tools','收起或展开文件侧栏':'Toggle files sidebar','查找资料':'Find sources','导入 Markdown':'Import Markdown','资料处理进度':'Processing progress','本机资料库':'Local library','内容目录':'Content','工作视图':'Networks','资料处理':'Processing','等待导入第一份资料':'Waiting for the first import','查看自动处理进度':'View processing progress','本机保存 · MD 可追溯':'Saved locally · Traceable Markdown','三个并列资料目录':'Three content collections','本机首版':'Local edition','关闭':'Close','保存':'Save','取消':'Cancel',
  '整队列处理状态':'Queue processing status','正文加载失败':'Could not load content','无法读取本机资料':'Could not read local data','自动处理进度':'Automatic processing','本机已保存':'Saved locally','修订':'Revision','外部图片未自动加载':'External image not loaded automatically','综合能力':'Combined skills','当前单篇资料':'Selected source','Vault / 原始资料':'Vault / Sources','仅展示选定 MD 的提取结果':'Results for the selected Markdown file','份':'items','能力分析':'Skill analysis','Markdown 资料':'Markdown sources','选择原始 MD':'Select source Markdown','个知识点':'knowledge items','查找当前列表…':'Search this list…','查找当前列表':'Search this list','待补充领域':'Domain not specified','已提取':'Extracted',
  '当前类别下暂无内容':'No content in this category','可以选择其他类别或显示全部。':'Select another category or show all.','保存第一份原始资料':'Save your first source','导入 Markdown，或主动保存一段文字。原文将独立保留，知识与能力分析逐步写入。':'Import Markdown or save text. Originals are preserved separately; knowledge and skills are saved incrementally.','等待这份资料的知识提取':'Waiting for source analysis','选定一篇 MD 后，由 Codex 阅读原文、逐条保存知识与依据。这里始终是单篇分析。':'Codex reads each source and saves knowledge with evidence. This view shows one source.','查看 Codex 接入':'View Codex connection','能力从证据中形成':'Skills are grounded in evidence','综合多个知识点，结合实践材料判断能力程度；提及一个概念不等于掌握。':'Combine knowledge and practice evidence to assess skills. Mentioning a concept does not establish proficiency.',
  '长对话分段显示':'Long conversation shown in sections','MD 原文完整保留':'Full original Markdown preserved','上一段':'Previous section','下一段':'Next section','修改并保存历史':'Edit and retain history','编辑':'Edit','原始 Markdown':'Source Markdown','单篇提取':'Source extraction','新增':'New','原文独立保存':'Original preserved separately','项可追溯依据':'traceable evidence items','来源缺失':'Missing source','原文已修改，请复核依据':'Source changed; review evidence','分类与关系':'Categories and relationships','关系类型 · 多选筛选':'Relationship types · Multiple selection','全部显示':'Show all','定义关系类型':'Define relationship type','隐藏只改变视图，关系仍保存在 MD。':'Hiding affects only the view; relationships remain saved in Markdown.','线粗表示强度；选中与连接数大小独立。':'Line width indicates strength; selection does not affect connection-based size.','当前观察中心':'Current focus','建立有依据的关系':'Create an evidenced relationship','点击任意节点将它设为观察中心。':'Click any node to make it the camera focus.','双击节点进入内容。':'Double-click a node to open its content.','查看理由、来源与强度':'View reason, evidence and strength','关系版本与回退':'Relationship history and restore','显示参数 · 可调初值':'Display settings · Adjustable defaults','临时性能试验':'Temporary performance test','全部网络的关系':'Relationships across all networks','来源与依据':'Sources and evidence','内容保存后，在这里沿依据返回原始资料。':'Follow evidence here to the original source.','支撑知识与实践材料':'Supporting knowledge and practice','相关知识 · 当前单篇':'Related knowledge · Selected source','文件信息':'File information','连续资料已合并':'Continuing sources merged','原始来源保留，可从下方逐份查看。':'Original sources are preserved and can be opened below.','还原为独立文件':'Restore separate files','原文 SHA-256':'Original SHA-256','已提取知识':'Extracted knowledge','本条知识的来源':'Evidence for this knowledge','职业与领域':'Occupations and domains','证据不足，待补充':'Insufficient evidence','程度说明':'Level guidance','涉及 → 实践 → 验证':'Mentioned → Practiced → Verified','升级判断需要相应材料支持。':'Advancement requires supporting evidence.','版本历史与回退':'History and restore','已还原独立文件，合并版本仍可追溯':'Separate files restored; merged version remains in history','重要程度表示持续使用与推进，不表示技能掌握程度。':'Importance reflects repeated use and progress, not proficiency.','关系依据':'Relationship evidence','强度':'Strength','是':'Yes','否':'No','纠正这条关系':'Correct this relationship',
  '保存原始资料':'Save a source','选择 MD 文件，或主动保存一段文字。只保存在本机。':'Select Markdown or save text. Stored only on this computer.','读取 Markdown 文件':'Read Markdown file','文件名':'File name','例如：今日导入 第1.md':'For example: notes-1.md','原文':'Original text','将资料粘贴到这里…':'Paste source text here…','已存在相同原文，已打开原文件':'Identical source already exists; opened the existing file','原文已保存，已自动加入分析队列':'Original saved and added to the analysis queue','原版本会保留。保存时检查是否发生并发修改。':'The previous version is preserved. Concurrent changes are checked on save.','正文':'Body','已保存，旧版本可回退':'Saved; previous versions can be restored',
  '流程：导入原文 → 分段联合分析（知识提取 / 关系比较 / 分类归纳 / 技能整合）→ 校验依据并落盘 → 下一段或下一篇。主标签专门归纳目前尚未接入，不计为完成阶段。按入库顺序连续处理，无需逐篇启动。':'Workflow: import → combined analysis of each section (knowledge / relationships / classification / skills) → validate evidence and save → next section or file. Dedicated main-label grouping is not connected yet and is not counted as complete. Processing follows import order without starting each file manually.',
  '篇已完成':'files complete','已读':'Read','段 · 后续按顺序':'sections · Queued','手动暂停':'Manually paused','重试':'Retry','实际失败':'Failed','有核对说明':'With review notes','暂停全部自动处理':'Pause all automatic processing','恢复自动处理':'Resume automatic processing','重试未通过的资料':'Retry failed sources','模型暂不可用，将在':'Model temporarily unavailable; automatic retry after','后自动重试。':'automatically.','最近一次处理问题':'Latest processing issue','状态：':'Status: ','失败':'Failed','排队':'Queued','正在处理':'Processing','已暂停':'Paused','整份分析已完成':'Entire file analysis complete','恢复此文件':'Resume this file','暂停此文件':'Pause this file','待核对说明':'Review notes','分析使用本机已登录的 Codex。每段校验原文引句后保存；没有依据时不强制生成关系或技能。':'Analysis uses Codex signed in locally. Quotes are validated before each section is saved. Relationships or skills are not required without evidence.','已暂停自动处理；已保存进度保留':'Automatic processing paused; saved progress retained','自动处理已启动，将从已保存进度连续接续':'Automatic processing started; continuing from saved progress','用户暂停，可续接':'Paused by user; resumable','已恢复，后台将自动继续':'Resumed; the background worker will continue',
  '版本历史':'Version history','回退会恢复这份快照中的全部网络关系；回退前的当前关系也会保留为新版本。筛选设置不变，节点继续按已知联系柔性调整。':'Restoring replaces all relationships with this snapshot. Current relationships are retained as a new version. Filters remain; nodes continue their floating layout.','回退到此版本':'Restore this version','还没有修改记录。首次修改后会保留原版本。':'No edit history yet. The first edit preserves the original version.','已回退；回退前的版本也已保留':'Restored; the previous version is also preserved','定义新的关系类型':'Define a relationship type','名称':'Name','例如：互为前提':'For example: mutual prerequisites','颜色':'Color','已新增独立多选筛选项':'Added a separately selectable type','当前暂用连接数线性增长半径并限幅。这是实现初值，计数口径、半径或面积规则都未视为最终决定。间距会影响柔性布局的目标距离，参数仍为初值。':'Radius currently grows linearly with connection count, with a cap. These are adjustable defaults. Spacing affects target distances in the floating layout.','基础半径':'Base radius','最大半径':'Maximum radius','每条连接增长比例':'Growth per connection','知识结构间距':'Knowledge spacing','显示参数已保存':'Display settings saved','纠正关系':'Correct relationship','同一网络内连接不同内容，必须说明理由，并引用已保存内容中的原句。':'Connect different items in the same network with a reason and exact quotes from saved sources.','目标':'Target','关系类型':'Relationship type','连接原因简述':'Short connection reason','完整理由':'Full reason','依据内容':'Evidence source','逐字引文':'Exact quotation','结构':'Structure','主导':'Dominant','直接':'Direct','互相关联':'Mutually related','未指定':'Not specified','关系与依据已写入 MD':'Relationship and evidence saved to Markdown',
  '类别标签':'Category labels','多选':'Multiple selection','全部类别':'All categories','待归纳分类':'Unclassified','勾选类别取并集；不删除资料或关系。':'Selected categories are combined; sources and relationships are preserved.','归纳分类':'Classification','依据待复核':'Evidence needs review','已进入后台自动处理队列，归纳完成后会显示分类与依据。':'Queued for automatic processing. Categories and evidence appear after analysis.','查看依据 / 修正标签':'View evidence / Edit labels','归纳并添加标签':'Classify and add labels','移除此标签':'Remove this label','分类理由':'Classification reason','正文中的依据原句':'Exact supporting quote from the body','这是':'These are ','的内容类别标签，与关系类型独立。每个标签都保留分类理由与原句依据。':' content categories, separate from relationship types. Each label retains a reason and exact quote.','内容归纳':'Content summary','添加类别标签':'Add category label','分类接口等待本机服务重新载入，当前归纳内容尚未保存。':'Classification requires the local service to reload. Changes have not been saved.','归纳与类别标签已保存，原文保持完整':'Summary and category labels saved; original preserved',
  '定位任意节点…':'Locate any node…','定位任意节点':'Locate any node','跨 Markdown 文档关系':'Relationships across Markdown sources','跨文档知识点关系':'Knowledge relationships across sources','整合技能之间的关系':'Relationships between combined skills','三维空间 · 依据联系紧密度浮动':'3D space · Floating by relationship affinity','重要程度由低到高':'Importance from low to high','白':'White','绿':'Green','蓝':'Blue','紫':'Purple','橙':'Orange','金':'Gold','单次使用':'One-time use','2 轮跟进':'2 follow-ups','4 轮推进或 3 份对话复用':'4 follow-ups or reused in 3 conversations','跨 2 天且 3 轮':'3 follow-ups across 2 days','跨 3 天且 8 轮':'8 follow-ups across 3 days','跨 5 天且 16 轮，或指定重点项目':'16 follow-ups across 5 days or a designated priority project','查看全图':'Fit all','可环绕缩放的三维网络':'3D network with orbit and zoom','让关系逐步浮现':'Relationships emerge over time','资料与依据保存后，节点会自动出现。':'Nodes appear as sources and evidence are saved.','颜色：使用与持续推进热度　拖动：环绕　滚轮：缩放　点击：观察中心　双击：进入内容　文字随距离缩小、隐藏':'Color: activity · Drag: orbit · Scroll: zoom · Click: focus · Double-click: open · Labels shrink and hide with distance','合成试验节点没有内容页':'Synthetic test nodes have no content page','临时合成数据 · 不保存':'Temporary synthetic data · Not saved','个节点':'nodes','条显示关系':'visible relationships','浮动布局':'Floating layout','相机':'Camera','中心':'Focus','三维视图暂不可用':'3D view unavailable','请使用支持 WebGL 2 的桌面浏览器。':'Use a desktop browser with WebGL 2 support.','三维渲染失败，请检查浏览器图形支持':'3D rendering failed; check browser graphics support','仅在当前视图绘制合成节点与关系，不写入资料目录。结果只代表当前机器与当前布局。':'Synthetic nodes and relationships are drawn in this view only and are not saved. Results apply to this computer and layout.','规模':'Size','试验节点':'Test node','临时合成数据；切换视图退出':'Synthetic test data; switch views to exit','试验数据不会保存，切换视图返回真实资料':'Test data is not saved; switch views to return to real data','开始试验':'Start test','请先保存或关闭正在编辑的内容':'Save or close the current editor first','Venus 已关闭':'Venus is shut down','后台已停止。重新使用时，请运行 Start-Venus.cmd。':'The service has stopped. Run Start-Venus.cmd to use Venus again.','正在重启 Venus…':'Restarting Venus…','未能确认重启成功，请运行 Start-Venus.cmd':'Restart could not be confirmed; run Start-Venus.cmd','本机已连接':'Connected locally','正在重新连接':'Reconnecting','连接失败':'Connection failed',
  '本篇已分析，未提取独立知识点':'Analysis complete; no separate knowledge items extracted','可查看原文；分析没有保存可独立成立的知识点。':'You can read the original; analysis did not save standalone knowledge items.','本篇分析需要核对':'This analysis needs review','处理遇到问题，请在自动处理进度中查看原因。':'Processing encountered a problem. See automatic processing for details.','本篇正在分析':'This source is being analyzed','结果保存后会自动出现在这里，无需再次开始分析。':'Saved results appear here automatically; no need to start again.','本篇尚无已保存的知识点':'No knowledge saved for this source yet','资料将按队列自动分析；可从左侧选择已有提取结果的资料。':'Sources are analyzed automatically in order. Select a source with saved results on the left.',
  '运行状态尚未取得':'Runtime status unavailable','当前资料未知':'Current source unknown','完成与剩余数量未知':'Completed and remaining counts unknown','等待后端状态':'Waiting for service status','自动处理已暂停':'Automatic processing paused','已启动 · 等待自动重试':'Started · Waiting to retry','已启动 · 正在处理':'Started · Processing','已启动 · 当前队列已完成':'Started · Queue complete','已启动 · 等待下一段':'Started · Waiting for next section','当前 MD：':'Current MD: ','当前没有正在处理的 MD':'No MD currently processing','已完成':'Completed','未知':'Unknown','篇 · 剩余':'files · Remaining','篇':'files','知识提取、关系比较、分类归纳与技能整合合并执行；已落盘':'Knowledge extraction, relationship comparison, classification and skills run together; saved','字符':'characters','导入资料已入库；后台按顺序接续分析':'Imported sources saved; analysis continues in order','重试时间：':'Retry at: ','篇处理失败，需核对':'files failed; review needed','篇等待重试':'files waiting to retry','等待运行状态':'Waiting for runtime status','已取消':'Cancelled','等待自动重试':'Waiting to retry','有处理失败的资料，待核对':'Some sources failed; review needed','整队列已完成 · 100%':'Entire queue complete · 100%','等待下一段处理':'Waiting for next section',
  '本机访问限定':'Local access only','跨站写入被拒绝':'Cross-site write rejected','需要 JSON 请求':'JSON request required','请求过大':'Request too large','JSON 格式无效':'Invalid JSON','请通过新版启动入口运行 Venus':'Run Venus using the updated launcher','操作无效':'Invalid action','当前服务未启动自动执行器':'Automatic worker is not running','接口不存在':'Endpoint not found','方法不支持':'Method not supported','页面不存在':'Page not found',
};
Object.assign(translations,{
 '概念再次检查快速通过':'Concept recheck passed without changes','概念本地核验通过':'Concept local integrity check passed','概念再次检查已登记':'Concept recheck registered','保留原有完整核对记录':'Retain an existing complete review record','复用已核对完整分段':'Reuse a verified complete segment',
 '再次检查概念':'Check concepts again','不受资料或概念已处理状态限制；先核验，必要时才提炼。':'Available even after processing. Verify first; extract only when needed.',
 '先比较原文、规则版本与已有结果完整性。未变且完整时直接通过，不重复生成。':'Compare the source, rule version and saved-result completeness first. Unchanged complete content passes without duplicate generation.',
 '源内容、规则和结果未变且完整：快速通过，未调用模型。':'Source, rules and results are unchanged and complete: passed without a model call.',
 '本地完整性核验通过，未调用模型。':'Local integrity check passed without a model call.',
 '现有概念执行器正在运行，未重复建立任务；可在当前核对结束后再次检查。':'The existing concept executor is running. No duplicate task was created; check again after it finishes.',
 '再次检查已登记到原队列；尚未完成，等待原执行器接续。':'Recheck registered in the existing queue; not completed. Waiting for the original executor.',
 '用户跳过，等待决定':'User skipped; awaiting a decision',
 '原因：':'Reason: ',
 '已就绪':'Ready','排队未完成':'Queued; incomplete',
 '记录时间：':'Recorded at: ','本地服务已加载':'Local service loaded','界面与恢复日志更新':'UI and recovery logs updated','资料修改保存':'Source edit saved','原始资料保存':'Original source saved','提炼节点保存':'Derived node saved','独立层请求':'Independent layer request','恢复请求':'Recovery request','队列配置保存':'Queue settings saved','分类保存':'Classification saved','关系保存':'Relationship saved',
 '日志 / 更新日志':'Logs / Updates','仅显示实际记录的事件；未记录的历史不会补造。':'Only recorded events are shown. Unrecorded history is not reconstructed.','日志日期':'Log date','刷新日志':'Refresh logs','正在读取日志…':'Reading logs…','读取更早记录':'Load earlier records','日志读取失败':'Could not read logs','这一天没有已记录的历史。':'No recorded history for this day.',
 '任务回报边界':'Task reporting boundary','失败立即写入本地事件与当前任务记录。其他任务须读取记录；没有主动跨任务推送。':'Failures are written immediately to local events and the current task record. Other tasks must read the record; no cross-task push is sent.',
 '当前步骤：':'Current step: ','已核对落盘：':'Verified and saved: ','最后动作：':'Last action: ','最后更新：':'Last update: ','最后保存：':'Last save: ','未提供':'Not provided',
 '最近恢复请求未启动：':'Latest recovery request did not start: ','待回补异常':'Exceptions awaiting backfill','需要用户决定':'User decision required','等待集中回补':'Awaiting batch backfill','跳过但未完成：':'Skipped and incomplete: ',
 '继续核对':'Continue review','重试失败段':'Retry failed segment','跳过此失败段':'Skip this failed segment','保留原文、断点和缺口；跳过不算内容完整。':'Originals, checkpoints and gaps are preserved. Skipping does not mean complete content.','跳过原因':'Reason for skipping','已记录跳过，仍未完成':'Skip recorded; still incomplete',
 '执行器启动目前受限；此页面不会另行启动。':'Executor startup is currently restricted; this page will not start it through another route.','执行器启动目前受限；没有通过此接口启动任何进程。':'Executor startup is restricted. This endpoint did not start a process.','上次执行未通过校验，已保存断点保留。':'The last run failed validation. Saved checkpoints are preserved.','当前没有执行器，继续会接续已保存断点。':'No executor is running. Continue resumes saved checkpoints.',
 '原文与概念对照':'Compare source and concepts','模型处理':'Model processing','复用本地返回结果':'Reuse a saved local result','校验引用与原文':'Validate references and source evidence','概念实际保存':'Concept saved','补充实际保存':'Supplement saved','本段内容核对已保存':'Segment content review saved','核对完整后跳过':'Skipped after verified completeness','失败段进入异常清单':'Failed segment added to exceptions','未建立无有效节点的关联':'Relation withheld: valid nodes unavailable','本段结果已保存':'Segment result saved','独立任务已排队':'Independent task queued','结果已保存':'Result saved','发生错误':'Error occurred','失败，等待处理':'Failed; awaiting action','内容核对完成':'Content review completed','等待执行器就绪':'Waiting for executor readiness','整篇内容核对完成':'Document content review completed','恢复启动被拦截':'Recovery startup blocked','用户跳过，保留缺口':'User skipped; gap preserved',
 '失败':'Failed','已保存':'Saved','已受理':'Accepted','已跳过，未完成':'Skipped; incomplete','未启动':'Not started','完整，已跳过':'Complete; skipped','实际保存节点数：':'Nodes actually saved: ','原始错误与处置':'Original error and disposition',
 '继续这一层':'Continue this layer','保留断点和已有结果；重试只处理这一层。':'Keep checkpoints and saved results. Retry processes this layer only.','暂时跳过这一层':'Skip this layer for now','跳过不增加完成进度，稍后可从原断点继续。':'Skipping does not increase completion. Resume from the same checkpoint later.','跳过必须填写原因':'Provide a reason for skipping',
 'AI 连接入口':'AI connections',
 '已完成分段 ':'Completed segment ','后续分段 ':'Next segment ',
 '排队中':'Queued','已排队':'Queued',
 '已处理':'Processed','状态未知，显示上次结果':'State unknown; showing the previous result',
 '关闭请求已接受，等待后台退出':'Shutdown request accepted; waiting for the service to exit','后台连接已断开':'Backend connection is disconnected','重新使用时，请运行 Start-Venus.cmd。':'Run Start-Venus.cmd to use Venus again.',
  '当前筛选没有匹配节点或关系':'No nodes or relationships match this selection','来源与日期（可选）':'Source and date (optional)','资料原始日期':'Original source date','来源标识':'Source reference','来源版本':'Source version',
  '大标签颜色按归属连接数变化；中心体积最多为普通基准节点的10倍，半径最多约2.154倍。自动自转关闭，局部公转保留。':'Main-tag colours follow membership counts. Centre volume is capped at ten base nodes (radius about 2.154x). Axial spin is off; local orbits continue.',
  '连接增长保留；中心体积不超过普通基准节点10倍。三维轨道预留实体净空，自动自转为0，公转继续。':'Connection growth remains within the ten-base-node centre volume cap. 3D orbital volumes reserve clearance. Axial spin is zero; orbital motion continues.',
  '关系依据':'Relationship evidence',
  '标题':'Title','Markdown 正文':'Markdown body','未保存':'Unsaved','已保存':'Saved','保存中…':'Saving…','有新的未保存修改':'New unsaved changes','保存失败，草稿已保留':'Save failed; draft retained',
  '已保存，原版本保留；仅复核受影响资料':'Saved with version history; only affected sources are reviewed',
  '沿真实连接前往':'Follow existing connections','箭头表示导航去向，不改变关系方向。':'Arrows indicate navigation only; relationship direction is unchanged.','从 ':'From ',' 查看 ':' view ','正在读取正文…':'Loading body…','打开完整内容与编辑器':'Open full content and editor',
  '当前分析继续使用原有接入。其他模型可单独配置，保存不会切换在途请求。':'Current analysis keeps its existing provider. Saving another configuration does not switch in-flight requests.',
  '模型与本地 AI 接入':'Model and local AI connections','仅保存下次后台启动使用的配置，不切换或终止当前分析。本地模式只连接回环地址，不会自动发送到云端。':'Save settings for the next backend start. Current analysis is unchanged. Local mode uses loopback endpoints and never falls back to the cloud.',
  '当前：':'Current: ','模型未显式指定':'Model not explicitly selected','推理强度未显式指定':'Reasoning effort not explicitly selected','接入方式':'Provider','结构化输出':'Structured output',
  '。这里不会测试连接或调用模型。原文会分段完整处理，不会静默截断。':'. This form does not call or test models. Every source section is processed without silent truncation.',
  '配置已保存，仅下次后台启动生效；当前分析保持原接入':'Saved for the next backend start; current analysis keeps its existing provider',
  '模型名':'Model name','服务基础地址（本地只允许 localhost / 127.0.0.1 / ::1）':'Service base URL (local mode: loopback only)','密钥环境变量名（不填写密钥本身）':'API-key environment variable name (never the key itself)','推理强度（留空使用模型默认）':'Reasoning effort (blank uses the model default)',
  '每段原文字符':'Source characters per section','总输入字符预算':'Total input character budget','输出 token 上限':'Output token limit','每轮关联候选上限':'Candidate limit per section','候选摘录字符上限':'Characters per candidate excerpt','每轮分类补全候选上限':'Classification candidates per section',
});
Object.assign(translations,{
 '暂停动画':'Pause animation','继续动画':'Resume animation','资料处理进度':'Source processing','Vault 搜索索引':'Vault search index','尚未处理':'Not processed','开始这一层':'Start this layer','从断点重试':'Retry from checkpoint','按资料单独处理':'Process one source','选择资料':'Select a source',
 '正在读取四层独立进度…':'Loading four independent progress records…','四层处理入口将在安全加载新版后台后可用。':'Independent layer controls will be available after the updated backend is safely loaded.',
 '已处理 · 内容待核对':'Processed · content review pending','已对照原文核对概念内容':'Concept content compared with the source','提取覆盖不等于概念内容完整':'Extraction coverage is not proof of complete concept content',
 '仅使用已保存的有据知识点；缺少知识依据时先启动知识层，不自动重跑知识层。':'Uses saved knowledge only. Start the knowledge layer first when evidence is missing; other layers are not rerun.',
 '只读原始 Vault，独立于知识和技能。已处理覆盖不等于概念内容完整。':'Reads the original Vault independently of knowledge and skills. Processed coverage does not prove content completeness.',
 '开始检测':'Start checking','正在检查本机连接…':'Checking local connections…','模型接入配置':'Model connection settings','MCP 只读知识连接':'MCP read-only knowledge connection','仅用于接下来新建的独立任务':'Use only for new independent tasks','已用于新任务；当前处理保持原接入':'Selected for new tasks; current processing keeps its provider',
 '点击开始后，仅检查本机兼容客户端、已有配置和指定本地服务，不调用模型、不切换当前分析。':'Start checks compatible local clients, existing settings, and specific local services. No model call or provider switch.',
 '网页登录不等于本机模型 API。MCP 用于只读知识检索，不能代替模型推理连接。':'A web session is not a local model API. MCP retrieves knowledge and does not replace a model connection.',
 '当前分析继续使用原接入。新增登录、凭证和授权由你完成，不会自动启用公网连接。':'Current analysis keeps its provider. You complete any new sign-in or credential setup; no public connection is enabled automatically.'
});
Object.assign(translations,{
 '人工智能':'Artificial intelligence','项目':'Projects','子分类':'Subcategories','份原始资料':'original sources','同一项目范围（按分支标题归组）':'Shared project scope (grouped by branch titles)',
 '独立任务正在处理':'Independent task running','历史认可方式':'Historical recognition','明确认可':'Explicit endorsement','隐含认可':'Implicit acceptance','话题结束':'Topic ended','不构成操作授权':'Does not authorize operations','条件不同':'Different premises','冲突':'Conflicting directions','演进':'Evolution',
 '四层提取未启用；归纳分类和项目归属的真实进度请查看资料处理。':'Independent layer extraction is disabled. See processing for the actual classification and project assignment progress.',
 '当前后台尚未加载四层处理入口；已保存成果保留，请在安全加载新版后台后使用。':'The backend has not loaded independent-layer controls yet. Saved work is retained; use this after a safe backend reload.',
 '现有概念内容核对正在运行，概念补提将等候它，避免重复处理。':'Existing concept review is running. Additional concept extraction waits to avoid duplicate processing.',
 '索引已建立，可搜索':'Search index built','这一层已有保存结果':'This layer has saved results','这一层已排队，将保留断点接续':'This layer is queued and will continue from its checkpoint',
 '安装或打开 Claude 本机客户端，并由你完成登录。':'Install or open the local Claude client and complete sign-in yourself.',
 '若使用模型 API，在“模型接入配置”填写兼容服务地址、模型名与已由你设置的密钥环境变量名；不在页面填写密钥。':'For a model API, configure the compatible endpoint, model, and name of an existing key environment variable. Never enter the key on this page.',
 '安装或打开 Gemini 本机客户端，并由你完成登录。':'Install or open the local Gemini client and complete sign-in yourself.',
 '若使用 Gemini API，由你设置密钥环境变量，再在“模型接入配置”选择 Gemini 接入并填写模型名。':'For the Gemini API, set the key environment variable yourself, then select Gemini and enter its model in connection settings.',
 '安装 Codex 本机客户端并完成登录。':'Install the local Codex client and complete sign-in.',
 '本入口只读取登录状态，不会打开授权流程或切换现有分析。':'This reads sign-in status only. It does not start authorization or switch current analysis.',
 '启动本机 Ollama、LM Studio 或已配置的兼容模型服务。':'Start local Ollama, LM Studio, or an existing compatible model service.',
 '在本机服务中加载模型；本入口仅定点检查配置地址及 127.0.0.1:11434、127.0.0.1:1234。':'Load a model locally. Checks are limited to the configured endpoint and 127.0.0.1:11434 or 127.0.0.1:1234.',
 '请先在对应 AI 入口开始检测并确认可用连接':'Start checking in the corresponding AI entry to confirm an available connection first',
 '尚未发现可直接复用的模型连接':'No reusable model connection found yet','已有模型连接可复用；本次未调用模型':'An existing model connection can be reused; no model call was made',
 '已发现本机客户端，尚未确认登录':'Local client found; sign-in is not confirmed','已发现本机客户端；网页或客户端登录不等于可用的模型 API，需配置兼容连接':'Local client found. Web or client sign-in does not establish a callable model API; configure a compatible connection.',
 '已有本地模型服务可复用；未调用推理':'An existing local model service can be reused; inference was not called','已发现本地服务，请先加载模型':'Local service found; load a model first','未发现上述定点地址的可用模型服务':'No available model service found at the specified local endpoints',
 '当前连接入口尚未就绪':'This connection entry is not ready','原始资料不存在':'Original source not found','资料处理层无效':'Invalid processing layer',
 '提取覆盖已完成；内容完整性核对仍由现有核对任务独立继续。':'Extraction coverage is complete; the existing content-completeness review continues independently.',
 '该资料尚无可用知识依据。请先启动 AI 知识点层；不会替你重跑其他层。':'No usable knowledge evidence exists for this source. Start its knowledge layer first; other layers will not be rerun.',
 '来源已变化，请重新核对断点后启动':'The source changed. Review its checkpoint before starting again','来源已变化，本段未提交':'The source changed; this section was not committed','独立层任务返回了其他层内容，未保存':'An independent task returned another layer; nothing was saved',
 '当前后台尚未加载 AI 连接入口':'The backend has not loaded AI connection entries yet','尚未加载模型':'No loaded model','未知 AI 入口':'Unknown AI entry'
});
Object.assign(translations,{
 '正在执行，等待实际结果…':'Running; waiting for the actual result…','操作已返回，请查看实际结果':'Operation returned; see the actual result','失败：':'Failed: ',
 '请求已接受，等待实际状态':'Request accepted; waiting for actual state','已排队，尚未完成':'Queued; not completed','请求已返回，状态已确认':'Request returned; state confirmed',
 '已保存完成数':'Saved completion count','当前文件：':'Current file: ','已落盘：':'Saved: ','当前分段：':'Current segment: ','后续起点：':'Next offset: ',
 '本段范围尚未提供':'Current range not provided','已核实完成：':'Verified complete: ','最后保存时间：未提供':'Last save time: not provided','状态读取：':'State read: ',
 '尚未取得':'Not available','最近落盘推进（本页面观察）：':'Last saved progress observed on this page: ','本页面尚未观察到新增落盘进度':'No new saved progress observed on this page',
 '失败，已停止':'Failed; stopped','独立任务排队中':'Independent tasks queued','独立任务失败，需核对':'Independent task failed; needs review','当前队列已完成':'Current queue completed',
 '联合提取队列':'Joint extraction queue','失败，需核对':'Failed; needs review','已保存覆盖':'Saved coverage',
 '状态读取失败；保留上次显示，不能确认新的进度':'State read failed; showing the previous state. New progress is unconfirmed.',
 '本地 AI':'Local AI','连接':'Connection',
 '白色':'White','绿色':'Green','蓝色':'Blue','紫色':'Purple','橙色':'Orange','金色':'Gold',
 '多轮跟进':'Multiple follow-ups','反复推进':'Repeated progress','跨天持续':'Continued across days','持续投入':'Sustained effort','长期重点':'Long-term priority',
 '内容相关':'Related content','逻辑相同':'Same logic','逻辑相连':'Logical connection','步骤相连':'Sequential steps','程序相连':'Procedural connection','主分类归属':'Main-domain membership','共用知识依据':'Shared knowledge evidence','观点冲突':'Conflicting views',
 '概念内容核对正在处理':'Concept content review running','概念内容核对需复核':'Concept content review needs attention','概念内容核对已暂停':'Concept content review paused',
 '独立连接配置':'Independent connection settings','此配置仅属于当前入口，不改变正在处理资料的模型。由你完成新增登录或密钥授权；这里只填写环境变量名。':'These settings belong only to this entry and do not change the model processing existing sources. Complete new sign-in or authorization yourself; enter only environment variable names here.',
 '独立连接已保存；当前处理保持原接入':'Independent connection saved; current processing keeps its provider','服务基础地址':'Service base URL','HTTP / OpenAI 兼容':'HTTP / OpenAI-compatible','本地 AI / OpenAI 兼容':'Local AI / OpenAI-compatible',
 '该入口的接入方式不匹配':'The provider does not match this connection entry','这份资料正在联合处理，请在当前分段保存后再启动独立补层。':'This source is being processed jointly. Start an independent layer after the current section is saved.',
 '已配置，尚未验证连接':'Configured; connection not tested','未配置：':'Not configured: ','只读知识检索，不能代替模型推理连接':'Read-only knowledge retrieval; does not replace model inference','只读知识检索':'Read-only knowledge retrieval'
});
const keys = Object.keys(translations).sort((a,b)=>b.length-a.length);
const pattern = new RegExp(keys.map(key=>key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'g');
Object.assign(translations,{
 '内容核对':'Content review','覆盖回补':'Coverage backfill','自动提取':'Automatic extraction','独立处理':'Independent processing',
 '异常分段自动回补中':'Backfilling exception ranges','审批或认证阻塞，未运行':'Approval or authentication blocked; not running',
 '执行器已停止，保留断点':'Executor stopped; checkpoint preserved','当前没有活动执行器，保留已保存断点。':'No active executor; saved checkpoint preserved.',
 '概念覆盖回补正在处理':'Concept coverage backfill running','主分类归纳中':'Classifying main categories',
 '覆盖回补 / 自动提取':'Coverage backfill / automatic extraction','覆盖回补 / 自动提取未运行':'Coverage backfill / automatic extraction not running',
 '自动处理已关闭；不代表内容核对停止。':'Automatic extraction is disabled; content review is independent.',
 '原提取队列已处理':'Original extraction queue processed',' 项活动流程':' active flows','异常后移，继续队列':'Exceptions deferred; queue continues',
 '保留未完成缺口':'Unresolved gaps preserved','其他流程状态':'Other flow states','最近保存动作：':'Last saved action: ',
 '查看原因与进度':'View reason and progress','历史概念覆盖回补':'Historical concept coverage backfill',
 '自动恢复正在接续':'Automatic recovery continuing','审批或认证阻塞':'Approval or authentication blocked',
 '用户跳过后已暂停；缺口保留，尚未完成。':'Paused after a user skip; the gap remains incomplete.',
 '审批或认证阻塞，须先解决权限；保留断点且不自动越过。':'Approval or authentication is blocked. Resolve access first; checkpoint preserved without automatic bypass.',
 '执行器已停止，保留断点。':'Executor stopped; checkpoint preserved.'
});
Object.assign(translations,{
 'Token：采集器待自然加载':'Tokens: collector awaiting natural reload','当前调用保持运行；采集前历史不回填。':'Current calls continue; pre-collection history is not reconstructed.',
 'Token：暂未返回用量':'Tokens: usage not yet returned','尚无已采集回执；不表示零消耗。':'No usage receipt recorded; this does not mean zero consumption.',
 '累计已返回 Token：':'Recorded tokens: ',' 份总量回执':' total-usage receipts','Token：暂未返回总量':'Tokens: total usage not yet returned',
 '仅累计采集启用后已返回的回执；缓存是输入子集，不重复相加。':'Counts only receipts returned since collection began. Cached input is a subset of input, never added twice.',
 '暂未返回':'Not yet returned','输入 / 输出 / 缓存输入子集：':'Input / output / cached input subset: ',
 '已返回 / 待回执 / 无用量回执：':'Returned / awaiting receipt / usage unavailable: ','已中断，消耗未知：':'Interrupted; consumption unknown: ',
 '字段回执数（输入/输出/缓存/总量）：':'Receipts per field (input/output/cache/total): ',
 '最近请求平均输出 token/秒：':'Latest request average output tokens/s: ',
 '此提供方输出不含单列思考 token。':'This provider reports thought tokens separately from output.',
 '输出按提供方口径；思考 token 为输出子集。':'Provider-defined output; reasoning tokens are a subset of output.',
 'token/秒：暂未返回，未估算。':'Tokens/s: unavailable; no estimate.',
 '模型名来自配置；回执未确认时不声称已解析型号。':'Model name comes from configuration until confirmed by the provider.',
 '无用量数据；未接入或尚未返回回执。':'No usage data; not connected or no receipt returned.',
 '采集启用：':'Collection enabled: ',
 '结束回执速率为单个请求端到端平均值，包含排队和传输；不相加为并发吞吐，不作实时速率。':'Terminal-receipt speed is the end-to-end average for one request, including waiting and transfer. Per-request rates are not added as concurrent throughput or presented as live speed.'
});
Object.assign(translations,{
'重复语义复核已取消':'Repeated semantic review cancelled',
'只处理新增、变化或覆盖缺口；不复审已保存内容':'Only new, changed or uncovered ranges are extracted; saved content is not re-reviewed.',
'仅本地检查源指纹与覆盖；无缺口不调用模型。':'Checks local source fingerprints and coverage only; no model call without gaps.',
'源指纹和覆盖未变，无缺口：本地跳过，未调用模型。':'Source fingerprint and coverage are unchanged with no gaps: skipped locally without a model call.',
'仅覆盖缺口已登记到现有概念层；尚未完成。':'Only coverage gaps entered the existing concept layer; not yet completed.',
'只检查本地源指纹与提取覆盖。已处理且无缺口时跳过；仅缺失、新增或变化范围进入提取，不语义复审。':'Checks local source fingerprints and extraction coverage only. Processed ranges with no gaps are skipped; only missing, new or changed ranges are extracted. No semantic re-review.',
'用户已取消重复语义复核；原有结果和断点保留。':'User cancelled repeated semantic review; saved results and checkpoints are preserved.'
});
Object.assign(translations,{'最近请求均速：':'Latest request average: ','均速：暂未返回':'Average speed: not yet returned'});
Object.assign(translations,{'概念模板读取失败':'Could not read the concept template','概念范围读取失败':'Could not read the concept scope','讨论假设':'Discussion hypothesis','旧记录保留，未标注用户认可；仅供参考，不覆盖当前指示。':'Legacy record retained without a user-endorsement label; reference only, never overriding current instructions.'});
Object.assign(translations,{'开始／断点继续':'Start / resume checkpoints','完全暂停任务':'Pause all tasks','任务已启用，按保存断点继续':'Tasks enabled; continuing saved checkpoints','正在暂停，等待当前请求退出':'Pausing; waiting for active requests to exit','任务已完全暂停，已保存断点保留':'All tasks paused; saved checkpoints retained','任务未启用，已保存断点保留':'Tasks stopped; saved checkpoints retained','任务控制将在后台下次正常启动后可用':'Task controls will be available after the next normal backend start','独立执行器仍在退出，尚未完全暂停':'An external executor is still active; full pause is not confirmed','任务已全局暂停，请使用开始／断点继续':'All tasks are paused; use Start / resume checkpoints','任务仍在退出，请等待暂停完成后继续':'Tasks are still exiting; wait before resuming','任务控制操作无效':'Invalid task control action'});
export function tr(value) {
  if(language==='en'&&Object.hasOwn(workspaceTranslations,value))return workspaceTranslations[value];
  if(language !== 'en' || typeof value !== 'string') return value;
  if(Object.hasOwn(translations,value))return translations[value];
  return value.replace(pattern, key=>translations[key]);
}
export function heatText(heat) {
  const reason=language==='en'&&heat.basis==='source-activity'
    ? `${heat.userTurns} user follow-ups, ${heat.activeDays} discussion dates, ${heat.sourceConversations} source conversations; scored from cited messages, not word count or keyword frequency.`
    : heat.reason;
  return {name:tr(heat.name),label:tr(heat.label),reason};
}