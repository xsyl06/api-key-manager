package storage

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"sync"

	"api-key-manager/internal/crypto"
	"api-key-manager/internal/models"
)

const (
	DataDir      = "data"
	DataFile     = "data.json"
	KeyFile      = "master.key"
	DataChecksum = "data.sha256"
	KeyChecksum  = "master.sha256"

	// 版本号
	DataVersion = "1.1"
)

// Storage 存储层（并发安全）
type Storage struct {
	mu     sync.RWMutex
	dataDir string
}

// NewStorage 创建新的存储实例
func NewStorage(dataDir string) *Storage {
	return &Storage{
		dataDir: dataDir,
	}
}

// Init 初始化数据存储
func (s *Storage) Init() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	// 创建数据目录
	if err := os.MkdirAll(s.dataDir, 0755); err != nil {
		return models.NewAppError(models.ErrStorageWriteFailed,
			"创建数据目录失败: "+err.Error())
	}

	// 初始化主密钥
	keyPath := s.getKeyPath()
	if _, err := os.Stat(keyPath); os.IsNotExist(err) {
		masterKey, err := crypto.GenerateMasterKey()
		if err != nil {
			return err
		}

		if err := os.WriteFile(keyPath, masterKey, 0600); err != nil {
			return models.NewAppError(models.ErrStorageWriteFailed,
				"写入密钥文件失败: "+err.Error())
		}

		// 写入校验和
		checksum := GenerateChecksum(masterKey)
		checksumPath := s.getKeyChecksumPath()
		if err := os.WriteFile(checksumPath, []byte(checksum), 0644); err != nil {
			return models.NewAppError(models.ErrStorageWriteFailed,
				"写入密钥校验和失败: "+err.Error())
		}
	}

	// 初始化数据文件
	dataPath := s.getDataPath()
	checksumPath := s.getDataChecksumPath()
	if _, err := os.Stat(dataPath); os.IsNotExist(err) {
		emptyData := &models.DataFile{
			Version: DataVersion,
			Items:   []models.APIKeyRecord{},
		}
		jsonData, err := json.MarshalIndent(emptyData, "", "  ")
		if err != nil {
			return models.NewAppError(models.ErrStorageWriteFailed,
				"序列化初始数据失败: "+err.Error())
		}

		if err := os.WriteFile(dataPath, jsonData, 0644); err != nil {
			return models.NewAppError(models.ErrStorageWriteFailed,
				"写入数据文件失败: "+err.Error())
		}

		checksum := GenerateChecksum(jsonData)
		if err := os.WriteFile(checksumPath, []byte(checksum), 0644); err != nil {
			return models.NewAppError(models.ErrStorageWriteFailed,
				"写入校验和失败: "+err.Error())
		}
	}

	return nil
}

// ReadData 读取数据
func (s *Storage) ReadData() (*models.DataFile, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	dataPath := s.getDataPath()
	checksumPath := s.getDataChecksumPath()

	// 验证校验和
	if err := VerifyChecksum(dataPath, checksumPath); err != nil {
		return nil, err
	}

	// 读取文件
	data, err := os.ReadFile(dataPath)
	if err != nil {
		return nil, models.NewAppError(models.ErrDataCorrupted,
			"读取数据文件失败: "+err.Error())
	}

	// 解析 JSON
	var result models.DataFile
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, models.NewAppError(models.ErrDataCorrupted,
			"解析数据文件失败: "+err.Error())
	}

	// 数据迁移：V1.0 -> V1.1
	if result.Version == "1.0" || result.Version == "" {
		if err := s.migrateV1ToV1_1(&result); err != nil {
			return nil, err
		}
		// 迁移后写入数据
		jsonData, _ := json.MarshalIndent(result, "", "  ")
		if err := s.writeDataInternal(&result, jsonData); err != nil {
			return nil, err
		}
	}

	return &result, nil
}

// WriteData 写入数据（原子操作）
func (s *Storage) WriteData(data *models.DataFile) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	dataPath := s.getDataPath()
	tmpPath := dataPath + ".tmp"
	checksumPath := s.getDataChecksumPath()

	// 序列化数据
	jsonData, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return models.NewAppError(models.ErrStorageWriteFailed,
			"序列化数据失败: "+err.Error())
	}

	// 备份现有文件
	if _, err := os.Stat(dataPath); err == nil {
		backupPath := dataPath + ".bak"
		// 忽略备份错误，继续执行
		_ = os.WriteFile(backupPath, jsonData, 0644)
	}

	// 写入临时文件
	if err := os.WriteFile(tmpPath, jsonData, 0644); err != nil {
		return models.NewAppError(models.ErrStorageWriteFailed,
			"写入临时文件失败: "+err.Error())
	}

	// 原子重命名
	if err := os.Rename(tmpPath, dataPath); err != nil {
		os.Remove(tmpPath) // 清理临时文件
		return models.NewAppError(models.ErrStorageWriteFailed,
			"重命名数据文件失败: "+err.Error())
	}

	// 更新校验和
	checksum := GenerateChecksum(jsonData)
	if err := os.WriteFile(checksumPath, []byte(checksum), 0644); err != nil {
		return models.NewAppError(models.ErrStorageWriteFailed,
			"写入校验和失败: "+err.Error())
	}

	return nil
}

// ReadMasterKey 读取主密钥
func (s *Storage) ReadMasterKey() ([]byte, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	keyPath := s.getKeyPath()
	checksumPath := s.getKeyChecksumPath()

	// 验证校验和
	if err := VerifyChecksum(keyPath, checksumPath); err != nil {
		return nil, err
	}

	// 读取密钥
	key, err := os.ReadFile(keyPath)
	if err != nil {
		return nil, models.NewAppError(models.ErrMasterKeyMissing,
			"读取密钥文件失败: "+err.Error())
	}

	// 验证密钥长度
	if err := crypto.ValidateKey(key); err != nil {
		return nil, err
	}

	return key, nil
}

// GetDataDir 获取数据目录路径
func (s *Storage) GetDataDir() string {
	return s.dataDir
}

// 辅助方法
func (s *Storage) getDataPath() string {
	return filepath.Join(s.dataDir, DataFile)
}

func (s *Storage) getDataChecksumPath() string {
	return filepath.Join(s.dataDir, DataChecksum)
}

func (s *Storage) getKeyPath() string {
	return filepath.Join(s.dataDir, KeyFile)
}

func (s *Storage) getKeyChecksumPath() string {
	return filepath.Join(s.dataDir, KeyChecksum)
}

// GenerateChecksum 生成 SHA-256 校验和
func GenerateChecksum(data []byte) string {
	hash := sha256.Sum256(data)
	return hex.EncodeToString(hash[:])
}

// VerifyChecksum 验证校验和
func VerifyChecksum(filePath, checksumPath string) error {
	// 读取数据文件
	data, err := os.ReadFile(filePath)
	if err != nil {
		return models.NewAppError(models.ErrChecksumFailed,
			"读取文件失败: "+err.Error())
	}

	// 读取存储的校验和
	storedChecksum, err := os.ReadFile(checksumPath)
	if err != nil {
		return models.NewAppError(models.ErrChecksumFailed,
			"读取校验和文件失败: "+err.Error())
	}

	// 计算并比较
	computedChecksum := GenerateChecksum(data)
	if string(storedChecksum) != computedChecksum {
		return models.NewAppError(models.ErrChecksumFailed,
			"文件校验失败，数据可能已损坏")
	}

	return nil
}

// writeDataInternal 内部写入方法（不加锁，用于迁移）
func (s *Storage) writeDataInternal(data *models.DataFile, jsonData []byte) error {
	dataPath := s.getDataPath()
	checksumPath := s.getDataChecksumPath()

	// 备份现有文件
	if _, err := os.Stat(dataPath); err == nil {
		backupPath := dataPath + ".bak"
		_ = os.WriteFile(backupPath, jsonData, 0644)
	}

	// 写入文件
	if err := os.WriteFile(dataPath, jsonData, 0644); err != nil {
		return models.NewAppError(models.ErrStorageWriteFailed,
			"写入数据文件失败: "+err.Error())
	}

	// 更新校验和
	checksum := GenerateChecksum(jsonData)
	if err := os.WriteFile(checksumPath, []byte(checksum), 0644); err != nil {
		return models.NewAppError(models.ErrStorageWriteFailed,
			"写入校验和失败: "+err.Error())
	}

	return nil
}

// migrateV1ToV1_1 数据迁移 V1.0 -> V1.1
func (s *Storage) migrateV1ToV1_1(data *models.DataFile) error {
	// 收集所有唯一标签名
	tagNameSet := make(map[string]bool)
	tagColorMap := make(map[string]string)

	presetColors := []struct{ name, color string }{
		{"AI", "#667eea"}, {"MCP", "#f093fb"}, {"支付", "#10b981"},
		{"邮箱", "#f59e0b"}, {"代码", "#3b82f6"}, {"云服务", "#06b6d4"},
		{"社交", "#ec4899"}, {"其他", "#6b7280"},
	}
	presetColorMap := make(map[string]string)
	for _, pc := range presetColors {
		presetColorMap[pc.name] = pc.color
	}

	// 从现有记录中提取标签
	for _, item := range data.Items {
		for _, tagName := range item.Tags {
			if tagName != "" {
				tagNameSet[tagName] = true
				// 如果是预设标签，使用预设颜色
				if color, ok := presetColorMap[tagName]; ok {
					tagColorMap[tagName] = color
				} else if _, exists := tagColorMap[tagName]; !exists {
					// 非预设标签，随机分配一个预设颜色
					tagColorMap[tagName] = presetColors[len(tagColorMap)%len(presetColors)].color
				}
			}
		}
	}

	// 创建标签库
	tags := make([]models.Tag, 0, len(tagColorMap))
	tagNameToId := make(map[string]string)

	for tagName, color := range tagColorMap {
		tag := models.Tag{
			ID:        models.GenerateID(),
			Name:      tagName,
			Color:     color,
			CreatedAt: 1709107100000,
		}
		tags = append(tags, tag)
		tagNameToId[tagName] = tag.ID
	}

	// 如果没有标签，创建默认标签
	if len(tags) == 0 {
		for _, pc := range presetColors {
			tag := models.Tag{
				ID:        models.GenerateID(),
				Name:      pc.name,
				Color:     pc.color,
				CreatedAt: 1709107100000,
			}
			tags = append(tags, tag)
			tagNameToId[pc.name] = tag.ID
		}
	}

	// 转换 APIKeyRecord：Tags -> TagIds
	for i, item := range data.Items {
		tagIds := make([]string, 0, len(item.Tags))
		for _, tagName := range item.Tags {
			if tagId, ok := tagNameToId[tagName]; ok {
				tagIds = append(tagIds, tagId)
			}
		}
		data.Items[i].TagIds = tagIds
		data.Items[i].Tags = nil // 清空旧字段
	}

	// 更新数据结构
	data.Tags = tags
	data.Version = "1.1"

	return nil
}
