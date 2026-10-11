#!/usr/bin/env bash
# 在 GitHub 上建仓库并推送本主题。
#
# 凭据来源（按顺序尝试）：
#   1. 环境变量 GH_TOKEN / GITHUB_TOKEN
#   2. 第一个参数
#   3. `git credential fill`（也就是 Git Credential Manager 里已登录的账号）
#
# 用法：
#   bash scripts/push-to-github.sh [仓库名] [token]
#   GH_TOKEN=github_pat_xxx bash scripts/push-to-github.sh
set -euo pipefail

REPO_NAME="${1:-CFSM-Theme-DragonBallPark}"
TOKEN="${2:-${GH_TOKEN:-${GITHUB_TOKEN:-}}}"

GCM="/mingw64/bin/git-credential-manager"

if [ -z "$TOKEN" ]; then
  echo "==> 从 Git Credential Manager 取凭据"
  HELPER="$GCM"
  [ -x "$HELPER" ] || HELPER="manager"
  CRED="$(printf 'protocol=https\nhost=github.com\n\n' | git -c "credential.helper=$HELPER" credential fill 2>/dev/null || true)"
  TOKEN="$(printf '%s\n' "$CRED" | sed -n 's/^password=//p' | head -1)"
fi

if [ -z "$TOKEN" ]; then
  echo "拿不到凭据。先执行下面这条完成登录，再重跑本脚本：" >&2
  echo "  git-credential-manager github login --browser" >&2
  echo "或者直接传 token：GH_TOKEN=xxx bash $0" >&2
  exit 1
fi

API="https://api.github.com"
AUTH_HEADER="Authorization: Bearer $TOKEN"
ACCEPT="Accept: application/vnd.github+json"

echo "==> 读取账号信息"
LOGIN="$(curl -sS -H "$AUTH_HEADER" -H "$ACCEPT" "$API/user" \
  | sed -n 's/.*"login":[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
if [ -z "$LOGIN" ]; then
  echo "token 无效或权限不足。" >&2
  exit 1
fi
echo "    账号：$LOGIN"

echo "==> 建仓库 $LOGIN/$REPO_NAME（private）"
BODY="$(printf '{"name":"%s","private":true,"description":"CF-Server-Monitor 主题：龙珠公园（移植自 Exia Monitor）"}' "$REPO_NAME")"
CODE="$(curl -sS -o /tmp/gh-create.json -w '%{http_code}' \
  -X POST -H "$AUTH_HEADER" -H "$ACCEPT" "$API/user/repos" -d "$BODY")"
case "$CODE" in
  201) echo "    已创建" ;;
  422) echo "    仓库已存在，直接推送" ;;
  *)   echo "    建仓库失败（HTTP $CODE）：" >&2; head -c 400 /tmp/gh-create.json >&2; echo >&2; exit 1 ;;
esac

echo "==> 推送 main"
git remote remove origin 2>/dev/null || true
git remote add origin "https://github.com/$LOGIN/$REPO_NAME.git"
git -c credential.helper= -c "http.extraheader=Authorization: Bearer $TOKEN" push -u origin main

echo
echo "完成：https://github.com/$LOGIN/$REPO_NAME"
echo
echo "还需要你做两件事："
echo "  1. Settings → Actions → General → Workflow permissions 选 Read and write"
echo "  2. 等 Actions 跑完，取 dist 分支最新提交的 40 位 SHA，"
echo "     把 https://github.com/$LOGIN/$REPO_NAME/tree/<SHA> 填进 CFSM 后台的自定义主题 URL"
