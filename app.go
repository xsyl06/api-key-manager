package main

import (
	"context"

	"api-key-manager/internal/models"
	"api-key-manager/internal/services"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App Wails 应用结构
type App struct {
	ctx         context.Context
	service     *services.KeyService
	tagService  *services.TagService
}

// NewApp 创建新的 App 实例
func NewApp() *App {
	// 初始化 KeyService
	service := services.NewKeyService("./data")
	if err := service.Init(); err != nil {
		panic("初始化 KeyService 失败: " + err.Error())
	}

	// 初始化 TagService
	tagService := services.NewTagService("./data")
	if err := tagService.Init(); err != nil {
		panic("初始化 TagService 失败: " + err.Error())
	}

	return &App{
		service:    service,
		tagService: tagService,
	}
}

// startup 应用启动时调用
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

// === 暴露给前端的方法 ===

// LoadKeys 加载所有 API Key
func (a *App) LoadKeys() ([]interface{}, error) {
	keys, err := a.service.LoadKeys()
	if err != nil {
		return nil, err
	}
	// 转换为 interface{} 以便 JSON 序列化
	result := make([]interface{}, len(keys))
	for i, k := range keys {
		result[i] = k
	}
	return result, nil
}

// AddKey 添加新的 API Key
func (a *App) AddKey(website, key string, tagIds []string, note string) (interface{}, error) {
	record, err := a.service.AddKey(website, key, tagIds, note)
	if err != nil {
		return nil, err
	}
	return record, nil
}

// UpdateKey 更新 API Key
func (a *App) UpdateKey(id, website, key string, tagIds []string, note string) (interface{}, error) {
	record, err := a.service.UpdateKey(id, website, key, tagIds, note)
	if err != nil {
		return nil, err
	}
	return record, nil
}

// DeleteKey 删除 API Key
func (a *App) DeleteKey(id string) (bool, error) {
	return a.service.DeleteKey(id)
}

// DecryptKey 解密指定的 Key
func (a *App) DecryptKey(id string) (string, error) {
	return a.service.DecryptKey(id)
}

// GetTags 获取所有标签及数量（兼容旧版本）
func (a *App) GetTags() ([]interface{}, error) {
	tags, err := a.service.GetTags()
	if err != nil {
		return nil, err
	}
	result := make([]interface{}, len(tags))
	for i, t := range tags {
		result[i] = t
	}
	return result, nil
}

// SearchKeys 搜索 API Key
func (a *App) SearchKeys(query, selectedTag string) ([]interface{}, error) {
	keys, err := a.service.SearchKeys(query, selectedTag)
	if err != nil {
		return nil, err
	}
	result := make([]interface{}, len(keys))
	for i, k := range keys {
		result[i] = k
	}
	return result, nil
}

// ExportData 导出数据为 zip 文件
func (a *App) ExportData() (string, error) {
	return a.service.ExportData()
}

// OpenImportFileDialog 打开导入文件对话框，返回选择的 zip 文件路径
func (a *App) OpenImportFileDialog() (string, error) {
	filePath, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "选择导入文件",
		Filters: []runtime.FileFilter{
			{
				DisplayName: "ZIP 压缩文件 (*.zip)",
				Pattern:     "*.zip",
			},
		},
		CanCreateDirectories: true,
	})
	if err != nil {
		return "", err
	}
	// 用户取消选择
	if filePath == "" {
		return "", nil
	}
	return filePath, nil
}

// ImportData 导入 zip 文件，检测冲突
func (a *App) ImportData(zipPath string) (interface{}, error) {
	// 输入验证：确保路径不为空
	if zipPath == "" {
		return nil, models.NewAppError(models.ErrInvalidInput, "文件路径为空，请重新选择文件")
	}
	result, err := a.service.ImportData(zipPath)
	if err != nil {
		return nil, err
	}
	return result, nil
}

// ImportWithResolution 带冲突解决的导入
func (a *App) ImportWithResolution(zipPath string, resolutions map[string]string) (interface{}, error) {
	stats, err := a.service.ImportWithResolution(zipPath, resolutions)
	if err != nil {
		return nil, err
	}
	return stats, nil
}

// === 标签管理 API (V1.1 新增) ===

// CreateTag 创建新标签
func (a *App) CreateTag(name, color string) (interface{}, error) {
	tag, err := a.tagService.CreateTag(name, color)
	if err != nil {
		return nil, err
	}
	return tag, nil
}

// UpdateTag 更新标签
func (a *App) UpdateTag(id, name, color string) (interface{}, error) {
	tag, err := a.tagService.UpdateTag(id, name, color)
	if err != nil {
		return nil, err
	}
	return tag, nil
}

// DeleteTag 删除标签
func (a *App) DeleteTag(id string, removeFromKeys bool) (bool, error) {
	return a.tagService.DeleteTag(id, removeFromKeys)
}

// GetAllTags 获取所有标签
func (a *App) GetAllTags() ([]interface{}, error) {
	tags, err := a.tagService.GetAllTags()
	if err != nil {
		return nil, err
	}
	result := make([]interface{}, len(tags))
	for i, t := range tags {
		result[i] = t
	}
	return result, nil
}

// GetTagUsageCount 获取标签使用数量
func (a *App) GetTagUsageCount(id string) (int, error) {
	return a.tagService.GetTagUsageCount(id)
}
