#!/bin/bash
# 批量替换 works → contents 的脚本
# 使用前请确保已经备份代码和数据库！

echo "======================================"
echo "🔄 批量替换: works → contents"
echo "======================================"
echo ""

# 设置项目根目录
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "📁 工作目录: $PROJECT_ROOT"
echo ""

# 统计需要修改的文件数
echo "======================================"
echo "📊 扫描需要修改的文件"
echo "======================================"
echo ""

PACKAGES_COUNT=$(grep -r "\bworks\b" packages --include="*.js" 2>/dev/null | wc -l)
TESTS_COUNT=$(grep -r "\bworks\b" tests --include="*.js" 2>/dev/null | wc -l)

echo "packages/ 目录: $PACKAGES_COUNT 处引用"
echo "tests/ 目录: $TESTS_COUNT 处引用"
echo ""

# 确认是否继续
read -p "是否继续执行替换？(y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]
then
    echo "❌ 操作已取消"
    exit 1
fi

echo ""
echo "======================================"
echo "🚀 开始批量替换"
echo "======================================"
echo ""

# 1. 表名替换
echo "1. 替换表名: works → contents"
find packages tests -name "*.js" -type f -exec sed -i "s/'works'/'contents'/g" {} \;
find packages tests -name "*.js" -type f -exec sed -i 's/"works"/"contents"/g' {} \;
find packages tests -name "*.js" -type f -exec sed -i 's/FROM works/FROM contents/g' {} \;
find packages tests -name "*.js" -type f -exec sed -i 's/INTO works/INTO contents/g' {} \;
find packages tests -name "*.js" -type f -exec sed -i 's/TABLE works/TABLE contents/g' {} \;
echo "   ✅ 表名替换完成"

# 2. 类名替换
echo "2. 替换类名: WorksDAO → ContentsDAO"
find packages -name "*.js" -type f -exec sed -i 's/WorksDAO/ContentsDAO/g' {} \;
find packages -name "*.js" -type f -exec sed -i 's/worksDAO/contentsDAO/g' {} \;
echo "   ✅ 类名替换完成"

# 3. 文件引用替换
echo "3. 替换文件引用: works-dao → contents-dao"
find packages -name "*.js" -type f -exec sed -i "s/'\.\/works-dao'/'\.\/contents-dao'/g" {} \;
find packages -name "*.js" -type f -exec sed -i 's/"\.\/works-dao"/"\.\/contents-dao"/g' {} \;
find packages -name "*.js" -type f -exec sed -i "s/require('\.\.\/database\/works-dao')/require('\.\.\/database\/contents-dao')/g" {} \;
echo "   ✅ 文件引用替换完成"

# 4. 字段名替换
echo "4. 替换字段名: platform_work_id → platform_content_id"
find packages -name "*.js" -type f -exec sed -i 's/platform_work_id/platform_content_id/g' {} \;
echo "   ✅ 字段名替换完成"

# 5. 类型字段替换
echo "5. 替换类型字段: work_type → content_type"
find packages -name "*.js" -type f -exec sed -i 's/work_type/content_type/g' {} \;
echo "   ✅ 类型字段替换完成"

# 6. 统计字段前缀替换
echo "6. 替换统计字段前缀"
find packages -name "*.js" -type f -exec sed -i 's/total_comment_count/stats_comment_count/g' {} \;
find packages -name "*.js" -type f -exec sed -i 's/new_comment_count/stats_new_comment_count/g' {} \;
echo "   ✅ 统计字段替换完成"

# 7. discussions 表外键替换
echo "7. 替换 discussions 表外键: work_id → content_id"
find packages -name "*.js" -type f -exec sed -i 's/work_id/content_id/g' {} \;
echo "   ✅ 外键字段替换完成"

# 8. 索引名替换
echo "8. 替换索引名: idx_works_ → idx_contents_"
find packages -name "*.js" -type f -exec sed -i 's/idx_works_/idx_contents_/g' {} \;
find packages -name "*.js" -type f -exec sed -i 's/idx_discussions_work/idx_discussions_content/g' {} \;
echo "   ✅ 索引名替换完成"

echo ""
echo "======================================"
echo "✅ 批量替换完成！"
echo "======================================"
echo ""

echo "📝 已完成的替换:"
echo "   ✅ works → contents (表名)"
echo "   ✅ WorksDAO → ContentsDAO (类名)"
echo "   ✅ works-dao → contents-dao (文件名)"
echo "   ✅ platform_work_id → platform_content_id"
echo "   ✅ work_type → content_type"
echo "   ✅ total_comment_count → stats_comment_count"
echo "   ✅ work_id → content_id"
echo "   ✅ idx_works_ → idx_contents_"
echo ""

echo "⚠️  注意事项:"
echo "   1. 请手动检查关键文件是否正确"
echo "   2. 运行测试验证功能"
echo "   3. 提交前再次确认"
echo ""
