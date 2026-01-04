#!/bin/bash

# Pre-commit hook：在提交前检测敏感信息
# 安装：ln -s ../../scripts/pre-commit.sh .git/hooks/pre-commit

set -e

echo "🔍 运行 pre-commit 安全检查..."

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查是否安装了 gitleaks
if command -v gitleaks &> /dev/null; then
    echo "  → 运行 Gitleaks 扫描..."
    if gitleaks protect --staged --verbose; then
        echo -e "${GREEN}✓ Gitleaks: 未发现泄露${NC}"
    else
        echo -e "${RED}✗ Gitleaks: 发现敏感信息！${NC}"
        echo ""
        echo "请移除敏感信息后再提交。"
        echo "如果这是误报，请更新 .gitleaks.toml 配置文件。"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠ 未安装 Gitleaks，跳过检查${NC}"
    echo "  安装：brew install gitleaks"
fi

# 检查敏感文件
echo "  → 检查敏感文件..."
SENSITIVE_FILES=(
    "compose.stable.yaml"
    "compose.dev.yaml"
    ".env"
    ".env.local"
)

FOUND_SENSITIVE=0
for file in "${SENSITIVE_FILES[@]}"; do
    if git diff --cached --name-only | grep -q "^${file}$"; then
        echo -e "${RED}✗ 发现敏感文件: $file${NC}"
        FOUND_SENSITIVE=1
    fi
done

if [ $FOUND_SENSITIVE -eq 1 ]; then
    echo ""
    echo -e "${RED}错误：尝试提交敏感文件！${NC}"
    echo "这些文件包含敏感信息，不应提交到 git。"
    echo ""
    echo "请执行以下操作："
    echo "  1. git reset HEAD <文件名>  # 取消暂存"
    echo "  2. 确保文件已在 .gitignore 中"
    echo "  3. 使用环境变量或 .env 文件存储敏感信息"
    exit 1
fi

# 检查硬编码的密钥模式
echo "  → 检查硬编码密钥..."
PATTERNS=(
    'TG_BOT_TOKEN.*[0-9]{10}:[A-Za-z0-9_-]{35}'
    'TG_API_HASH.*[0-9a-f]{32}'
    'password.*[:=].*["\047][^"\047]{8,}["\047]'
)

FOUND_PATTERN=0
for pattern in "${PATTERNS[@]}"; do
    if git diff --cached -- . ":(exclude)compose.example.yaml" | grep -iE "$pattern" > /dev/null; then
        echo -e "${RED}✗ 发现可疑模式: $pattern${NC}"
        FOUND_PATTERN=1
    fi
done

if [ $FOUND_PATTERN -eq 1 ]; then
    echo ""
    echo -e "${RED}错误：在代码中发现可能的硬编码密钥！${NC}"
    echo "请使用环境变量替代。"
    echo ""
    echo "正确做法："
    echo "  const token = process.env.TG_BOT_TOKEN  // ✓"
    echo ""
    echo "错误做法："
    echo "  const token = '123456:abcdef...'       // ✗"
    exit 1
fi

echo -e "${GREEN}✓ 自定义检查: 通过${NC}"
echo ""
echo -e "${GREEN}✅ 所有安全检查通过！${NC}"
