package s3client

import (
	"context"
	"fmt"
	"io"
	"log"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"crypto/tls"
	"net"
	"net/http"
	"os"
	"strings"
	"time"
)

// Client wraps the S3 client to provide our custom methods
type Client struct {
	s3Client   *s3.Client
	bucketName string
	StorageID  string
}

// Global registry for multiple S3 clients
var clients = make(map[string]*Client)

// InitS3 initializes an S3 client for a specific storage ID
func InitS3(storageID, accountId, accessKeyId, secretAccessKey, bucketName string) error {
	// 优先从环境变量读取自定义 Endpoint
	endpointURL := os.Getenv("R2_CUSTOM_ENDPOINT")

	// 自愈逻辑：如果 Account ID 长度超过 32 位且 Secret Key 长度正好是 32 位，则认为填反了
	if len(accountId) > 32 && len(secretAccessKey) == 32 {
		log.Printf("⚠️  [Self-Healing] Swapped R2 credentials detected. ID: %d, Secret: %d. Swapping...", len(accountId), len(secretAccessKey))
		// 物理对调进入内存
		accountId, secretAccessKey = secretAccessKey, accountId
		// 强制基于对调后的正确 ID 重新生成端点，忽略有误的环境变量
		endpointURL = fmt.Sprintf("https://%s.r2.cloudflarestorage.com", accountId)
	}

	// 如果没有有效的端点，确保生成标准 R2 端点
	if endpointURL == "" {
		endpointURL = fmt.Sprintf("https://%s.r2.cloudflarestorage.com", accountId)
	}

	log.Printf("Final R2 Endpoint: %s", endpointURL)

	// Custom resolver to point AWS SDK to Cloudflare R2
	r2Resolver := aws.EndpointResolverWithOptionsFunc(func(service, region string, options ...interface{}) (aws.Endpoint, error) {
		return aws.Endpoint{
			URL: endpointURL,
		}, nil
	})

	// Create custom HTTP client to handle potential TLS issues
	customTransport := http.DefaultTransport.(*http.Transport).Clone()
	customTransport.TLSClientConfig = &tls.Config{InsecureSkipVerify: true}
	
	// 自动从环境变量读取代理 (HTTPS_PROXY)
	customTransport.Proxy = http.ProxyFromEnvironment
	
	// Force IPv4 if needed (common in some proxy environments)
	dialer := &net.Dialer{
		Timeout:   30 * time.Second,
		KeepAlive: 30 * time.Second,
	}
	customTransport.DialContext = func(ctx context.Context, network, addr string) (net.Conn, error) {
		return dialer.DialContext(ctx, "tcp4", addr)
	}
	
	httpClient := &http.Client{Transport: customTransport}

	// Load default config
	cfg, err := config.LoadDefaultConfig(context.TODO(),
		config.WithEndpointResolverWithOptions(r2Resolver),
		config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(accessKeyId, secretAccessKey, "")),
		config.WithRegion("auto"), // R2 uses 'auto' region
		config.WithHTTPClient(httpClient),
	)
	if err != nil {
		return fmt.Errorf("unable to load SDK config: %w", err)
	}

	client := s3.NewFromConfig(cfg, func(o *s3.Options) {
		o.UsePathStyle = true
	})

	clients[storageID] = &Client{
		s3Client:   client,
		bucketName: bucketName,
		StorageID:  storageID,
	}

	log.Printf("Successfully initialized S3 client [%s] for bucket: %s", storageID, bucketName)
	return nil
}

// GetClient returns the primary S3 client
func GetClient() *Client {
	return GetClientByName("primary")
}

// GetClientByName returns an S3 client by its registered storage ID
func GetClientByName(name string) *Client {
	client, ok := clients[name]
	if !ok {
		// Fallback to primary if not found to prevent crashes, but log warning
		primary, exists := clients["primary"]
		if exists {
			log.Printf("⚠️  Storage ID [%s] not found, falling back to primary", name)
			return primary
		}
		log.Fatal("Fatal: No S3 clients (including primary) initialized!")
	}
	return client
}

// InitMultiS3 自动从环境变量加载多个 S3/R2 实例。
// 识别规则：
// 1. 默认实例 (primary): R2_ACCOUNT_ID, R2_ACCESS_KEY_ID...
// 2. 额外实例 (ID): R2_STORAGE_{ID}_ACCOUNT_ID, R2_STORAGE_{ID}_ACCESS_KEY_ID...
func InitMultiS3() error {
	// 1. 初始化默认的 primary 实例
	pAccount := os.Getenv("R2_ACCOUNT_ID")
	pKey := os.Getenv("R2_ACCESS_KEY_ID")
	pSecret := os.Getenv("R2_SECRET_ACCESS_KEY")
	pBucket := os.Getenv("R2_BUCKET_NAME")

	if pAccount != "" && pKey != "" && pSecret != "" && pBucket != "" {
		if err := InitS3("primary", pAccount, pKey, pSecret, pBucket); err != nil {
			return fmt.Errorf("failed to init primary storage: %w", err)
		}
	}

	// 2. 扫描环境变量，寻找其他实例 (例如 R2_STORAGE_BACKUP_...)
	// 我们遍历所有环境变量，匹配 R2_STORAGE_(.*)_ACCOUNT_ID
	for _, env := range os.Environ() {
		pair := strings.SplitN(env, "=", 2)
		key := pair[0]
		
		if strings.HasPrefix(key, "R2_STORAGE_") && strings.HasSuffix(key, "_ACCOUNT_ID") {
			// 提取 ID，例如从 R2_STORAGE_OSS_ACCOUNT_ID 提取 OSS
			id := strings.TrimPrefix(key, "R2_STORAGE_")
			id = strings.TrimSuffix(id, "_ACCOUNT_ID")
			id = strings.ToLower(id) // 统一转小写作为存储标识

			if id == "primary" {
				continue // 已处理
			}

			acc := os.Getenv(fmt.Sprintf("R2_STORAGE_%s_ACCOUNT_ID", strings.ToUpper(id)))
			keyId := os.Getenv(fmt.Sprintf("R2_STORAGE_%s_ACCESS_KEY_ID", strings.ToUpper(id)))
			sec := os.Getenv(fmt.Sprintf("R2_STORAGE_%s_SECRET_ACCESS_KEY", strings.ToUpper(id)))
			bucket := os.Getenv(fmt.Sprintf("R2_STORAGE_%s_BUCKET_NAME", strings.ToUpper(id)))

			if acc != "" && keyId != "" && sec != "" && bucket != "" {
				if err := InitS3(id, acc, keyId, sec, bucket); err != nil {
					log.Printf("⚠️  Failed to init storage [%s]: %v", id, err)
				}
			}
		}
	}

	return nil
}

// UploadFile uploads an io.Reader stream to R2
func (c *Client) UploadFile(ctx context.Context, objectKey string, body io.Reader, contentType string) error {
	_, err := c.s3Client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(c.bucketName),
		Key:         aws.String(objectKey),
		Body:        body,
		ContentType: aws.String(contentType),
	})
	if err != nil {
		return fmt.Errorf("failed to upload object %s: %w", objectKey, err)
	}
	log.Printf("Uploaded %s to S3 bucket %s", objectKey, c.bucketName)
	return nil
}

// DownloadFile returns an io.ReadCloser for the requested object
// The caller is responsible for closing the body!
func (c *Client) DownloadFile(ctx context.Context, objectKey string) (io.ReadCloser, string, error) {
	out, err := c.s3Client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(c.bucketName),
		Key:    aws.String(objectKey),
	})
	if err != nil {
		return nil, "", fmt.Errorf("failed to download object %s: %w", objectKey, err)
	}

	contentType := "application/octet-stream"
	if out.ContentType != nil {
		contentType = *out.ContentType
	}

	return out.Body, contentType, nil
}

// DeleteFile deletes an object from R2
func (c *Client) DeleteFile(ctx context.Context, objectKey string) error {
	_, err := c.s3Client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(c.bucketName),
		Key:    aws.String(objectKey),
	})
	if err != nil {
		return fmt.Errorf("failed to delete object %s: %w", objectKey, err)
	}
	log.Printf("Deleted %s from S3 bucket %s", objectKey, c.bucketName)
	return nil
}

// RenameFile (Copy + Delete) renames an object in R2
// Object storage doesn't have a native "rename", we must Copy then Delete
func (c *Client) RenameFile(ctx context.Context, sourceKey, destKey string) error {
	// 1. Copy the object
	copySource := fmt.Sprintf("%s/%s", c.bucketName, sourceKey) // s3 requires "bucket/key" format for CopySource
	_, err := c.s3Client.CopyObject(ctx, &s3.CopyObjectInput{
		Bucket:     aws.String(c.bucketName),
		CopySource: aws.String(copySource),
		Key:        aws.String(destKey),
	})
	if err != nil {
		return fmt.Errorf("failed to copy object from %s to %s: %w", sourceKey, destKey, err)
	}

	// 2. Delete the original object
	err = c.DeleteFile(ctx, sourceKey)
	if err != nil {
		// Log error but don't fail the operation completely as the data is safe in the destKey
		log.Printf("Warning: Failed to delete old object %s after copying to %s: %v", sourceKey, destKey, err)
	} else {
		log.Printf("Renamed %s to %s in S3 bucket %s", sourceKey, destKey, c.bucketName)
	}

	return nil
}

// ListObjects lists all objects under a specific prefix
func (c *Client) ListObjects(ctx context.Context, prefix string) ([]string, error) {
	var keys []string
	paginator := s3.NewListObjectsV2Paginator(c.s3Client, &s3.ListObjectsV2Input{
		Bucket: aws.String(c.bucketName),
		Prefix: aws.String(prefix),
	})

	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return nil, fmt.Errorf("failed to list objects with prefix %s: %w", prefix, err)
		}
		for _, obj := range page.Contents {
			keys = append(keys, *obj.Key)
		}
	}
	return keys, nil
}

// Exists checks if an object exists in the bucket
func (c *Client) Exists(ctx context.Context, objectKey string) (bool, error) {
	_, err := c.s3Client.HeadObject(ctx, &s3.HeadObjectInput{
		Bucket: aws.String(c.bucketName),
		Key:    aws.String(objectKey),
	})
	if err != nil {
		return false, nil
	}
	return true, nil
}
