import { extractCode } from '../src/shared/code'
const cases: [string, string | null][] = [
  ['300MIUM-899/300MIUM-899-uncensored-nyap2p.com.mp4', '300MIUM-899'],
  ['259LUXU-1234.mp4', '259LUXU-1234'],
  ['200GANA-2712.mkv', '200GANA-2712'],
  ['ABF-377 [1080p].mp4', 'ABF-377'],
  ['[SONE-099]hhd800.com@SONE-099.mp4', 'SONE-099'],
  ['ssis00001.mp4', 'SSIS-001'],
  ['SSIS-001-C.mp4', 'SSIS-001'],
  ['meyd-941.mp4', 'MEYD-941'],
  ['snos-052 4K.mkv', 'SNOS-052'],
  ['START-372_uncensored.mp4', 'START-372'],
  ['FC2-PPV-1234567.mp4', 'FC2-PPV-1234567'],
  ['FC2PPV 4567890.mp4', 'FC2-PPV-4567890'],
  ['HEYZO-2345.mp4', 'HEYZO-2345'],
  ['010119-001-carib-1080p.mp4', '010119-001'],
  ['112618_777-1pon.mp4', '112618-777'],
  ['IPZZ-629.mp4', 'IPZZ-629'],
  ['MIDV-506 hhb.mp4', 'MIDV-506'],
  ['随便的中文文件名.mp4', null],
  ['Movie 2026 1080p BluRay.mkv', null]
]
let bad = 0
for (const [input, want] of cases) {
  const got = extractCode(input)
  const ok = got === want
  if (!ok) bad++
  console.log(`${ok ? '✅' : '❌'} ${input}  →  ${got}${ok ? '' : `  (期望 ${want})`}`)
}
console.log(bad === 0 ? '\n全部通过' : `\n${bad} 项不符`)
process.exit(bad ? 1 : 0)
