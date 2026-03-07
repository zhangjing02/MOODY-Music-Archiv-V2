package model

// UserSettings 定义用户的个性化设置偏好
type UserSettings struct {
	UserID     int     `json:"user_id"`     // 对应用户 ID
	LastVolume float64 `json:"last_volume"` // 上次播放音量 (0.0 - 1.0)
	ThemeMode  string  `json:"theme_mode"`  // 主题模式 (dark/light)
	AutoPlay   bool    `json:"auto_play"`   // 是否自动播放
}

// LoginRequest 定义登录接口的请求结构
type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// LoginResponse 定义登录接口的返回结构
type LoginResponse struct {
	Token string `json:"token"`
	User  User   `json:"user"`
}
