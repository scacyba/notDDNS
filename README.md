# notDDNS

Cloudflare Workers KV に「最後に更新用 URL へアクセスした端末のグローバル IP」を保存する、シンプルな DDNS 代替 Worker です。

Android スマホが自宅 Wi-Fi に接続したタイミングで MacroDroid / Tasker / Automate などから更新用 URL を叩くと、Worker が Cloudflare 標準ヘッダーからアクセス元 IP を取得して KV に保存します。スマホ側で IP を取得する必要はありません。

## ファイル構成

```text
.
├── README.md          # セットアップ、運用、Android設定例
├── package.json       # wrangler / test スクリプト
├── wrangler.toml      # Worker と KV binding の設定
├── src/index.js       # Cloudflare Worker 本体
└── test/worker.test.js # 最小限の Worker 単体テスト
```

## エンドポイント

パスや KV キーは `wrangler.toml` の `[vars]` で変更できます。

| 用途 | 既定値 | 説明 |
| --- | --- | --- |
| 更新用 | `/u/replace-with-a-long-random-string` | アクセス元 IP を KV に保存します。実運用前に必ず長いランダム文字列へ変更してください。 |
| 確認用 | `/current` | KV に保存済みの IP と更新日時を JSON で返します。 |
| KV キー | `home:current-ip` | Workers KV に保存するキー名です。 |

## KV に保存するデータ形式

KV の値は JSON 文字列です。

```json
{
  "ip": "203.0.113.10",
  "updated_at": "2026-07-07T12:34:56.789Z",
  "updated_at_jst": "2026/07/07 21:34:56",
  "source": {
    "country": "JP",
    "colo": "NRT"
  }
}
```

* `ip`: Cloudflare が付与する `CF-Connecting-IP` を最優先で使います。
* `updated_at`: ISO 8601 / UTC の更新日時です。
* `updated_at_jst`: 日本時間で見やすい更新日時です。
* `source`: Cloudflare の `request.cf` から取得できる補助情報です。取得できない場合は `null` です。

IP 取得は次の順でフォールバックします。

1. `CF-Connecting-IP`
2. `X-Forwarded-For` の先頭 IP
3. `X-Real-IP`

どれも取得できない場合、更新エンドポイントは `400` を返します。

## Cloudflare 側の設定・デプロイ手順

### 1. 依存関係をインストール

```bash
npm install
```

### 2. Cloudflare にログイン

```bash
npx wrangler login
```

### 3. Workers KV namespace を作成

```bash
npx wrangler kv namespace create HOME_IP_KV
```

出力例:

```text
[[kv_namespaces]]
binding = "HOME_IP_KV"
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

表示された `id` を `wrangler.toml` の `[[kv_namespaces]]` にある `REPLACE_WITH_YOUR_KV_NAMESPACE_ID` と置き換えます。

### 4. 更新用 URL をランダム化

更新用 URL は認証の代わりに長いランダムパスとして扱います。以下のようにランダム文字列を作り、`wrangler.toml` の `UPDATE_PATH` を変更してください。

```bash
openssl rand -hex 32
```

例:

```toml
[vars]
UPDATE_PATH = "/u/8d5b1e8b0d0c4f2bb9b6e6a91c0f5c1f7b2d7b8f6a0e4d3c2b1a9f8e7d6c5b4a"
CHECK_PATH = "/current"
KV_KEY = "home:current-ip"
```

### 5. ローカル開発・テスト

Cloudflare Worker のローカル起動:

```bash
npm run dev
```

単体テスト:

```bash
npm test
```

### 6. デプロイ

```bash
npm run deploy
```

デプロイ後の URL は通常、次の形式になります。

```text
https://notddns.<your-subdomain>.workers.dev
```

独自ドメインを使う場合は Cloudflare Workers の Routes / Custom Domains で割り当ててください。

## 動作確認手順

以降、例として以下の URL を使います。実際の値に置き換えてください。

```text
https://notddns.<your-subdomain>.workers.dev/u/<your-long-random-string>
https://notddns.<your-subdomain>.workers.dev/current
```

### 更新

```bash
curl -sS https://notddns.<your-subdomain>.workers.dev/u/<your-long-random-string>
```

成功例:

```json
{
  "ok": true,
  "ip": "203.0.113.10",
  "updated_at": "2026-07-07T12:34:56.789Z",
  "updated_at_jst": "2026/07/07 21:34:56",
  "source": {
    "country": "JP",
    "colo": "NRT"
  }
}
```

### 確認

```bash
curl -sS https://notddns.<your-subdomain>.workers.dev/current
```

成功例:

```json
{
  "ok": true,
  "record": {
    "ip": "203.0.113.10",
    "updated_at": "2026-07-07T12:34:56.789Z",
    "updated_at_jst": "2026/07/07 21:34:56",
    "source": {
      "country": "JP",
      "colo": "NRT"
    }
  }
}
```

未更新の場合は `404` と `{ "ok": false, "error": "not_found" }` を返します。不正なパスも `404` です。

## Android 自動化アプリ側の設定例

スマホ側は IP を取得せず、更新用 URL に HTTP リクエストするだけです。

### MacroDroid

1. Trigger: `WiFi SSID Change` または `WiFi Connected`
2. 対象 SSID: 自宅 Wi-Fi の SSID を指定
3. Action: `HTTP Request`
4. Method: `GET`
5. URL: `https://notddns.<your-subdomain>.workers.dev/u/<your-long-random-string>`
6. Optional: レスポンスコードが `200` 以外の場合に通知するアクションを追加

### Tasker

1. Profile: `State` → `Net` → `Wifi Connected`
2. SSID: 自宅 Wi-Fi の SSID を指定
3. Task: `Net` → `HTTP Request`
4. Method: `GET`
5. URL: `https://notddns.<your-subdomain>.workers.dev/u/<your-long-random-string>`
6. Optional: `%http_response_code` が `200` 以外なら通知

### Automate

1. Flow beginning
2. `Wi-Fi network connected?` ブロックで自宅 SSID を条件にする
3. `HTTP request` ブロックを追加
4. Method: `GET`
5. URL: `https://notddns.<your-subdomain>.workers.dev/u/<your-long-random-string>`
6. Optional: HTTP status code を確認し、失敗時は通知

## 認証なし運用時の注意点

この Worker は要件に合わせて認証を必須にしていません。そのため、更新用 URL を知っている人は誰でも KV の IP を上書きできます。

* 更新用 URL は 32 bytes 以上のランダム値など、推測困難な長いパスにしてください。
* 更新用 URL は公開リポジトリ、スクリーンショット、ログ、共有メモなどに載せないでください。
* 確認用 URL は IP と更新日時を返します。IP が漏れても問題ない前提の用途に限定してください。
* 誤更新が気になる場合は、後から Worker 側で共有トークン、特定 User-Agent、Cloudflare Access などを追加できます。
* Android が VPN やモバイル回線経由で更新 URL を叩くと、その出口 IP が保存されます。自宅 Wi-Fi 接続時だけ実行する条件にしてください。

## エラーレスポンス

すべて JSON で返します。

| 状況 | HTTP status | 例 |
| --- | ---: | --- |
| 不正なパス | 404 | `{ "ok": false, "error": "not_found" }` |
| 未更新 | 404 | `{ "ok": false, "error": "not_found" }` |
| IP 取得不可 | 400 | `{ "ok": false, "error": "client_ip_not_found" }` |
| KV binding 未設定 | 500 | `{ "ok": false, "error": "kv_binding_missing" }` |
| 更新時の非対応 method | 405 | `{ "ok": false, "error": "method_not_allowed" }` |
