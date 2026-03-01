package models

import (
	"time"

	"github.com/google/uuid"
)

// ErrorCode 应用错误码定义
type ErrorCode int

const (
	ErrSuccess            ErrorCode = 0     // 成功
	ErrInvalidInput       ErrorCode = 1001  // 输入数据格式不正确
	ErrKeyNotFound        ErrorCode = 1002  // 未找到指定的 API Key
	ErrTagNotFound        ErrorCode = 1003  // 未找到指定的标签
	ErrTagAlreadyExists   ErrorCode = 1004  // 标签已存在
	ErrEncryptionFailed   ErrorCode = 2001  // 数据加密失败
	ErrDecryptionFailed   ErrorCode = 2002  // 解密失败
	ErrDataCorrupted      ErrorCode = 3001  // 数据文件已损坏
	ErrChecksumFailed     ErrorCode = 3002  // 数据校验失败
	ErrMasterKeyMissing   ErrorCode = 4001  // 主密钥文件丢失
	ErrRateLimitExceeded  ErrorCode = 5001  // 操作过于频繁
	ErrStorageWriteFailed ErrorCode = 6001  // 存储写入失败
)

// AppError 应用错误结构
type AppError struct {
	Code    ErrorCode
	Message string
	Detail  string // 详细错误（仅用于日志）
}

func (e *AppError) Error() string {
	return e.Message
}

// UserMessage 返回用户友好的错误消息
func (e *AppError) UserMessage() string {
	return e.Message
}

// NewAppError 创建新的应用错误
func NewAppError(code ErrorCode, detail string) *AppError {
	message := errorMessages[code]
	if message == "" {
		message = "未知错误"
	}
	return &AppError{
		Code:    code,
		Message: message,
		Detail:  detail,
	}
}

// errorMessages 错误码到用户消息的映射
var errorMessages = map[ErrorCode]string{
	ErrSuccess:            "操作成功",
	ErrInvalidInput:       "输入数据格式不正确",
	ErrKeyNotFound:        "未找到指定的 API Key",
	ErrTagNotFound:        "未找到指定的标签",
	ErrTagAlreadyExists:   "标签已存在",
	ErrEncryptionFailed:   "数据加密失败",
	ErrDecryptionFailed:   "解密失败，请检查密钥文件",
	ErrDataCorrupted:      "数据文件已损坏，请从备份恢复",
	ErrChecksumFailed:     "数据校验失败，可能被篡改",
	ErrMasterKeyMissing:   "主密钥文件丢失，无法解密数据",
	ErrRateLimitExceeded:  "操作过于频繁，请稍后再试",
	ErrStorageWriteFailed: "数据保存失败，请检查磁盘空间",
}

// EncryptedData 加密数据结构
type EncryptedData struct {
	IV        string `json:"iv"`        // 初始化向量（hex）
	AuthTag   string `json:"authTag"`   // GCM 认证标签（hex）
	Encrypted string `json:"encrypted"` // 加密数据（hex）
}

// APIKeyRecord API Key 记录
type APIKeyRecord struct {
	ID        string        `json:"id"`
	Website   string        `json:"website"`
	Key       EncryptedData `json:"key"`
	TagIds    []string      `json:"tagIds"`             // V1.1: 标签 ID 数组
	Tags      []string      `json:"tags,omitempty"`     // V1.0 兼容: 标签名称数组
	Note      string        `json:"note"`
	CreatedAt int64         `json:"createdAt"`
	UpdatedAt int64         `json:"updatedAt"`
}

// MaskedKey 返回脱敏后的 Key（前8位 + 省略号 + 后4位）
func (r *APIKeyRecord) MaskedKey() string {
	if len(r.Key.Encrypted) < 12 {
		return "****"
	}
	// 从加密数据无法推断原始长度，使用通用脱敏格式
	return "sk-xxxx...xxxx"
}

// TagInfo 标签信息
type TagInfo struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
}

// Tag 标签实体（V1.1新增）
type Tag struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Color     string `json:"color"`
	CreatedAt int64  `json:"createdAt"`
}

// TagV1 Tag 别名，用于向后兼容
type TagV1 = Tag

// DataFile 数据文件结构
type DataFile struct {
	Version string         `json:"version"`
	Items   []APIKeyRecord `json:"items"`
	Tags    []Tag          `json:"tags,omitempty"` // V1.1新增
}

// DefaultTags 预设标签配置
type DefaultTag struct {
	Name  string
	Color string
}

// GetDefaultTags 获取8个预设标签
func GetDefaultTags() []DefaultTag {
	return []DefaultTag{
		{Name: "AI", Color: "#667eea"},
		{Name: "MCP", Color: "#f093fb"},
		{Name: "支付", Color: "#10b981"},
		{Name: "邮箱", Color: "#f59e0b"},
		{Name: "代码", Color: "#3b82f6"},
		{Name: "云服务", Color: "#06b6d4"},
		{Name: "社交", Color: "#ec4899"},
		{Name: "其他", Color: "#6b7280"},
	}
}

// NewAPIKeyRecord 创建新的 API Key 记录
func NewAPIKeyRecord(website string, key EncryptedData, tags []string, note string) *APIKeyRecord {
	now := time.Now().UnixMilli()
	return &APIKeyRecord{
		ID:        generateID(),
		Website:   website,
		Key:       key,
		Tags:      tags,
		Note:      note,
		CreatedAt: now,
		UpdatedAt: now,
	}
}

// idGenerator ID 生成器函数类型
type idGenerator func() string

// generateID 生成唯一 ID（使用 UUID）
var generateID idGenerator = func() string {
	return uuid.New().String()
}

// SetIDGenerator 设置 ID 生成器（用于依赖注入）
func SetIDGenerator(fn idGenerator) {
	generateID = fn
}

// GenerateID 公开的 ID 生成函数
func GenerateID() string {
	return generateID()
}
