package services

import (
	"archive/zip"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"api-key-manager/internal/crypto"
	"api-key-manager/internal/models"
	"api-key-manager/internal/storage"
)

// KeyService API Key 业务逻辑层
type KeyService struct {
	storage *storage.Storage
	mu      sync.RWMutex
}

// NewKeyService 创建 KeyService 实例
func NewKeyService(dataDir string) *KeyService {
	return &KeyService{
		storage: storage.NewStorage(dataDir),
	}
}

// Init 初始化服务
func (s *KeyService) Init() error {
	return s.storage.Init()
}

// LoadKeys 加载所有 API Key
func (s *KeyService) LoadKeys() ([]models.APIKeyRecord, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	data, err := s.storage.ReadData()
	if err != nil {
		return nil, err
	}

	return data.Items, nil
}

// AddKey 添加新的 API Key
func (s *KeyService) AddKey(website, key string, tagIds []string, note string) (*models.APIKeyRecord, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// 验证输入
	if website == "" {
		return nil, models.NewAppError(models.ErrInvalidInput, "网站名称不能为空")
	}
	if key == "" {
		return nil, models.NewAppError(models.ErrInvalidInput, "Key 不能为空")
	}

	// 读取主密钥
	masterKey, err := s.storage.ReadMasterKey()
	if err != nil {
		return nil, err
	}

	// 加密 Key
	encrypted, err := crypto.Encrypt(key, masterKey)
	if err != nil {
		return nil, err
	}

	// 创建记录
	record := &models.APIKeyRecord{
		ID:        models.GenerateID(),
		Website:   website,
		Key:       *encrypted,
		TagIds:    tagIds,
		Note:      note,
		CreatedAt: time.Now().UnixMilli(),
		UpdatedAt: time.Now().UnixMilli(),
	}

	// 读取现有数据
	data, err := s.storage.ReadData()
	if err != nil {
		return nil, err
	}

	// 添加新记录
	data.Items = append(data.Items, *record)

	// 写入存储
	if err := s.storage.WriteData(data); err != nil {
		return nil, err
	}

	return record, nil
}

// UpdateKey 更新 API Key
func (s *KeyService) UpdateKey(id, website, key string, tagIds []string, note string) (*models.APIKeyRecord, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// 验证输入
	if id == "" {
		return nil, models.NewAppError(models.ErrInvalidInput, "ID 不能为空")
	}
	if website == "" {
		return nil, models.NewAppError(models.ErrInvalidInput, "网站名称不能为空")
	}
	if key == "" {
		return nil, models.NewAppError(models.ErrInvalidInput, "Key 不能为空")
	}

	// 读取数据
	data, err := s.storage.ReadData()
	if err != nil {
		return nil, err
	}

	// 查找记录
	var found bool
	var record *models.APIKeyRecord
	for i, item := range data.Items {
		if item.ID == id {
			found = true
			// 读取主密钥
			masterKey, err := s.storage.ReadMasterKey()
			if err != nil {
				return nil, err
			}

			// 加密新 Key
			encrypted, err := crypto.Encrypt(key, masterKey)
			if err != nil {
				return nil, err
			}

			// 更新记录
			record = &models.APIKeyRecord{
				ID:        item.ID,
				Website:   website,
				Key:       *encrypted,
				TagIds:    tagIds,
				Note:      note,
				CreatedAt: item.CreatedAt,
				UpdatedAt: time.Now().UnixMilli(),
			}
			data.Items[i] = *record
			break
		}
	}

	if !found {
		return nil, models.NewAppError(models.ErrKeyNotFound, "未找到指定的 API Key")
	}

	// 写入存储
	if err := s.storage.WriteData(data); err != nil {
		return nil, err
	}

	return record, nil
}

// DeleteKey 删除 API Key
func (s *KeyService) DeleteKey(id string) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if id == "" {
		return false, models.NewAppError(models.ErrInvalidInput, "ID 不能为空")
	}

	// 读取数据
	data, err := s.storage.ReadData()
	if err != nil {
		return false, err
	}

	// 查找并删除
	found := false
	newItems := make([]models.APIKeyRecord, 0, len(data.Items))
	for _, item := range data.Items {
		if item.ID == id {
			found = true
			continue
		}
		newItems = append(newItems, item)
	}

	if !found {
		return false, models.NewAppError(models.ErrKeyNotFound, "未找到指定的 API Key")
	}

	data.Items = newItems

	// 写入存储
	if err := s.storage.WriteData(data); err != nil {
		return false, err
	}

	return true, nil
}

// DecryptKey 解密指定的 Key
func (s *KeyService) DecryptKey(id string) (string, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if id == "" {
		return "", models.NewAppError(models.ErrInvalidInput, "ID 不能为空")
	}

	// 读取数据
	data, err := s.storage.ReadData()
	if err != nil {
		return "", err
	}

	// 查找记录
	for _, item := range data.Items {
		if item.ID == id {
			// 读取主密钥
			masterKey, err := s.storage.ReadMasterKey()
			if err != nil {
				return "", err
			}

			// 解密
			return crypto.Decrypt(&item.Key, masterKey)
		}
	}

	return "", models.NewAppError(models.ErrKeyNotFound, "未找到指定的 API Key")
}

// GetTags 获取所有标签及数量
func (s *KeyService) GetTags() ([]models.TagInfo, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	data, err := s.storage.ReadData()
	if err != nil {
		return nil, err
	}

	tagMap := make(map[string]int)
	for _, item := range data.Items {
		for _, tag := range item.Tags {
			tagMap[tag]++
		}
	}

	result := make([]models.TagInfo, 0, len(tagMap))
	for name, count := range tagMap {
		result = append(result, models.TagInfo{
			Name:  name,
			Count: count,
		})
	}

	return result, nil
}

// SearchKeys 搜索 API Key（V1.1: 使用 TagIds）
func (s *KeyService) SearchKeys(query string, selectedTag string) ([]models.APIKeyRecord, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	data, err := s.storage.ReadData()
	if err != nil {
		return nil, err
	}

	query = strings.ToLower(query)

	// 创建 TagId 到 Tag 对象的映射
	tagMap := make(map[string]models.Tag)
	for _, tag := range data.Tags {
		tagMap[tag.ID] = tag
	}

	result := make([]models.APIKeyRecord, 0)

	for _, item := range data.Items {
		// 标签筛选（V1.1: 通过 TagId 匹配）
		if selectedTag != "" && selectedTag != "all" {
			tagMatched := false
			for _, tagId := range item.TagIds {
				if tagId == selectedTag {
					tagMatched = true
					break
				}
			}
			if !tagMatched {
				continue
			}
		}

		// 关键字搜索（V1.1: 搜索标签名）
		if query != "" {
			websiteMatch := strings.Contains(strings.ToLower(item.Website), query)
			noteMatch := strings.Contains(strings.ToLower(item.Note), query)
			tagMatch := false

			// 通过 TagId 查找标签名进行搜索
			for _, tagId := range item.TagIds {
				if tag, ok := tagMap[tagId]; ok {
					if strings.Contains(strings.ToLower(tag.Name), query) {
						tagMatch = true
						break
					}
				}
			}

			if !websiteMatch && !noteMatch && !tagMatch {
				continue
			}
		}

		result = append(result, item)
	}

	return result, nil
}

// ExportData 导出数据为 zip 文件，返回文件路径
func (s *KeyService) ExportData() (string, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	// 读取数据
	data, err := s.storage.ReadData()
	if err != nil {
		return "", err
	}

	// 读取主密钥
	masterKey, err := s.storage.ReadMasterKey()
	if err != nil {
		return "", err
	}

	// 创建导出目录
	exportDir := filepath.Join(s.storage.GetDataDir(), "export")
	os.MkdirAll(exportDir, 0755)

	// 生成文件名
	timestamp := time.Now().Format("2006-01-02-150405")
	zipPath := filepath.Join(exportDir, fmt.Sprintf("export-%s.zip", timestamp))

	// 创建 zip 文件
	zipFile, err := os.Create(zipPath)
	if err != nil {
		return "", models.NewAppError(models.ErrStorageWriteFailed, "创建导出文件失败: "+err.Error())
	}
	defer zipFile.Close()

	zipWriter := zip.NewWriter(zipFile)
	defer zipWriter.Close()

	// 添加 data.json
	dataJSON, _ := json.MarshalIndent(data, "", "  ")
	if err := addFileToZip(zipWriter, "data.json", dataJSON); err != nil {
		return "", err
	}

	// 添加 master.key
	if err := addFileToZip(zipWriter, "master.key", masterKey); err != nil {
		return "", err
	}

	// 创建并添加 manifest.json
	manifest := map[string]interface{}{
		"version":     "1.1.0",
		"exportedAt":  time.Now().Format(time.RFC3339),
		"recordCount": len(data.Items),
		"tagCount":    len(data.Tags),
	}
	manifestJSON, _ := json.MarshalIndent(manifest, "", "  ")
	if err := addFileToZip(zipWriter, "manifest.json", manifestJSON); err != nil {
		return "", err
	}

	return zipPath, nil
}

// ImportData 导入 zip 文件，检测冲突
func (s *KeyService) ImportData(zipPath string) (map[string]interface{}, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// 验证 zip 文件存在
	if _, err := os.Stat(zipPath); os.IsNotExist(err) {
		return nil, models.NewAppError(models.ErrInvalidInput, "文件不存在: "+zipPath)
	}

	// 解压到临时目录
	tempDir, err := os.MkdirTemp("", "api-key-manager-import-*")
	if err != nil {
		return nil, models.NewAppError(models.ErrStorageWriteFailed, "创建临时目录失败: "+err.Error())
	}
	defer os.RemoveAll(tempDir)

	if err := unzipFile(zipPath, tempDir); err != nil {
		return nil, err
	}

	// 验证必需文件
	dataPath := filepath.Join(tempDir, "data.json")
	keyPath := filepath.Join(tempDir, "master.key")
	if _, err := os.Stat(dataPath); os.IsNotExist(err) {
		return nil, models.NewAppError(models.ErrDataCorrupted, "导出文件中缺少 data.json")
	}
	if _, err := os.Stat(keyPath); os.IsNotExist(err) {
		return nil, models.NewAppError(models.ErrMasterKeyMissing, "导出文件中缺少 master.key")
	}

	// 读取导入的数据
	importData, err := os.ReadFile(dataPath)
	if err != nil {
		return nil, models.NewAppError(models.ErrDataCorrupted, "读取数据文件失败: "+err.Error())
	}

	var importFile models.DataFile
	if err := json.Unmarshal(importData, &importFile); err != nil {
		return nil, models.NewAppError(models.ErrDataCorrupted, "解析数据文件失败: "+err.Error())
	}

	// 读取现有数据
	currentData, err := s.storage.ReadData()
	if err != nil {
		return nil, err
	}

	// 检测冲突
	conflicts := []map[string]interface{}{}
	existingIds := make(map[string]bool)
	existingItems := make(map[string]models.APIKeyRecord)
	for _, item := range currentData.Items {
		existingIds[item.ID] = true
		existingItems[item.ID] = item
	}

	for _, importItem := range importFile.Items {
		if existingIds[importItem.ID] {
			// 找到冲突
			existingItem := existingItems[importItem.ID]
			conflict := map[string]interface{}{
				"id":          importItem.ID,
				"website":     importItem.Website,
				"existingUpdatedAt": formatTimestamp(existingItem.UpdatedAt),
				"importedUpdatedAt": formatTimestamp(importItem.UpdatedAt),
			}
			conflicts = append(conflicts, conflict)
		}
	}

	result := map[string]interface{}{
		"hasConflicts": len(conflicts) > 0,
		"conflicts":    conflicts,
		"newCount":     len(importFile.Items) - len(conflicts),
		"tempDir":      tempDir,
		"dataPath":     dataPath,
		"keyPath":      keyPath,
	}

	return result, nil
}

// ImportWithResolution 带冲突解决的导入
func (s *KeyService) ImportWithResolution(zipPath string, resolutions map[string]string) (map[string]int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	fmt.Println("[ImportWithResolution] 开始处理，zipPath:", zipPath)

	// 验证 zip 文件存在
	if _, err := os.Stat(zipPath); os.IsNotExist(err) {
		return nil, models.NewAppError(models.ErrInvalidInput, "文件不存在: "+zipPath)
	}

	// 解压到临时目录
	tempDir, err := os.MkdirTemp("", "api-key-manager-import-*")
	if err != nil {
		return nil, models.NewAppError(models.ErrStorageWriteFailed, "创建临时目录失败: "+err.Error())
	}
	defer os.RemoveAll(tempDir)

	if err := unzipFile(zipPath, tempDir); err != nil {
		fmt.Println("[ImportWithResolution] 解压文件错误:", err)
		return nil, err
	}

	// 验证必需文件
	dataPath := filepath.Join(tempDir, "data.json")
	keyPath := filepath.Join(tempDir, "master.key")
	if _, err := os.Stat(dataPath); os.IsNotExist(err) {
		return nil, models.NewAppError(models.ErrDataCorrupted, "导出文件中缺少 data.json")
	}
	if _, err := os.Stat(keyPath); os.IsNotExist(err) {
		return nil, models.NewAppError(models.ErrMasterKeyMissing, "导出文件中缺少 master.key")
	}

	// 读取导入数据
	importDataBytes, err := os.ReadFile(dataPath)
	if err != nil {
		fmt.Println("[ImportWithResolution] 读取导入数据错误:", err)
		return nil, models.NewAppError(models.ErrDataCorrupted, "读取导入数据失败: "+err.Error())
	}
	var importFile models.DataFile
	if err := json.Unmarshal(importDataBytes, &importFile); err != nil {
		fmt.Println("[ImportWithResolution] 解析 JSON 错误:", err)
		return nil, models.NewAppError(models.ErrDataCorrupted, "解析导入数据失败: "+err.Error())
	}
	fmt.Println("[ImportWithResolution] 导入数据读取成功，条目数:", len(importFile.Items))

	// 读取现有数据
	currentData, err := s.storage.ReadData()
	if err != nil {
		fmt.Println("[ImportWithResolution] ReadData 错误:", err)
		return nil, err
	}
	fmt.Println("[ImportWithResolution] 现有数据读取成功，条目数:", len(currentData.Items))

	// ===== 新增：读取导入方的密钥 =====
	importKey, err := os.ReadFile(keyPath)
	if err != nil {
		return nil, models.NewAppError(models.ErrDataCorrupted, "读取导入密钥失败: "+err.Error())
	}
	if err := crypto.ValidateKey(importKey); err != nil {
		return nil, models.NewAppError(models.ErrDataCorrupted, "导入的密钥格式无效")
	}

	// ===== 新增：读取本地密钥 =====
	localKey, err := s.storage.ReadMasterKey()
	if err != nil {
		return nil, err
	}

	// ===== 新增：对导入的每个 Key 进行解密-再加密 =====
	for i := range importFile.Items {
		item := &importFile.Items[i]
		// 跳过空 Key（以防万一）
		if item.Key.Encrypted == "" {
			continue
		}

		// 解密-再加密
		reencrypted, err := reencryptAPIKey(&item.Key, importKey, localKey)
		if err != nil {
			// 如果解密失败，说明密钥不匹配，返回详细错误
			return nil, models.NewAppError(models.ErrDecryptionFailed,
				fmt.Sprintf("解密失败，密钥不匹配或数据损坏: %s (记录: %s)",
					err.Error(), item.Website))
		}
		item.Key = *reencrypted
	}
	fmt.Println("[ImportWithResolution] 所有 API Key 重新加密完成")

	// ===== 新增：构建标签ID映射表 =====
	tagIDMapping := buildTagIDMapping(importFile.Tags, currentData.Tags)
	fmt.Printf("[ImportWithResolution] 标签ID映射: %v\n", tagIDMapping)

	// ===== 新增：对导入的每个 APIKeyRecord 更新 TagIds =====
	for i := range importFile.Items {
		remapTagIDs(&importFile.Items[i], tagIDMapping)
	}
	fmt.Println("[ImportWithResolution] 所有 TagIds 重新映射完成")

	// 创建备份
	backupDir := filepath.Join(s.storage.GetDataDir(), "backup", time.Now().Format("2006-01-02-150405"))
	fmt.Println("[ImportWithResolution] 创建备份目录:", backupDir)
	os.MkdirAll(backupDir, 0755)
	fmt.Println("[ImportWithResolution] 开始复制备份目录")
	copyDir(s.storage.GetDataDir(), backupDir)
	fmt.Println("[ImportWithResolution] 备份完成")

	// 合并数据
	stats := map[string]int{"new": 0, "updated": 0, "skipped": 0}
	existingIds := make(map[string]bool)
	for _, item := range currentData.Items {
		existingIds[item.ID] = true
	}

	for _, importItem := range importFile.Items {
		resolution, hasConflict := resolutions[importItem.ID]

		if !hasConflict {
			// 新记录，直接添加
			currentData.Items = append(currentData.Items, importItem)
			stats["new"]++
		} else if resolution == "keep" {
			stats["skipped"]++
		} else if resolution == "replace" {
			// 替换现有记录
			for i, item := range currentData.Items {
				if item.ID == importItem.ID {
					currentData.Items[i] = importItem
					stats["updated"]++
					break
				}
			}
		} else if resolution == "both" {
			// 保留两者：导入的记录添加为新记录
			newItem := importItem
			newItem.ID = models.GenerateID()
			newItem.Website = importItem.Website + "-导入"
			currentData.Items = append(currentData.Items, newItem)
			stats["new"]++
		}
	}
	fmt.Println("[ImportWithResolution] 合并完成，stats:", stats)

	// 合并标签库（使用映射后的ID）
	existingTagNames := make(map[string]bool)
	for _, tag := range currentData.Tags {
		existingTagNames[tag.Name] = true
	}
	for _, importTag := range importFile.Tags {
		if !existingTagNames[importTag.Name] {
			// 使用映射后的ID（新标签保留原ID，同名标签不新增）
			newTag := importTag
			newTag.ID = tagIDMapping[importTag.ID]
			currentData.Tags = append(currentData.Tags, newTag)
		}
	}

	// 写入数据
	fmt.Println("[ImportWithResolution] 开始写入数据")
	if err := s.storage.WriteData(currentData); err != nil {
		fmt.Println("[ImportWithResolution] WriteData 错误:", err)
		return nil, err
	}
	fmt.Println("[ImportWithResolution] 写入完成")

	// 复制密钥文件（可选，如果导出的密钥不同）
	// 这里我们保持现有密钥不变

	return stats, nil
}

// addFileToZip 添加文件到 zip
func addFileToZip(zipWriter *zip.Writer, filename string, data []byte) error {
	writer, err := zipWriter.Create(filename)
	if err != nil {
		return models.NewAppError(models.ErrStorageWriteFailed, "创建zip条目失败: "+err.Error())
	}
	_, err = writer.Write(data)
	if err != nil {
		return models.NewAppError(models.ErrStorageWriteFailed, "写入zip条目失败: "+err.Error())
	}
	return nil
}

// unzipFile 解压 zip 文件
func unzipFile(zipPath, destDir string) error {
	reader, err := zip.OpenReader(zipPath)
	if err != nil {
		return models.NewAppError(models.ErrDataCorrupted, "打开zip文件失败: "+err.Error())
	}
	defer reader.Close()

	for _, file := range reader.File {
		path := filepath.Join(destDir, file.Name)
		if file.FileInfo().IsDir() {
			os.MkdirAll(path, 0755)
			continue
		}

		if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
			return err
		}

		destFile, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0644)
		if err != nil {
			return err
		}

		srcFile, err := file.Open()
		if err != nil {
			destFile.Close()
			return err
		}

		_, err = io.Copy(destFile, srcFile)
		srcFile.Close()
		destFile.Close()

		if err != nil {
			return err
		}
	}

	return nil
}

// formatTimestamp 格式化时间戳
func formatTimestamp(ts int64) string {
	if ts == 0 {
		return "未知"
	}
	return time.UnixMilli(ts).Format("2006-01-02 15:04:05")
}

// copyFile 复制文件
func copyFile(src, dst string) error {
	input, err := os.ReadFile(src)
	if err != nil {
		return err
	}
	return os.WriteFile(dst, input, 0644)
}

// copyDir 复制目录（排除 backup 和 export 目录）
func copyDir(src, dst string) error {
	if err := os.MkdirAll(dst, 0755); err != nil {
		return err
	}

	entries, err := os.ReadDir(src)
	if err != nil {
		return err
	}

	for _, entry := range entries {
		// 跳过 backup 和 export 目录，避免递归复制
		if entry.IsDir() && (entry.Name() == "backup" || entry.Name() == "export") {
			continue
		}

		srcPath := filepath.Join(src, entry.Name())
		dstPath := filepath.Join(dst, entry.Name())

		if entry.IsDir() {
			if err := copyDir(srcPath, dstPath); err != nil {
				return err
			}
		} else {
			if err := copyFile(srcPath, dstPath); err != nil {
				return err
			}
		}
	}

	return nil
}

// reencryptAPIKey 用旧密钥解密后用新密钥重新加密
// 用于导入时将导入的密文转换为本地密钥加密
func reencryptAPIKey(encryptedData *models.EncryptedData, oldKey, newKey []byte) (*models.EncryptedData, error) {
	// Step 1: 用旧密钥解密
	plaintext, err := crypto.Decrypt(encryptedData, oldKey)
	if err != nil {
		return nil, err
	}

	// Step 2: 用新密钥重新加密
	newEncrypted, err := crypto.Encrypt(plaintext, newKey)
	if err != nil {
		return nil, err
	}

	return newEncrypted, nil
}

// buildTagIDMapping 构建标签ID映射表
// 返回: map[importTagID]localTagID
// - 如果本地已有同名标签，映射到本地标签ID
// - 如果本地没有同名标签，保留导入的标签ID
func buildTagIDMapping(importTags []models.Tag, localTags []models.Tag) map[string]string {
	mapping := make(map[string]string)

	// 建立本地标签名 -> ID 的映射
	localTagNameToID := make(map[string]string)
	for _, tag := range localTags {
		localTagNameToID[strings.ToLower(tag.Name)] = tag.ID
	}

	// 遍历导入的标签，构建映射
	for _, importTag := range importTags {
		lowerName := strings.ToLower(importTag.Name)
		if localID, exists := localTagNameToID[lowerName]; exists {
			// 本地已有同名标签，映射到本地ID
			mapping[importTag.ID] = localID
		} else {
			// 本地没有同名标签，保留导入的ID
			mapping[importTag.ID] = importTag.ID
		}
	}

	return mapping
}

// remapTagIDs 使用映射表更新 APIKeyRecord 的 TagIds
func remapTagIDs(item *models.APIKeyRecord, tagIDMapping map[string]string) {
	newTagIds := make([]string, 0, len(item.TagIds))
	for _, tagID := range item.TagIds {
		if mappedID, ok := tagIDMapping[tagID]; ok {
			newTagIds = append(newTagIds, mappedID)
		}
		// 如果映射表中没有该ID（不应该发生），则跳过该标签
	}
	item.TagIds = newTagIds
}
