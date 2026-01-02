# 技术债：feature-kit 的 main/src 导入

## 现状

feature-kit 包中约有 50+ 个文件使用相对路径导入 main/src 中的类型和工具：

```typescript
import type Instance from '../../../../../main/src/domain/models/Instance'
import type ForwardMap from '../../../../../main/src/domain/models/ForwardMap'
import { getEventPublisher } from '../../../../../main/src/plugins/core/event-publisher'
```

## 为什么暂时保留

### 1. 架构考虑
- **feature-kit 是 main 的扩展**：这些特性本质上属于核心应用逻辑
- **紧密耦合是合理的**：Instance、ForwardMap 等是核心领域模型
- **避免过度拆分**：创建过多小包会增加维护复杂度

### 2. 技术考虑  
- **主要是类型导入**：这些导入在运行时会被 TypeScript 擦除，不影响打包
- **无循环依赖风险**：main 不依赖 feature-kit，依赖方向清晰
- **测试已通过**：598/598 测试全部通过，证明当前结构可行

### 3. 实用考虑
- **工作量大**：修改需要重构 50+ 文件和 main 包
- **收益有限**：不会带来功能或性能提升
- **时机不对**：当前正在测试稳定化阶段

## 导入分类

### 类型导入 (~30处)
- `Instance`, `ForwardMap` - 核心领域模型
- `IQQClient`, `Telegram` - 基础设施接口
- `MessageSegment` - 插件接口

### 工具函数 (~15处)  
- `silk` - 音频编码工具
- `getEventPublisher` - 事件系统
- `md5Hex`, `DurationParser` - 通用工具

### 其他 (~5处)
- `performanceMonitor` - 已移至 @napgram/infra-kit
- `messageConverter` - 消息转换器

## 未来重构路径

当以下条件满足时，可以考虑重构：

1. **feature-kit 需要独立发布** - 作为独立 npm 包
2. **main 包需要拆分** - 微服务化或模块化重构
3. **出现循环依赖** - 当前架构无法支持新功能

### 可能的重构方案

**创建共享包**：
- `@napgram/types` - 导出所有核心类型
- `@napgram/utils` - 导出通用工具函数
- `@napgram/plugin-sdk` - 导出插件接口

## 决策记录

- **日期**: 2026-01-02
- **决策**: 保留 feature-kit 中的 main/src 相对路径导入
- **原因**: 架构合理、技术可行、实用考虑
- **审查周期**: 每次大版本更新时重新评估

---

*这不是技术缺陷，而是务实的架构选择。*
