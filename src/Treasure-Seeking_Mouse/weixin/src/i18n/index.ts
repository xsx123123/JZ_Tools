// 轻量 i18n 内核：字典 + t() 取词/插值 + 工具名/桌宠台词/示例池的中英文案表。
// 不引第三方库；语言偏好写 wx storage，React 侧由 provider.tsx 提供响应式 t()。
// 【小程序适配】网页版存储→wx.getStorageSync、网页版语言探测→wx.getSystemInfoSync、
//              网页版文档语言/标题→wx.setNavigationBarTitle
import Taro from "@tarojs/taro";
import { zh } from "./locales/zh";
import { en } from "./locales/en";

export type Lang = "zh" | "en";
export type MessageKey = keyof typeof zh;

const DICTS: Record<Lang, Record<string, string>> = { zh, en };

const KEY_LANG = "seqout-lang";

/** 按系统/宿主语言猜测默认语言（中文环境→zh，其余→en） */
function detectDefaultLang(): Lang {
  try {
    const info = Taro.getSystemInfoSync();
    // Taro 的 language 字段形如 "zh_CN" / "en"
    const lang = info?.language ?? "";
    return /^zh/i.test(lang) ? "zh" : "en";
  } catch {
    return "zh";
  }
}

/**
 * 当前语言：
 *   1) wx storage 已存偏好（用户在界面上的切换）
 *   2) 系统/宿主语言（中文环境→zh，其余→en）
 * 注：小程序无 URL 参数通道，网页版的 ?lang= 强制覆盖在此不适用。
 */
export function readLang(): Lang {
  try {
    const v = Taro.getStorageSync(KEY_LANG);
    if (v === "zh" || v === "en") return v;
  } catch {
    /* ignore */
  }
  return detectDefaultLang();
}

export function writeLang(l: Lang): void {
  try {
    Taro.setStorageSync(KEY_LANG, l);
  } catch {
    /* ignore */
  }
}

/** 同步导航栏标题（小程序的「文档标题」） */
export function applyLang(l: Lang): void {
  try {
    Taro.setNavigationBarTitle({ title: l === "zh" ? "GEO寻宝鼠" : "GeoMuse" });
  } catch {
    /* ignore */
  }
}

/**
 * 取词并插值：占位符写法 `{name}`。
 * 目标语言缺失该键时回退中文；中文也缺失则原样返回 key（便于发现遗漏）。
 */
export function translate(lang: Lang, key: MessageKey, params?: Record<string, string | number>): string {
  const raw = DICTS[lang][key] ?? zh[key] ?? key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, name: string) =>
    params[name] === undefined ? `{${name}}` : String(params[name]),
  );
}

/** 便捷取词器：预先绑定语言 */
export function createT(lang: Lang) {
  return (key: MessageKey, params?: Record<string, string | number>): string => translate(lang, key, params);
}
export type TFunc = ReturnType<typeof createT>;

/* ---------- seqout 工具名 → 展示标签（后端已下发中文 label，英文界面在此覆盖为英文） ---------- */

const TOOL_LABELS_ZH: Record<string, string> = {
  seqout_search: "跨库搜索组学项目",
  seqout_search_geo: "搜索 GEO 数据集",
  seqout_search_sra: "搜索 SRA 记录",
  seqout_search_structured: "结构化条件搜索",
  seqout_get_project_detail: "查询项目详情",
  seqout_get_project_metadata: "查询项目元数据",
  seqout_get_project_citation: "查询项目引用",
  seqout_get_project_enriched: "查询增强元数据",
  seqout_get_experiments: "查询实验列表",
  seqout_get_runs: "查询测序运行",
  seqout_get_run_download: "查询运行下载链接",
  seqout_get_download_links: "获取批量下载链接",
  seqout_get_metadata_csv: "获取元数据 CSV",
  seqout_get_sample_metadata: "查询样本元数据",
  seqout_get_sample_detail: "查询样本详情",
  seqout_get_sample_manifest: "查询样本清单",
  seqout_resolve_accession: "反查编号归属",
  seqout_resolve_prj: "解析 BioProject",
  seqout_get_ontology_term: "查询本体论术语",
  seqout_get_organisms: "查询支持物种",
  seqout_get_common_name: "查询物种常用名",
  seqout_get_stats_growth: "查询增长统计",
  seqout_get_organism_totals: "查询物种总量",
  seqout_get_platform_totals: "查询平台总量",
  seqout_beacon_info: "查询 Beacon 信息",
  seqout_beacon_runs: "查询 Beacon 运行",
};

const TOOL_LABELS_EN: Record<string, string> = {
  seqout_search: "Cross-database search",
  seqout_search_geo: "Search GEO datasets",
  seqout_search_sra: "Search SRA records",
  seqout_search_structured: "Structured search",
  seqout_get_project_detail: "Project details",
  seqout_get_project_metadata: "Project metadata",
  seqout_get_project_citation: "Project citation",
  seqout_get_project_enriched: "Enriched metadata",
  seqout_get_experiments: "Experiments list",
  seqout_get_runs: "Sequencing runs",
  seqout_get_run_download: "Run download links",
  seqout_get_download_links: "Bulk download links",
  seqout_get_metadata_csv: "Metadata CSV",
  seqout_get_sample_metadata: "Sample metadata",
  seqout_get_sample_detail: "Sample details",
  seqout_get_sample_manifest: "Sample manifest",
  seqout_resolve_accession: "Resolve accession",
  seqout_resolve_prj: "Resolve BioProject",
  seqout_get_ontology_term: "Ontology term",
  seqout_get_organisms: "Supported organisms",
  seqout_get_common_name: "Common name",
  seqout_get_stats_growth: "Growth stats",
  seqout_get_organism_totals: "Organism totals",
  seqout_get_platform_totals: "Platform totals",
  seqout_beacon_info: "Beacon info",
  seqout_beacon_runs: "Beacon runs",
};

const TOOL_LABELS: Record<Lang, Record<string, string>> = { zh: TOOL_LABELS_ZH, en: TOOL_LABELS_EN };

/** 工具名 → 展示标签；服务端 label 作为未知工具的兜底 */
export function toolLabel(lang: Lang, name: string, fallback?: string): string {
  return TOOL_LABELS[lang][name] ?? fallback ?? name;
}

/* ---------- 桌宠台词（按语言分组，随机 pick） ---------- */

export interface PetLines {
  idle: string[];
  dig: string[];
  poke: string[];
  spin: string[];
  miss: string[];
  walk: string[];
  treasureEmpty: string;
  treasureStash: (n: number) => string;
}

const PET_LINES: Record<Lang, PetLines> = {
  zh: {
    idle: ["这片土里有单细胞的味道…", "今天也来挖 GSE 吧！", "嗅到了高分文献的气息", "我的铲子呢…哦在背包里", "宝藏藏在第三铲之后"],
    dig: ["挖挖挖…", "GEO? SRA?", "这块土有点硬", "快出来了快出来了", "阿寻挖矿中，请勿投喂"],
    poke: ["吱!", "别戳啦~", "背包里掉出一张 GSM 卡片", "给你看我的宝贝收藏", "再戳就咬你哦（轻轻）"],
    spin: ["转圈圈！宝藏多多！", "被爱了吱吱吱", "嘿嘿，痒"],
    miss: ["唉，只有石头…", "这铲土是空的", "一定是姿势不对，再试一次!"],
    walk: ["去那边看看…", "闻着 RNA 的味儿就去了", "散步消食，顺便探矿"],
    treasureEmpty: "宝藏还在路上，别急~",
    treasureStash: (n) => `本鼠已囤 ${n} 份宝藏，富甲一方！`,
  },
  en: {
    idle: ["I smell single cells in this soil…", "Let's dig up a GSE today!", "I sense a high-impact paper", "Where's my shovel… oh, in the pack", "Treasure lies past the third dig"],
    dig: ["Dig, dig, dig…", "GEO? SRA?", "This soil's a bit hard", "Almost out, almost out", "Muse is digging — do not feed"],
    poke: ["Squeak!", "Don't poke me~", "A GSM card fell out of my pack", "Wanna see my collection?", "Poke again and I'll bite (gently)"],
    spin: ["Spinning! So much treasure!", "Loved it, squeak squeak", "Hehe, that tickles"],
    miss: ["Sigh, just rocks…", "This scoop was empty", "Wrong angle — one more try!"],
    walk: ["Let's check over there…", "Followed the scent of RNA", "A stroll and a little prospecting"],
    treasureEmpty: "Treasure's on its way, hang tight~",
    treasureStash: (n) => `I've stashed ${n} treasures — rich beyond measure!`,
  },
};

export function petLines(lang: Lang): PetLines {
  return PET_LINES[lang];
}

/* ---------- 空态示例提问（按语言分组） ---------- */

export interface ExampleGroup {
  label: string;
  caption: string;
  /** 示例池：每次空态随机抽 show 条展示 */
  items: string[];
  /** 每组最多展示条数 */
  show: number;
}

const EXAMPLE_GROUPS: Record<Lang, ExampleGroup[]> = {
  zh: [
    {
      label: "探矿定位",
      caption: "按课题方向找 GEO / SRA 收录的矿脉",
      show: 3,
      items: [
        "帮我搜索小鼠肝再生相关的 GEO 数据集",
        "查找人单细胞 RNA-seq 的肿瘤微环境研究",
        "搜索近三年的果蝇神经发育高通量测序数据",
        "找一下斑马鱼胚胎发育的 RNA-seq 数据",
        "帮我找小鼠免疫细胞的 scRNA-seq 数据集",
        "检索大肠杆菌转录组芯片数据",
        "找水稻干旱胁迫的转录组数据",
        "帮我搜阿尔茨海默病相关的人脑 RNA-seq",
        "找小鼠脂肪组织的Bulk RNA-seq数据集",
        "查一下拟南芥激素处理的微阵列数据",
        "帮我找乙肝病毒感染相关的肝细胞数据",
        "搜索酵母应激反应的高通量测序数据",
      ],
    },
    {
      label: "验宝鉴宝",
      caption: "GSE / GSM / PRJ 编号反查来龙去脉",
      show: 2,
      items: [
        "GSE299340 是什么研究？有哪些样本？",
        "GSM8765432 这个样本属于哪个项目？",
        "PRJNA732811 对应哪个研究？",
        "GSE151530 的实验设计是什么样的？",
        "帮我反查 GSM4581240 属于哪个数据集",
        "SRR21857241 是哪个项目的测序记录？",
      ],
    },
    {
      label: "清点矿藏",
      caption: "样本量、平台与分组概览",
      show: 1,
      items: [
        "统计 GSE136831 里有多少个样本",
        "GSE136831 用的什么测序平台？",
        "列出 GSE47062 的样本清单",
        "GSE282210 的实验分组是怎样的？",
        "统计当前数据库的增长情况",
        "查一下数据库里小鼠的实验总数",
      ],
    },
  ],
  en: [
    {
      label: "Locate the lode",
      caption: "Find GEO / SRA deposits by research topic",
      show: 3,
      items: [
        "Search GEO datasets related to mouse liver regeneration",
        "Find human single-cell RNA-seq studies of the tumor microenvironment",
        "Search droplet-based sequencing of Drosophila neurodevelopment from the last three years",
        "Find RNA-seq data on zebrafish embryonic development",
        "Find scRNA-seq datasets of mouse immune cells",
        "Search transcriptome microarray data for E. coli",
        "Find transcriptome data on drought stress in rice",
        "Search human brain RNA-seq related to Alzheimer's disease",
        "Find bulk RNA-seq datasets of mouse adipose tissue",
        "Look up microarray data on hormone-treated Arabidopsis",
        "Find hepatocyte data related to hepatitis B virus infection",
        "Search high-throughput sequencing data on yeast stress response",
      ],
    },
    {
      label: "Assay the find",
      caption: "Trace GSE / GSM / PRJ accessions back to their source",
      show: 2,
      items: [
        "What study is GSE299340? What samples does it have?",
        "Which project does sample GSM8765432 belong to?",
        "Which study does PRJNA732811 correspond to?",
        "What does the experimental design of GSE151530 look like?",
        "Trace which dataset GSM4581240 belongs to",
        "Which project's run is SRR21857241?",
      ],
    },
    {
      label: "Count the cache",
      caption: "Sample counts, platforms and group overview",
      show: 1,
      items: [
        "How many samples are in GSE136831?",
        "Which sequencing platform does GSE136831 use?",
        "List the sample manifest of GSE47062",
        "What are the experimental groups in GSE282210?",
        "Show the current growth of the database",
        "Check the total number of mouse experiments in the database",
      ],
    },
  ],
};

export function exampleGroups(lang: Lang): ExampleGroup[] {
  return EXAMPLE_GROUPS[lang];
}
