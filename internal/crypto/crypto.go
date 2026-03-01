package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"

	"api-key-manager/internal/models"
)

const (
	KeyLength = 32 // 256 bits
	IVLength  = 12 // GCM 推荐 IV 长度
)

// GenerateMasterKey 生成主密钥
func GenerateMasterKey() ([]byte, error) {
	key := make([]byte, KeyLength)
	_, err := rand.Read(key)
	if err != nil {
		return nil, fmt.Errorf("生成主密钥失败: %w", err)
	}
	return key, nil
}

// Encrypt 加密数据
func Encrypt(plaintext string, masterKey []byte) (*models.EncryptedData, error) {
	// 验证密钥长度
	if len(masterKey) != KeyLength {
		return nil, models.NewAppError(models.ErrEncryptionFailed,
			fmt.Sprintf("无效的密钥长度: %d, 期望: %d", len(masterKey), KeyLength))
	}

	// 验证明文
	if plaintext == "" {
		return nil, models.NewAppError(models.ErrInvalidInput, "明文不能为空")
	}

	// 创建 AES cipher
	block, err := aes.NewCipher(masterKey)
	if err != nil {
		return nil, models.NewAppError(models.ErrEncryptionFailed,
			fmt.Sprintf("创建 cipher 失败: %v", err))
	}

	// 创建 GCM 模式
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, models.NewAppError(models.ErrEncryptionFailed,
			fmt.Sprintf("创建 GCM 失败: %v", err))
	}

	// 生成随机 IV
	iv := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, iv); err != nil {
		return nil, models.NewAppError(models.ErrEncryptionFailed,
			fmt.Sprintf("生成 IV 失败: %v", err))
	}

	// 加密数据（GCM.Seal 返回 ciphertext + authTag）
	ciphertext := gcm.Seal(nil, iv, []byte(plaintext), nil)

	// 分离加密数据和认证标签
	authTagLen := 16 // GCM auth tag 固定 16 字节
	if len(ciphertext) < authTagLen {
		return nil, models.NewAppError(models.ErrEncryptionFailed, "加密数据长度不足")
	}
	authTag := ciphertext[len(ciphertext)-authTagLen:]
	encrypted := ciphertext[:len(ciphertext)-authTagLen]

	return &models.EncryptedData{
		IV:        hex.EncodeToString(iv),
		AuthTag:   hex.EncodeToString(authTag),
		Encrypted: hex.EncodeToString(encrypted),
	}, nil
}

// Decrypt 解密数据
func Decrypt(data *models.EncryptedData, masterKey []byte) (string, error) {
	// 验证输入
	if data == nil {
		return "", models.NewAppError(models.ErrDecryptionFailed, "加密数据为空")
	}
	if len(masterKey) != KeyLength {
		return "", models.NewAppError(models.ErrDecryptionFailed,
			fmt.Sprintf("无效的密钥长度: %d, 期望: %d", len(masterKey), KeyLength))
	}

	// 解码 hex 字符串
	iv, err := hex.DecodeString(data.IV)
	if err != nil {
		return "", models.NewAppError(models.ErrDecryptionFailed,
			fmt.Sprintf("解码 IV 失败: %v", err))
	}
	if len(iv) != IVLength {
		return "", models.NewAppError(models.ErrDecryptionFailed,
			fmt.Sprintf("无效的 IV 长度: %d, 期望: %d", len(iv), IVLength))
	}

	authTag, err := hex.DecodeString(data.AuthTag)
	if err != nil {
		return "", models.NewAppError(models.ErrDecryptionFailed,
			fmt.Sprintf("解码 AuthTag 失败: %v", err))
	}
	if len(authTag) != 16 {
		return "", models.NewAppError(models.ErrDecryptionFailed,
			fmt.Sprintf("无效的 AuthTag 长度: %d, 期望: 16", len(authTag)))
	}

	encrypted, err := hex.DecodeString(data.Encrypted)
	if err != nil {
		return "", models.NewAppError(models.ErrDecryptionFailed,
			fmt.Sprintf("解码加密数据失败: %v", err))
	}

	// 创建 AES cipher
	block, err := aes.NewCipher(masterKey)
	if err != nil {
		return "", models.NewAppError(models.ErrDecryptionFailed,
			fmt.Sprintf("创建 cipher 失败: %v", err))
	}

	// 创建 GCM 模式
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", models.NewAppError(models.ErrDecryptionFailed,
			fmt.Sprintf("创建 GCM 失败: %v", err))
	}

	// 重组 ciphertext + authTag
	ciphertext := append(encrypted, authTag...)

	// 解密
	plaintext, err := gcm.Open(nil, iv, ciphertext, nil)
	if err != nil {
		return "", models.NewAppError(models.ErrDecryptionFailed,
			"解密失败：密钥不匹配或数据损坏")
	}

	return string(plaintext), nil
}

// ValidateKey 验证主密钥格式
func ValidateKey(key []byte) error {
	if len(key) != KeyLength {
		return models.NewAppError(models.ErrMasterKeyMissing,
			fmt.Sprintf("无效的密钥长度: %d", len(key)))
	}
	return nil
}

// GenerateChecksum 生成数据的 SHA-256 校验和
func GenerateChecksum(data []byte) string {
	// 将在 storage 包中实现
	return ""
}
