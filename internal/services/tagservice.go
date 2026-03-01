package services

import (
	"strings"
	"sync"
	"time"

	"api-key-manager/internal/models"
	"api-key-manager/internal/storage"
)

// TagService 标签管理服务
type TagService struct {
	storage *storage.Storage
	mu      sync.RWMutex
}

// NewTagService 创建 TagService 实例
func NewTagService(dataDir string) *TagService {
	return &TagService{
		storage: storage.NewStorage(dataDir),
	}
}

// Init 初始化服务，如果标签库为空则创建预设标签
func (s *TagService) Init() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := s.storage.ReadData()
	if err != nil {
		return err
	}

	// 如果标签库为空，初始化预设标签
	if len(data.Tags) == 0 {
		data.Tags = s.getDefaultTags()
		return s.storage.WriteData(data)
	}

	return nil
}

// CreateTag 创建新标签
func (s *TagService) CreateTag(name, color string) (*models.Tag, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// 验证输入
	name = strings.TrimSpace(name)
	color = strings.TrimSpace(color)

	if name == "" {
		return nil, models.NewAppError(models.ErrInvalidInput, "标签名称不能为空")
	}
	if len(name) > 20 {
		return nil, models.NewAppError(models.ErrInvalidInput, "标签名称不能超过20个字符")
	}
	if color == "" {
		return nil, models.NewAppError(models.ErrInvalidInput, "标签颜色不能为空")
	}

	// 验证颜色格式 (HEX 格式)
	if !isValidColor(color) {
		return nil, models.NewAppError(models.ErrInvalidInput, "颜色格式错误，请使用 HEX 格式（如 #667eea）")
	}

	// 读取数据
	data, err := s.storage.ReadData()
	if err != nil {
		return nil, err
	}

	// 检查名称唯一性（不区分大小写）
	for _, tag := range data.Tags {
		if strings.EqualFold(tag.Name, name) {
			return nil, models.NewAppError(models.ErrTagAlreadyExists, "标签已存在")
		}
	}

	// 创建新标签
	tag := &models.Tag{
		ID:        models.GenerateID(),
		Name:      name,
		Color:     color,
		CreatedAt: time.Now().UnixMilli(),
	}

	data.Tags = append(data.Tags, *tag)

	// 写入存储
	if err := s.storage.WriteData(data); err != nil {
		return nil, err
	}

	return tag, nil
}

// UpdateTag 更新标签
func (s *TagService) UpdateTag(id, name, color string) (*models.Tag, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// 验证输入
	name = strings.TrimSpace(name)
	color = strings.TrimSpace(color)

	if id == "" {
		return nil, models.NewAppError(models.ErrInvalidInput, "标签 ID 不能为空")
	}
	if name == "" {
		return nil, models.NewAppError(models.ErrInvalidInput, "标签名称不能为空")
	}
	if len(name) > 20 {
		return nil, models.NewAppError(models.ErrInvalidInput, "标签名称不能超过20个字符")
	}
	if color == "" {
		return nil, models.NewAppError(models.ErrInvalidInput, "标签颜色不能为空")
	}

	// 验证颜色格式
	if !isValidColor(color) {
		return nil, models.NewAppError(models.ErrInvalidInput, "颜色格式错误，请使用 HEX 格式（如 #667eea）")
	}

	// 读取数据
	data, err := s.storage.ReadData()
	if err != nil {
		return nil, err
	}

	// 查找并更新标签
	var found bool
	var updatedTag *models.Tag
	for i, tag := range data.Tags {
		if tag.ID == id {
			found = true
			// 检查名称唯一性（排除自己）
			for j, other := range data.Tags {
				if j != i && strings.EqualFold(other.Name, name) {
					return nil, models.NewAppError(models.ErrTagAlreadyExists, "标签名称已存在")
				}
			}

			updatedTag = &models.Tag{
				ID:        tag.ID,
				Name:      name,
				Color:     color,
				CreatedAt: tag.CreatedAt,
			}
			data.Tags[i] = *updatedTag
			break
		}
	}

	if !found {
		return nil, models.NewAppError(models.ErrTagNotFound, "标签不存在")
	}

	// 写入存储
	if err := s.storage.WriteData(data); err != nil {
		return nil, err
	}

	return updatedTag, nil
}

// DeleteTag 删除标签
func (s *TagService) DeleteTag(id string, removeFromKeys bool) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if id == "" {
		return false, models.NewAppError(models.ErrInvalidInput, "标签 ID 不能为空")
	}

	// 读取数据
	data, err := s.storage.ReadData()
	if err != nil {
		return false, err
	}

	// 查找标签
	var found bool
	newTags := make([]models.Tag, 0, len(data.Tags))

	for _, tag := range data.Tags {
		if tag.ID == id {
			found = true
		} else {
			newTags = append(newTags, tag)
		}
	}

	if !found {
		return false, models.NewAppError(models.ErrTagNotFound, "标签不存在")
	}

	// 如果需要从所有 Key 中移除
	if removeFromKeys {
		for i, item := range data.Items {
			newTagIds := make([]string, 0, len(item.TagIds))
			for _, tagId := range item.TagIds {
				if tagId != id {
					newTagIds = append(newTagIds, tagId)
				}
			}
			data.Items[i].TagIds = newTagIds
		}
	}

	data.Tags = newTags

	// 写入存储
	if err := s.storage.WriteData(data); err != nil {
		return false, err
	}

	return true, nil
}

// GetAllTags 获取所有标签
func (s *TagService) GetAllTags() ([]models.Tag, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	data, err := s.storage.ReadData()
	if err != nil {
		return nil, err
	}

	return data.Tags, nil
}

// GetTagUsageCount 获取标签使用数量
func (s *TagService) GetTagUsageCount(id string) (int, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	data, err := s.storage.ReadData()
	if err != nil {
		return 0, err
	}

	count := 0
	for _, item := range data.Items {
		for _, tagId := range item.TagIds {
			if tagId == id {
				count++
				break
			}
		}
	}

	return count, nil
}

// ValidateTagIds 验证标签ID是否都存在于标签库中
// 返回无效的标签ID列表
func (s *TagService) ValidateTagIds(tagIds []string) ([]string, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if len(tagIds) == 0 {
		return nil, nil
	}

	data, err := s.storage.ReadData()
	if err != nil {
		return nil, err
	}

	// 构建有效标签ID集合
	validIds := make(map[string]bool)
	for _, tag := range data.Tags {
		validIds[tag.ID] = true
	}

	// 找出无效的标签ID
	var invalidIds []string
	for _, id := range tagIds {
		if !validIds[id] {
			invalidIds = append(invalidIds, id)
		}
	}

	return invalidIds, nil
}

// GetTagById 根据ID获取标签
func (s *TagService) GetTagById(id string) (*models.Tag, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if id == "" {
		return nil, models.NewAppError(models.ErrInvalidInput, "标签 ID 不能为空")
	}

	data, err := s.storage.ReadData()
	if err != nil {
		return nil, err
	}

	for _, tag := range data.Tags {
		if tag.ID == id {
			return &models.Tag{
				ID:        tag.ID,
				Name:      tag.Name,
				Color:     tag.Color,
				CreatedAt: tag.CreatedAt,
			}, nil
		}
	}

	return nil, models.NewAppError(models.ErrTagNotFound, "标签不存在")
}

// getDefaultTags 获取预设标签
func (s *TagService) getDefaultTags() []models.Tag {
	now := time.Now().UnixMilli()
	return []models.Tag{
		{ID: models.GenerateID(), Name: "AI", Color: "#667eea", CreatedAt: now},
		{ID: models.GenerateID(), Name: "MCP", Color: "#f093fb", CreatedAt: now},
		{ID: models.GenerateID(), Name: "支付", Color: "#10b981", CreatedAt: now},
		{ID: models.GenerateID(), Name: "邮箱", Color: "#f59e0b", CreatedAt: now},
		{ID: models.GenerateID(), Name: "代码", Color: "#3b82f6", CreatedAt: now},
		{ID: models.GenerateID(), Name: "云服务", Color: "#06b6d4", CreatedAt: now},
		{ID: models.GenerateID(), Name: "社交", Color: "#ec4899", CreatedAt: now},
		{ID: models.GenerateID(), Name: "其他", Color: "#6b7280", CreatedAt: now},
	}
}

// isValidColor 验证颜色格式（HEX 格式）
func isValidColor(color string) bool {
	if len(color) != 7 {
		return false
	}
	if color[0] != '#' {
		return false
	}
	for _, c := range color[1:] {
		if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')) {
			return false
		}
	}
	return true
}
