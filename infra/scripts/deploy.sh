#!/usr/bin/env bash
# server/를 빌드하고, 화이트리스트(dist/node_modules/public/package.json)만 담아 zip으로
# 만든 뒤 S3 배포 버킷에 올린다. .env 등 server/ 밑의 다른 파일은 절대 포함하지 않는다.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$SCRIPT_DIR/../../server"
TERRAFORM_DIR="$SCRIPT_DIR/../terraform"
AWS_PROFILE_NAME="${AWS_PROFILE:-qrtf}"

BUCKET="$(cd "$TERRAFORM_DIR" && terraform output -raw deploy_artifacts_bucket_name)"
GIT_SHA="$(git -C "$SCRIPT_DIR/../.." rev-parse --short HEAD)"
VERSION="$(date +%Y%m%d%H%M%S)-${GIT_SHA}"
ARTIFACT_KEY="qring-server-${VERSION}.zip"

STAGING_DIR="$(mktemp -d)"
ZIP_PATH="$(mktemp -u).zip"
trap 'rm -rf "$STAGING_DIR" "$ZIP_PATH"' EXIT

echo "==> [1/5] TypeScript 빌드"
(cd "$SERVER_DIR" && npm run build)

echo "==> [2/5] 화이트리스트만 스테이징 디렉터리로 복사: $STAGING_DIR"
cp -r "$SERVER_DIR/dist" "$STAGING_DIR/dist"
cp -r "$SERVER_DIR/public" "$STAGING_DIR/public"
cp "$SERVER_DIR/package.json" "$STAGING_DIR/package.json"
cp "$SERVER_DIR/package-lock.json" "$STAGING_DIR/package-lock.json"

echo "==> [3/5] 프로덕션 의존성만 새로 설치 (devDependencies 제외)"
(cd "$STAGING_DIR" && npm ci --omit=dev)
rm -f "$STAGING_DIR/package-lock.json" # 설치 용도로만 필요, zip엔 불필요

echo "==> [4/5] zip 생성: dist, node_modules, public, package.json 만"
(cd "$STAGING_DIR" && zip -r -q "$ZIP_PATH" dist node_modules public package.json)

echo "==> [5/5] S3 업로드: s3://$BUCKET/$ARTIFACT_KEY (그리고 latest.zip 갱신)"
aws s3 cp "$ZIP_PATH" "s3://$BUCKET/$ARTIFACT_KEY" --profile "$AWS_PROFILE_NAME"
aws s3 cp "$ZIP_PATH" "s3://$BUCKET/latest.zip" --profile "$AWS_PROFILE_NAME"

echo "==> 완료: $ARTIFACT_KEY"
