# 迷你巷戰 Mini Alley Fight

原創的瀏覽器第一人稱巷戰小品。你是鐵衛最後的夜班，在南倉巷對付夜梟四人。先取得 10 個殲敵，或在三分鐘後以分數分勝負。

A short, original browser first-person alley fight. You are the last night shift of the Iron Watch, holding South Warehouse Alley against four Night Owls. First to 10 eliminations, or the higher score when three minutes run out.

這是獨立創作，只借用「短回合、掩體、射擊、換彈」這類玩法概念。名稱、地圖、武器、聲響、介面與標識都是原創，並未使用任何商業遊戲的資源。

This is an original homage to short-round tactical shooters. The name, map, weapons, audio, interface, and marks are independent. It does not use assets from any commercial game.

## 怎麼玩 / How to play

| 操作 | |
| --- | --- |
| 滑鼠移動 Mouse | 環視 Look |
| 左鍵 Left click | 開火 Fire |
| W A S D | 移動 Move |
| Shift | 慢行，腳步更輕、彈道更穩 Walk: quieter steps, tighter shots |
| 空白鍵 Space | 跳躍 Jump |
| R | 換彈 Reload |
| 1 / 2 | 赤線-30 步槍／灰釘 手槍 Rifle / pistol |
| Esc | 暫停 Pause |

巷內有三個補給箱，補 45 點生命，取走後會再出現。爆頭傷害加倍。站定點射比掃射更準。

Three supply cases in the yard restore 45 health and come back after a short wait. Headshots deal double damage. Tap-firing while standing still is more accurate than spraying.

桌面鍵盤加滑鼠是主要玩法。觸控裝置會顯示搖桿、環視區同開火鍵。

Keyboard and mouse is the intended way to play. Touch devices get a move stick, a look pad, and fire buttons.

## 本機開啟 / Run locally

要用靜態伺服器打開。直接雙擊 `index.html` 時，瀏覽器會封鎖 JavaScript 模組。

Serve the folder over HTTP. Opening `index.html` as a file will be blocked by the browser's module rules.

```bash
python3 -m http.server 8080
```

然後開啟 `http://127.0.0.1:8080/`。

Then open `http://127.0.0.1:8080/`.

## GitHub Pages

把這個資料夾的內容放到網站根目錄即可。`index.html` 在最外層，並已附上 `.nojekyll`。路徑都是相對的，不需要建置步驟或後端。

Put this folder’s contents at the site root. `index.html` is at the top level, and `.nojekyll` is included. Paths are relative. There is no build step and no backend.

## 技術 / Tech

- 靜態網站：HTML、CSS、JavaScript
- [Three.js](https://threejs.org/) r160（MIT，見 `vendor/LICENSE-three.txt`）已放在 `vendor/`，不依賴外網 CDN
- 槍聲、腳步、換彈都是程式即時合成，沒有外來音檔

Static HTML, CSS, and JavaScript. Three.js r160 is vendored under the MIT license (`vendor/LICENSE-three.txt`), so the game does not call a CDN. Gunshots, footsteps, and reloads are synthesized in the browser.
