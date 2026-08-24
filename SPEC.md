# HYPER LAUNCHER 15X 仕様書

- 仕様書名: HYPER LAUNCHER 15X
- 対象ゲーム: `037-stickman-jump`
- 作成日: 2026-08-24
- 更新日: 2026-08-24
- ステータス: 改修中（公開）
- 参照ファイル: `index.html` `hyper_launcher.css` `hyper_launcher.js` `hyper_launcher_15x.html`

## 1. ゲーム概要

- ジャンル: 3D空中打ち返し / 飛距離アタック
- 一言説明: 棒人間を打ち上げ、バレーのレシーブで打ち返して飛距離を伸ばす
- 想定プレイ時間: 1プレイ 30秒〜数分
- 想定プレイヤー: iPhone片手プレイ
- クリア体験の要点: 次の実距離目安（プール、スカイツリー等）を通過し、宇宙へ入る

## 2. 対象環境

### 必須
- 配信先: GitHub Pages
- 最優先端末: iPhone Safari
- 対応画面幅: 320px〜430px を基準
- 実装方式: HTML / CSS / JavaScript の静的ファイル。Three.js は CDN（r128）

### 任意
- PC: キーボード（A/D・矢印で回避、タップ相当はクリック）

### 未確定
- なし（公開ブロッカーではない）

## 3. ファイル構成

### 必須（本ゲームの実体）
```text
037-stickman-jump/
  index.html
  hyper_launcher_15x.html
  hyper_launcher.css
  hyper_launcher.js
  SPEC.md
  LEARNINGS.md
```

`index.html` は `hyper_launcher_15x.html` と同期する。`script.js` は使わない。

## 4. コアループ

- 開始: LAUNCH で発射
- 空中タップ: 打ち返し（頂点付近 PERFECT、落下直前 SAVE、早い打ち EARLY）
- 長押し: チャージスマッシュ
- 左右ボタン / スワイプ: 障害物回避
- 地面1回目: DIG で復活。2回目で GROUND CRASH
- 岩石・ゲート衝突: OBSTACLE HIT
- 進行: 対流圏（12kmまで）→成層圏（50kmまで）→宇宙。50km突破で星空と岩石
- 速度: 打ち返しのたびに掛け算で加速。HUD SPEED は倍率

## 5. 画面 / 状態遷移

- START → PLAYING → GAMEOVER → RETRY で PLAYING
- ポーズなし
- クリア画面なし（飛距離アタック）

## 6. 操作

- タップ / クリック: 打ち返し
- 長押し: チャージ
- 左右ボタン長押し・スワイプ・A/D/矢印: 回避
- サウンドボタン: ミュート

## 7. 勝敗条件

- 敗北: 地面2回目、または障害物/宇宙岩石への衝突
- 勝利条件なし。記録は `localStorage.hyper_best_dist`

## 8. UI

- DISTANCE（1万m以上は km、1万km以上は万km）
- SPEED / COMBO / 層名 / 次の目安
- 高度計・レーダー・判定文字
- リザルト: 飛距離たとえ話、通過目安数

## 9. 音声

- WebAudio。開始タップで unlock。pageshow / フォーカスで再開試行

## 10. 保存

- ベスト飛距離のみ localStorage

## 11. 実装制約

- 公開実体 20MB 以下
- iOS: viewport-fit、touch-action none、ダブルタップ防止、safe-area
- push は本パイプラインで実施

## 12. テスト項目

- 起動して LAUNCH できる
- 打ち返しで高度が戻る
- 地面1回目は DIG、2回目はゲームオーバー
- 50km（成層圏上端）で宇宙演出。高度やジャンプ回数では入らない
- 1万m以上のリザルトが km 表記

## 13. 未確定事項

- iPhone実機での最終見た目確認（シミュレータ/実機プレイは本公開時点で未実施）
