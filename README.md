# dsh-git-bar 路 DSH 鐨?Git 鑳跺泭

缁?[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)锛圖SH锛塛eb GUI 鍔犱竴鏋?*浼氳瘽鏍囬鏍忓彸涓婅鐨?Git 鑳跺泭**锛氫竴鐪肩湅鍒板綋鍓嶅伐浣滃尯鐨勫垎鏀笌鏀瑰姩锛岀偣寮€鐪嬫敼鍔ㄦ枃浠躲€佹渶杩戞彁浜わ紝鐐瑰垎鏀悕鐪?*甯﹁繛绾挎吵閬撶殑 Git 鍥捐氨**骞跺垏鍒嗘敮/鍒囩増鏈紝鐐规枃浠舵妸宸紓閫佽繘**鍙充晶鏍忓鏌?*銆?

> 绾湰鍦版彃浠讹細涓嶈仈缃戙€佷笉涓婁紶浠ｇ爜銆佷笉璇诲嚟鎹紱鍙湪鏈満鐢?`git` 璇讳綘鐨勪粨搴擄紝鍐欐搷浣滀粎闄愩€屽垏鍒嗘敮 / 妫€鍑烘煇涓彁浜わ紙鍏堢‘璁わ級銆嶃€?

---

## 鍔熻兘涓€瑙?

| 浣嶇疆 | 鑳藉姏 |
| --- | --- |
| 鑳跺泭锛堟敹璧凤級 | 鍒嗘敮鍚?+ 鏀瑰姩鏁帮紱鍦嗙偣鎸夌姸鎬佺潃鑹诧紙骞插噣 / 鏈夋敼鍔?/ 鏈夊啿绐侊級锛涙父绂?HEAD 鏃舵樉绀?`HEAD@<鐭搱甯?` |
| 鑳跺泭锛堝睍寮€锛?| 涓婃父涓?`鈫慳head 鈫揵ehind`銆佸垎缁勬枃浠跺垪琛紙宸叉殏瀛?/ 鏈殏瀛?/ 鏈窡韪?/ 鍐茬獊锛夈€乣鏈€杩戞彁浜锛?0s/5s 鑷姩鍒锋柊锛屽垏浼氳瘽绔嬪嵆閲嶅彇 |
| 搴曢儴銆岃嚜鍔ㄦ彁浜ゃ€?| 鐢ㄦ埛鐐瑰嚮鎵嶆彁浜わ細鑷姩鐢熸垚 Conventional Commit 淇℃伅锛堟枃妗ｂ啋`docs`銆佹祴璇曗啋`test`銆佸叾浣欌啋`chore`锛夊苟鎻愪氦鍏ㄩ儴鏀瑰姩锛涘啿绐?/ 娓哥 HEAD / 鏃犳敼鍔ㄤ細鎷掔粷骞惰鏄庡師鍥狅紱浠庝笉鎺ㄩ€併€佷笉 amend銆佷笉閲嶅啓鍘嗗彶 |
| 鐐瑰垎鏀悕 | 鍚屼竴闈㈡澘鍒囨垚 **Git 鍥捐氨**锛堝搴?720px锛屽彸杈圭紭涓嶅姩锛夛細鍗曠敾甯冭繛绾裤€佹吵閬撱€乣HEAD`/鍒嗘敮/杩滅▼/鏍囩鑺墖銆佸綋鍓嶈楂樹寒涓庛€屽綋鍓嶃€嶆爣璁般€佺旱鍚戞粴鍔ㄤ笌 `PageUp/PageDown/Home/End` |
| 鐐瑰浘璋遍噷鐨勫垎鏀姱鐗?| 鐩存帴鍒囨崲鍒嗘敮 |
| 鐐瑰浘璋遍噷鐨勮繙绋?鏍囩鑺墖锛屾垨闈為《鐐硅 | 纭鏉?鈫?妫€鍑轰负娓哥 HEAD |
| 娓哥 HEAD | 宸ュ叿鏉?`鈫?鍥炲埌鍒嗘敮 <鍚嶅瓧>`锛圚ost 浠?reflog 鎺ㄦ柇锛?銆屾父绂?HEAD銆嶈姱鐗囧氨鍦版墦寮€鍒嗘敮閫夋嫨鍣?|
| 鐐规彁浜ゅ悕 | 鎻愪氦璇︽儏锛氬搱甯屻€佷綔鑰呫€佹椂闂淬€乣+N 鈭扢`銆佹枃浠舵竻鍗曪紙涓嶅唴宓岃ˉ涓侊級锛涚偣鏂囦欢杩涜鎻愪氦鐨勮鏂囦欢瀹℃煡 |
| 鐐规敼鍔ㄦ枃浠?| 鍦ㄥ彸渚ф爮銆孏it 瀹℃煡銆嶆爣绛鹃噷鎵撳紑宸紓锛?*闈㈡澘淇濇寔鎵撳紑**骞惰嚜鍔ㄨ浣嶏紝鏂逛究杩炵画鐐逛笅涓€涓?|
| 鍙充晶鏍忋€屽紑濮嬨€嶉〉 | 涓€寮犮€屼唬鐮佸鏌ャ€嶅崱鐗囷細娌￠€夋枃浠舵椂鍒楀嚭鐜版湁鏀瑰姩锛岀偣涓€鏉″嵆瀹℃煡 |

鎵€鏈夎繃娓★紙灞曞紑/鏀惰捣銆乣鏈€杩戞彁浜 灞曞紑銆佽繘鍏ユ彁浜よ鎯呫€佽繘鍏?閫€鍑哄浘璋便€佸浘璋辫鍏ュ満銆佺‘璁ゆ潯銆佹偓鍋溿€佽鏁板彉鍖栵級閮芥槸骞虫粦鍔ㄧ敾锛屽苟涓旈伒瀹堢郴缁?`prefers-reduced-motion`锛涘彧鏈夈€岃繘鍏ュ鏌ャ€嶈繖涓€鍒绘槸鐬椂鐨勩€?

## 瀹夎

鍦?DSH 鐨?**璁剧疆 鈫?鎻掍欢 鈫?娣诲姞**锛堟垨 `plugin_manager` 宸ュ叿锛夐噷锛屼换閫変竴绉嶏細

| 鏂瑰紡 | 杈撳叆 |
| --- | --- |
| npm 鍖咃紙宸插彂甯冿級 | `dsh-git-bar`锛堣窡闅?latest锛夛紝鎴栭攣瀹氱増鏈?`dsh-git-bar@1.0.2` |
| GitHub 浠撳簱 | `git+https://github.com/zhangxuesong-06/dsh-git.git` |
| 鏈湴鐩綍锛堝紑鍙戯級 | `link:<浠撳簱缁濆璺緞>` |
| 绂荤嚎鍖?| `file:<浠撳簱缁濆璺緞>/dsh-git-bar-1.0.2.tgz` |

瀵瑰簲鐨勫伐鍏疯皟鐢細

```text
plugin_manager  action=install_bundle  target=dsh-git-bar
plugin_manager  action=install_bundle  target=git+https://github.com/zhangxuesong-06/dsh-git.git
plugin_manager  action=install_bundle  target=link:<浠撳簱缁濆璺緞>
```

瀹夎鍚?bundle 閫氳繃 DSH 鐨?HMR 鐢熸晥锛?*浣嗗崌绾ф垨棣栨瀹夎鍚庤閲嶅惎涓€娆?DSH**鈥斺€旀祻瑙堝櫒鍗婅竟鏄€岀墿鍖栥€嶅姞杞界殑锛?
鍙埛鏂伴〉闈笉浼氭崲涓婃柊浠ｇ爜锛圚ost 鍗婅竟鍒欎細鐑浛鎹級銆傜敤 `link:` 瀹夎鏃舵敼浠ｇ爜鍙渶瀵?`include:dsh-git-bar`
鍋氫竴娆°€屽仠鐢?鈫?鍚敤銆嶏紱registry / git 瀹夎鐨勬槸鎵撳寘鍓湰锛屾敼鍔ㄩ渶瑕侀噸鏂板彂鐗堟垨閲嶆柊瀹夎銆?

> 寮€鍙戞彁绀猴細涓嶈鎶?profile 鎸囧悜浠撳簱鐩綍鐨?`link:` 瀹夎涓?pnpm 鐨?install/remove 娣风敤鈥斺€斿湪 Windows 涓?
> pnpm 澶勭悊杩欑 junction 鏃跺彲鑳借繛甯﹀垹闄ら摼鎺ョ洰鏍囬噷鐨勫唴瀹癸紙鏈」鐩浘鍥犳涓㈠け `.git` 鍏冩暟鎹紝闈?refs/瀵硅薄鎭㈠锛夈€?
> 绋冲Ε鍋氭硶鏄?`npm pack` 鍚庤 tarball锛屾垨鍙戝竷 `--tag next` 鐨勯鍙戝竷鐗堟湰鏉ヨ仈璋冦€?

瑕佹眰锛?

- DSH **0.2.1-rc.5** 鎴栧吋瀹圭増鏈紙鐢ㄥ埌浜?`webServer`銆乣sessions`銆乣workingDirectory`銆乣sidebarRightTabs`銆乣sidebarRight` 杩欎簺鎵╁睍鐐癸級锛?
- 鏈?Web 杞戒綋锛坄ctx.webServer`锛夆€斺€旀闈㈢増涓?`dsh web` 閮芥湁锛汬eadless 缁勫悎涓嬫彃浠朵細鑷姩闄嶇骇涓轰笉娉ㄥ唽璺敱锛?
- 鏈満 `git` 2.x锛堝簲鐢ㄨ繘绋?PATH 閲屾壘涓嶅埌鏃朵細鍐嶈瘯甯歌瀹夎璺緞锛屼篃鍙敤鐜鍙橀噺 `DSH_GIT_BIN` 鎸囧畾锛夈€?

## 宸ヤ綔鍘熺悊

```
娴忚鍣ㄥ崐杈?client.js                 Host 鍗婅竟 index.js
鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€                鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
conversation.session.header          浼氳瘽 ID 鈫?ctx.sessions.get(id)
  .utilities 娉ㄥ唽鑳跺泭                鈫?ctx.workingDirectory.get(session)
闈㈡澘 / 鍥捐氨 / 鎻愪氦璇︽儏               鈫?鏈満 git锛堟棤 shell 鐨勫浐瀹?argv锛?
鍙充晶鏍忋€孏it 瀹℃煡銆嶆爣绛句綋             鈫?绉佹湁 HTTP 璺敱锛堝悓婧?JSON锛?
        鈹?                                       鈻?
        鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€ fetch /dsh-git-bar/* 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?
```

| 璺敱 | 浣滅敤 |
| --- | --- |
| `GET /dsh-git-bar/state?session=` | 鍒嗘敮銆丠EAD銆佷笂娓搞€乤head/behind銆佺姸鎬佹潯鐩紙鍚?`--numstat`锛夈€佹渶杩戞彁浜わ紙鐭?瀹屾暣鍝堝笇锛?|
| `GET /dsh-git-bar/diff?session=&path=&staged=` | 鍗曟枃浠剁粺涓€宸紓锛堟湭璺熻釜鏂囦欢鍚堟垚銆屾柊鏂囦欢銆嶅樊寮傦級 |
| `GET /dsh-git-bar/branches?session=` | 鏈湴鍒嗘敮鍒楄〃锛堝綋鍓嶅垎鏀爣璁般€佷笂娓搞€佹渶鍚庝竴鏉℃彁浜わ級 |
| `POST /dsh-git-bar/switch` | `{branch}` 鍒囧垎鏀?/ `{detach}` 妫€鍑轰负娓哥 HEAD锛涙嫆缁?`-` 寮€澶淬€佹湭鐭ョ洰鏍囥€佹湁鍐茬獊鐨勫伐浣滃尯锛実it 鎶ラ敊鍘熸牱鍥炰紶 |
| `GET /dsh-git-bar/graph?session=&limit=` | 鎻愪氦鍥撅紙`--all --topo-order`锛夛細鐖舵彁浜ゃ€佹吵閬撱€乣HEAD`/鍒嗘敮/杩滅▼/鏍囩瑁呴グ銆乣headFull`銆乣isHead`銆乣previousBranch` |
| `GET /dsh-git-bar/commit?session=&hash=` | 鍗曟彁浜ゅ厓淇℃伅銆侀€愭枃浠跺鍒犮€佸畬鏁磋ˉ涓?|
| `GET /dsh-git-bar/commit-diff?session=&hash=&path=` | 鍗曟彁浜ら噷鏌愪釜鏂囦欢鐨勮ˉ涓?|
| `POST /dsh-git-bar/auto-commit` | 鐢辩敤鎴风偣鍑昏Е鍙戯細`git add -A` 鍚庣敤鐢熸垚鐨勬彁浜や俊鎭彁浜ゅ叏閮ㄦ敼鍔紙娑堟伅浣撳垪鍑烘枃浠讹級锛涙嫆缁濆啿绐?娓哥 HEAD/鏃犳敼鍔紱浠庝笉鎺ㄩ€併€佷笉 amend銆佷笉閲嶅啓鍘嗗彶 |
| `GET /dsh-git-bar/health` | 瀛樻椿鎺㈤拡 |

瀹夊叏绾︽潫锛歚path` 蹇呴』鏄粨搴撳唴鐩稿璺緞锛堟嫆缁濈粷瀵硅矾寰勩€佺洏绗︺€乣..`锛夛紱`hash` 鍙帴鍙楀崄鍏繘鍒讹紱鍒嗘敮/鏍囩鍚嶅繀椤绘潵鑷?
`git for-each-ref` 鐨勫疄闄呯粨鏋滐紱浠撳簱鏍圭敱 `git rev-parse --show-toplevel` 瑙ｆ瀽锛屾祻瑙堝櫒浠庝笉鐩存帴鎸囧畾鐩綍銆傛彃浠剁殑鎵€鏈?
git 璋冪敤閮藉彧璇伙紝鍐欐搷浣滃彧鏈変笁绉嶏細鍒囧垎鏀€佹鍑轰负娓哥 HEAD銆佷互鍙?*鐢ㄦ埛鐐瑰嚮瑙﹀彂鐨勮嚜鍔ㄦ彁浜?*锛堟病鏈変换浣曞悗鍙板畾鏃舵彁浜わ級銆?

## 浠撳簱缁撴瀯

浠撳簱鏍圭洰褰曞氨鏄?**npm 鍖呮湰浣?*锛堣繖鏍?`npm publish` 涓?`git+https://鈥 涓ょ瀹夎閮借兘鐩存帴宸ヤ綔锛夛細

```
.
鈹溾攢鈹€ package.json          # 鍖呮竻鍗曪細dsh.bundle 琛ヤ竵 + dsh.client锛坧latform: web锛?
鈹溾攢鈹€ cordis.patch.yml      # 鎻掑叆 id: dsh-git-bar 鐨?Host 琛?
鈹溾攢鈹€ index.js              # Host 鍗婅竟锛氫細璇濈洰褰?鈫?git 鈫?HTTP 璺敱
鈹溾攢鈹€ client.js             # 娴忚鍣ㄥ崐杈癸細鑳跺泭 / 闈㈡澘 / 鍥捐氨 / 瀹℃煡锛堢函 JS锛屼粎 require('react')锛?
鈹溾攢鈹€ locale/en.json        # 鎻掍欢绠＄悊椤垫樉绀哄悕涓庢弿杩?
鈹溾攢鈹€ locale/zh.json
鈹溾攢鈹€ icon.svg              # 鎻掍欢鍥炬爣锛堝師濮嬬粯鍒讹級
鈹溾攢鈹€ README.md             # 鏈枃浠讹紙npm 椤典篃浼氬睍绀猴級
鈹溾攢鈹€ LICENSE
鈹溾攢鈹€ .gitignore
鈹斺攢鈹€ docs/PLUGIN.md        # 鎻掍欢绾ф繁鏂囨。锛氫氦浜掔粏鑺傘€佸疄鐜拌鐐广€佸彲璋冨弬鏁?
```

## 寮€鍙戜笌璋冭瘯

- 璇硶妫€鏌ワ細`node --check index.js` 涓?`node --check client.js`銆?
- 鎵撳寘棰勮锛歚npm pack --dry-run`锛堝簲鍙寘鍚繍琛岄渶瑕佺殑鏂囦欢锛夈€?
- 鐑噸杞斤細`plugin_manager action=set_plugin target=include:dsh-git-bar enabled=false` 鍐?`enabled=true`锛孒ost 涓庢祻瑙堝櫒涓ゅ崐閮戒細鎹㈡垚纾佺洏涓婄殑鏈€鏂版枃浠讹紙浠?`link:` 瀹夎鏃惰窡闅忕鐩橈級銆?
- 娴忚鍣ㄥ崐杈圭殑绾︽潫锛歚window.__ModuleLoader__.load({ id, factory })` 褰㈠紡锛坄id` 蹇呴』绛変簬鍖呭悕 `dsh-git-bar`锛夈€佸彧鐢?
  `require('react')`銆佹棤 JSX/`import`銆佹牱寮忓彧鐢ㄤ富棰?token锛坄--dsw-alias-*`锛夈€乣<style>` 娓叉煋鍦ㄧ粍浠惰嚜韬瓙鏍戝唴銆佹墍鏈?effect 鎴愬娓呯悊銆?
- 瀹℃煡鏍囩浣撴嬁涓嶅埌 `useTabInfo()`锛屾墍浠ュ鏌ョ洰鏍囨斁鍦ㄦā鍧楀唴鍙闃?store 閲岋紱鍙充晶鏍忎笉鍙敤鏃惰嚜鍔ㄥ洖閫€鍒伴潰鏉垮唴瀹℃煡銆?

## 鍙戝竷

```bash
npm publish          # scoped 鍖呴渶 --access public锛涙湰鍖呬负鏃?scope 鍚嶏紝public 鏄粯璁?
```

- `package.json` 宸插０鏄?`engines.dsh`锛坄>=0.2.1-rc.5 <0.3.0`锛夛細DSH 瀹夎鍓嶄細鎸夊畠鍋氬吋瀹规€ч棬绂侊紝瓒呭嚭鑼冨洿浼氳鎷掔粷锛?
- 鐗堟湰鍙烽伒寰?semver锛孌SH 鐨?registry 瀹夎閿佸畾绮剧‘鐗堟湰锛?
- 鍚嶅瓧 `dsh-git-bar` 鐩墠鍦?npm 涓婂凡鏈変竴涓?`0.0.1` 鍗犱綅鍖咃紝鍙戝竷鍓嶉渶纭浣犲瀹冩湁鎵€鏈夋潈銆?

## 婕旂ず鏁版嵁锛堝彲鍒狅級

涓轰簡婕旂ず鍒嗘敮/鍥捐氨锛屾湰浠撳簱闄勫甫锛?

- 鍒嗘敮 `demo/graph`锛氫袱涓枃妗ｆ彁浜?+ 涓€娆″悎骞讹紝鐢ㄦ潵婕旂ず鍒嗗弶娉抽亾锛?
- 鏍囩 `v0.1.0`銆?

涓嶉渶瑕佹椂锛?

```bash
git branch -D demo/graph
git tag -d v0.1.0
```

## 鍗歌浇

```text
plugin_manager  action=remove_bundle  target=dsh-git-bar
```

鎴栧湪銆岃缃?鈫?鎻掍欢銆嶉噷鍋滅敤 `Git 鑳跺泭`銆?

## 宸茬煡闄愬埗

- 銆屽彸鏍忓鏌ャ€嶅彧鍦ㄦ湰鏈?Web 杞戒綋 + 瀛樺湪浼氳瘽闈㈡椂鍙敤锛涘惁鍒欏洖閫€涓鸿兌鍥婂唴鐨勫鏌ヨ鍥俱€?
- 鍥捐氨涓€娆℃渶澶?120 鏉℃彁浜ゃ€佹渶澶?8 鏉℃吵閬擄紱鏇存棭鐨勫巻鍙蹭笉鐢汇€?
- 鍚屼竴绫绘爣绛惧彧鏈変竴浠斤細鍐嶇偣鍒殑鏂囦欢浼氳仛鐒﹀悓涓€涓鏌ユ爣绛惧苟鎹㈡垚鏂扮洰鏍囥€?
- 杩滅▼鍒嗘敮鍙互琚鍑烘垚娓哥 HEAD锛屼絾涓嶄細鏇夸綘鍒涘缓鏈湴璺熻釜鍒嗘敮銆?
- 涓婚 token 鐢卞涓婚鎻愪緵锛沗color-mix()` 闇€瑕佽緝鏂扮殑 Chromium锛堣€佸紩鎿庝笂浠呭墿楂樹寒宸﹁竟妗嗭紝涓嶅奖鍝嶅姛鑳斤級銆?

## 璁稿彲

[MIT](LICENSE) 漏 2026 dsh-git-bar contributors

浣犲彲浠ヨ嚜鐢变娇鐢ㄣ€佷慨鏀广€佸垎鍙戯紙鍖呮嫭鍟嗙敤锛夛紝鍙渶鍦ㄦ墍鏈夊壇鏈垨瀹炶川閮ㄥ垎涓繚鐣欎笂闈㈢殑鐗堟潈涓庤鍙０鏄庯紱杞欢鎸夈€岀幇鐘躲€?
鎻愪緵锛屼笉甯︿换浣曟媴淇濄€傛兂鎹㈡垚涓汉鎴栧叕鍙稿悕涔夛紝鍙敼 `LICENSE` 绗竴琛岀殑鐗堟潈鎸佹湁浜哄嵆鍙紙宸插彂甯冪殑 MIT 鎺堟潈涓嶅彲鎾ゅ洖锛?
浣嗙増鏉冪讲鍚嶅彲浠ュ湪鍚庣画鎻愪氦閲屾洿姝ｏ級銆?

