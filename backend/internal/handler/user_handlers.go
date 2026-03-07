package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"moody-backend/internal/model"
	"moody-backend/internal/service"
)

// UserLoginHandler 处理登录接口
func UserLoginHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(model.ApiResponse{
			Code:    405,
			Message: "Method Not Allowed",
		})
		return
	}

	var req model.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.ApiResponse{
			Code:    400,
			Message: "Invalid Request Body",
		})
		return
	}

	resp, err := service.AuthenticateUser(req.Username, req.Password)
	if err != nil {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(model.ApiResponse{
			Code:    500,
			Message: err.Error(),
		})
		return
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	json.NewEncoder(w).Encode(model.ApiResponse{
		Code:    200,
		Message: "登录成功",
		Data:    resp,
	})
}

// UserSettingsHandler 处理用户设置的获取与更新
func UserSettingsHandler(w http.ResponseWriter, r *http.Request) {
	// 简单的 Token 校验逻辑 (从 Authorization Header 获取)
	auth := r.Header.Get("Authorization")
	if auth == "" || !strings.HasPrefix(auth, "session_") {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(model.ApiResponse{
			Code:    401,
			Message: "Unauthorized",
		})
		return
	}

	// 这里暂时硬编码提取 ID 的逻辑 (因为我们的 Token 是 session_ID_NAME)
	var userID int
	fmt.Sscanf(auth, "session_%d", &userID)

	if r.Method == http.MethodGet {
		settings, err := service.GetUserSettings(userID)
		if err != nil {
			w.Header().Set("Content-Type", "application/json; charset=utf-8")
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(model.ApiResponse{
				Code:    404,
				Message: err.Error(),
			})
			return
		}
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		json.NewEncoder(w).Encode(model.ApiResponse{
			Code:    200,
			Message: "success",
			Data:    settings,
		})
		return
	}

	if r.Method == http.MethodPost {
		var s model.UserSettings
		if err := json.NewDecoder(r.Body).Decode(&s); err != nil {
			w.Header().Set("Content-Type", "application/json; charset=utf-8")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(model.ApiResponse{
				Code:    400,
				Message: "Bad Request",
			})
			return
		}
		s.UserID = userID // 强制使用当前在线用户 ID
		err := service.UpdateUserSettings(s)
		if err != nil {
			w.Header().Set("Content-Type", "application/json; charset=utf-8")
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(model.ApiResponse{
				Code:    500,
				Message: err.Error(),
			})
			return
		}
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		json.NewEncoder(w).Encode(model.ApiResponse{
			Code:    200,
			Message: "设置更新成功",
		})
		return
	}
}
