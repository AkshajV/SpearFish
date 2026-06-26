package api

import (
	"context"
	"net/http"
	"os"
)

type contextKey string

const UserEmailKey contextKey = "user_email"

func AuthMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// 1. Grab the frontend URL from environment variables, fallback to localhost for development
		frontendURL := os.Getenv("NEXT_PUBLIC_API_URL")
		if frontendURL == "" {
			frontendURL = "http://localhost:3000"
		} else {
			// If your environment variable has a trailing slash, strip it or ensure it matches the origin exactly
			frontendURL = "https://spear-fish.vercel.app"
		}

		w.Header().Set("Access-Control-Allow-Origin", frontendURL)
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-User-Email")

		// 2. If it's the browser's preflight check, approve it and stop here
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		// 3. For actual requests, enforce the email check
		email := r.Header.Get("X-User-Email")
		if email == "" {
			http.Error(w, `{"error": "Unauthorized: Missing user email header"}`, http.StatusUnauthorized)
			return
		}

		ctx := context.WithValue(r.Context(), UserEmailKey, email)
		next.ServeHTTP(w, r.WithContext(ctx))
	}
}
