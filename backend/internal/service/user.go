package service

import (
	"database/sql"
	"errors"
	"fmt"
	"moody-backend/internal/database"
	"moody-backend/internal/model"
)

// AuthenticateUser 处理用户登录/注册逻辑
// 简化版：如果用户不存在则自动注册
func AuthenticateUser(username, password string) (*model.LoginResponse, error) {
	var user model.User
	
	// 1. 尝试查询现有用户
	err := database.DB.QueryRow("SELECT id, username, level, role, avatar_url, created_at FROM users WHERE username = ?", username).
		Scan(&user.ID, &user.Username, &user.Level, &user.Role, &user.AvatarURL, &user.CreatedAt)

	if err == sql.ErrNoRows {
		// 2. 如果不存在，执行注册
		res, err := database.DB.Exec("INSERT INTO users (username, password, level, role) VALUES (?, ?, ?, ?)", 
			username, password, 2, "user") // 默认注册为 Level 2 正式用户
		if err != nil {
			return nil, fmt.Errorf("注册用户失败: %v", err)
		}
		
		id, _ := res.LastInsertId()
		user.ID = int(id)
		user.Username = username
		user.Level = 2
		user.Role = "user"
		
		// 初始化用户设置
		database.DB.Exec("INSERT INTO user_settings (user_id) VALUES (?)", id)
	} else if err != nil {
		return nil, err
	}

	// 3. 生成一个极其简单的 Token (后续可升级为 JWT)
	token := fmt.Sprintf("session_%d_%s", user.ID, user.Username)

	return &model.LoginResponse{
		Token: token,
		User:  user,
	}, nil
}

// GetUserSettings 获取用户的偏好设置
func GetUserSettings(userID int) (*model.UserSettings, error) {
	var s model.UserSettings
	err := database.DB.QueryRow("SELECT user_id, last_volume, theme_mode, auto_play FROM user_settings WHERE user_id = ?", userID).
		Scan(&s.UserID, &s.LastVolume, &s.ThemeMode, &s.AutoPlay)
	
	if err == sql.ErrNoRows {
		return nil, errors.New("设置不存在")
	}
	return &s, err
}

// UpdateUserSettings 更新用户的偏好设置
func UpdateUserSettings(s model.UserSettings) error {
	_, err := database.DB.Exec("UPDATE user_settings SET last_volume = ?, theme_mode = ?, auto_play = ? WHERE user_id = ?",
		s.LastVolume, s.ThemeMode, s.AutoPlay, s.UserID)
	return err
}
