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
	"time"
)

// Client wraps the S3 client to provide our custom methods
type Client struct {
	s3Client   *s3.Client
	bucketName string
}

// Global instance (can also inject, but we start simple for quick refactor)
var defaultClient *Client

// InitS3 initializes the global S3 client using Cloudflare R2 credentials
// Call this from main.go
func InitS3(accountId, accessKeyId, secretAccessKey, bucketName string) error {
	// 优先从环境变量读取自定义 Endpoint (例如 pub-xxx.r2.dev)
	// 如果没有自定义 Endpoint，则使用默认的 https://<ACCOUNT_ID>.r2.cloudflarestorage.com
	endpointURL := os.Getenv("R2_CUSTOM_ENDPOINT")
	if endpointURL == "" {
		endpointURL = fmt.Sprintf("https://%s.r2.cloudflarestorage.com", accountId)
	} else {
		log.Printf("Using custom R2 endpoint: %s", endpointURL)
	}

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
		// 强制启用 PathStyle (https://endpoint/bucket/key)
		// 之前测试表明 custom endpoint 不支持 PathStyle，但官方 endpoint 可以
		// 这可以避免 DNS 解析失败 (no such host)，并配合显示代理使用
		o.UsePathStyle = true
	})

	defaultClient = &Client{
		s3Client:   client,
		bucketName: bucketName,
	}

	log.Printf("Successfully initialized S3 client for bucket: %s", bucketName)
	return nil
}

// GetClient returns the initialized global client
func GetClient() *Client {
	if defaultClient == nil {
		log.Fatal("S3 client accessed before initialization!")
	}
	return defaultClient
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
