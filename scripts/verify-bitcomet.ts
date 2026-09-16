/**
 * BitComet 接入校验脚本（开发用，不参与打包）。
 *
 * 三段，各自独立：
 *
 * 1. 归一自检 —— 拿钉在脚本里的 2.20 真机样本跑字段归一，纯离线，无依赖。
 *
 * 2. 离线段 —— 解析本机的 Downloads.xml，打印识别出的任务。不需要开远程下载。
 *      npm run verify:bc
 *      BC_XML="C:\Users\<you>\AppData\Roaming\BitComet\Downloads.xml" npm run verify:bc
 *
 * 3. 联网段 —— 走完整登录握手，把各接口的原始响应打出来。接口没有官方文档，
 *    字段名在版本间会变（2.20 是 infohash，早期是 info_hash），所以要对着真机确认。
 *      BC_URL=http://127.0.0.1:1235 BC_PASS=你的密码 npm run verify:bc
 *      BC_URL=... BC_USER=admin BC_PASS=... BC_RAW=1 npm run verify:bc   # 打完整响应体
 */
import { randomUUID } from 'crypto'
import { existsSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { Agent, request } from 'undici'
import {
  ENDPOINTS,
  encryptCredential,
  mergeTask,
  normalizeSummary,
  normalizeTask,
  parseDownloadsXml,
  versionTooOld,
  type Json
} from '../src/main/bitcomet-proto'

const agent = new Agent({ connectTimeout: 3000, headersTimeout: 5000, bodyTimeout: 15000 })
const RAW = !!process.env.BC_RAW

function head(title: string): void {
  console.log(`\n${'─'.repeat(64)}\n${title}\n${'─'.repeat(64)}`)
}

function fmtBytes(n: number): string {
  if (!n) return '0'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let v = n
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(i === 0 ? 0 : 1)}${u[i]}`
}

// ------------------------------------------------------------- 字段归一自检
//
// 下面两段 payload 是从 BitComet 2.20 真机上抓下来的原样响应，钉在这里当回归样本。
// 它暴露过三个真实的 bug：列表项没有 infohash 字段（只在 task_guid 里）、
// task_summary 装的是速度曲线不是概要、以及合并时被 0 覆盖掉真实进度。

const FIXTURE_LIST: Json = {
  task_id: 1005,
  task_guid: 'bt_15d60b4328c039ec65a833841cdc81a4792838ab',
  type: 'BT',
  task_name: 'STCVS-052',
  status: 'running',
  total_size: 2011974578,
  selected_size: 2011974578,
  selected_downloaded_size: 289688498,
  download_rate: 852191,
  upload_rate: 2068,
  permillage: 143,
  left_time: '0:35:48',
  dl_size: 291723066,
  health: '200%',
  file_count: 3
}

const FIXTURE_SUMMARY: Json = {
  error_code: 'ok',
  task_detail: {
    type: 'BT',
    infohash: '1e8d39f37a6a360cfabb368d8f65d71521de4185',
    task_name: 'magnet:336KNB-348',
    save_folder: 'D:\\Videos',
    total_size: 0,
    finish_time: ''
  },
  task_status: {
    status: 'Connecting',
    dl_speed: '0 KB/s',
    total_size: 0,
    progress: '0.0%',
    left_time: '∞',
    download_permillage: 0
  },
  // 注意：这个字段名叫 task_summary，装的却是速度曲线和分片位图
  task_summary: { tags: '', speed_list: [-1, -1], downloaded_pieces: [], available_pieces: [] },
  task: {
    task_id: 1003,
    task_guid: 'bt_1e8d39f37a6a360cfabb368d8f65d71521de4185',
    task_name: 'magnet:336KNB-348',
    status: 'running',
    total_size: 0,
    permillage: 0
  }
}

function check(label: string, ok: boolean, got?: unknown): boolean {
  console.log(`  ${ok ? '✅' : '❌'} ${label}${ok ? '' : `  → 实际 ${JSON.stringify(got)}`}`)
  return ok
}

function verifyNormalize(): number {
  head('① 字段归一自检（2.20 真机样本，离线）')
  let ok = true

  const listTask = normalizeTask(FIXTURE_LIST)!
  console.log(' 列表项：')
  ok = check(
    'infohash 从 task_guid 里取出',
    listTask.infoHash === '15d60b4328c039ec65a833841cdc81a4792838ab',
    listTask.infoHash
  ) && ok
  ok = check('progress 用 permillage 算 = 0.143', listTask.progress === 0.143, listTask.progress) && ok
  ok = check('dlspeed = 852191', listTask.dlspeed === 852191, listTask.dlspeed) && ok
  ok = check('eta 由 "0:35:48" 解析 = 2148 秒', listTask.eta === 2148, listTask.eta) && ok
  ok = check('status 归一成 downloading', listTask.status === 'downloading', listTask.status) && ok
  ok = check('done = false', listTask.done === false, listTask.done) && ok

  console.log(' 单任务详情：')
  const sum = normalizeSummary(FIXTURE_SUMMARY, 1003)!
  ok = check(
    'infohash 来自 task_detail',
    sum.infoHash === '1e8d39f37a6a360cfabb368d8f65d71521de4185',
    sum.infoHash
  ) && ok
  ok = check(
    '元数据没到手时状态是 metaDL 而不是 downloading',
    sum.status === 'metaDL',
    sum.status
  ) && ok
  ok = check('没把 speed_list 那段当概要读', sum.progress === 0, sum.progress) && ok

  console.log(' 合并：')
  const merged = mergeTask(listTask, { ...sum, taskId: listTask.taskId })
  ok = check('详情里的 0 不会覆盖列表里的真实进度', merged.progress === 0.143, merged.progress) && ok
  ok = check('详情里的 0 不会覆盖真实速度', merged.dlspeed === 852191, merged.dlspeed) && ok

  console.log(ok ? '\n✅ 归一自检全部通过' : '\n❌ 归一自检有失败项')
  return ok ? 0 : 1
}

// ------------------------------------------------------------- 离线段

function findXml(): string | null {
  const explicit = process.env.BC_XML
  if (explicit) return existsSync(explicit) ? explicit : null

  const candidates = [
    process.env.APPDATA ? join(process.env.APPDATA, 'BitComet', 'Downloads.xml') : null,
    process.env.ProgramFiles ? join(process.env.ProgramFiles, 'BitComet', 'Downloads.xml') : null
  ].filter((p): p is string => !!p)

  let best: { path: string; mtime: number } | null = null
  for (const p of candidates) {
    try {
      const mtime = statSync(p).mtimeMs
      if (!best || mtime > best.mtime) best = { path: p, mtime }
    } catch {
      /* 不存在就跳过 */
    }
  }
  return best?.path ?? null
}

function verifyXml(): number {
  head('② Downloads.xml 解析（离线，不需要开远程下载）')
  const path = findXml()
  if (!path) {
    console.log('⚠️  没找到 Downloads.xml。用 BC_XML=<完整路径> 手动指定。')
    return 0
  }
  console.log(`文件：${path}`)
  console.log(`修改时间：${new Date(statSync(path).mtimeMs).toLocaleString()}\n`)

  const tasks = parseDownloadsXml(readFileSync(path, 'utf8'))
  if (!tasks.size) {
    console.log('解析出 0 条任务 —— 如果 BitComet 里确实有任务，说明解析规则要改。')
    return 1
  }

  console.log(`解析出 ${tasks.size} 条任务：\n`)
  for (const t of tasks.values()) {
    const pct = `${(t.progress * 100).toFixed(1)}%`.padStart(7)
    const flag = t.done ? '✅' : '⏳'
    console.log(`${flag} ${t.infoHash}  ${pct}  ${fmtBytes(t.size).padStart(7)}  ${t.name}`)
    if (t.savePath) console.log(`   └─ ${t.savePath}`)
  }

  // 一致性自检：完成的任务进度必须是 1，未完成的必须严格小于 1
  const bad = [...tasks.values()].filter((t) => (t.done ? t.progress !== 1 : t.progress >= 1))
  if (bad.length) {
    console.log(`\n❌ ${bad.length} 条任务的 done 与 progress 不一致`)
    return 1
  }
  console.log('\n✅ done / progress 自检通过')
  return 0
}

// ------------------------------------------------------------- 联网段

async function post(baseUrl: string, path: string, body: Json, token?: string): Promise<Json> {
  const res = await request(baseUrl.replace(/\/+$/, '') + path, {
    dispatcher: agent,
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'client-type': 'BitComet WebUI',
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  })
  const text = await res.body.text()
  console.log(`  POST ${path} → HTTP ${res.statusCode}`)
  let data: Json = {}
  try {
    data = text ? (JSON.parse(text) as Json) : {}
  } catch {
    console.log(`  ⚠️  响应不是 JSON：${text.slice(0, 200)}`)
    return {}
  }
  if (RAW) console.log(`  ${JSON.stringify(data, null, 2).split('\n').join('\n  ')}`)
  return data
}

/** 打印一个对象的键，用来核对字段名在这个版本上到底叫什么 */
function showKeys(label: string, obj: Json | undefined): void {
  if (!obj || typeof obj !== 'object') {
    console.log(`  ${label}: (无)`)
    return
  }
  console.log(`  ${label} 的键：${Object.keys(obj).join(', ')}`)
}

async function verifyApi(): Promise<number> {
  head('③ 远程接口（需要 BitComet 里已开启「远程下载」）')
  const url = process.env.BC_URL
  if (!url) {
    console.log('跳过。要验这段就带上环境变量：')
    console.log('  BC_URL=http://127.0.0.1:<端口> BC_PASS=<密码> npm run verify:bc')
    return 0
  }

  const username = process.env.BC_USER ?? 'admin'
  const password = process.env.BC_PASS ?? ''
  const clientId = process.env.BC_CLIENT_ID ?? randomUUID()
  console.log(`地址：${url}\n账号：${username}\nclient_id：${clientId}\n`)

  console.log('登录：')
  const auth = encryptCredential(JSON.stringify({ username, password }), clientId)
  const login = await post(url, ENDPOINTS.login, { client_id: clientId, authentication: auth })
  if (String(login.error_code).toUpperCase() !== 'OK') {
    console.log(`❌ 登录失败：${login.error_code} ${login.error_message ?? ''}`)
    return 1
  }
  const version = String(login.version ?? '?')
  console.log(`✅ 登录成功，BitComet ${version}${versionTooOld(version) ? '（低于 2.18，接口可能不全）' : ''}`)

  const dt = await post(
    url,
    ENDPOINTS.deviceToken,
    {
      invite_token: login.invite_token,
      device_id: clientId,
      device_name: 'JavBus Desktop verify',
      platform: 'webui'
    },
    String(login.invite_token)
  )
  const token = dt.device_token ? String(dt.device_token) : ''
  if (!token) {
    console.log(`❌ 换取 device_token 失败：${dt.error_code} ${dt.error_message ?? ''}`)
    return 1
  }
  console.log(`✅ 拿到 device_token（${token.slice(0, 12)}…）`)

  console.log('\n任务列表：')
  const list = await post(
    url,
    ENDPOINTS.taskList,
    {
      state_group: 'ALL',
      task_type: 'BT',
      tag_filter: '',
      sort_key: '',
      sort_order: '',
      keyword: '',
      start: 0,
      limit: 1000
    },
    token
  )
  const items = (Array.isArray(list.tasks) ? list.tasks : Array.isArray(list.movie_list) ? list.movie_list : []) as Json[]
  console.log(`  顶层键：${Object.keys(list).join(', ')}`)
  console.log(`  任务数：${items.length}`)
  if (items.length) showKeys('列表项', items[0])

  const normalized = items.map((t) => normalizeTask(t)).filter((t) => t !== null)
  console.log(`  归一成功 ${normalized.length}/${items.length} 条`)
  for (const t of normalized.slice(0, 10)) {
    console.log(
      `    #${t!.taskId} ${(t!.infoHash || '(列表里无 infohash)').padEnd(40)} ` +
        `${(t!.progress * 100).toFixed(1)}% ${fmtBytes(t!.dlspeed)}/s ${t!.status} ${t!.name}`
    )
  }

  // 这是关键判断：列表项带不带 infohash / 速度，决定要不要逐任务补 summary
  const listHasHash = normalized.some((t) => !!t!.infoHash)
  const listHasRate = items.some((t) => t.download_rate !== undefined || t.download_speed !== undefined)
  console.log(`\n  → 列表项${listHasHash ? '带' : '不带'} infohash；${listHasRate ? '带' : '不带'}下载速度`)
  if (!listHasHash) console.log('    （所以 downloads.ts 需要靠 task_summary 建立 infohash → task_id 映射）')

  if (items.length) {
    console.log('\n单任务详情：')
    const id = normalizeTask(items[0])!.taskId
    const summary = await post(url, ENDPOINTS.taskSummary, { task_id: String(id) }, token)
    console.log(`  顶层键：${Object.keys(summary).join(', ')}`)
    showKeys('task', summary.task)
    showKeys('task_detail', summary.task_detail)
    showKeys('task_status', summary.task_status)
    showKeys('task_summary', summary.task_summary)
    const one = normalizeSummary(summary, id)
    console.log(`  归一结果：${JSON.stringify(one)}`)
    if (!one?.infoHash) {
      console.log('  ❌ task_summary 里也拿不到 infohash —— 映射策略要重新想')
      return 1
    }
    console.log('  ✅ 能拿到 infohash，映射策略可行')
  } else {
    console.log('\n⚠️  BitComet 里没有 BT 任务，跳过详情校验。先加一个任务再跑一次会更有意义。')
  }

  return 0
}

async function main(): Promise<void> {
  const a = verifyNormalize()
  const b = verifyXml()
  const c = await verifyApi()
  head(a + b + c === 0 ? '全部通过' : '有项目未通过，见上面的 ❌')
  process.exit(a + b + c ? 1 : 0)
}

void main()
