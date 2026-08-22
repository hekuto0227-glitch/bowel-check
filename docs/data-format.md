# 排便チェック データ形式

## 基本方針
- `schemaVersion` はデータ構造のバージョン。
- `appVersion` はアプリのバージョン。
- GitHub更新時にこのJSONを初期化しない。
- CSVは閲覧・Excel用、JSONは完全バックアップ・復元用。

## 主要データ
- `users`: 利用者設定
- `bowelRecords`: 排便記録
- `menstrualRecords`: 月経記録
- `medicationSettings`: 将来の薬剤設定拡張用
- `systemSettings`: 3日目・4日目などの判定基準

## 排便日数
排便確認がある日を0日目とし、次の排便までの経過日数をアプリ側で算出する。保存時には必要に応じて算出値をCSVへ出力する。
